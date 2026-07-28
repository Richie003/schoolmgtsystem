"""CBT exam engine.

All state transitions for an attempt live here rather than in views, so the
HTTP layer and the Celery auto-submit worker share exactly one implementation of
"what it means to grade and close an attempt".

Timing is server-authoritative: ``ExamAttempt.expires_at`` in Postgres is the
source of truth, and Redis holds only a fast-path mirror for the countdown. If
Redis is unavailable the exam still runs correctly — it just loses the cache.
"""

import logging
import random
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from cbt.models import Choice, Exam, ExamAttempt, Question, StudentAnswer

logger = logging.getLogger(__name__)

TIMER_KEY = 'cbt:attempt:{attempt_id}:expires_at'


# ---------------------------------------------------------------------------
# Redis timer mirror
# ---------------------------------------------------------------------------

def cache_timer(attempt):
    """Mirror the deadline into Redis with a TTL that outlives the attempt."""
    ttl = max(60, attempt.seconds_remaining + 300)
    try:
        cache.set(
            TIMER_KEY.format(attempt_id=attempt.id),
            attempt.expires_at.isoformat(),
            timeout=ttl,
        )
    except Exception:  # pragma: no cover - cache must never break an exam
        logger.warning('Could not cache timer for attempt %s', attempt.id, exc_info=True)


def clear_timer(attempt_id):
    try:
        cache.delete(TIMER_KEY.format(attempt_id=attempt_id))
    except Exception:  # pragma: no cover
        logger.warning('Could not clear timer for attempt %s', attempt_id, exc_info=True)


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------

def assert_student_may_sit(exam, student):
    """Raise unless this student is allowed to start this exam right now."""
    if exam.school_id != student.school_id:
        # Should be unreachable via the API, but this is the last line of defence.
        raise PermissionDenied('This exam belongs to a different school.')

    if exam.status != Exam.Status.PUBLISHED:
        raise ValidationError('This exam is not currently published.')

    now = timezone.now()
    if now < exam.starts_at:
        raise ValidationError(
            f'This exam opens at {exam.starts_at.isoformat()}.'
        )
    if now > exam.ends_at:
        raise ValidationError('The exam window has closed.')

    eligible = exam.classrooms.all()
    if eligible.exists():
        if student.classroom_id is None or not eligible.filter(
            id=student.classroom_id
        ).exists():
            raise PermissionDenied('Your class is not scheduled to sit this exam.')

    finished = ExamAttempt.objects.filter(
        exam=exam,
        student=student,
        status__in=[ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.AUTO_SUBMITTED],
    ).count()
    if finished >= exam.max_attempts:
        raise ValidationError(
            f'You have used all {exam.max_attempts} permitted attempt(s) for this exam.'
        )


def build_question_set(exam):
    """Pick and order the questions for one student's paper."""
    question_ids = list(
        Question.objects.filter(bank_id=exam.bank_id, is_active=True)
        .values_list('id', flat=True)
    )

    if len(question_ids) < exam.question_count:
        raise ValidationError(
            f'The question bank holds only {len(question_ids)} active question(s), '
            f'but this exam requires {exam.question_count}.'
        )

    if exam.shuffle_questions:
        selected = random.sample(question_ids, exam.question_count)
    else:
        selected = question_ids[: exam.question_count]

    choice_order = {}
    if exam.shuffle_choices:
        rows = Choice.objects.filter(question_id__in=selected).values_list(
            'question_id', 'id'
        )
        grouped = {}
        for question_id, choice_id in rows:
            grouped.setdefault(question_id, []).append(choice_id)
        for question_id, choice_ids in grouped.items():
            random.shuffle(choice_ids)
            # JSON object keys must be strings.
            choice_order[str(question_id)] = choice_ids

    return selected, choice_order


# ---------------------------------------------------------------------------
# Attempt lifecycle
# ---------------------------------------------------------------------------

def start_attempt(exam, student):
    """Create (or resume) an attempt and schedule its forced submission.

    Note the transaction boundaries: closing an expired attempt must COMMIT
    before we raise, so the two steps cannot share one atomic block. Wrapping
    the whole function would roll the close back along with the exception and
    leave the attempt open forever.
    """
    # Resuming matters: a student whose browser crashed must land back on the
    # same paper with the original deadline, not get a fresh timer.
    existing = ExamAttempt.objects.filter(
        exam=exam, student=student, status=ExamAttempt.Status.IN_PROGRESS
    ).first()

    if existing is not None:
        if existing.is_expired:
            finalise_attempt(existing, auto=True)  # commits on its own
            raise ValidationError('Your previous attempt expired and was submitted.')
        cache_timer(existing)
        return existing

    assert_student_may_sit(exam, student)
    question_ids, choice_order = build_question_set(exam)

    expires_at = timezone.now() + timezone.timedelta(minutes=exam.duration_minutes)
    # Never let an attempt outlive the exam window itself.
    expires_at = min(expires_at, exam.ends_at)

    with transaction.atomic():
        # Re-check under lock: two tabs hitting "start" at once must not create
        # two attempts.
        locked = (
            ExamAttempt.objects.select_for_update()
            .filter(exam=exam, student=student, status=ExamAttempt.Status.IN_PROGRESS)
            .first()
        )
        if locked is not None:
            cache_timer(locked)
            return locked

        used = ExamAttempt.objects.filter(exam=exam, student=student).count()
        attempt = ExamAttempt.objects.create(
            school_id=exam.school_id,
            exam=exam,
            student=student,
            attempt_number=used + 1,
            question_order=question_ids,
            choice_order=choice_order,
            expires_at=expires_at,
            total_marks=Question.objects.filter(id__in=question_ids).aggregate(
                total=Sum('marks')
            )['total'] or 0,
        )

    cache_timer(attempt)
    schedule_auto_submit(attempt)
    return attempt


def schedule_auto_submit(attempt):
    """Queue the Celery task that force-submits this attempt at expiry."""
    from cbt.tasks import auto_submit_attempt

    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        # Eager mode ignores ``countdown`` and would run the task inline, i.e.
        # submit the paper the instant it is handed out. Rely on the sweeper.
        return

    countdown = attempt.seconds_remaining + settings.EXAM_SUBMIT_GRACE_SECONDS
    try:
        result = auto_submit_attempt.apply_async(
            args=[attempt.id], countdown=countdown
        )
        ExamAttempt.objects.filter(pk=attempt.pk).update(auto_submit_task_id=result.id)
    except Exception:
        # A broker outage must not stop an exam. The sweeper task
        # (``sweep_expired_attempts``) catches anything that slips through.
        logger.exception('Could not schedule auto-submit for attempt %s', attempt.id)


def save_answer(attempt, question_id, choice_ids):
    """Auto-save one answer. Idempotent, and safe to call on every click.

    ``choice_ids`` may be a single id, a list of ids, or None to clear the
    answer — the exam runner sends a list for multi-answer questions.

    Deliberately not wrapped in a single atomic block: the expiry path closes
    the attempt and then raises, and those two effects must not share a
    transaction or the close would be rolled back by the raise.
    """
    if attempt.status != ExamAttempt.Status.IN_PROGRESS:
        raise ValidationError('This attempt has already been submitted.')

    # Grace period absorbs clock skew and in-flight requests; beyond it we
    # refuse rather than let a student answer past the deadline.
    deadline = attempt.expires_at + timezone.timedelta(
        seconds=settings.EXAM_SUBMIT_GRACE_SECONDS
    )
    if timezone.now() > deadline:
        finalise_attempt(attempt, auto=True)  # commits on its own
        raise ValidationError('Time has expired; your attempt has been submitted.')

    if question_id not in attempt.question_order:
        raise ValidationError('This question is not part of your paper.')

    question = Question.objects.get(id=question_id)
    selected_ids = normalise_choice_ids(choice_ids)

    if selected_ids:
        valid_ids = set(
            Choice.objects.filter(
                id__in=selected_ids, question_id=question_id
            ).values_list('id', flat=True)
        )
        stray = set(selected_ids) - valid_ids
        if stray:
            raise ValidationError(
                'One or more selected options do not belong to this question.'
            )
        if not question.is_multiple and len(selected_ids) > 1:
            raise ValidationError(
                'This question accepts a single answer.'
            )

    is_correct = grade_selection(question, set(selected_ids))

    with transaction.atomic():
        answer, _ = StudentAnswer.objects.update_or_create(
            attempt=attempt,
            question_id=question_id,
            defaults={
                'is_correct': is_correct,
                'marks_awarded': Decimal(question.marks) if is_correct else Decimal(0),
            },
        )
        answer.selected_choices.set(selected_ids)
    return answer


def normalise_choice_ids(choice_ids):
    """Accept ``None``, a single id, or a list, and return a list of ints."""
    if choice_ids is None:
        return []
    if isinstance(choice_ids, int):
        return [choice_ids]
    # Deduplicate while keeping it deterministic for tests and logs.
    return sorted({int(value) for value in choice_ids if value is not None})


def grade_selection(question, selected_ids):
    """Mark a selection.

    Single-answer: the chosen option must be the correct one.
    Multiple-answer: all-or-nothing — every correct option and no incorrect one.
    Partial credit would go here if it is ever wanted; the marks calculation in
    ``save_answer`` is the only other place that would need to change.
    """
    if not selected_ids:
        return False

    correct_ids = question.correct_choice_ids()
    if not correct_ids:
        # A question with no key cannot be answered correctly. Guarded at
        # authoring time, but never award marks on malformed data.
        return False

    if question.is_multiple:
        return selected_ids == correct_ids
    return selected_ids <= correct_ids


@transaction.atomic
def finalise_attempt(attempt, auto=False):
    """Grade and close an attempt. Safe to call more than once.

    Called from three places — manual submit, Celery expiry, and the sweeper —
    so it locks the row and no-ops if another caller got there first.
    """
    locked = ExamAttempt.objects.select_for_update().get(pk=attempt.pk)

    if locked.status != ExamAttempt.Status.IN_PROGRESS:
        return locked

    answers = locked.answers.select_related('question')
    score = sum((a.marks_awarded for a in answers), Decimal(0))

    total = locked.total_marks or Question.objects.filter(
        id__in=locked.question_order
    ).aggregate(total=Sum('marks'))['total'] or 0

    percentage = (score / Decimal(total) * 100) if total else Decimal(0)

    locked.score = score
    locked.total_marks = total
    locked.percentage = round(percentage, 2)
    locked.is_passed = percentage >= locked.exam.pass_mark_percent
    locked.status = (
        ExamAttempt.Status.AUTO_SUBMITTED if auto else ExamAttempt.Status.SUBMITTED
    )
    locked.submitted_at = timezone.now()
    locked.save(
        update_fields=[
            'score', 'total_marks', 'percentage', 'is_passed', 'status',
            'submitted_at', 'updated_at',
        ]
    )

    clear_timer(locked.id)
    return locked
