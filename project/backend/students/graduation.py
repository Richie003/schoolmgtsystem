"""Graduation tracking.

A student is "graduating" when their class is a graduation point
(``Classroom.GraduationStage`` level or school) and the school has a current
academic session — so the reminder stands throughout that session, from the
moment the class is configured, as a constant heads-up.

The term decides *urgency*, not visibility: once the school reaches the final
term of the session, those students are **due** to graduate imminently.

Everything is computed live from the current session/term, so the reminder
appears and clears itself as sessions roll over — nothing to reset by hand.
"""

from students.models import AcademicSession, Classroom, Student, Term

GRADUATING_STAGES = (
    Classroom.GraduationStage.LEVEL,
    Classroom.GraduationStage.SCHOOL,
)


def current_period(school):
    """The school's current session and term (either may be None)."""
    if school is None:
        return None, None
    session = AcademicSession.objects.filter(school=school, is_current=True).first()
    term = Term.objects.filter(school=school, is_current=True).first()
    return session, term


def is_final_term(session, term):
    """True when ``term`` is the last term of ``session`` (by start date)."""
    if not session or not term or term.session_id != session.id:
        return False
    last_term_id = (
        Term.objects.filter(session=session)
        .order_by('-start_date')
        .values_list('id', flat=True)
        .first()
    )
    return last_term_id == term.id


def graduation_status(school):
    """Return ``(session, term, is_active, is_due)``.

    * ``is_active`` — there is a current session, so the reminder is live.
    * ``is_due``    — additionally the current term is the session's final term,
      so graduation is imminent.
    """
    session, term = current_period(school)
    return session, term, session is not None, is_final_term(session, term)


def graduating_students(school):
    """Active students in graduation-stage classes for the current session.

    Empty only when there is no current session or no such classes — otherwise
    it stands as the constant reminder, regardless of term.
    """
    session, _ = current_period(school)
    if session is None:
        return Student.objects.none()
    return (
        Student.objects.filter(
            school=school,
            status=Student.Status.ACTIVE,
            classroom__graduation_stage__in=GRADUATING_STAGES,
        )
        .select_related('classroom')
        .order_by('classroom__name', 'classroom__arm', 'last_name', 'first_name')
    )
