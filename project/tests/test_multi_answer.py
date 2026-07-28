"""Multi-answer questions and school branding."""

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Choice, Exam, ExamAttempt, Question, QuestionBank, Subject
from cbt.services import finalise_attempt, save_answer, start_attempt
from core.models import School
from students.models import AcademicSession, Classroom, Student, Term


class MultiAnswerFixtureMixin:
    def setUp(self):
        super().setUp()
        self.school = School.objects.create(name='Test School', code='TST')
        self.admin = User.objects.create_user(
            username='admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.school,
        )
        self.teacher = User.objects.create_user(
            username='teacher', password='Sup3rSecret!23',
            role=Role.TEACHER, school=self.school,
        )
        self.classroom = Classroom.objects.create(
            school=self.school, name='SS 1', arm='A'
        )
        self.session = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
        )
        self.term = Term.objects.create(
            school=self.school, session=self.session, name='First Term',
            start_date=date(2025, 9, 1), end_date=date(2025, 12, 12),
        )
        self.subject = Subject.objects.create(school=self.school, name='Biology')
        self.bank = QuestionBank.objects.create(
            school=self.school, subject=self.subject, name='Pool'
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def make_question(self, kind=Question.Kind.MULTIPLE, marks=4):
        question = Question.objects.create(
            school=self.school, bank=self.bank, text='Which are mammals?',
            question_type=kind, marks=marks,
        )
        self.choices = [
            Choice.objects.create(question=question, text=label,
                                  is_correct=correct, order=order)
            for order, (label, correct) in enumerate(
                [('Whale', True), ('Shark', False), ('Bat', True), ('Trout', False)]
            )
        ]
        return question


class QuestionAuthoringTests(MultiAnswerFixtureMixin, TestCase):
    def test_create_multi_answer_question(self):
        response = self.client_for(self.teacher).post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id,
                'question_type': 'multiple',
                'text': 'Which are mammals?',
                'marks': 4,
                'choices': [
                    {'text': 'Whale', 'is_correct': True},
                    {'text': 'Shark', 'is_correct': False},
                    {'text': 'Bat', 'is_correct': True},
                    {'text': 'Trout', 'is_correct': False},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['question_type'], 'multiple')
        self.assertEqual(response.data['correct_count'], 2)

    def test_single_answer_rejects_two_correct_options(self):
        response = self.client_for(self.teacher).post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id, 'question_type': 'single', 'text': 'Q?',
                'choices': [
                    {'text': 'A', 'is_correct': True},
                    {'text': 'B', 'is_correct': True},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('exactly one correct option', str(response.data))

    def test_multi_answer_rejects_all_options_correct(self):
        response = self.client_for(self.teacher).post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id, 'question_type': 'multiple', 'text': 'Q?',
                'choices': [
                    {'text': 'A', 'is_correct': True},
                    {'text': 'B', 'is_correct': True},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('must be incorrect', str(response.data))

    def test_multi_answer_rejects_no_correct_option(self):
        response = self.client_for(self.teacher).post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id, 'question_type': 'multiple', 'text': 'Q?',
                'choices': [
                    {'text': 'A', 'is_correct': False},
                    {'text': 'B', 'is_correct': False},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_blank_option_rejected(self):
        response = self.client_for(self.teacher).post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id, 'text': 'Q?',
                'choices': [
                    {'text': 'A', 'is_correct': True},
                    {'text': '   ', 'is_correct': False},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_six_options_accepted(self):
        """Option count is not capped at four."""
        response = self.client_for(self.teacher).post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id, 'text': 'Q?',
                'choices': [
                    {'text': f'Option {i}', 'is_correct': i == 0} for i in range(6)
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data['choices']), 6)

    def test_teacher_edits_a_question(self):
        question = self.make_question(kind=Question.Kind.SINGLE)
        Choice.objects.filter(question=question).delete()
        Choice.objects.create(question=question, text='Old', is_correct=True, order=0)
        Choice.objects.create(question=question, text='Other', is_correct=False, order=1)

        response = self.client_for(self.teacher).patch(
            f'/api/cbt/questions/{question.id}/',
            {
                'text': 'Updated text',
                'choices': [
                    {'text': 'New A', 'is_correct': False},
                    {'text': 'New B', 'is_correct': True},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        question.refresh_from_db()
        self.assertEqual(question.text, 'Updated text')
        self.assertEqual(
            list(question.choices.values_list('text', flat=True)), ['New A', 'New B']
        )

    def test_edit_without_touching_choices(self):
        """A partial update of just the text must not wipe the options."""
        question = self.make_question()

        response = self.client_for(self.teacher).patch(
            f'/api/cbt/questions/{question.id}/',
            {'marks': 9},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        question.refresh_from_db()
        self.assertEqual(question.marks, 9)
        self.assertEqual(question.choices.count(), 4)

    def test_switching_to_single_with_two_keys_is_rejected(self):
        question = self.make_question()  # two correct options
        response = self.client_for(self.teacher).patch(
            f'/api/cbt/questions/{question.id}/',
            {'question_type': 'single'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('exactly one correct option', str(response.data))

    def test_teacher_deletes_a_question(self):
        question = self.make_question()
        response = self.client_for(self.teacher).delete(
            f'/api/cbt/questions/{question.id}/'
        )
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Question.objects.filter(pk=question.pk).exists())

    def test_student_cannot_edit_or_delete_questions(self):
        question = self.make_question()
        student_user = User.objects.create_user(
            username='pupil', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.school,
        )
        client = self.client_for(student_user)

        self.assertEqual(
            client.patch(f'/api/cbt/questions/{question.id}/',
                         {'text': 'hacked'}, format='json').status_code, 403,
        )
        self.assertEqual(
            client.delete(f'/api/cbt/questions/{question.id}/').status_code, 403,
        )


class SittingFixtureMixin(MultiAnswerFixtureMixin):
    """A published one-question exam with a student ready to sit it."""

    def setUp(self):
        super().setUp()
        self.question = self.make_question()

        self.student_user = User.objects.create_user(
            username='pupil', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.school,
        )
        self.student = Student.objects.create(
            school=self.school, admission_number='TST/001', first_name='Ada',
            last_name='Lovelace', gender='female', classroom=self.classroom,
            user=self.student_user,
        )

        now = timezone.now()
        self.exam = Exam.objects.create(
            school=self.school, title='Biology Test', subject=self.subject,
            bank=self.bank, session=self.session, term=self.term,
            question_count=1, duration_minutes=30, pass_mark_percent=50,
            starts_at=now - timedelta(minutes=5), ends_at=now + timedelta(hours=2),
            status=Exam.Status.PUBLISHED,
        )

    def ids(self, *labels):
        return [c.id for c in self.choices if c.text in labels]


class MultiAnswerGradingTests(SittingFixtureMixin, TestCase):

    def test_all_correct_options_scores_full_marks(self):
        attempt = start_attempt(self.exam, self.student)
        save_answer(attempt, self.question.id, self.ids('Whale', 'Bat'))
        result = finalise_attempt(attempt)

        self.assertEqual(float(result.score), 4.0)
        self.assertEqual(float(result.percentage), 100.0)

    def test_partial_selection_scores_zero(self):
        """All-or-nothing: one of two correct options is not enough."""
        attempt = start_attempt(self.exam, self.student)
        save_answer(attempt, self.question.id, self.ids('Whale'))
        result = finalise_attempt(attempt)

        self.assertEqual(float(result.score), 0.0)

    def test_correct_plus_incorrect_scores_zero(self):
        attempt = start_attempt(self.exam, self.student)
        save_answer(attempt, self.question.id, self.ids('Whale', 'Bat', 'Shark'))
        result = finalise_attempt(attempt)

        self.assertEqual(float(result.score), 0.0)

    def test_selection_order_does_not_matter(self):
        attempt = start_attempt(self.exam, self.student)
        save_answer(attempt, self.question.id, list(reversed(self.ids('Whale', 'Bat'))))
        result = finalise_attempt(attempt)

        self.assertEqual(float(result.score), 4.0)

    def test_duplicate_ids_are_deduplicated(self):
        attempt = start_attempt(self.exam, self.student)
        whale, bat = self.ids('Whale', 'Bat')
        save_answer(attempt, self.question.id, [whale, whale, bat])
        result = finalise_attempt(attempt)

        self.assertEqual(float(result.score), 4.0)

    def test_resaving_replaces_the_previous_selection(self):
        attempt = start_attempt(self.exam, self.student)
        save_answer(attempt, self.question.id, self.ids('Whale', 'Shark'))
        save_answer(attempt, self.question.id, self.ids('Whale', 'Bat'))

        answer = attempt.answers.get(question=self.question)
        self.assertEqual(answer.selected_choices.count(), 2)
        self.assertTrue(answer.is_correct)

    def test_clearing_an_answer(self):
        attempt = start_attempt(self.exam, self.student)
        save_answer(attempt, self.question.id, self.ids('Whale', 'Bat'))
        save_answer(attempt, self.question.id, [])

        answer = attempt.answers.get(question=self.question)
        self.assertEqual(answer.selected_choices.count(), 0)
        self.assertFalse(answer.is_correct)

    def test_choice_from_another_question_is_rejected(self):
        from rest_framework.exceptions import ValidationError

        other = self.make_question()
        attempt = start_attempt(self.exam, self.student)

        with self.assertRaises(ValidationError):
            save_answer(attempt, self.question.id,
                        [other.choices.first().id])

    def test_single_answer_question_rejects_two_selections(self):
        from rest_framework.exceptions import ValidationError

        single = self.make_question(kind=Question.Kind.SINGLE)
        single.choices.update(is_correct=False)
        first = single.choices.first()
        first.is_correct = True
        first.save()

        # Retire the multi-answer question so the single-answer one is the only
        # candidate. Without this the exam draws at random and the test passes
        # or fails depending on which question it happens to pick.
        Question.objects.filter(pk=self.question.pk).update(is_active=False)

        self.exam.question_count = 1
        self.exam.save()

        attempt = start_attempt(self.exam, self.student)
        self.assertEqual(attempt.question_order, [single.id])

        pair = list(
            Choice.objects.filter(question_id=single.id).values_list('id', flat=True)[:2]
        )
        with self.assertRaises(ValidationError):
            save_answer(attempt, single.id, pair)


class MultiAnswerApiTests(SittingFixtureMixin, TestCase):
    def test_paper_exposes_type_and_how_many_to_pick(self):
        client = self.client_for(self.student_user)
        response = client.post(
            '/api/cbt/attempts/start/', {'exam': self.exam.id}, format='json'
        )
        self.assertEqual(response.status_code, 201, response.data)

        question = response.data['questions'][0]
        self.assertEqual(question['question_type'], 'multiple')
        self.assertEqual(question['correct_count'], 2)
        self.assertEqual(question['selected_choices'], [])
        # The key itself must still never be sent.
        for choice in question['choices']:
            self.assertNotIn('is_correct', choice)

    def test_save_answers_via_api_and_resume(self):
        client = self.client_for(self.student_user)
        started = client.post(
            '/api/cbt/attempts/start/', {'exam': self.exam.id}, format='json'
        )
        attempt_id = started.data['attempt']['id']
        question = started.data['questions'][0]
        picks = [question['choices'][0]['id'], question['choices'][1]['id']]

        saved = client.post(
            f'/api/cbt/attempts/{attempt_id}/save-answer/',
            {'question': question['id'], 'choices': picks},
            format='json',
        )
        self.assertEqual(saved.status_code, 200, saved.data)

        resumed = client.get(f'/api/cbt/attempts/{attempt_id}/paper/')
        self.assertEqual(
            sorted(resumed.data['questions'][0]['selected_choices']), sorted(picks),
        )

    def test_single_choice_payload_still_accepted(self):
        """The older {"choice": id} shape must keep working."""
        single = self.make_question(kind=Question.Kind.SINGLE)
        Choice.objects.filter(question=single).update(is_correct=False)
        first = single.choices.first()
        first.is_correct = True
        first.save()

        client = self.client_for(self.student_user)
        started = client.post(
            '/api/cbt/attempts/start/', {'exam': self.exam.id}, format='json'
        )
        attempt_id = started.data['attempt']['id']
        question = started.data['questions'][0]

        response = client.post(
            f'/api/cbt/attempts/{attempt_id}/save-answer/',
            {'question': question['id'], 'choice': question['choices'][0]['id']},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_result_breakdown_lists_every_correct_option(self):
        attempt = start_attempt(self.exam, self.student)
        save_answer(attempt, self.question.id, self.ids('Whale'))
        finalise_attempt(attempt)

        response = self.client_for(self.student_user).get(
            f'/api/cbt/attempts/{attempt.id}/result/'
        )
        row = response.data['breakdown'][0]
        self.assertEqual(row['selected'], 'Whale')
        self.assertIn('Whale', row['correct_answer'])
        self.assertIn('Bat', row['correct_answer'])
        self.assertFalse(row['is_correct'])


class BrandingTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='Greenfield', code='GRN')
        self.other = School.objects.create(name='Sunrise', code='SUN')

        self.admin = User.objects.create_user(
            username='admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.school,
        )
        self.teacher = User.objects.create_user(
            username='teacher', password='Sup3rSecret!23',
            role=Role.TEACHER, school=self.school,
        )
        self.student = User.objects.create_user(
            username='pupil', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.school,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_default_brand_colour(self):
        response = self.client_for(self.admin).get('/api/school/branding/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['brand_color'], '#2563eb')

    def test_admin_updates_brand_colour(self):
        response = self.client_for(self.admin).patch(
            '/api/school/branding/',
            {'brand_color': '#16A34A', 'display_name': 'Greenfield'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['brand_color'], '#16a34a')

        self.school.refresh_from_db()
        self.assertEqual(self.school.brand_color, '#16a34a')

    def test_short_hex_is_expanded(self):
        response = self.client_for(self.admin).patch(
            '/api/school/branding/', {'brand_color': '#0a0'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['brand_color'], '#00aa00')

    def test_invalid_colour_rejected(self):
        for bad in ('red', '#12345', 'rgb(1,2,3)', ''):
            response = self.client_for(self.admin).patch(
                '/api/school/branding/', {'brand_color': bad}, format='json',
            )
            self.assertEqual(response.status_code, 400, f'{bad!r} was accepted')

    def test_branding_reaches_staff_and_students(self):
        """Every member reads the school's branding so the SPA can theme itself."""
        self.school.brand_color = '#7c3aed'
        self.school.save()

        for user in (self.teacher, self.student):
            response = self.client_for(user).get('/api/school/branding/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['brand_color'], '#7c3aed')

    def test_branding_included_in_me_payload(self):
        self.school.brand_color = '#7c3aed'
        self.school.save()

        response = self.client_for(self.student).get('/api/auth/me/')
        self.assertEqual(response.data['school']['brand_color'], '#7c3aed')

    def test_teacher_cannot_change_branding(self):
        response = self.client_for(self.teacher).patch(
            '/api/school/branding/', {'brand_color': '#000000'}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_student_cannot_change_branding(self):
        response = self.client_for(self.student).patch(
            '/api/school/branding/', {'brand_color': '#000000'}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_branding_is_per_school(self):
        self.client_for(self.admin).patch(
            '/api/school/branding/', {'brand_color': '#16a34a'}, format='json',
        )
        self.other.refresh_from_db()
        self.assertEqual(self.other.brand_color, '#2563eb')

    def test_admin_cannot_brand_another_school(self):
        """There is no school id in the payload — it always targets your own."""
        response = self.client_for(self.admin).patch(
            '/api/school/branding/',
            {'brand_color': '#16a34a', 'id': self.other.id},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        self.other.refresh_from_db()
        self.school.refresh_from_db()
        self.assertEqual(self.other.brand_color, '#2563eb')
        self.assertEqual(self.school.brand_color, '#16a34a')
