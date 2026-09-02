"""
ASGI config for smartroadsafety project.

Routes HTTP via Django's standard URL config and WebSocket via Channels routing.
Run with: ``daphne -b 0.0.0.0 -p 8000 smartroadsafety.asgi:application``
or:       ``python manage.py runserver`` (daphne is installed; auto-detected)
"""
import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "smartroadsafety.settings")

# Initialize Django ASGI application early to populate AppRegistry.
django_asgi_app = get_asgi_application()

# Import AFTER django setup so consumers can use models
from detection.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            URLRouter(websocket_urlpatterns)
        ),
    }
)
