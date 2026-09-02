"""
Business logic for the `ai` app.

Views and admin call into this module. It owns the rules around
default-model toggling, file replacement, and cache invalidation.
The HTTP layer is kept thin on purpose.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable, Optional

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.db.models import Model as DjangoModel

from .cache import cache
from .utils import (
    delete_weight_file,
    validate_accuracy,
    validate_confidence,
    validate_iou,
    validate_weight_extension,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ServiceError(Exception):
    """Base class for service-layer errors."""


class InactiveModelError(ServiceError):
    """Operation requires an active model."""


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def create_model(
    *,
    name: str,
    category: str,
    version: str,
    weight_file: UploadedFile,
    uploaded_by=None,
    default_confidence: float = 0.25,
    default_iou: float = 0.45,
    accuracy: Optional[float] = None,
    weight_format: str = "pt",
    is_active: bool = True,
    is_default: bool = False,
) -> DjangoModel:
    """
    Create a new AIModel with full validation. Wraps the file write +
    row insert in a transaction so a failed validation never leaves
    a half-uploaded file behind.
    """
    from .models import AIModel

    validate_weight_extension(weight_file)
    validate_confidence(default_confidence)
    validate_iou(default_iou)
    if accuracy is not None:
        validate_accuracy(accuracy)

    with transaction.atomic():
        instance = AIModel(
            name=name,
            category=category,
            version=version,
            default_confidence=default_confidence,
            default_iou=default_iou,
            accuracy=accuracy,
            weight_format=weight_format,
            is_active=is_active,
            is_default=False,  # always create non-default; promote via set_as_default
            uploaded_by=uploaded_by,
        )
        # Setting the FileField inside the atomic block so the file is
        # only persisted once the row commits.
        instance.weight_file.save(weight_file.name, weight_file, save=False)
        instance.save()

    if is_default:
        instance = set_as_default(instance)

    logger.info("Created AIModel pk=%s name=%s v%s", instance.pk, name, version)
    return instance


# ---------------------------------------------------------------------------
# Default toggling
# ---------------------------------------------------------------------------


@transaction.atomic
def set_as_default(ai_model: DjangoModel) -> DjangoModel:
    """
    Mark `ai_model` as the default for its category. Atomically clears
    `is_default` on any sibling model in the same category.

    Raises InactiveModelError if the model is not active.
    """
    from .models import AIModel

    if not ai_model.is_active:
        raise InactiveModelError(
            f"Cannot set inactive model {ai_model.pk} as default."
        )

    AIModel.objects.filter(
        category=ai_model.category,
        is_default=True,
    ).exclude(pk=ai_model.pk).update(is_default=False)

    ai_model.is_default = True
    ai_model.save(update_fields=["is_default", "updated_at"])
    return ai_model


# ---------------------------------------------------------------------------
# Activate / Deactivate
# ---------------------------------------------------------------------------


def activate(ai_model: DjangoModel) -> DjangoModel:
    if ai_model.is_active:
        return ai_model
    ai_model.is_active = True
    ai_model.save(update_fields=["is_active", "updated_at"])
    return ai_model


def deactivate(ai_model: DjangoModel) -> DjangoModel:
    """
    Soft-delete: sets is_active=False. The row stays in the DB so
    audit/history is preserved, and the loader will skip it.
    Also unsets default if it was the default.
    """
    if not ai_model.is_active:
        return ai_model

    update_fields = ["is_active", "updated_at"]
    if ai_model.is_default:
        ai_model.is_default = False
        update_fields.append("is_default")
    ai_model.is_active = False
    ai_model.save(update_fields=update_fields)
    cache.invalidate(ai_model.pk)
    return ai_model


# ---------------------------------------------------------------------------
# File replacement
# ---------------------------------------------------------------------------


def replace_weight_file(ai_model: DjangoModel, new_file: UploadedFile) -> DjangoModel:
    """
    Swap in a new weight file. Old file is removed from disk, the
    cache is invalidated so the next load picks up the new weights.
    """
    validate_weight_extension(new_file)

    old_name = ai_model.weight_file.name if ai_model.weight_file else None
    ai_model.weight_file.save(new_file.name, new_file, save=True)
    cache.invalidate(ai_model.pk)

    if old_name and old_name != ai_model.weight_file.name:
        # Best-effort cleanup of the previous file on disk.
        try:
            storage = ai_model.weight_file.storage
            if storage.exists(old_name):
                storage.delete(old_name)
        except Exception:  # noqa: BLE001 - never let cleanup break the swap
            logger.warning("Failed to delete old weight file %s", old_name, exc_info=True)

    return ai_model


# ---------------------------------------------------------------------------
# Hard delete (admin-only path)
# ---------------------------------------------------------------------------


def hard_delete(ai_model: DjangoModel) -> None:
    """
    Permanently remove the row and its weight file. Use sparingly —
    prefer `deactivate` for user-facing flows.
    """
    cache.invalidate(ai_model.pk)
    delete_weight_file(ai_model)
    ai_model.delete()


# ---------------------------------------------------------------------------
# Bulk helpers (admin actions)
# ---------------------------------------------------------------------------


def bulk_activate(models: Iterable[DjangoModel]) -> int:
    count = 0
    for m in models:
        if not m.is_active:
            m.is_active = True
            m.save(update_fields=["is_active", "updated_at"])
            count += 1
    return count


def bulk_deactivate(models: Iterable[DjangoModel]) -> int:
    count = 0
    for m in models:
        if m.is_active:
            m.is_active = False
            if m.is_default:
                m.is_default = False
                m.save(update_fields=["is_active", "is_default", "updated_at"])
            else:
                m.save(update_fields=["is_active", "updated_at"])
            cache.invalidate(m.pk)
            count += 1
    return count


def bulk_set_default(models: Iterable[DjangoModel]) -> int:
    """
    For each model in `models`, mark it as default for its category.
    Skips inactive models.
    """
    count = 0
    for m in models:
        if m.is_active:
            set_as_default(m)
            count += 1
    return count
