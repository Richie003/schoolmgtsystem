from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

from core.models import School


class Role(models.TextChoices):
    SUPER_ADMIN = 'super_admin', 'Super Admin'
    SCHOOL_ADMIN = 'school_admin', 'School Admin'
    TEACHER = 'teacher', 'Teacher'
    STUDENT = 'student', 'Student'


class UserManager(BaseUserManager):
    """Username-based manager that keeps the school invariant enforceable."""

    use_in_migrations = True

    def _create_user(self, username, email, password, **extra):
        if not username:
            raise ValueError('Users must have a username.')
        email = self.normalize_email(email) if email else ''
        user = self.model(username=username, email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username, email=None, password=None, **extra):
        extra.setdefault('role', Role.STUDENT)
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._create_user(username, email, password, **extra)

    def create_superuser(self, username, email=None, password=None, **extra):
        extra.setdefault('role', Role.SUPER_ADMIN)
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('school', None)

        if extra['is_staff'] is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra['is_superuser'] is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self._create_user(username, email, password, **extra)

    def for_school(self, school):
        if school is None:
            return self.none()
        return self.filter(school=school)


class User(AbstractUser):
    """Single account table for every actor in the platform.

    ``school`` is null only for platform superadmins; every other role is bound
    to exactly one tenant and cannot be moved between them without an explicit
    admin action.
    """

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='users',
        null=True,
        blank=True,
        db_index=True,
        help_text='Null only for platform-level super admins.',
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
        db_index=True,
    )
    phone = models.CharField(max_length=30, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

    objects = UserManager()

    class Meta:
        constraints = [
            # A non-superadmin without a school would be invisible to every
            # tenant-scoped query — reject the state at the DB level.
            models.CheckConstraint(
                condition=models.Q(role='super_admin')
                | models.Q(school__isnull=False),
                name='user_requires_school_unless_super_admin',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'role']),
        ]

    def __str__(self):
        full_name = self.get_full_name().strip()
        return f'{full_name or self.username} ({self.get_role_display()})'

    @property
    def is_super_admin(self):
        return self.role == Role.SUPER_ADMIN

    @property
    def is_school_admin(self):
        return self.role == Role.SCHOOL_ADMIN

    @property
    def is_teacher(self):
        return self.role == Role.TEACHER

    @property
    def is_student(self):
        return self.role == Role.STUDENT
