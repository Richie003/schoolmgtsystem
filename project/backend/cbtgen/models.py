from django.conf import settings as django_settings
from django.db import models

from cbt.models import QuestionBank, Subject
from core.models import School, TenantModel


def default_free_trials():
    return getattr(django_settings, 'AI_GENERATION_FREE_TRIALS', 3)


class AIGenerationSettings(TenantModel):
    """Per-school configuration and usage for the AI question generator.

    Access is the product of four checks (see :meth:`availability`):
      * the school-wide master switch (``is_enabled``),
      * whether this specific staff member is excluded (``disabled_staff``),
      * the billing plan (premium is unlimited), and
      * the free-trial allowance for non-premium schools.
    """

    class Reason(models.TextChoices):
        OK = 'ok', 'Available'
        DISABLED = 'disabled', 'Disabled for this school'
        DISABLED_FOR_USER = 'disabled_for_you', 'Disabled for this staff member'
        TRIAL_EXHAUSTED = 'trial_exhausted', 'Free trials used up — upgrade to premium'

    is_enabled = models.BooleanField(
        default=True,
        help_text='Master switch. Off blocks AI generation for every staff member.',
    )
    trial_limit = models.PositiveIntegerField(
        default=default_free_trials,
        help_text='How many successful generations a non-premium school gets before it is gated.',
    )
    trials_used = models.PositiveIntegerField(default=0)
    disabled_staff = models.ManyToManyField(
        django_settings.AUTH_USER_MODEL,
        blank=True,
        related_name='ai_generation_disabled_in',
        help_text='Staff explicitly barred from AI generation while it is otherwise enabled.',
    )

    class Meta:
        verbose_name = 'AI generation settings'
        verbose_name_plural = 'AI generation settings'
        constraints = [
            models.UniqueConstraint(
                fields=['school'], name='one_ai_settings_per_school'
            ),
        ]

    def __str__(self):
        return f'AI settings — {self.school}'

    @classmethod
    def for_school(cls, school):
        obj, _ = cls.objects.get_or_create(school=school)
        return obj

    @property
    def remaining_trials(self):
        return max(0, self.trial_limit - self.trials_used)

    def availability(self, user):
        """Return (available: bool, reason: str). Premium schools are unlimited."""
        if not self.is_enabled:
            return False, self.Reason.DISABLED
        if self.disabled_staff.filter(pk=user.pk).exists():
            return False, self.Reason.DISABLED_FOR_USER
        if self.school.is_premium:
            return True, self.Reason.OK
        if self.remaining_trials <= 0:
            return False, self.Reason.TRIAL_EXHAUSTED
        return True, self.Reason.OK


class QuestionGenerationJob(TenantModel):
    """One AI generation request and its reviewable result.

    Generated questions live in ``generated`` (JSON) and are deliberately NOT
    written as :class:`cbt.models.Question` rows until a human reviews and
    commits them — that review-before-save step is the whole point of the flow.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSING = 'processing', 'Processing'
        READY = 'ready', 'Ready for review'
        FAILED = 'failed', 'Failed'
        COMMITTED = 'committed', 'Saved to bank'
        DISCARDED = 'discarded', 'Discarded'

    class QuestionType(models.TextChoices):
        SINGLE = 'single', 'Single answer'
        MULTIPLE = 'multiple', 'Multiple answers'

    created_by = models.ForeignKey(
        django_settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='question_generation_jobs',
        null=True,
    )

    # --- Request parameters ---
    class_level = models.CharField(max_length=30)
    exam_standard = models.CharField(max_length=30)
    subject_name = models.CharField(max_length=120)
    topics = models.TextField(blank=True)
    complexity = models.CharField(max_length=10, default='medium')
    # Percentage of calculation questions (vs cognitive reasoning), 0–100.
    calculation_ratio = models.PositiveSmallIntegerField(default=0)
    question_count = models.PositiveSmallIntegerField(default=10)
    question_type = models.CharField(
        max_length=10, choices=QuestionType.choices, default=QuestionType.SINGLE,
    )

    # --- Result / lifecycle ---
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True,
    )
    generated = models.JSONField(default=list, blank=True)
    error = models.TextField(blank=True)
    model_used = models.CharField(max_length=60, blank=True)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)

    committed_bank = models.ForeignKey(
        QuestionBank,
        on_delete=models.SET_NULL,
        related_name='generation_jobs',
        null=True,
        blank=True,
    )
    committed_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['school', 'created_by']),
        ]

    def __str__(self):
        return f'{self.subject_name} · {self.class_level} ({self.status})'
