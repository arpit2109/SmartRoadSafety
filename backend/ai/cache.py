"""
Process-local cache for loaded YOLO/ONNX model instances.

Keyed by `AIModel.pk`. Thread-safe via a single `threading.Lock` —
sufficient for `runserver` and a single-worker gunicorn setup.
For multi-worker production, swap this for a Redis-backed cache
(an LRU key + a shared "loaded" sentinel works well).
"""
from __future__ import annotations

import threading
from typing import Any, Dict, Optional


class ModelCache:
    """In-memory cache of already-loaded model objects."""

    def __init__(self) -> None:
        self._cache: Dict[int, Any] = {}
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0
        self.loads = 0

    # ----- core ops -----

    def get(self, pk: int) -> Optional[Any]:
        with self._lock:
            model = self._cache.get(pk)
            if model is not None:
                self.hits += 1
            else:
                self.misses += 1
            return model

    def set(self, pk: int, model: Any) -> None:
        with self._lock:
            if pk in self._cache:
                # Replace existing entry without bumping the load counter
                # (this is an explicit refresh, not a cold load).
                self._cache[pk] = model
                return
            self._cache[pk] = model
            self.loads += 1

    def invalidate(self, pk: int) -> bool:
        with self._lock:
            return self._cache.pop(pk, None) is not None

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self.hits = 0
            self.misses = 0
            self.loads = 0

    # ----- introspection -----

    def stats(self) -> Dict[str, int]:
        with self._lock:
            return {
                "size": len(self._cache),
                "hits": self.hits,
                "misses": self.misses,
                "loads": self.loads,
            }

    def contains(self, pk: int) -> bool:
        with self._lock:
            return pk in self._cache


# Module-level singleton — imported by loader and signals.
cache = ModelCache()
