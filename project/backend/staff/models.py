from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from core.models import TenantModel
from students.models import AcademicSession, Classroom, Term


class StaffRole(TenantModel):
    """A named job title within a school, e.g. "Head of Science".

    This is descriptive HR metadata and is deliberately separate from
    ``accounts.Role``, which is the security-relevant enum that drives
    permissions. Letting schools invent their own permission levels would make
    authorisation unauditable.
    """

    name = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    is_teaching_role = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'], name='unique_staff_role_per_school'
            ),
        ]

    def __str__(self):
        return self.name


class Staff(TenantModel):
    class EmploymentStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        ON_LEAVE = 'on_leave', 'On Leave'
        RESIGNED = 'resigned', 'Resigned'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='staff_profile',
    )
    staff_number = models.CharField(max_length=50, db_index=True)
    role = models.ForeignKey(
        StaffRole,
        on_delete=models.SET_NULL,
        related_name='staff_members',
        null=True,
        blank=True,
    )
    phone = models.CharField(max_length=30, blank=True)
    qualification = models.CharField(max_length=200, blank=True)
    specialisation = models.CharField(max_length=200, blank=True)
    date_employed = models.DateField(null=True, blank=True)
    employment_status = models.CharField(
        max_length=20,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE,
        db_index=True,
    )

    class Meta:
        ordering = ['user__last_name', 'user__first_name']
        verbose_name_plural = 'staff'
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'staff_number'], name='unique_staff_number_per_school'
            ),
        ]
        indexes = [models.Index(fields=['school', 'employment_status'])]

    def __str__(self):
        return f'{self.full_name} ({self.staff_number})'

    @property
    def full_name(self):
        return self.user.get_full_name().strip() or self.user.username

    def clean(self):
        if self.user_id and self.user.school_id != self.school_id:
            raise ValidationError({'user': 'User account belongs to a different school.'})
        if self.role_id and self.role.school_id != self.school_id:
            raise ValidationError({'role': 'Role belongs to a different school.'})


class TeacherClassAssignment(TenantModel):
    """Binds a teacher to a class for a session/term.

    This table *is* the teacher authorisation boundary: everything a teacher may
    see about students, attendance, and checkouts is derived from the rows here.
    """

    teacher = models.ForeignKey(
        Staff, on_delete=models.CASCADE, related_name='class_assignments'
    )
    classroom = models.ForeignKey(
        Classroom, on_delete=models.CASCADE, related_name='teacher_assignments'
    )
    session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name='teacher_assignments'
    )
    term = models.ForeignKey(
        Term,
        on_delete=models.CASCADE,
        related_name='teacher_assignments',
        null=True,
        blank=True,
        help_text='Leave blank for an assignment that spans the whole session.',
    )
    is_form_teacher = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ['classroom__name', 'classroom__arm']
        constraints = [
            models.UniqueConstraint(
                fields=['teacher', 'classroom', 'session', 'term'],
                name='unique_teacher_class_per_term',
            ),
            models.UniqueConstraint(
                fields=['classroom', 'session'],
                condition=models.Q(is_form_teacher=True, is_active=True),
                name='one_form_teacher_per_class_per_session',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'teacher', 'is_active']),
            models.Index(fields=['school', 'classroom', 'is_active']),
        ]

    def __str__(self):
        return f'{self.teacher.full_name} -> {self.classroom}'

    def clean(self):
        for field in ('teacher', 'classroom', 'session'):
            related = getattr(self, field, None)
            if related is not None and related.school_id != self.school_id:
                raise ValidationError(
                    {field: f'{field.title()} belongs to a different school.'}
                )
        if self.term_id and self.term.session_id != self.session_id:
            raise ValidationError(
                {'term': 'Term does not belong to the selected session.'}
            )


class Notice(TenantModel):
    """A noticeboard entry — used for pending assignments and staff announcements."""

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'

    class Audience(models.TextChoices):
        ALL_STAFF = 'all_staff', 'All Staff'
        TEACHERS = 'teachers', 'Teachers'
        ADMINS = 'admins', 'Admins'

    title = models.CharField(max_length=200)
    body = models.TextField()
    priority = models.CharField(
        max_length=10, choices=Priority.choices, default=Priority.MEDIUM
    )
    audience = models.CharField(
        max_length=20, choices=Audience.choices, default=Audience.ALL_STAFF
    )
    assigned_to = models.ForeignKey(
        Staff,
        on_delete=models.CASCADE,
        related_name='assigned_notices',
        null=True,
        blank=True,
        help_text='Set to turn this notice into a pending assignment for one person.',
    )
    due_date = models.DateField(null=True, blank=True)
    is_completed = models.BooleanField(default=False, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='notices_created',
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['is_completed', '-created_at']
        indexes = [
            models.Index(fields=['school', 'is_completed']),
            models.Index(fields=['school', 'assigned_to', 'is_completed']),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        if self.assigned_to_id and self.assigned_to.school_id != self.school_id:
            raise ValidationError(
                {'assigned_to': 'Staff member belongs to a different school.'}
            )
