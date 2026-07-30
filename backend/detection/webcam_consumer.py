"""
WebSocket consumer for live webcam detection.

The browser opens a webcam via getUserMedia, captures frames into a canvas,
encodes them as JPEG, and sends them as binary messages over the WebSocket.
The server decodes each frame, runs YOLO inference, and sends back a JSON
message with the bounding boxes. Boxes are drawn on a <canvas> overlay on
top of the live <video> element.

Protocol
--------
Client → Server (binary): raw JPEG bytes from canvas.toBlob()
Client → Server (JSON):   {"type": "config", "model_id": <int>}
Client → Server (JSON):   {"type": "ping"}

Server → Client (JSON):   {"type": "ready"}
Server → Client (JSON):   {"type": "boxes", "boxes": [...], "inference_time_ms": N, "frame_seq": M}
Server → Client (JSON):   {"type": "error", "message": "..."}
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

import cv2
import numpy as np
from channels.generic.websocket import AsyncJsonWebsocketConsumer, AsyncWebsocketConsumer

logger = logging.getLogger(__name__)


class WebcamDetectionConsumer(AsyncWebsocketConsumer):
    """
    Stateful consumer: keeps the loaded YOLO detector on the connection so
    we don't reload the model on every frame. Reacts to ``config`` messages
    to swap the active model without reconnecting.
    """

    async def connect(self):
        # Authenticate via JWT in query string: ?token=<jwt>
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
        self.detector = None   # YOLODetector instance (loaded lazily on first config)
        self.ai_model = None   # AIModel row
        self.frame_seq = 0
        self.last_send = 0.0
        self._dropped = 0      # frames skipped because previous inference still running

        await self.accept()
        await self.send_json({
            "type": "ready",
            "message": "Webcam stream connected. Send {type: 'config', model_id: N} to start.",
        })
        logger.info("Webcam WS connected: user=%s", user)

    async def disconnect(self, close_code):
        logger.info("Webcam WS disconnected: user=%s code=%s",
                    getattr(self, "user", "?"), close_code)

    async def receive(self, text_data=None, bytes_data=None):
        # ── Binary frame path ──────────────────────────────────────────
        if bytes_data is not None:
            await self._handle_frame(bytes_data)
            return

        # ── JSON control path ──────────────────────────────────────────
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
            get_ai_model_by_id,
            load_model_by_id,
            ModelFileMissing,
            ModelLoadError,
            ModelNotFound,
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
            # Drop silently — client should send "config" first
            return

        # Decode JPEG
        nparr = np.frombuffer(jpeg_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            await self.send_json({"type": "error", "message": "Could not decode frame."})
            return

        # Inference (run in threadpool so we don't block the event loop)
        from channels.db import database_sync_to_async
        from functools import partial
        from concurrent.futures import ThreadPoolExecutor

        loop = asyncio.get_event_loop()
        # Use a small executor for inference; one per connection is fine
        executor = getattr(self, "_executor", None)
        if executor is None:
            executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ws-yolo")
            self._executor = executor

        start = time.perf_counter()
        try:
            result = await loop.run_in_executor(
                executor,
                self.detector.run_inference,
                frame,
                self.ai_model.default_confidence,
                self.ai_model.default_iou,
            )
        except Exception as exc:
            logger.exception("Inference failed in webcam consumer")
            await self.send_json({"type": "error", "message": f"Inference failed: {exc}"})
            return

        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        self.frame_seq += 1

        # Slim payload — coordinates are in the original frame's pixel space
        boxes = [
            {
                "x1": round(d["x1"], 2),
                "y1": round(d["y1"], 2),
                "x2": round(d["x2"], 2),
                "y2": round(d["y2"], 2),
                "class_name": d["class_name"],
                "confidence": round(d["confidence"], 4),
            }
            for d in (result.get("detections") or [])
        ]

        await self.send_json({
            "type": "boxes",
            "boxes": boxes,
            "object_count": len(boxes),
            "inference_time_ms": elapsed_ms,
            "frame_seq": self.frame_seq,
        })
