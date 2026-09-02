# Backwards-compatible re-export.
# `CustomUserManager` now lives in `accounts.models`; this module just keeps
# the old import path (`from accounts.managers import CustomUserManager`)
# working for any code that still uses it.
from .models import CustomUserManager  # noqa: F401
