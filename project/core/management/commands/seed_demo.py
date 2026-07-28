"""Seed two demo schools so tenant isolation is visible immediately.

    python manage.py seed_demo

Creates identical structures in two separate schools. Logging in as one school's
admin and trying to reach the other's data is the fastest way to confirm the
isolation boundary works.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from cbt.models import Choice, Exam, Question, QuestionBank, Subject
from core.models import School
from accounts.models import Role
from staff.models import Notice, Staff, StaffRole, TeacherClassAssignment
from students.models import AcademicSession, Classroom, Student, Term

User = get_user_model()

DEMO_PASSWORD = 'Passw0rd!2025'

FIRST_NAMES = [
    'Ada', 'Chidi', 'Ngozi', 'Emeka', 'Fatima', 'Yusuf', 'Amara', 'Tunde',
    'Zainab', 'Obinna', 'Halima', 'Segun', 'Ifeoma', 'Musa', 'Blessing',
]
LAST_NAMES = [
    'Okafor', 'Bello', 'Adeyemi', 'Nwosu', 'Ibrahim', 'Eze', 'Danjuma',
    'Balogun', 'Chukwu', 'Sani',
]


class Command(BaseCommand):
    help = 'Create two demo schools with students, staff, exams and questions.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete existing demo schools before seeding.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options['reset']:
            deleted, _ = School.objects.filter(code__in=['DEMO1', 'DEMO2']).delete()
            self.stdout.write(f'Removed {deleted} existing demo object(s).')

        if not User.objects.filter(role=Role.SUPER_ADMIN).exists():
            User.objects.create_superuser(
                username='platformadmin',
                email='platform@example.com',
                password=DEMO_PASSWORD,
            )
            self.stdout.write(self.style.SUCCESS('Created platform superadmin.'))

        for index, (name, code) in enumerate(
            [('Greenfield Academy', 'DEMO1'), ('Sunrise College', 'DEMO2')], start=1
        ):
            self._seed_school(name, code, index)

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Demo data ready. Log in with:'))
        self.stdout.write(f'  Platform admin : platformadmin / {DEMO_PASSWORD}')
        self.stdout.write(f'  School 1 admin : admin1 / {DEMO_PASSWORD}')
        self.stdout.write(f'  School 1 teacher: teacher1 / {DEMO_PASSWORD}')
        self.stdout.write(f'  School 1 student: student1 / {DEMO_PASSWORD}')
        self.stdout.write(f'  School 2 admin : admin2 / {DEMO_PASSWORD}')
        self.stdout.write('')
        self.stdout.write(
            'Try logging in as admin1 and requesting a School 2 record id — '
            'it should 404.'
        )

    def _seed_school(self, name, code, index):
        school, created = School.objects.get_or_create(
            code=code,
            defaults={'name': name, 'email': f'info@{code.lower()}.example.com'},
        )
        if not created:
            self.stdout.write(f'{name} already exists — skipping.')
            return

        # --- academic calendar ------------------------------------------
        today = date.today()
        session = AcademicSession.objects.create(
            school=school,
            name=f'{today.year}/{today.year + 1}',
            start_date=date(today.year, 9, 1),
            end_date=date(today.year + 1, 7, 31),
            is_current=True,
        )
        # A term window wide enough that "today" always falls inside it, so
        # attendance can be marked immediately after seeding.
        term = Term.objects.create(
            school=school,
            session=session,
            name='First Term',
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=60),
            is_current=True,
        )

        classrooms = [
            Classroom.objects.create(school=school, name=cls_name, arm=arm)
            for cls_name, arm in [('JSS 1', 'A'), ('JSS 1', 'B'), ('JSS 2', 'A')]
        ]

        # --- staff -------------------------------------------------------
        teaching_role = StaffRole.objects.create(
            school=school, name='Class Teacher', is_teaching_role=True
        )

        admin_user = User.objects.create_user(
            username=f'admin{index}',
            email=f'admin{index}@example.com',
            password=DEMO_PASSWORD,
            first_name='School',
            last_name='Administrator',
            role=Role.SCHOOL_ADMIN,
            school=school,
        )
        Staff.objects.create(
            school=school, user=admin_user, staff_number=f'{code}/ADM/001'
        )

        teacher_user = User.objects.create_user(
            username=f'teacher{index}',
            email=f'teacher{index}@example.com',
            password=DEMO_PASSWORD,
            first_name='Grace',
            last_name='Adeleke',
            role=Role.TEACHER,
            school=school,
        )
        teacher = Staff.objects.create(
            school=school,
            user=teacher_user,
            staff_number=f'{code}/TCH/001',
            role=teaching_role,
            qualification='B.Ed Mathematics',
        )
        TeacherClassAssignment.objects.create(
            school=school,
            teacher=teacher,
            classroom=classrooms[0],
            session=session,
            is_form_teacher=True,
        )

        # --- students ----------------------------------------------------
        students = []
        for i in range(24):
            classroom = classrooms[i % len(classrooms)]
            student = Student.objects.create(
                school=school,
                admission_number=f'{code}/{i + 1:03d}',
                first_name=FIRST_NAMES[i % len(FIRST_NAMES)],
                last_name=LAST_NAMES[i % len(LAST_NAMES)],
                gender='female' if i % 2 else 'male',
                date_of_birth=date(today.year - 13, (i % 12) + 1, (i % 28) + 1),
                classroom=classroom,
                parent_name=f'Mr/Mrs {LAST_NAMES[i % len(LAST_NAMES)]}',
                parent_phone=f'080{index}000{i:04d}',
                enrolled_on=session.start_date,
            )
            students.append(student)

        # Give the first student of each school a login so the CBT flow is
        # testable end to end without extra setup.
        student_user = User.objects.create_user(
            username=f'student{index}',
            email=f'student{index}@example.com',
            password=DEMO_PASSWORD,
            first_name=students[0].first_name,
            last_name=students[0].last_name,
            role=Role.STUDENT,
            school=school,
        )
        students[0].user = student_user
        students[0].save(update_fields=['user'])

        # --- CBT ---------------------------------------------------------
        subject = Subject.objects.create(
            school=school, name='Mathematics', code='MTH'
        )
        bank = QuestionBank.objects.create(
            school=school,
            subject=subject,
            name='First Term Revision',
            created_by=teacher_user,
        )

        for i in range(1, 26):
            question = Question.objects.create(
                school=school,
                bank=bank,
                text=f'What is {i} × {i}?',
                marks=2,
                difficulty='easy' if i <= 10 else 'medium',
                explanation=f'{i} × {i} = {i * i}.',
                created_by=teacher_user,
            )
            answers = [i * i, i * i + 1, i * i - 1, i * i + 2]
            for order, value in enumerate(answers):
                Choice.objects.create(
                    question=question,
                    text=str(value),
                    is_correct=(order == 0),
                    order=order,
                )

        now = timezone.now()
        exam = Exam.objects.create(
            school=school,
            title='Mathematics — First Term Test',
            subject=subject,
            bank=bank,
            session=session,
            term=term,
            instructions=(
                'Answer all questions. Your answers save automatically. '
                'The exam submits itself when the timer reaches zero.'
            ),
            question_count=10,
            duration_minutes=20,
            pass_mark_percent=50,
            starts_at=now - timedelta(hours=1),
            ends_at=now + timedelta(days=7),
            status=Exam.Status.PUBLISHED,
            created_by=teacher_user,
        )
        exam.classrooms.set(classrooms)

        Notice.objects.create(
            school=school,
            title='Submit first-term scheme of work',
            body='All class teachers should upload their scheme of work.',
            priority=Notice.Priority.HIGH,
            assigned_to=teacher,
            due_date=today + timedelta(days=7),
            created_by=admin_user,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Seeded {name}: {len(students)} students, 2 staff, 25 questions, 1 exam.'
            )
        )
