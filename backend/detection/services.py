"""
DetectionService — wires the DRF view to the YOLO detector.

Accepts an uploaded image and an AIModel primary key, loads the
corresponding model via the cache-aware model_loader, runs inference,
saves the annotated image to disk, and creates a DetectionRecord.
"""
from __future__ import annotations

import base64
import logging
import tempfile
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Optional

import cv2
import numpy as np
from django.conf import settings
from django.core.files import File
from django.core.files.uploadedfile import InMemoryUploadedFile

from ai.detector import YOLODetector
from ai.model_loader import (
    ModelFileMissing,
    ModelLoadError,
    ModelNotFound,
    get_ai_model_by_id,
    load_model_by_id,
)
from detection.models import DetectionRecord

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class DetectionServiceError(Exception):
    """Base for all detection-level errors."""


class ModelNotFoundError(DetectionServiceError):
    """Raised when the requested AIModel row does not exist or is inactive."""


class ModelLoadFailure(DetectionServiceError):
    """Raised when the on-disk weight file cannot be loaded."""


class InvalidImageError(DetectionServiceError):
    """Raised when the uploaded file is not a valid image."""


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------


def process_image(
    image_file: InMemoryUploadedFile,
    model_id: int,
    user=None,
    confidence: Optional[float] = None,
    iou: Optional[float] = None,
    detection_mode: str = DetectionRecord.DetectionMode.MANUAL,
) -> dict:
    """
    Run detection on ``image_file`` using the AIModel identified by ``model_id``.

    Saves the annotated image via Django's FileField and creates a
    ``DetectionRecord`` linked to ``user`` (if provided).

    Returns
    -------
    dict
        {
            "id": int,
            "model": { "id", "name", "version", "category" },
            "detections": [...],
            "object_count": int,
            "processing_time": float,
            "confidence_used": float,
            "iou_used": float,
            "annotated_image_base64": str,
            "result_file_url": str,
        }
    """
    # --- load the model row + YOLO instance ---
    try:
        ai_model = get_ai_model_by_id(model_id)
        yolo = load_model_by_id(model_id)
    except ModelNotFound:
        raise ModelNotFoundError(f"No active model with id={model_id}.")
    except ModelFileMissing as exc:
        raise ModelLoadFailure(f"Weight file missing: {exc}")
    except ModelLoadError as exc:
        raise ModelLoadFailure(str(exc))

    model_meta = {
        "id": ai_model.pk,
        "name": ai_model.name,
        "version": ai_model.version,
        "category": ai_model.category,
    }

    # --- decode image (seek back to start so FileField save reads the full file) ---
    image_file.seek(0)
    image_bytes = image_file.read()
    image_file.seek(0)  # reset for the FileField save below
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise InvalidImageError(
            "Uploaded file could not be decoded as an image. "
            "Ensure it is a valid JPEG, PNG, BMP, or WebP file."
        )

    # --- resolve thresholds ---
    conf = confidence if confidence is not None else ai_model.default_confidence
    iou_val = iou if iou is not None else ai_model.default_iou

    # --- inference ---
    start = time.perf_counter()
    detector = YOLODetector(yolo)
    raw = detector.run_inference(image, conf_threshold=conf, iou_threshold=iou_val)
    elapsed = round(time.perf_counter() - start, 4)
    elapsed_ms = round(elapsed * 1000, 2)

    annotated = raw["annotated_image"]

    # --- encode base64 for immediate display ---
    _, buffer = cv2.imencode(".jpg", annotated)
    encoded = base64.b64encode(buffer).decode("utf-8")

    # --- save annotated image via Django's FileField ---
    result_file_url = _save_annotated_via_filefield(
        annotated,
        ai_model,
        user,
    )

    # --- save DetectionRecord (image_file pointer reset above) ---
    record = DetectionRecord.objects.create(
        user=user if (user and user.pk) else None,
        uploaded_file=image_file,
        ai_model=ai_model,
        detection_mode=detection_mode,
        confidence_used=conf,
        iou_used=iou_val,
        detections=raw["detections"],
        object_count=raw["object_count"],
        inference_time_ms=elapsed_ms,
    )

    # Attach result_file after creation so upload_to has access to instance.pk
    if result_file_url:
        _attach_result_file(record, annotated, image_file.name)

    logger.info(
        "Created DetectionRecord pk=%d  model=%s  objects=%d  time=%.1fms",
        record.pk,
        ai_model.name,
        raw["object_count"],
        elapsed_ms,
    )

    return {
        "id": record.pk,
        "model": model_meta,
        "detections": raw["detections"],
        "object_count": raw["object_count"],
        "processing_time": elapsed,
        "confidence_used": conf,
        "iou_used": iou_val,
        "annotated_image_base64": encoded,
        "result_file_url": result_file_url,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _save_annotated_via_filefield(
    annotated: np.ndarray,
    ai_model,
    user,
) -> str:
    """
    Encode ``annotated`` as JPEG and save directly to MEDIA_ROOT.

    The file is written to disk (bypassing Django's FileField storage) so
    it is accessible via the media URL without needing a database record.
    The URL is constructed manually from MEDIA_URL + relative path.

    Returns the absolute URL, or "" on failure.
    """
    try:
        success, buf = cv2.imencode(".jpg", annotated)
        if not success:
            return ""
        jpeg_bytes = buf.tobytes()

        uid = uuid.uuid4().hex[:12]
        user_folder = f"user_{user.pk}" if (user and user.pk) else "anonymous"

        media_root = Path(settings.MEDIA_ROOT)
        dest_dir = media_root / "history" / "results" / user_folder
        dest_dir.mkdir(parents=True, exist_ok=True)

        dest_path = dest_dir / f"{uid}.jpg"
        relative = dest_path.relative_to(media_root)

        with open(dest_path, "wb") as f:
            f.write(jpeg_bytes)

        url = f"{settings.MEDIA_URL.rstrip('/')}/{relative.as_posix()}"
        logger.info("Saved annotated image: %s", dest_path)
        return url

    except Exception:
        logger.exception("Failed to save annotated image")
        return ""


def _attach_result_file(record: DetectionRecord, annotated: np.ndarray, original_name: str):
    """
    Attach the annotated image to an existing DetectionRecord's result_file field.
    The file is written to disk directly; Django's FileField just stores the path.
    """
    try:
        success, buf = cv2.imencode(".jpg", annotated)
        if not success:
            return

        uid = uuid.uuid4().hex[:12]
        user_folder = f"user_{record.user.pk}" if (record.user and record.user.pk) else "anonymous"

        media_root = Path(settings.MEDIA_ROOT)
        dest_dir = media_root / "history" / "results" / user_folder
        dest_dir.mkdir(parents=True, exist_ok=True)

        dest_path = dest_dir / f"{uid}.jpg"
        relative = dest_path.relative_to(media_root)

        with open(dest_path, "wb") as f:
            f.write(buf.tobytes())

        # Store the relative path in the FileField (Django stores the path string)
        record.result_file.name = str(relative)
        record.save(update_fields=["result_file"])
        logger.info("Attached result_file to DetectionRecord pk=%d: %s", record.pk, relative)

    except Exception:
        logger.exception("Failed to attach result_file to DetectionRecord pk=%d", record.pk)
