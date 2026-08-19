from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from django_filters import rest_framework as filters
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Role
from cbt.models import (
    Exam,
    ExamAttempt,
    Question,
    QuestionBank,
    StudentAnswer,
    Subject,
)
from cbt.serializers import (
    AttemptQuestionSerializer,
    AttemptResultSerializer,
    BulkSaveAnswersSerializer,
    ExamAttemptSerializer,
    ExamSerializer,
    ExamStudentSerializer,
    QuestionBankSerializer,
    QuestionImageSerializer,
    QuestionSerializer,
    SaveAnswerSerializer,
    SubjectSerializer,
)
from cbt.services import finalise_attempt, save_answer, start_attempt
from core.permissions import (
    IsAuthenticatedAndActiveSchool,
    IsSchoolAdmin,
    IsSchoolAdminOrReadOnly,
    IsStaffMember,
)
from core.viewsets import TenantModelViewSet


def get_student_profile(user):
    """The Student row behind a student login, or 403."""
    student = getattr(user, 'student_profile', None)
    if student is None:
        raise PermissionDenied('This account is not linked to a student record.')
    return student


class SubjectViewSet(TenantModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdminOrReadOnly]
    filterset_fields = ['is_active']
    search_fields = ['name', 'code']


class QuestionBankViewSet(TenantModelViewSet):
    queryset = QuestionBank.objects.select_related('subject')
    serializer_class = QuestionBankSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_fields = ['subject', 'is_active']
    search_fields = ['name', 'subject__name']

    def get_queryset(self):
        # Re-apply ordering: annotate() drops Meta.ordering and unordered
        # pagination can repeat or skip rows.
        return super().get_queryset().annotate(
            question_count=Count('questions', filter=Q(questions__is_active=True))
        ).order_by('subject__name', 'name')

    def perform_create(self, serializer):
        serializer.save(
            school_id=self.request.user.school_id, created_by=self.request.user
        )


class QuestionFilter(filters.FilterSet):
    subject = filters.NumberFilter(field_name='bank__subject_id')

    class Meta:
        model = Question
        fields = ['bank', 'difficulty', 'is_active', 'subject']


class QuestionViewSet(TenantModelViewSet):
    """Question authoring. Staff only — the payload includes answer keys."""

    queryset = Question.objects.select_related('bank__subject').prefetch_related('choices')
    serializer_class = QuestionSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_class = QuestionFilter
    search_fields = ['text']

    def perform_create(self, serializer):
        serializer.save(
            school_id=self.request.user.school_id, created_by=self.request.user
        )

    @action(
        detail=True,
        methods=['post', 'delete'],
        parser_classes=[MultiPartParser, FormParser],
    )
    def image(self, request, pk=None):
        """Attach or remove a question's image.

        Kept separate from create/update so the image can be sent as multipart,
        without having to serialise the nested choices into form fields.
        """
        question = self.get_object()

        if request.method == 'DELETE':
            if question.image:
                question.image.delete(save=False)
                question.image = None
                question.save(update_fields=['image', 'updated_at'])
        else:
            serializer = QuestionImageSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            question.image = serializer.validated_data['image']
            question.save(update_fields=['image', 'updated_at'])

        return Response(
            QuestionSerializer(question, context=self.get_serializer_context()).data
        )


class ExamViewSet(TenantModelViewSet):
    queryset = Exam.objects.select_related('subject', 'bank', 'term', 'session')
    serializer_class = ExamSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_fields = ['subject', 'term', 'session', 'status']
    search_fields = ['title', 'subject__name']
    ordering_fields = ['starts_at', 'created_at', 'title']

    def get_queryset(self):
        # See QuestionBankViewSet — annotate() drops Meta.ordering.
        return super().get_queryset().annotate(
            attempt_count=Count('attempts')
        ).order_by('-starts_at')

    def get_permissions(self):
        if self.action in ('destroy',):
            return [IsAuthenticatedAndActiveSchool(), IsSchoolAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(
            school_id=self.request.user.school_id, created_by=self.request.user
        )

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        exam = self.get_object()
        available = exam.available_question_count
        if available < exam.question_count:
            raise ValidationError(
                f'Cannot publish: the bank holds {available} active question(s) '
                f'but the exam draws {exam.question_count}.'
            )
        exam.status = Exam.Status.PUBLISHED
        exam.save(update_fields=['status'])
        return Response(self.get_serializer(exam).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        exam = self.get_object()
        exam.status = Exam.Status.CLOSED
        exam.save(update_fields=['status'])
        return Response(self.get_serializer(exam).data)

    @action(detail=True, methods=['get'])
    def results(self, request, pk=None):
        """GET /api/cbt/exams/{id}/results/ — the full mark sheet for staff."""
        exam = self.get_object()
        attempts = (
            ExamAttempt.objects.filter(exam=exam)
            .exclude(status=ExamAttempt.Status.IN_PROGRESS)
            .select_related('student')
            .order_by('-percentage')
        )
        summary = attempts.aggregate(
            average=Avg('percentage'),
            passed=Count('id', filter=Q(is_passed=True)),
            total=Count('id'),
        )
        page = self.paginate_queryset(attempts)
        serializer = ExamAttemptSerializer(
            page if page is not None else attempts, many=True
        )
        payload = {
            'summary': {
                'average_percentage': round(float(summary['average'] or 0), 2),
                'passed': summary['passed'],
                'attempts': summary['total'],
            },
        }
        if page is not None:
            response = self.get_paginated_response(serializer.data)
            response.data.update(payload)
            return response
        payload['results'] = serializer.data
        return Response(payload)

    @action(
        detail=False, methods=['get'], url_path='available',
        permission_classes=[IsAuthenticatedAndActiveSchool],
    )
    def available(self, request):
        """GET /api/cbt/exams/available/ — exams this student may sit."""
        if request.user.role != Role.STUDENT:
            raise PermissionDenied('This endpoint is for student accounts.')

        student = get_student_profile(request.user)
        exams = (
            Exam.objects.filter(
                school_id=student.school_id, status=Exam.Status.PUBLISHED
            )
            .filter(Q(classrooms__isnull=True) | Q(classrooms=student.classroom_id))
            .select_related('subject')
            .distinct()
            .order_by('starts_at')
        )

        used = dict(
            ExamAttempt.objects.filter(student=student)
            .exclude(status=ExamAttempt.Status.IN_PROGRESS)
            .values_list('exam_id')
            .annotate(n=Count('id'))
        )
        for exam in exams:
            exam.attempts_used = used.get(exam.id, 0)

        return Response(ExamStudentSerializer(exams, many=True).data)


class ExamAttemptViewSet(TenantModelViewSet):
    """The student-facing exam runner, plus staff read access to attempts."""

    queryset = ExamAttempt.objects.select_related('exam', 'student')
    serializer_class = ExamAttemptSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool]
    filterset_fields = ['exam', 'student', 'status']
    ordering_fields = ['started_at', 'percentage']
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role == Role.STUDENT:
            # A student can only ever see their own attempts.
            return queryset.filter(student__user_id=user.id)
        if user.role == Role.TEACHER:
            from students.views import teacher_classroom_ids

            return queryset.filter(
                Q(exam__created_by_id=user.id)
                | Q(student__classroom__in=teacher_classroom_ids(user))
            )
        return queryset

    @action(detail=False, methods=['post'])
    def start(self, request):
        """POST /api/cbt/attempts/start/ {exam} -> attempt + first paper."""
        if request.user.role != Role.STUDENT:
            raise PermissionDenied('Only students can sit exams.')

        exam_id = request.data.get('exam')
        if not exam_id:
            raise ValidationError({'exam': 'This field is required.'})

        student = get_student_profile(request.user)
        exam = get_object_or_404(Exam, pk=exam_id, school_id=student.school_id)

        attempt = start_attempt(exam, student)
        return Response(
            self._attempt_payload(attempt), status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['get'])
    def paper(self, request, pk=None):
        """GET /api/cbt/attempts/{id}/paper/ — resume an in-progress attempt."""
        attempt = self.get_object()
        if request.user.role == Role.STUDENT and attempt.student.user_id != request.user.id:
            raise PermissionDenied('This attempt does not belong to you.')
        return Response(self._attempt_payload(attempt))

    @action(detail=True, methods=['post'], url_path='save-answer')
    def save_answer_action(self, request, pk=None):
        """POST /api/cbt/attempts/{id}/save-answer/ — auto-save a single answer."""
        attempt = self._own_attempt(request, pk)

        serializer = SaveAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        save_answer(
            attempt,
            serializer.validated_data['question'],
            serializer.validated_data['selection'],
        )
        return Response(
            {'saved': True, 'seconds_remaining': attempt.seconds_remaining}
        )

    @action(detail=True, methods=['post'], url_path='save-answers')
    def save_answers_bulk(self, request, pk=None):
        """Batched auto-save — used to flush a queue after a connection drop."""
        attempt = self._own_attempt(request, pk)

        serializer = BulkSaveAnswersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        saved = 0
        for entry in serializer.validated_data['answers']:
            save_answer(attempt, entry['question'], entry['selection'])
            saved += 1

        return Response(
            {'saved': saved, 'seconds_remaining': attempt.seconds_remaining}
        )

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """POST /api/cbt/attempts/{id}/submit/ — grade and close."""
        attempt = self._own_attempt(request, pk, allow_expired=True)
        finished = finalise_attempt(attempt, auto=False)
        return Response(
            AttemptResultSerializer(
                finished, context={'is_staff': request.user.role != Role.STUDENT}
            ).data
        )

    @action(detail=True, methods=['get'])
    def result(self, request, pk=None):
        attempt = self.get_object()
        if request.user.role == Role.STUDENT:
            if attempt.student.user_id != request.user.id:
                raise PermissionDenied('This attempt does not belong to you.')
            if attempt.status == ExamAttempt.Status.IN_PROGRESS:
                raise ValidationError('This attempt has not been submitted yet.')

        return Response(
            AttemptResultSerializer(
                attempt, context={'is_staff': request.user.role != Role.STUDENT}
            ).data
        )

    @action(detail=True, methods=['get'])
    def timer(self, request, pk=None):
        """Lightweight poll so the client can resync its countdown."""
        attempt = self.get_object()
        return Response(
            {
                'attempt': attempt.id,
                'status': attempt.status,
                'expires_at': attempt.expires_at,
                'seconds_remaining': attempt.seconds_remaining,
            }
        )

    # -- helpers ---------------------------------------------------------

    def _own_attempt(self, request, pk, allow_expired=False):
        attempt = self.get_object()
        if request.user.role != Role.STUDENT:
            raise PermissionDenied('Only the sitting student can modify an attempt.')
        if attempt.student.user_id != request.user.id:
            raise PermissionDenied('This attempt does not belong to you.')
        if not allow_expired and attempt.status != ExamAttempt.Status.IN_PROGRESS:
            raise ValidationError('This attempt has already been submitted.')
        return attempt

    def _attempt_payload(self, attempt):
        """Serialise the attempt together with its personalised paper."""
        questions = list(
            Question.objects.filter(id__in=attempt.question_order)
            .prefetch_related('choices')
        )
        position = {qid: i for i, qid in enumerate(attempt.question_order)}
        questions.sort(key=lambda q: position.get(q.id, 9999))

        # question_id -> [choice_id, ...], so the runner can restore a
        # multi-answer selection on resume.
        answers = {}
        for answer in StudentAnswer.objects.filter(
            attempt=attempt
        ).prefetch_related('selected_choices'):
            answers[answer.question_id] = [c.id for c in answer.selected_choices.all()]

        return {
            'attempt': ExamAttemptSerializer(attempt).data,
            'exam': {
                'id': attempt.exam_id,
                'title': attempt.exam.title,
                'instructions': attempt.exam.instructions,
                'duration_minutes': attempt.exam.duration_minutes,
            },
            'questions': AttemptQuestionSerializer(
                questions,
                many=True,
                context={
                    'choice_order': attempt.choice_order or {},
                    'answers': answers,
                },
            ).data,
        }
