from django.urls import path
from rest_framework.routers import DefaultRouter

from onboarding import views

router = DefaultRouter()
router.register('requests', views.SchoolSignupRequestViewSet, basename='signup-request')
router.register('invitations', views.SchoolInvitationViewSet, basename='invitation')

urlpatterns = router.urls + [
    path('invite/<str:token>/', views.InvitationValidateView.as_view(),
         name='invite-validate'),
    path('invite/<str:token>/accept/', views.InvitationAcceptView.as_view(),
         name='invite-accept'),
]
