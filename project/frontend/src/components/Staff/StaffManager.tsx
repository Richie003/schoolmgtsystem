import React, { useCallback, useEffect, useState } from 'react';
import { Link2, Plus, UserX } from 'lucide-react';
import { academicAPI, errorMessage, staffAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type {
  AcademicSession,
  Classroom,
  Staff,
  StaffRole,
  TeacherClassAssignment,
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

type Tab = 'staff' | 'assignments';

export default function StaffManager() {
  const { can } = useAuth();
  const canManage = can('school_admin', 'super_admin');
  const [tab, setTab] = useState<Tab>('staff');

  // The noticeboard used to live here as a third tab, which made it effectively
  // undiscoverable. It is now a top-level nav section.
  const tabs: { id: Tab; label: string }[] = [
    { id: 'staff', label: 'Staff' },
    { id: 'assignments', label: 'Class assignments' },
  ];

  return (
    <div>
      <PageHeader title="Staff" />

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors
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

      {tab === 'staff' && <StaffList canManage={canManage} />}
      {tab === 'assignments' && <Assignments canManage={canManage} />}
    </div>
  );
}

const BLANK_STAFF = {
  username: '',
  password: '',
  email: '',
  first_name: '',
  last_name: '',
  account_role: 'teacher',
  staff_number: '',
  role: '',
  phone: '',
  qualification: '',
  specialisation: '',
};

function StaffList({ canManage }: { canManage: boolean }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK_STAFF });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await staffAPI.list({ page_size: 100 });
      setStaff(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load staff.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    staffAPI.roles().then(({ data }) => setRoles(data.results)).catch(() => undefined);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.role) delete payload.role;
      await staffAPI.create(payload);
      setAdding(false);
      setForm({ ...BLANK_STAFF });
      setNotice('Staff member created with a login account.');
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create this staff member.'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (member: Staff) => {
    if (!window.confirm(`Deactivate ${member.full_name}? Their login will be disabled.`))
      return;
    try {
      await staffAPI.deactivate(member.id);
      setNotice('Staff member deactivated.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not deactivate this staff member.'));
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

      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => { setAdding(true); setFormError(''); }}>
            <Plus className="h-4 w-4" />
            Add staff
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : staff.length === 0 ? (
        <EmptyState message="No staff members yet." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Staff no.', 'Name', 'Account role', 'Job title', 'Status', ''].map((h) => (
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
            {staff.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                  {member.staff_number}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{member.full_name}</p>
                  <p className="text-xs text-gray-500">{member.email || member.username}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={member.account_role === 'school_admin' ? 'brand' : 'gray'}>
                    {member.account_role.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">{member.role_name || '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={member.employment_status === 'active' ? 'green' : 'gray'}>
                    {member.employment_status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && member.employment_status === 'active' && (
                    <button
                      onClick={() => deactivate(member)}
                      aria-label={`Deactivate ${member.full_name}`}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    >
                      <UserX className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={adding} title="Add staff member" onClose={() => setAdding(false)} wide>
        <form onSubmit={submit} className="space-y-4">
          {formError && <Alert>{formError}</Alert>}
          <p className="text-sm text-gray-500">
            This creates both the staff record and their login account.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Staff number" required>
              <input
                className={inputClass}
                value={form.staff_number}
                onChange={(e) => setForm({ ...form, staff_number: e.target.value })}
                required
              />
            </Field>
            <Field label="Account role" required>
              <select
                className={inputClass}
                value={form.account_role}
                onChange={(e) => setForm({ ...form, account_role: e.target.value })}
              >
                <option value="teacher">Teacher</option>
                <option value="school_admin">School Admin</option>
              </select>
            </Field>
            <Field label="First name" required>
              <input
                className={inputClass}
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Last name" required>
              <input
                className={inputClass}
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Username" required>
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </Field>
            <Field label="Temporary password" required>
              <input
                type="text"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Job title">
              <select
                className={inputClass}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="">None</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Qualification">
              <input
                className={inputClass}
                value={form.qualification}
                onChange={(e) => setForm({ ...form, qualification: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>Create staff member</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Assignments({ canManage }: { canManage: boolean }) {
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);
  const [teachers, setTeachers] = useState<Staff[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    teacher: '',
    classroom: '',
    session: '',
    is_form_teacher: false,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await staffAPI.assignments({ page_size: 200 });
      setAssignments(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load assignments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    staffAPI.teachers({ page_size: 200 })
      .then(({ data }) => setTeachers(data.results)).catch(() => undefined);
    academicAPI.classrooms({ page_size: 200 })
      .then(({ data }) => setClassrooms(data.results)).catch(() => undefined);
    academicAPI.sessions({ page_size: 50 })
      .then(({ data }) => {
        setSessions(data.results);
        const current = data.results.find((s) => s.is_current);
        if (current) setForm((f) => ({ ...f, session: String(current.id) }));
      })
      .catch(() => undefined);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await staffAPI.createAssignment({
        teacher: Number(form.teacher),
        classroom: Number(form.classroom),
        session: Number(form.session),
        is_form_teacher: form.is_form_teacher,
      });
      setAdding(false);
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create this assignment.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (assignment: TeacherClassAssignment) => {
    if (!window.confirm(`Remove ${assignment.teacher_name} from ${assignment.classroom_name}?`))
      return;
    try {
      await staffAPI.removeAssignment(assignment.id);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove this assignment.'));
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          A teacher can only see the students, attendance and checkouts of the classes
          assigned here.
        </p>
        {canManage && (
          <Button onClick={() => { setAdding(true); setFormError(''); }}>
            <Link2 className="h-4 w-4" />
            Assign class
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState message="No class assignments yet." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Teacher', 'Class', 'Session', 'Form teacher', 'Active', ''].map((h) => (
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
            {assignments.map((assignment) => (
              <tr key={assignment.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {assignment.teacher_name}
                </td>
                <td className="px-4 py-3 text-gray-600">{assignment.classroom_name}</td>
                <td className="px-4 py-3 text-gray-600">
                  {sessions.find((s) => s.id === assignment.session)?.name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {assignment.is_form_teacher ? <Badge tone="brand">Form teacher</Badge> : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={assignment.is_active ? 'green' : 'gray'}>
                    {assignment.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && (
                    <Button variant="ghost" onClick={() => remove(assignment)}>
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={adding} title="Assign a teacher to a class" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-4">
          {formError && <Alert>{formError}</Alert>}

          <Field label="Teacher" required>
            <select
              className={inputClass}
              value={form.teacher}
              onChange={(e) => setForm({ ...form, teacher: e.target.value })}
              required
            >
              <option value="">Select a teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Class" required>
            <select
              className={inputClass}
              value={form.classroom}
              onChange={(e) => setForm({ ...form, classroom: e.target.value })}
              required
            >
              <option value="">Select a class</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Session" required>
            <select
              className={inputClass}
              value={form.session}
              onChange={(e) => setForm({ ...form, session: e.target.value })}
              required
            >
              <option value="">Select a session</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_form_teacher}
              onChange={(e) => setForm({ ...form, is_form_teacher: e.target.checked })}
              className="rounded border-gray-300"
            />
            Form teacher for this class
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>Create assignment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
