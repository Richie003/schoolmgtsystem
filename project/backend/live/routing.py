from django.urls import path

from .consumers import LiveStateConsumer

websocket_urlpatterns = [
    path('ws/live/player/<str:pin>/', LiveStateConsumer.as_asgi(), {'audience': 'player'}),
    path('ws/live/host/<int:session_id>/', LiveStateConsumer.as_asgi(), {'audience': 'host'}),
]
