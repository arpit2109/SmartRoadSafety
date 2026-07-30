"""
Background video processor.

Runs in a daemon thread spawned by the HTTP view. Reads the video frame by
frame, runs YOLO inference on each frame, and pushes the resulting bounding
boxes to the WebSocket channel layer so connected clients receive them in
real time.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import Counter
from pathlib import Path

import cv2
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from ai.detector import YOLODetector
from ai.model_loader import (
    get_ai_model_by_id,
    load_model_by_id,
    ModelFileMissing,
    ModelLoadError,
    ModelNotFound,
)
from detection.models import DetectionRecord

logger = logging.getLogger(__name__)

# Sample every Nth frame (matches FRAME_SAMPLE_RATE in views.py)
FRAME_SAMPLE_RATE = 10


def process_video_background(session_id: str, user_id: int, model_id: int, video_path: Path):
    """
    Process the video in a background thread, pushing per-frame detection
    results to the WebSocket group ``video_<session_id>``.

    Catches all exceptions and reports them through the channel so the client
    sees an error message instead of a silent failure.
    """
    channel_layer = get_channel_layer()
    group_name = f"video_{session_id}"

    def push(payload: dict) -> None:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {"type": "detection.frame", "data": payload},
        )

    def push_complete(payload: dict) -> None:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {"type": "detection.complete", "data": payload},
        )

    def push_error(message: str) -> None:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {"type": "detection.error", "data": {"type": "error", "message": message}},
        )

    try:
        # Load model
        try:
            ai_model = get_ai_model_by_id(model_id)
            yolo = load_model_by_id(model_id)
        except ModelNotFound:
            push_error(f"No active model with id={model_id}.")
            return
        except (ModelFileMissing, ModelLoadError) as exc:
            push_error(f"Model could not be loaded: {exc}")
            return

        detector = YOLODetector(yolo)

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            push_error("Could not open video file.")
            return

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

        # Send model info immediately so client can show the active model
        push({
            "type": "started",
            "model": {
                "id": ai_model.pk,
                "name": ai_model.name,
                "version": ai_model.version,
                "category": ai_model.category,
            },
            "total_frames": total_frames,
            "fps": round(fps, 2),
            "frame_sample_rate": FRAME_SAMPLE_RATE,
        })

        all_detections: list[dict] = []
        frames_with_detections = 0
        frame_index = 0
        sampled_index = 0
        start = time.perf_counter()

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_index += 1

            # Sample every Nth frame
            if frame_index % FRAME_SAMPLE_RATE != 0:
                continue

            sampled_index += 1
            timestamp_ms = (frame_index / fps) * 1000.0

            result = detector.run_inference(
                frame,
                conf_threshold=ai_model.default_confidence,
                iou_threshold=ai_model.default_iou,
            )
            raw_dets = result.get("detections", []) or []

            # Slim box payload — only what the client needs to draw
            boxes = [
                {
                    "x1": round(d["x1"], 2),
                    "y1": round(d["y1"], 2),
                    "x2": round(d["x2"], 2),
                    "y2": round(d["y2"], 2),
                    "class_name": d["class_name"],
                    "confidence": round(d["confidence"], 4),
                }
                for d in raw_dets
            ]
            all_detections.extend(raw_dets)
            if boxes:
                frames_with_detections += 1

            push({
                "type": "frame",
                "frame_index": frame_index,
                "sampled_index": sampled_index,
                "timestamp_ms": round(timestamp_ms, 1),
                "boxes": boxes,
                "object_count": len(boxes),
            })

        cap.release()
        elapsed = round(time.perf_counter() - start, 3)

        class_counts = Counter(d["class_name"] for d in all_detections)
        top_classes = [
            {"class_name": cls, "count": cnt}
            for cls, cnt in class_counts.most_common(10)
        ]

        # Create DetectionRecord at the end
        try:
            with open(video_path, "rb") as f:
                from django.core.files.base import ContentFile
                record = DetectionRecord(
                    user_id=user_id,
                    ai_model=ai_model,
                    detection_mode=DetectionRecord.DetectionMode.VIDEO,
                    confidence_used=ai_model.default_confidence,
                    iou_used=ai_model.default_iou,
                    detections=all_detections[:500],
                    object_count=len(all_detections),
                    inference_time_ms=round(elapsed * 1000, 2),
                )
                record.uploaded_file.save(
                    video_path.name,
                    ContentFile(f.read()),
                    save=True,
                )
            record_id = record.pk
        except Exception as exc:
            logger.exception("Failed to create DetectionRecord for session %s", session_id)
            record_id = None

        push_complete({
            "type": "complete",
            "total_frames_processed": frame_index,
            "frames_with_detections": frames_with_detections,
            "total_object_detections": len(all_detections),
            "top_classes": top_classes,
            "elapsed": elapsed,
            "record_id": record_id,
        })

        from .session_store import mark_finished, remove_session
        mark_finished(session_id)
        # Keep session for a few minutes so late WebSocket connections still get the "ready"
        # message; remove_session is called by a cleanup task or via TTL.

    except Exception as exc:
        logger.exception("Background video processing failed")
        push_error(f"Processing failed: {exc}")
