"""Onboarding API.

Public (unauthenticated):
    POST /api/onboarding/requests/                 submit an access request
    GET  /api/onboarding/invite/<token>/           validate a link (render signup)
    POST /api/onboarding/invite/<token>/accept/    complete signup → tenant + admin

Super admin only:
    GET  /api/onboarding/requests/                 review leads
    POST /api/onboarding/requests/{id}/approve/    issue + email an invitation
    POST /api/onboarding/requests/{id}/reject/
    GET/POST /api/onboarding/invitations/          list / direct-invite
    POST /api/onboarding/invitations/{id}/revoke/
    POST /api/onboarding/invitations/{id}/resend/
"""

from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from core.throttling import ResilientScopedRateThrottle
from rest_framework.views import APIView

from core.permissions import IsSuperAdmin
from onboarding.models import (
    SchoolInvitation,
    SchoolSignupRequest,
    build_accept_url,
)
from onboarding.serializers import (
    AcceptInvitationSerializer,
    ApproveRequestSerializer,
    CreateInvitationSerializer,
    InvitationPublicSerializer,
    RejectRequestSerializer,
    SchoolInvitationSerializer,
    SchoolSignupRequestCreateSerializer,
    SchoolSignupRequestSerializer,
)
from onboarding.tasks import (
    dispatch,
    send_invitation_email,
    send_request_acknowledgement_email,
    send_request_rejected_email,
)


class SchoolSignupRequestViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Public create; everything else is super-admin review."""

    queryset = SchoolSignupRequest.objects.select_related('reviewed_by')
    filterset_fields = ['status']
    search_fields = ['school_name', 'contact_email', 'contact_name']
    ordering_fields = ['created_at']

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsSuperAdmin()]

    def get_throttles(self):
        # Rate-limit only the one anonymous write in the whole API.
        if self.action == 'create':
            self.throttle_scope = 'school_signup'
            return [ResilientScopedRateThrottle()]
        return []

    def get_serializer_class(self):
        if self.action == 'create':
            return SchoolSignupRequestCreateSerializer
        return SchoolSignupRequestSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        dispatch(send_request_acknowledgement_email, instance.id)

        # Deliberately bland and identical whatever the input: never confirm or
        # deny that a given school/email already requested access.
        return Response(
            {
                'detail': 'Thank you. Your request has been received and will be '
                          'reviewed. If approved, you will get an email with a '
                          'setup link.',
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        signup = self.get_object()
        if signup.status == SchoolSignupRequest.Status.REJECTED:
            return Response(
                {'detail': 'This request was rejected. Reopen it before approving.'},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = ApproveRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        overrides = serializer.validated_data

        invitation, raw = SchoolInvitation.issue(
            email=overrides.get('email') or signup.contact_email,
            school_name=overrides.get('school_name') or signup.school_name,
            created_by=request.user,
            request=signup,
            ttl_days=overrides.get('expires_days'),
        )

        signup.status = SchoolSignupRequest.Status.APPROVED
        signup.reviewed_by = request.user
        signup.reviewed_at = timezone.now()
        signup.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'updated_at'])

        dispatch(send_invitation_email, invitation.id, build_accept_url(raw))

        return Response(
            SchoolInvitationSerializer(invitation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        signup = self.get_object()
        serializer = RejectRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        signup.status = SchoolSignupRequest.Status.REJECTED
        signup.review_note = serializer.validated_data.get('reason', '')
        signup.reviewed_by = request.user
        signup.reviewed_at = timezone.now()
        signup.save(
            update_fields=['status', 'review_note', 'reviewed_by', 'reviewed_at',
                           'updated_at']
        )

        dispatch(send_request_rejected_email, signup.id)
        return Response(SchoolSignupRequestSerializer(signup).data)


class SchoolInvitationViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Super-admin management of invitations."""

    queryset = SchoolInvitation.objects.select_related('created_by', 'school', 'request')
    serializer_class = SchoolInvitationSerializer
    permission_classes = [IsSuperAdmin]
    search_fields = ['email', 'school_name']
    ordering_fields = ['created_at', 'expires_at']

    def create(self, request, *args, **kwargs):
        serializer = CreateInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        invitation, raw = SchoolInvitation.issue(
            email=data['email'],
            school_name=data['school_name'],
            created_by=request.user,
            ttl_days=data.get('expires_days'),
        )
        dispatch(send_invitation_email, invitation.id, build_accept_url(raw))
        return Response(
            SchoolInvitationSerializer(invitation).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        invitation = self.get_object()
        if invitation.is_consumed:
            return Response(
                {'detail': 'This invitation has already been used.'},
                status=status.HTTP_409_CONFLICT,
            )
        invitation.revoke()
        return Response(SchoolInvitationSerializer(invitation).data)

    @action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        invitation = self.get_object()
        if invitation.is_consumed:
            return Response(
                {'detail': 'This invitation has already been used.'},
                status=status.HTTP_409_CONFLICT,
            )
        # Rotating invalidates the old link — a resend supersedes it.
        raw = invitation.rotate()
        dispatch(send_invitation_email, invitation.id, build_accept_url(raw))
        return Response(SchoolInvitationSerializer(invitation).data)


class InvitationValidateView(APIView):
    """GET /api/onboarding/invite/<token>/ — is this link usable?"""

    permission_classes = [AllowAny]

    def get(self, request, token):
        invitation = SchoolInvitation.find_valid(token)
        if invitation is None:
            return Response(
                {'detail': 'This invitation link is invalid, used or expired.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(InvitationPublicSerializer(invitation).data)


class InvitationAcceptView(APIView):
    """POST /api/onboarding/invite/<token>/accept/ — create the tenant + admin."""

    permission_classes = [AllowAny]
    throttle_scope = 'invite_accept'
    throttle_classes = [ResilientScopedRateThrottle]
    # Accept multipart (so an optional logo file can ride along) as well as JSON.
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, token):
        invitation = SchoolInvitation.find_valid(token)
        if invitation is None:
            return Response(
                {'detail': 'This invitation link is invalid, used or expired.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = AcceptInvitationSerializer(
            data=request.data, context={'invitation': invitation}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.result, status=status.HTTP_201_CREATED)
