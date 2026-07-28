"""Tenant-scoped viewset bases.

Subclass :class:`TenantModelViewSet` for any endpoint over a
``core.models.TenantModel``. It makes cross-school access structurally
impossible rather than something each view has to remember:

* ``get_queryset`` always filters by the caller's school.
* ``perform_create`` always stamps the caller's school, ignoring any
  client-supplied ``school`` value.
* Objects outside the caller's school 404 rather than 403 — we don't confirm
  the existence of other tenants' rows.
"""

from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from accounts.models import Role
from core.permissions import IsAuthenticatedAndActiveSchool


class TenantScopedMixin:
    #: Optional dotted relation used to reach ``school`` when the model itself
    #: is not a TenantModel (e.g. Choice -> question__school).
    school_lookup = 'school'

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if user.role == Role.SUPER_ADMIN:
            school_id = self.request.query_params.get('school')
            if school_id:
                return queryset.filter(**{self.school_lookup: school_id})
            return queryset

        if not user.school_id:
            return queryset.none()
        return queryset.filter(**{self.school_lookup: user.school_id})

    def perform_create(self, serializer):
        user = self.request.user
        school_id = user.school_id

        if user.role == Role.SUPER_ADMIN:
            school_id = self.request.data.get('school') or self.request.query_params.get(
                'school'
            )
            if not school_id:
                raise PermissionDenied(
                    'Platform admins must specify a school when creating records.'
                )

        serializer.save(school_id=school_id)


class TenantModelViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticatedAndActiveSchool]


class TenantReadOnlyModelViewSet(TenantScopedMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticatedAndActiveSchool]
