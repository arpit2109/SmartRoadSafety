"""
AIModel — Module 3.

Stores metadata about every YOLO/ONNX weight file the system uses.
The actual weights live in `media/models/<category>/<name>/<file>.pt`
and are loaded at runtime via `ai.model_loader.load_model(...)`.
"""
from django.conf import settings
from django.db import models


def model_upload_path(instance: "AIModel", filename: str) -> str:
    """
    Compute the on-disk upload path for a weight file.

    Structure: models/<category>/<slug(name)>/<filename>

    Imported here (rather than from utils) to keep the upload_to callable
    in one place — the slug helper is duplicated in utils to avoid an
    import cycle at app load time.
    """
    from .utils import slugify_filename

    return f"models/{instance.category}/{slugify_filename(instance.name)}/{filename}"


class AIModel(models.Model):
    """A single registered AI model (e.g. Helmet V1, Vehicle Detector v1.0)."""

    class Category(models.TextChoices):
        HELMET = "helmet", "Helmet"
        VEHICLE = "vehicle", "Vehicle"
        BIKE = "bike", "Bike"
        CUSTOM = "custom", "Custom"

    class WeightFormat(models.TextChoices):
        PYTORCH = "pt", "PyTorch (.pt)"
        ONNX = "onnx", "ONNX (.onnx)"
        TENSORRT = "engine", "TensorRT (.engine)"

    # ----- identity -----
    name = models.CharField(
        max_length=100,
        help_text="Human-readable model name, e.g. 'Helmet Detector'.",
    )
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        help_text="Detection category this model is responsible for.",
    )
    version = models.CharField(
        max_length=32,
        help_text="Free-form version string, e.g. '1.0', '2.0.1', '2026-07-22'.",
    )

    # ----- file -----
    weight_file = models.FileField(
        upload_to=model_upload_path,
        help_text="The .pt / .onnx / .engine weight file. Stored under media/models/<category>/.",
    )
    weight_format = models.CharField(
        max_length=10,
        choices=WeightFormat.choices,
        default=WeightFormat.PYTORCH,
    )

    # ----- inference defaults -----
    default_confidence = models.FloatField(
        default=0.25,
        help_text="Default confidence threshold (0.0 - 1.0).",
    )
    default_iou = models.FloatField(
        default=0.45,
        help_text="Default IoU threshold for NMS (0.0 - 1.0).",
    )
    accuracy = models.FloatField(
        null=True,
        blank=True,
        help_text="Optional reported accuracy (e.g. mAP) at upload time. 0.0 - 1.0.",
    )

    # ----- state -----
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive models are soft-deleted — they are skipped by the loader.",
    )
    is_default = models.BooleanField(
        default=False,
        help_text=(
            "If true, this model is returned by load_default(category=...) "
            "for its category. Only one default per category is allowed."
        ),
    )

    # ----- audit -----
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_models",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "version", "category"],
                name="unique_model_name_version_category",
            ),
        ]
        indexes = [
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["is_default"]),
        ]
        ordering = ["category", "-is_default", "-created_at"]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.name} v{self.version} ({self.category})"
