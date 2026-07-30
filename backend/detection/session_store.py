"""
In-process session store for live video detection.

Maps ``session_id`` → metadata. The session is created when a video file is
uploaded, and removed when processing finishes (or expires after TTL).

This is a single-process implementation. For production multi-worker
deployments, replace with a Redis-backed store.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


_TTL_SECONDS = 60 * 60  # 1 hour
_lock = threading.Lock()
_sessions: dict[str, "VideoSession"] = {}


@dataclass
class VideoSession:
    session_id: str
    user_id: int
    model_id: int
    video_path: Path
    created_at: float = field(default_factory=time.time)
    finished: bool = False

    def is_expired(self) -> bool:
        return (time.time() - self.created_at) > _TTL_SECONDS


def create_session(user_id: int, model_id: int, video_path: Path) -> VideoSession:
    """Register a new session. Returns the session object."""
    sid = uuid.uuid4().hex[:16]
    session = VideoSession(
        session_id=sid, user_id=user_id, model_id=model_id, video_path=video_path
    )
    with _lock:
        _purge_expired()
        _sessions[sid] = session
    return session


def get_session(session_id: str) -> Optional[VideoSession]:
    with _lock:
        return _sessions.get(session_id)


def has_session(session_id: str) -> bool:
    return get_session(session_id) is not None


def mark_finished(session_id: str) -> None:
    with _lock:
        s = _sessions.get(session_id)
        if s:
            s.finished = True


def remove_session(session_id: str) -> None:
    with _lock:
        _sessions.pop(session_id, None)


def _purge_expired() -> None:
    expired = [k for k, v in _sessions.items() if v.is_expired()]
    for k in expired:
        _sessions.pop(k, None)
