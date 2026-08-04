from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import Role
from cbtgen.models import AIGenerationSettings


class CanUseAIQuestionGeneration(BasePermission):
    """Staff may read; starting a generation additionally requires entitlement.

    Entitlement = feature enabled for the school, this staff member not excluded,
    and either a premium plan or remaining free trials. The specific reason is
    surfaced to the client via the settings/status endpoint, so here we just
    allow or deny.
    """

    message = 'AI question generation is not available for your account.'

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.role not in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN, Role.TEACHER):
            return False
        # Reads (listing/inspecting jobs) are always allowed for staff.
        if request.method in SAFE_METHODS:
            return True
        if not user.school_id:
            return False
        available, reason = AIGenerationSettings.for_school(user.school).availability(user)
        if not available:
            self.message = AIGenerationSettings.Reason(reason).label
        return available
