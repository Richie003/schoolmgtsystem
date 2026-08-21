"""Report-card workflow: scheme default, entry, submit → cumulate (grades +
positions) → review remarks → publish, CBT auto-fill, and access control."""

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Exam, ExamAttempt, QuestionBank, Subject
from core.models import School
from results.models import ClassResultSheet, StudentReport, SubjectResult
from staff.models import Staff, TeacherClassAssignment
from students.models import AcademicSession, Classroom, Student, Term


class ResultsFixture(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='Green', code='GRN')
        self.other = School.objects.create(name='Blue', code='BLU')

        self.admin = User.objects.create_user(
            username='admin', password='pw', role=Role.SCHOOL_ADMIN, school=self.school)
        self.teacher_user = User.objects.create_user(
            username='teacher', password='pw', role=Role.TEACHER, school=self.school)
        self.other_teacher_user = User.objects.create_user(
            username='teacher2', password='pw', role=Role.TEACHER, school=self.school)

        self.teacher = Staff.objects.create(
            school=self.school, user=self.teacher_user, staff_number='T1')
        self.other_teacher = Staff.objects.create(
            school=self.school, user=self.other_teacher_user, staff_number='T2')

        self.classroom = Classroom.objects.create(school=self.school, name='JSS1', arm='A')
        self.session = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31), is_current=True)
        self.term = Term.objects.create(
            school=self.school, session=self.session, name='First Term',
            start_date=date(2025, 9, 1), end_date=date(2025, 12, 12), is_current=True)

        # Form teacher (class teacher) of the class.
        TeacherClassAssignment.objects.create(
            school=self.school, teacher=self.teacher, classroom=self.classroom,
            session=self.session, is_form_teacher=True, is_active=True)

        self.sa_user = User.objects.create_user(
            username='sa', password='pw', role=Role.STUDENT, school=self.school)
        self.sb_user = User.objects.create_user(
            username='sb', password='pw', role=Role.STUDENT, school=self.school)
        self.stu_a = Student.objects.create(
            school=self.school, admission_number='A1', first_name='Ada', last_name='Ada',
            gender='female', classroom=self.classroom, user=self.sa_user)
        self.stu_b = Student.objects.create(
            school=self.school, admission_number='B1', first_name='Bola', last_name='Bola',
            gender='male', classroom=self.classroom, user=self.sb_user)

        self.maths = Subject.objects.create(school=self.school, name='Mathematics')
        self.english = Subject.objects.create(school=self.school, name='English')

        self.client = APIClient()

    def as_(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def make_sheet(self):
        resp = self.as_(self.admin).post('/api/results/sheets/', {
            'classroom': self.classroom.id,
            'term': self.term.id,
            'subjects': [self.maths.id, self.english.id],
        }, format='json')
        assert resp.status_code == 201, resp.data
        return ClassResultSheet.objects.get(id=resp.data['id'])

    def comp_ids(self, sheet):
        return {c.name: c.id for c in sheet.scheme.components.all()}

    def score_map(self, comps, ca1, ca2, exam):
        return {str(comps['1st C.A.']): ca1, str(comps['2nd C.A.']): ca2,
                str(comps['Exam']): exam}


class SchemeAndSheetTests(ResultsFixture):
    def test_default_scheme_is_waec(self):
        resp = self.as_(self.admin).get('/api/results/schemes/default/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['components']), 3)
        self.assertEqual(len(resp.data['bands']), 9)
        self.assertEqual(resp.data['total_max'], 100)

    def test_create_sheet_defaults_scheme_and_session(self):
        sheet = self.make_sheet()
        self.assertEqual(sheet.status, 'open')
        self.assertEqual(sheet.session_id, self.session.id)
        self.assertTrue(sheet.scheme.is_default)


class WorkflowTests(ResultsFixture):
    def _enter_scores(self, sheet):
        comps = self.comp_ids(sheet)
        rows = [
            {'student': self.stu_a.id, 'subject': self.maths.id,
             'scores': self.score_map(comps, 13, 12, 58)},   # 83 → A1
            {'student': self.stu_a.id, 'subject': self.english.id,
             'scores': self.score_map(comps, 10, 10, 50)},   # 70 → B2
            {'student': self.stu_b.id, 'subject': self.maths.id,
             'scores': self.score_map(comps, 10, 10, 40)},   # 60 → C4
            {'student': self.stu_b.id, 'subject': self.english.id,
             'scores': self.score_map(comps, 8, 7, 35)},      # 50 → C6
        ]
        resp = self.as_(self.teacher_user).post(
            f'/api/results/sheets/{sheet.id}/scores/', {'rows': rows}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_full_flow(self):
        sheet = self.make_sheet()
        self._enter_scores(sheet)

        # Submit (form teacher) → cumulate (admin)
        self.assertEqual(
            self.as_(self.teacher_user).post(f'/api/results/sheets/{sheet.id}/submit/').status_code, 200)
        self.assertEqual(
            self.as_(self.admin).post(f'/api/results/sheets/{sheet.id}/cumulate/').status_code, 200)

        maths_a = SubjectResult.objects.get(sheet=sheet, student=self.stu_a, subject=self.maths)
        self.assertEqual(float(maths_a.total), 83.0)
        self.assertEqual(maths_a.grade, 'A1')
        self.assertEqual(maths_a.position, 1)  # beats Bola's 60

        report_a = StudentReport.objects.get(sheet=sheet, student=self.stu_a)
        report_b = StudentReport.objects.get(sheet=sheet, student=self.stu_b)
        self.assertEqual(float(report_a.average), 76.5)  # (83+70)/2
        self.assertEqual(report_a.grade, 'A1')
        self.assertEqual(report_a.position, 1)
        self.assertEqual(report_b.position, 2)
        self.assertEqual(report_a.class_size, 2)

        # Class-teacher remark during review
        resp = self.as_(self.teacher_user).patch(
            f'/api/results/reports/{report_a.id}/remark/',
            {'class_teacher_remark': 'An excellent term.'}, format='json')
        self.assertEqual(resp.status_code, 200)
        report_a.refresh_from_db()
        self.assertEqual(report_a.class_teacher_remark, 'An excellent term.')

        # Publish
        self.assertEqual(
            self.as_(self.admin).post(f'/api/results/sheets/{sheet.id}/publish/').status_code, 200)
        report_a.refresh_from_db()
        self.assertIsNotNone(report_a.published_at)

        # Student sees own report only
        mine = self.as_(self.sa_user).get('/api/results/reports/mine/')
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.data), 1)

        card = self.as_(self.sa_user).get(f'/api/results/reports/{report_a.id}/')
        self.assertEqual(card.status_code, 200)
        self.assertEqual(len(card.data['subjects']), 2)
        self.assertEqual(card.data['summary']['position'], 1)
        self.assertEqual(card.data['remarks']['class_teacher'], 'An excellent term.')

        # Student B cannot read A's report
        self.assertEqual(
            self.as_(self.sb_user).get(f'/api/results/reports/{report_a.id}/').status_code, 404)

    def test_unpublished_report_hidden_from_student(self):
        sheet = self.make_sheet()
        self._enter_scores(sheet)
        self.as_(self.teacher_user).post(f'/api/results/sheets/{sheet.id}/submit/')
        self.as_(self.admin).post(f'/api/results/sheets/{sheet.id}/cumulate/')
        report_a = StudentReport.objects.get(sheet=sheet, student=self.stu_a)
        # Not published yet
        self.assertEqual(
            self.as_(self.sa_user).get(f'/api/results/reports/{report_a.id}/').status_code, 404)
        self.assertEqual(len(self.as_(self.sa_user).get('/api/results/reports/mine/').data), 0)


class PermissionTests(ResultsFixture):
    def test_non_form_teacher_cannot_submit(self):
        sheet = self.make_sheet()
        resp = self.as_(self.other_teacher_user).post(f'/api/results/sheets/{sheet.id}/submit/')
        self.assertEqual(resp.status_code, 403)

    def test_teacher_cannot_cumulate_or_publish(self):
        sheet = self.make_sheet()
        self.as_(self.teacher_user).post(f'/api/results/sheets/{sheet.id}/submit/')
        self.assertEqual(
            self.as_(self.teacher_user).post(f'/api/results/sheets/{sheet.id}/cumulate/').status_code, 403)

    def test_student_cannot_create_sheet(self):
        resp = self.as_(self.sa_user).post('/api/results/sheets/', {
            'classroom': self.classroom.id, 'term': self.term.id,
            'subjects': [self.maths.id]}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_scores_locked_after_submit(self):
        sheet = self.make_sheet()
        self.as_(self.teacher_user).post(f'/api/results/sheets/{sheet.id}/submit/')
        resp = self.as_(self.teacher_user).post(
            f'/api/results/sheets/{sheet.id}/scores/',
            {'rows': [{'student': self.stu_a.id, 'subject': self.maths.id, 'scores': {}}]},
            format='json')
        self.assertEqual(resp.status_code, 400)


class CbtAutofillTests(ResultsFixture):
    def test_autofill_fills_exam_component(self):
        bank = QuestionBank.objects.create(
            school=self.school, subject=self.maths, name='Pool')
        now = timezone.now()
        exam = Exam.objects.create(
            school=self.school, title='Maths CBT', subject=self.maths, bank=bank,
            session=self.session, term=self.term, question_count=5,
            duration_minutes=30, starts_at=now - timedelta(days=2),
            ends_at=now - timedelta(days=1), status='closed')
        ExamAttempt.objects.create(
            school=self.school, exam=exam, student=self.stu_a,
            expires_at=now, status=ExamAttempt.Status.SUBMITTED, percentage=90)

        sheet = self.make_sheet()
        resp = self.as_(self.teacher_user).post(
            f'/api/results/sheets/{sheet.id}/autofill-cbt/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['filled'], 1)

        exam_comp = sheet.scheme.components.get(is_exam=True)
        result = SubjectResult.objects.get(sheet=sheet, student=self.stu_a, subject=self.maths)
        # 90% of a 70-mark exam component = 63
        self.assertEqual(result.scores[str(exam_comp.id)], 63.0)
