from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from core.models import School
from core.permissions import IsAuthenticatedAndActiveSchool, IsSuperAdmin
from core.serializers import SchoolBrandingSerializer, SchoolSerializer


class SchoolViewSet(viewsets.ModelViewSet):
    """Platform-level tenant management. Superadmins only.

    Deliberately NOT tenant-scoped — this is the one endpoint that operates
    across schools, which is why it carries the strictest permission class.
    """

    queryset = School.objects.all()
    serializer_class = SchoolSerializer
    permission_classes = [IsSuperAdmin]
    search_fields = ['name', 'code', 'email']
    filterset_fields = ['is_active']
    ordering_fields = ['name', 'created_at']


class SchoolBrandingView(APIView):
    """GET/PATCH /api/school/branding/ — the caller's own school appearance.

    Every authenticated member of a school may READ it, because the SPA themes
    itself from these values for students and teachers alike. Only a school
    admin may change them.
    """

    permission_classes = [IsAuthenticatedAndActiveSchool]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_school(self, request):
        school = request.user.school
        if school is None:
            # A platform superadmin has no school of their own to brand.
            return None
        return school

    def get(self, request):
        school = self.get_school(request)
        if school is None:
            return Response(
                {'detail': 'Platform admins are not attached to a school.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(SchoolBrandingSerializer(school).data)

    def patch(self, request):
        school = self.get_school(request)
        if school is None:
            return Response(
                {'detail': 'Platform admins are not attached to a school.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if request.user.role not in (Role.SCHOOL_ADMIN, Role.SUPER_ADMIN):
            return Response(
                {'detail': 'Only a school administrator can change branding.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SchoolBrandingSerializer(
            school, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
