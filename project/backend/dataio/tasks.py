import logging

from celery import shared_task
from django.utils import timezone

from core.csv_utils import decode_upload, read_rows
from dataio.importers import get_importer
from dataio.models import ImportJob

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def process_import_job(self, job_id):
    """Re-validate and commit an approved import in the background.

    Large files are committed here rather than in the request cycle. Validation
    is deliberately re-run against current data — the world may have changed
    between the user seeing the preview and approving it.
    """
    try:
        job = ImportJob.objects.select_related('school', 'uploaded_by').get(pk=job_id)
    except ImportJob.DoesNotExist:
        logger.warning('process_import_job: job %s no longer exists', job_id)
        return {'job': job_id, 'result': 'missing'}

    if job.status == ImportJob.Status.COMPLETED:
        return {'job': job_id, 'result': 'already_completed'}

    job.status = ImportJob.Status.PROCESSING
    job.save(update_fields=['status'])

    try:
        job.file.open('rb')
        try:
            text = decode_upload(job.file)
        finally:
            job.file.close()

        importer = get_importer(
            job.kind, school=job.school, context=job.context, user=job.uploaded_by
        )
        rows, _ = read_rows(
            text, importer.required_headers, importer.optional_headers
        )
        records, errors = importer.validate(rows)
        result = importer.commit(records) if records else {'created': 0, 'updated': 0}

        job.total_rows = len(rows)
        job.valid_rows = len(records)
        job.created_count = result['created']
        job.updated_count = result['updated']
        job.errors = errors
        job.error_count = len(errors)
        job.status = ImportJob.Status.COMPLETED
        job.completed_at = timezone.now()
        job.save()

    except Exception as exc:
        logger.exception('Import job %s failed', job_id)
        job.status = ImportJob.Status.FAILED
        job.errors = [{'line': None, 'message': str(exc)}]
        job.error_count = 1
        job.completed_at = timezone.now()
        job.save()
        return {'job': job_id, 'result': 'failed', 'error': str(exc)}

    logger.info(
        'Import job %s completed: %s created, %s updated, %s error(s)',
        job_id, job.created_count, job.updated_count, job.error_count,
    )
    return {
        'job': job_id,
        'result': 'completed',
        'created': job.created_count,
        'updated': job.updated_count,
        'errors': job.error_count,
    }
