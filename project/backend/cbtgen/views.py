"""AI question generation API.

    GET  /api/cbt-gen/options/                dropdown data + this user's status
    GET  /api/cbt-gen/settings/               school admin: read AI settings
    PATCH/api/cbt-gen/settings/               school admin: toggle + manage staff
    GET  /api/cbt-gen/jobs/                   list my (or the school's) jobs
    POST /api/cbt-gen/jobs/                   start a generation → 202 + job
    GET  /api/cbt-gen/jobs/{id}/              poll a job
    POST /api/cbt-gen/jobs/{id}/commit/       save reviewed questions to a bank
    POST /api/cbt-gen/jobs/{id}/discard/      drop a job
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from cbtgen import constants
from cbtgen.models import AIGenerationSettings, QuestionGenerationJob
from cbtgen.permissions import CanUseAIQuestionGeneration
from cbtgen.serializers import (
    AIGenerationSettingsSerializer,
    CommitSerializer,
    CreateGenerationJobSerializer,
    GenerationJobSerializer,
)
from cbtgen.tasks import run_generation_job
from core.celery_utils import dispatch
from core.permissions import IsAuthenticatedAndActiveSchool, IsSchoolAdmin


def _status_for(user):
    """Availability summary the wizard shows before letting a user generate."""
    if not user.school_id:
        return {'available': False, 'reason': 'disabled', 'remaining_trials': 0,
                'is_enabled': False, 'is_premium': False, 'plan': 'free'}
    settings_row = AIGenerationSettings.for_school(user.school)
    available, reason = settings_row.availability(user)
    return {
        'available': available,
        'reason': reason,
        'remaining_trials': settings_row.remaining_trials,
        'trial_limit': settings_row.trial_limit,
        'is_enabled': settings_row.is_enabled,
        'is_premium': user.school.is_premium,
        'plan': user.school.plan,
    }


class GenerationOptionsView(APIView):
    """Dropdown reference data plus the caller's current entitlement status."""

    permission_classes = [IsAuthenticatedAndActiveSchool, CanUseAIQuestionGeneration]

    def get(self, request):
        payload = constants.options_payload()
        payload['status'] = _status_for(request.user)
        return Response(payload)


class AIGenerationSettingsView(APIView):
    """School admin: view and change AI generation settings for the school."""

    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdmin]

    def get(self, request):
        settings_row = AIGenerationSettings.for_school(request.user.school)
        return Response(AIGenerationSettingsSerializer(settings_row).data)

    def patch(self, request):
        settings_row = AIGenerationSettings.for_school(request.user.school)
        serializer = AIGenerationSettingsSerializer(
            settings_row, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class QuestionGenerationJobViewSet(viewsets.ModelViewSet):
    """Create, poll, commit and discard generation jobs."""

    permission_classes = [IsAuthenticatedAndActiveSchool, CanUseAIQuestionGeneration]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateGenerationJobSerializer
        return GenerationJobSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.school_id:
            return QuestionGenerationJob.objects.none()
        queryset = QuestionGenerationJob.objects.filter(school_id=user.school_id)
        # Teachers only see their own jobs; admins see the whole school's.
        if user.role == Role.TEACHER:
            queryset = queryset.filter(created_by=user)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = serializer.save(school_id=request.user.school_id, created_by=request.user)

        # Off to a worker; runs inline if the broker is down (see dispatch()).
        dispatch(run_generation_job, job.id)
        # If it ran inline the row is already finished — reflect that immediately.
        job.refresh_from_db()

        return Response(
            GenerationJobSerializer(job).data, status=status.HTTP_202_ACCEPTED
        )

    @action(detail=True, methods=['post'])
    def commit(self, request, pk=None):
        job = self.get_object()
        if job.status == QuestionGenerationJob.Status.COMMITTED:
            return Response(
                {'detail': 'These questions have already been saved.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if job.status != QuestionGenerationJob.Status.READY:
            return Response(
                {'detail': 'This generation is not ready to save.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = CommitSerializer(
            data=request.data, context={'job': job, 'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.result, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def discard(self, request, pk=None):
        job = self.get_object()
        if job.status == QuestionGenerationJob.Status.COMMITTED:
            return Response(
                {'detail': 'Saved generations cannot be discarded.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        job.status = QuestionGenerationJob.Status.DISCARDED
        job.save(update_fields=['status', 'updated_at'])
        return Response({'detail': 'Generation discarded.'})
