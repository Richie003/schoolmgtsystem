from rest_framework.routers import DefaultRouter

from cbt import views

router = DefaultRouter()
router.register('subjects', views.SubjectViewSet, basename='subject')
router.register('question-banks', views.QuestionBankViewSet, basename='question-bank')
router.register('questions', views.QuestionViewSet, basename='question')
router.register('exams', views.ExamViewSet, basename='exam')
router.register('attempts', views.ExamAttemptViewSet, basename='attempt')

urlpatterns = router.urls
