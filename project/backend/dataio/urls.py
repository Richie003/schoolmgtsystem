from django.urls import path
from rest_framework.routers import DefaultRouter

from dataio import views

router = DefaultRouter()
router.register('imports', views.ImportJobViewSet, basename='import-job')

urlpatterns = router.urls + [
    path('exports/preview/', views.ExportPreviewView.as_view(), name='export-preview'),
    path('exports/download/', views.ExportDownloadView.as_view(), name='export-download'),
]
