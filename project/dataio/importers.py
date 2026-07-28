"""CSV importers.

Each importer follows the same two-phase contract:

    validate(rows)  -> (clean_records, errors)   # no writes, drives the preview
    commit(records) -> {'created': n, 'updated': n}

Splitting them is what makes "show a preview before saving" honest: the preview
the user approves is produced by the exact same validation the commit relies on.

Every importer is constructed with a ``school`` and stamps it on every row it
writes. A CSV can never place data into another tenant, whatever it contains.
"""

from datetime import datetime

from django.contrib.auth import get_user_model
from django.db import transaction

from accounts.models import Role
from cbt.models import Choice, Question, QuestionBank
from core.csv_utils import parse_bool
from staff.models import Staff, StaffRole
from students.models import (
    AttendanceRecord,
    CheckoutRecord,
    Classroom,
    Student,
    Term,
)

User = get_user_model()

DATE_FORMATS = ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y')
TIME_FORMATS = ('%H:%M', '%H:%M:%S', '%I:%M %p')


def text(row, key, default=''):
    """Read a cell as trimmed text, falling back to ``default`` when empty.

    Values arriving from ``csv.reader`` are always strings, but the exporters
    emit native ints and dates so that an exported file can be fed straight back
    in. Coercing here keeps the round trip working.

    A *blank* cell counts as absent, not as the empty string. Someone who
    downloads a template and fills in only the required columns leaves the
    optional ones empty — treating that as a value made ``status``, ``marks``
    and ``difficulty`` fail validation on exactly the file the template invites.
    """
    value = row.get(key)
    if value is None:
        return default

    cleaned = str(value).strip()
    return cleaned if cleaned else default


def parse_date(value, field='date'):
    value = (value or '').strip()
    if not value:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f'{field}: "{value}" is not a recognised date (use YYYY-MM-DD).')


def parse_time(value, field='time'):
    value = (value or '').strip()
    if not value:
        return None
    for fmt in TIME_FORMATS:
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    raise ValueError(f'{field}: "{value}" is not a recognised time (use HH:MM).')


class BaseImporter:
    kind = None
    required_headers = ()
    optional_headers = ()

    def __init__(self, school, context=None, user=None):
        self.school = school
        self.context = context or {}
        self.user = user

    def validate(self, rows):
        """Return ``(records, errors)`` without touching the database."""
        records, errors = [], []
        seen = set()

        for row in rows:
            line = row.get('_line')
            try:
                record = self.clean_row(row)
            except ValueError as exc:
                errors.append({'line': line, 'message': str(exc)})
                continue

            key = self.dedupe_key(record)
            if key is not None:
                if key in seen:
                    errors.append(
                        {'line': line, 'message': f'Duplicate entry "{key}" in this file.'}
                    )
                    continue
                seen.add(key)

            record['_line'] = line
            records.append(record)

        return records, errors

    def clean_row(self, row):
        raise NotImplementedError

    def dedupe_key(self, record):
        return None

    def commit(self, records):
        raise NotImplementedError

    def preview_columns(self):
        return list(self.required_headers) + list(self.optional_headers)


class StudentImporter(BaseImporter):
    kind = 'students'
    required_headers = ('admission_number', 'first_name', 'last_name', 'gender')
    optional_headers = (
        'middle_name', 'date_of_birth', 'classroom', 'arm', 'parent_name',
        'parent_phone', 'parent_email', 'address', 'status',
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Cache the school's classrooms so a 5,000-row file does not issue
        # 5,000 lookups.
        self._classrooms = {
            (c.name.lower(), (c.arm or '').lower()): c.id
            for c in Classroom.objects.filter(school=self.school)
        }
        self._existing = {
            a.lower(): pk
            for pk, a in Student.objects.filter(school=self.school).values_list(
                'id', 'admission_number'
            )
        }

    def clean_row(self, row):
        admission = text(row, 'admission_number')
        if not admission:
            raise ValueError('admission_number is required.')

        gender = text(row, 'gender').lower()
        gender_map = {'m': 'male', 'male': 'male', 'f': 'female', 'female': 'female',
                      'o': 'other', 'other': 'other'}
        if gender not in gender_map:
            raise ValueError(
                f'gender: "{text(row, "gender")}" must be male, female or other.'
            )

        classroom_id = None
        classroom_name = text(row, 'classroom')
        if classroom_name:
            arm = text(row, 'arm')
            classroom_id = self._classrooms.get((classroom_name.lower(), arm.lower()))
            if classroom_id is None:
                label = f'{classroom_name} {arm}'.strip()
                raise ValueError(
                    f'classroom: "{label}" does not exist. Create the class first.'
                )

        status = text(row, 'status', 'active').lower()
        if status not in dict(Student.Status.choices):
            raise ValueError(f'status: "{status}" is not a valid student status.')

        return {
            'admission_number': admission,
            'first_name': text(row, 'first_name'),
            'last_name': text(row, 'last_name'),
            'middle_name': text(row, 'middle_name'),
            'gender': gender_map[gender],
            'date_of_birth': parse_date(text(row, 'date_of_birth'), 'date_of_birth'),
            'classroom_id': classroom_id,
            'parent_name': text(row, 'parent_name'),
            'parent_phone': text(row, 'parent_phone'),
            'parent_email': text(row, 'parent_email'),
            'address': text(row, 'address'),
            'status': status,
            '_is_update': admission.lower() in self._existing,
        }

    def dedupe_key(self, record):
        return record['admission_number'].lower()

    @transaction.atomic
    def commit(self, records):
        created = updated = 0
        to_create = []

        for record in records:
            data = {k: v for k, v in record.items()
                    if not k.startswith('_')}
            existing_id = self._existing.get(record['admission_number'].lower())

            if existing_id:
                # Re-uploading a roster should correct details, not duplicate them.
                Student.objects.filter(pk=existing_id).update(**data)
                updated += 1
            else:
                to_create.append(Student(school=self.school, **data))
                created += 1

        if to_create:
            Student.objects.bulk_create(to_create, batch_size=500)

        return {'created': created, 'updated': updated}


class StaffImporter(BaseImporter):
    kind = 'staff'
    required_headers = ('staff_number', 'first_name', 'last_name', 'username')
    optional_headers = (
        'email', 'phone', 'role', 'account_role', 'qualification', 'specialisation',
        'date_employed', 'password',
    )

    DEFAULT_PASSWORD_PREFIX = 'Welcome@'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._roles = {
            r.name.lower(): r.id for r in StaffRole.objects.filter(school=self.school)
        }
        self._taken_usernames = set(
            User.objects.values_list('username', flat=True)
        )
        self._existing_numbers = set(
            n.lower() for n in Staff.objects.filter(school=self.school).values_list(
                'staff_number', flat=True
            )
        )

    def clean_row(self, row):
        staff_number = text(row, 'staff_number')
        username = text(row, 'username')

        if not staff_number:
            raise ValueError('staff_number is required.')
        if not username:
            raise ValueError('username is required.')
        if username in self._taken_usernames:
            raise ValueError(f'username: "{username}" is already taken.')
        if staff_number.lower() in self._existing_numbers:
            raise ValueError(f'staff_number: "{staff_number}" already exists.')

        account_role = text(row, 'account_role', 'teacher').lower()
        if account_role not in (Role.TEACHER, Role.SCHOOL_ADMIN):
            raise ValueError(
                f'account_role: "{account_role}" must be teacher or school_admin.'
            )

        role_id = None
        role_name = text(row, 'role')
        if role_name:
            role_id = self._roles.get(role_name.lower())
            if role_id is None:
                raise ValueError(f'role: "{role_name}" is not a defined staff role.')

        password = text(row, 'password')
        if not password:
            # Deterministic-but-unique starter password; staff must change it on
            # first login. Never reuse one password across a whole import.
            password = f'{self.DEFAULT_PASSWORD_PREFIX}{staff_number}'

        return {
            'staff_number': staff_number,
            'username': username,
            'first_name': text(row, 'first_name'),
            'last_name': text(row, 'last_name'),
            'email': text(row, 'email'),
            'phone': text(row, 'phone'),
            'account_role': account_role,
            'role_id': role_id,
            'qualification': text(row, 'qualification'),
            'specialisation': text(row, 'specialisation'),
            'date_employed': parse_date(text(row, 'date_employed'), 'date_employed'),
            'password': password,
        }

    def dedupe_key(self, record):
        return record['username'].lower()

    @transaction.atomic
    def commit(self, records):
        created = 0
        for record in records:
            user = User.objects.create_user(
                username=record['username'],
                email=record['email'],
                password=record['password'],
                first_name=record['first_name'],
                last_name=record['last_name'],
                role=record['account_role'],
                school=self.school,
            )
            Staff.objects.create(
                school=self.school,
                user=user,
                staff_number=record['staff_number'],
                role_id=record['role_id'],
                phone=record['phone'],
                qualification=record['qualification'],
                specialisation=record['specialisation'],
                date_employed=record['date_employed'],
            )
            created += 1
        return {'created': created, 'updated': 0}


class QuestionImporter(BaseImporter):
    kind = 'questions'
    required_headers = (
        'bank', 'text', 'option_a', 'option_b', 'correct_option',
    )
    optional_headers = (
        'option_c', 'option_d', 'option_e', 'option_f', 'question_type',
        'marks', 'difficulty', 'explanation',
    )

    OPTION_KEYS = ('a', 'b', 'c', 'd', 'e', 'f')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._banks = {
            b.name.lower(): b.id
            for b in QuestionBank.objects.filter(school=self.school)
        }

    def clean_row(self, row):
        bank_name = text(row, 'bank')
        bank_id = self._banks.get(bank_name.lower())
        if bank_id is None:
            raise ValueError(
                f'bank: "{bank_name}" does not exist. Create the question bank first.'
            )

        question_text = text(row, 'text')
        if not question_text:
            raise ValueError('text is required.')

        options = []
        for key in self.OPTION_KEYS:
            value = text(row, f'option_{key}')
            if value:
                options.append((key, value))

        if len(options) < 2:
            raise ValueError('At least two options (option_a, option_b) are required.')

        # correct_option accepts a single letter ("b"), or several for a
        # multi-answer question in any of the spellings a spreadsheet produces:
        # "a,c" / "a c" / "a;c" / "ac".
        raw_correct = text(row, 'correct_option').lower()
        correct = [
            letter
            for letter in raw_correct.replace(',', ' ').replace(';', ' ').replace('|', ' ')
            .replace('/', ' ').split()
        ]
        if len(correct) == 1 and len(correct[0]) > 1:
            correct = list(correct[0])  # "ac" -> ["a", "c"]
        correct = sorted(set(correct))

        available = [k for k, _ in options]
        if not correct:
            raise ValueError('correct_option is required.')

        unknown = [letter for letter in correct if letter not in available]
        if unknown:
            raise ValueError(
                f'correct_option: "{", ".join(unknown)}" is not among the options '
                f'provided ({", ".join(available)}).'
            )

        declared_type = text(row, 'question_type').lower()
        if declared_type and declared_type not in dict(Question.Kind.choices):
            raise ValueError(
                f'question_type: "{declared_type}" must be single or multiple.'
            )
        # Infer from the key when the column is absent — the common case for a
        # file exported before multi-answer existed.
        question_type = declared_type or (
            Question.Kind.MULTIPLE if len(correct) > 1 else Question.Kind.SINGLE
        )

        if question_type == Question.Kind.SINGLE and len(correct) > 1:
            raise ValueError(
                'correct_option lists several answers, so question_type must be '
                '"multiple".'
            )
        if question_type == Question.Kind.MULTIPLE and len(correct) == len(options):
            raise ValueError(
                'Every option is marked correct; at least one must be incorrect.'
            )

        marks_raw = text(row, 'marks', '1')
        try:
            marks = int(marks_raw)
        except ValueError:
            raise ValueError(f'marks: "{marks_raw}" is not a whole number.')
        if marks < 1:
            raise ValueError('marks must be at least 1.')

        difficulty = text(row, 'difficulty', 'medium').lower()
        if difficulty not in dict(Question.Difficulty.choices):
            raise ValueError(
                f'difficulty: "{difficulty}" must be easy, medium or hard.'
            )

        return {
            'bank_id': bank_id,
            'text': question_text,
            'question_type': question_type,
            'marks': marks,
            'difficulty': difficulty,
            'explanation': text(row, 'explanation'),
            'options': options,
            'correct': correct,
        }

    @transaction.atomic
    def commit(self, records):
        created = 0
        for record in records:
            question = Question.objects.create(
                school=self.school,
                bank_id=record['bank_id'],
                text=record['text'],
                question_type=record['question_type'],
                marks=record['marks'],
                difficulty=record['difficulty'],
                explanation=record['explanation'],
                created_by=self.user,
            )
            correct_keys = set(record['correct'])
            Choice.objects.bulk_create(
                Choice(
                    question=question,
                    text=value,
                    is_correct=(key in correct_keys),
                    order=index,
                )
                for index, (key, value) in enumerate(record['options'])
            )
            created += 1
        return {'created': created, 'updated': 0}


class TermScopedImporter(BaseImporter):
    """Shared setup for imports that hang off a term, keyed by admission number."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        term_id = self.context.get('term')
        if not term_id:
            raise ValueError('A term must be selected before importing this file.')

        self.term = Term.objects.filter(
            school=self.school, pk=term_id
        ).select_related('session').first()
        if self.term is None:
            raise ValueError('The selected term does not exist for this school.')

        self._students = {
            admission.lower(): (pk, classroom_id)
            for pk, admission, classroom_id in Student.objects.filter(
                school=self.school
            ).values_list('id', 'admission_number', 'classroom_id')
        }

    def resolve_student(self, row):
        admission = text(row, 'admission_number')
        if not admission:
            raise ValueError('admission_number is required.')
        found = self._students.get(admission.lower())
        if found is None:
            raise ValueError(f'admission_number: "{admission}" matches no student.')
        return found

    def check_date_in_term(self, day):
        if not self.term.contains(day):
            raise ValueError(
                f'date: {day} falls outside {self.term.name} '
                f'({self.term.start_date} to {self.term.end_date}).'
            )


class AttendanceImporter(TermScopedImporter):
    kind = 'attendance'
    required_headers = ('admission_number', 'date', 'status')
    optional_headers = ('remark',)

    def clean_row(self, row):
        student_id, classroom_id = self.resolve_student(row)

        day = parse_date(text(row, 'date'), 'date')
        if day is None:
            raise ValueError('date is required.')
        self.check_date_in_term(day)
        if day.weekday() >= 5:
            raise ValueError(f'date: {day} is a weekend; attendance is weekdays only.')

        raw_status = text(row, 'status').lower()
        valid = dict(AttendanceRecord.Status.choices)
        if raw_status in valid:
            status = raw_status
        else:
            # Tolerate yes/no registers, which are extremely common in practice.
            try:
                status = (
                    AttendanceRecord.Status.PRESENT
                    if parse_bool(raw_status, 'status')
                    else AttendanceRecord.Status.ABSENT
                )
            except ValueError:
                raise ValueError(
                    f'status: "{raw_status}" must be one of '
                    f'{", ".join(valid)} (or yes/no).'
                )

        return {
            'student_id': student_id,
            'classroom_id': classroom_id,
            'date': day,
            'status': status,
            'remark': text(row, 'remark')[:255],
        }

    def dedupe_key(self, record):
        return f'{record["student_id"]}:{record["date"]}'

    @transaction.atomic
    def commit(self, records):
        rows = [
            AttendanceRecord(
                school=self.school,
                student_id=r['student_id'],
                session=self.term.session,
                term=self.term,
                classroom_id=r['classroom_id'],
                date=r['date'],
                status=r['status'],
                remark=r['remark'],
                marked_by=self.user,
            )
            for r in records
        ]
        result = AttendanceRecord.objects.bulk_create(
            rows,
            batch_size=500,
            update_conflicts=True,
            update_fields=['status', 'remark', 'marked_by', 'updated_at'],
            unique_fields=['student', 'date'],
        )
        return {'created': len(result), 'updated': 0}


class CheckoutImporter(TermScopedImporter):
    kind = 'checkouts'
    required_headers = ('admission_number', 'date', 'checked_out_at')
    optional_headers = ('released_to', 'relationship', 'remark')

    def clean_row(self, row):
        student_id, classroom_id = self.resolve_student(row)

        day = parse_date(text(row, 'date'), 'date')
        if day is None:
            raise ValueError('date is required.')
        self.check_date_in_term(day)

        checked_out_at = parse_time(text(row, 'checked_out_at'), 'checked_out_at')
        if checked_out_at is None:
            raise ValueError('checked_out_at is required (HH:MM).')

        return {
            'student_id': student_id,
            'classroom_id': classroom_id,
            'date': day,
            'checked_out_at': checked_out_at,
            'released_to': text(row, 'released_to')[:200],
            'relationship': text(row, 'relationship')[:100],
            'remark': text(row, 'remark')[:255],
        }

    def dedupe_key(self, record):
        return f'{record["student_id"]}:{record["date"]}'

    @transaction.atomic
    def commit(self, records):
        rows = [
            CheckoutRecord(
                school=self.school,
                student_id=r['student_id'],
                session=self.term.session,
                term=self.term,
                classroom_id=r['classroom_id'],
                date=r['date'],
                checked_out_at=r['checked_out_at'],
                released_to=r['released_to'],
                relationship=r['relationship'],
                remark=r['remark'],
                recorded_by=self.user,
            )
            for r in records
        ]
        result = CheckoutRecord.objects.bulk_create(
            rows,
            batch_size=500,
            update_conflicts=True,
            update_fields=[
                'checked_out_at', 'released_to', 'relationship', 'remark',
                'recorded_by', 'updated_at',
            ],
            unique_fields=['student', 'date'],
        )
        return {'created': len(result), 'updated': 0}


IMPORTERS = {
    'students': StudentImporter,
    'staff': StaffImporter,
    'questions': QuestionImporter,
    'attendance': AttendanceImporter,
    'checkouts': CheckoutImporter,
}


def get_importer(kind, school, context=None, user=None):
    try:
        importer_class = IMPORTERS[kind]
    except KeyError:
        raise ValueError(f'Unknown import type "{kind}".')
    return importer_class(school=school, context=context, user=user)


def template_columns(kind):
    """Column list for a blank CSV template.

    Read off the class rather than an instance: the attendance and checkout
    importers require a term to *construct*, but a blank template needs no term
    — asking for one before the user has even seen the format is backwards.
    """
    try:
        importer_class = IMPORTERS[kind]
    except KeyError:
        raise ValueError(f'Unknown import type "{kind}".')

    return list(importer_class.required_headers) + list(
        importer_class.optional_headers
    )
