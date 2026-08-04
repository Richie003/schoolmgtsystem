import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { cbtAPI, errorMessage } from '../../services/api';
import type { Choice, Question, QuestionType } from '../../types';
import { Alert, Button, Field, Modal, inputClass } from '../UI/Primitives';
import { containsMath } from '../../utils/math';
import MathText from '../UI/MathText';
import MathInput from './MathInput';

const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

interface Draft {
  question_type: QuestionType;
  text: string;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
  is_active: boolean;
  options: { text: string; is_correct: boolean }[];
}

const BLANK: Draft = {
  question_type: 'single',
  text: '',
  marks: 1,
  difficulty: 'medium',
  explanation: '',
  is_active: true,
  options: [
    { text: '', is_correct: true },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ],
};

function toDraft(question: Question): Draft {
  return {
    question_type: question.question_type,
    text: question.text,
    marks: question.marks,
    difficulty: question.difficulty,
    explanation: question.explanation,
    is_active: question.is_active,
    options: question.choices.map((c) => ({
      text: c.text,
      is_correct: c.is_correct,
    })),
  };
}

/**
 * Create or edit a question.
 *
 * Handles both single-answer (radio) and multiple-answer ("select all that
 * apply", checkbox) questions, with a variable number of options.
 */
export default function QuestionEditor({
  open,
  bankId,
  question,
  onClose,
  onSaved,
}: {
  open: boolean;
  bankId: string | number;
  /** Null to create a new question. */
  question: Question | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const questionRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(question ? toDraft(question) : { ...BLANK, options: BLANK.options.map((o) => ({ ...o })) });
    setError('');
  }, [open, question]);

  const filled = draft.options.filter((o) => o.text.trim());
  const correctCount = filled.filter((o) => o.is_correct).length;

  const setOption = (index: number, patch: Partial<{ text: string; is_correct: boolean }>) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) =>
        i === index ? { ...option, ...patch } : option,
      ),
    }));
  };

  /** Radio behaviour for single-answer, checkbox behaviour for multi-answer. */
  const toggleCorrect = (index: number) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) => {
        if (current.question_type === 'single') {
          return { ...option, is_correct: i === index };
        }
        return i === index ? { ...option, is_correct: !option.is_correct } : option;
      }),
    }));
  };

  const addOption = () => {
    if (draft.options.length >= MAX_OPTIONS) return;
    setDraft((current) => ({
      ...current,
      options: [...current.options, { text: '', is_correct: false }],
    }));
  };

  const removeOption = (index: number) => {
    if (draft.options.length <= MIN_OPTIONS) return;
    setDraft((current) => {
      const options = current.options.filter((_, i) => i !== index);
      // Single-answer questions must always keep exactly one key; if the
      // removed row held it, promote the first remaining option.
      if (current.question_type === 'single' && !options.some((o) => o.is_correct)) {
        options[0] = { ...options[0], is_correct: true };
      }
      return { ...current, options };
    });
  };

  const changeType = (question_type: QuestionType) => {
    setDraft((current) => {
      let options = current.options;
      if (question_type === 'single') {
        // Collapse to a single key so the form can't submit an invalid shape.
        const firstCorrect = options.findIndex((o) => o.is_correct);
        const keep = firstCorrect === -1 ? 0 : firstCorrect;
        options = options.map((o, i) => ({ ...o, is_correct: i === keep }));
      }
      return { ...current, question_type, options };
    });
  };

  const validate = (): string | null => {
    if (!draft.text.trim()) return 'Enter the question text.';
    if (filled.length < MIN_OPTIONS) return 'Provide at least two options.';
    if (correctCount === 0) return 'Mark at least one option as correct.';
    if (draft.question_type === 'single' && correctCount !== 1) {
      return 'A single-answer question needs exactly one correct option.';
    }
    if (draft.question_type === 'multiple' && correctCount === filled.length) {
      return 'At least one option must be incorrect.';
    }
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const choices: Choice[] = filled.map((option, index) => ({
        text: option.text.trim(),
        is_correct: option.is_correct,
        order: index,
      }));

      const payload = {
        bank: Number(bankId),
        question_type: draft.question_type,
        text: draft.text.trim(),
        marks: draft.marks,
        difficulty: draft.difficulty,
        explanation: draft.explanation,
        is_active: draft.is_active,
        choices,
      };

      if (question) {
        await cbtAPI.updateQuestion(question.id, payload);
        onSaved('Question updated.');
      } else {
        await cbtAPI.createQuestion(payload);
        onSaved('Question added.');
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save this question.'));
    } finally {
      setSaving(false);
    }
  };

  const isMultiple = draft.question_type === 'multiple';

  return (
    <Modal
      open={open}
      title={question ? 'Edit question' : 'Add question'}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert>{error}</Alert>}

        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">
            Answer type
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['single', 'Single answer', 'Student picks exactly one option.'],
              ['multiple', 'Multiple answers',
               'Select all that apply. Marked all-or-nothing.'],
            ] as const).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeType(value)}
                aria-pressed={draft.question_type === value}
                className={`rounded-lg border p-3 text-left transition
                  ${
                    draft.question_type === value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
              >
                <span className="block text-sm font-medium text-gray-900">{label}</span>
                <span className="block text-xs text-gray-500">{hint}</span>
              </button>
            ))}
          </div>
        </div>

        <MathInput
          label="Question"
          value={draft.text}
          onChange={(text) => setDraft({ ...draft, text })}
          rows={3}
          textareaRef={questionRef}
          placeholder="A body of mass $m$ accelerates at $a$. Find the force."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Marks">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={draft.marks}
              onChange={(e) => setDraft({ ...draft, marks: Number(e.target.value) })}
            />
          </Field>
          <Field label="Difficulty">
            <select
              className={inputClass}
              value={draft.difficulty}
              onChange={(e) =>
                setDraft({ ...draft, difficulty: e.target.value as Draft['difficulty'] })
              }
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={draft.is_active ? 'active' : 'inactive'}
              onChange={(e) =>
                setDraft({ ...draft, is_active: e.target.value === 'active' })
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive — not drawn into exams</option>
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">
            Options —{' '}
            {isMultiple
              ? 'tick every correct answer'
              : 'select the one correct answer'}
          </legend>

          <div className="space-y-2">
            {draft.options.map((option, index) => (
              <div key={index} className="flex items-start gap-2">
                <GripVertical
                  className="mt-2.5 h-4 w-4 shrink-0 text-gray-300"
                  aria-hidden="true"
                />
                <input
                  type={isMultiple ? 'checkbox' : 'radio'}
                  name="correct-option"
                  checked={option.is_correct}
                  onChange={() => toggleCorrect(index)}
                  aria-label={`Mark option ${String.fromCharCode(65 + index)} correct`}
                  className="mt-3 shrink-0"
                />
                <span className="mt-2.5 w-5 shrink-0 text-xs font-semibold text-gray-400">
                  {String.fromCharCode(65 + index)}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    className={`${inputClass} font-mono`}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    value={option.text}
                    onChange={(e) => setOption(index, { text: e.target.value })}
                  />
                  {containsMath(option.text) && (
                    <MathText
                      inline
                      className="mt-1 block px-1 text-sm text-gray-700"
                    >
                      {option.text}
                    </MathText>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={draft.options.length <= MIN_OPTIONS}
                  aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                  className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100
                    hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={addOption}
              disabled={draft.options.length >= MAX_OPTIONS}
            >
              <Plus className="h-4 w-4" />
              Add option
            </Button>
            <span className="text-xs text-gray-500">
              {filled.length} option{filled.length === 1 ? '' : 's'},{' '}
              {correctCount} correct
              {isMultiple && correctCount > 0 && ' — students must pick all of them'}
            </span>
          </div>
        </fieldset>

        <MathInput
          label="Explanation (shown after results are released)"
          value={draft.explanation}
          onChange={(explanation) => setDraft({ ...draft, explanation })}
          rows={2}
          textareaRef={explanationRef}
          placeholder="Because $F = ma$, the force is ..."
        />

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {question ? 'Save changes' : 'Add question'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
