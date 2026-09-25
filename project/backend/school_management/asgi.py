import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'school_management.settings')

# Initialize Django before importing consumers that may load ORM models.
django_asgi_app = get_asgi_application()

from live.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': OriginValidator(
        URLRouter(websocket_urlpatterns),
        settings.LIVE_WS_ALLOWED_ORIGINS,
    ),
})
