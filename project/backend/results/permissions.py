"""Role helpers for the results workflow.

The class teacher — the form teacher of a class (``TeacherClassAssignment``
with ``is_form_teacher``) — owns submitting, reviewing and remarking. Any
teacher assigned to the class may enter scores. Admins may do everything.
"""

from accounts.models import Role
from staff.models import TeacherClassAssignment


def is_admin(user):
    return user.role in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN)


def _staff(user):
    return getattr(user, 'staff_profile', None)


def teaches_class(user, classroom):
    staff = _staff(user)
    if staff is None:
        return False
    return TeacherClassAssignment.objects.filter(
        teacher=staff, classroom=classroom, is_active=True
    ).exists()


def is_form_teacher(user, classroom):
    staff = _staff(user)
    if staff is None:
        return False
    return TeacherClassAssignment.objects.filter(
        teacher=staff, classroom=classroom, is_active=True, is_form_teacher=True
    ).exists()


def can_enter_scores(user, sheet):
    """Enter/auto-fill scores while a sheet is open."""
    return is_admin(user) or teaches_class(user, sheet.classroom)


def owns_sheet(user, sheet):
    """Submit, review, and add remarks — the class teacher (or an admin)."""
    return is_admin(user) or is_form_teacher(user, sheet.classroom)
