"""
Shared helpers for the `ai` app.

Stateless utility functions: filename slugification, weight-file
validation, default-model resolution, and absolute-path resolution.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

from django.conf import settings
from django.core.exceptions import ValidationError

# ---------------------------------------------------------------------------
# Filename helpers
# ---------------------------------------------------------------------------

_SLUG_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slugify_filename(value: str) -> str:
    """
    Lower-case, dash-joined slug. Used to build the on-disk directory
    name for a model's weight files.

    >>> slugify_filename("Helmet Detector V1")
    'helmet-detector-v1'
    """
    value = (value or "").strip().lower()
    slug = _SLUG_NON_ALNUM.sub("-", value).strip("-")
    return slug or "model"


# ---------------------------------------------------------------------------
# Validators (used by serializer + admin)
# ---------------------------------------------------------------------------

ALLOWED_WEIGHT_EXTENSIONS = {".pt", ".onnx", ".engine"}


def validate_weight_extension(file_obj) -> None:
    """
    Reject uploads whose extension is not in ALLOWED_WEIGHT_EXTENSIONS.

    Accepts a Django `InMemoryUploadedFile` / `TemporaryUploadedFile` /
    plain `File`-like. Pulls the extension from `file.name`.
    """
    name = getattr(file_obj, "name", "") or ""
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_WEIGHT_EXTENSIONS:
        raise ValidationError(
            f"Unsupported weight file '{ext}'. "
            f"Allowed: {sorted(ALLOWED_WEIGHT_EXTENSIONS)}"
        )


def validate_probability(value: float, *, field: str = "value") -> None:
    if not 0.0 <= value <= 1.0:
        raise ValidationError({field: f"{field} must be between 0.0 and 1.0."})


def validate_confidence(value: float) -> None:
    validate_probability(value, field="default_confidence")


def validate_iou(value: float) -> None:
    validate_probability(value, field="default_iou")


def validate_accuracy(value: float) -> None:
    if value is None:
        return
    validate_probability(value, field="accuracy")


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def resolve_model_path(ai_model) -> str:
    """
    Return the absolute filesystem path for a model's weight file.
    The file is expected to live under MEDIA_ROOT.
    """
    if not ai_model.weight_file:
        raise FileNotFoundError(f"AIModel {ai_model.pk} has no weight_file set.")
    return str(Path(settings.MEDIA_ROOT) / ai_model.weight_file.name)


def delete_weight_file(ai_model) -> bool:
    """
    Best-effort delete of the underlying weight file from disk.
    Returns True if a file was removed, False otherwise.
    Never raises — log-and-swallow is intentional so a missing file
    doesn't break a soft-delete or replacement.
    """
    try:
        if not ai_model.weight_file:
            return False
        path = Path(ai_model.weight_file.path)
        if path.is_file():
            path.unlink()
            return True
    except (FileNotFoundError, ValueError, OSError):
        pass
    return False


# ---------------------------------------------------------------------------
# Default-model resolution
# ---------------------------------------------------------------------------


def get_default_model(category: Optional[str] = None):
    """
    Return the active default AIModel, optionally filtered by category.

    Returns None if no default is set (the caller decides how to handle it).
    Imports the model lazily to avoid an import cycle at app load time.
    """
    from .models import AIModel

    qs = AIModel.objects.filter(is_active=True, is_default=True)
    if category:
        qs = qs.filter(category=category)
    return qs.first()


def get_active_model_by_name(name: str, category: Optional[str] = None):
    """
    Return the first active AIModel matching `name` (and optionally category),
    or None. Used by the loader.
    """
    from .models import AIModel

    qs = AIModel.objects.filter(name=name, is_active=True)
    if category:
        qs = qs.filter(category=category)
    return qs.first()
