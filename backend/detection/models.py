"""
DetectionRecord — stores every detection result permanently.

Each record links a user to their uploaded file, the model used,
the detection results, and the annotated output file.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


def result_upload_path(instance: "DetectionRecord", filename: str) -> str:
    """Store annotated images/videos under history/results/<user_id>/."""
    ext = filename.split(".")[-1]
    uid = uuid.uuid4().hex[:8]
    return f"history/results/{instance.user.id}/{uid}.{ext}"


def original_upload_path(instance: "DetectionRecord", filename: str) -> str:
    """Store uploaded files under history/uploads/<user_id>/."""
    return f"history/uploads/{instance.user.id}/{filename}"


class DetectionRecord(models.Model):
    """
    A single detection result, permanently stored for history and analytics.
    """

    class DetectionMode(models.TextChoices):
        MANUAL = "manual", "Manual"
        AUTO = "auto", "Automatic"
        WEBCAM = "webcam", "Webcam"

    # ── ownership ────────────────────────────────────────────────────────────
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="detection_records",
    )

    # ── files ──────────────────────────────────────────────────────────────
    uploaded_file = models.FileField(
        upload_to=original_upload_path,
        help_text="Original uploaded image or video.",
    )
    result_file = models.FileField(
        upload_to=result_upload_path,
        null=True,
        blank=True,
        help_text="Annotated output file (image or video).",
    )

    # ── what was used ─────────────────────────────────────────────────────
    ai_model = models.ForeignKey(
        "ai.AIModel",
        on_delete=models.SET_NULL,
        null=True,
        related_name="detection_records",
    )
    detection_mode = models.CharField(
        max_length=20,
        choices=DetectionMode.choices,
        default=DetectionMode.MANUAL,
    )

    # ── inference params ───────────────────────────────────────────────────
    confidence_used = models.FloatField(
        default=0.25,
        help_text="Confidence threshold applied (0.0–1.0).",
    )
    iou_used = models.FloatField(
        default=0.45,
        help_text="IoU threshold applied (0.0–1.0).",
    )

    # ── results ─────────────────────────────────────────────────────────────
    detections = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "List of detected objects: "
            "[{bbox, confidence, class_id, class_name}, ...]"
        ),
    )
    object_count = models.PositiveIntegerField(
        default=0,
        help_text="Total number of objects detected.",
    )
    inference_time_ms = models.FloatField(
        null=True,
        blank=True,
        help_text="Model inference time in milliseconds.",
    )

    # ── audit ─────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["ai_model"]),
            models.Index(fields=["detection_mode"]),
        ]
        verbose_name = "Detection Record"
        verbose_name_plural = "Detection Records"

    def __str__(self) -> str:  # pragma: no cover
        mode = self.detection_mode
        count = self.object_count
        user = self.user.username if self.user else "unknown"
        return f"[{mode}] {count} objects — {user} @ {self.created_at:%Y-%m-%d %H:%M}"
