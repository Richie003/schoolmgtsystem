import logging

from celery import shared_task
from django.db import transaction

from cbtgen.models import AIGenerationSettings, QuestionGenerationJob
from cbtgen.services import GenerationError, generate_questions

logger = logging.getLogger(__name__)


@shared_task
def run_generation_job(job_id):
    try:
        job = QuestionGenerationJob.objects.get(pk=job_id)
    except QuestionGenerationJob.DoesNotExist:
        logger.warning('run_generation_job: job %s gone', job_id)
        return

    # Guard against a duplicate dispatch re-running a finished job.
    if job.status != QuestionGenerationJob.Status.PENDING:
        return

    job.status = QuestionGenerationJob.Status.PROCESSING
    job.save(update_fields=['status', 'updated_at'])

    try:
        questions, meta = generate_questions(job)
    except GenerationError as exc:
        job.status = QuestionGenerationJob.Status.FAILED
        job.error = str(exc)
        job.save(update_fields=['status', 'error', 'updated_at'])
        return
    except Exception:  # noqa: BLE001 - never leave a job stuck in processing
        logger.exception('Unexpected error in generation job %s', job_id)
        job.status = QuestionGenerationJob.Status.FAILED
        job.error = 'An unexpected error occurred while generating questions.'
        job.save(update_fields=['status', 'error', 'updated_at'])
        return

    job.generated = questions
    job.model_used = meta['model_used']
    job.input_tokens = meta['input_tokens']
    job.output_tokens = meta['output_tokens']
    job.status = QuestionGenerationJob.Status.READY
    job.save(update_fields=[
        'generated', 'model_used', 'input_tokens', 'output_tokens', 'status', 'updated_at',
    ])

    # A successful generation consumes one free trial for non-premium schools.
    # Failures never consume a trial. Locked to keep the counter correct under
    # concurrent jobs.
    if not job.school.is_premium:
        AIGenerationSettings.for_school(job.school)  # ensure the row exists
        with transaction.atomic():
            settings_row = AIGenerationSettings.objects.select_for_update().get(
                school=job.school
            )
            settings_row.trials_used += 1
            settings_row.save(update_fields=['trials_used', 'updated_at'])
