from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from core.models import TenantModel


class AcademicSession(TenantModel):
    """An academic year, e.g. "2025/2026"."""

    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ['-start_date']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'], name='unique_session_name_per_school'
            ),
            # Exactly one current session per school keeps "today's context"
            # unambiguous for attendance and exams.
            models.UniqueConstraint(
                fields=['school'],
                condition=models.Q(is_current=True),
                name='one_current_session_per_school',
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValidationError({'end_date': 'End date must fall after the start date.'})


class Term(TenantModel):
    """A term within a session, e.g. "First Term"."""

    session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name='terms'
    )
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ['session', 'start_date']
        constraints = [
            models.UniqueConstraint(
                fields=['session', 'name'], name='unique_term_name_per_session'
            ),
            models.UniqueConstraint(
                fields=['school'],
                condition=models.Q(is_current=True),
                name='one_current_term_per_school',
            ),
        ]

    def __str__(self):
        return f'{self.name} — {self.session.name}'

    def clean(self):
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValidationError({'end_date': 'End date must fall after the start date.'})
        if self.session_id and self.session.school_id != self.school_id:
            raise ValidationError({'session': 'Session belongs to a different school.'})

    def contains(self, day):
        return self.start_date <= day <= self.end_date


class Classroom(TenantModel):
    """A class plus its arm, e.g. "JSS 1" + "A"."""

    name = models.CharField(max_length=50, help_text='e.g. JSS 1, Primary 4')
    arm = models.CharField(max_length=20, blank=True, help_text='e.g. A, Gold')
    capacity = models.PositiveIntegerField(default=0, help_text='0 means uncapped.')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name', 'arm']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name', 'arm'], name='unique_classroom_per_school'
            ),
        ]
        indexes = [models.Index(fields=['school', 'is_active'])]

    def __str__(self):
        return f'{self.name} {self.arm}'.strip()

    @property
    def full_name(self):
        return f'{self.name} {self.arm}'.strip()


class Student(TenantModel):
    class Gender(models.TextChoices):
        MALE = 'male', 'Male'
        FEMALE = 'female', 'Female'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        GRADUATED = 'graduated', 'Graduated'
        WITHDRAWN = 'withdrawn', 'Withdrawn'

    # Optional: a student record can exist before a login is provisioned.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='student_profile',
        null=True,
        blank=True,
    )
    admission_number = models.CharField(max_length=50, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    date_of_birth = models.DateField(null=True, blank=True)

    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.SET_NULL,
        related_name='students',
        null=True,
        blank=True,
    )

    parent_name = models.CharField(max_length=200, blank=True)
    parent_phone = models.CharField(max_length=30, blank=True)
    parent_email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    photo = models.ImageField(upload_to='student-photos/', blank=True, null=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True
    )
    enrolled_on = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'admission_number'],
                name='unique_admission_number_per_school',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'classroom']),
            models.Index(fields=['school', 'status']),
            models.Index(fields=['school', 'last_name', 'first_name']),
        ]

    def __str__(self):
        return f'{self.full_name} ({self.admission_number})'

    @property
    def full_name(self):
        parts = [self.first_name, self.middle_name, self.last_name]
        return ' '.join(p for p in parts if p)

    def clean(self):
        if self.classroom_id and self.classroom.school_id != self.school_id:
            raise ValidationError({'classroom': 'Classroom belongs to a different school.'})
        if self.user_id and self.user.school_id != self.school_id:
            raise ValidationError({'user': 'User account belongs to a different school.'})


class AttendanceRecord(TenantModel):
    """One student's attendance on one school day, within a term/session.

    Uniqueness is (student, date) — a student has exactly one attendance state
    per calendar day. Term and session are denormalised onto the row so that
    per-term reporting does not require a date-range join.
    """

    class Status(models.TextChoices):
        PRESENT = 'present', 'Present'
        ABSENT = 'absent', 'Absent'
        LATE = 'late', 'Late'
        EXCUSED = 'excused', 'Excused'

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='attendance_records'
    )
    session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name='attendance_records'
    )
    term = models.ForeignKey(
        Term, on_delete=models.CASCADE, related_name='attendance_records'
    )
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.SET_NULL,
        related_name='attendance_records',
        null=True,
        blank=True,
        help_text="Snapshot of the student's class on this date.",
    )

    date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PRESENT
    )
    remark = models.CharField(max_length=255, blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='attendance_marked',
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['-date', 'student__last_name']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'date'], name='unique_attendance_per_student_per_day'
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'date']),
            models.Index(fields=['term', 'date']),
            models.Index(fields=['classroom', 'date']),
        ]

    def __str__(self):
        return f'{self.student.full_name} — {self.date} — {self.get_status_display()}'

    def clean(self):
        if self.student_id and self.student.school_id != self.school_id:
            raise ValidationError({'student': 'Student belongs to a different school.'})
        if self.term_id and self.date and not self.term.contains(self.date):
            raise ValidationError(
                {'date': f'{self.date} falls outside {self.term.name}.'}
            )
        if self.date and self.date.weekday() >= 5:
            # Attendance is a weekday concept; a Saturday row is almost always a
            # data-entry slip in an imported spreadsheet.
            raise ValidationError({'date': 'Attendance can only be marked on weekdays.'})


class CheckoutRecord(TenantModel):
    """Records a student leaving the premises after school on a given day."""

    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='checkout_records'
    )
    session = models.ForeignKey(
        AcademicSession, on_delete=models.CASCADE, related_name='checkout_records'
    )
    term = models.ForeignKey(
        Term, on_delete=models.CASCADE, related_name='checkout_records'
    )
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.SET_NULL,
        related_name='checkout_records',
        null=True,
        blank=True,
    )

    date = models.DateField(db_index=True)
    checked_out_at = models.TimeField()
    released_to = models.CharField(
        max_length=200,
        blank=True,
        help_text='Name of the guardian or authorised adult collecting the student.',
    )
    relationship = models.CharField(max_length=100, blank=True)
    remark = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='checkouts_recorded',
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['-date', '-checked_out_at']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'date'], name='unique_checkout_per_student_per_day'
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'date']),
            models.Index(fields=['term', 'date']),
        ]

    def __str__(self):
        return f'{self.student.full_name} left at {self.checked_out_at} on {self.date}'

    def clean(self):
        if self.student_id and self.student.school_id != self.school_id:
            raise ValidationError({'student': 'Student belongs to a different school.'})
        if self.term_id and self.date and not self.term.contains(self.date):
            raise ValidationError(
                {'date': f'{self.date} falls outside {self.term.name}.'}
            )
