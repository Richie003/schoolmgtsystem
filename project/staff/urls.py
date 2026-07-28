from rest_framework.routers import DefaultRouter

from staff import views

router = DefaultRouter()
router.register('roles', views.StaffRoleViewSet, basename='staff-role')
router.register('assignments', views.TeacherClassAssignmentViewSet,
                basename='class-assignment')
router.register('notices', views.NoticeViewSet, basename='notice')
router.register('', views.StaffViewSet, basename='staff')

urlpatterns = router.urls
