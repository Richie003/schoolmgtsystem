from rest_framework.routers import DefaultRouter

from students import views

router = DefaultRouter()
router.register('sessions', views.AcademicSessionViewSet, basename='session')
router.register('terms', views.TermViewSet, basename='term')
router.register('classrooms', views.ClassroomViewSet, basename='classroom')
router.register('students', views.StudentViewSet, basename='student')
router.register('attendance', views.AttendanceRecordViewSet, basename='attendance')
router.register('checkouts', views.CheckoutRecordViewSet, basename='checkout')

urlpatterns = router.urls
