import logging

from celery import shared_task
from django.utils import timezone

from cbt.models import ExamAttempt

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def auto_submit_attempt(self, attempt_id):
    """Force-submit one attempt when its timer runs out.

    Scheduled with a countdown at attempt start. Idempotent: if the student
    submitted manually first, ``finalise_attempt`` no-ops.
    """
    from cbt.services import finalise_attempt

    try:
        attempt = ExamAttempt.objects.select_related('exam').get(pk=attempt_id)
    except ExamAttempt.DoesNotExist:
        logger.info('auto_submit_attempt: attempt %s no longer exists', attempt_id)
        return {'attempt': attempt_id, 'result': 'missing'}

    if attempt.status != ExamAttempt.Status.IN_PROGRESS:
        return {'attempt': attempt_id, 'result': 'already_closed'}

    if not attempt.is_expired:
        # Clock skew, or the deadline moved. Re-queue for the remaining time
        # instead of submitting a student's paper early.
        raise self.retry(countdown=max(5, attempt.seconds_remaining))

    try:
        finalise_attempt(attempt, auto=True)
    except Exception as exc:
        logger.exception('auto_submit_attempt failed for %s', attempt_id)
        raise self.retry(exc=exc)

    logger.info('Auto-submitted attempt %s', attempt_id)
    return {'attempt': attempt_id, 'result': 'auto_submitted'}


@shared_task
def sweep_expired_attempts():
    """Safety net for attempts whose scheduled task was lost.

    A broker restart can drop countdown tasks, which would otherwise leave an
    attempt open forever. Run this on a Celery beat schedule (every 5 minutes is
    plenty) so no attempt can hang indefinitely.
    """
    from cbt.services import finalise_attempt

    stale = ExamAttempt.objects.filter(
        status=ExamAttempt.Status.IN_PROGRESS,
        expires_at__lt=timezone.now(),
    ).select_related('exam')[:500]

    closed = 0
    for attempt in stale:
        try:
            finalise_attempt(attempt, auto=True)
            closed += 1
        except Exception:
            logger.exception('Sweeper could not close attempt %s', attempt.id)

    if closed:
        logger.info('Sweeper auto-submitted %s expired attempt(s)', closed)
    return {'closed': closed}
