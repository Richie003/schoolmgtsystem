import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { academicAPI, cbtAPI, errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { AcademicSession, Classroom, Subject, Term } from '../../types';
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

type Tab = 'sessions' | 'terms' | 'classrooms' | 'subjects';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'terms', label: 'Terms' },
  { id: 'classrooms', label: 'Classes' },
  { id: 'subjects', label: 'Subjects' },
];

/**
 * Academic setup — the records everything else depends on.
 *
 * Without a current session and term, attendance, checkouts and exams have
 * nothing to attach to, so this is effectively the first screen an admin needs.
 */
export default function AcademicsManager() {
  const { can } = useAuth();
  const canManage = can('school_admin', 'super_admin');
  const [tab, setTab] = useState<Tab>('sessions');

  return (
    <div>
      <PageHeader
        title="Academics"
        subtitle="Sessions, terms, classes and subjects. Set a current session and term before marking attendance or scheduling exams."
      />

      {!canManage && (
        <div className="mb-4">
          <Alert kind="info">
            You can view academic settings, but only a school administrator can
            change them.
          </Alert>
        </div>
      )}

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors
                ${
                  tab === item.id
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'sessions' && <Sessions canManage={canManage} />}
      {tab === 'terms' && <Terms canManage={canManage} />}
      {tab === 'classrooms' && <Classrooms canManage={canManage} />}
      {tab === 'subjects' && <Subjects canManage={canManage} />}
    </div>
  );
}

/** Shared feedback banners, so each tab doesn't re-implement them. */
function useFeedback() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const banners = (
    <>
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}
    </>
  );

  return { error, setError, notice, setNotice, banners };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function Sessions({ canManage }: { canManage: boolean }) {
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { setError, setNotice, banners } = useFeedback();

  const [editing, setEditing] = useState<Partial<AcademicSession> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await academicAPI.sessions({ page_size: 100 });
      setSessions(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load sessions.'));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => { load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setFormError('');
    try {
      if (editing.id) {
        await academicAPI.updateSession(editing.id, editing);
        setNotice('Session updated.');
      } else {
        await academicAPI.createSession(editing);
        setNotice('Session created.');
      }
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save this session.'));
    } finally {
      setSaving(false);
    }
  };

  const makeCurrent = async (session: AcademicSession) => {
    try {
      // The API demotes the previous current session automatically, so this is
      // a single call rather than two.
      await academicAPI.updateSession(session.id, { is_current: true });
      setNotice(`${session.name} is now the current session.`);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not set the current session.'));
    }
  };

  const remove = async (session: AcademicSession) => {
    if (!window.confirm(
      `Delete ${session.name}? Terms, attendance and exams belonging to it will ` +
      'also be removed.',
    )) return;
    try {
      await academicAPI.removeSession(session.id);
      setNotice('Session deleted.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete this session.'));
    }
  };

  return (
    <div>
      {banners}

      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setEditing({ name: '', start_date: '', end_date: '', is_current: false });
              setFormError('');
            }}
          >
            <Plus className="h-4 w-4" />
            New session
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState message="No academic sessions yet. Create one to get started — e.g. 2026/2027." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Session', 'Starts', 'Ends', 'Status', ''].map((h) => (
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
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{session.name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {session.start_date}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {session.end_date}
                </td>
                <td className="px-4 py-3">
                  {session.is_current ? (
                    <Badge tone="green">Current</Badge>
                  ) : (
                    <Badge tone="gray">Past</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      {!session.is_current && (
                        <Button variant="ghost" onClick={() => makeCurrent(session)}>
                          <Check className="h-4 w-4" />
                          Set current
                        </Button>
                      )}
                      <button
                        onClick={() => { setEditing(session); setFormError(''); }}
                        aria-label={`Edit ${session.name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(session)}
                        aria-label={`Delete ${session.name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal
        open={editing !== null}
        title={editing?.id ? 'Edit session' : 'New academic session'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form onSubmit={save} className="space-y-4">
            {formError && <Alert>{formError}</Alert>}

            <Field label="Session name" required>
              <input
                className={inputClass}
                placeholder="2026/2027"
                value={editing.name ?? ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" required>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.start_date ?? ''}
                  onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                  required
                />
              </Field>
              <Field label="End date" required>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.end_date ?? ''}
                  onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                  required
                />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editing.is_current ?? false}
                onChange={(e) => setEditing({ ...editing, is_current: e.target.checked })}
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                Make this the current session
                <span className="block text-xs text-gray-500">
                  Any other current session is demoted automatically.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing.id ? 'Save changes' : 'Create session'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

function Terms({ canManage }: { canManage: boolean }) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionFilter, setSessionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { setError, setNotice, banners } = useFeedback();

  const [editing, setEditing] = useState<Partial<Term> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await academicAPI.terms({
        page_size: 100,
        session: sessionFilter || undefined,
      });
      setTerms(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load terms.'));
    } finally {
      setLoading(false);
    }
  }, [sessionFilter, setError]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    academicAPI
      .sessions({ page_size: 100 })
      .then(({ data }) => setSessions(data.results))
      .catch(() => undefined);
  }, []);

  const currentSession = sessions.find((s) => s.is_current);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setFormError('');
    try {
      const payload = { ...editing, session: Number(editing.session) };
      if (editing.id) {
        await academicAPI.updateTerm(editing.id, payload);
        setNotice('Term updated.');
      } else {
        await academicAPI.createTerm(payload);
        setNotice('Term created.');
      }
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save this term.'));
    } finally {
      setSaving(false);
    }
  };

  const makeCurrent = async (term: Term) => {
    try {
      await academicAPI.updateTerm(term.id, { is_current: true });
      setNotice(`${term.name} is now the current term.`);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not set the current term.'));
    }
  };

  const remove = async (term: Term) => {
    if (!window.confirm(
      `Delete ${term.name}? Attendance, checkouts and exams in this term will ` +
      'also be removed.',
    )) return;
    try {
      await academicAPI.removeTerm(term.id);
      setNotice('Term deleted.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete this term.'));
    }
  };

  return (
    <div>
      {banners}

      {sessions.length === 0 && !loading && (
        <div className="mb-4">
          <Alert kind="info">
            Create an academic session first — a term has to belong to one.
          </Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px]">
          <Field label="Filter by session">
            <select
              className={inputClass}
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            >
              <option value="">All sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {canManage && (
          <Button
            disabled={sessions.length === 0}
            onClick={() => {
              setEditing({
                name: '',
                session: currentSession?.id ?? sessions[0]?.id,
                start_date: '',
                end_date: '',
                is_current: false,
              });
              setFormError('');
            }}
          >
            <Plus className="h-4 w-4" />
            New term
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : terms.length === 0 ? (
        <EmptyState message="No terms yet. Create one — e.g. First Term." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Term', 'Session', 'Starts', 'Ends', 'Status', ''].map((h) => (
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
            {terms.map((term) => (
              <tr key={term.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{term.name}</td>
                <td className="px-4 py-3 text-gray-600">{term.session_name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {term.start_date}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {term.end_date}
                </td>
                <td className="px-4 py-3">
                  {term.is_current ? (
                    <Badge tone="green">Current</Badge>
                  ) : (
                    <Badge tone="gray">Inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      {!term.is_current && (
                        <Button variant="ghost" onClick={() => makeCurrent(term)}>
                          <Check className="h-4 w-4" />
                          Set current
                        </Button>
                      )}
                      <button
                        onClick={() => { setEditing(term); setFormError(''); }}
                        aria-label={`Edit ${term.name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(term)}
                        aria-label={`Delete ${term.name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal
        open={editing !== null}
        title={editing?.id ? 'Edit term' : 'New term'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form onSubmit={save} className="space-y-4">
            {formError && <Alert>{formError}</Alert>}

            <Field label="Session" required>
              <select
                className={inputClass}
                value={editing.session ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, session: Number(e.target.value) })
                }
                required
              >
                <option value="">Select a session</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Term name" required>
              <input
                className={inputClass}
                placeholder="First Term"
                value={editing.name ?? ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" required>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.start_date ?? ''}
                  onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                  required
                />
              </Field>
              <Field label="End date" required>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.end_date ?? ''}
                  onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                  required
                />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editing.is_current ?? false}
                onChange={(e) => setEditing({ ...editing, is_current: e.target.checked })}
                className="mt-0.5 rounded border-gray-300"
              />
              <span>
                Make this the current term
                <span className="block text-xs text-gray-500">
                  Attendance and checkouts are recorded against the current term.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing.id ? 'Save changes' : 'Create term'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classrooms
// ---------------------------------------------------------------------------

function Classrooms({ canManage }: { canManage: boolean }) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const { setError, setNotice, banners } = useFeedback();

  const [editing, setEditing] = useState<Partial<Classroom> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await academicAPI.classrooms({ page_size: 200 });
      setClassrooms(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load classes.'));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => { load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setFormError('');
    try {
      if (editing.id) {
        await academicAPI.updateClassroom(editing.id, editing);
        setNotice('Class updated.');
      } else {
        await academicAPI.createClassroom(editing);
        setNotice('Class created.');
      }
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save this class.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (classroom: Classroom) => {
    if (classroom.student_count > 0) {
      setError(
        `${classroom.full_name} still has ${classroom.student_count} student(s). ` +
        'Move them to another class first.',
      );
      return;
    }
    if (!window.confirm(`Delete ${classroom.full_name}?`)) return;
    try {
      await academicAPI.removeClassroom(classroom.id);
      setNotice('Class deleted.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete this class.'));
    }
  };

  return (
    <div>
      {banners}

      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setEditing({ name: '', arm: '', capacity: 0, is_active: true });
              setFormError('');
            }}
          >
            <Plus className="h-4 w-4" />
            New class
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : classrooms.length === 0 ? (
        <EmptyState message="No classes yet. Create one — e.g. JSS 1, arm A." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Class', 'Arm', 'Students', 'Capacity', 'Status', ''].map((h) => (
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
            {classrooms.map((classroom) => (
              <tr key={classroom.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{classroom.name}</td>
                <td className="px-4 py-3 text-gray-600">{classroom.arm || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{classroom.student_count}</td>
                <td className="px-4 py-3 text-gray-600">
                  {classroom.capacity || 'Uncapped'}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={classroom.is_active ? 'green' : 'gray'}>
                    {classroom.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditing(classroom); setFormError(''); }}
                        aria-label={`Edit ${classroom.full_name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(classroom)}
                        aria-label={`Delete ${classroom.full_name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal
        open={editing !== null}
        title={editing?.id ? 'Edit class' : 'New class'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form onSubmit={save} className="space-y-4">
            {formError && <Alert>{formError}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Class name" required>
                <input
                  className={inputClass}
                  placeholder="JSS 1"
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Arm">
                <input
                  className={inputClass}
                  placeholder="A"
                  value={editing.arm ?? ''}
                  onChange={(e) => setEditing({ ...editing, arm: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Capacity">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={editing.capacity ?? 0}
                onChange={(e) =>
                  setEditing({ ...editing, capacity: Number(e.target.value) })
                }
              />
              <span className="mt-1 block text-xs text-gray-500">
                Leave at 0 for no limit.
              </span>
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                className="rounded border-gray-300"
              />
              Active
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing.id ? 'Save changes' : 'Create class'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

function Subjects({ canManage }: { canManage: boolean }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const { setError, setNotice, banners } = useFeedback();

  const [editing, setEditing] = useState<Partial<Subject> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await cbtAPI.subjects({ page_size: 200 });
      setSubjects(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load subjects.'));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => { load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setFormError('');
    try {
      if (editing.id) {
        await cbtAPI.updateSubject(editing.id, editing);
        setNotice('Subject updated.');
      } else {
        await cbtAPI.createSubject(editing);
        setNotice('Subject created. You can now add a question bank for it under CBT.');
      }
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save this subject.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (subject: Subject) => {
    if (!window.confirm(
      `Delete ${subject.name}? Its question banks and questions go with it.`,
    )) return;
    try {
      await cbtAPI.removeSubject(subject.id);
      setNotice('Subject deleted.');
      load();
    } catch (err) {
      setError(
        errorMessage(
          err,
          'Could not delete this subject — it may still be used by an exam.',
        ),
      );
    }
  };

  return (
    <div>
      {banners}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Subjects group the question banks that CBT exams draw from.
        </p>
        {canManage && (
          <Button
            onClick={() => {
              setEditing({ name: '', code: '', description: '', is_active: true });
              setFormError('');
            }}
          >
            <Plus className="h-4 w-4" />
            New subject
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState message="No subjects yet. Add one before creating a question bank." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Subject', 'Code', 'Description', 'Status', ''].map((h) => (
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
            {subjects.map((subject) => (
              <tr key={subject.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{subject.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {subject.code || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{subject.description || '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={subject.is_active ? 'green' : 'gray'}>
                    {subject.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditing(subject); setFormError(''); }}
                        aria-label={`Edit ${subject.name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(subject)}
                        aria-label={`Delete ${subject.name}`}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal
        open={editing !== null}
        title={editing?.id ? 'Edit subject' : 'New subject'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form onSubmit={save} className="space-y-4">
            {formError && <Alert>{formError}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject name" required>
                <input
                  className={inputClass}
                  placeholder="Mathematics"
                  value={editing.name ?? ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Code">
                <input
                  className={inputClass}
                  placeholder="MTH"
                  value={editing.code ?? ''}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Description">
              <textarea
                className={inputClass}
                rows={2}
                value={editing.description ?? ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                className="rounded border-gray-300"
              />
              Active
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing.id ? 'Save changes' : 'Create subject'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
