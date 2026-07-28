"""CSV exporters.

Each exporter yields ``(headers, rows)`` for a school-scoped queryset. The same
function backs both the preview endpoint (first N rows as JSON) and the download
endpoint (full CSV), so what the user previews is what they get.

The querysets here are always filtered by ``school`` at construction — an
exporter cannot be pointed at another tenant's data.
"""

from cbt.models import Question
from staff.models import Staff
from students.models import AttendanceRecord, CheckoutRecord, Student


class BaseExporter:
    kind = None
    headers = ()
    filename = 'export.csv'

    def __init__(self, school, filters=None):
        self.school = school
        self.filters = filters or {}

    def get_queryset(self):
        raise NotImplementedError

    def serialise(self, obj):
        raise NotImplementedError

    def rows(self, limit=None):
        queryset = self.get_queryset()
        if limit is not None:
            queryset = queryset[:limit]
        return [self.serialise(obj) for obj in queryset]

    def count(self):
        return self.get_queryset().count()


class StudentExporter(BaseExporter):
    kind = 'students'
    filename = 'students.csv'
    headers = (
        'admission_number', 'first_name', 'middle_name', 'last_name', 'gender',
        'date_of_birth', 'classroom', 'arm', 'parent_name', 'parent_phone',
        'parent_email', 'address', 'status',
    )

    def get_queryset(self):
        queryset = Student.objects.filter(school=self.school).select_related('classroom')
        if self.filters.get('classroom'):
            queryset = queryset.filter(classroom_id=self.filters['classroom'])
        if self.filters.get('status'):
            queryset = queryset.filter(status=self.filters['status'])
        return queryset.order_by('last_name', 'first_name')

    def serialise(self, obj):
        return {
            'admission_number': obj.admission_number,
            'first_name': obj.first_name,
            'middle_name': obj.middle_name,
            'last_name': obj.last_name,
            'gender': obj.gender,
            'date_of_birth': obj.date_of_birth or '',
            'classroom': obj.classroom.name if obj.classroom else '',
            'arm': obj.classroom.arm if obj.classroom else '',
            'parent_name': obj.parent_name,
            'parent_phone': obj.parent_phone,
            'parent_email': obj.parent_email,
            'address': obj.address,
            'status': obj.status,
        }


class StaffExporter(BaseExporter):
    kind = 'staff'
    filename = 'staff.csv'
    headers = (
        'staff_number', 'username', 'first_name', 'last_name', 'email', 'phone',
        'account_role', 'role', 'qualification', 'specialisation', 'date_employed',
        'employment_status',
    )

    def get_queryset(self):
        queryset = Staff.objects.filter(school=self.school).select_related('user', 'role')
        if self.filters.get('employment_status'):
            queryset = queryset.filter(
                employment_status=self.filters['employment_status']
            )
        return queryset.order_by('staff_number')

    def serialise(self, obj):
        return {
            'staff_number': obj.staff_number,
            'username': obj.user.username,
            'first_name': obj.user.first_name,
            'last_name': obj.user.last_name,
            'email': obj.user.email,
            'phone': obj.phone,
            'account_role': obj.user.role,
            'role': obj.role.name if obj.role else '',
            'qualification': obj.qualification,
            'specialisation': obj.specialisation,
            'date_employed': obj.date_employed or '',
            'employment_status': obj.employment_status,
        }


class QuestionExporter(BaseExporter):
    kind = 'questions'
    filename = 'questions.csv'
    headers = (
        'bank', 'text', 'question_type',
        'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f',
        'correct_option', 'marks', 'difficulty', 'explanation',
    )
    OPTION_KEYS = ('a', 'b', 'c', 'd', 'e', 'f')

    def get_queryset(self):
        queryset = Question.objects.filter(school=self.school).select_related(
            'bank'
        ).prefetch_related('choices')
        if self.filters.get('bank'):
            queryset = queryset.filter(bank_id=self.filters['bank'])
        if self.filters.get('subject'):
            queryset = queryset.filter(bank__subject_id=self.filters['subject'])
        return queryset.order_by('bank__name', 'id')

    def serialise(self, obj):
        row = {
            'bank': obj.bank.name,
            'text': obj.text,
            'question_type': obj.question_type,
            'marks': obj.marks,
            'difficulty': obj.difficulty,
            'explanation': obj.explanation,
            'correct_option': '',
        }
        for key in self.OPTION_KEYS:
            row[f'option_{key}'] = ''

        # Round-trips into QuestionImporter: option letters map by position, and
        # a multi-answer key is written as a comma-separated list ("a,c").
        correct = []
        for index, choice in enumerate(obj.choices.all()):
            if index >= len(self.OPTION_KEYS):
                break
            key = self.OPTION_KEYS[index]
            row[f'option_{key}'] = choice.text
            if choice.is_correct:
                correct.append(key)

        row['correct_option'] = ','.join(correct)
        return row


class AttendanceExporter(BaseExporter):
    kind = 'attendance'
    filename = 'attendance.csv'
    headers = (
        'admission_number', 'student_name', 'classroom', 'date', 'status', 'remark',
    )

    def get_queryset(self):
        queryset = AttendanceRecord.objects.filter(school=self.school).select_related(
            'student', 'classroom'
        )
        for key in ('term', 'session', 'classroom'):
            if self.filters.get(key):
                queryset = queryset.filter(**{f'{key}_id': self.filters[key]})
        if self.filters.get('status'):
            queryset = queryset.filter(status=self.filters['status'])
        if self.filters.get('date_from'):
            queryset = queryset.filter(date__gte=self.filters['date_from'])
        if self.filters.get('date_to'):
            queryset = queryset.filter(date__lte=self.filters['date_to'])
        return queryset.order_by('date', 'student__last_name')

    def serialise(self, obj):
        return {
            'admission_number': obj.student.admission_number,
            'student_name': obj.student.full_name,
            'classroom': obj.classroom.full_name if obj.classroom else '',
            'date': obj.date,
            'status': obj.status,
            'remark': obj.remark,
        }


class CheckoutExporter(BaseExporter):
    kind = 'checkouts'
    filename = 'checkouts.csv'
    headers = (
        'admission_number', 'student_name', 'classroom', 'date', 'checked_out_at',
        'released_to', 'relationship', 'remark',
    )

    def get_queryset(self):
        queryset = CheckoutRecord.objects.filter(school=self.school).select_related(
            'student', 'classroom'
        )
        for key in ('term', 'session', 'classroom'):
            if self.filters.get(key):
                queryset = queryset.filter(**{f'{key}_id': self.filters[key]})
        if self.filters.get('date_from'):
            queryset = queryset.filter(date__gte=self.filters['date_from'])
        if self.filters.get('date_to'):
            queryset = queryset.filter(date__lte=self.filters['date_to'])
        return queryset.order_by('date', 'student__last_name')

    def serialise(self, obj):
        return {
            'admission_number': obj.student.admission_number,
            'student_name': obj.student.full_name,
            'classroom': obj.classroom.full_name if obj.classroom else '',
            'date': obj.date,
            'checked_out_at': obj.checked_out_at,
            'released_to': obj.released_to,
            'relationship': obj.relationship,
            'remark': obj.remark,
        }


EXPORTERS = {
    'students': StudentExporter,
    'staff': StaffExporter,
    'questions': QuestionExporter,
    'attendance': AttendanceExporter,
    'checkouts': CheckoutExporter,
}


def get_exporter(kind, school, filters=None):
    try:
        exporter_class = EXPORTERS[kind]
    except KeyError:
        raise ValueError(f'Unknown export type "{kind}".')
    return exporter_class(school=school, filters=filters)
