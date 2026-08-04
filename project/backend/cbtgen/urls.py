from django.urls import include, path
from rest_framework.routers import DefaultRouter

from cbtgen.views import (
    AIGenerationSettingsView,
    GenerationOptionsView,
    QuestionGenerationJobViewSet,
)

router = DefaultRouter()
router.register('jobs', QuestionGenerationJobViewSet, basename='generation-job')

urlpatterns = [
    path('options/', GenerationOptionsView.as_view(), name='ai-generation-options'),
    path('settings/', AIGenerationSettingsView.as_view(), name='ai-generation-settings'),
    path('', include(router.urls)),
]
