import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Plus, Trash2 } from 'lucide-react';
import {
  academicAPI,
  checkoutsAPI,
  errorMessage,
  fetchAll,
  studentsAPI,
} from '../../services/api';
import { describeDate, nowTime, today } from '../../utils/dates';
import type { CheckoutRecord, Classroom, Student, Term } from '../../types';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  TableWrap,
  inputClass,
} from '../UI/Primitives';

const BLANK_FORM = {
  student: '',
  checked_out_at: '',
  released_to: '',
  relationship: '',
  remark: '',
};

export default function CheckoutManager() {
  const [records, setRecords] = useState<CheckoutRecord[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [setupError, setSetupError] = useState('');

  const [date, setDate] = useState(today);
  const [classFilter, setClassFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await checkoutsAPI.list({
        date,
        classroom: classFilter || undefined,
        page_size: 200,
      });
      setRecords(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load checkout records.'));
    } finally {
      setLoading(false);
    }
  }, [date, classFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    academicAPI
      .classrooms({ page_size: 200 })
      .then(({ data }) => setClassrooms(data.results))
      .catch(() => undefined);

    academicAPI
      .currentTerm()
      .then(({ data }) => setTerm(data))
      .catch(() =>
        setSetupError(
          'No current term is set, so checkouts cannot be recorded. ' +
            'Set one under Academics → Terms.',
        ),
      );

    // Every page, not just the first: a school with more than one page of
    // students would otherwise be missing pupils from the picker entirely.
    fetchAll<Student>(
      (params) => studentsAPI.list(params),
      { status: 'active' },
    )
      .then(setStudents)
      .catch(() => undefined);
  }, []);

  /** Students already checked out today can't be picked again. */
  const availableStudents = useMemo(() => {
    const taken = new Set(records.map((r) => r.student));
    const query = studentSearch.trim().toLowerCase();

    return students
      .filter((s) => !taken.has(s.id))
      .filter(
        (s) =>
          !query ||
          s.full_name.toLowerCase().includes(query) ||
          s.admission_number.toLowerCase().includes(query),
      )
      .slice(0, 100);
  }, [students, records, studentSearch]);

  const openForm = () => {
    setForm({ ...BLANK_FORM, checked_out_at: nowTime() });
    setStudentSearch('');
    setFormError('');
    setAdding(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!term) return;

    setSaving(true);
    setFormError('');
    try {
      const student = students.find((s) => s.id === Number(form.student));
      await checkoutsAPI.create({
        student: Number(form.student),
        session: term.session,
        term: term.id,
        classroom: student?.classroom ?? null,
        date,
        checked_out_at: form.checked_out_at,
        released_to: form.released_to,
        relationship: form.relationship,
        remark: form.remark,
      });
      setAdding(false);
      setForm({ ...BLANK_FORM });
      setNotice(`${student?.full_name ?? 'Student'} checked out at ${form.checked_out_at}.`);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not record this checkout.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (record: CheckoutRecord) => {
    if (!window.confirm(`Remove the checkout record for ${record.student_name}?`)) return;
    try {
      await checkoutsAPI.remove(record.id);
      setNotice('Checkout record removed.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove this record.'));
    }
  };

  const outsideTerm =
    term !== null && (date < term.start_date || date > term.end_date);

  return (
    <div>
      <PageHeader
        title="Student checkouts"
        subtitle={term ? `${term.name} — ${term.session_name}` : undefined}
        actions={
          <Button onClick={openForm} disabled={!term || outsideTerm}>
            <Plus className="h-4 w-4" />
            Record checkout
          </Button>
        }
      />

      {setupError && (
        <div className="mb-4"><Alert kind="info">{setupError}</Alert></div>
      )}
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={term?.start_date}
            max={term?.end_date}
          />
          <span className="mt-1 block text-xs text-gray-500">{describeDate(date)}</span>
        </Field>
        <Field label="Class">
          <select
            className={inputClass}
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="">All classes</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </Field>
      </div>

      {outsideTerm && term && (
        <div className="mb-4">
          <Alert kind="info">
            {date} falls outside {term.name} ({term.start_date} to {term.end_date}),
            so checkouts cannot be recorded for this day.
          </Alert>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : records.length === 0 ? (
        <EmptyState message={`No checkouts recorded for ${describeDate(date)}.`} />
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-500">
            {records.length} student{records.length === 1 ? '' : 's'} checked out.
          </p>
          <TableWrap>
            <thead className="bg-gray-50">
              <tr>
                {['Student', 'Class', 'Time', 'Released to', 'Relationship', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{record.student_name}</p>
                    <p className="font-mono text-xs text-gray-500">
                      {record.admission_number}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {classrooms.find((c) => c.id === record.classroom)?.full_name ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-900">
                      <LogOut className="h-3.5 w-3.5 text-gray-400" />
                      {record.checked_out_at?.slice(0, 5)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{record.released_to || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{record.relationship || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(record)}
                      aria-label={`Remove checkout for ${record.student_name}`}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}

      <Modal
        open={adding}
        title={`Record checkout — ${describeDate(date)}`}
        onClose={() => setAdding(false)}
      >
        <form onSubmit={submit} className="space-y-4">
          {formError && <Alert>{formError}</Alert>}

          <Field label="Find student" required>
            <input
              className={inputClass}
              placeholder="Search by name or admission number"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Student" required>
            <select
              className={inputClass}
              size={6}
              value={form.student}
              onChange={(e) => setForm({ ...form, student: e.target.value })}
              required
            >
              {availableStudents.length === 0 ? (
                <option value="" disabled>
                  {students.length === 0
                    ? 'Loading students…'
                    : 'No matching student is still on site'}
                </option>
              ) : (
                availableStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {s.admission_number}
                  </option>
                ))
              )}
            </select>
            <span className="mt-1 block text-xs text-gray-500">
              Students already checked out today are not listed.
            </span>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Checkout time" required>
              <input
                type="time"
                className={inputClass}
                value={form.checked_out_at}
                onChange={(e) => setForm({ ...form, checked_out_at: e.target.value })}
                required
              />
            </Field>
            <Field label="Relationship">
              <input
                className={inputClass}
                placeholder="Mother, driver, guardian…"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Released to">
            <input
              className={inputClass}
              placeholder="Name of the adult collecting the student"
              value={form.released_to}
              onChange={(e) => setForm({ ...form, released_to: e.target.value })}
            />
          </Field>

          <Field label="Remark">
            <textarea
              className={inputClass}
              rows={2}
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.student}>
              Record checkout
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
