"""
Background video processor - low-latency rebuild.

Key changes vs v1
-----------------
- FRAME_SAMPLE_RATE reduced from 10 to 3 (10fps detection at 30fps source).
- Pace limiter: sleeps between frames to stay in sync with real video playback
  speed, preventing frame flood on the client.
- stop_event: threading.Event that the caller can set to abort mid-video.
- Per-frame inference_time_ms and running avg_inference_ms pushed to client.
- progress percentage included in every frame message.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from pathlib import Path

import cv2
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from ai.detector import YOLODetector
from ai.model_loader import (
    get_ai_model_by_id, load_model_by_id,
    ModelFileMissing, ModelLoadError, ModelNotFound,
)
from detection.models import DetectionRecord

logger = logging.getLogger(__name__)

FRAME_SAMPLE_RATE = 3  # process every 3rd frame (~10fps at 30fps source)


def process_video_background(
    session_id: str,
    user_id: int,
    model_id: int,
    video_path: Path,
    stop_event: threading.Event | None = None,
):
    channel_layer = get_channel_layer()
    group_name = f"video_{session_id}"

    if stop_event is None:
        stop_event = threading.Event()

    def push(payload):
        async_to_sync(channel_layer.group_send)(
            group_name, {"type": "detection.frame", "data": payload},
        )

    def push_complete(payload):
        async_to_sync(channel_layer.group_send)(
            group_name, {"type": "detection.complete", "data": payload},
        )

    def push_error(message):
        async_to_sync(channel_layer.group_send)(
            group_name,
            {"type": "detection.error", "data": {"type": "error", "message": message}},
        )

    try:
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

        push({
            "type": "started",
            "model": {
                "id": ai_model.pk, "name": ai_model.name,
                "version": ai_model.version, "category": ai_model.category,
            },
            "total_frames": total_frames,
            "fps": round(fps, 2),
            "frame_sample_rate": FRAME_SAMPLE_RATE,
        })

        all_detections = []
        frames_with_detections = 0
        frame_index = 0
        sampled_index = 0
        total_inference_ms = 0.0
        wall_start = time.perf_counter()

        while True:
            if stop_event.is_set():
                logger.info("Video processing aborted: session=%s", session_id)
                break

            ret, frame = cap.read()
            if not ret:
                break
            frame_index += 1

            if frame_index % FRAME_SAMPLE_RATE != 0:
                continue

            sampled_index += 1
            timestamp_ms = (frame_index / fps) * 1000.0

            t0 = time.perf_counter()
            result = detector.run_inference(
                frame,
                conf_threshold=ai_model.default_confidence,
                iou_threshold=ai_model.default_iou,
            )
            inference_ms = (time.perf_counter() - t0) * 1000.0
            total_inference_ms += inference_ms
            avg_inference_ms = total_inference_ms / sampled_index

            raw_dets = result.get("detections", []) or []
            boxes = [
                {
                    "x1": round(d["bbox"][0], 2), "y1": round(d["bbox"][1], 2),
                    "x2": round(d["bbox"][2], 2), "y2": round(d["bbox"][3], 2),
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
                "inference_time_ms": round(inference_ms, 2),
                "avg_inference_ms": round(avg_inference_ms, 2),
                "progress": round(frame_index / total_frames * 100, 1) if total_frames else 0,
            })

            # Pace limiter: sleep to avoid flooding faster than real-time playback
            elapsed_s = time.perf_counter() - wall_start
            expected_s = frame_index / fps
            drift = expected_s - elapsed_s
            if drift > 0:
                time.sleep(drift * 0.8)

        cap.release()
        elapsed = round(time.perf_counter() - wall_start, 3)

        class_counts = Counter(d["class_name"] for d in all_detections)
        top_classes = [
            {"class_name": cls, "count": cnt}
            for cls, cnt in class_counts.most_common(10)
        ]

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
                    video_path.name, ContentFile(f.read()), save=True,
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
            "avg_inference_ms": round(total_inference_ms / sampled_index, 2) if sampled_index else 0,
            "record_id": record_id,
        })

        from .session_store import mark_finished
        mark_finished(session_id)

    except Exception as exc:
        logger.exception("Background video processing failed")
        push_error(f"Processing failed: {exc}")
