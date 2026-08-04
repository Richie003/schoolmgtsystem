"""Shared Celery helpers.

``dispatch`` guarantees a task is not silently lost when the broker is down:
``task.delay()`` does not raise in that case — it drops the message. So we probe
the broker first and, if it is unreachable, run the task inline in-process. This
is the same guarantee the onboarding emails rely on, hoisted here for reuse.
"""

import logging

logger = logging.getLogger(__name__)


def broker_reachable():
    """True if the Celery broker can be connected to right now."""
    from school_management.celery import app as celery_app

    try:
        conn = celery_app.connection_for_write()
        try:
            conn.ensure_connection(max_retries=0, timeout=2)
        finally:
            conn.release()
        return True
    except Exception:
        return False


def dispatch(task, *args, **kwargs):
    """Queue ``task`` if the broker is up, otherwise run it inline.

    Returns the AsyncResult (queued) or EagerResult (inline). Inline execution
    costs request latency during a broker outage — an acceptable trade for not
    silently dropping the work.
    """
    if broker_reachable():
        return task.delay(*args, **kwargs)
    logger.warning('Broker unreachable; running %s inline', task.name)
    return task.apply(args=args, kwargs=kwargs)
