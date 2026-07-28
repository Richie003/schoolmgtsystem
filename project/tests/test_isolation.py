"""Cross-tenant isolation and RBAC.

These are the tests that must never be allowed to regress: every one of them
describes a way one school could read or write another school's data.
"""

from datetime import date, timedelta

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Role, User
from core.models import School
from students.models import AcademicSession, Classroom, Student, Term


class TenantFixtureMixin:
    def setUp(self):
        super().setUp()
        self.alpha = School.objects.create(name='Alpha School', code='ALP')
        self.beta = School.objects.create(name='Beta School', code='BET')

        self.alpha_admin = User.objects.create_user(
            username='alpha_admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.alpha,
        )
        self.beta_admin = User.objects.create_user(
            username='beta_admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.beta,
        )

        self.alpha_class = Classroom.objects.create(
            school=self.alpha, name='JSS 1', arm='A'
        )
        self.beta_class = Classroom.objects.create(
            school=self.beta, name='JSS 1', arm='A'
        )

        self.alpha_student = Student.objects.create(
            school=self.alpha, admission_number='ALP/001', first_name='Ada',
            last_name='Lovelace', gender='female', classroom=self.alpha_class,
        )
        self.beta_student = Student.objects.create(
            school=self.beta, admission_number='BET/001', first_name='Grace',
            last_name='Hopper', gender='female', classroom=self.beta_class,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class StudentIsolationTests(TenantFixtureMixin, TestCase):
    def test_list_returns_only_own_school_students(self):
        response = self.client_for(self.alpha_admin).get('/api/students/')
        self.assertEqual(response.status_code, 200)

        numbers = [row['admission_number'] for row in response.data['results']]
        self.assertEqual(numbers, ['ALP/001'])

    def test_cannot_retrieve_other_school_student(self):
        response = self.client_for(self.alpha_admin).get(
            f'/api/students/{self.beta_student.id}/'
        )
        # 404, not 403 — we do not confirm that another tenant's row exists.
        self.assertEqual(response.status_code, 404)

    def test_cannot_update_other_school_student(self):
        response = self.client_for(self.alpha_admin).patch(
            f'/api/students/{self.beta_student.id}/', {'first_name': 'Hacked'},
            format='json',
        )
        self.assertEqual(response.status_code, 404)
        self.beta_student.refresh_from_db()
        self.assertEqual(self.beta_student.first_name, 'Grace')

    def test_create_ignores_client_supplied_school(self):
        """A forged ``school`` in the body must not move the row to another tenant."""
        response = self.client_for(self.alpha_admin).post(
            '/api/students/',
            {
                'admission_number': 'ALP/002',
                'first_name': 'Alan',
                'last_name': 'Turing',
                'gender': 'male',
                'school': self.beta.id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        created = Student.objects.get(admission_number='ALP/002')
        self.assertEqual(created.school_id, self.alpha.id)

    def test_cannot_attach_student_to_other_school_classroom(self):
        response = self.client_for(self.alpha_admin).post(
            '/api/students/',
            {
                'admission_number': 'ALP/003',
                'first_name': 'Katherine',
                'last_name': 'Johnson',
                'gender': 'female',
                'classroom': self.beta_class.id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('classroom', response.data)


class RolePermissionTests(TenantFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.student_user = User.objects.create_user(
            username='ada', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.alpha,
        )
        self.alpha_student.user = self.student_user
        self.alpha_student.save()

        self.other_student = Student.objects.create(
            school=self.alpha, admission_number='ALP/009', first_name='Other',
            last_name='Pupil', gender='male', classroom=self.alpha_class,
        )

    def test_student_sees_only_their_own_record(self):
        response = self.client_for(self.student_user).get('/api/students/')
        self.assertEqual(response.status_code, 200)
        numbers = [row['admission_number'] for row in response.data['results']]
        self.assertEqual(numbers, ['ALP/001'])

    def test_student_cannot_read_classmate(self):
        response = self.client_for(self.student_user).get(
            f'/api/students/{self.other_student.id}/'
        )
        self.assertEqual(response.status_code, 404)

    def test_student_cannot_create_students(self):
        response = self.client_for(self.student_user).post(
            '/api/students/',
            {'admission_number': 'X/1', 'first_name': 'A', 'last_name': 'B',
             'gender': 'male'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_requests_are_rejected(self):
        response = APIClient().get('/api/students/')
        self.assertEqual(response.status_code, 401)

    def test_inactive_school_blocks_access(self):
        self.alpha.is_active = False
        self.alpha.save()

        response = self.client_for(self.alpha_admin).get('/api/students/')
        self.assertEqual(response.status_code, 403)


class TeacherScopeTests(TenantFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        from staff.models import Staff, TeacherClassAssignment

        self.session = AcademicSession.objects.create(
            school=self.alpha, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
        )
        self.teacher_user = User.objects.create_user(
            username='teacher1', password='Sup3rSecret!23',
            role=Role.TEACHER, school=self.alpha,
        )
        self.teacher = Staff.objects.create(
            school=self.alpha, user=self.teacher_user, staff_number='T/001'
        )

        self.unassigned_class = Classroom.objects.create(
            school=self.alpha, name='JSS 2', arm='B'
        )
        self.unassigned_student = Student.objects.create(
            school=self.alpha, admission_number='ALP/500', first_name='Not',
            last_name='Mine', gender='male', classroom=self.unassigned_class,
        )

        TeacherClassAssignment.objects.create(
            school=self.alpha, teacher=self.teacher, classroom=self.alpha_class,
            session=self.session,
        )

    def test_teacher_sees_only_assigned_class_students(self):
        response = self.client_for(self.teacher_user).get('/api/students/')
        self.assertEqual(response.status_code, 200)
        numbers = [row['admission_number'] for row in response.data['results']]
        self.assertEqual(numbers, ['ALP/001'])

    def test_teacher_cannot_create_students(self):
        response = self.client_for(self.teacher_user).post(
            '/api/students/',
            {'admission_number': 'ALP/777', 'first_name': 'New', 'last_name': 'Kid',
             'gender': 'male'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)


class AttendanceTests(TenantFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.session = AcademicSession.objects.create(
            school=self.alpha, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
            is_current=True,
        )
        self.term = Term.objects.create(
            school=self.alpha, session=self.session, name='First Term',
            start_date=date(2025, 9, 1), end_date=date(2025, 12, 12),
            is_current=True,
        )

    def _monday(self):
        day = date(2025, 9, 1)
        while day.weekday() != 0:
            day += timedelta(days=1)
        return day

    def test_bulk_mark_creates_records(self):
        response = self.client_for(self.alpha_admin).post(
            '/api/attendance/bulk-mark/',
            {
                'date': self._monday().isoformat(),
                'term': self.term.id,
                'classroom': self.alpha_class.id,
                'entries': [{'student': self.alpha_student.id, 'status': 'present'}],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['marked'], 1)

    def test_bulk_mark_is_idempotent(self):
        payload = {
            'date': self._monday().isoformat(),
            'term': self.term.id,
            'classroom': self.alpha_class.id,
            'entries': [{'student': self.alpha_student.id, 'status': 'present'}],
        }
        client = self.client_for(self.alpha_admin)
        client.post('/api/attendance/bulk-mark/', payload, format='json')

        payload['entries'][0]['status'] = 'late'
        response = client.post('/api/attendance/bulk-mark/', payload, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        from students.models import AttendanceRecord

        records = AttendanceRecord.objects.filter(student=self.alpha_student)
        self.assertEqual(records.count(), 1)
        self.assertEqual(records.first().status, 'late')

    def test_cannot_mark_other_school_student(self):
        response = self.client_for(self.alpha_admin).post(
            '/api/attendance/bulk-mark/',
            {
                'date': self._monday().isoformat(),
                'term': self.term.id,
                'entries': [{'student': self.beta_student.id, 'status': 'present'}],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('entries', response.data)

    def test_weekend_attendance_is_rejected(self):
        saturday = date(2025, 9, 6)
        self.assertEqual(saturday.weekday(), 5)

        response = self.client_for(self.alpha_admin).post(
            '/api/attendance/bulk-mark/',
            {
                'date': saturday.isoformat(),
                'term': self.term.id,
                'entries': [{'student': self.alpha_student.id, 'status': 'present'}],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_date_outside_term_is_rejected(self):
        response = self.client_for(self.alpha_admin).post(
            '/api/attendance/bulk-mark/',
            {
                'date': '2026-06-01',
                'term': self.term.id,
                'entries': [{'student': self.alpha_student.id, 'status': 'present'}],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)


class AuthTests(TenantFixtureMixin, TestCase):
    def test_login_returns_token_with_role_and_school(self):
        response = APIClient().post(
            '/api/auth/login/',
            {'username': 'alpha_admin', 'password': 'Sup3rSecret!23'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['role'], Role.SCHOOL_ADMIN)
        self.assertEqual(response.data['user']['school']['code'], 'ALP')

    def test_login_blocked_for_inactive_school(self):
        self.alpha.is_active = False
        self.alpha.save()

        response = APIClient().post(
            '/api/auth/login/',
            {'username': 'alpha_admin', 'password': 'Sup3rSecret!23'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
