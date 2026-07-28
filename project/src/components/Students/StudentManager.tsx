import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { academicAPI, errorMessage, studentsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Classroom, Student } from '../../types';
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

const BLANK: Partial<Student> = {
  admission_number: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  gender: 'male',
  date_of_birth: null,
  classroom: null,
  parent_name: '',
  parent_phone: '',
  parent_email: '',
  address: '',
  status: 'active',
};

export default function StudentManager() {
  const { can } = useAuth();
  const canManage = can('school_admin', 'super_admin');

  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState<Partial<Student> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [accountFor, setAccountFor] = useState<Student | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await studentsAPI.list({
        page,
        search: search || undefined,
        classroom: classFilter || undefined,
      });
      setStudents(data.results);
      setCount(data.count);
    } catch (err) {
      setError(errorMessage(err, 'Could not load students.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, classFilter]);

  useEffect(() => {
    // Debounced so typing in the search box doesn't fire a request per keystroke.
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    academicAPI
      .classrooms({ page_size: 200 })
      .then(({ data }) => setClassrooms(data.results))
      .catch(() => setClassrooms([]));
  }, []);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(count / 25)), [count]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;

    setSaving(true);
    setFormError('');
    try {
      const payload = { ...editing };
      if (!payload.date_of_birth) delete payload.date_of_birth;

      if (editing.id) {
        await studentsAPI.update(editing.id, payload);
        setNotice('Student updated.');
      } else {
        await studentsAPI.create(payload);
        setNotice('Student created.');
      }
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save this student.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (student: Student) => {
    if (!window.confirm(`Delete ${student.full_name}? This cannot be undone.`)) return;
    try {
      await studentsAPI.remove(student.id);
      setNotice('Student deleted.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete this student.'));
    }
  };

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle={`${count} student${count === 1 ? '' : 's'}`}
        actions={
          canManage && (
            <Button onClick={() => { setEditing({ ...BLANK }); setFormError(''); }}>
              <Plus className="h-4 w-4" />
              Add student
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4">
          <Alert onDismiss={() => setError('')}>{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or admission number"
            aria-label="Search students"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
          aria-label="Filter by class"
          className={`${inputClass} max-w-[220px]`}
        >
          <option value="">All classes</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : students.length === 0 ? (
        <EmptyState message="No students match this filter." />
      ) : (
        <>
          <TableWrap>
            <thead className="bg-gray-50">
              <tr>
                {['Admission no.', 'Name', 'Class', 'Gender', 'Parent contact', 'Status', ''].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                    {student.admission_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {student.full_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {student.classroom_name || '—'}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">{student.gender}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {student.parent_phone || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={student.status === 'active' ? 'green' : 'gray'}>
                      {student.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        {!student.user && (
                          <button
                            onClick={() => setAccountFor(student)}
                            title="Create login account"
                            aria-label={`Create login for ${student.full_name}`}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => { setEditing(student); setFormError(''); }}
                          aria-label={`Edit ${student.full_name}`}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(student)}
                          aria-label={`Delete ${student.full_name}`}
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

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">Page {page} of {pageCount}</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={editing !== null}
        title={editing?.id ? 'Edit student' : 'Add student'}
        onClose={() => setEditing(null)}
        wide
      >
        {editing && (
          <form onSubmit={save} className="space-y-4">
            {formError && <Alert>{formError}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Admission number" required>
                <input
                  className={inputClass}
                  value={editing.admission_number ?? ''}
                  onChange={(e) => setEditing({ ...editing, admission_number: e.target.value })}
                  required
                />
              </Field>
              <Field label="Class">
                <select
                  className={inputClass}
                  value={editing.classroom ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      classroom: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="First name" required>
                <input
                  className={inputClass}
                  value={editing.first_name ?? ''}
                  onChange={(e) => setEditing({ ...editing, first_name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Last name" required>
                <input
                  className={inputClass}
                  value={editing.last_name ?? ''}
                  onChange={(e) => setEditing({ ...editing, last_name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Middle name">
                <input
                  className={inputClass}
                  value={editing.middle_name ?? ''}
                  onChange={(e) => setEditing({ ...editing, middle_name: e.target.value })}
                />
              </Field>
              <Field label="Gender" required>
                <select
                  className={inputClass}
                  value={editing.gender ?? 'male'}
                  onChange={(e) =>
                    setEditing({ ...editing, gender: e.target.value as Student['gender'] })
                  }
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Date of birth">
                <input
                  type="date"
                  className={inputClass}
                  value={editing.date_of_birth ?? ''}
                  onChange={(e) =>
                    setEditing({ ...editing, date_of_birth: e.target.value || null })
                  }
                />
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  value={editing.status ?? 'active'}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value as Student['status'] })
                  }
                >
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </Field>
              <Field label="Parent / guardian name">
                <input
                  className={inputClass}
                  value={editing.parent_name ?? ''}
                  onChange={(e) => setEditing({ ...editing, parent_name: e.target.value })}
                />
              </Field>
              <Field label="Parent phone">
                <input
                  className={inputClass}
                  value={editing.parent_phone ?? ''}
                  onChange={(e) => setEditing({ ...editing, parent_phone: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Address">
              <textarea
                className={inputClass}
                rows={2}
                value={editing.address ?? ''}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editing.id ? 'Save changes' : 'Create student'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <CreateAccountModal
        student={accountFor}
        onClose={() => setAccountFor(null)}
        onDone={() => {
          setAccountFor(null);
          setNotice('Login account created.');
          load();
        }}
      />
    </div>
  );
}

function CreateAccountModal({
  student,
  onClose,
  onDone,
}: {
  student: Student | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Seed a sensible username from the admission number when the modal opens.
    if (student) {
      setUsername(student.admission_number.toLowerCase().replace(/[^a-z0-9]/g, ''));
      setPassword('');
      setError('');
    }
  }, [student]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!student) return;

    setSaving(true);
    setError('');
    try {
      await studentsAPI.createAccount(student.id, { username, password });
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Could not create the account.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={student !== null}
      title={`Create login for ${student?.full_name ?? ''}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-gray-500">
          This gives the student access to sit CBT exams and view their own results.
        </p>

        <Field label="Username" required>
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field label="Temporary password" required>
          <input
            type="text"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create account</Button>
        </div>
      </form>
    </Modal>
  );
}
