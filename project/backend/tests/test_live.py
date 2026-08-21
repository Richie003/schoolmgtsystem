"""Live-quiz (Kahoot-style) mode: hosting, guest join, server-side scoring
(speed + streak), answer secrecy until reveal, and the full lobby → podium
state machine.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Choice, Question, QuestionBank, Subject
from core.models import School
from live.models import GamePlayer, GameSession


class LiveFixture(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='Green', code='GRN')
        self.other = School.objects.create(name='Blue', code='BLU')

        self.admin = User.objects.create_user(
            username='admin', password='pw', role=Role.SCHOOL_ADMIN, school=self.school)
        self.student_user = User.objects.create_user(
            username='pupil', password='pw', role=Role.STUDENT, school=self.school)
        self.other_admin = User.objects.create_user(
            username='badmin', password='pw', role=Role.SCHOOL_ADMIN, school=self.other)

        self.subject = Subject.objects.create(school=self.school, name='Mathematics')
        self.bank = QuestionBank.objects.create(
            school=self.school, subject=self.subject, name='Warm-up')
        self.q1 = self.make_question('2 + 2?', correct='B')
        self.q2 = self.make_question('Capital of France?', correct='A')

        self.client = APIClient()      # host (authenticated)
        self.guest = APIClient()       # players (no auth)

    def make_question(self, text, correct='A'):
        q = Question.objects.create(
            school=self.school, bank=self.bank, text=text, marks=1)
        for i, label in enumerate(['A', 'B', 'C', 'D']):
            Choice.objects.create(
                question=q, text=label, is_correct=(label == correct), order=i)
        return q

    def correct_id(self, question):
        return question.choices.get(is_correct=True).id

    def wrong_id(self, question):
        return question.choices.filter(is_correct=False).first().id

    def as_(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    # -- host/player helpers ------------------------------------------------
    def host_session(self, **overrides):
        payload = {'bank': self.bank.id}
        payload.update(overrides)
        resp = self.as_(self.admin).post('/api/live/sessions/', payload, format='json')
        assert resp.status_code == 201, resp.data
        return resp.data

    def join(self, pin, nickname):
        return self.guest.post(
            f'/api/live/play/{pin}/join/', {'nickname': nickname}, format='json')

    def state(self, pin, token):
        return self.guest.get(f'/api/live/play/{pin}/state/', {'token': token})

    def answer(self, pin, token, choice_ids):
        return self.guest.post(
            f'/api/live/play/{pin}/answer/',
            {'token': token, 'choice_ids': choice_ids}, format='json')


class HostingTests(LiveFixture):
    def test_create_allocates_pin_and_lobby(self):
        data = self.host_session(title='Friday Fun')
        self.assertEqual(data['status'], 'lobby')
        self.assertEqual(len(data['pin']), 6)
        self.assertEqual(data['title'], 'Friday Fun')

    def test_title_defaults_to_bank(self):
        data = self.host_session()
        self.assertIn('Warm-up', data['title'])

    def test_students_cannot_host(self):
        resp = self.as_(self.student_user).post(
            '/api/live/sessions/', {'bank': self.bank.id}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_cannot_host_from_another_schools_bank(self):
        foreign_bank = QuestionBank.objects.create(
            school=self.other,
            subject=Subject.objects.create(school=self.other, name='X'),
            name='Foreign')
        resp = self.as_(self.admin).post(
            '/api/live/sessions/', {'bank': foreign_bank.id}, format='json')
        # The bank isn't in the admin's tenant queryset, so it fails validation.
        self.assertIn(resp.status_code, (400, 403))

    def test_session_is_tenant_scoped(self):
        data = self.host_session()
        resp = self.as_(self.other_admin).get(f"/api/live/sessions/{data['id']}/")
        self.assertEqual(resp.status_code, 404)


class JoinTests(LiveFixture):
    def test_join_returns_token(self):
        pin = self.host_session()['pin']
        resp = self.join(pin, 'Ada')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['token'])
        self.assertEqual(GamePlayer.objects.count(), 1)

    def test_duplicate_nickname_rejected(self):
        pin = self.host_session()['pin']
        self.join(pin, 'Ada')
        resp = self.join(pin, 'ada')  # case-insensitive clash
        self.assertEqual(resp.status_code, 400)

    def test_blank_nickname_rejected(self):
        pin = self.host_session()['pin']
        resp = self.join(pin, '   ')
        self.assertEqual(resp.status_code, 400)

    def test_bad_pin_is_404(self):
        resp = self.join('000000', 'Ada')
        self.assertEqual(resp.status_code, 404)


class GameplayTests(LiveFixture):
    def setUp(self):
        super().setUp()
        self.pin = self.host_session(seconds_per_question=20)['pin']
        self.sid = GameSession.objects.get(pin=self.pin).id
        self.token = self.join(self.pin, 'Ada').data['token']

    def start(self):
        return self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/start/')

    # The game shuffles question order, so tests must answer whichever question
    # is actually live rather than assuming q1 comes first.
    def live_qid(self, token=None):
        return self.state(self.pin, token or self.token).data['question']['id']

    def right_for(self, qid):
        return Question.objects.get(id=qid).choices.get(is_correct=True).id

    def wrong_for(self, qid):
        return Question.objects.get(id=qid).choices.filter(is_correct=False).first().id

    def answer_right(self, token=None):
        return self.answer(self.pin, token or self.token, [self.right_for(self.live_qid(token))])

    def test_question_never_leaks_correct_answer(self):
        self.start()
        resp = self.state(self.pin, self.token)
        self.assertEqual(resp.data['status'], 'question')
        self.assertNotIn('correct_choice_ids', resp.data)
        for choice in resp.data['question']['choices']:
            self.assertNotIn('is_correct', choice)

    def test_correct_answer_scores_wrong_scores_zero(self):
        self.start()
        qid = self.live_qid()
        self.answer(self.pin, self.token, [self.right_for(qid)])       # Ada right
        bob = self.join(self.pin, 'Bob').data['token']
        self.answer(self.pin, bob, [self.wrong_for(qid)])              # Bob wrong

        ada = GamePlayer.objects.get(nickname='Ada')
        bob_p = GamePlayer.objects.get(nickname='Bob')
        self.assertGreater(ada.score, 0)
        self.assertEqual(ada.streak, 1)
        self.assertEqual(bob_p.score, 0)
        self.assertEqual(bob_p.streak, 0)

    def test_speed_bonus_rewards_faster_answers(self):
        self.start()
        qid = self.live_qid()
        session = GameSession.objects.get(pk=self.sid)

        # Ada answers immediately (started_at is 'now').
        self.answer(self.pin, self.token, [self.right_for(qid)])
        fast = GamePlayer.objects.get(nickname='Ada').score

        # Rewind the clock so Bob's identical answer looks much slower.
        GameSession.objects.filter(pk=self.sid).update(
            question_started_at=timezone.now() - timedelta(
                seconds=session.seconds_per_question - 1))
        bob = self.join(self.pin, 'Bob').data['token']
        self.answer(self.pin, bob, [self.right_for(qid)])
        slow = GamePlayer.objects.get(nickname='Bob').score

        self.assertGreater(fast, slow)

    def test_streak_adds_bonus(self):
        self.start()
        self.answer_right()
        first = GamePlayer.objects.get(nickname='Ada').score

        self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/reveal/')
        self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/next/')

        self.answer_right()
        ada = GamePlayer.objects.get(nickname='Ada')
        self.assertEqual(ada.streak, 2)
        # Two correct in a row earns the base twice plus a streak bonus.
        self.assertGreater(ada.score - first, first)

    def test_reveal_exposes_answer_and_result(self):
        self.start()
        qid = self.live_qid()
        self.answer(self.pin, self.token, [self.right_for(qid)])
        self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/reveal/')

        resp = self.state(self.pin, self.token)
        self.assertEqual(resp.data['status'], 'reveal')
        self.assertIn(self.right_for(qid), resp.data['correct_choice_ids'])
        self.assertTrue(resp.data['result']['is_correct'])

    def test_cannot_answer_twice(self):
        self.start()
        self.answer_right()
        resp = self.answer_right()
        self.assertEqual(resp.status_code, 400)

    def test_cannot_answer_before_start(self):
        resp = self.answer(self.pin, self.token, [self.correct_id(self.q1)])
        self.assertEqual(resp.status_code, 400)

    def test_foreign_choice_rejected(self):
        self.start()
        live = self.live_qid()
        foreign_qid = self.q2.id if live == self.q1.id else self.q1.id
        resp = self.answer(self.pin, self.token, [self.right_for(foreign_qid)])
        self.assertEqual(resp.status_code, 400)

    def test_full_game_reaches_podium(self):
        self.start()
        self.answer_right()
        self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/reveal/')
        self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/next/')
        self.answer_right()
        self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/reveal/')
        resp = self.as_(self.admin).post(f'/api/live/sessions/{self.sid}/next/')

        self.assertEqual(resp.data['status'], 'ended')
        podium = self.state(self.pin, self.token).data['podium']
        self.assertEqual(podium[0]['nickname'], 'Ada')
