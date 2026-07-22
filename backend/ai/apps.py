from django.apps import AppConfig


class AiConfig(AppConfig):
    name = "ai"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        # Importing the signals module registers the @receiver handlers.
        # Keep this import inside ready() to avoid AppRegistryNotReady
        # errors at import time.
        from . import signals  # noqa: F401
