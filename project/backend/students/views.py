from django.db.models import Count, Q
from django_filters import rest_framework as filters
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.models import Role
from core.permissions import (
    IsAuthenticatedAndActiveSchool,
    IsSchoolAdmin,
    IsSchoolAdminOrReadOnly,
    IsStaffMember,
)
from core.viewsets import TenantModelViewSet
from students.models import (
    AcademicSession,
    AttendanceRecord,
    CheckoutRecord,
    Classroom,
    Student,
    Term,
)
from students.serializers import (
    AcademicSessionSerializer,
    AttendanceBulkMarkSerializer,
    AttendanceRecordSerializer,
    CheckoutRecordSerializer,
    ClassroomSerializer,
    StudentAccountSerializer,
    StudentSerializer,
    TermSerializer,
)


def teacher_classroom_ids(user):
    """Classroom ids a teacher is assigned to. Imported lazily to avoid a cycle."""
    from staff.models import TeacherClassAssignment

    return TeacherClassAssignment.objects.filter(
        school_id=user.school_id, teacher__user_id=user.id, is_active=True
    ).values_list('classroom_id', flat=True)


class ClassRestrictedMixin:
    """Narrows a queryset to the classes a teacher owns, or a student's own row.

    Admins see the whole school. This is applied *after* the tenant filter in
    ``TenantScopedMixin``, so it composes rather than replaces isolation.
    """

    #: Query path from the model to Classroom.
    classroom_path = 'classroom'
    #: Query path from the model to Student, for the student-role restriction.
    student_path = 'student'

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN):
            return queryset

        if user.role == Role.TEACHER:
            return queryset.filter(
                **{f'{self.classroom_path}__in': teacher_classroom_ids(user)}
            )

        if user.role == Role.STUDENT:
            return queryset.filter(**{f'{self.student_path}__user_id': user.id})

        return queryset.none()


class AcademicSessionViewSet(TenantModelViewSet):
    queryset = AcademicSession.objects.all()
    serializer_class = AcademicSessionSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdminOrReadOnly]
    filterset_fields = ['is_current']
    search_fields = ['name']
    ordering_fields = ['start_date', 'name']


class TermViewSet(TenantModelViewSet):
    queryset = Term.objects.select_related('session')
    serializer_class = TermSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdminOrReadOnly]
    filterset_fields = ['session', 'is_current']
    search_fields = ['name']
    ordering_fields = ['start_date', 'name']

    @action(detail=False, methods=['get'])
    def current(self, request):
        """GET /api/terms/current/ — the active term + session for this school."""
        term = self.get_queryset().filter(is_current=True).first()
        if term is None:
            return Response(
                {'detail': 'No current term has been set for this school.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self.get_serializer(term).data)


class ClassroomViewSet(TenantModelViewSet):
    queryset = Classroom.objects.all()
    serializer_class = ClassroomSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdminOrReadOnly]
    filterset_fields = ['is_active', 'name']
    search_fields = ['name', 'arm']
    ordering_fields = ['name', 'arm']

    def get_queryset(self):
        # annotate() introduces a GROUP BY, which makes Django drop the model's
        # Meta.ordering. Re-apply it explicitly or pagination becomes unstable —
        # rows can repeat or disappear between pages.
        queryset = super().get_queryset().annotate(
            student_count=Count(
                'students', filter=Q(students__status=Student.Status.ACTIVE)
            )
        ).order_by('name', 'arm')
        user = self.request.user
        # Teachers only see the classes they actually teach.
        if user.role == Role.TEACHER:
            return queryset.filter(id__in=teacher_classroom_ids(user))
        return queryset

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        """GET /api/classrooms/{id}/students/ — the class register."""
        classroom = self.get_object()
        students = (
            Student.objects.filter(
                school_id=request.user.school_id,
                classroom=classroom,
                status=Student.Status.ACTIVE,
            )
            .select_related('classroom')
            .order_by('last_name', 'first_name')
        )
        page = self.paginate_queryset(students)
        serializer = StudentSerializer(
            page if page is not None else students, many=True,
            context=self.get_serializer_context(),
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)


class StudentFilter(filters.FilterSet):
    classroom_name = filters.CharFilter(
        field_name='classroom__name', lookup_expr='iexact'
    )

    class Meta:
        model = Student
        fields = ['classroom', 'status', 'gender', 'classroom_name']


class StudentViewSet(TenantModelViewSet):
    queryset = Student.objects.select_related('classroom', 'user')
    serializer_class = StudentSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool]
    filterset_class = StudentFilter
    search_fields = ['first_name', 'last_name', 'admission_number', 'parent_name']
    ordering_fields = ['last_name', 'first_name', 'admission_number', 'created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role == Role.TEACHER:
            return queryset.filter(classroom__in=teacher_classroom_ids(user))
        if user.role == Role.STUDENT:
            # A student may read exactly one student record: their own.
            return queryset.filter(user_id=user.id)
        return queryset

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy',
                           'create_account'):
            return [IsAuthenticatedAndActiveSchool(), IsSchoolAdmin()]
        return super().get_permissions()

    @action(detail=True, methods=['post'], url_path='create-account')
    def create_account(self, request, pk=None):
        """POST /api/students/{id}/create-account/ — provision a CBT login."""
        student = self.get_object()
        serializer = StudentAccountSerializer(
            data=request.data, context={'request': request, 'student': student}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {'id': user.id, 'username': user.username, 'role': user.role},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()
        by_status = dict(
            queryset.values_list('status').annotate(n=Count('id'))
        )
        return Response(
            {
                'total': queryset.count(),
                'active': by_status.get(Student.Status.ACTIVE, 0),
                'graduated': by_status.get(Student.Status.GRADUATED, 0),
                'withdrawn': by_status.get(Student.Status.WITHDRAWN, 0),
                'by_gender': dict(
                    queryset.values_list('gender').annotate(n=Count('id'))
                ),
                'classrooms': Classroom.objects.filter(
                    school_id=request.user.school_id, is_active=True
                ).count(),
            }
        )


class AttendanceFilter(filters.FilterSet):
    date_from = filters.DateFilter(field_name='date', lookup_expr='gte')
    date_to = filters.DateFilter(field_name='date', lookup_expr='lte')

    class Meta:
        model = AttendanceRecord
        fields = ['student', 'classroom', 'term', 'session', 'status', 'date']


class AttendanceRecordViewSet(ClassRestrictedMixin, TenantModelViewSet):
    queryset = AttendanceRecord.objects.select_related('student', 'classroom', 'term')
    serializer_class = AttendanceRecordSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool]
    filterset_class = AttendanceFilter
    search_fields = ['student__first_name', 'student__last_name',
                     'student__admission_number']
    ordering_fields = ['date', 'created_at']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy',
                           'bulk_mark'):
            return [IsAuthenticatedAndActiveSchool(), IsStaffMember()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(
            school_id=self.request.user.school_id, marked_by=self.request.user
        )

    @action(detail=False, methods=['post'], url_path='bulk-mark')
    def bulk_mark(self, request):
        """POST /api/attendance/bulk-mark/ — mark a full class for one day."""
        serializer = AttendanceBulkMarkSerializer(
            data=request.data, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        classroom = serializer.validated_data.get('classroom')
        if request.user.role == Role.TEACHER and classroom is not None:
            if classroom.id not in set(teacher_classroom_ids(request.user)):
                raise PermissionDenied('You are not assigned to this class.')

        records = serializer.save()
        return Response(
            {'marked': len(records), 'date': serializer.validated_data['date']},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Per-status counts for the current filter selection."""
        queryset = self.filter_queryset(self.get_queryset())
        counts = dict(queryset.values_list('status').annotate(n=Count('id')))
        total = sum(counts.values())
        present = counts.get(AttendanceRecord.Status.PRESENT, 0)
        return Response(
            {
                'total': total,
                'present': present,
                'absent': counts.get(AttendanceRecord.Status.ABSENT, 0),
                'late': counts.get(AttendanceRecord.Status.LATE, 0),
                'excused': counts.get(AttendanceRecord.Status.EXCUSED, 0),
                'attendance_rate': round(present / total * 100, 2) if total else 0.0,
            }
        )


class CheckoutFilter(filters.FilterSet):
    date_from = filters.DateFilter(field_name='date', lookup_expr='gte')
    date_to = filters.DateFilter(field_name='date', lookup_expr='lte')

    class Meta:
        model = CheckoutRecord
        fields = ['student', 'classroom', 'term', 'session', 'date']


class CheckoutRecordViewSet(ClassRestrictedMixin, TenantModelViewSet):
    queryset = CheckoutRecord.objects.select_related('student', 'classroom', 'term')
    serializer_class = CheckoutRecordSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool]
    filterset_class = CheckoutFilter
    search_fields = ['student__first_name', 'student__last_name', 'released_to']
    ordering_fields = ['date', 'checked_out_at']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticatedAndActiveSchool(), IsStaffMember()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(
            school_id=self.request.user.school_id, recorded_by=self.request.user
        )
