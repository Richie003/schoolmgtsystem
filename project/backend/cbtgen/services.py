"""AI question generation via Claude.

Uses the official Anthropic SDK with structured outputs, so the model returns
questions as schema-valid JSON rather than free text we'd have to scrape. The
result is normalised to the shape the review UI and the commit step expect; it
is never written to the CBT tables here — that happens only after human review.
"""

import json
import logging

from django.conf import settings

from cbtgen import constants

logger = logging.getLogger(__name__)


class GenerationError(Exception):
    """Raised for any failure that should surface to the user as a failed job."""


# Structured-output schema. Kept within the documented limits (enums and
# additionalProperties:false are supported; count/length constraints are not,
# so those are enforced in _normalise()).
QUESTION_SCHEMA = {
    'type': 'object',
    'properties': {
        'questions': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'text': {'type': 'string'},
                    'options': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'text': {'type': 'string'},
                                'is_correct': {'type': 'boolean'},
                            },
                            'required': ['text', 'is_correct'],
                            'additionalProperties': False,
                        },
                    },
                    'difficulty': {'type': 'string', 'enum': ['easy', 'medium', 'hard']},
                    'category': {'type': 'string', 'enum': ['calculation', 'reasoning']},
                    'explanation': {'type': 'string'},
                },
                'required': ['text', 'options', 'difficulty', 'category', 'explanation'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['questions'],
    'additionalProperties': False,
}

SYSTEM_PROMPT = (
    'You are an expert examiner who writes multiple-choice questions for schools '
    'in Nigeria, fully aligned to the Nigerian curriculum and the conventions of '
    'the named examination body. You write clear, unambiguous, curriculum-accurate '
    'questions with exactly one defensibly correct option per question unless told '
    'otherwise, and three or four plausible distractors.\n\n'
    'Rules you always follow:\n'
    '- Pitch difficulty and vocabulary to the exact class level given.\n'
    '- Keep content and examples culturally appropriate to Nigeria.\n'
    '- Write any mathematics, physics or chemistry using LaTeX delimited with '
    '\\( ... \\) for inline and \\[ ... \\] for display, so it renders correctly.\n'
    '- For calculation questions, make the distractors reflect realistic mistakes.\n'
    '- Never restate the answer inside the question. Never write "all of the above".\n'
    '- Provide a concise explanation of why the correct option is right.'
)


def _counts(question_count, calc_ratio, subject_name):
    """Split the requested total into calculation vs reasoning questions."""
    if not constants.is_calculation_subject(subject_name):
        return 0, question_count
    calc = round(question_count * calc_ratio / 100)
    calc = max(0, min(question_count, calc))
    return calc, question_count - calc


def _build_prompt(job):
    class_label = constants.CLASS_LEVEL_LABELS.get(job.class_level, job.class_level)
    standard_label = constants.EXAM_STANDARD_LABELS.get(job.exam_standard, job.exam_standard)
    calc_n, reason_n = _counts(job.question_count, job.calculation_ratio, job.subject_name)

    if job.question_type == job.QuestionType.MULTIPLE:
        answer_rule = (
            'Each question is "select all that apply": mark every correct option '
            'and at least one incorrect option (typically 1–3 correct of 4–5 options).'
        )
    else:
        answer_rule = 'Each question has exactly one correct option and three or four distractors.'

    topics = job.topics.strip() or 'the full curriculum for this class and subject'
    lines = [
        f'Generate {job.question_count} multiple-choice questions.',
        f'Subject: {job.subject_name}.',
        f'Class level: {class_label}.',
        f'Examination standard: {standard_label} — match its style and rigour.',
        f'Focus topics: {topics}.',
        f'Overall difficulty/complexity: {job.complexity}.',
        answer_rule,
    ]
    if calc_n or reason_n:
        lines.append(
            f'Mix: {calc_n} calculation question(s) (category "calculation") and '
            f'{reason_n} cognitive-reasoning question(s) (category "reasoning").'
        )
    else:
        lines.append('Every question is cognitive reasoning (category "reasoning").')
    lines.append(
        'Set each question\'s "difficulty" to reflect its own hardness around the '
        f'requested "{job.complexity}" baseline.'
    )
    return '\n'.join(lines)


def _normalise(raw_questions, question_type):
    """Validate/repair model output into committable draft questions.

    Enforces the CBT rules the schema can't: 2–8 options, and a correct-answer
    count consistent with the question type. Malformed questions are dropped
    rather than saved.
    """
    cleaned = []
    for raw in raw_questions or []:
        text = (raw.get('text') or '').strip()
        options = raw.get('options') or []
        norm_options = []
        for opt in options[:8]:
            opt_text = (opt.get('text') or '').strip()
            if opt_text:
                norm_options.append({'text': opt_text, 'is_correct': bool(opt.get('is_correct'))})
        if not text or len(norm_options) < 2:
            continue

        correct = [o for o in norm_options if o['is_correct']]
        if not correct:
            continue
        if question_type == 'single' and len(correct) != 1:
            # Keep only the first correct option so it's a valid single-answer question.
            first = next(i for i, o in enumerate(norm_options) if o['is_correct'])
            for i, o in enumerate(norm_options):
                o['is_correct'] = i == first

        difficulty = raw.get('difficulty')
        if difficulty not in {'easy', 'medium', 'hard'}:
            difficulty = 'medium'
        category = raw.get('category') if raw.get('category') in {'calculation', 'reasoning'} else 'reasoning'

        cleaned.append({
            'text': text,
            'options': norm_options,
            'difficulty': difficulty,
            'category': category,
            'explanation': (raw.get('explanation') or '').strip(),
        })
    return cleaned


def generate_questions(job):
    """Call Claude and return (questions, meta). Raises GenerationError on failure."""
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
    if not api_key:
        raise GenerationError(
            'AI generation is not configured. Set ANTHROPIC_API_KEY on the server.'
        )

    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise GenerationError('The anthropic package is not installed.') from exc

    model = getattr(settings, 'AI_QUESTION_MODEL', 'claude-opus-5')
    client = anthropic.Anthropic(api_key=api_key)

    try:
        response = client.messages.create(
            model=model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            thinking={'type': 'adaptive'},
            output_config={
                'effort': 'medium',
                'format': {'type': 'json_schema', 'schema': QUESTION_SCHEMA},
            },
            messages=[{'role': 'user', 'content': _build_prompt(job)}],
        )
    except anthropic.APIStatusError as exc:
        logger.exception('Claude API error generating job %s', job.pk)
        raise GenerationError(f'AI service error ({exc.status_code}).') from exc
    except anthropic.APIConnectionError as exc:
        raise GenerationError('Could not reach the AI service. Try again.') from exc

    if response.stop_reason == 'refusal':
        raise GenerationError('The AI declined to generate for this request.')

    text = next((b.text for b in response.content if b.type == 'text'), '')
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise GenerationError('The AI returned an unreadable response.') from exc

    questions = _normalise(data.get('questions'), job.question_type)
    if not questions:
        raise GenerationError('The AI did not return any usable questions. Try again.')

    meta = {
        'model_used': response.model,
        'input_tokens': getattr(response.usage, 'input_tokens', 0) or 0,
        'output_tokens': getattr(response.usage, 'output_tokens', 0) or 0,
    }
    return questions, meta
