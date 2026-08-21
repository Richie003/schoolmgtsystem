"""Results engine: seeding the default scheme, computing subject totals/grades,
cumulating a sheet (grades, positions, report cards, attendance), and the CBT
auto-fill of the exam column."""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from cbt.models import Exam, ExamAttempt
from results.models import (
    AssessmentComponent,
    ClassResultSheet,
    GradeBand,
    GradingScheme,
    StudentReport,
    SubjectResult,
)
from students.models import AttendanceRecord, Student

# The Nigerian WAEC standard, seeded as the editable default.
WAEC_COMPONENTS = [
    ('1st C.A.', 15, False),
    ('2nd C.A.', 15, False),
    ('Exam', 70, True),
]
WAEC_BANDS = [
    (75, 100, 'A1', 'Excellent'),
    (70, 74, 'B2', 'Very Good'),
    (65, 69, 'B3', 'Good'),
    (60, 64, 'C4', 'Credit'),
    (55, 59, 'C5', 'Credit'),
    (50, 54, 'C6', 'Credit'),
    (45, 49, 'D7', 'Pass'),
    (40, 44, 'E8', 'Pass'),
    (0, 39, 'F9', 'Fail'),
]


def _q2(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


@transaction.atomic
def ensure_default_scheme(school):
    """Return the school's default scheme, creating the WAEC template if none."""
    existing = GradingScheme.objects.filter(school=school, is_default=True).first()
    if existing:
        return existing

    scheme = GradingScheme.objects.create(
        school=school, name='WAEC Standard', is_default=True
    )
    AssessmentComponent.objects.bulk_create([
        AssessmentComponent(
            school=school, scheme=scheme, name=name, max_score=mx, is_exam=is_exam,
            order=i,
        )
        for i, (name, mx, is_exam) in enumerate(WAEC_COMPONENTS)
    ])
    GradeBand.objects.bulk_create([
        GradeBand(
            school=school, scheme=scheme, min_score=lo, max_score=hi,
            grade=grade, remark=remark, order=i,
        )
        for i, (lo, hi, grade, remark) in enumerate(WAEC_BANDS)
    ])
    return scheme


def subject_total(scheme, components, scores):
    """(total, percent) for a scores dict against a scheme's components."""
    total = Decimal('0')
    for component in components:
        raw = scores.get(str(component.id))
        if raw in (None, ''):
            continue
        value = Decimal(str(raw))
        # Never let a typo exceed the component's ceiling.
        value = min(value, Decimal(component.max_score))
        total += value
    max_total = sum(c.max_score for c in components) or 100
    percent = (total / Decimal(max_total)) * 100 if max_total else Decimal('0')
    return _q2(total), _q2(percent)


def _assign_positions(rows, value_getter):
    """Standard competition ranking (1,2,2,4) on a value, highest first.

    Returns {id(obj): position} — keyed by object identity because unsaved model
    instances are unhashable and can't be dict keys directly.
    """
    ordered = sorted(rows, key=value_getter, reverse=True)
    positions = {}
    last_value = None
    last_rank = 0
    for index, row in enumerate(ordered, start=1):
        value = value_getter(row)
        if last_value is not None and value == last_value:
            positions[id(row)] = last_rank
        else:
            positions[id(row)] = index
            last_rank = index
            last_value = value
    return positions


def attendance_summary(student, term):
    records = AttendanceRecord.objects.filter(student=student, term=term)
    total = records.count()
    absent = records.filter(status=AttendanceRecord.Status.ABSENT).count()
    return total - absent, absent, total


@transaction.atomic
def cumulate_sheet(sheet, user=None):
    """Grade every subject result, rank positions, and (re)build report cards.

    Idempotent: re-running recomputes everything but preserves the remarks and
    traits a class teacher may already have added.
    """
    scheme = sheet.scheme
    components = list(scheme.components.all())
    subject_results = list(
        sheet.subject_results.select_related('student', 'subject')
    )

    # 1. Subject totals + grades.
    for result in subject_results:
        total, percent = subject_total(scheme, components, result.scores or {})
        grade, remark = scheme.grade_for(percent)
        result.total = total
        result.percent = percent
        result.grade = grade
        result.grade_remark = remark

    # 2. Subject positions (per subject, across the class).
    by_subject = {}
    for result in subject_results:
        by_subject.setdefault(result.subject_id, []).append(result)
    for rows in by_subject.values():
        positions = _assign_positions(rows, lambda r: r.total)
        for row in rows:
            row.position = positions[id(row)]

    SubjectResult.objects.bulk_update(
        subject_results,
        ['total', 'percent', 'grade', 'grade_remark', 'position'],
    )

    # 3. Aggregate per student → report card.
    students = list(
        Student.objects.filter(
            school=sheet.school, classroom=sheet.classroom,
            status=Student.Status.ACTIVE,
        )
    )
    # Fold in any student who has results but whose class field changed.
    seen = {s.id for s in students}
    for result in subject_results:
        if result.student_id not in seen:
            students.append(result.student)
            seen.add(result.student_id)

    existing = {r.student_id: r for r in sheet.reports.all()}
    per_student = {}
    for result in subject_results:
        per_student.setdefault(result.student_id, []).append(result)

    class_size = len(students)
    reports = []
    for student in students:
        rows = per_student.get(student.id, [])
        count = len(rows)
        total = sum((r.total for r in rows), Decimal('0'))
        average = _q2(sum((r.percent for r in rows), Decimal('0')) / count) if count else Decimal('0')
        grade, remark = scheme.grade_for(average)
        present, absent, marked = attendance_summary(student, sheet.term)

        report = existing.get(student.id) or StudentReport(
            school=sheet.school, sheet=sheet, student=student
        )
        report.subjects_count = count
        report.total = _q2(total)
        report.average = average
        report.grade = grade
        report.grade_remark = remark
        report.class_size = class_size
        report.attendance_present = present
        report.attendance_absent = absent
        report.attendance_total = marked
        reports.append(report)

    overall_positions = _assign_positions(reports, lambda r: r.average)
    for report in reports:
        report.position = overall_positions[id(report)]

    to_create = [r for r in reports if r.pk is None]
    to_update = [r for r in reports if r.pk is not None]
    if to_create:
        StudentReport.objects.bulk_create(to_create)
    if to_update:
        StudentReport.objects.bulk_update(
            to_update,
            ['subjects_count', 'total', 'average', 'grade', 'grade_remark',
             'position', 'class_size', 'attendance_present', 'attendance_absent',
             'attendance_total'],
        )
    # Drop reports for students no longer in scope (e.g. withdrawn).
    keep_ids = {r.student_id for r in reports}
    sheet.reports.exclude(student_id__in=keep_ids).delete()

    sheet.status = ClassResultSheet.Status.CUMULATED
    sheet.cumulated_at = timezone.now()
    sheet.save(update_fields=['status', 'cumulated_at', 'updated_at'])
    return sheet


def report_card_payload(report):
    """Everything the frontend needs to render (and print) one report card."""
    from results.models import ReportTemplateSettings

    sheet = report.sheet
    scheme = sheet.scheme
    school = sheet.school
    student = report.student

    components = [
        {'id': c.id, 'name': c.name, 'max_score': c.max_score, 'is_exam': c.is_exam}
        for c in scheme.components.all()
    ]
    subject_rows = [
        {
            'subject': sr.subject.name,
            'subject_id': sr.subject_id,
            'scores': sr.scores or {},
            'total': float(sr.total),
            'percent': float(sr.percent),
            'grade': sr.grade,
            'grade_remark': sr.grade_remark,
            'position': sr.position,
            'teacher_remark': sr.teacher_remark,
        }
        for sr in SubjectResult.objects.filter(sheet=sheet, student=student)
        .select_related('subject').order_by('subject__name')
    ]
    tmpl = ReportTemplateSettings.for_school(school)

    return {
        'id': report.id,
        'status': sheet.status,
        'published_at': report.published_at,
        'student': {
            'id': student.id,
            'name': student.full_name,
            'admission_number': student.admission_number,
            'photo': student.photo.url if student.photo else None,
            'gender': student.gender,
        },
        'classroom': sheet.classroom.full_name,
        'term': sheet.term.name,
        'session': sheet.session.name,
        'next_term_begins': sheet.next_term_begins,
        'scheme': {'name': scheme.name, 'components': components},
        'subjects': subject_rows,
        'summary': {
            'subjects_count': report.subjects_count,
            'total': float(report.total),
            'average': float(report.average),
            'grade': report.grade,
            'grade_remark': report.grade_remark,
            'position': report.position,
            'class_size': report.class_size,
        },
        'remarks': {
            'class_teacher': report.class_teacher_remark,
            'principal': report.principal_remark,
        },
        'traits': report.traits or {},
        'attendance': {
            'present': report.attendance_present,
            'absent': report.attendance_absent,
            'total': report.attendance_total,
        },
        'template': {
            'header_text': tmpl.header_text,
            'show_attendance': tmpl.show_attendance,
            'show_positions': tmpl.show_positions,
            'show_remarks': tmpl.show_remarks,
            'show_traits': tmpl.show_traits,
            'traits': tmpl.traits,
        },
        'school': {
            'name': school.display_name or school.name,
            'logo': school.logo.url if school.logo else None,
            'brand_color': school.brand_color,
            'address': school.address,
        },
    }


def autofill_cbt(sheet):
    """Fill the exam component from each student's best CBT result this term.

    Returns the number of subject-results updated. Only touches the component
    flagged is_exam; other components are left alone.
    """
    exam_component = sheet.scheme.components.filter(is_exam=True).first()
    if exam_component is None:
        return 0

    subject_ids = list(sheet.subjects.values_list('id', flat=True))
    # Exams for this class's subjects in this term.
    exams = Exam.objects.filter(
        school=sheet.school, subject_id__in=subject_ids, term=sheet.term,
    ).values('id', 'subject_id')
    exams_by_subject = {}
    for exam in exams:
        exams_by_subject.setdefault(exam['subject_id'], []).append(exam['id'])

    finished = [ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.AUTO_SUBMITTED]
    updated = 0
    key = str(exam_component.id)
    max_score = Decimal(exam_component.max_score)

    for result in sheet.subject_results.select_related('student'):
        exam_ids = exams_by_subject.get(result.subject_id)
        if not exam_ids:
            continue
        best = (
            ExamAttempt.objects.filter(
                student=result.student, exam_id__in=exam_ids, status__in=finished
            )
            .order_by('-percentage')
            .first()
        )
        if best is None:
            continue
        score = _q2(Decimal(str(best.percentage)) / 100 * max_score)
        scores = dict(result.scores or {})
        scores[key] = float(score)
        result.scores = scores
        result.save(update_fields=['scores', 'updated_at'])
        updated += 1
    return updated
