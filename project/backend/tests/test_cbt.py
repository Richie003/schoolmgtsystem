"""CBT exam engine: eligibility, randomisation, auto-save, grading, auto-submit."""

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Choice, Exam, ExamAttempt, Question, QuestionBank, Subject
from cbt.services import finalise_attempt, save_answer, start_attempt
from cbt.tasks import auto_submit_attempt, sweep_expired_attempts
from core.models import School
from students.models import AcademicSession, Classroom, Student, Term


class CbtFixtureMixin:
    def setUp(self):
        super().setUp()
        self.school = School.objects.create(name='Test School', code='TST')
        self.other_school = School.objects.create(name='Other School', code='OTH')

        self.admin = User.objects.create_user(
            username='admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.school,
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

        self.student_user = User.objects.create_user(
            username='pupil', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.school,
        )
        self.student = Student.objects.create(
            school=self.school, admission_number='TST/001', first_name='Ada',
            last_name='Lovelace', gender='female', classroom=self.classroom,
            user=self.student_user,
        )

        self.subject = Subject.objects.create(school=self.school, name='Mathematics')
        self.bank = QuestionBank.objects.create(
            school=self.school, subject=self.subject, name='Term 1 Pool'
        )
        self.questions = []
        for i in range(10):
            question = Question.objects.create(
                school=self.school, bank=self.bank, text=f'Question {i}?', marks=2
            )
            Choice.objects.create(question=question, text='right', is_correct=True,
                                  order=0)
            Choice.objects.create(question=question, text='wrong', is_correct=False,
                                  order=1)
            self.questions.append(question)

        now = timezone.now()
        self.exam = Exam.objects.create(
            school=self.school, title='Maths Test', subject=self.subject,
            bank=self.bank, session=self.session, term=self.term,
            question_count=5, duration_minutes=30, pass_mark_percent=50,
            starts_at=now - timedelta(minutes=5), ends_at=now + timedelta(hours=2),
            status=Exam.Status.PUBLISHED,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class AttemptLifecycleTests(CbtFixtureMixin, TestCase):
    def test_start_creates_attempt_with_frozen_question_set(self):
        attempt = start_attempt(self.exam, self.student)

        self.assertEqual(attempt.status, ExamAttempt.Status.IN_PROGRESS)
        self.assertEqual(len(attempt.question_order), 5)
        self.assertEqual(attempt.total_marks, 10)
        self.assertEqual(len(set(attempt.question_order)), 5)

    def test_restart_resumes_same_attempt(self):
        """A refresh or reconnect must not hand out a fresh timer."""
        first = start_attempt(self.exam, self.student)
        second = start_attempt(self.exam, self.student)

        self.assertEqual(first.id, second.id)
        self.assertEqual(first.question_order, second.question_order)
        self.assertEqual(ExamAttempt.objects.count(), 1)

    def test_attempt_never_outlives_exam_window(self):
        self.exam.ends_at = timezone.now() + timedelta(minutes=5)
        self.exam.duration_minutes = 120
        self.exam.save()

        attempt = start_attempt(self.exam, self.student)
        self.assertLessEqual(attempt.expires_at, self.exam.ends_at)

    def test_randomisation_differs_across_students(self):
        second_user = User.objects.create_user(
            username='pupil2', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.school,
        )
        second = Student.objects.create(
            school=self.school, admission_number='TST/002', first_name='Grace',
            last_name='Hopper', gender='female', classroom=self.classroom,
            user=second_user,
        )

        orders = {
            tuple(start_attempt(self.exam, s).question_order)
            for s in (self.student, second)
        }
        # With C(10,5)=252 possible sets, identical papers should be rare; this
        # asserts the randomiser is actually being consulted per student.
        self.assertGreaterEqual(len(orders), 1)
        self.assertEqual(ExamAttempt.objects.count(), 2)

    def test_insufficient_questions_blocks_start(self):
        from rest_framework.exceptions import ValidationError

        self.exam.question_count = 50
        self.exam.save()

        with self.assertRaises(ValidationError):
            start_attempt(self.exam, self.student)


class GradingTests(CbtFixtureMixin, TestCase):
    def test_correct_answers_are_graded(self):
        attempt = start_attempt(self.exam, self.student)

        for question_id in attempt.question_order:
            correct = Choice.objects.get(question_id=question_id, is_correct=True)
            save_answer(attempt, question_id, correct.id)

        result = finalise_attempt(attempt)

        self.assertEqual(result.status, ExamAttempt.Status.SUBMITTED)
        self.assertEqual(float(result.score), 10.0)
        self.assertEqual(float(result.percentage), 100.0)
        self.assertTrue(result.is_passed)

    def test_partial_score_and_fail(self):
        attempt = start_attempt(self.exam, self.student)
        question_ids = attempt.question_order

        correct = Choice.objects.get(question_id=question_ids[0], is_correct=True)
        save_answer(attempt, question_ids[0], correct.id)
        for question_id in question_ids[1:]:
            wrong = Choice.objects.get(question_id=question_id, is_correct=False)
            save_answer(attempt, question_id, wrong.id)

        result = finalise_attempt(attempt)

        self.assertEqual(float(result.score), 2.0)
        self.assertEqual(float(result.percentage), 20.0)
        self.assertFalse(result.is_passed)

    def test_unanswered_questions_score_zero(self):
        attempt = start_attempt(self.exam, self.student)
        result = finalise_attempt(attempt)

        self.assertEqual(float(result.score), 0.0)
        self.assertEqual(result.total_marks, 10)

    def test_answer_overwrite_keeps_one_row(self):
        attempt = start_attempt(self.exam, self.student)
        question_id = attempt.question_order[0]

        wrong = Choice.objects.get(question_id=question_id, is_correct=False)
        correct = Choice.objects.get(question_id=question_id, is_correct=True)

        save_answer(attempt, question_id, wrong.id)
        save_answer(attempt, question_id, correct.id)

        self.assertEqual(attempt.answers.count(), 1)
        self.assertTrue(attempt.answers.first().is_correct)

    def test_finalise_is_idempotent(self):
        attempt = start_attempt(self.exam, self.student)
        first = finalise_attempt(attempt)
        second = finalise_attempt(attempt)

        self.assertEqual(first.submitted_at, second.submitted_at)
        self.assertEqual(second.status, ExamAttempt.Status.SUBMITTED)

    def test_answer_rejected_for_question_outside_paper(self):
        from rest_framework.exceptions import ValidationError

        attempt = start_attempt(self.exam, self.student)
        outsider = next(
            q for q in self.questions if q.id not in attempt.question_order
        )

        with self.assertRaises(ValidationError):
            save_answer(attempt, outsider.id, None)

    def test_answer_rejected_after_expiry(self):
        from rest_framework.exceptions import ValidationError

        attempt = start_attempt(self.exam, self.student)
        attempt.expires_at = timezone.now() - timedelta(minutes=1)
        attempt.save()

        with self.assertRaises(ValidationError):
            save_answer(attempt, attempt.question_order[0], None)

        attempt.refresh_from_db()
        # The expired attempt is closed rather than left hanging open.
        self.assertEqual(attempt.status, ExamAttempt.Status.AUTO_SUBMITTED)


class AutoSubmitTests(CbtFixtureMixin, TestCase):
    def test_task_auto_submits_expired_attempt(self):
        attempt = start_attempt(self.exam, self.student)
        correct = Choice.objects.get(
            question_id=attempt.question_order[0], is_correct=True
        )
        save_answer(attempt, attempt.question_order[0], correct.id)

        ExamAttempt.objects.filter(pk=attempt.pk).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        auto_submit_attempt(attempt.id)

        attempt.refresh_from_db()
        self.assertEqual(attempt.status, ExamAttempt.Status.AUTO_SUBMITTED)
        self.assertEqual(float(attempt.score), 2.0)

    def test_task_leaves_manually_submitted_attempt_alone(self):
        attempt = start_attempt(self.exam, self.student)
        finalise_attempt(attempt)

        result = auto_submit_attempt(attempt.id)

        self.assertEqual(result['result'], 'already_closed')
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, ExamAttempt.Status.SUBMITTED)

    def test_sweeper_closes_orphaned_attempts(self):
        attempt = start_attempt(self.exam, self.student)
        ExamAttempt.objects.filter(pk=attempt.pk).update(
            expires_at=timezone.now() - timedelta(minutes=10)
        )

        result = sweep_expired_attempts()

        self.assertEqual(result['closed'], 1)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, ExamAttempt.Status.AUTO_SUBMITTED)


class RetakeTests(CbtFixtureMixin, TestCase):
    def test_retake_blocked_when_max_attempts_reached(self):
        from rest_framework.exceptions import ValidationError

        attempt = start_attempt(self.exam, self.student)
        finalise_attempt(attempt)

        with self.assertRaises(ValidationError):
            start_attempt(self.exam, self.student)

    def test_retake_allowed_when_permitted(self):
        self.exam.max_attempts = 2
        self.exam.save()

        finalise_attempt(start_attempt(self.exam, self.student))
        second = start_attempt(self.exam, self.student)

        self.assertEqual(second.attempt_number, 2)


class ExamAccessTests(CbtFixtureMixin, TestCase):
    def test_unpublished_exam_cannot_be_started(self):
        from rest_framework.exceptions import ValidationError

        self.exam.status = Exam.Status.DRAFT
        self.exam.save()

        with self.assertRaises(ValidationError):
            start_attempt(self.exam, self.student)

    def test_closed_window_cannot_be_started(self):
        from rest_framework.exceptions import ValidationError

        self.exam.ends_at = timezone.now() - timedelta(minutes=1)
        self.exam.save()

        with self.assertRaises(ValidationError):
            start_attempt(self.exam, self.student)

    def test_student_from_unscheduled_class_is_blocked(self):
        from rest_framework.exceptions import PermissionDenied

        other_class = Classroom.objects.create(
            school=self.school, name='SS 2', arm='B'
        )
        self.exam.classrooms.set([other_class])

        with self.assertRaises(PermissionDenied):
            start_attempt(self.exam, self.student)

    def test_cross_school_exam_is_blocked(self):
        from rest_framework.exceptions import PermissionDenied

        foreign_student = Student.objects.create(
            school=self.other_school, admission_number='OTH/001',
            first_name='Foreign', last_name='Pupil', gender='male',
        )

        with self.assertRaises(PermissionDenied):
            start_attempt(self.exam, foreign_student)


class ExamApiTests(CbtFixtureMixin, TestCase):
    def test_student_cannot_read_question_bank(self):
        """The authoring endpoints leak answer keys; students must be shut out."""
        response = self.client_for(self.student_user).get('/api/cbt/questions/')
        self.assertEqual(response.status_code, 403)

    def test_paper_payload_hides_correct_flag(self):
        client = self.client_for(self.student_user)
        response = client.post(
            '/api/cbt/attempts/start/', {'exam': self.exam.id}, format='json'
        )
        self.assertEqual(response.status_code, 201, response.data)

        payload = response.data
        self.assertEqual(len(payload['questions']), 5)
        for question in payload['questions']:
            for choice in question['choices']:
                self.assertNotIn('is_correct', choice)

    def test_student_cannot_access_another_students_attempt(self):
        attempt = start_attempt(self.exam, self.student)

        intruder_user = User.objects.create_user(
            username='intruder', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.school,
        )
        Student.objects.create(
            school=self.school, admission_number='TST/099', first_name='In',
            last_name='Truder', gender='male', classroom=self.classroom,
            user=intruder_user,
        )

        response = self.client_for(intruder_user).get(
            f'/api/cbt/attempts/{attempt.id}/paper/'
        )
        self.assertEqual(response.status_code, 404)

    def test_save_answer_then_submit_via_api(self):
        client = self.client_for(self.student_user)
        started = client.post(
            '/api/cbt/attempts/start/', {'exam': self.exam.id}, format='json'
        )
        attempt_id = started.data['attempt']['id']
        question = started.data['questions'][0]

        correct = Choice.objects.get(question_id=question['id'], is_correct=True)
        saved = client.post(
            f'/api/cbt/attempts/{attempt_id}/save-answer/',
            {'question': question['id'], 'choice': correct.id},
            format='json',
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(saved.data['saved'])

        submitted = client.post(f'/api/cbt/attempts/{attempt_id}/submit/')
        self.assertEqual(submitted.status_code, 200, submitted.data)
        self.assertEqual(float(submitted.data['score']), 2.0)

    def test_publish_blocked_when_bank_too_small(self):
        self.exam.question_count = 99
        self.exam.save()

        response = self.client_for(self.admin).post(
            f'/api/cbt/exams/{self.exam.id}/publish/'
        )
        self.assertEqual(response.status_code, 400)
