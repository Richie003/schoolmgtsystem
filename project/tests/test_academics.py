"""Academic setup (sessions, terms, classes, subjects) and duplicate handling.

These cover the admin-facing setup flows the Academics screen drives, plus the
human-readable duplicate messages for attendance and checkouts.
"""

from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Subject
from core.models import School
from students.models import (
    AcademicSession,
    CheckoutRecord,
    Classroom,
    Student,
    Term,
)


class AcademicsFixtureMixin:
    def setUp(self):
        super().setUp()
        self.school = School.objects.create(name='Test School', code='TST')
        self.other = School.objects.create(name='Other School', code='OTH')

        self.admin = User.objects.create_user(
            username='admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.school,
        )
        self.teacher = User.objects.create_user(
            username='teacher', password='Sup3rSecret!23',
            role=Role.TEACHER, school=self.school,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class SessionAndTermTests(AcademicsFixtureMixin, TestCase):
    def test_admin_creates_session(self):
        response = self.client_for(self.admin).post(
            '/api/sessions/',
            {'name': '2026/2027', 'start_date': '2026-09-01',
             'end_date': '2027-07-31', 'is_current': True},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

        session = AcademicSession.objects.get(name='2026/2027')
        self.assertEqual(session.school_id, self.school.id)
        self.assertTrue(session.is_current)

    def test_setting_a_new_current_session_demotes_the_old_one(self):
        """The DB allows only one current session, so the API must swap them."""
        first = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
            is_current=True,
        )
        client = self.client_for(self.admin)

        response = client.post(
            '/api/sessions/',
            {'name': '2026/2027', 'start_date': '2026-09-01',
             'end_date': '2027-07-31', 'is_current': True},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

        first.refresh_from_db()
        self.assertFalse(first.is_current)
        self.assertEqual(
            AcademicSession.objects.filter(school=self.school, is_current=True).count(),
            1,
        )

    def test_promoting_an_existing_session_via_patch(self):
        current = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
            is_current=True,
        )
        other = AcademicSession.objects.create(
            school=self.school, name='2026/2027',
            start_date=date(2026, 9, 1), end_date=date(2027, 7, 31),
        )

        response = self.client_for(self.admin).patch(
            f'/api/sessions/{other.id}/', {'is_current': True}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

        current.refresh_from_db()
        other.refresh_from_db()
        self.assertFalse(current.is_current)
        self.assertTrue(other.is_current)

    def test_end_date_must_follow_start_date(self):
        response = self.client_for(self.admin).post(
            '/api/sessions/',
            {'name': 'Bad', 'start_date': '2026-09-01', 'end_date': '2026-01-01'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('end_date', response.data)

    def test_teacher_cannot_create_sessions(self):
        response = self.client_for(self.teacher).post(
            '/api/sessions/',
            {'name': '2026/2027', 'start_date': '2026-09-01', 'end_date': '2027-07-31'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_teacher_can_read_sessions(self):
        AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
        )
        response = self.client_for(self.teacher).get('/api/sessions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)

    def test_term_creation_and_current_swap(self):
        session = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
            is_current=True,
        )
        client = self.client_for(self.admin)

        first = client.post(
            '/api/terms/',
            {'session': session.id, 'name': 'First Term',
             'start_date': '2025-09-01', 'end_date': '2025-12-12',
             'is_current': True},
            format='json',
        )
        self.assertEqual(first.status_code, 201, first.data)

        second = client.post(
            '/api/terms/',
            {'session': session.id, 'name': 'Second Term',
             'start_date': '2026-01-05', 'end_date': '2026-04-10',
             'is_current': True},
            format='json',
        )
        self.assertEqual(second.status_code, 201, second.data)

        self.assertEqual(
            Term.objects.filter(school=self.school, is_current=True).count(), 1,
        )
        self.assertEqual(
            Term.objects.get(is_current=True).name, 'Second Term',
        )

    def test_cannot_attach_term_to_another_schools_session(self):
        foreign = AcademicSession.objects.create(
            school=self.other, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
        )
        response = self.client_for(self.admin).post(
            '/api/terms/',
            {'session': foreign.id, 'name': 'First Term',
             'start_date': '2025-09-01', 'end_date': '2025-12-12'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('session', response.data)

    def test_current_term_endpoint(self):
        session = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
            is_current=True,
        )
        Term.objects.create(
            school=self.school, session=session, name='First Term',
            start_date=date(2025, 9, 1), end_date=date(2025, 12, 12),
            is_current=True,
        )
        response = self.client_for(self.admin).get('/api/terms/current/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'First Term')

    def test_current_term_endpoint_404s_when_unset(self):
        response = self.client_for(self.admin).get('/api/terms/current/')
        self.assertEqual(response.status_code, 404)


class ClassroomTests(AcademicsFixtureMixin, TestCase):
    def test_admin_creates_classroom(self):
        response = self.client_for(self.admin).post(
            '/api/classrooms/', {'name': 'JSS 1', 'arm': 'A', 'capacity': 30},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Classroom.objects.get(name='JSS 1').school_id, self.school.id,
        )

    def test_duplicate_class_and_arm_rejected(self):
        Classroom.objects.create(school=self.school, name='JSS 1', arm='A')
        response = self.client_for(self.admin).post(
            '/api/classrooms/', {'name': 'JSS 1', 'arm': 'A'}, format='json',
        )
        self.assertIn(response.status_code, (400, 409))

    def test_same_class_name_allowed_in_another_school(self):
        Classroom.objects.create(school=self.other, name='JSS 1', arm='A')
        response = self.client_for(self.admin).post(
            '/api/classrooms/', {'name': 'JSS 1', 'arm': 'A'}, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_classroom_reports_student_count(self):
        classroom = Classroom.objects.create(school=self.school, name='JSS 1', arm='A')
        Student.objects.create(
            school=self.school, admission_number='TST/001', first_name='Ada',
            last_name='Lovelace', gender='female', classroom=classroom,
        )
        response = self.client_for(self.admin).get('/api/classrooms/')
        self.assertEqual(response.data['results'][0]['student_count'], 1)


class SubjectTests(AcademicsFixtureMixin, TestCase):
    def test_admin_creates_subject(self):
        response = self.client_for(self.admin).post(
            '/api/cbt/subjects/', {'name': 'Physics', 'code': 'PHY'}, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            Subject.objects.get(name='Physics').school_id, self.school.id,
        )

    def test_duplicate_subject_name_rejected(self):
        Subject.objects.create(school=self.school, name='Physics')
        response = self.client_for(self.admin).post(
            '/api/cbt/subjects/', {'name': 'Physics'}, format='json',
        )
        self.assertIn(response.status_code, (400, 409))

    def test_teacher_cannot_create_subject(self):
        response = self.client_for(self.teacher).post(
            '/api/cbt/subjects/', {'name': 'Physics'}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_subject_list_is_school_scoped(self):
        Subject.objects.create(school=self.other, name='Chemistry')
        Subject.objects.create(school=self.school, name='Physics')

        response = self.client_for(self.admin).get('/api/cbt/subjects/')
        names = [row['name'] for row in response.data['results']]
        self.assertEqual(names, ['Physics'])


class DuplicateRecordMessageTests(AcademicsFixtureMixin, TestCase):
    """The duplicate errors must read like something a human wrote."""

    def setUp(self):
        super().setUp()
        self.session = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
            is_current=True,
        )
        self.term = Term.objects.create(
            school=self.school, session=self.session, name='First Term',
            start_date=date(2025, 9, 1), end_date=date(2025, 12, 12),
            is_current=True,
        )
        self.classroom = Classroom.objects.create(
            school=self.school, name='JSS 1', arm='A'
        )
        self.student = Student.objects.create(
            school=self.school, admission_number='TST/001', first_name='Ada',
            last_name='Lovelace', gender='female', classroom=self.classroom,
        )

    def _weekday(self):
        day = date(2025, 9, 1)
        while day.weekday() >= 5:
            day += timedelta(days=1)
        return day

    def test_duplicate_checkout_names_the_student(self):
        payload = {
            'student': self.student.id, 'session': self.session.id,
            'term': self.term.id, 'date': self._weekday().isoformat(),
            'checked_out_at': '14:30',
        }
        client = self.client_for(self.admin)

        first = client.post('/api/checkouts/', payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)

        second = client.post('/api/checkouts/', payload, format='json')
        self.assertEqual(second.status_code, 400)

        message = str(second.data)
        self.assertIn('Ada Lovelace', message)
        self.assertIn('already checked out', message)
        # The old DRF default must not resurface.
        self.assertNotIn('must make a unique set', message)

        self.assertEqual(CheckoutRecord.objects.count(), 1)

    def test_duplicate_attendance_names_the_student(self):
        payload = {
            'student': self.student.id, 'session': self.session.id,
            'term': self.term.id, 'date': self._weekday().isoformat(),
            'status': 'present',
        }
        client = self.client_for(self.admin)

        first = client.post('/api/attendance/', payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)

        second = client.post('/api/attendance/', payload, format='json')
        self.assertEqual(second.status_code, 400)

        message = str(second.data)
        self.assertIn('Ada Lovelace', message)
        self.assertIn('already marked', message)
        self.assertNotIn('must make a unique set', message)

    def test_editing_a_checkout_does_not_trip_its_own_duplicate_check(self):
        payload = {
            'student': self.student.id, 'session': self.session.id,
            'term': self.term.id, 'date': self._weekday().isoformat(),
            'checked_out_at': '14:30',
        }
        client = self.client_for(self.admin)
        created = client.post('/api/checkouts/', payload, format='json')

        response = client.patch(
            f'/api/checkouts/{created.data["id"]}/',
            {'checked_out_at': '15:45'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['checked_out_at'], '15:45:00')

    def test_checkout_outside_term_reports_the_window(self):
        response = self.client_for(self.admin).post(
            '/api/checkouts/',
            {'student': self.student.id, 'session': self.session.id,
             'term': self.term.id, 'date': '2026-06-01', 'checked_out_at': '14:30'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('falls outside', str(response.data))
        self.assertIn('2025-12-12', str(response.data))
