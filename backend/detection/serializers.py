"""
DRF serializers for the detection app.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import DetectionRecord


class DetectionRecordListSerializer(serializers.ModelSerializer):
    """Slim serializer for the history list view."""

    ai_model_name = serializers.CharField(
        source="ai_model.name", read_only=True, default=None
    )
    ai_model_version = serializers.CharField(
        source="ai_model.version", read_only=True, default=None
    )
    uploaded_file_url = serializers.SerializerMethodField()
    result_file_url = serializers.SerializerMethodField()

    class Meta:
        model = DetectionRecord
        fields = (
            "id",
            "uploaded_file_url",
            "result_file_url",
            "ai_model_name",
            "ai_model_version",
            "detection_mode",
            "object_count",
            "created_at",
        )

    def get_uploaded_file_url(self, obj: DetectionRecord) -> str | None:
        if not obj.uploaded_file:
            return None
        request = self.context.get("request")
        url = obj.uploaded_file.url
        return request.build_absolute_uri(url) if request else url

    def get_result_file_url(self, obj: DetectionRecord) -> str | None:
        if not obj.result_file:
            return None
        request = self.context.get("request")
        url = obj.result_file.url
        return request.build_absolute_uri(url) if request else url


class DetectionRecordDetailSerializer(serializers.ModelSerializer):
    """Full serializer with all fields for the detail view."""

    ai_model_name = serializers.CharField(
        source="ai_model.name", read_only=True, default=None
    )
    ai_model_version = serializers.CharField(
        source="ai_model.version", read_only=True, default=None
    )
    uploaded_file_url = serializers.SerializerMethodField()
    result_file_url = serializers.SerializerMethodField()

    class Meta:
        model = DetectionRecord
        fields = (
            "id",
            "uploaded_file_url",
            "result_file_url",
            "ai_model_name",
            "ai_model_version",
            "detection_mode",
            "confidence_used",
            "iou_used",
            "detections",
            "object_count",
            "inference_time_ms",
            "created_at",
        )

    def get_uploaded_file_url(self, obj: DetectionRecord) -> str | None:
        if not obj.uploaded_file:
            return None
        request = self.context.get("request")
        url = obj.uploaded_file.url
        return request.build_absolute_uri(url) if request else url

    def get_result_file_url(self, obj: DetectionRecord) -> str | None:
        if not obj.result_file:
            return None
        request = self.context.get("request")
        url = obj.result_file.url
        return request.build_absolute_uri(url) if request else url
