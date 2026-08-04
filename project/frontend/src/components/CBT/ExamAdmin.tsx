import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Plus, Send, Square } from 'lucide-react';
import { academicAPI, cbtAPI, errorMessage } from '../../services/api';
import type {
  Classroom,
  Exam,
  ExamAttempt,
  QuestionBank,
  Subject,
  Term,
} from '../../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  TableWrap,
  inputClass,
} from '../UI/Primitives';
import QuestionBankView from './QuestionBankView';

type Tab = 'exams' | 'questions';

export default function ExamAdmin() {
  const [tab, setTab] = useState<Tab>('exams');

  return (
    <div>
      <PageHeader title="CBT" subtitle="Create question banks, build exams, review results" />

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6" role="tablist">
          {([['exams', 'Exams'], ['questions', 'Question bank']] as [Tab, string][]).map(
            ([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors
                  ${
                    tab === id
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
              >
                {label}
              </button>
            ),
          )}
        </nav>
      </div>

      {tab === 'exams' ? <ExamList /> : <QuestionBankView />}
    </div>
  );
}

function ExamList() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [creating, setCreating] = useState(false);
  const [resultsFor, setResultsFor] = useState<Exam | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await cbtAPI.exams({ page_size: 100 });
      setExams(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load exams.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    cbtAPI.subjects({ page_size: 100 })
      .then(({ data }) => setSubjects(data.results)).catch(() => undefined);
    cbtAPI.banks({ page_size: 100 })
      .then(({ data }) => setBanks(data.results)).catch(() => undefined);
    academicAPI.terms({ page_size: 100 })
      .then(({ data }) => setTerms(data.results)).catch(() => undefined);
    academicAPI.classrooms({ page_size: 200 })
      .then(({ data }) => setClassrooms(data.results)).catch(() => undefined);
  }, []);

  const publish = async (exam: Exam) => {
    try {
      await cbtAPI.publishExam(exam.id);
      setNotice(`"${exam.title}" is now published and visible to students.`);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not publish this exam.'));
    }
  };

  const close = async (exam: Exam) => {
    try {
      await cbtAPI.closeExam(exam.id);
      setNotice(`"${exam.title}" is now closed.`);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not close this exam.'));
    }
  };

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

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Create exam
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : exams.length === 0 ? (
        <EmptyState message="No exams yet. Create a question bank first, then build an exam from it." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Exam', 'Subject', 'Questions', 'Duration', 'Window', 'Status', 'Attempts', ''].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {exams.map((exam) => (
              <tr key={exam.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{exam.title}</td>
                <td className="px-4 py-3 text-gray-600">{exam.subject_name}</td>
                <td className="px-4 py-3 text-gray-600">
                  {exam.question_count}
                  <span className="ml-1 text-xs text-gray-400">
                    / {exam.available_question_count} in bank
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {exam.duration_minutes} min
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {new Date(exam.starts_at).toLocaleString()}
                  <br />
                  {new Date(exam.ends_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      exam.status === 'published'
                        ? 'green'
                        : exam.status === 'closed'
                          ? 'gray'
                          : 'amber'
                    }
                  >
                    {exam.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">{exam.attempt_count}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => setResultsFor(exam)} title="Results">
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    {exam.status === 'draft' && (
                      <Button variant="ghost" onClick={() => publish(exam)} title="Publish">
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    {exam.status === 'published' && (
                      <Button variant="ghost" onClick={() => close(exam)} title="Close">
                        <Square className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <CreateExamModal
        open={creating}
        subjects={subjects}
        banks={banks}
        terms={terms}
        classrooms={classrooms}
        onClose={() => setCreating(false)}
        onCreated={() => { setCreating(false); setNotice('Exam created as a draft.'); load(); }}
      />

      <ExamResultsModal exam={resultsFor} onClose={() => setResultsFor(null)} />
    </div>
  );
}

function CreateExamModal({
  open,
  subjects,
  banks,
  terms,
  classrooms,
  onClose,
  onCreated,
}: {
  open: boolean;
  subjects: Subject[];
  banks: QuestionBank[];
  terms: Term[];
  classrooms: Classroom[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    subject: '',
    bank: '',
    term: '',
    instructions: '',
    question_count: 20,
    duration_minutes: 45,
    pass_mark_percent: 50,
    starts_at: '',
    ends_at: '',
    max_attempts: 1,
    shuffle_questions: true,
    shuffle_choices: true,
    show_results_immediately: true,
    classrooms: [] as number[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Banks belong to a subject, so narrowing here prevents an invalid pairing
  // the server would reject anyway.
  const banksForSubject = banks.filter(
    (bank) => !form.subject || bank.subject === Number(form.subject),
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const term = terms.find((t) => t.id === Number(form.term));
      await cbtAPI.createExam({
        ...form,
        subject: Number(form.subject),
        bank: Number(form.bank),
        term: Number(form.term),
        session: term?.session,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err, 'Could not create this exam.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Create exam" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Title" required>
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject" required>
            <select
              className={inputClass}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value, bank: '' })}
              required
            >
              <option value="">Select a subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Question bank" required>
            <select
              className={inputClass}
              value={form.bank}
              onChange={(e) => setForm({ ...form, bank: e.target.value })}
              required
            >
              <option value="">Select a bank</option>
              {banksForSubject.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.question_count} questions)
                </option>
              ))}
            </select>
          </Field>

          <Field label="Term" required>
            <select
              className={inputClass}
              value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value })}
              required
            >
              <option value="">Select a term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {t.session_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Questions to draw" required>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.question_count}
              onChange={(e) => setForm({ ...form, question_count: Number(e.target.value) })}
              required
            />
          </Field>

          <Field label="Duration (minutes)" required>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              required
            />
          </Field>

          <Field label="Pass mark (%)">
            <input
              type="number"
              min={0}
              max={100}
              className={inputClass}
              value={form.pass_mark_percent}
              onChange={(e) => setForm({ ...form, pass_mark_percent: Number(e.target.value) })}
            />
          </Field>

          <Field label="Opens at" required>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              required
            />
          </Field>

          <Field label="Closes at" required>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              required
            />
          </Field>

          <Field label="Attempts allowed">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.max_attempts}
              onChange={(e) => setForm({ ...form, max_attempts: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Classes sitting this exam (none = whole school)">
          <select
            multiple
            className={`${inputClass} h-32`}
            value={form.classrooms.map(String)}
            onChange={(e) =>
              setForm({
                ...form,
                classrooms: Array.from(e.target.selectedOptions, (o) => Number(o.value)),
              })
            }
          >
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </Field>

        <Field label="Instructions">
          <textarea
            className={inputClass}
            rows={3}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </Field>

        <div className="space-y-2">
          {([
            ['shuffle_questions', 'Randomise question selection per student'],
            ['shuffle_choices', 'Shuffle answer options'],
            ['show_results_immediately', 'Show results to students on submission'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                className="rounded border-gray-300"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create as draft</Button>
        </div>
      </form>
    </Modal>
  );
}

function ExamResultsModal({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [summary, setSummary] = useState<{
    average_percentage: number;
    passed: number;
    attempts: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exam) return;
    setLoading(true);
    cbtAPI
      .examResults(exam.id, { page_size: 100 })
      .then(({ data }) => {
        setAttempts(data.results ?? []);
        setSummary(data.summary);
      })
      .catch(() => setAttempts([]))
      .finally(() => setLoading(false));
  }, [exam]);

  if (!exam) return null;

  return (
    <Modal open title={`Results — ${exam.title}`} onClose={onClose} wide>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : (
        <div className="space-y-5">
          {summary && (
            <div className="grid grid-cols-3 gap-4">
              {[
                ['Attempts', summary.attempts],
                ['Passed', summary.passed],
                ['Average', `${summary.average_percentage}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-gray-50 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          )}

          {attempts.length === 0 ? (
            <EmptyState message="No submitted attempts yet." />
          ) : (
            <TableWrap>
              <thead className="bg-gray-50">
                <tr>
                  {['Student', 'Attempt', 'Score', '%', 'Outcome', 'Submitted'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {attempt.student_name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">#{attempt.attempt_number}</td>
                    <td className="px-4 py-2 font-mono text-gray-700">
                      {attempt.score} / {attempt.total_marks}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{attempt.percentage}%</td>
                    <td className="px-4 py-2">
                      <Badge tone={attempt.is_passed ? 'green' : 'red'}>
                        {attempt.is_passed ? 'Pass' : 'Fail'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {attempt.submitted_at
                        ? new Date(attempt.submitted_at).toLocaleString()
                        : '—'}
                      {attempt.status === 'auto_submitted' && ' (auto)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}
    </Modal>
  );
}
