"""
DetectionService — wires the DRF view to the YOLO detector.

Accepts an uploaded image and an AIModel primary key, loads the
corresponding model via the cache-aware model_loader, runs inference,
and returns structured results plus model metadata.
"""
from __future__ import annotations

import base64
import time
from typing import Optional

import cv2
import numpy as np
from django.core.files.uploadedfile import InMemoryUploadedFile

from ai.detector import YOLODetector
from ai.model_loader import (
    ModelFileMissing,
    ModelLoadError,
    ModelNotFound,
    get_ai_model_by_id,
    load_model_by_id,
)


class DetectionServiceError(Exception):
    """Base for all detection-level errors."""


class ModelNotFoundError(DetectionServiceError):
    """Raised when the requested AIModel row does not exist or is inactive."""


class ModelLoadFailure(DetectionServiceError):
    """Raised when the on-disk weight file cannot be loaded."""


class InvalidImageError(DetectionServiceError):
    """Raised when the uploaded file is not a valid image."""


def process_image(
    image_file: InMemoryUploadedFile,
    model_id: int,
    confidence: Optional[float] = None,
    iou: Optional[float] = None,
) -> dict:
    """
    Run detection on `image_file` using the AIModel identified by `model_id`.

    Parameters
    ----------
    image_file
        An uploaded image file (multipart).
    model_id
        Primary key of the AIModel row to use for inference.
    confidence
        Override the per-request confidence threshold. If None the model's
        ``default_confidence`` is used.
    iou
        Override the per-request IoU threshold. If None the model's
        ``default_iou`` is used.

    Returns
    -------
    dict
        {
            "model": { "id", "name", "version", "category" },
            "detections": [ { "bbox", "confidence", "class_id", "class_name" }, ... ],
            "object_count": int,
            "processing_time": float,
            "confidence_used": float,
            "iou_used": float,
            "annotated_image_base64": str,
        }

    Raises
    ------
    ModelNotFoundError
        When no active AIModel matches the given ``model_id``.
    ModelLoadFailure
        When the weight file exists but cannot be loaded (corrupt / wrong format).
    InvalidImageError
        When the uploaded file cannot be decoded as an image.
    """
    # --- load the model row ---
    try:
        ai_model = get_ai_model_by_id(model_id)
        yolo = load_model_by_id(model_id)
    except ModelNotFound:
        raise ModelNotFoundError(
            f"No active model with id={model_id}."
        )
    except ModelFileMissing as exc:
        raise ModelLoadFailure(
            f"Weight file missing: {exc}"
        )
    except ModelLoadError as exc:
        raise ModelLoadFailure(str(exc))

    # Build model metadata from the DB row — safe and consistent.
    model_meta = {
        "id": ai_model.pk,
        "name": ai_model.name,
        "version": ai_model.version,
        "category": ai_model.category,
    }

    # --- decode image ---
    image_bytes = image_file.read()
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise InvalidImageError(
            "Uploaded file could not be decoded as an image. "
            "Ensure it is a valid JPEG, PNG, BMP, or WebP file."
        )

    # --- resolve thresholds ---
    conf = confidence if confidence is not None else 0.25
    iou_val = iou if iou is not None else 0.45

    # --- inference ---
    start = time.perf_counter()
    detector = YOLODetector(yolo)
    raw = detector.run_inference(image, conf_threshold=conf, iou_threshold=iou_val)
    elapsed = round(time.perf_counter() - start, 4)

    annotated = raw.pop("annotated_image")
    _, buffer = cv2.imencode(".jpg", annotated)
    encoded = base64.b64encode(buffer).decode("utf-8")

    # --- assemble response ---
    return {
        "model": model_meta,
        "detections": raw.get("detections", []),
        "object_count": raw.get("object_count", 0),
        "processing_time": elapsed,
        "confidence_used": conf,
        "iou_used": iou_val,
        "annotated_image_base64": encoded,
    }
