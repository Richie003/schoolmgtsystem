from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    GameSessionViewSet,
    PlayerAnswerView,
    PlayerJoinView,
    PlayerStateView,
)

router = DefaultRouter()
router.register('sessions', GameSessionViewSet, basename='live-session')

urlpatterns = [
    path('play/<str:pin>/join/', PlayerJoinView.as_view(), name='live-join'),
    path('play/<str:pin>/state/', PlayerStateView.as_view(), name='live-state'),
    path('play/<str:pin>/answer/', PlayerAnswerView.as_view(), name='live-answer'),
    path('', include(router.urls)),
]
