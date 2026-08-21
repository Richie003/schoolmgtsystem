from django.urls import include, path
from rest_framework.routers import DefaultRouter

from results.views import (
    ClassResultSheetViewSet,
    GradingSchemeViewSet,
    ReportTemplateView,
    ReportViewSet,
)

router = DefaultRouter()
router.register('schemes', GradingSchemeViewSet, basename='grading-scheme')
router.register('sheets', ClassResultSheetViewSet, basename='result-sheet')
router.register('reports', ReportViewSet, basename='student-report')

urlpatterns = [
    path('template/', ReportTemplateView.as_view(), name='report-template'),
    path('', include(router.urls)),
]
