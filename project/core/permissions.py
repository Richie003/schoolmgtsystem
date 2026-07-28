"""RBAC permission classes.

Roles (see ``accounts.models.Role``):
    super_admin  – platform operator, not bound to any school
    school_admin – full control within their own school
    teacher      – read/write limited to classes assigned to them
    student      – read/write limited to their own records
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import Role


class IsAuthenticatedAndActiveSchool(BasePermission):
    """Authenticated, and (unless superadmin) belonging to an active school."""

    message = 'This school account is inactive.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role == Role.SUPER_ADMIN:
            return True
        return bool(user.school_id and user.school.is_active)


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role == Role.SUPER_ADMIN)


class IsSchoolAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user.is_authenticated and user.role in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN)
        )


class IsTeacher(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role == Role.TEACHER)


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role == Role.STUDENT)


class IsSchoolAdminOrReadOnly(BasePermission):
    """Everyone in the school may read; only admins may write.

    Used for reference data (sessions, terms, classrooms, subjects) that
    teachers need to read constantly but must not modify.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN)


class IsStaffMember(BasePermission):
    """Admins and teachers — i.e. anyone who is not a student."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user.is_authenticated
            and user.role in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
        )


class IsStaffMemberOrReadOnlyForStudents(BasePermission):
    """Staff may write; students are limited to safe methods."""

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.role in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN, Role.TEACHER):
            return True
        return request.method in SAFE_METHODS
