from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Role
from core.permissions import (
    IsAuthenticatedAndActiveSchool,
    IsSchoolAdmin,
    IsSchoolAdminOrReadOnly,
    IsStaffMember,
)
from core.viewsets import TenantModelViewSet
from staff.models import Notice, Staff, StaffRole, TeacherClassAssignment
from staff.serializers import (
    NoticeSerializer,
    StaffCreateSerializer,
    StaffRoleSerializer,
    StaffSerializer,
    TeacherClassAssignmentSerializer,
)


class StaffRoleViewSet(TenantModelViewSet):
    queryset = StaffRole.objects.all()
    serializer_class = StaffRoleSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdminOrReadOnly]
    search_fields = ['name']
    filterset_fields = ['is_teaching_role']

    def get_queryset(self):
        # order_by is re-applied because annotate() drops Meta.ordering, which
        # would leave pagination unstable.
        return super().get_queryset().annotate(
            staff_count=Count('staff_members')
        ).order_by('name')


class StaffViewSet(TenantModelViewSet):
    queryset = Staff.objects.select_related('user', 'role')
    serializer_class = StaffSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_fields = ['employment_status', 'role', 'user__role']
    search_fields = [
        'user__first_name', 'user__last_name', 'user__email', 'staff_number',
    ]
    ordering_fields = ['staff_number', 'created_at', 'user__last_name']

    def get_serializer_class(self):
        if self.action == 'create':
            return StaffCreateSerializer
        return StaffSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy',
                           'deactivate'):
            return [IsAuthenticatedAndActiveSchool(), IsSchoolAdmin()]
        return super().get_permissions()

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Disable the login without deleting the historical staff record."""
        staff_member = self.get_object()
        staff_member.employment_status = Staff.EmploymentStatus.RESIGNED
        staff_member.save(update_fields=['employment_status'])
        staff_member.user.is_active = False
        staff_member.user.save(update_fields=['is_active'])
        return Response({'detail': 'Staff member deactivated.'})

    @action(detail=False, methods=['get'])
    def teachers(self, request):
        """GET /api/staff/teachers/ — teaching accounts only, for assignment UIs."""
        queryset = self.filter_queryset(
            self.get_queryset().filter(user__role=Role.TEACHER)
        )
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(
            page if page is not None else queryset, many=True
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)


class TeacherClassAssignmentViewSet(TenantModelViewSet):
    queryset = TeacherClassAssignment.objects.select_related(
        'teacher__user', 'classroom', 'session', 'term'
    )
    serializer_class = TeacherClassAssignmentSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_fields = ['teacher', 'classroom', 'session', 'term', 'is_active',
                        'is_form_teacher']
    ordering_fields = ['created_at']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticatedAndActiveSchool(), IsSchoolAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        # A teacher can inspect their own assignments but not the whole roster.
        if self.request.user.role == Role.TEACHER:
            return queryset.filter(teacher__user_id=self.request.user.id)
        return queryset

    @action(detail=False, methods=['get'], url_path='my-classes')
    def my_classes(self, request):
        """GET /api/staff/assignments/my-classes/ — the caller's active classes."""
        queryset = self.get_queryset().filter(
            teacher__user_id=request.user.id, is_active=True
        )
        return Response(self.get_serializer(queryset, many=True).data)


class NoticeViewSet(TenantModelViewSet):
    queryset = Notice.objects.select_related('assigned_to__user', 'created_by')
    serializer_class = NoticeSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]
    filterset_fields = ['priority', 'audience', 'is_completed', 'assigned_to']
    search_fields = ['title', 'body']
    ordering_fields = ['created_at', 'due_date', 'priority']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role == Role.TEACHER:
            # Teachers see notices addressed to them, plus general staff notices.
            return queryset.filter(
                Q(assigned_to__user_id=user.id)
                | Q(assigned_to__isnull=True,
                    audience__in=[Notice.Audience.ALL_STAFF, Notice.Audience.TEACHERS])
            )
        return queryset

    def get_permissions(self):
        if self.action in ('create', 'destroy'):
            return [IsAuthenticatedAndActiveSchool(), IsSchoolAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(
            school_id=self.request.user.school_id, created_by=self.request.user
        )

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark a pending assignment done. Assignee or admin only."""
        notice = self.get_object()
        user = request.user

        is_assignee = (
            notice.assigned_to_id is not None
            and notice.assigned_to.user_id == user.id
        )
        if not is_assignee and user.role not in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN):
            return Response(
                {'detail': 'Only the assignee or an admin can complete this notice.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        notice.is_completed = True
        notice.completed_at = timezone.now()
        notice.save(update_fields=['is_completed', 'completed_at'])
        return Response(self.get_serializer(notice).data)

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """GET /api/staff/notices/pending/ — the noticeboard's default view."""
        queryset = self.get_queryset().filter(is_completed=False)
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(
            page if page is not None else queryset, many=True
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
