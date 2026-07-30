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
from __future__ import annotations

import json
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class VideoDetectionConsumer(AsyncJsonWebsocketConsumer):
    """
    Joins a session-specific channel group so a background processing
    thread can push frames to all connected clients.
    """

    async def connect(self):
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.group_name = f"video_{self.session_id}"

        # Reject if the session doesn't exist on the server.
        from .session_store import has_session
        if not has_session(self.session_id):
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("WebSocket connected: session=%s", self.session_id)

        # Notify the client that we're ready.
        await self.send_json({"type": "ready", "session_id": self.session_id})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("WebSocket disconnected: session=%s code=%s",
                    getattr(self, "session_id", "?"), close_code)

    async def receive_json(self, content, **kwargs):
        # Currently no inbound client messages — extend here (e.g. pause/resume).
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    # ── Group event handlers (called by channel_layer.group_send) ─────────

    async def detection_frame(self, event):
        """Forward a single frame's detection results to the client."""
        await self.send_json(event["data"])

    async def detection_complete(self, event):
        await self.send_json(event["data"])
        # Close cleanly once we've delivered the summary
        await self.close(code=1000)

    async def detection_error(self, event):
        await self.send_json(event["data"])
        await self.close(code=1011)
