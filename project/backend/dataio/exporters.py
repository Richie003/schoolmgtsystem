"""CSV exporters.

Each exporter yields ``(headers, rows)`` for a school-scoped queryset. The same
function backs both the preview endpoint (first N rows as JSON) and the download
endpoint (full CSV), so what the user previews is what they get.

The querysets here are always filtered by ``school`` at construction — an
exporter cannot be pointed at another tenant's data.
"""

from cbt.models import ExamAttempt, Question
from results.models import ClassResultSheet, StudentReport, SubjectResult
from staff.models import Staff
from students.models import AttendanceRecord, CheckoutRecord, Student

# Result sheets are only exportable once their marks are finalised — never while
# a class teacher is still entering scores.
FINALISED = (ClassResultSheet.Status.CUMULATED, ClassResultSheet.Status.PUBLISHED)


def _dt(value):
    """Datetime → 'YYYY-MM-DD HH:MM', or '' when absent."""
    return value.strftime('%Y-%m-%d %H:%M') if value else ''


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


class CbtAttemptExporter(BaseExporter):
    """One row per completed CBT sitting. Session/term/subject come from the exam,
    so a class's attempts across every term sit in one tidy file, sliced by the
    class / session / term / subject / exam filters."""

    kind = 'cbt'
    filename = 'cbt-results.csv'
    headers = (
        'admission_number', 'student_name', 'classroom', 'session', 'term',
        'subject', 'exam_title', 'attempt_number', 'status', 'score',
        'total_marks', 'percentage', 'passed', 'started_at', 'submitted_at',
    )

    def get_queryset(self):
        queryset = ExamAttempt.objects.filter(school=self.school).select_related(
            'student', 'student__classroom', 'exam', 'exam__subject',
            'exam__session', 'exam__term',
        )
        f = self.filters
        if f.get('classroom'):
            queryset = queryset.filter(student__classroom_id=f['classroom'])
        if f.get('session'):
            queryset = queryset.filter(exam__session_id=f['session'])
        if f.get('term'):
            queryset = queryset.filter(exam__term_id=f['term'])
        if f.get('subject'):
            queryset = queryset.filter(exam__subject_id=f['subject'])
        if f.get('exam'):
            queryset = queryset.filter(exam_id=f['exam'])
        if f.get('status'):
            queryset = queryset.filter(status=f['status'])
        else:
            # A "record" is a finished sitting, not an abandoned or live one.
            queryset = queryset.filter(status__in=[
                ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.AUTO_SUBMITTED,
            ])
        return queryset.order_by(
            'exam__title', 'student__last_name', 'student__first_name', 'attempt_number',
        )

    def serialise(self, obj):
        exam = obj.exam
        return {
            'admission_number': obj.student.admission_number,
            'student_name': obj.student.full_name,
            'classroom': obj.student.classroom.full_name if obj.student.classroom else '',
            'session': exam.session.name if exam.session_id else '',
            'term': exam.term.name if exam.term_id else '',
            'subject': exam.subject.name if exam.subject_id else '',
            'exam_title': exam.title,
            'attempt_number': obj.attempt_number,
            'status': obj.status,
            'score': obj.score,
            'total_marks': obj.total_marks,
            'percentage': obj.percentage,
            'passed': 'yes' if obj.is_passed else 'no',
            'started_at': _dt(obj.started_at),
            'submitted_at': _dt(obj.submitted_at),
        }


class ResultBroadsheetExporter(BaseExporter):
    """One row per student per subject, from finalised sheets — the marks ledger.

    The component columns (e.g. 1st C.A. / 2nd C.A. / Exam) are taken from the
    school's default grading scheme, so the header is stable while still matching
    what schools actually grade on.
    """

    kind = 'results'
    filename = 'result-sheets.csv'
    LEAD = ('admission_number', 'student_name', 'classroom', 'session', 'term', 'subject')
    TAIL = ('total', 'percentage', 'grade', 'position', 'teacher_remark')

    def __init__(self, school, filters=None):
        super().__init__(school, filters)
        self.components = self._component_names()
        # Instance-level headers: the views read exporter.headers (not the class).
        self.headers = (*self.LEAD, *self.components, *self.TAIL)

    def _component_names(self):
        from results.services import ensure_default_scheme

        scheme = ensure_default_scheme(self.school)
        return [c.name for c in scheme.components.all()]

    def get_queryset(self):
        queryset = SubjectResult.objects.filter(
            school=self.school, sheet__status__in=FINALISED,
        ).select_related(
            'student', 'student__classroom', 'subject',
            'sheet', 'sheet__classroom', 'sheet__session', 'sheet__term', 'sheet__scheme',
        ).prefetch_related('sheet__scheme__components')
        f = self.filters
        if f.get('classroom'):
            queryset = queryset.filter(sheet__classroom_id=f['classroom'])
        if f.get('session'):
            queryset = queryset.filter(sheet__session_id=f['session'])
        if f.get('term'):
            queryset = queryset.filter(sheet__term_id=f['term'])
        if f.get('subject'):
            queryset = queryset.filter(subject_id=f['subject'])
        return queryset.order_by(
            'sheet__session__name', 'sheet__term__name', 'sheet__classroom__name',
            'student__last_name', 'subject__name',
        )

    def serialise(self, obj):
        sheet = obj.sheet
        row = {
            'admission_number': obj.student.admission_number,
            'student_name': obj.student.full_name,
            'classroom': sheet.classroom.full_name if sheet.classroom else '',
            'session': sheet.session.name if sheet.session_id else '',
            'term': sheet.term.name if sheet.term_id else '',
            'subject': obj.subject.name,
            'total': obj.total,
            'percentage': obj.percent,
            'grade': obj.grade,
            'position': obj.position if obj.position is not None else '',
            'teacher_remark': obj.teacher_remark,
        }
        # Map this row's stored scores (keyed by component id) onto the header's
        # component-name columns. A sheet on a differently-named scheme simply
        # leaves the default columns blank.
        names = set(self.components)
        id_to_name = {str(c.id): c.name for c in sheet.scheme.components.all()}
        for column in self.components:
            row[column] = ''
        for cid, score in (obj.scores or {}).items():
            name = id_to_name.get(str(cid))
            if name in names:
                row[name] = score
        return row


class ReportCardExporter(BaseExporter):
    """One row per student — the cumulative report-card record from finalised
    sheets (average, grade, position, remarks, attendance)."""

    kind = 'report_cards'
    filename = 'report-cards.csv'
    headers = (
        'admission_number', 'student_name', 'classroom', 'session', 'term',
        'subjects', 'total', 'average', 'grade', 'position', 'class_size',
        'attendance_present', 'attendance_absent', 'attendance_total',
        'class_teacher_remark', 'principal_remark',
    )

    def get_queryset(self):
        queryset = StudentReport.objects.filter(
            school=self.school, sheet__status__in=FINALISED,
        ).select_related(
            'student', 'sheet', 'sheet__classroom', 'sheet__session', 'sheet__term',
        )
        f = self.filters
        if f.get('classroom'):
            queryset = queryset.filter(sheet__classroom_id=f['classroom'])
        if f.get('session'):
            queryset = queryset.filter(sheet__session_id=f['session'])
        if f.get('term'):
            queryset = queryset.filter(sheet__term_id=f['term'])
        return queryset.order_by(
            'sheet__session__name', 'sheet__term__name', 'sheet__classroom__name', 'position',
        )

    def serialise(self, obj):
        sheet = obj.sheet
        return {
            'admission_number': obj.student.admission_number,
            'student_name': obj.student.full_name,
            'classroom': sheet.classroom.full_name if sheet.classroom else '',
            'session': sheet.session.name if sheet.session_id else '',
            'term': sheet.term.name if sheet.term_id else '',
            'subjects': obj.subjects_count,
            'total': obj.total,
            'average': obj.average,
            'grade': obj.grade,
            'position': obj.position if obj.position is not None else '',
            'class_size': obj.class_size,
            'attendance_present': obj.attendance_present,
            'attendance_absent': obj.attendance_absent,
            'attendance_total': obj.attendance_total,
            'class_teacher_remark': obj.class_teacher_remark,
            'principal_remark': obj.principal_remark,
        }


EXPORTERS = {
    'students': StudentExporter,
    'staff': StaffExporter,
    'questions': QuestionExporter,
    'attendance': AttendanceExporter,
    'checkouts': CheckoutExporter,
    'cbt': CbtAttemptExporter,
    'results': ResultBroadsheetExporter,
    'report_cards': ReportCardExporter,
}


def get_exporter(kind, school, filters=None):
    try:
        exporter_class = EXPORTERS[kind]
    except KeyError:
        raise ValueError(f'Unknown export type "{kind}".')
    return exporter_class(school=school, filters=filters)
