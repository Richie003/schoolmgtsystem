from django.contrib.auth import password_validation
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from accounts.models import Role, User
from staff.models import Notice, Staff, StaffRole, TeacherClassAssignment
from students.serializers import TenantValidatedSerializer


class StaffRoleSerializer(serializers.ModelSerializer):
    staff_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = StaffRole
        fields = ['id', 'name', 'description', 'is_teaching_role', 'staff_count']
        read_only_fields = ['id', 'staff_count']


class StaffSerializer(TenantValidatedSerializer):
    tenant_fields = ('role',)

    full_name = serializers.CharField(read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    account_role = serializers.CharField(source='user.role', read_only=True)
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)
    role_name = serializers.CharField(source='role.name', read_only=True)

    class Meta:
        model = Staff
        fields = [
            'id', 'user', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'account_role', 'is_active', 'staff_number', 'role', 'role_name', 'phone',
            'qualification', 'specialisation', 'date_employed', 'employment_status',
            'created_at',
        ]
        read_only_fields = ['id', 'user', 'created_at']


class StaffCreateSerializer(TenantValidatedSerializer):
    """Creates the User account and Staff profile together.

    Admins should not have to make two calls (and risk an orphaned account) to
    onboard a teacher.
    """

    tenant_fields = ('role',)

    username = serializers.CharField(max_length=150, write_only=True)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True, write_only=True)
    first_name = serializers.CharField(max_length=150, write_only=True)
    last_name = serializers.CharField(max_length=150, write_only=True)
    account_role = serializers.ChoiceField(
        choices=[(Role.TEACHER, 'Teacher'), (Role.SCHOOL_ADMIN, 'School Admin')],
        default=Role.TEACHER,
        write_only=True,
    )

    class Meta:
        model = Staff
        fields = [
            'id', 'username', 'password', 'email', 'first_name', 'last_name',
            'account_role', 'staff_number', 'role', 'phone', 'qualification',
            'specialisation', 'date_employed', 'employment_status',
        ]
        read_only_fields = ['id']

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate_staff_number(self, value):
        value = value.strip()
        school_id = self._school()
        if Staff.objects.filter(
            school_id=school_id, staff_number__iexact=value
        ).exists():
            raise serializers.ValidationError(
                'A staff member with this number already exists.'
            )
        return value

    @transaction.atomic
    def create(self, validated_data):
        school_id = validated_data.get('school_id') or self._school()

        user = User.objects.create_user(
            username=validated_data.pop('username'),
            email=validated_data.pop('email', ''),
            password=validated_data.pop('password'),
            first_name=validated_data.pop('first_name'),
            last_name=validated_data.pop('last_name'),
            role=validated_data.pop('account_role'),
            school_id=school_id,
        )
        validated_data['school_id'] = school_id
        return Staff.objects.create(user=user, **validated_data)

    def to_representation(self, instance):
        return StaffSerializer(instance, context=self.context).data


class TeacherClassAssignmentSerializer(TenantValidatedSerializer):
    tenant_fields = ('teacher', 'classroom', 'session', 'term')

    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    classroom_name = serializers.CharField(source='classroom.full_name', read_only=True)
    session_name = serializers.CharField(source='session.name', read_only=True)
    term_name = serializers.CharField(source='term.name', read_only=True)

    class Meta:
        model = TeacherClassAssignment
        fields = [
            'id', 'teacher', 'teacher_name', 'classroom', 'classroom_name',
            'session', 'session_name', 'term', 'term_name', 'is_form_teacher',
            'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        teacher = attrs.get('teacher', getattr(self.instance, 'teacher', None))
        term = attrs.get('term', getattr(self.instance, 'term', None))
        session = attrs.get('session', getattr(self.instance, 'session', None))

        if teacher and teacher.user.role not in (Role.TEACHER, Role.SCHOOL_ADMIN):
            raise serializers.ValidationError(
                {'teacher': 'Only teacher or admin accounts can be assigned to classes.'}
            )
        if term and session and term.session_id != session.id:
            raise serializers.ValidationError(
                {'term': 'Term does not belong to the selected session.'}
            )
        return attrs


class NoticeSerializer(TenantValidatedSerializer):
    tenant_fields = ('assigned_to',)

    assigned_to_name = serializers.CharField(
        source='assigned_to.full_name', read_only=True
    )
    created_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = [
            'id', 'title', 'body', 'priority', 'audience', 'assigned_to',
            'assigned_to_name', 'due_date', 'is_completed', 'completed_at',
            'is_overdue', 'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'completed_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name().strip() or obj.created_by.username

    def get_is_overdue(self, obj):
        if obj.is_completed or not obj.due_date:
            return False
        return obj.due_date < timezone.localdate()
