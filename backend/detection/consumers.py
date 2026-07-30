"""
WebSocket consumer for live video detection streaming.

The client connects to ``/ws/detection/video/<session_id>/`` and receives
JSON messages of the shape:

    {
        "type": "frame",
        "frame_index": 42,
        "timestamp_ms": 1234.5,
        "boxes": [
            {"x1": ..., "y1": ..., "x2": ..., "y2": ...,
             "class_name": "...", "confidence": 0.92},
            ...
        ]
    }

or:

    {"type": "complete", "total_frames": ..., "total_detections": ...,
     "top_classes": [...], "elapsed": 12.3, "record_id": 7}
    {"type": "error", "message": "..."}
"""
import asyncio
import json
import logging
import time
from collections import Counter

import cv2
import numpy as np
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

class VideoDetectionConsumer(AsyncWebsocketConsumer):
    async def send_json(self, content: dict) -> None:
        await self.send(text_data=json.dumps(content))

    async def connect(self):
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        
        from .session_store import get_session
        self.session = get_session(self.session_id)
        if not self.session:
            await self.close(code=4004)
            return
            
        await self.accept()
        
        # Load model logic
        from ai.model_loader import (
            get_ai_model_by_id, load_model_by_id,
            ModelFileMissing, ModelLoadError, ModelNotFound,
        )
        from ai.detector import YOLODetector
        from asgiref.sync import sync_to_async
        
        try:
            ai_model = await sync_to_async(get_ai_model_by_id)(self.session.model_id)
            yolo = await sync_to_async(load_model_by_id)(self.session.model_id)
        except Exception as exc:
            await self.send_json({"type": "error", "message": f"Model error: {exc}"})
            await self.close(code=1011)
            return

        self.ai_model = ai_model
        self.detector = YOLODetector(yolo)
        
        # Tracking vars
        self._inferring = False
        self._dropped = 0
        self.frame_seq = 0
        self._total_inference_ms = 0.0
        self._frames_inferred = 0
        self.frames_with_detections = 0
        self.all_detections = []
        
        self.wall_start = time.perf_counter()
        
        await self.send_json({
            "type": "ready",
            "session_id": self.session_id,
            "model": {
                "id": ai_model.pk,
                "name": ai_model.name,
                "version": ai_model.version,
                "category": ai_model.category,
            },
        })
        logger.info("Video WS connected: session=%s", self.session_id)

    async def disconnect(self, close_code):
        logger.info("Video WS disconnected: session=%s code=%s", getattr(self, "session_id", "?"), close_code)

    async def receive(self, text_data=None, bytes_data=None):
        if bytes_data is not None:
            await self._handle_frame(bytes_data)
            return
        if text_data is None:
            return
        try:
            msg = json.loads(text_data)
        except json.JSONDecodeError:
            return

        mtype = msg.get("type")
        if mtype == "ping":
            await self.send_json({"type": "pong"})
        elif mtype == "stop":
            await self._handle_stop()

    async def _handle_frame(self, jpeg_bytes: bytes):
        if self._inferring:
            self._dropped += 1
            return
        self._inferring = True
        asyncio.ensure_future(self._run_inference_and_reply(jpeg_bytes))

    async def _run_inference_and_reply(self, jpeg_bytes: bytes):
        try:
            loop = asyncio.get_event_loop()
            detector = self.detector
            ai_model = self.ai_model

            def _sync_infer():
                nparr = np.frombuffer(jpeg_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if frame is None:
                    return None, 0.0
                t0 = time.perf_counter()
                result = detector.run_inference(
                    frame,
                    ai_model.default_confidence,
                    ai_model.default_iou,
                )
                return result, (time.perf_counter() - t0) * 1000.0

            result, elapsed_ms = await loop.run_in_executor(None, _sync_infer)

            if result is None:
                await self.send_json({"type": "error", "message": "Could not decode frame."})
                return

            self.frame_seq += 1
            self._frames_inferred += 1
            self._total_inference_ms += elapsed_ms
            avg_ms = self._total_inference_ms / self._frames_inferred

            raw_dets = result.get("detections", [])
            self.all_detections.extend(raw_dets)
            if raw_dets:
                self.frames_with_detections += 1

            boxes = [
                {
                    "x1": round(d["bbox"][0], 2), "y1": round(d["bbox"][1], 2),
                    "x2": round(d["bbox"][2], 2), "y2": round(d["bbox"][3], 2),
                    "class_name": d["class_name"],
                    "confidence": round(d["confidence"], 4),
                }
                for d in raw_dets
            ]

            await self.send_json({
                "type": "frame",
                "boxes": boxes,
                "object_count": len(boxes),
                "inference_time_ms": round(elapsed_ms, 2),
                "avg_inference_ms": round(avg_ms, 2),
                "frame_seq": self.frame_seq,
                "dropped_frames": self._dropped,
            })
        except Exception as exc:
            logger.exception("Inference failed in video consumer")
            await self.send_json({"type": "error", "message": f"Inference failed: {exc}"})
        finally:
            self._inferring = False

    async def _handle_stop(self):
        # Create detection record
        from detection.models import DetectionRecord
        from asgiref.sync import sync_to_async
        from django.core.files.base import ContentFile
        
        elapsed = round(time.perf_counter() - self.wall_start, 3)
        class_counts = Counter(d["class_name"] for d in self.all_detections)
        top_classes = [
            {"class_name": cls, "count": cnt}
            for cls, cnt in class_counts.most_common(10)
        ]
        
        record_id = None
        
        def _save_record():
            with open(self.session.video_path, "rb") as f:
                record = DetectionRecord(
                    user_id=self.session.user_id,
                    ai_model=self.ai_model,
                    detection_mode=DetectionRecord.DetectionMode.VIDEO,
                    confidence_used=self.ai_model.default_confidence,
                    iou_used=self.ai_model.default_iou,
                    detections=self.all_detections[:500],
                    object_count=len(self.all_detections),
                    inference_time_ms=round(elapsed * 1000, 2),
                )
                record.uploaded_file.save(
                    self.session.video_path.name, ContentFile(f.read()), save=True,
                )
                return record.pk

        try:
            record_id = await sync_to_async(_save_record)()
        except Exception as exc:
            logger.exception("Failed to create DetectionRecord for session %s", self.session_id)
            
        await self.send_json({
            "type": "complete",
            "total_frames_processed": self.frame_seq,
            "frames_with_detections": self.frames_with_detections,
            "total_object_detections": len(self.all_detections),
            "top_classes": top_classes,
            "elapsed": elapsed,
            "avg_inference_ms": round(self._total_inference_ms / self._frames_inferred, 2) if self._frames_inferred else 0,
            "record_id": record_id,
        })
        await self.close(code=1000)
