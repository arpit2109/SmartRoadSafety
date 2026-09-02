"""
WebSocket consumer for live webcam detection - low-latency rebuild.

Key changes vs v1
-----------------
- Pipeline gate: incoming frames are dropped (not queued) when inference is
  already running. This prevents the latency spiral of stale frames piling up.
- asyncio.ensure_future: inference fires as a non-blocking background task so
  the receive loop is always free to accept the next message immediately.
- Running average: avg_inference_ms is tracked across the session and sent with
  every boxes response.
- Decode + infer happen together in one thread-pool call (fewer round-trips).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

import cv2
import numpy as np
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)


class WebcamDetectionConsumer(AsyncWebsocketConsumer):

    async def send_json(self, content: dict) -> None:
        await self.send(text_data=json.dumps(content))

    async def connect(self):
        from django.contrib.auth.models import AnonymousUser
        from urllib.parse import parse_qs
        from channels.db import database_sync_to_async
        from rest_framework_simplejwt.tokens import AccessToken, TokenError
        from django.contrib.auth import get_user_model

        query_string = self.scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token = (params.get("token") or [None])[0]

        user = AnonymousUser()
        if token:
            try:
                access = AccessToken(token)
                user_id = access["user_id"]
                User = get_user_model()

                @database_sync_to_async
                def _get_user(uid):
                    return User.objects.filter(pk=uid).first()

                user = await _get_user(user_id)
            except (TokenError, KeyError) as exc:
                logger.warning("Webcam WS auth failed: %s", exc)

        if not user or not getattr(user, "is_authenticated", False):
            await self.close(code=4001)
            return

        self.user = user
        self.detector = None
        self.ai_model = None
        self._inferring = False
        self._dropped = 0
        self.frame_seq = 0
        self._total_inference_ms = 0.0
        self._frames_inferred = 0

        await self.accept()
        await self.send_json({
            "type": "ready",
            "message": "Connected. Send {type: config, model_id: N} to start.",
        })
        logger.info("Webcam WS connected: user=%s", user)

    async def disconnect(self, close_code):
        avg = (
            self._total_inference_ms / self._frames_inferred
            if getattr(self, "_frames_inferred", 0) > 0 else 0.0
        )
        logger.info(
            "Webcam WS disconnected: user=%s code=%s dropped=%d avg_ms=%.1f",
            getattr(self, "user", "?"), close_code,
            getattr(self, "_dropped", 0), avg,
        )

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
            await self.send_json({"type": "pong", "t": time.time()})
        elif mtype == "config":
            await self._handle_config(msg.get("model_id"))
        elif mtype == "stop":
            self.detector = None
            self.ai_model = None
            await self.send_json({"type": "stopped"})

    async def _handle_config(self, model_id):
        if not model_id:
            await self.send_json({"type": "error", "message": "model_id is required."})
            return
        try:
            model_id = int(model_id)
        except (TypeError, ValueError):
            await self.send_json({"type": "error", "message": "model_id must be an integer."})
            return

        from ai.model_loader import (
            get_ai_model_by_id, load_model_by_id,
            ModelFileMissing, ModelLoadError, ModelNotFound,
        )
        from ai.detector import YOLODetector
        from asgiref.sync import sync_to_async

        try:
            ai_model = await sync_to_async(get_ai_model_by_id)(model_id)
            yolo = await sync_to_async(load_model_by_id)(model_id)
        except ModelNotFound:
            await self.send_json({"type": "error", "message": f"No active model with id={model_id}."})
            return
        except (ModelFileMissing, ModelLoadError) as exc:
            await self.send_json({"type": "error", "message": f"Model load failed: {exc}"})
            return

        self.ai_model = ai_model
        self.detector = YOLODetector(yolo)
        self._total_inference_ms = 0.0
        self._frames_inferred = 0
        self._dropped = 0
        self.frame_seq = 0

        await self.send_json({
            "type": "configured",
            "model": {
                "id": ai_model.pk,
                "name": ai_model.name,
                "version": ai_model.version,
                "category": ai_model.category,
            },
            "default_confidence": ai_model.default_confidence,
            "default_iou": ai_model.default_iou,
        })

    async def _handle_frame(self, jpeg_bytes: bytes):
        if self.detector is None or self.ai_model is None:
            return
        if self._inferring:
            self._dropped += 1
            logger.debug("Frame dropped (busy), total dropped=%d", self._dropped)
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

            boxes = [
                {
                    "x1": round(d["bbox"][0], 2), "y1": round(d["bbox"][1], 2),
                    "x2": round(d["bbox"][2], 2), "y2": round(d["bbox"][3], 2),
                    "class_name": d["class_name"],
                    "confidence": round(d["confidence"], 4),
                }
                for d in (result.get("detections") or [])
            ]

            await self.send_json({
                "type": "boxes",
                "boxes": boxes,
                "object_count": len(boxes),
                "inference_time_ms": round(elapsed_ms, 2),
                "avg_inference_ms": round(avg_ms, 2),
                "frame_seq": self.frame_seq,
                "dropped_frames": self._dropped,
            })

        except Exception as exc:
            logger.exception("Inference failed in webcam consumer")
            await self.send_json({"type": "error", "message": f"Inference failed: {exc}"})
        finally:
            self._inferring = False
