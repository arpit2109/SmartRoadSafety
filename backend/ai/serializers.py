"""
DRF serializers for the `ai` app.

Five serializers cover the lifecycle:

- `AIModelListSerializer`     — slim, for list views
- `AIModelDetailSerializer`   — full, for retrieve
- `AIModelUploadSerializer`   — multipart upload (create)
- `AIModelUpdateSerializer`   — PATCH (only mutable fields)
- `CategoryStatSerializer`    — entry in the categories endpoint
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import AIModel
from .utils import (
    validate_accuracy,
    validate_confidence,
    validate_iou,
    validate_weight_extension,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


class _UploadedByField(serializers.PrimaryKeyRelatedField):
    """Read-only FK to the uploader, surfaced as user id."""

    def __init__(self, **kwargs):
        kwargs.setdefault("read_only", True)
        super().__init__(**kwargs)


class AIModelListSerializer(serializers.ModelSerializer):
    uploaded_by = _UploadedByField()

    class Meta:
        model = AIModel
        fields = (
            "id",
            "name",
            "category",
            "version",
            "weight_format",
            "is_active",
            "is_default",
            "created_at",
        )


class AIModelDetailSerializer(serializers.ModelSerializer):
    uploaded_by = _UploadedByField()
    weight_file_url = serializers.SerializerMethodField()
    file_size_bytes = serializers.SerializerMethodField()

    class Meta:
        model = AIModel
        fields = (
            "id",
            "name",
            "category",
            "version",
            "weight_file",
            "weight_file_url",
            "file_size_bytes",
            "weight_format",
            "default_confidence",
            "default_iou",
            "accuracy",
            "is_active",
            "is_default",
            "uploaded_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "weight_file",
            "weight_file_url",
            "file_size_bytes",
            "weight_format",
            "uploaded_by",
            "created_at",
            "updated_at",
        )

    def get_weight_file_url(self, obj: AIModel) -> str | None:
        if not obj.weight_file:
            return None
        request = self.context.get("request")
        url = obj.weight_file.url
        return request.build_absolute_uri(url) if request else url

    def get_file_size_bytes(self, obj: AIModel) -> int | None:
        if not obj.weight_file:
            return None
        try:
            return obj.weight_file.size
        except (FileNotFoundError, ValueError, OSError):
            return None


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------


class AIModelUploadSerializer(serializers.Serializer):
    """
    Used by `POST /api/models/upload/`. Accepts a multipart payload
    with the weight file plus metadata.
    """

    name = serializers.CharField(max_length=100)
    category = serializers.ChoiceField(choices=AIModel.Category.choices)
    version = serializers.CharField(max_length=32)
    weight_file = serializers.FileField()
    weight_format = serializers.ChoiceField(
        choices=AIModel.WeightFormat.choices,
        default=AIModel.WeightFormat.PYTORCH,
        required=False,
    )
    default_confidence = serializers.FloatField(
        required=False, default=0.25, min_value=0.0, max_value=1.0
    )
    default_iou = serializers.FloatField(
        required=False, default=0.45, min_value=0.0, max_value=1.0
    )
    accuracy = serializers.FloatField(
        required=False, allow_null=True, min_value=0.0, max_value=1.0
    )
    is_active = serializers.BooleanField(required=False, default=True)
    is_default = serializers.BooleanField(required=False, default=False)

    def validate_weight_file(self, value):
        validate_weight_extension(value)
        return value

    def validate_default_confidence(self, value):
        validate_confidence(value)
        return value

    def validate_default_iou(self, value):
        validate_iou(value)
        return value

    def validate_accuracy(self, value):
        if value is not None:
            validate_accuracy(value)
        return value


class AIModelUpdateSerializer(serializers.ModelSerializer):
    """
    Used by `PATCH /api/models/<id>/`. Only mutable fields are exposed:
    version, inference defaults, accuracy, file replacement, flags.
    """

    class Meta:
        model = AIModel
        fields = (
            "version",
            "weight_file",
            "default_confidence",
            "default_iou",
            "accuracy",
            "is_active",
            "is_default",
        )
        extra_kwargs = {
            "weight_file": {"required": False},
            "version": {"required": False},
        }

    def validate_weight_file(self, value):
        validate_weight_extension(value)
        return value

    def validate_default_confidence(self, value):
        validate_confidence(value)
        return value

    def validate_default_iou(self, value):
        validate_iou(value)
        return value

    def validate_accuracy(self, value):
        if value is not None:
            validate_accuracy(value)
        return value


# ---------------------------------------------------------------------------
# Categories endpoint payload
# ---------------------------------------------------------------------------


class CategoryStatSerializer(serializers.Serializer):
    category = serializers.CharField()
    count = serializers.IntegerField()
    active_count = serializers.IntegerField()
    has_default = serializers.BooleanField()
