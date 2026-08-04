"""Invite-based school onboarding: request → approve → invite → accept.

The token is the whole security boundary here, so most of these tests describe a
way the flow could go wrong: a leaked/replayed/expired link, an anonymous user
reaching an admin action, or one invite creating two schools.
"""

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from core.models import School
from onboarding.models import (
    SchoolInvitation,
    SchoolSignupRequest,
    generate_school_code,
    hash_token,
)


class OnboardingFixtureMixin:
    def setUp(self):
        super().setUp()
        self.superadmin = User.objects.create_user(
            username='platform', password='Sup3rSecret!23', role=Role.SUPER_ADMIN,
        )
        self.school = School.objects.create(name='Existing School', code='EXI')
        self.school_admin = User.objects.create_user(
            username='exiadmin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.school,
        )

    def api(self, user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user=user)
        return client


# ---------------------------------------------------------------------------
# Public request form
# ---------------------------------------------------------------------------

class SignupRequestTests(OnboardingFixtureMixin, TestCase):
    PAYLOAD = {
        'school_name': 'Sunrise Academy',
        'contact_name': 'Ada Bello',
        'contact_email': 'principal@sunrise.example.com',
        'contact_phone': '08030000000',
        'message': 'We have 400 students.',
    }

    def test_anyone_can_submit_a_request(self):
        response = self.api().post('/api/onboarding/requests/', self.PAYLOAD, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(SchoolSignupRequest.objects.count(), 1)

        lead = SchoolSignupRequest.objects.get()
        self.assertEqual(lead.status, SchoolSignupRequest.Status.PENDING)
        # A request grants nothing.
        self.assertEqual(SchoolInvitation.objects.count(), 0)
        self.assertFalse(School.objects.filter(name='Sunrise Academy').exists())

    def test_response_is_bland_and_leaks_nothing(self):
        response = self.api().post('/api/onboarding/requests/', self.PAYLOAD, format='json')
        # No id, status, or record detail — an outsider learns nothing.
        self.assertEqual(set(response.data.keys()), {'detail'})

    def test_acknowledgement_email_is_queued(self):
        self.api().post('/api/onboarding/requests/', self.PAYLOAD, format='json')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('sunrise', mail.outbox[0].to[0])

    def test_short_school_name_rejected(self):
        response = self.api().post(
            '/api/onboarding/requests/', {**self.PAYLOAD, 'school_name': 'A'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_anonymous_cannot_list_requests(self):
        self.assertEqual(self.api().get('/api/onboarding/requests/').status_code, 401)

    def test_school_admin_cannot_list_requests(self):
        response = self.api(self.school_admin).get('/api/onboarding/requests/')
        self.assertEqual(response.status_code, 403)

    def test_super_admin_can_list_requests(self):
        self.api().post('/api/onboarding/requests/', self.PAYLOAD, format='json')
        response = self.api(self.superadmin).get('/api/onboarding/requests/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)


# ---------------------------------------------------------------------------
# Approve / reject
# ---------------------------------------------------------------------------

class ApprovalTests(OnboardingFixtureMixin, TestCase):
    def _make_request(self):
        return SchoolSignupRequest.objects.create(
            school_name='Sunrise Academy', contact_name='Ada',
            contact_email='ada@sunrise.example.com',
        )

    def test_approve_issues_and_emails_an_invitation(self):
        lead = self._make_request()
        mail.outbox.clear()

        response = self.api(self.superadmin).post(
            f'/api/onboarding/requests/{lead.id}/approve/', {}, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

        lead.refresh_from_db()
        self.assertEqual(lead.status, SchoolSignupRequest.Status.APPROVED)
        self.assertEqual(lead.reviewed_by, self.superadmin)

        invitation = SchoolInvitation.objects.get()
        self.assertEqual(invitation.email, 'ada@sunrise.example.com')
        self.assertEqual(invitation.request_id, lead.id)

        # The email carries a link, and the response never carries the token.
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('?invite=', mail.outbox[0].body)
        self.assertNotIn('token', response.data)

    def test_approve_can_override_name_and_email(self):
        lead = self._make_request()
        response = self.api(self.superadmin).post(
            f'/api/onboarding/requests/{lead.id}/approve/',
            {'school_name': 'Sunrise College', 'email': 'head@sunrise.example.com'},
            format='json',
        )
        invitation = SchoolInvitation.objects.get()
        self.assertEqual(invitation.school_name, 'Sunrise College')
        self.assertEqual(invitation.email, 'head@sunrise.example.com')

    def test_reject_sets_status_and_emails(self):
        lead = self._make_request()
        mail.outbox.clear()

        response = self.api(self.superadmin).post(
            f'/api/onboarding/requests/{lead.id}/reject/',
            {'reason': 'Could not verify the school.'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        lead.refresh_from_db()
        self.assertEqual(lead.status, SchoolSignupRequest.Status.REJECTED)
        self.assertEqual(lead.review_note, 'Could not verify the school.')
        self.assertEqual(len(mail.outbox), 1)

    def test_rejected_request_cannot_be_approved(self):
        lead = self._make_request()
        lead.status = SchoolSignupRequest.Status.REJECTED
        lead.save()
        response = self.api(self.superadmin).post(
            f'/api/onboarding/requests/{lead.id}/approve/', {}, format='json',
        )
        self.assertEqual(response.status_code, 409)

    def test_non_super_admin_cannot_approve(self):
        lead = self._make_request()
        self.assertEqual(
            self.api(self.school_admin)
            .post(f'/api/onboarding/requests/{lead.id}/approve/', {}, format='json')
            .status_code,
            403,
        )

    def test_super_admin_can_invite_directly(self):
        """Shape #1: invite with no prior request."""
        response = self.api(self.superadmin).post(
            '/api/onboarding/invitations/',
            {'email': 'new@school.example.com', 'school_name': 'Brand New School'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(SchoolInvitation.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)


# ---------------------------------------------------------------------------
# Token security
# ---------------------------------------------------------------------------

class TokenSecurityTests(OnboardingFixtureMixin, TestCase):
    def _issue(self, **kwargs):
        return SchoolInvitation.issue(
            email='ada@sunrise.example.com', school_name='Sunrise Academy',
            created_by=self.superadmin, **kwargs,
        )

    def test_raw_token_is_never_stored(self):
        invitation, raw = self._issue()
        invitation.refresh_from_db()
        self.assertNotEqual(invitation.token_hash, raw)
        self.assertEqual(invitation.token_hash, hash_token(raw))
        self.assertNotIn(raw, [invitation.token_hash])

    def test_validate_accepts_a_good_token(self):
        _, raw = self._issue()
        response = self.api().get(f'/api/onboarding/invite/{raw}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['email'], 'ada@sunrise.example.com')
        self.assertEqual(response.data['school_name'], 'Sunrise Academy')
        # The token must not be echoed back.
        self.assertNotIn('token', response.data)

    def test_unknown_token_404s(self):
        self.assertEqual(
            self.api().get('/api/onboarding/invite/not-a-real-token/').status_code, 404,
        )

    def test_expired_token_is_rejected(self):
        invitation, raw = self._issue()
        invitation.expires_at = timezone.now() - timedelta(hours=1)
        invitation.save()
        self.assertEqual(self.api().get(f'/api/onboarding/invite/{raw}/').status_code, 404)

    def test_revoked_token_is_rejected(self):
        invitation, raw = self._issue()
        invitation.revoke()
        self.assertEqual(self.api().get(f'/api/onboarding/invite/{raw}/').status_code, 404)

    def test_resend_invalidates_the_previous_link(self):
        invitation, old_raw = self._issue()
        new_raw = invitation.rotate()

        self.assertNotEqual(old_raw, new_raw)
        self.assertEqual(self.api().get(f'/api/onboarding/invite/{old_raw}/').status_code, 404)
        self.assertEqual(self.api().get(f'/api/onboarding/invite/{new_raw}/').status_code, 200)


# ---------------------------------------------------------------------------
# Accept → tenant creation
# ---------------------------------------------------------------------------

class AcceptInvitationTests(OnboardingFixtureMixin, TestCase):
    def _issue(self, **kwargs):
        return SchoolInvitation.issue(
            email='ada@sunrise.example.com', school_name='Sunrise Academy',
            created_by=self.superadmin, **kwargs,
        )

    ACCEPT = {
        'username': 'sunrise_admin',
        'password': 'Str0ngPassw0rd!',
        'first_name': 'Ada',
        'last_name': 'Bello',
    }

    def test_accept_creates_school_and_admin_and_logs_in(self):
        _, raw = self._issue()
        response = self.api().post(
            f'/api/onboarding/invite/{raw}/accept/', self.ACCEPT, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

        # Auto-login tokens.
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['role'], Role.SCHOOL_ADMIN)

        school = School.objects.get(name='Sunrise Academy')
        self.assertTrue(school.is_active)
        self.assertTrue(school.code)

        admin = User.objects.get(username='sunrise_admin')
        self.assertEqual(admin.role, Role.SCHOOL_ADMIN)
        self.assertEqual(admin.school_id, school.id)
        self.assertEqual(admin.email, 'ada@sunrise.example.com')

    def test_returned_tokens_actually_work(self):
        _, raw = self._issue()
        response = self.api().post(
            f'/api/onboarding/invite/{raw}/accept/', self.ACCEPT, format='json',
        )
        access = response.data['access']

        authed = APIClient()
        authed.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        me = authed.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['username'], 'sunrise_admin')

    def test_invitation_is_single_use(self):
        _, raw = self._issue()
        self.api().post(f'/api/onboarding/invite/{raw}/accept/', self.ACCEPT, format='json')

        # The same link cannot make a second school.
        second = self.api().post(
            f'/api/onboarding/invite/{raw}/accept/',
            {**self.ACCEPT, 'username': 'another'}, format='json',
        )
        self.assertEqual(second.status_code, 404)
        self.assertEqual(School.objects.filter(name='Sunrise Academy').count(), 1)

    def test_expired_invitation_cannot_be_accepted(self):
        invitation, raw = self._issue()
        invitation.expires_at = timezone.now() - timedelta(minutes=1)
        invitation.save()
        response = self.api().post(
            f'/api/onboarding/invite/{raw}/accept/', self.ACCEPT, format='json',
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(School.objects.filter(name='Sunrise Academy').exists())

    def test_duplicate_username_rejected(self):
        _, raw = self._issue()
        response = self.api().post(
            f'/api/onboarding/invite/{raw}/accept/',
            {**self.ACCEPT, 'username': 'platform'},  # already taken
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        # No partial tenant left behind.
        self.assertFalse(School.objects.filter(name='Sunrise Academy').exists())

    def test_weak_password_rejected(self):
        _, raw = self._issue()
        response = self.api().post(
            f'/api/onboarding/invite/{raw}/accept/',
            {**self.ACCEPT, 'password': '123'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='sunrise_admin').exists())

    def test_school_name_can_be_refined_at_accept(self):
        _, raw = self._issue()
        self.api().post(
            f'/api/onboarding/invite/{raw}/accept/',
            {**self.ACCEPT, 'school_name': 'Sunrise International Academy'},
            format='json',
        )
        self.assertTrue(
            School.objects.filter(name='Sunrise International Academy').exists()
        )

    def test_accepting_marks_the_linked_request_approved(self):
        lead = SchoolSignupRequest.objects.create(
            school_name='Sunrise Academy', contact_name='Ada',
            contact_email='ada@sunrise.example.com',
        )
        _, raw = self._issue(request=lead)
        self.api().post(f'/api/onboarding/invite/{raw}/accept/', self.ACCEPT, format='json')
        lead.refresh_from_db()
        self.assertEqual(lead.status, SchoolSignupRequest.Status.APPROVED)

    def test_new_tenant_is_isolated_from_existing_schools(self):
        _, raw = self._issue()
        response = self.api().post(
            f'/api/onboarding/invite/{raw}/accept/', self.ACCEPT, format='json',
        )
        access = response.data['access']

        authed = APIClient()
        authed.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        # The brand-new admin sees an empty student roster, not the other
        # school's data.
        students = authed.get('/api/students/')
        self.assertEqual(students.status_code, 200)
        self.assertEqual(students.data['count'], 0)


class RevokeResendTests(OnboardingFixtureMixin, TestCase):
    def _issue(self):
        return SchoolInvitation.issue(
            email='ada@sunrise.example.com', school_name='Sunrise Academy',
            created_by=self.superadmin,
        )

    def test_super_admin_revokes_an_invitation(self):
        invitation, _ = self._issue()
        response = self.api(self.superadmin).post(
            f'/api/onboarding/invitations/{invitation.id}/revoke/'
        )
        self.assertEqual(response.status_code, 200)
        invitation.refresh_from_db()
        self.assertTrue(invitation.is_revoked)

    def test_resend_rotates_and_emails(self):
        invitation, _ = self._issue()
        mail.outbox.clear()
        before = invitation.token_hash

        response = self.api(self.superadmin).post(
            f'/api/onboarding/invitations/{invitation.id}/resend/'
        )
        self.assertEqual(response.status_code, 200)
        invitation.refresh_from_db()
        self.assertNotEqual(invitation.token_hash, before)
        self.assertEqual(len(mail.outbox), 1)

    def test_consumed_invitation_cannot_be_revoked_or_resent(self):
        invitation, raw = self._issue()
        self.api().post(
            f'/api/onboarding/invite/{raw}/accept/',
            {'username': 'a', 'password': 'Str0ngPassw0rd!',
             'first_name': 'A', 'last_name': 'B'},
            format='json',
        )
        self.assertEqual(
            self.api(self.superadmin)
            .post(f'/api/onboarding/invitations/{invitation.id}/revoke/').status_code,
            409,
        )
        self.assertEqual(
            self.api(self.superadmin)
            .post(f'/api/onboarding/invitations/{invitation.id}/resend/').status_code,
            409,
        )

    def test_non_super_admin_cannot_manage_invitations(self):
        invitation, _ = self._issue()
        self.assertEqual(
            self.api(self.school_admin)
            .post(f'/api/onboarding/invitations/{invitation.id}/revoke/').status_code,
            403,
        )
        self.assertEqual(self.api().get('/api/onboarding/invitations/').status_code, 401)


class ThrottleTests(OnboardingFixtureMixin, TestCase):
    """Throttling is disabled suite-wide (see settings_test); prove it works here.

    ``override_settings`` alone is not enough: ``SimpleRateThrottle.THROTTLE_RATES``
    is a class attribute bound to the settings dict at *import* time, and a
    settings override does not rebind it. We patch that attribute directly, which
    is exactly what the throttle reads in ``get_rate()``.
    """

    def test_public_request_form_is_rate_limited(self):
        from unittest import mock

        from django.core.cache import cache

        from core.throttling import ResilientScopedRateThrottle

        payload = {
            'school_name': 'Spammy School', 'contact_name': 'X',
            'contact_email': 'x@example.com',
        }
        with mock.patch.object(
            ResilientScopedRateThrottle, 'THROTTLE_RATES', {'school_signup': '3/hour'}
        ):
            cache.clear()
            client = self.api()
            statuses = [
                client.post('/api/onboarding/requests/', payload, format='json')
                .status_code
                for _ in range(5)
            ]

        self.assertEqual(statuses[:3], [201, 201, 201])
        self.assertIn(429, statuses[3:])

    def test_throttle_fails_open_when_cache_is_down(self):
        """A cache outage must not 500 the public form — it should allow through."""
        from unittest import mock

        from core.throttling import ResilientScopedRateThrottle

        broken = mock.MagicMock()
        broken.get.side_effect = RuntimeError('cache unavailable')

        payload = {
            'school_name': 'Resilient School', 'contact_name': 'X',
            'contact_email': 'x@example.com',
        }
        with mock.patch.object(
            ResilientScopedRateThrottle, 'THROTTLE_RATES', {'school_signup': '1/hour'}
        ), mock.patch.object(ResilientScopedRateThrottle, 'cache', broken):
            client = self.api()
            # Even a second request inside a 1/hour limit is allowed, because the
            # throttle swallows the cache error rather than failing the request.
            first = client.post('/api/onboarding/requests/', payload, format='json')
            second = client.post('/api/onboarding/requests/', payload, format='json')

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)


class SchoolCodeTests(TestCase):
    def test_code_from_initials(self):
        self.assertEqual(generate_school_code('Saint Peters College'), 'SPC')

    def test_code_is_unique(self):
        School.objects.create(name='Saint Peters College', code='SPC')
        self.assertEqual(generate_school_code('Saint Peters College'), 'SPC2')

    def test_short_name_still_produces_a_code(self):
        code = generate_school_code('Hi')
        self.assertTrue(len(code) >= 2)
