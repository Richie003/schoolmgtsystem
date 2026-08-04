from django.contrib.auth import password_validation
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, User
from accounts.serializers import UserSerializer
from core.models import School
from onboarding.models import (
    SchoolInvitation,
    SchoolSignupRequest,
    build_accept_url,
    generate_school_code,
)


# ---------------------------------------------------------------------------
# Public: request access
# ---------------------------------------------------------------------------

class SchoolSignupRequestCreateSerializer(serializers.ModelSerializer):
    """The public form. Accepts only the fields a requester should set."""

    class Meta:
        model = SchoolSignupRequest
        fields = [
            'school_name', 'contact_name', 'contact_email', 'contact_phone',
            'message',
        ]

    def validate_school_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('Enter the full school name.')
        return value


class SchoolSignupRequestSerializer(serializers.ModelSerializer):
    """Admin-facing view of a lead."""

    reviewed_by_name = serializers.SerializerMethodField()
    invitation_status = serializers.SerializerMethodField()

    class Meta:
        model = SchoolSignupRequest
        fields = [
            'id', 'school_name', 'contact_name', 'contact_email', 'contact_phone',
            'message', 'status', 'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'review_note', 'invitation_status', 'created_at',
        ]
        read_only_fields = fields

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.get_full_name().strip() or obj.reviewed_by.username

    def get_invitation_status(self, obj):
        invitation = obj.invitations.order_by('-created_at').first()
        return invitation.status if invitation else None


class ApproveRequestSerializer(serializers.Serializer):
    """Optional overrides when approving — otherwise the request's values stand."""

    school_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    expires_days = serializers.IntegerField(required=False, min_value=1, max_value=90)


class RejectRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


# ---------------------------------------------------------------------------
# Admin: invitations
# ---------------------------------------------------------------------------

class SchoolInvitationSerializer(serializers.ModelSerializer):
    """Never exposes the token — only its lifecycle state."""

    status = serializers.CharField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    school_code = serializers.CharField(source='school.code', read_only=True)

    class Meta:
        model = SchoolInvitation
        fields = [
            'id', 'email', 'school_name', 'status', 'request', 'created_by',
            'created_by_name', 'expires_at', 'consumed_at', 'revoked_at',
            'school', 'school_code', 'created_at',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name().strip() or obj.created_by.username


class CreateInvitationSerializer(serializers.Serializer):
    """Direct invite by a super admin, no prior request required (shape #1)."""

    email = serializers.EmailField()
    school_name = serializers.CharField(max_length=200)
    expires_days = serializers.IntegerField(
        required=False, min_value=1, max_value=90
    )


# ---------------------------------------------------------------------------
# Public: validate + accept an invitation
# ---------------------------------------------------------------------------

class InvitationPublicSerializer(serializers.Serializer):
    """What the signup page needs to render — no ids, no token."""

    email = serializers.EmailField()
    school_name = serializers.CharField()
    expires_at = serializers.DateTimeField()


class AcceptInvitationSerializer(serializers.Serializer):
    """Completes signup: creates the tenant and its first admin, atomically."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    # The school may refine the name it was invited under.
    school_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    # Optional: the school can set its logo right away, during setup.
    logo = serializers.ImageField(required=False, allow_null=True)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate_logo(self, value):
        # Mirror the 2 MB cap used by the branding endpoint.
        if value and value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError('Logo must be smaller than 2 MB.')
        return value

    @transaction.atomic
    def save(self, **kwargs):
        invitation = self.context['invitation']

        # Re-check under a row lock so a link opened twice in parallel cannot
        # create two schools from one invite.
        locked = SchoolInvitation.objects.select_for_update().get(pk=invitation.pk)
        if not locked.is_valid:
            raise serializers.ValidationError(
                'This invitation is no longer valid. Ask for a new one.'
            )

        data = self.validated_data
        school_name = (data.get('school_name') or locked.school_name).strip()

        school = School.objects.create(
            name=school_name,
            code=generate_school_code(school_name),
            email=locked.email,
            is_active=True,
            logo=data.get('logo') or None,
        )

        user = User.objects.create_user(
            username=data['username'],
            email=locked.email,
            password=data['password'],
            first_name=data['first_name'],
            last_name=data['last_name'],
            role=Role.SCHOOL_ADMIN,
            school=school,
        )

        locked.school = school
        locked.consumed_at = timezone.now()
        locked.save(update_fields=['school', 'consumed_at', 'updated_at'])

        if locked.request_id:
            SchoolSignupRequest.objects.filter(pk=locked.request_id).update(
                status=SchoolSignupRequest.Status.APPROVED
            )

        # Auto-login: hand back tokens carrying the same claims as normal login.
        refresh = RefreshToken.for_user(user)
        refresh['role'] = user.role
        refresh['school_id'] = user.school_id
        refresh['username'] = user.username

        self._result = {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        }
        return user

    @property
    def result(self):
        return self._result
