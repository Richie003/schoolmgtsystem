"""AI question generator: gating (enable / disable / trials / premium), the
generate → review → commit flow, and tenant isolation. The LLM call is mocked —
these tests never hit Anthropic.
"""

from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Question, QuestionBank, Subject
from cbtgen.models import AIGenerationSettings, QuestionGenerationJob
from core.models import School

CANNED_QUESTIONS = [
    {
        'text': 'What is 2 + 2?',
        'options': [
            {'text': '3', 'is_correct': False},
            {'text': '4', 'is_correct': True},
            {'text': '5', 'is_correct': False},
        ],
        'difficulty': 'easy',
        'category': 'calculation',
        'explanation': '2 + 2 = 4.',
    },
    {
        'text': 'Which is a noun?',
        'options': [
            {'text': 'run', 'is_correct': False},
            {'text': 'book', 'is_correct': True},
        ],
        'difficulty': 'easy',
        'category': 'reasoning',
        'explanation': '"book" names a thing.',
    },
]

CANNED_META = {'model_used': 'claude-opus-5', 'input_tokens': 100, 'output_tokens': 200}


def base_params(**overrides):
    params = {
        'class_level': 'jss_1',
        'exam_standard': 'bece',
        'subject_name': 'Mathematics',
        'topics': 'Fractions, whole numbers',
        'complexity': 'easy',
        'calculation_ratio': 50,
        'question_count': 2,
        'question_type': 'single',
    }
    params.update(overrides)
    return params


class Fixture(TestCase):
    def setUp(self):
        super().setUp()
        self.school = School.objects.create(name='Green School', code='GRN')
        self.other = School.objects.create(name='Blue School', code='BLU')

        self.admin = User.objects.create_user(
            username='admin', password='pw', role=Role.SCHOOL_ADMIN, school=self.school,
        )
        self.teacher = User.objects.create_user(
            username='teacher', password='pw', role=Role.TEACHER, school=self.school,
        )
        self.teacher2 = User.objects.create_user(
            username='teacher2', password='pw', role=Role.TEACHER, school=self.school,
        )
        self.student = User.objects.create_user(
            username='student', password='pw', role=Role.STUDENT, school=self.school,
        )
        self.client = APIClient()

    def as_(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def _patchers(self):
        """Run generation inline (broker 'down') with a mocked LLM."""
        return (
            mock.patch('core.celery_utils.broker_reachable', return_value=False),
            mock.patch(
                'cbtgen.tasks.generate_questions',
                return_value=(CANNED_QUESTIONS, CANNED_META),
            ),
        )

    def generate(self, user, **overrides):
        p1, p2 = self._patchers()
        with p1, p2:
            return self.as_(user).post(
                '/api/cbt-gen/jobs/', base_params(**overrides), format='json'
            )


class OptionsAndAccessTests(Fixture):
    def test_options_returns_taxonomy_and_status(self):
        resp = self.as_(self.teacher).get('/api/cbt-gen/options/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('class_levels', resp.data)
        self.assertIn('subjects', resp.data)
        self.assertTrue(any(c['value'] == 'jss_1' for c in resp.data['class_levels']))
        self.assertTrue(resp.data['status']['available'])
        self.assertEqual(resp.data['status']['remaining_trials'], 3)

    def test_student_is_forbidden(self):
        self.assertEqual(self.as_(self.student).get('/api/cbt-gen/options/').status_code, 403)
        resp = self.as_(self.student).post('/api/cbt-gen/jobs/', base_params(), format='json')
        self.assertEqual(resp.status_code, 403)


class GatingTests(Fixture):
    def test_master_switch_off_blocks_generation(self):
        settings_row = AIGenerationSettings.for_school(self.school)
        settings_row.is_enabled = False
        settings_row.save()

        status_resp = self.as_(self.teacher).get('/api/cbt-gen/options/')
        self.assertFalse(status_resp.data['status']['available'])
        self.assertEqual(status_resp.data['status']['reason'], 'disabled')

        resp = self.generate(self.teacher)
        self.assertEqual(resp.status_code, 403)

    def test_disabled_for_specific_staff(self):
        settings_row = AIGenerationSettings.for_school(self.school)
        settings_row.disabled_staff.add(self.teacher)

        self.assertEqual(self.generate(self.teacher).status_code, 403)
        # A different teacher is unaffected.
        self.assertEqual(self.generate(self.teacher2).status_code, 202)

    def test_free_trials_exhaust_then_gate(self):
        settings_row = AIGenerationSettings.for_school(self.school)
        settings_row.trial_limit = 2
        settings_row.save()

        self.assertEqual(self.generate(self.teacher).status_code, 202)
        self.assertEqual(self.generate(self.teacher).status_code, 202)
        settings_row.refresh_from_db()
        self.assertEqual(settings_row.trials_used, 2)
        # Third is gated.
        self.assertEqual(self.generate(self.teacher).status_code, 403)

    def test_premium_school_is_unlimited(self):
        self.school.plan = School.Plan.PREMIUM
        self.school.save()
        settings_row = AIGenerationSettings.for_school(self.school)
        settings_row.trials_used = 99
        settings_row.trial_limit = 3
        settings_row.save()

        self.assertEqual(self.generate(self.teacher).status_code, 202)
        settings_row.refresh_from_db()
        # Premium generations don't consume trials.
        self.assertEqual(settings_row.trials_used, 99)

    def test_failed_generation_does_not_consume_a_trial(self):
        from cbtgen.services import GenerationError

        with mock.patch('core.celery_utils.broker_reachable', return_value=False), \
             mock.patch('cbtgen.tasks.generate_questions',
                        side_effect=GenerationError('boom')):
            resp = self.as_(self.teacher).post(
                '/api/cbt-gen/jobs/', base_params(), format='json'
            )
        self.assertEqual(resp.status_code, 202)
        self.assertEqual(resp.data['status'], 'failed')
        settings_row = AIGenerationSettings.for_school(self.school)
        self.assertEqual(settings_row.trials_used, 0)


class GenerationFlowTests(Fixture):
    def test_generate_reaches_ready_with_questions(self):
        resp = self.generate(self.teacher)
        self.assertEqual(resp.status_code, 202)
        self.assertEqual(resp.data['status'], 'ready')
        self.assertEqual(len(resp.data['generated']), 2)

        settings_row = AIGenerationSettings.for_school(self.school)
        self.assertEqual(settings_row.trials_used, 1)

    def test_generation_not_configured_message(self):
        # No mock of generate_questions and no API key → clear failure.
        with mock.patch('core.celery_utils.broker_reachable', return_value=False), \
             self.settings(ANTHROPIC_API_KEY=''):
            resp = self.as_(self.teacher).post(
                '/api/cbt-gen/jobs/', base_params(), format='json'
            )
        self.assertEqual(resp.data['status'], 'failed')
        self.assertIn('not configured', resp.data['error'])


class CommitTests(Fixture):
    def _ready_job(self):
        resp = self.generate(self.teacher)
        return resp.data['id']

    def test_commit_creates_questions_in_new_bank(self):
        job_id = self._ready_job()
        payload = {
            'subject_name': 'Mathematics',
            'bank_name': 'AI Mock Set',
            'questions': CANNED_QUESTIONS,
        }
        resp = self.as_(self.teacher).post(
            f'/api/cbt-gen/jobs/{job_id}/commit/', payload, format='json'
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['created'], 2)

        bank = QuestionBank.objects.get(school=self.school, name='AI Mock Set')
        self.assertEqual(bank.questions.count(), 2)
        self.assertEqual(bank.subject.name, 'Mathematics')

        job = QuestionGenerationJob.objects.get(pk=job_id)
        self.assertEqual(job.status, QuestionGenerationJob.Status.COMMITTED)
        self.assertEqual(job.committed_count, 2)

    def test_commit_into_existing_bank(self):
        subject = Subject.objects.create(school=self.school, name='Mathematics')
        bank = QuestionBank.objects.create(
            school=self.school, subject=subject, name='Existing'
        )
        job_id = self._ready_job()
        resp = self.as_(self.teacher).post(
            f'/api/cbt-gen/jobs/{job_id}/commit/',
            {'bank_id': bank.id, 'subject_id': subject.id, 'questions': CANNED_QUESTIONS},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Question.objects.filter(bank=bank).count(), 2)

    def test_commit_rejects_question_without_correct_option(self):
        job_id = self._ready_job()
        bad = [{
            'text': 'No correct answer',
            'difficulty': 'easy',
            'explanation': '',
            'options': [
                {'text': 'a', 'is_correct': False},
                {'text': 'b', 'is_correct': False},
            ],
        }]
        resp = self.as_(self.teacher).post(
            f'/api/cbt-gen/jobs/{job_id}/commit/',
            {'bank_name': 'X', 'questions': bad}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_cannot_commit_twice(self):
        job_id = self._ready_job()
        payload = {'bank_name': 'Once', 'questions': CANNED_QUESTIONS}
        self.as_(self.teacher).post(f'/api/cbt-gen/jobs/{job_id}/commit/', payload, format='json')
        resp = self.as_(self.teacher).post(
            f'/api/cbt-gen/jobs/{job_id}/commit/', payload, format='json'
        )
        self.assertEqual(resp.status_code, 400)


class SettingsAdminTests(Fixture):
    def test_admin_can_toggle_and_disable_staff(self):
        resp = self.as_(self.admin).patch(
            '/api/cbt-gen/settings/',
            {'is_enabled': False, 'disabled_staff': [self.teacher.id]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['is_enabled'])
        self.assertEqual(resp.data['disabled_staff'], [self.teacher.id])

    def test_admin_cannot_disable_staff_from_other_school(self):
        outsider = User.objects.create_user(
            username='out', password='pw', role=Role.TEACHER, school=self.other,
        )
        resp = self.as_(self.admin).patch(
            '/api/cbt-gen/settings/', {'disabled_staff': [outsider.id]}, format='json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_teacher_cannot_access_settings(self):
        self.assertEqual(self.as_(self.teacher).get('/api/cbt-gen/settings/').status_code, 403)


class IsolationTests(Fixture):
    def test_teacher_sees_only_own_jobs_admin_sees_all(self):
        j1 = self.generate(self.teacher).data['id']
        j2 = self.generate(self.teacher2).data['id']

        teacher_ids = {j['id'] for j in self.as_(self.teacher).get('/api/cbt-gen/jobs/').data['results']}
        self.assertIn(j1, teacher_ids)
        self.assertNotIn(j2, teacher_ids)

        admin_ids = {j['id'] for j in self.as_(self.admin).get('/api/cbt-gen/jobs/').data['results']}
        self.assertEqual({j1, j2}, admin_ids & {j1, j2})

    def test_cannot_reach_another_schools_job(self):
        job_id = self.generate(self.teacher).data['id']
        outsider = User.objects.create_user(
            username='out2', password='pw', role=Role.TEACHER, school=self.other,
        )
        resp = self.as_(outsider).get(f'/api/cbt-gen/jobs/{job_id}/')
        self.assertEqual(resp.status_code, 404)
