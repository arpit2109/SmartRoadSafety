"""
Model selector — decides which AIModel to use for a given detection task.

Exposes:
    select_model_by_id(pk)        — load a specific model by primary key
    select_default(category)       — load the active default model for a category
    select_auto(image_np)          — quick multi-model scan, return best match
    load_model_and_classes(model_id) — load YOLO + class list for a given AIModel pk
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

import numpy as np

from .detector import YOLODetector
from .model_loader import (
    get_ai_model_by_id,
    load_default,
    load_model_by_id,
    ModelFileMissing,
    ModelLoadError,
    ModelNotFound,
)

if TYPE_CHECKING:
    import numpy.typing as npt

logger = logging.getLogger(__name__)

# Low-confidence pass threshold for auto-selection sweep
_AUTO_CONF = 0.15


def select_model_by_id(pk: int):
    """
    Return the AIModel row identified by ``pk``.
    Raises ``ModelNotFound`` if the row does not exist or is inactive.
    """
    return get_ai_model_by_id(pk)


def select_default(category: str):
    """
    Return the active default AIModel for ``category``.
    Raises ``NoDefaultModel`` (from model_loader) if none is configured.
    """
    return load_default(category=category)


def select_auto(image_np: "npt.NDArray") -> tuple:
    """
    Multi-model auto-selection.

    Runs a quick low-confidence inference pass with every active AIModel,
    then returns the one that produced the most detections — suggesting the
    best domain match for the given image.

    Returns
    -------
    tuple
        (AIModel row, YOLODetector instance, best_result dict)

    Raises ``ModelNotFound`` if no models are registered.
    """
    # Fetch all active model rows from the DB
    from .models import AIModel
    active_rows = list(AIModel.objects.filter(is_active=True))

    if not active_rows:
        logger.warning("No active models found — falling back to vehicle default.")
        ai_model = load_default(category="vehicle")
        yolo = load_model_by_id(ai_model.pk)
        return ai_model, YOLODetector(yolo), {}

    best_row = None
    best_count = -1
    best_result = {}
    best_detector = None

    for ai_model in active_rows:
        try:
            yolo = load_model_by_id(ai_model.pk)
        except (ModelFileMissing, ModelLoadError):
            continue

        detector = YOLODetector(yolo)
        result = detector.run_inference(
            image_np,
            conf_threshold=_AUTO_CONF,
            iou_threshold=0.45,
        )

        count = result.get("object_count", 0)
        logger.debug(
            "Auto-select pass: %s (%s) → %d objects",
            ai_model.name,
            ai_model.category,
            count,
        )

        if count > best_count:
            best_count = count
            best_row = ai_model
            best_result = result
            best_detector = detector

    # Fallback if nothing detected
    if best_row is None:
        logger.warning("Auto-select found no models with detections — using vehicle default.")
        ai_model = load_default(category="vehicle")
        yolo = load_model_by_id(ai_model.pk)
        return ai_model, YOLODetector(yolo), {}

    logger.info(
        "Auto-selected model: %s (category=%s, detections=%d)",
        best_row.name,
        best_row.category,
        best_count,
    )
    return best_row, best_detector, best_result


def load_model_and_classes(model_id: int):
    """
    Load the YOLO model and its class list for ``model_id``.
    Returns (YOLODetector instance, class_names list).

    Raises ``ModelNotFound``, ``ModelFileMissing``, ``ModelLoadError``.
    """
    ai_model = get_ai_model_by_id(model_id)
    yolo = load_model_by_id(model_id)
    detector = YOLODetector(yolo)
    classes = ai_model.classes if ai_model.classes else []
    return detector, classes
