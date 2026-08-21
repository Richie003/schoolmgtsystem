"""Results & report-card API.

    /api/results/schemes/                grading schemes (admin)
    /api/results/schemes/default/        get-or-create the WAEC default
    /api/results/sheets/                 class result sheets (staff)
    /api/results/sheets/{id}/grid/       entry grid (GET)
    /api/results/sheets/{id}/scores/     bulk upsert scores (POST)
    /api/results/sheets/{id}/autofill-cbt/  fill exam column from CBT (POST)
    /api/results/sheets/{id}/submit|cumulate|review|publish|reopen|unpublish/
    /api/results/sheets/{id}/reports/    report rows for the review console (GET)
    /api/results/reports/{id}/           full report card (staff, or owning student)
    /api/results/reports/{id}/remark/    class-teacher remark + traits (PATCH)
    /api/results/reports/mine/           the student's own published reports
    /api/results/template/               report template settings (admin; edit=premium)
"""

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from core.permissions import (
    IsAuthenticatedAndActiveSchool,
    IsSchoolAdmin,
    IsStaffMember,
)
from core.viewsets import TenantModelViewSet, TenantScopedMixin
from results.models import (
    ClassResultSheet,
    GradingScheme,
    ReportTemplateSettings,
    StudentReport,
    SubjectResult,
)
from results.permissions import can_enter_scores, is_admin, owns_sheet, teaches_class
from results.serializers import (
    BulkScoreSerializer,
    ClassResultSheetSerializer,
    ComponentSerializer,
    GradingSchemeSerializer,
    ReportListSerializer,
    ReportRemarkSerializer,
    ReportTemplateSettingsSerializer,
)
from results.services import (
    autofill_cbt,
    cumulate_sheet,
    ensure_default_scheme,
    report_card_payload,
)

Status = ClassResultSheet.Status


class GradingSchemeViewSet(TenantModelViewSet):
    """Grading schemes — the marking guides. Admin only."""

    queryset = GradingScheme.objects.prefetch_related('components', 'bands')
    serializer_class = GradingSchemeSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdmin]

    @action(detail=False, methods=['get'])
    def default(self, request):
        scheme = ensure_default_scheme(request.user.school)
        return Response(self.get_serializer(scheme).data)


class ClassResultSheetViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """The per-class-per-term workflow. Staff only."""

    queryset = ClassResultSheet.objects.select_related(
        'classroom', 'term', 'session', 'scheme'
    ).prefetch_related('subjects')
    serializer_class = ClassResultSheetSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_fields = ['classroom', 'term', 'status']

    def perform_create(self, serializer):
        user = self.request.user
        classroom = serializer.validated_data['classroom']
        if not (is_admin(user) or teaches_class(user, classroom)):
            raise PermissionDenied('You are not assigned to this class.')
        scheme = serializer.validated_data.get('scheme')
        if scheme is None:
            scheme = ensure_default_scheme(user.school)
        elif scheme.school_id != user.school_id:
            raise PermissionDenied('That grading scheme belongs to another school.')
        serializer.save(school_id=user.school_id, scheme=scheme)

    # -- entry -------------------------------------------------------------
    @action(detail=True, methods=['get'])
    def grid(self, request, pk=None):
        sheet = self.get_object()
        components = list(sheet.scheme.components.all())
        subjects = list(sheet.subjects.all())
        students = list(
            sheet.classroom.students.filter(status='active')
            .order_by('last_name', 'first_name')
        )
        results = {
            (r.student_id, r.subject_id): r for r in sheet.subject_results.all()
        }
        rows = {}
        for st in students:
            rows[st.id] = {}
            for sub in subjects:
                r = results.get((st.id, sub.id))
                rows[st.id][sub.id] = {
                    'scores': (r.scores if r else {}) or {},
                    'teacher_remark': r.teacher_remark if r else '',
                }
        return Response({
            'sheet': ClassResultSheetSerializer(sheet).data,
            'components': ComponentSerializer(components, many=True).data,
            'subjects': [{'id': s.id, 'name': s.name} for s in subjects],
            'students': [
                {'id': s.id, 'name': s.full_name, 'admission_number': s.admission_number}
                for s in students
            ],
            'rows': rows,
        })

    @action(detail=True, methods=['post'])
    def scores(self, request, pk=None):
        sheet = self.get_object()
        if sheet.status != Status.OPEN:
            raise ValidationError('Results can only be edited while the sheet is open.')
        if not can_enter_scores(request.user, sheet):
            raise PermissionDenied('You cannot enter results for this class.')

        serializer = BulkScoreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        subject_ids = set(sheet.subjects.values_list('id', flat=True))
        student_ids = set(sheet.classroom.students.values_list('id', flat=True))

        saved = 0
        for row in serializer.validated_data['rows']:
            if row['subject'] not in subject_ids or row['student'] not in student_ids:
                raise ValidationError('A row references a student or subject not on this sheet.')
            defaults = {'school_id': sheet.school_id}
            if 'scores' in row:
                defaults['scores'] = row['scores']
            if 'teacher_remark' in row:
                defaults['teacher_remark'] = row['teacher_remark']
            SubjectResult.objects.update_or_create(
                sheet=sheet, student_id=row['student'], subject_id=row['subject'],
                defaults=defaults,
            )
            saved += 1
        return Response({'saved': saved})

    @action(detail=True, methods=['post'], url_path='autofill-cbt')
    def autofill_cbt(self, request, pk=None):
        sheet = self.get_object()
        if sheet.status != Status.OPEN:
            raise ValidationError('The sheet must be open to auto-fill.')
        if not can_enter_scores(request.user, sheet):
            raise PermissionDenied('You cannot enter results for this class.')
        # Ensure a row exists for every (student, subject) so there is something
        # to fill; only students who have sat a CBT get a score.
        student_ids = list(sheet.classroom.students.filter(status='active').values_list('id', flat=True))
        subject_ids = list(sheet.subjects.values_list('id', flat=True))
        existing = {(r.student_id, r.subject_id) for r in sheet.subject_results.all()}
        to_create = [
            SubjectResult(school_id=sheet.school_id, sheet=sheet,
                          student_id=sid, subject_id=subid)
            for sid in student_ids for subid in subject_ids
            if (sid, subid) not in existing
        ]
        if to_create:
            SubjectResult.objects.bulk_create(to_create)
        filled = autofill_cbt(sheet)
        return Response({'filled': filled})

    # -- transitions -------------------------------------------------------
    def _require(self, condition, message):
        if not condition:
            raise ValidationError(message)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        sheet = self.get_object()
        if not owns_sheet(request.user, sheet):
            raise PermissionDenied('Only the class teacher can submit results.')
        self._require(sheet.status == Status.OPEN, 'This sheet is not open.')
        sheet.status = Status.SUBMITTED
        sheet.submitted_by = request.user
        sheet.submitted_at = timezone.now()
        sheet.save(update_fields=['status', 'submitted_by', 'submitted_at', 'updated_at'])
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=['post'])
    def cumulate(self, request, pk=None):
        sheet = self.get_object()
        if not is_admin(request.user):
            raise PermissionDenied('Only an administrator can cumulate results.')
        self._require(
            sheet.status in (Status.SUBMITTED, Status.CUMULATED),
            'Results must be submitted before cumulating.',
        )
        cumulate_sheet(sheet, request.user)
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        sheet = self.get_object()
        if not owns_sheet(request.user, sheet):
            raise PermissionDenied('Only the class teacher can mark a sheet reviewed.')
        self._require(sheet.status == Status.CUMULATED, 'Nothing to review yet.')
        sheet.reviewed_by = request.user
        sheet.reviewed_at = timezone.now()
        sheet.save(update_fields=['reviewed_by', 'reviewed_at', 'updated_at'])
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        sheet = self.get_object()
        if not is_admin(request.user):
            raise PermissionDenied('Only an administrator can publish results.')
        self._require(sheet.status == Status.CUMULATED, 'Cumulate the results first.')
        now = timezone.now()
        sheet.status = Status.PUBLISHED
        sheet.published_at = now
        sheet.save(update_fields=['status', 'published_at', 'updated_at'])
        sheet.reports.update(published_at=now)
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        sheet = self.get_object()
        if not is_admin(request.user):
            raise PermissionDenied('Only an administrator can unpublish results.')
        self._require(sheet.status == Status.PUBLISHED, 'This sheet is not published.')
        sheet.status = Status.CUMULATED
        sheet.published_at = None
        sheet.save(update_fields=['status', 'published_at', 'updated_at'])
        sheet.reports.update(published_at=None)
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        sheet = self.get_object()
        if not is_admin(request.user):
            raise PermissionDenied('Only an administrator can reopen a sheet.')
        self._require(
            sheet.status in (Status.SUBMITTED, Status.CUMULATED),
            'Only a submitted or cumulated sheet can be reopened.',
        )
        sheet.status = Status.OPEN
        sheet.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(sheet).data)

    @action(detail=True, methods=['get'])
    def reports(self, request, pk=None):
        sheet = self.get_object()
        rows = sheet.reports.select_related('student').all()
        return Response(ReportListSerializer(rows, many=True).data)


class ReportViewSet(TenantScopedMixin, viewsets.GenericViewSet):
    """Read a full report card, edit remarks, and a student's own reports."""

    queryset = StudentReport.objects.select_related(
        'sheet__classroom', 'sheet__term', 'sheet__session', 'sheet__scheme', 'student'
    )
    serializer_class = ReportRemarkSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool]

    def get_queryset(self):
        user = self.request.user
        base = super().get_queryset()
        if user.role == Role.STUDENT:
            student = getattr(user, 'student_profile', None)
            if student is None:
                return base.none()
            return base.filter(student=student, published_at__isnull=False)
        return base

    def retrieve(self, request, pk=None):
        report = self.get_object()
        return Response(report_card_payload(report))

    @action(detail=True, methods=['patch'])
    def remark(self, request, pk=None):
        report = self.get_object()
        if not owns_sheet(request.user, report.sheet):
            raise PermissionDenied('Only the class teacher can add remarks.')
        if report.sheet.status not in (Status.CUMULATED, Status.PUBLISHED):
            raise ValidationError('Remarks can be added once results are cumulated.')
        serializer = ReportRemarkSerializer(report, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(report_card_payload(report))

    @action(detail=False, methods=['get'])
    def mine(self, request):
        if request.user.role != Role.STUDENT:
            raise PermissionDenied('Only students have personal reports here.')
        reports = self.get_queryset().order_by('-sheet__term__start_date')
        return Response(ReportListSerializer(reports, many=True).data)


class ReportTemplateView(APIView):
    """Report-card presentation. Readable by admins; editable only by premium."""

    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdmin]

    def get(self, request):
        settings_row = ReportTemplateSettings.for_school(request.user.school)
        return Response(ReportTemplateSettingsSerializer(settings_row).data)

    def patch(self, request):
        if not request.user.school.is_premium:
            return Response(
                {'detail': 'Custom report templates are a premium feature.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        settings_row = ReportTemplateSettings.for_school(request.user.school)
        serializer = ReportTemplateSettingsSerializer(
            settings_row, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
