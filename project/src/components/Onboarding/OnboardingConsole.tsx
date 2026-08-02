import { useCallback, useEffect, useState } from 'react';
import { Check, Mail, Plus, RotateCw, X } from 'lucide-react';
import { errorMessage, onboardingAPI } from '../../services/api';
import type { SchoolInvitation, SchoolSignupRequest } from '../../types';
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

type Tab = 'requests' | 'invitations';

const REQUEST_TONE = {
  pending: 'amber',
  approved: 'green',
  rejected: 'gray',
} as const;

const INVITE_TONE = {
  pending: 'amber',
  accepted: 'green',
  expired: 'gray',
  revoked: 'red',
} as const;

/** Platform super-admin console for reviewing school signups. */
export default function OnboardingConsole() {
  const [tab, setTab] = useState<Tab>('requests');
  const [notice, setNotice] = useState('');

  return (
    <div>
      <PageHeader
        title="School onboarding"
        subtitle="Review access requests and manage invitations."
      />

      {notice && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6" role="tablist">
          {([['requests', 'Requests'], ['invitations', 'Invitations']] as [Tab, string][]).map(
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

      {tab === 'requests' ? (
        <Requests onNotice={setNotice} />
      ) : (
        <Invitations onNotice={setNotice} />
      )}
    </div>
  );
}

function Requests({ onNotice }: { onNotice: (m: string) => void }) {
  const [requests, setRequests] = useState<SchoolSignupRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState<SchoolSignupRequest | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await onboardingAPI.requests({
        status: statusFilter || undefined,
        page_size: 100,
        ordering: '-created_at',
      });
      setRequests(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load requests.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const reject = async (req: SchoolSignupRequest) => {
    const reason = window.prompt(
      `Reject the request from ${req.school_name}? Optionally give a reason ` +
      '(emailed to them):',
      '',
    );
    if (reason === null) return; // cancelled
    setBusy(req.id);
    try {
      await onboardingAPI.rejectRequest(req.id, reason || undefined);
      onNotice('Request rejected.');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Could not reject this request.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      <div className="mb-4 max-w-[220px]">
        <Field label="Filter by status">
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : requests.length === 0 ? (
        <EmptyState message="No requests match this filter." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['School', 'Contact', 'Received', 'Status', ''].map((h) => (
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
            {requests.map((req) => (
              <tr key={req.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{req.school_name}</p>
                  {req.message && (
                    <p className="mt-0.5 max-w-xs text-xs text-gray-500">{req.message}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="text-gray-900">{req.contact_name}</p>
                  <p className="text-xs text-gray-500">{req.contact_email}</p>
                  {req.contact_phone && (
                    <p className="text-xs text-gray-500">{req.contact_phone}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {new Date(req.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={REQUEST_TONE[req.status]}>{req.status}</Badge>
                  {req.invitation_status && (
                    <p className="mt-1 text-xs text-gray-400">
                      invite: {req.invitation_status}
                    </p>
                  )}
                  {req.review_note && (
                    <p className="mt-1 max-w-[180px] text-xs text-gray-400">
                      {req.review_note}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {req.status === 'pending' && (
                    <div className="flex justify-end gap-1">
                      <Button onClick={() => setApproving(req)}>
                        <Check className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        loading={busy === req.id}
                        onClick={() => reject(req)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <ApproveModal
        request={approving}
        onClose={() => setApproving(null)}
        onApproved={() => {
          setApproving(null);
          onNotice('Approved — an invitation email has been sent.');
          load();
        }}
      />
    </div>
  );
}

function ApproveModal({
  request,
  onClose,
  onApproved,
}: {
  request: SchoolSignupRequest | null;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [schoolName, setSchoolName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (request) {
      setSchoolName(request.school_name);
      setEmail(request.contact_email);
      setError('');
    }
  }, [request]);

  const submit = async () => {
    if (!request) return;
    setSaving(true);
    setError('');
    try {
      await onboardingAPI.approveRequest(request.id, {
        school_name: schoolName,
        email,
      });
      onApproved();
    } catch (err) {
      setError(errorMessage(err, 'Could not approve this request.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={request !== null}
      title="Approve and send invitation"
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-gray-500">
          An invitation link will be emailed to the address below. You can adjust
          the details before sending.
        </p>

        <Field label="School name" required>
          <input
            className={inputClass}
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
        </Field>

        <Field label="Send invitation to" required>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>
            <Mail className="h-4 w-4" />
            Approve &amp; send
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Invitations({ onNotice }: { onNotice: (m: string) => void }) {
  const [invitations, setInvitations] = useState<SchoolInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await onboardingAPI.invitations({
        page_size: 100,
        ordering: '-created_at',
      });
      setInvitations(data.results);
    } catch (err) {
      setError(errorMessage(err, 'Could not load invitations.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (
    invite: SchoolInvitation,
    fn: (id: number) => Promise<unknown>,
    message: string,
  ) => {
    setBusy(invite.id);
    setError('');
    try {
      await fn(invite.id);
      onNotice(message);
      load();
    } catch (err) {
      setError(errorMessage(err, 'That action could not be completed.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Invite a school
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : invitations.length === 0 ? (
        <EmptyState message="No invitations yet." />
      ) : (
        <TableWrap>
          <thead className="bg-gray-50">
            <tr>
              {['Email', 'School', 'Status', 'Expires', 'Created by', ''].map((h) => (
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
            {invitations.map((invite) => (
              <tr key={invite.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{invite.email}</td>
                <td className="px-4 py-3">
                  {invite.school_name}
                  {invite.school_code && (
                    <span className="ml-1 font-mono text-xs text-gray-400">
                      ({invite.school_code})
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={INVITE_TONE[invite.status]}>{invite.status}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {new Date(invite.expires_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {invite.created_by_name ?? '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {invite.status !== 'accepted' && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="secondary"
                        loading={busy === invite.id}
                        onClick={() =>
                          act(invite, onboardingAPI.resendInvitation,
                              'A fresh invitation email has been sent.')
                        }
                      >
                        <RotateCw className="h-4 w-4" />
                        Resend
                      </Button>
                      {invite.status !== 'revoked' && (
                        <Button
                          variant="ghost"
                          loading={busy === invite.id}
                          onClick={() =>
                            act(invite, onboardingAPI.revokeInvitation,
                                'Invitation revoked.')
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <CreateInviteModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          onNotice('Invitation sent.');
          load();
        }}
      />
    </div>
  );
}

function CreateInviteModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setEmail('');
      setSchoolName('');
      setError('');
    }
  }, [open]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onboardingAPI.createInvitation({ email, school_name: schoolName });
      onCreated();
    } catch (err) {
      setError(errorMessage(err, 'Could not send this invitation.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Invite a school directly" onClose={onClose}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-gray-500">
          Sends a setup link straight away, without a prior request.
        </p>

        <Field label="School name" required>
          <input
            className={inputClass}
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
        </Field>

        <Field label="Email" required>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>
            <Mail className="h-4 w-4" />
            Send invitation
          </Button>
        </div>
      </div>
    </Modal>
  );
}
