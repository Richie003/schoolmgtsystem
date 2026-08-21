from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from cbt.models import Subject
from core.models import TenantModel
from students.models import AcademicSession, Classroom, Student, Term


# ---------------------------------------------------------------------------
# Grading scheme ("marking guide")
# ---------------------------------------------------------------------------

class GradingScheme(TenantModel):
    """A marking guide: how a subject's assessment components combine, and how
    the resulting percentage maps to a grade + remark."""

    name = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'], name='unique_grading_scheme_per_school'
            ),
            models.UniqueConstraint(
                fields=['school'],
                condition=models.Q(is_default=True),
                name='one_default_scheme_per_school',
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def total_max(self):
        return sum(c.max_score for c in self.components.all()) or 100

    def grade_for(self, percent):
        """Return (grade, remark) for a 0–100 percentage, or ('', '') if unbanded."""
        for band in self.bands.all():
            if band.min_score <= percent <= band.max_score:
                return band.grade, band.remark
        return '', ''


class AssessmentComponent(TenantModel):
    """One column of a subject's score, e.g. "1st C.A." (max 15) or "Exam" (70)."""

    scheme = models.ForeignKey(
        GradingScheme, on_delete=models.CASCADE, related_name='components'
    )
    name = models.CharField(max_length=60)
    max_score = models.PositiveSmallIntegerField(default=100)
    order = models.PositiveSmallIntegerField(default=0)
    # The component the CBT auto-fill targets (typically "Exam").
    is_exam = models.BooleanField(default=False)

    class Meta:
        ordering = ['scheme', 'order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['scheme', 'name'], name='unique_component_per_scheme'
            ),
        ]

    def __str__(self):
        return f'{self.name} (/{self.max_score})'


class GradeBand(TenantModel):
    """A grade for a percentage range, e.g. 75–100 → A1 "Excellent"."""

    scheme = models.ForeignKey(
        GradingScheme, on_delete=models.CASCADE, related_name='bands'
    )
    min_score = models.PositiveSmallIntegerField()
    max_score = models.PositiveSmallIntegerField()
    grade = models.CharField(max_length=5)
    remark = models.CharField(max_length=60, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['scheme', '-min_score']

    def __str__(self):
        return f'{self.min_score}-{self.max_score} → {self.grade}'

    def clean(self):
        if self.min_score > self.max_score:
            raise ValidationError({'max_score': 'Max must be at least the minimum.'})


# ---------------------------------------------------------------------------
# The per-class-per-term workflow
# ---------------------------------------------------------------------------

class ClassResultSheet(TenantModel):
    """Results for one class in one term — the object the whole workflow acts on.

    Lifecycle: OPEN (teachers enter) → SUBMITTED (class teacher pushed) →
    CUMULATED (admin computed grades + positions, class teachers review) →
    PUBLISHED (students can view/download).
    """

    class Status(models.TextChoices):
        OPEN = 'open', 'Open — entering results'
        SUBMITTED = 'submitted', 'Submitted — awaiting cumulation'
        CUMULATED = 'cumulated', 'Cumulated — under review'
        PUBLISHED = 'published', 'Published'

    classroom = models.ForeignKey(
        Classroom, on_delete=models.CASCADE, related_name='result_sheets'
    )
    session = models.ForeignKey(
        AcademicSession, on_delete=models.PROTECT, related_name='result_sheets'
    )
    term = models.ForeignKey(
        Term, on_delete=models.PROTECT, related_name='result_sheets'
    )
    scheme = models.ForeignKey(
        GradingScheme, on_delete=models.PROTECT, related_name='result_sheets'
    )
    subjects = models.ManyToManyField(
        Subject, related_name='result_sheets',
        help_text='The subjects this class is graded on this term.',
    )

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True
    )
    # Free text shown on every card in this class (e.g. "Next term begins…").
    next_term_begins = models.DateField(null=True, blank=True)

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='result_sheets_submitted',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    cumulated_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='result_sheets_reviewed',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['classroom', 'term'], name='unique_sheet_per_class_per_term'
            ),
        ]
        indexes = [models.Index(fields=['school', 'status'])]

    def __str__(self):
        return f'{self.classroom} — {self.term} ({self.status})'

    def clean(self):
        for field in ('classroom', 'term', 'session', 'scheme'):
            related = getattr(self, field, None)
            if related is not None and related.school_id != self.school_id:
                raise ValidationError({field: 'Belongs to a different school.'})


class SubjectResult(TenantModel):
    """One student's score in one subject on a sheet.

    ``scores`` maps component id (as string) → raw score, e.g. {"3": 58}. The
    subject total, grade and position are derived at cumulation time.
    """

    sheet = models.ForeignKey(
        ClassResultSheet, on_delete=models.CASCADE, related_name='subject_results'
    )
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='subject_results'
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name='subject_results'
    )
    scores = models.JSONField(default=dict, blank=True)

    total = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    grade = models.CharField(max_length=5, blank=True)
    grade_remark = models.CharField(max_length=60, blank=True)
    position = models.PositiveSmallIntegerField(null=True, blank=True)
    teacher_remark = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['subject__name']
        constraints = [
            models.UniqueConstraint(
                fields=['sheet', 'student', 'subject'],
                name='unique_subject_result_per_student',
            ),
        ]
        indexes = [models.Index(fields=['sheet', 'subject'])]

    def __str__(self):
        return f'{self.student.full_name} — {self.subject.name}: {self.total}'


class StudentReport(TenantModel):
    """The report card for one student on a sheet — the aggregate + remarks."""

    sheet = models.ForeignKey(
        ClassResultSheet, on_delete=models.CASCADE, related_name='reports'
    )
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='reports'
    )

    subjects_count = models.PositiveSmallIntegerField(default=0)
    total = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    average = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    grade = models.CharField(max_length=5, blank=True)
    grade_remark = models.CharField(max_length=60, blank=True)
    position = models.PositiveSmallIntegerField(null=True, blank=True)
    class_size = models.PositiveSmallIntegerField(default=0)

    class_teacher_remark = models.TextField(blank=True)
    principal_remark = models.TextField(blank=True)
    # Behavioural / affective & psychomotor traits (premium), name → rating.
    traits = models.JSONField(default=dict, blank=True)

    attendance_present = models.PositiveSmallIntegerField(default=0)
    attendance_absent = models.PositiveSmallIntegerField(default=0)
    attendance_total = models.PositiveSmallIntegerField(default=0)

    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['position', 'student__last_name']
        constraints = [
            models.UniqueConstraint(
                fields=['sheet', 'student'], name='unique_report_per_student_per_sheet'
            ),
        ]

    def __str__(self):
        return f'Report: {self.student.full_name} — {self.sheet.term}'


# ---------------------------------------------------------------------------
# Report template settings (default for all; editable by premium schools)
# ---------------------------------------------------------------------------

class ReportTemplateSettings(TenantModel):
    """Per-school report-card presentation. Free schools get the defaults; only
    premium schools may change them (enforced in the view)."""

    header_text = models.CharField(
        max_length=200, blank=True,
        help_text='Line under the school name, e.g. "Terminal Report Sheet".',
    )
    show_attendance = models.BooleanField(default=True)
    show_positions = models.BooleanField(default=True)
    show_remarks = models.BooleanField(default=True)
    show_traits = models.BooleanField(default=False)
    # List of trait names to grade (premium), e.g. ["Punctuality", "Neatness"].
    traits = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = 'report template settings'
        verbose_name_plural = 'report template settings'
        constraints = [
            models.UniqueConstraint(
                fields=['school'], name='one_template_settings_per_school'
            ),
        ]

    def __str__(self):
        return f'Report template — {self.school}'

    @classmethod
    def for_school(cls, school):
        obj, _ = cls.objects.get_or_create(school=school)
        return obj
