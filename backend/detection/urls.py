"""
URL configuration for the detection app.

Routes:
    POST /api/detection/image/           — run image detection (manual)
    POST /api/detection/auto/            — auto-detect (best model sweep)
    POST /api/detection/video/           — video detection
    GET  /api/detection/history/          — list user's detection records
    GET  /api/detection/history/<id>/    — retrieve single record
    DELETE /api/detection/history/<id>/  — delete a record
    GET  /api/detection/history/stats/   — per-user stats for dashboard
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AutoDetectionView,
    DetectionRecordViewSet,
    ImageDetectionView,
    VideoDetectionView,
    VideoDetectionStreamView,
)

router = DefaultRouter()
router.register(r"history", DetectionRecordViewSet, basename="detection-record")

urlpatterns = [
    path("image/", ImageDetectionView.as_view(), name="detect-image"),
    path("auto/", AutoDetectionView.as_view(), name="detect-auto"),
    path("video/", VideoDetectionView.as_view(), name="detect-video"),
    path("video-stream/", VideoDetectionStreamView.as_view(), name="detect-video-stream"),
    path("", include(router.urls)),
]
