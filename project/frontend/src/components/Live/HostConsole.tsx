import { useEffect, useState } from 'react';
import { Gamepad2, Play, Plus, Trash2, Users } from 'lucide-react';
import { cbtAPI, errorMessage, fetchAll, liveAPI } from '../../services/api';
import type { LiveSession, LiveStatus, QuestionBank } from '../../types';
import {
  Alert, Badge, Button, EmptyState, Field, Modal, PageHeader, Spinner, inputClass,
} from '../UI/Primitives';
import HostGame from './HostGame';

const STATUS_TONE: Record<LiveStatus, 'gray' | 'amber' | 'green' | 'brand'> = {
  lobby: 'amber', question: 'green', reveal: 'brand', ended: 'gray',
};
const STATUS_LABEL: Record<LiveStatus, string> = {
  lobby: 'In lobby', question: 'Live', reveal: 'Live', ended: 'Ended',
};

/**
 * Staff landing for the live quiz: list your games, spin up a new one, and jump
 * into the presenter screen to host it.
 */
export default function HostConsole() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [hostingId, setHostingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    liveAPI.sessions()
      .then(({ data }) => setSessions(data.results))
      .catch((e) => setError(errorMessage(e, 'Could not load games.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id: number) => {
    await liveAPI.removeSession(id).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  if (hostingId !== null) {
    // The presenter takes over the whole viewport.
    return (
      <div className="fixed inset-0 z-[60]">
        <HostGame
          sessionId={hostingId}
          onExit={() => {
            setHostingId(null);
            load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Quiz"
        subtitle="Host a fast, Kahoot-style game. Players join with a PIN — just for fun, no grades."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New game
          </Button>
        }
      />

      {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState message="No games yet. Create one from a question bank to get started." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{s.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {s.subject_name} · {s.question_count || '—'} questions
                  </p>
                </div>
                <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
              </div>

              <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
                {s.status !== 'ended' && (
                  <span className="font-mono text-base font-bold tracking-widest text-gray-900">
                    {s.pin}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {s.player_count}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                {s.status !== 'ended' && (
                  <Button size="md" className="flex-1" onClick={() => setHostingId(s.id)}>
                    <Play className="h-4 w-4" /> Host
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => remove(s.id)}
                  aria-label="Delete game"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <NewGameModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setHostingId(id);
          }}
        />
      )}
    </div>
  );
}

function NewGameModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [bank, setBank] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [seconds, setSeconds] = useState(20);
  const [speedBonus, setSpeedBonus] = useState(true);
  const [scoreboardEvery, setScoreboardEvery] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAll<QuestionBank>((params) => cbtAPI.banks(params), { is_active: true })
      .then((rows) => setBanks(rows.filter((b) => b.question_count > 0)))
      .catch((e) => setError(errorMessage(e, 'Could not load question banks.')))
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    if (!bank) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await liveAPI.createSession({
        bank: Number(bank),
        title: title.trim() || undefined,
        seconds_per_question: seconds,
        speed_bonus: speedBonus,
        scoreboard_every: scoreboardEvery,
      });
      onCreated(data.id);
    } catch (e) {
      setError(errorMessage(e, 'Could not create the game.'));
      setBusy(false);
    }
  };

  return (
    <Modal open title="New live game" onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : banks.length === 0 ? (
        <EmptyState message="No question banks with questions yet. Add questions in CBT first." />
      ) : (
        <div className="space-y-4">
          <Field label="Question bank" required>
            <select
              className={inputClass}
              value={bank}
              onChange={(e) => setBank(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Choose a bank…</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.subject_name} — {b.name} ({b.question_count})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Game title">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to the bank name"
            />
          </Field>

          <Field label="Seconds per question">
            <select
              className={inputClass}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            >
              {[10, 15, 20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>{n} seconds</option>
              ))}
            </select>
          </Field>

          <Field label="Scoreboard interlude">
            <select
              className={inputClass}
              value={scoreboardEvery}
              onChange={(e) => setScoreboardEvery(Number(e.target.value))}
            >
              <option value={1}>After every question</option>
              <option value={2}>After every 2 questions</option>
              <option value={3}>After every 3 questions</option>
              <option value={4}>After every 4 questions</option>
              <option value={5}>After every 5 questions</option>
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={speedBonus}
              onChange={(e) => setSpeedBonus(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Award more points for faster answers
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={create} loading={busy} disabled={!bank}>
              <Gamepad2 className="h-4 w-4" /> Create & host
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
