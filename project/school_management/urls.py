from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from core.views import SchoolBrandingView, SchoolViewSet

router = DefaultRouter()
router.register('schools', SchoolViewSet, basename='school')


def health(_request):
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health, name='health'),

    path('api/auth/', include('accounts.urls')),
    path('api/school/branding/', SchoolBrandingView.as_view(), name='school-branding'),
    path('api/', include(router.urls)),          # /api/schools/ (superadmin only)
    path('api/', include('students.urls')),      # students, classrooms, attendance…
    path('api/staff/', include('staff.urls')),
    path('api/cbt/', include('cbt.urls')),
    path('api/dataio/', include('dataio.urls')),
    path('api/onboarding/', include('onboarding.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
