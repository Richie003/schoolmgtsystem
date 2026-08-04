from django.conf import settings
from django.db import models

from core.models import TenantModel


def import_upload_path(instance, filename):
    # Namespacing by school keeps a misconfigured bucket policy from turning
    # into a cross-tenant data leak.
    return f'imports/school-{instance.school_id}/{filename}'


class ImportJob(TenantModel):
    """Tracks one CSV upload through validate -> preview -> commit."""

    class Kind(models.TextChoices):
        STUDENTS = 'students', 'Students'
        STAFF = 'staff', 'Staff'
        QUESTIONS = 'questions', 'Questions'
        ATTENDANCE = 'attendance', 'Attendance'
        CHECKOUTS = 'checkouts', 'Checkouts'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Preview'
        VALIDATED = 'validated', 'Validated'
        PROCESSING = 'processing', 'Processing'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    file = models.FileField(upload_to=import_upload_path)
    original_filename = models.CharField(max_length=255, blank=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)

    errors = models.JSONField(
        default=list, blank=True,
        help_text='Per-row validation errors: [{line, field, message}].',
    )
    context = models.JSONField(
        default=dict, blank=True,
        help_text='Extra parameters, e.g. the term/session an attendance import targets.',
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='import_jobs',
        null=True,
        blank=True,
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['school', 'kind', 'status'])]

    def __str__(self):
        return f'{self.get_kind_display()} import #{self.pk} ({self.status})'
