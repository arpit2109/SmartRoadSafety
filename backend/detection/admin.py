"""
Django admin for detection records.
"""
from django.contrib import admin

from .models import DetectionRecord


@admin.register(DetectionRecord)
class DetectionRecordAdmin(admin.ModelAdmin):
    list_display = (
        "pk",
        "user",
        "ai_model",
        "detection_mode",
        "object_count",
        "inference_time_ms",
        "created_at",
    )
    list_filter = ("detection_mode", "ai_model", "created_at")
    search_fields = ("user__username", "ai_model__name")
    readonly_fields = (
        "uploaded_file",
        "result_file",
        "detections",
        "object_count",
        "inference_time_ms",
        "created_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)

    fieldsets = (
        (None, {
            "fields": ("user", "ai_model", "detection_mode", "created_at"),
        }),
        ("Files", {
            "fields": ("uploaded_file", "result_file"),
        }),
        ("Results", {
            "fields": ("object_count", "inference_time_ms", "detections"),
        }),
        ("Parameters", {
            "fields": ("confidence_used", "iou_used"),
        }),
    )
