"""Onboarding emails, sent through the configured SMTP backend via Celery.

The raw invite token is never stored, so the accept URL is built by the caller
(where the token is momentarily in hand) and passed in — the task only sends.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from onboarding.models import SchoolInvitation, SchoolSignupRequest

logger = logging.getLogger(__name__)


def _broker_reachable():
    """True if the Celery broker can be connected to right now.

    ``task.delay()`` does NOT raise when the broker is down — it fails silently
    and the message is lost. For onboarding emails (invitations especially) that
    silent loss is unacceptable, so we probe first rather than fire and forget.
    """
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


def dispatch(task, *args):
    """Deliver an onboarding email, guaranteeing it is not silently dropped.

    These emails are low-volume and delivery-critical (a lost invitation email
    strands a school), so: if the broker is reachable, queue as normal; if not,
    send inline in-process. Inline sending costs a little request latency during
    a broker outage — an acceptable trade for not losing the email.
    """
    if _broker_reachable():
        task.delay(*args)
        return

    logger.warning('Broker unreachable; sending %s inline', task.name)
    try:
        # apply() runs the task synchronously without a broker, and captures any
        # error in its result rather than raising — so a mail hiccup never 500s
        # the request. The invitation still exists and can be resent.
        result = task.apply(args=args)
        if result.failed():
            logger.error('Inline send of %s failed: %s', task.name, result.result)
    except Exception:
        logger.exception('Inline send of %s raised', task.name)


def _send(subject, to_email, body):
    """Send a plain-text email. Retries are handled by the task wrapper."""
    message = EmailMultiAlternatives(
        subject=f'[{settings.PLATFORM_NAME}] {subject}',
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    message.send(fail_silently=False)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_invitation_email(self, invitation_id, accept_url):
    try:
        invitation = SchoolInvitation.objects.get(pk=invitation_id)
    except SchoolInvitation.DoesNotExist:
        logger.warning('send_invitation_email: invitation %s gone', invitation_id)
        return

    days = settings.INVITE_EXPIRY_DAYS
    body = (
        f'Hello,\n\n'
        f'You have been invited to set up "{invitation.school_name}" on '
        f'{settings.PLATFORM_NAME}.\n\n'
        f'Open this link to create your administrator account and get started:\n\n'
        f'{accept_url}\n\n'
        f'This link is personal to {invitation.email}, can be used once, and '
        f'expires in {days} day{"s" if days != 1 else ""}. If you did not expect '
        f'this invitation you can ignore this email.\n\n'
        f'— The {settings.PLATFORM_NAME} team'
    )
    try:
        _send('Set up your school', invitation.email, body)
    except Exception as exc:
        logger.exception('Invitation email failed for %s', invitation_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_request_acknowledgement_email(self, request_id):
    try:
        req = SchoolSignupRequest.objects.get(pk=request_id)
    except SchoolSignupRequest.DoesNotExist:
        return

    body = (
        f'Hello {req.contact_name or "there"},\n\n'
        f'Thank you for requesting access to {settings.PLATFORM_NAME} for '
        f'"{req.school_name}". Your request has been received and is under '
        f'review. If it is approved, you will receive a separate email with a '
        f'link to set up your school.\n\n'
        f'— The {settings.PLATFORM_NAME} team'
    )
    try:
        _send('We received your request', req.contact_email, body)
    except Exception as exc:
        logger.exception('Acknowledgement email failed for request %s', request_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_request_rejected_email(self, request_id):
    try:
        req = SchoolSignupRequest.objects.get(pk=request_id)
    except SchoolSignupRequest.DoesNotExist:
        return

    reason = f'\n\nNote: {req.review_note}' if req.review_note else ''
    body = (
        f'Hello {req.contact_name or "there"},\n\n'
        f'Thank you for your interest in {settings.PLATFORM_NAME}. After review, '
        f'we are unable to approve access for "{req.school_name}" at this '
        f'time.{reason}\n\n'
        f'If you believe this was a mistake, reply to this email.\n\n'
        f'— The {settings.PLATFORM_NAME} team'
    )
    try:
        _send('About your access request', req.contact_email, body)
    except Exception as exc:
        logger.exception('Rejection email failed for request %s', request_id)
        raise self.retry(exc=exc)
