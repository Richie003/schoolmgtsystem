from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import Role, User
from core.serializers import SchoolSummarySerializer


class SchoolTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Embed role and tenant in the JWT so the SPA can route without a round-trip.

    The claims are convenience only — the backend re-reads role and school from
    the database on every request and never trusts these values for access
    control.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['school_id'] = user.school_id
        token['username'] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user

        if user.school is not None and not user.school.is_active:
            raise serializers.ValidationError('This school account is inactive.')

        data['user'] = UserSerializer(user).data
        return data


class UserSerializer(serializers.ModelSerializer):
    school = SchoolSummarySerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'phone', 'avatar', 'school', 'is_active', 'date_joined',
        ]
        read_only_fields = ['id', 'date_joined', 'school', 'role']

    def get_full_name(self, obj):
        return obj.get_full_name().strip() or obj.username


class UserWriteSerializer(serializers.ModelSerializer):
    """Used by admins to create staff/student accounts within their school."""

    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'phone', 'password', 'is_active',
        ]

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate_role(self, value):
        # Only the platform itself mints super admins; a school admin creating
        # one would be a privilege-escalation hole.
        if value == Role.SUPER_ADMIN:
            raise serializers.ValidationError(
                'Super admin accounts cannot be created through this endpoint.'
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context['request'].user)
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user
