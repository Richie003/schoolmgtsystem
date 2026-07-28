import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { cbtAPI, errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Question, QuestionBank, Subject } from '../../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Spinner,
  inputClass,
} from '../UI/Primitives';
import QuestionEditor from './QuestionEditor';
import MathText from '../UI/MathText';

/** Browse, author, edit and delete the questions in a bank. */
export default function QuestionBankView() {
  const { can } = useAuth();
  const canDelete = can('school_admin', 'super_admin', 'teacher');

  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);

  const loadBanks = useCallback(async () => {
    try {
      const { data } = await cbtAPI.banks({ page_size: 100 });
      setBanks(data.results);
      setSelectedBank((current) =>
        current || (data.results.length ? String(data.results[0].id) : ''),
      );
    } catch (err) {
      setError(errorMessage(err, 'Could not load question banks.'));
    }
  }, []);

  useEffect(() => { loadBanks(); }, [loadBanks]);

  useEffect(() => {
    cbtAPI
      .subjects({ page_size: 100 })
      .then(({ data }) => setSubjects(data.results))
      .catch(() => undefined);
  }, []);

  const loadQuestions = useCallback(async () => {
    if (!selectedBank) {
      setQuestions([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await cbtAPI.questions({
        bank: selectedBank,
        search: search || undefined,
        page_size: 200,
      });
      setQuestions(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load questions.'));
    } finally {
      setLoading(false);
    }
  }, [selectedBank, search]);

  useEffect(() => {
    const timer = setTimeout(loadQuestions, 250);
    return () => clearTimeout(timer);
  }, [loadQuestions]);

  const remove = async (question: Question) => {
    const label =
      question.text.length > 60 ? `${question.text.slice(0, 60)}…` : question.text;

    if (
      !window.confirm(
        `Delete this question?\n\n"${label}"\n\n` +
          'It will no longer be drawn into new exams. Set it to Inactive ' +
          'instead if you only want to retire it.',
      )
    ) {
      return;
    }

    try {
      await cbtAPI.removeQuestion(question.id);
      setNotice('Question deleted.');
      loadQuestions();
      loadBanks();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete this question.'));
    }
  };

  const activeBank = banks.find((b) => String(b.id) === selectedBank);

  return (
    <div>
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}

      {subjects.length === 0 && (
        <div className="mb-4">
          <Alert kind="info">
            No subjects exist yet. Create one under Academics → Subjects, then add
            a question bank for it.
          </Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px]">
            <Field label="Question bank">
              <select
                className={inputClass}
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
              >
                <option value="">Select a bank</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.subject_name} — {b.name} ({b.question_count})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="min-w-[200px]">
            <Field label="Search">
              <input
                type="search"
                className={inputClass}
                placeholder="Find question text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="flex gap-2">
          <NewBankButton subjects={subjects} onCreated={loadBanks} />
          <Button
            onClick={() => { setEditing(null); setEditorOpen(true); }}
            disabled={!selectedBank}
          >
            <Plus className="h-4 w-4" />
            Add question
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : !selectedBank ? (
        <EmptyState message="Select a question bank to see its questions." />
      ) : questions.length === 0 ? (
        <EmptyState
          message={
            search
              ? 'No questions match that search.'
              : 'This bank has no questions yet. Add them here or import a CSV.'
          }
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-500">
            {questions.length} question{questions.length === 1 ? '' : 's'} in{' '}
            {activeBank?.name}.
          </p>

          <ol className="space-y-3">
            {questions.map((question, i) => (
              <li
                key={question.id}
                className={`rounded-lg border bg-white p-4 ${
                  question.is_active
                    ? 'border-gray-200'
                    : 'border-dashed border-gray-300 opacity-60'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-1.5 text-sm font-medium text-gray-900">
                    <span className="shrink-0">{i + 1}.</span>
                    <MathText className="min-w-0">{question.text}</MathText>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {question.question_type === 'multiple' && (
                      <Badge tone="brand">Pick {question.correct_count}</Badge>
                    )}
                    <Badge tone="gray">{question.difficulty}</Badge>
                    <Badge tone="brand">
                      {question.marks} mark{question.marks === 1 ? '' : 's'}
                    </Badge>
                    {!question.is_active && <Badge tone="amber">Inactive</Badge>}
                  </div>
                </div>

                <ul className="grid gap-1 sm:grid-cols-2">
                  {question.choices.map((choice, ci) => (
                    <li
                      key={choice.id ?? ci}
                      className={`rounded px-3 py-1.5 text-sm ${
                        choice.is_correct
                          ? 'bg-green-50 font-medium text-green-800'
                          : 'text-gray-600'
                      }`}
                    >
                      {String.fromCharCode(65 + ci)}.{' '}
                      <MathText inline>{choice.text}</MathText>
                      {choice.is_correct && ' ✓'}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex justify-end gap-1 border-t border-gray-100 pt-2">
                  <button
                    onClick={() => { setEditing(question); setEditorOpen(true); }}
                    aria-label={`Edit question ${i + 1}`}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => remove(question)}
                      aria-label={`Delete question ${i + 1}`}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <QuestionEditor
        open={editorOpen}
        bankId={selectedBank}
        question={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={(message) => {
          setEditorOpen(false);
          setNotice(message);
          loadQuestions();
          loadBanks();
        }}
      />
    </div>
  );
}

function NewBankButton({
  subjects,
  onCreated,
}: {
  subjects: Subject[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await cbtAPI.createBank({ name, subject: Number(subject) });
      setOpen(false);
      setName('');
      onCreated();
    } catch (err) {
      setError(errorMessage(err, 'Could not create this bank.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={subjects.length === 0}
      >
        New bank
      </Button>

      <Modal open={open} title="New question bank" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <Field label="Subject" required>
            <select
              className={inputClass}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            >
              <option value="">Select a subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Bank name" required>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>Create bank</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
