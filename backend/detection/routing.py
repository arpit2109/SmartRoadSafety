"""
WebSocket URL routing for the detection app.

Routes:
    ws://host/ws/detection/video/<session_id>/   — live video detection stream
    ws://host/ws/detection/webcam/?token=<jwt>   — live webcam detection stream
"""
from django.urls import path

from . import consumers
from .webcam_consumer import WebcamDetectionConsumer

websocket_urlpatterns = [
    path("ws/detection/video/<str:session_id>/", consumers.VideoDetectionConsumer.as_asgi()),
    path("ws/detection/webcam/", WebcamDetectionConsumer.as_asgi()),
]
