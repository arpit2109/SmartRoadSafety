"""
Model selector — decides which AIModel to use for a given detection task.

Exposes:
    select_model_by_id(pk)        — load a specific model by primary key
    select_default(category)      — load the active default model for a category
    select_auto(image_np)         — rule-based scene detection (Module 7 stub)
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    import numpy.typing as npt

from .model_loader import get_ai_model_by_id, load_default, ModelNotFound

logger = logging.getLogger(__name__)


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
    Rule-based scene detection (Module 7 stub).

    Given a NumPy image, this function would ideally run a scene classifier
    or a quick low-confidence detection pass to determine the appropriate
    category, then return the best model for that category.

    Currently returns the vehicle default as a safe fallback.
    Replace with real scene analysis before deploying.
    """
    logger.warning(
        "select_auto called — this is a stub returning the vehicle default. "
        "Implement real scene classification before production use."
    )
    ai_model = load_default(category="vehicle")
    return ai_model
