from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from core.models import TenantModel
from students.models import AcademicSession, Classroom, Student, Term


class Subject(TenantModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'name'], name='unique_subject_name_per_school'
            ),
        ]

    def __str__(self):
        return self.name


class QuestionBank(TenantModel):
    """A named pool of questions for one subject.

    Exams draw from a bank rather than from the subject at large, so a teacher
    can keep "JSS1 Term 1 Revision" separate from "Mock Exam" material.
    """

    subject = models.ForeignKey(
        Subject, on_delete=models.CASCADE, related_name='question_banks'
    )
    name = models.CharField(max_length=150)
    description = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='question_banks_created',
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['subject__name', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'subject', 'name'],
                name='unique_bank_name_per_subject',
            ),
        ]

    def __str__(self):
        return f'{self.subject.name} — {self.name}'

    def clean(self):
        if self.subject_id and self.subject.school_id != self.school_id:
            raise ValidationError({'subject': 'Subject belongs to a different school.'})


class Question(TenantModel):
    """A multiple-choice question.

    ``question_type`` decides how it is answered and marked:

    ``single``   – exactly one correct option (radio buttons).
    ``multiple`` – "select all that apply". Marked all-or-nothing: the student
                   must pick every correct option and no incorrect one.
    """

    class Kind(models.TextChoices):
        SINGLE = 'single', 'Single answer'
        MULTIPLE = 'multiple', 'Multiple answers'

    class Difficulty(models.TextChoices):
        EASY = 'easy', 'Easy'
        MEDIUM = 'medium', 'Medium'
        HARD = 'hard', 'Hard'

    bank = models.ForeignKey(
        QuestionBank, on_delete=models.CASCADE, related_name='questions'
    )
    question_type = models.CharField(
        max_length=10, choices=Kind.choices, default=Kind.SINGLE, db_index=True
    )
    text = models.TextField()
    image = models.ImageField(upload_to='question-images/', blank=True, null=True)
    marks = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    difficulty = models.CharField(
        max_length=10, choices=Difficulty.choices, default=Difficulty.MEDIUM,
        db_index=True,
    )
    explanation = models.TextField(
        blank=True, help_text='Shown to students after results are released.'
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='questions_created',
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['id']
        indexes = [
            models.Index(fields=['school', 'bank', 'is_active']),
        ]

    def __str__(self):
        return self.text[:70]

    def clean(self):
        if self.bank_id and self.bank.school_id != self.school_id:
            raise ValidationError({'bank': 'Question bank belongs to a different school.'})

    @property
    def is_multiple(self):
        return self.question_type == self.Kind.MULTIPLE

    def correct_choice_ids(self):
        return set(
            self.choices.filter(is_correct=True).values_list('id', flat=True)
        )


class Choice(models.Model):
    """An option on a question.

    Not a TenantModel: it inherits its school through ``question``. Adding a
    redundant FK here would create a second source of truth that could drift.
    """

    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name='choices'
    )
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        indexes = [models.Index(fields=['question', 'is_correct'])]

    def __str__(self):
        return self.text[:50]


class Exam(TenantModel):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'
        CLOSED = 'closed', 'Closed'

    title = models.CharField(max_length=200)
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name='exams'
    )
    bank = models.ForeignKey(
        QuestionBank, on_delete=models.PROTECT, related_name='exams'
    )
    session = models.ForeignKey(
        AcademicSession, on_delete=models.PROTECT, related_name='exams'
    )
    term = models.ForeignKey(Term, on_delete=models.PROTECT, related_name='exams')
    classrooms = models.ManyToManyField(
        Classroom,
        related_name='exams',
        blank=True,
        help_text='Classes eligible to sit this exam. Empty means the whole school.',
    )

    instructions = models.TextField(blank=True)
    question_count = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text='How many questions to draw from the bank for each student.',
    )
    duration_minutes = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    pass_mark_percent = models.PositiveSmallIntegerField(default=50)

    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    shuffle_questions = models.BooleanField(default=True)
    shuffle_choices = models.BooleanField(default=True)
    max_attempts = models.PositiveSmallIntegerField(
        default=1, help_text='Retakes are blocked once this many attempts are submitted.'
    )
    show_results_immediately = models.BooleanField(default=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='exams_created',
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['-starts_at']
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['school', 'starts_at', 'ends_at']),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        for field in ('subject', 'bank', 'session', 'term'):
            related = getattr(self, field, None)
            if related is not None and related.school_id != self.school_id:
                raise ValidationError(
                    {field: f'{field.title()} belongs to a different school.'}
                )
        if self.starts_at and self.ends_at and self.starts_at >= self.ends_at:
            raise ValidationError({'ends_at': 'End time must fall after the start time.'})
        if self.bank_id and self.subject_id and self.bank.subject_id != self.subject_id:
            raise ValidationError(
                {'bank': 'Question bank does not belong to the selected subject.'}
            )

    @property
    def is_open(self):
        """True when the exam window is currently active."""
        now = timezone.now()
        return self.status == self.Status.PUBLISHED and self.starts_at <= now <= self.ends_at

    @property
    def available_question_count(self):
        return self.bank.questions.filter(is_active=True).count()


class ExamAttempt(TenantModel):
    """One student's sitting of one exam.

    ``question_order`` freezes the randomised question set at start time, so a
    refresh, a reconnect, or a Celery-driven auto-submit all operate on exactly
    the same paper the student was given.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'In Progress'
        SUBMITTED = 'submitted', 'Submitted'
        AUTO_SUBMITTED = 'auto_submitted', 'Auto Submitted'
        ABANDONED = 'abandoned', 'Abandoned'

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='exam_attempts'
    )
    attempt_number = models.PositiveSmallIntegerField(default=1)

    question_order = models.JSONField(
        default=list,
        help_text='Ordered list of Question ids forming this student\'s paper.',
    )
    choice_order = models.JSONField(
        default=dict,
        blank=True,
        help_text='Per-question choice ordering, keyed by question id.',
    )

    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        db_index=True,
        help_text='Server-authoritative deadline. Answers after this are rejected.',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.IN_PROGRESS,
        db_index=True,
    )
    score = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    total_marks = models.PositiveIntegerField(default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_passed = models.BooleanField(default=False)

    auto_submit_task_id = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['-started_at']
        constraints = [
            models.UniqueConstraint(
                fields=['exam', 'student', 'attempt_number'],
                name='unique_attempt_number_per_student_per_exam',
            ),
        ]
        indexes = [
            models.Index(fields=['school', 'exam', 'status']),
            models.Index(fields=['student', 'exam']),
            models.Index(fields=['status', 'expires_at']),
        ]

    def __str__(self):
        return f'{self.student.full_name} — {self.exam.title} (#{self.attempt_number})'

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def seconds_remaining(self):
        delta = (self.expires_at - timezone.now()).total_seconds()
        return max(0, int(delta))


class StudentAnswer(models.Model):
    """A student's selection for one question in one attempt.

    Correctness is evaluated and frozen at save time rather than being derived
    on read, so that editing a question later never silently rewrites history.

    Selections are stored as a set even for single-answer questions. A separate
    FK for the single case plus an M2M for the multiple case would be two
    sources of truth that could disagree; one representation cannot.
    """

    attempt = models.ForeignKey(
        ExamAttempt, on_delete=models.CASCADE, related_name='answers'
    )
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name='student_answers'
    )
    selected_choices = models.ManyToManyField(
        Choice, related_name='student_answers', blank=True
    )
    is_correct = models.BooleanField(default=False)
    marks_awarded = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    answered_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['attempt', 'question'], name='unique_answer_per_question'
            ),
        ]
        indexes = [models.Index(fields=['attempt', 'question'])]

    def __str__(self):
        return f'Attempt {self.attempt_id} / Q{self.question_id}'

    @property
    def selected_choice(self):
        """The single selection, for single-answer questions. None if unanswered."""
        return self.selected_choices.first()

    def selected_text(self):
        """Human-readable answer, used in the post-exam breakdown."""
        return ', '.join(choice.text for choice in self.selected_choices.all())
