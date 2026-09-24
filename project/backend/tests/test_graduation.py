"""Graduation tracking: the final-term window, the per-student flag, and the
admin-only graduating list."""

from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from core.models import School
from students.graduation import graduation_status
from students.models import AcademicSession, Classroom, Student, Term


class GraduationTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='Green', code='GRN')
        self.admin = User.objects.create_user(
            username='admin', password='pw', role=Role.SCHOOL_ADMIN, school=self.school)
        self.teacher = User.objects.create_user(
            username='teacher', password='pw', role=Role.TEACHER, school=self.school)

        self.session = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31), is_current=True)
        self.first = Term.objects.create(
            school=self.school, session=self.session, name='First Term',
            start_date=date(2025, 9, 1), end_date=date(2025, 12, 12))
        self.second = Term.objects.create(
            school=self.school, session=self.session, name='Second Term',
            start_date=date(2026, 1, 10), end_date=date(2026, 4, 10))
        self.third = Term.objects.create(
            school=self.school, session=self.session, name='Third Term',
            start_date=date(2026, 4, 25), end_date=date(2026, 7, 31), is_current=True)

        self.final_class = Classroom.objects.create(
            school=self.school, name='SS 3', arm='A',
            graduation_stage=Classroom.GraduationStage.SCHOOL, graduates_to='Alumni')
        self.normal_class = Classroom.objects.create(
            school=self.school, name='JSS 1', arm='A')

        self.grad = Student.objects.create(
            school=self.school, admission_number='G1', first_name='Ada',
            last_name='Bello', gender='female', classroom=self.final_class)
        self.normal = Student.objects.create(
            school=self.school, admission_number='N1', first_name='Uche',
            last_name='Cole', gender='male', classroom=self.normal_class)

        self.client = APIClient()

    def as_(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def set_current_term(self, term):
        Term.objects.filter(school=self.school).update(is_current=False)
        term.is_current = True
        term.save(update_fields=['is_current'])

    # -- status ------------------------------------------------------------
    def test_status_due_in_final_term(self):
        _, _, active, due = graduation_status(self.school)
        self.assertTrue(active)
        self.assertTrue(due)

    def test_status_active_but_not_due_before_final_term(self):
        self.set_current_term(self.first)
        _, _, active, due = graduation_status(self.school)
        self.assertTrue(active)   # reminder still stands…
        self.assertFalse(due)     # …but graduation isn't imminent yet

    def test_status_inactive_without_current_session(self):
        AcademicSession.objects.filter(school=self.school).update(is_current=False)
        _, _, active, due = graduation_status(self.school)
        self.assertFalse(active)
        self.assertFalse(due)

    # -- endpoint ----------------------------------------------------------
    def test_graduating_endpoint_lists_students(self):
        resp = self.as_(self.admin).get('/api/students/graduating/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['active'])
        self.assertTrue(resp.data['due'])
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['students'][0]['admission_number'], 'G1')
        self.assertEqual(resp.data['students'][0]['graduation_stage'], 'school')

    def test_reminder_stands_before_final_term(self):
        # The constant reminder is visible all session, not only the final term.
        self.set_current_term(self.first)
        resp = self.as_(self.admin).get('/api/students/graduating/')
        self.assertTrue(resp.data['active'])
        self.assertFalse(resp.data['due'])
        self.assertEqual(resp.data['count'], 1)

    def test_reminder_empty_without_current_session(self):
        AcademicSession.objects.filter(school=self.school).update(is_current=False)
        resp = self.as_(self.admin).get('/api/students/graduating/')
        self.assertFalse(resp.data['active'])
        self.assertEqual(resp.data['count'], 0)

    def test_graduating_is_admin_only(self):
        resp = self.as_(self.teacher).get('/api/students/graduating/')
        self.assertEqual(resp.status_code, 403)

    # -- per-student flag on the list -------------------------------------
    def test_student_list_flags_graduating(self):
        resp = self.as_(self.admin).get('/api/students/', {'page_size': 50})
        rows = {s['admission_number']: s for s in resp.data['results']}
        self.assertTrue(rows['G1']['is_graduating'])
        self.assertEqual(rows['G1']['graduates_to'], 'Alumni')
        self.assertFalse(rows['N1']['is_graduating'])

    def test_flag_persists_before_final_term(self):
        self.set_current_term(self.first)
        resp = self.as_(self.admin).get('/api/students/', {'page_size': 50})
        rows = {s['admission_number']: s for s in resp.data['results']}
        self.assertTrue(rows['G1']['is_graduating'])

    def test_flag_clears_without_current_session(self):
        AcademicSession.objects.filter(school=self.school).update(is_current=False)
        resp = self.as_(self.admin).get('/api/students/', {'page_size': 50})
        rows = {s['admission_number']: s for s in resp.data['results']}
        self.assertFalse(rows['G1']['is_graduating'])
        # …but the class is still configured as a graduating class.
        self.assertEqual(rows['G1']['graduation_stage'], 'school')

    def test_admin_can_configure_class_graduation(self):
        resp = self.as_(self.admin).patch(
            f'/api/classrooms/{self.normal_class.id}/',
            {'graduation_stage': 'level', 'graduates_to': 'Senior Secondary'},
            format='json')
        self.assertEqual(resp.status_code, 200)
        self.normal_class.refresh_from_db()
        self.assertEqual(self.normal_class.graduation_stage, 'level')
        self.assertEqual(self.normal_class.graduates_to, 'Senior Secondary')
