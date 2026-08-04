"""Invite-based school onboarding.

Flow (shape #2): a school submits a public *request* → a platform super admin
reviews it → on approval an *invitation* is issued and emailed → the school
opens the link and completes signup, which atomically creates the tenant and its
first admin.

Token handling mirrors how password-reset and API-key systems store secrets:
the raw token is high-entropy (256 bits), returned once, put into the emailed
link, and **never stored**. Only its SHA-256 hash lives in the database, so a
database leak exposes no usable invites. Lookups hash the incoming token and
match on the stored hash — the hash itself is unguessable, so this is safe
without constant-time comparison.
"""

import hashlib
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import School, TimeStampedModel


def generate_token() -> str:
    """A URL-safe, unguessable invite token (~256 bits of entropy)."""
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def build_accept_url(raw_token: str) -> str:
    """The SPA link a recipient clicks to complete signup."""
    return f'{settings.FRONTEND_URL}/?invite={raw_token}'


def generate_school_code(name: str) -> str:
    """A short, unique tenant code derived from the school name.

    Used as the admission-number prefix. Initials first (e.g. "St Peters
    College" → "SPC"); a numeric suffix disambiguates collisions across
    existing schools.
    """
    words = re.findall(r'[A-Za-z0-9]+', name)
    base = ''.join(word[0] for word in words).upper()[:6]
    if len(base) < 2:
        stripped = re.sub(r'[^A-Za-z0-9]', '', name).upper()
        base = (stripped[:4] or 'SCH')

    code = base
    suffix = 1
    while School.objects.filter(code=code).exists():
        suffix += 1
        code = f'{base}{suffix}'
    return code


class SchoolSignupRequest(TimeStampedModel):
    """A lead from the public "request access" form.

    Creating one grants nothing — it is a request for a human to review. Only an
    approval (which issues an invitation) can lead to an account.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending review'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    school_name = models.CharField(max_length=200)
    contact_name = models.CharField(max_length=150)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=30, blank=True)
    message = models.TextField(blank=True, help_text='Anything the school wants to add.')

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='reviewed_signup_requests',
        null=True,
        blank=True,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'created_at'])]

    def __str__(self):
        return f'{self.school_name} <{self.contact_email}> ({self.status})'


class SchoolInvitation(TimeStampedModel):
    """A single-use, expiring, revocable token that authorises school signup."""

    email = models.EmailField(help_text='Where the invite was sent.')
    school_name = models.CharField(max_length=200)
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)

    request = models.ForeignKey(
        SchoolSignupRequest,
        on_delete=models.SET_NULL,
        related_name='invitations',
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='sent_invitations',
        null=True,
        blank=True,
    )

    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    # Set once the invite is accepted; links to the tenant it created.
    school = models.OneToOneField(
        School,
        on_delete=models.SET_NULL,
        related_name='invitation',
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Invite for {self.email} ({self.status})'

    # -- issuing / rotating ------------------------------------------------

    @classmethod
    def issue(cls, *, email, school_name, created_by=None, request=None, ttl_days=None):
        """Create an invitation and return ``(invitation, raw_token)``.

        The raw token is returned exactly once. Persist nothing but its hash.
        """
        raw = generate_token()
        ttl = settings.INVITE_EXPIRY_DAYS if ttl_days is None else ttl_days
        invitation = cls.objects.create(
            email=email,
            school_name=school_name,
            token_hash=hash_token(raw),
            created_by=created_by,
            request=request,
            expires_at=timezone.now() + timedelta(days=ttl),
        )
        return invitation, raw

    def rotate(self, ttl_days=None):
        """Issue a fresh token and reset the clock. Used by "resend".

        Rotating invalidates the previous link — a leaked or lost email cannot
        be used after a resend.
        """
        raw = generate_token()
        ttl = settings.INVITE_EXPIRY_DAYS if ttl_days is None else ttl_days
        self.token_hash = hash_token(raw)
        self.expires_at = timezone.now() + timedelta(days=ttl)
        self.revoked_at = None
        self.save(update_fields=['token_hash', 'expires_at', 'revoked_at', 'updated_at'])
        return raw

    def revoke(self):
        if self.consumed_at is None and self.revoked_at is None:
            self.revoked_at = timezone.now()
            self.save(update_fields=['revoked_at', 'updated_at'])

    # -- state -------------------------------------------------------------

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_consumed(self):
        return self.consumed_at is not None

    @property
    def is_revoked(self):
        return self.revoked_at is not None

    @property
    def is_valid(self):
        return not (self.is_consumed or self.is_revoked or self.is_expired)

    @property
    def status(self):
        if self.is_consumed:
            return 'accepted'
        if self.is_revoked:
            return 'revoked'
        if self.is_expired:
            return 'expired'
        return 'pending'

    @classmethod
    def find_valid(cls, raw_token):
        """Return the usable invitation for a raw token, or None.

        None covers every failure — unknown, expired, revoked, already used —
        so callers cannot accidentally act on a dead invite.
        """
        invitation = cls.objects.filter(token_hash=hash_token(raw_token)).first()
        if invitation is None or not invitation.is_valid:
            return None
        return invitation
