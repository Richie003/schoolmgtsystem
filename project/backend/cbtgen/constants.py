"""Reference data for the AI question generator — aligned to the Nigerian
educational system. This is the single source of truth: the API serves it to the
frontend so the dropdowns and backend validation never drift apart.
"""

# --- Class levels (Primary 1–6, JSS 1–3, SS 1–3) ---
CLASS_LEVELS = [
    {'value': 'primary_1', 'label': 'Primary 1', 'band': 'primary'},
    {'value': 'primary_2', 'label': 'Primary 2', 'band': 'primary'},
    {'value': 'primary_3', 'label': 'Primary 3', 'band': 'primary'},
    {'value': 'primary_4', 'label': 'Primary 4', 'band': 'primary'},
    {'value': 'primary_5', 'label': 'Primary 5', 'band': 'primary'},
    {'value': 'primary_6', 'label': 'Primary 6', 'band': 'primary'},
    {'value': 'jss_1', 'label': 'JSS 1', 'band': 'jss'},
    {'value': 'jss_2', 'label': 'JSS 2', 'band': 'jss'},
    {'value': 'jss_3', 'label': 'JSS 3', 'band': 'jss'},
    {'value': 'ss_1', 'label': 'SS 1', 'band': 'ss'},
    {'value': 'ss_2', 'label': 'SS 2', 'band': 'ss'},
    {'value': 'ss_3', 'label': 'SS 3', 'band': 'ss'},
]
CLASS_LEVEL_VALUES = {c['value'] for c in CLASS_LEVELS}
CLASS_LEVEL_LABELS = {c['value']: c['label'] for c in CLASS_LEVELS}

# --- Examination standards ---
EXAM_STANDARDS = [
    {'value': 'general', 'label': 'General / school exam'},
    {'value': 'common_entrance', 'label': 'Common Entrance (Primary)'},
    {'value': 'bece', 'label': 'BECE / Junior WAEC (JSS)'},
    {'value': 'waec', 'label': 'WAEC (SSCE)'},
    {'value': 'neco', 'label': 'NECO'},
    {'value': 'nabteb', 'label': 'NABTEB'},
    {'value': 'gce', 'label': 'GCE'},
    {'value': 'jamb', 'label': 'JAMB (UTME)'},
]
EXAM_STANDARD_VALUES = {e['value'] for e in EXAM_STANDARDS}
EXAM_STANDARD_LABELS = {e['value']: e['label'] for e in EXAM_STANDARDS}

# --- Complexity → maps to Question.Difficulty on commit ---
COMPLEXITY_LEVELS = [
    {'value': 'easy', 'label': 'Easy'},
    {'value': 'medium', 'label': 'Bearable'},
    {'value': 'hard', 'label': 'Hard'},
]
COMPLEXITY_VALUES = {c['value'] for c in COMPLEXITY_LEVELS}

# --- Subjects by band. Teachers may also type a subject not listed here. ---
SUBJECTS = {
    'primary': [
        'English Studies', 'Mathematics', 'Verbal Reasoning', 'Quantitative Reasoning',
        'Basic Science and Technology', 'National Values Education', 'Social Studies',
        'Civic Education', 'Computer Studies / ICT', 'Agricultural Science',
        'Christian Religious Studies', 'Islamic Religious Studies',
        'Cultural and Creative Arts', 'Home Economics', 'History',
        'Physical and Health Education', 'Yoruba', 'Igbo', 'Hausa',
    ],
    'jss': [
        'English Language', 'Mathematics', 'Basic Science', 'Basic Technology',
        'Social Studies', 'Civic Education', 'Business Studies',
        'Computer Studies / ICT', 'Agricultural Science', 'Home Economics',
        'Christian Religious Studies', 'Islamic Religious Studies',
        'Cultural and Creative Arts', 'French', 'History', 'Security Education',
        'Physical and Health Education', 'Yoruba', 'Igbo', 'Hausa',
    ],
    'ss': [
        'English Language', 'Mathematics', 'Further Mathematics', 'Biology',
        'Chemistry', 'Physics', 'Economics', 'Geography', 'Government', 'Commerce',
        'Financial Accounting', 'Book Keeping', 'Literature-in-English',
        'Christian Religious Studies', 'Islamic Religious Studies', 'History',
        'Agricultural Science', 'Civic Education', 'Computer Science / ICT',
        'Technical Drawing', 'Data Processing', 'Food and Nutrition',
        'Home Management', 'Marketing', 'French', 'Yoruba', 'Igbo', 'Hausa',
    ],
}

# Subjects where a calculation-vs-reasoning ratio is meaningful. The frontend
# only shows the ratio control when the chosen subject matches one of these.
CALCULATION_SUBJECTS = {
    'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry', 'Economics',
    'Quantitative Reasoning', 'Financial Accounting', 'Book Keeping',
    'Data Processing', 'Basic Technology', 'Technical Drawing',
}


def is_calculation_subject(name):
    """Loose match so 'Maths', 'General Mathematics' etc. still count."""
    lowered = (name or '').lower()
    keywords = (
        'math', 'physics', 'chemistry', 'economics', 'quantitative',
        'account', 'book keeping', 'data processing', 'technical drawing',
        'further',
    )
    return any(word in lowered for word in keywords)


def options_payload():
    """Everything the generator UI needs to render its dropdowns."""
    return {
        'class_levels': CLASS_LEVELS,
        'exam_standards': EXAM_STANDARDS,
        'complexity_levels': COMPLEXITY_LEVELS,
        'subjects': SUBJECTS,
        'calculation_subjects': sorted(CALCULATION_SUBJECTS),
    }
