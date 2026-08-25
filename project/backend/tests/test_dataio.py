"""CSV import validation/preview/commit and export round-tripping."""

from datetime import date, timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Choice, Exam, ExamAttempt, Question, QuestionBank, Subject
from core.models import School
from dataio.exporters import get_exporter
from dataio.importers import IMPORTERS, get_importer
from dataio.models import ImportJob
from results.models import ClassResultSheet, StudentReport, SubjectResult
from results.services import ensure_default_scheme
from students.models import AcademicSession, AttendanceRecord, Classroom, Student, Term


def csv_file(name, text):
    return SimpleUploadedFile(name, text.encode('utf-8'), content_type='text/csv')


class ImportFixtureMixin:
    def setUp(self):
        super().setUp()
        self.school = School.objects.create(name='Test School', code='TST')
        self.other_school = School.objects.create(name='Other School', code='OTH')

        self.admin = User.objects.create_user(
            username='admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.school,
        )
        self.teacher = User.objects.create_user(
            username='teacher', password='Sup3rSecret!23',
            role=Role.TEACHER, school=self.school,
        )
        self.classroom = Classroom.objects.create(
            school=self.school, name='JSS 1', arm='A'
        )
        self.session = AcademicSession.objects.create(
            school=self.school, name='2025/2026',
            start_date=date(2025, 9, 1), end_date=date(2026, 7, 31),
        )
        self.term = Term.objects.create(
            school=self.school, session=self.session, name='First Term',
            start_date=date(2025, 9, 1), end_date=date(2025, 12, 12),
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class StudentImportTests(ImportFixtureMixin, TestCase):
    GOOD_CSV = (
        'admission_number,first_name,last_name,gender,classroom,arm,parent_phone\n'
        'TST/001,Ada,Lovelace,female,JSS 1,A,08030000000\n'
        'TST/002,Alan,Turing,male,JSS 1,A,08030000001\n'
    )

    def test_upload_validates_without_writing(self):
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('students.csv', self.GOOD_CSV)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['summary']['valid_rows'], 2)
        self.assertEqual(response.data['summary']['error_rows'], 0)
        self.assertEqual(len(response.data['preview']), 2)

        # The preview must not have created anything yet.
        self.assertEqual(Student.objects.count(), 0)

    def test_commit_creates_students_in_correct_school(self):
        client = self.client_for(self.admin)
        upload = client.post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('students.csv', self.GOOD_CSV)},
            format='multipart',
        )
        job_id = upload.data['job']['id']

        response = client.post(f'/api/dataio/imports/{job_id}/commit/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['created'], 2)
        self.assertEqual(Student.objects.count(), 2)
        self.assertTrue(
            all(s.school_id == self.school.id for s in Student.objects.all())
        )
        self.assertEqual(
            Student.objects.get(admission_number='TST/001').classroom_id,
            self.classroom.id,
        )

    def test_missing_required_header_is_rejected(self):
        bad = 'first_name,last_name,gender\nAda,Lovelace,female\n'
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('bad.csv', bad)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('headers', response.data)
        self.assertIn('admission_number', str(response.data['headers']))

    def test_unknown_column_is_rejected(self):
        bad = (
            'admission_number,first_name,last_name,gender,favourite_colour\n'
            'TST/001,Ada,Lovelace,female,blue\n'
        )
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('bad.csv', bad)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_rows_are_reported_with_line_numbers(self):
        mixed = (
            'admission_number,first_name,last_name,gender\n'
            'TST/001,Ada,Lovelace,female\n'
            'TST/002,Alan,Turing,martian\n'
            ',No,Number,male\n'
        )
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('mixed.csv', mixed)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['summary']['valid_rows'], 1)
        self.assertEqual(response.data['summary']['error_rows'], 2)

        lines = [e['line'] for e in response.data['errors']]
        self.assertEqual(lines, [3, 4])

    def test_valid_rows_commit_even_when_some_fail(self):
        mixed = (
            'admission_number,first_name,last_name,gender\n'
            'TST/001,Ada,Lovelace,female\n'
            'TST/002,Alan,Turing,martian\n'
        )
        client = self.client_for(self.admin)
        upload = client.post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('mixed.csv', mixed)},
            format='multipart',
        )
        response = client.post(
            f'/api/dataio/imports/{upload.data["job"]["id"]}/commit/'
        )

        self.assertEqual(response.data['created'], 1)
        self.assertEqual(response.data['skipped'], 1)

    def test_duplicate_rows_within_file_are_caught(self):
        dupes = (
            'admission_number,first_name,last_name,gender\n'
            'TST/001,Ada,Lovelace,female\n'
            'TST/001,Ada,Duplicate,female\n'
        )
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('dupes.csv', dupes)},
            format='multipart',
        )
        self.assertEqual(response.data['summary']['valid_rows'], 1)
        self.assertEqual(response.data['summary']['error_rows'], 1)

    def test_blank_optional_columns_fall_back_to_defaults(self):
        """Every column present but the optional ones empty — the template shape.

        Regression: a blank cell used to be read as the empty string rather than
        "absent", so `status` (and marks/difficulty for questions) failed
        validation on exactly the file the downloaded template produces.
        """
        header = (
            'admission_number,first_name,last_name,gender,middle_name,'
            'date_of_birth,classroom,arm,parent_name,parent_phone,'
            'parent_email,address,status\n'
        )
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students',
             'file': csv_file('t.csv', f'{header}TST/900,Grace,Hopper,female,,,,,,,,,\n')},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['summary']['valid_rows'], 1, response.data['errors'])
        self.assertEqual(response.data['preview'][0]['status'], 'active')

    def test_blank_marks_and_difficulty_default_for_questions(self):
        subject = Subject.objects.create(school=self.school, name='Maths')
        QuestionBank.objects.create(school=self.school, subject=subject, name='Pool')

        importer = get_importer('questions', school=self.school)
        records, errors = importer.validate([{
            '_line': 2, 'bank': 'Pool', 'text': '2 + 2?',
            'option_a': '3', 'option_b': '4', 'correct_option': 'b',
            'marks': '', 'difficulty': '', 'explanation': '',
        }])

        self.assertEqual(errors, [])
        self.assertEqual(records[0]['marks'], 1)
        self.assertEqual(records[0]['difficulty'], 'medium')

    def test_unknown_classroom_is_rejected(self):
        bad = (
            'admission_number,first_name,last_name,gender,classroom\n'
            'TST/001,Ada,Lovelace,female,SS 3\n'
        )
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('bad.csv', bad)},
            format='multipart',
        )
        self.assertEqual(response.data['summary']['error_rows'], 1)
        self.assertIn('classroom', response.data['errors'][0]['message'])

    def test_import_cannot_target_another_school_classroom(self):
        """A classroom name that exists only in another tenant must not resolve."""
        Classroom.objects.create(school=self.other_school, name='ZZZ', arm='Z')
        bad = (
            'admission_number,first_name,last_name,gender,classroom,arm\n'
            'TST/001,Ada,Lovelace,female,ZZZ,Z\n'
        )
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('bad.csv', bad)},
            format='multipart',
        )
        self.assertEqual(response.data['summary']['error_rows'], 1)

    def test_recommit_is_blocked(self):
        client = self.client_for(self.admin)
        upload = client.post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('students.csv', self.GOOD_CSV)},
            format='multipart',
        )
        job_id = upload.data['job']['id']

        client.post(f'/api/dataio/imports/{job_id}/commit/')
        second = client.post(f'/api/dataio/imports/{job_id}/commit/')

        self.assertEqual(second.status_code, 409)
        self.assertEqual(Student.objects.count(), 2)

    def test_reimport_updates_existing_students(self):
        client = self.client_for(self.admin)
        first = client.post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('s.csv', self.GOOD_CSV)},
            format='multipart',
        )
        client.post(f'/api/dataio/imports/{first.data["job"]["id"]}/commit/')

        corrected = (
            'admission_number,first_name,last_name,gender\n'
            'TST/001,Adaeze,Lovelace,female\n'
        )
        second = client.post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('s2.csv', corrected)},
            format='multipart',
        )
        response = client.post(
            f'/api/dataio/imports/{second.data["job"]["id"]}/commit/'
        )

        self.assertEqual(response.data['updated'], 1)
        self.assertEqual(Student.objects.count(), 2)
        self.assertEqual(
            Student.objects.get(admission_number='TST/001').first_name, 'Adaeze'
        )

    def test_teacher_cannot_import(self):
        response = self.client_for(self.teacher).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('s.csv', self.GOOD_CSV)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 403)

    def test_cannot_read_other_school_import_job(self):
        job = ImportJob.objects.create(
            school=self.other_school, kind='students',
            file=csv_file('x.csv', self.GOOD_CSV),
        )
        response = self.client_for(self.admin).get(f'/api/dataio/imports/{job.id}/')
        self.assertEqual(response.status_code, 404)

    def test_non_csv_upload_is_rejected(self):
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students',
             'file': SimpleUploadedFile('data.xlsx', b'binary', 'application/xlsx')},
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)

    def test_bom_encoded_file_is_accepted(self):
        """Excel on Windows emits UTF-8 with BOM; it must not break the header."""
        content = '﻿' + self.GOOD_CSV
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {'kind': 'students', 'file': csv_file('bom.csv', content)},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['summary']['valid_rows'], 2)


class AttendanceImportTests(ImportFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.student = Student.objects.create(
            school=self.school, admission_number='TST/001', first_name='Ada',
            last_name='Lovelace', gender='female', classroom=self.classroom,
        )

    def test_import_requires_term(self):
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {
                'kind': 'attendance',
                'file': csv_file(
                    'a.csv',
                    'admission_number,date,status\nTST/001,2025-09-01,present\n',
                ),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('term', response.data)

    def test_attendance_commit(self):
        client = self.client_for(self.admin)
        upload = client.post(
            '/api/dataio/imports/upload/',
            {
                'kind': 'attendance',
                'term': self.term.id,
                'file': csv_file(
                    'a.csv',
                    'admission_number,date,status\n'
                    'TST/001,2025-09-01,present\n'
                    'TST/001,2025-09-02,yes\n',
                ),
            },
            format='multipart',
        )
        self.assertEqual(upload.status_code, 201, upload.data)
        self.assertEqual(upload.data['summary']['valid_rows'], 2)

        response = client.post(
            f'/api/dataio/imports/{upload.data["job"]["id"]}/commit/'
        )
        self.assertEqual(response.data['created'], 2)

        records = AttendanceRecord.objects.filter(student=self.student)
        self.assertEqual(records.count(), 2)
        self.assertTrue(all(r.term_id == self.term.id for r in records))
        self.assertTrue(all(r.status == 'present' for r in records))

    def test_date_outside_term_is_rejected(self):
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {
                'kind': 'attendance',
                'term': self.term.id,
                'file': csv_file(
                    'a.csv',
                    'admission_number,date,status\nTST/001,2026-05-01,present\n',
                ),
            },
            format='multipart',
        )
        self.assertEqual(response.data['summary']['error_rows'], 1)
        self.assertIn('outside', response.data['errors'][0]['message'])

    def test_weekend_row_is_rejected(self):
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {
                'kind': 'attendance',
                'term': self.term.id,
                'file': csv_file(
                    'a.csv',
                    'admission_number,date,status\nTST/001,2025-09-06,present\n',
                ),
            },
            format='multipart',
        )
        self.assertEqual(response.data['summary']['error_rows'], 1)
        self.assertIn('weekend', response.data['errors'][0]['message'])

    def test_unknown_admission_number_is_rejected(self):
        response = self.client_for(self.admin).post(
            '/api/dataio/imports/upload/',
            {
                'kind': 'attendance',
                'term': self.term.id,
                'file': csv_file(
                    'a.csv',
                    'admission_number,date,status\nNOPE/999,2025-09-01,present\n',
                ),
            },
            format='multipart',
        )
        self.assertEqual(response.data['summary']['error_rows'], 1)


class ExportTests(ImportFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        Student.objects.create(
            school=self.school, admission_number='TST/001', first_name='Ada',
            last_name='Lovelace', gender='female', classroom=self.classroom,
        )
        Student.objects.create(
            school=self.other_school, admission_number='OTH/001',
            first_name='Foreign', last_name='Pupil', gender='male',
        )

    def test_export_preview_is_school_scoped(self):
        response = self.client_for(self.admin).get(
            '/api/dataio/exports/preview/', {'kind': 'students'}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_rows'], 1)
        self.assertEqual(
            response.data['preview'][0]['admission_number'], 'TST/001'
        )

    def test_export_download_returns_csv(self):
        response = self.client_for(self.admin).get(
            '/api/dataio/exports/download/', {'kind': 'students'}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv')

        body = response.content.decode('utf-8')
        self.assertIn('TST/001', body)
        self.assertNotIn('OTH/001', body)

    def test_question_export_round_trips_into_importer(self):
        """Export then re-import must reproduce the same question."""
        subject = Subject.objects.create(school=self.school, name='Maths')
        bank = QuestionBank.objects.create(
            school=self.school, subject=subject, name='Pool'
        )
        question = Question.objects.create(
            school=self.school, bank=bank, text='2 + 2 = ?', marks=3
        )
        Choice.objects.create(question=question, text='3', is_correct=False, order=0)
        Choice.objects.create(question=question, text='4', is_correct=True, order=1)

        exporter = get_exporter('questions', school=self.school)
        row = exporter.rows()[0]

        self.assertEqual(row['option_a'], '3')
        self.assertEqual(row['option_b'], '4')
        self.assertEqual(row['correct_option'], 'b')

        importer = get_importer('questions', school=self.school)
        row['_line'] = 2
        records, errors = importer.validate([row])

        self.assertEqual(errors, [])
        self.assertEqual(records[0]['correct'], ['b'])
        self.assertEqual(records[0]['question_type'], 'single')
        self.assertEqual(records[0]['marks'], 3)

    def test_multi_answer_question_round_trips(self):
        """A multi-answer key must survive export and re-import intact."""
        subject = Subject.objects.create(school=self.school, name='Biology')
        bank = QuestionBank.objects.create(
            school=self.school, subject=subject, name='Pool'
        )
        question = Question.objects.create(
            school=self.school, bank=bank, text='Which are mammals?',
            question_type=Question.Kind.MULTIPLE, marks=4,
        )
        for order, (label, correct) in enumerate(
            [('Whale', True), ('Shark', False), ('Bat', True), ('Trout', False)]
        ):
            Choice.objects.create(
                question=question, text=label, is_correct=correct, order=order
            )

        exporter = get_exporter('questions', school=self.school)
        row = exporter.rows()[0]

        self.assertEqual(row['question_type'], 'multiple')
        self.assertEqual(row['correct_option'], 'a,c')

        importer = get_importer('questions', school=self.school)
        row['_line'] = 2
        records, errors = importer.validate([row])

        self.assertEqual(errors, [])
        self.assertEqual(records[0]['correct'], ['a', 'c'])
        self.assertEqual(records[0]['question_type'], 'multiple')

    def test_multi_answer_key_accepts_spreadsheet_spellings(self):
        subject = Subject.objects.create(school=self.school, name='Biology')
        QuestionBank.objects.create(school=self.school, subject=subject, name='Pool')

        for spelling in ('a,c', 'a c', 'a;c', 'ac', 'A,C'):
            importer = get_importer('questions', school=self.school)
            records, errors = importer.validate([{
                '_line': 2, 'bank': 'Pool', 'text': 'Q?',
                'option_a': 'W', 'option_b': 'X', 'option_c': 'Y', 'option_d': 'Z',
                'correct_option': spelling,
            }])
            self.assertEqual(errors, [], f'spelling {spelling!r} rejected')
            self.assertEqual(records[0]['correct'], ['a', 'c'], spelling)
            self.assertEqual(records[0]['question_type'], 'multiple', spelling)

    def test_all_options_correct_is_rejected(self):
        subject = Subject.objects.create(school=self.school, name='Biology')
        QuestionBank.objects.create(school=self.school, subject=subject, name='Pool')

        importer = get_importer('questions', school=self.school)
        records, errors = importer.validate([{
            '_line': 2, 'bank': 'Pool', 'text': 'Q?',
            'option_a': 'W', 'option_b': 'X',
            'correct_option': 'a,b',
        }])
        self.assertEqual(records, [])
        self.assertIn('at least one must be incorrect', errors[0]['message'])

    def test_single_type_with_multiple_key_is_rejected(self):
        subject = Subject.objects.create(school=self.school, name='Biology')
        QuestionBank.objects.create(school=self.school, subject=subject, name='Pool')

        importer = get_importer('questions', school=self.school)
        records, errors = importer.validate([{
            '_line': 2, 'bank': 'Pool', 'text': 'Q?', 'question_type': 'single',
            'option_a': 'W', 'option_b': 'X', 'option_c': 'Y',
            'correct_option': 'a,b',
        }])
        self.assertEqual(records, [])
        self.assertIn('must be', errors[0]['message'])

    def test_template_downloads_for_every_kind(self):
        """Including attendance and checkouts, which need no term for a blank file.

        Regression: the view used to build an importer instance just to read its
        column list, and the term-scoped importers refuse to construct without a
        term — so those two templates 400'd.
        """
        client = self.client_for(self.admin)

        for kind in ('students', 'staff', 'questions', 'attendance', 'checkouts'):
            response = client.get('/api/dataio/imports/template/', {'kind': kind})
            self.assertEqual(response.status_code, 200, f'{kind}: {response.content[:120]}')
            self.assertEqual(response['Content-Type'], 'text/csv')

            header_row = response.content.decode().splitlines()[0]
            self.assertIn(',', header_row, kind)

    def test_template_headers_match_the_importer(self):
        """A template the importer would then reject is worse than no template."""
        client = self.client_for(self.admin)

        for kind in ('students', 'staff', 'questions', 'attendance', 'checkouts'):
            response = client.get('/api/dataio/imports/template/', {'kind': kind})
            columns = response.content.decode().splitlines()[0].split(',')

            importer_class = IMPORTERS[kind]
            for required in importer_class.required_headers:
                self.assertIn(required, columns, f'{kind} template omits {required}')

    def test_template_requires_authentication(self):
        """The download must go through the API client, which carries the token."""
        response = APIClient().get('/api/dataio/imports/template/', {'kind': 'students'})
        self.assertEqual(response.status_code, 401)

    def test_template_is_admin_only(self):
        self.assertEqual(
            self.client_for(self.teacher)
            .get('/api/dataio/imports/template/', {'kind': 'students'})
            .status_code,
            403,
        )

    def test_template_rejects_unknown_kind(self):
        for params in ({'kind': 'nonsense'}, {}):
            response = self.client_for(self.admin).get(
                '/api/dataio/imports/template/', params
            )
            self.assertEqual(response.status_code, 400, params)

    def test_downloaded_template_imports_cleanly(self):
        """Fill in the students template and it must validate without errors."""
        client = self.client_for(self.admin)
        response = client.get('/api/dataio/imports/template/', {'kind': 'students'})
        header_row = response.content.decode().splitlines()[0]

        columns = header_row.split(',')
        row = {
            'admission_number': 'TPL/001', 'first_name': 'Grace',
            'last_name': 'Hopper', 'gender': 'female',
        }
        filled = ','.join(row.get(column, '') for column in columns)

        upload = client.post(
            '/api/dataio/imports/upload/',
            {'kind': 'students',
             'file': csv_file('filled.csv', f'{header_row}\n{filled}\n')},
            format='multipart',
        )
        self.assertEqual(upload.status_code, 201, upload.data)
        self.assertEqual(upload.data['summary']['valid_rows'], 1)
        self.assertEqual(upload.data['summary']['error_rows'], 0)

    def test_student_cannot_export(self):
        student_user = User.objects.create_user(
            username='pupil', password='Sup3rSecret!23',
            role=Role.STUDENT, school=self.school,
        )
        response = self.client_for(student_user).get(
            '/api/dataio/exports/download/', {'kind': 'students'}
        )
        self.assertEqual(response.status_code, 403)


class ResultsCbtExportTests(ImportFixtureMixin, TestCase):
    """CBT records and results/report-card exports: shape, finalised-only, and
    the admins-only gate."""

    def setUp(self):
        super().setUp()
        self.subject = Subject.objects.create(school=self.school, name='Mathematics')
        self.student = Student.objects.create(
            school=self.school, admission_number='RES/001', first_name='Ada',
            last_name='Bello', gender='female', classroom=self.classroom,
        )

        # --- CBT: a submitted attempt ---
        bank = QuestionBank.objects.create(
            school=self.school, subject=self.subject, name='Pool')
        now = timezone.now()
        exam = Exam.objects.create(
            school=self.school, title='Mid-Term', subject=self.subject, bank=bank,
            session=self.session, term=self.term, question_count=10,
            duration_minutes=30, starts_at=now, ends_at=now + timedelta(hours=1))
        ExamAttempt.objects.create(
            school=self.school, exam=exam, student=self.student, attempt_number=1,
            expires_at=now + timedelta(hours=1),
            status=ExamAttempt.Status.SUBMITTED,
            score=8, total_marks=10, percentage=80, is_passed=True, submitted_at=now)

        # --- Results: a cumulated sheet with one subject result + report ---
        self.scheme = ensure_default_scheme(self.school)
        comps = {c.name: c for c in self.scheme.components.all()}
        self.sheet = ClassResultSheet.objects.create(
            school=self.school, classroom=self.classroom, session=self.session,
            term=self.term, scheme=self.scheme,
            status=ClassResultSheet.Status.CUMULATED)
        self.sheet.subjects.add(self.subject)
        SubjectResult.objects.create(
            school=self.school, sheet=self.sheet, student=self.student,
            subject=self.subject,
            scores={str(comps['1st C.A.'].id): 12,
                    str(comps['2nd C.A.'].id): 13,
                    str(comps['Exam'].id): 55},
            total=80, percent=80, grade='A1', position=1, teacher_remark='Great')
        StudentReport.objects.create(
            school=self.school, sheet=self.sheet, student=self.student,
            subjects_count=1, total=80, average=80, grade='A1', position=1,
            class_size=1, attendance_present=50, attendance_absent=2,
            attendance_total=52, class_teacher_remark='Well done',
            principal_remark='Keep it up')

    def preview(self, user, kind, params=None):
        return self.client_for(user).get(
            '/api/dataio/exports/preview/', {'kind': kind, **(params or {})})

    def test_cbt_records_export(self):
        resp = self.preview(self.admin, 'cbt')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_rows'], 1)
        row = resp.data['preview'][0]
        self.assertEqual(row['exam_title'], 'Mid-Term')
        self.assertEqual(row['subject'], 'Mathematics')
        self.assertEqual(row['passed'], 'yes')
        self.assertEqual(row['status'], 'submitted')

    def test_results_broadsheet_has_component_columns(self):
        resp = self.preview(self.admin, 'results')
        self.assertEqual(resp.status_code, 200)
        for col in ('1st C.A.', '2nd C.A.', 'Exam', 'total', 'grade', 'position'):
            self.assertIn(col, resp.data['columns'])
        row = resp.data['preview'][0]
        self.assertEqual(row['subject'], 'Mathematics')
        self.assertEqual(row['Exam'], 55)
        self.assertEqual(row['grade'], 'A1')

    def test_report_cards_summary_export(self):
        resp = self.preview(self.admin, 'report_cards')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total_rows'], 1)
        row = resp.data['preview'][0]
        self.assertEqual(row['class_teacher_remark'], 'Well done')
        self.assertEqual(row['attendance_total'], 52)
        self.assertIn('average', resp.data['columns'])

    def test_open_sheets_are_not_exported(self):
        # A second, still-open sheet must not leak into the results export.
        term2 = Term.objects.create(
            school=self.school, session=self.session, name='Second Term',
            start_date=date(2026, 1, 10), end_date=date(2026, 4, 10))
        open_sheet = ClassResultSheet.objects.create(
            school=self.school, classroom=self.classroom, session=self.session,
            term=term2, scheme=self.scheme, status=ClassResultSheet.Status.OPEN)
        open_sheet.subjects.add(self.subject)
        SubjectResult.objects.create(
            school=self.school, sheet=open_sheet, student=self.student,
            subject=self.subject, scores={}, total=0, percent=0)

        resp = self.preview(self.admin, 'results')
        self.assertEqual(resp.data['total_rows'], 1)  # only the cumulated sheet

    def test_teachers_cannot_export_results_or_cbt(self):
        for kind in ('cbt', 'results', 'report_cards'):
            resp = self.preview(self.teacher, kind)
            self.assertEqual(resp.status_code, 403, kind)
        # …but a non-sensitive dataset is still fine for a teacher.
        self.assertEqual(self.preview(self.teacher, 'students').status_code, 200)

    def test_results_download_is_csv(self):
        resp = self.client_for(self.admin).get(
            '/api/dataio/exports/download/', {'kind': 'results'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'text/csv')
        body = resp.content.decode('utf-8')
        self.assertIn('RES/001', body)
        self.assertIn('Exam', body)
