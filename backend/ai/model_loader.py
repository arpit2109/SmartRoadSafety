"""
Model loader — the public face of the AI subsystem.

Usage:

    from ai.model_loader import load_model, load_default

    helmet = load_model("Helmet Detector")          # by name
    helmet = load_model("Helmet Detector", "helmet")  # disambiguate
    veh    = load_default("vehicle")                # active default for category
    veh    = load_default()                         # any active default

The loader is cache-aware: the first call for a given model loads
the weights into memory, subsequent calls return the same object.
Cache invalidation is handled by `ai.signals` on save/delete.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from .cache import cache
from .utils import get_active_model_by_name, get_default_model, resolve_model_path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom errors
# ---------------------------------------------------------------------------


class ModelNotFound(Exception):
    """No active AIModel matches the lookup criteria."""

    def __init__(self, name: str, category: Optional[str] = None) -> None:
        msg = f"No active AI model named '{name}'"
        if category:
            msg += f" in category '{category}'"
        super().__init__(msg)
        self.name = name
        self.category = category


class NoDefaultModel(Exception):
    """No default AIModel is configured for the requested category."""

    def __init__(self, category: Optional[str] = None) -> None:
        msg = "No default AI model is configured"
        if category:
            msg += f" for category '{category}'"
        super().__init__(msg)
        self.category = category


class ModelFileMissing(FileNotFoundError):
    """AIModel row exists but the on-disk weight file does not."""


class ModelLoadError(RuntimeError):
    """The underlying framework (ultralytics / onnxruntime) failed to load."""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def load_model(name: str, category: Optional[str] = None):
    """
    Load and return the cached model object for the active AIModel
    identified by `name` (and optionally `category`).

    Raises ModelNotFound if no match exists.
    """
    ai_model = get_active_model_by_name(name, category=category)
    if ai_model is None:
        raise ModelNotFound(name, category)
    return _load_from_disk(ai_model)


def load_default(category: Optional[str] = None):
    """
    Load and return the active default model, optionally for a specific
    category. Raises NoDefaultModel if none is configured.
    """
    ai_model = get_default_model(category=category)
    if ai_model is None:
        raise NoDefaultModel(category)
    return _load_from_disk(ai_model)


def warm_cache(ai_models=None) -> int:
    """
    Pre-load a queryset of AIModel rows into the cache. Returns the
    number of models loaded. Useful at server start to avoid first-
    request latency.
    """
    from .models import AIModel

    qs = ai_models if ai_models is not None else AIModel.objects.filter(is_active=True)
    loaded = 0
    for m in qs:
        _load_from_disk(m)
        loaded += 1
    return loaded


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _load_from_disk(ai_model):
    """Return the cached or freshly-loaded model object for an AIModel row."""
    cached = cache.get(ai_model.pk)
    if cached is not None:
        return cached

    path = _ensure_file_exists(ai_model)
    logger.info("Loading AI model pk=%s name=%s from %s", ai_model.pk, ai_model.name, path)

    try:
        instance = _build_framework_instance(path, ai_model.weight_format)
    except Exception as exc:  # noqa: BLE001 - we want to rewrap any framework error
        raise ModelLoadError(
            f"Failed to load model {ai_model.name} v{ai_model.version}: {exc}"
        ) from exc

    cache.set(ai_model.pk, instance)
    return instance


def _ensure_file_exists(ai_model) -> str:
    path = resolve_model_path(ai_model)
    if not Path(path).is_file():
        raise ModelFileMissing(
            f"Weight file missing for AIModel pk={ai_model.pk} "
            f"name={ai_model.name}: {path}"
        )
    return path


def _build_framework_instance(path: str, weight_format: str):
    """
    Lazy import + construct the framework wrapper. Pulled out so tests
    can monkey-patch the constructor without importing ultralytics.
    """
    fmt = (weight_format or "pt").lower()

    if fmt in {"pt", "engine"}:
        from ultralytics import YOLO  # heavy import, do it here
        return YOLO(path)

    if fmt == "onnx":
        # ONNX Runtime path — only available if the package is installed.
        try:
            import onnxruntime as ort  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dep
            raise ModelLoadError(
                "onnxruntime is not installed; cannot load .onnx models."
            ) from exc
        return ort.InferenceSession(path, providers=["CPUExecutionProvider"])

    raise ModelLoadError(f"Unsupported weight format: {fmt}")


# ---------------------------------------------------------------------------
# Convenience: a tiny manifest of disk contents vs DB.
# ---------------------------------------------------------------------------


def list_orphan_files(media_root: Optional[str] = None) -> list[str]:
    """
    Return a list of files under media/models/ that are NOT referenced
    by any AIModel row. Useful for an admin "cleanup" page later.
    """
    from .models import AIModel

    root = Path(media_root or os.environ.get("MEDIA_ROOT", ""))
    if not root:
        return []
    models_dir = root / "models"
    if not models_dir.is_dir():
        return []

    referenced = {
        Path(root) / m.weight_file.name
        for m in AIModel.objects.exclude(weight_file="")
        if m.weight_file
    }
    orphans: list[str] = []
    for path in models_dir.rglob("*"):
        if path.is_file() and path not in referenced:
            orphans.append(str(path))
    return orphans
