import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, Plus, Trash2 } from 'lucide-react';
import { errorMessage, staffAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Notice, Staff } from '../../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  inputClass,
} from '../UI/Primitives';

const PRIORITY_TONE = {
  high: 'red',
  medium: 'amber',
  low: 'gray',
} as const;

/**
 * Staff noticeboard and pending-assignment tracker.
 *
 * Teachers see notices addressed to them plus general staff notices; admins see
 * everything and are the only ones who can post.
 */
export default function Noticeboard() {
  const { can } = useAuth();
  const canManage = can('school_admin', 'super_admin');

  const [notices, setNotices] = useState<Notice[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: '',
    body: '',
    priority: 'medium',
    audience: 'all_staff',
    assigned_to: '',
    due_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await staffAPI.notices({
        is_completed: showCompleted ? undefined : false,
        page_size: 100,
      });
      setNotices(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the noticeboard.'));
    } finally {
      setLoading(false);
    }
  }, [showCompleted]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    staffAPI.list({ page_size: 200 })
      .then(({ data }) => setStaff(data.results))
      .catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.assigned_to) payload.assigned_to = null;
      if (!payload.due_date) payload.due_date = null;

      await staffAPI.createNotice(payload as Partial<Notice>);
      setAdding(false);
      setForm({
        title: '',
        body: '',
        priority: 'medium',
        audience: 'all_staff',
        assigned_to: '',
        due_date: '',
      });
      load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not post this notice.'));
    } finally {
      setSaving(false);
    }
  };

  const complete = async (notice: Notice) => {
    try {
      await staffAPI.completeNotice(notice.id);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not mark this notice complete.'));
    }
  };

  const remove = async (notice: Notice) => {
    if (!window.confirm(`Delete "${notice.title}"?`)) return;
    try {
      await staffAPI.removeNotice(notice.id);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete this notice.'));
    }
  };

  const pendingCount = notices.filter((n) => !n.is_completed).length;

  return (
    <div>
      <PageHeader
        title="Noticeboard"
        subtitle={
          canManage
            ? 'Post announcements and assign tasks to staff.'
            : 'Announcements and tasks assigned to you.'
        }
        actions={
          canManage && (
            <Button onClick={() => { setAdding(true); setFormError(''); }}>
              <Plus className="h-4 w-4" />
              Post notice
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show completed
        </label>
        {!loading && (
          <span className="text-sm text-gray-500">
            {pendingCount} pending
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : notices.length === 0 ? (
        <EmptyState message="Nothing on the noticeboard." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {notices.map((notice) => (
            <article
              key={notice.id}
              className={`rounded-lg border bg-white p-5 shadow-sm
                ${notice.is_overdue ? 'border-red-300' : 'border-gray-200'}
                ${notice.is_completed ? 'opacity-60' : ''}`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="font-semibold text-gray-900">{notice.title}</h3>
                <Badge tone={PRIORITY_TONE[notice.priority]}>{notice.priority}</Badge>
              </div>

              <p className="mb-3 whitespace-pre-wrap text-sm text-gray-600">
                {notice.body}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {notice.assigned_to_name && (
                  <span>Assigned to <strong>{notice.assigned_to_name}</strong></span>
                )}
                {notice.due_date && (
                  <span className={`inline-flex items-center gap-1 ${notice.is_overdue ? 'text-red-600' : ''}`}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    Due {notice.due_date}
                    {notice.is_overdue && ' (overdue)'}
                  </span>
                )}
                {notice.is_completed && <Badge tone="green">Completed</Badge>}
              </div>

              <div className="mt-4 flex gap-2">
                {!notice.is_completed && (
                  <Button variant="secondary" onClick={() => complete(notice)}>
                    <Check className="h-4 w-4" />
                    Mark done
                  </Button>
                )}
                {canManage && (
                  <Button variant="ghost" onClick={() => remove(notice)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={adding} title="Post a notice" onClose={() => setAdding(false)}>
        <form onSubmit={submit} className="space-y-4">
          {formError && <Alert>{formError}</Alert>}

          <Field label="Title" required>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </Field>

          <Field label="Details" required>
            <textarea
              className={inputClass}
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority">
              <select
                className={inputClass}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Audience">
              <select
                className={inputClass}
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
              >
                <option value="all_staff">All staff</option>
                <option value="teachers">Teachers</option>
                <option value="admins">Admins</option>
              </select>
            </Field>
            <Field label="Assign to (optional)">
              <select
                className={inputClass}
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              >
                <option value="">Nobody in particular</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>{member.full_name}</option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                className={inputClass}
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>Post notice</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
