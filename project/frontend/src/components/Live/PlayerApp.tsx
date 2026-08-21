import { useCallback, useEffect, useRef, useState } from 'react';
import type { LivePlayerState } from '../../types';
import { errorMessage, liveAPI } from '../../services/api';
import MathText from '../UI/MathText';
import {
  Kicker, KeySquare, ProgressLine, Rule, Stage,
  hexToRgba, useDeadline, useInterval,
} from './shared';

interface Joined {
  pin: string;
  token: string;
  nickname: string;
}

const STORAGE_KEY = 'live.player';
const MISS = '#e0533d';

/**
 * The guest player app: join by PIN + nickname, then play on your own device.
 * No account — the whole flow rides the public `/live/play/...` endpoints. The
 * join is remembered for the tab so a stray refresh doesn't drop a player.
 */
export default function PlayerApp({
  initialPin = '',
  onExit,
}: {
  initialPin?: string;
  onExit?: () => void;
}) {
  const [joined, setJoined] = useState<Joined | null>(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Joined) : null;
  });

  const save = (next: Joined | null) => {
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
    setJoined(next);
  };

  if (!joined) return <JoinForm initialPin={initialPin} onJoined={save} onExit={onExit} />;
  return <PlayerGame joined={joined} onLeave={() => save(null)} />;
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
function JoinForm({
  initialPin,
  onJoined,
  onExit,
}: {
  initialPin: string;
  onJoined: (j: Joined) => void;
  onExit?: () => void;
}) {
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await liveAPI.join(pin.trim(), nickname.trim());
      onJoined({ pin: data.pin, token: data.token, nickname: data.nickname });
    } catch (err) {
      setError(errorMessage(err, 'Could not join that game.'));
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full border-b border-white/20 bg-transparent px-1 py-3 text-2xl font-semibold ' +
    'placeholder-white/20 focus:border-white/70 focus:outline-none';

  return (
    <Stage>
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <Kicker>NlightR · Live</Kicker>
        <h1 className="mt-3 text-4xl font-black leading-none tracking-tight">
          Join<br />the game.
        </h1>
        <div className="mt-2 h-1 w-16 bg-brand-500" />

        <form onSubmit={submit} className="mt-10 space-y-7">
          <label className="block">
            <Kicker>Game PIN</Kicker>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className={`${field} mt-2 font-mono tracking-[0.3em]`}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <Kicker>Your name</Kicker>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 20))}
              placeholder="Nickname"
              className={`${field} mt-2`}
              required
            />
          </label>

          {error && (
            <p className="font-mono text-sm" style={{ color: MISS }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || pin.length < 6 || !nickname.trim()}
            className="w-full rounded-[6px] bg-brand-500 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-brand-contrast transition disabled:opacity-40"
          >
            {busy ? 'Joining…' : '▸ Enter'}
          </button>
        </form>

        {onExit && (
          <button onClick={onExit} className="mt-10 self-start font-mono text-xs text-white/40 hover:text-white">
            ← back
          </button>
        )}
      </div>
    </Stage>
  );
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------
function PlayerGame({ joined, onLeave }: { joined: Joined; onLeave: () => void }) {
  const { pin, token } = joined;
  const [st, setSt] = useState<LivePlayerState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [gone, setGone] = useState(false);
  const lastIndex = useRef<number>(-1);

  const poll = useCallback(async () => {
    try {
      const { data } = await liveAPI.playerState(pin, token);
      setSt(data);
    } catch {
      setGone(true);
    }
  }, [pin, token]);

  useEffect(() => {
    poll();
  }, [poll]);
  useInterval(poll, gone ? null : 1000);

  useEffect(() => {
    if (st && st.question_index !== lastIndex.current) {
      lastIndex.current = st.question_index;
      setSelected([]);
    }
  }, [st]);

  const accent = st?.accent || '#2563eb';
  const ms = useDeadline(st?.deadline, st?.server_time);
  const total = (st?.seconds_per_question || 20) * 1000;
  const seconds = ms === null ? null : Math.ceil(ms / 1000);

  const submit = async (choiceIds: number[]) => {
    if (!choiceIds.length) return;
    setSubmitting(true);
    try {
      await liveAPI.answer(pin, token, choiceIds);
      await poll();
    } catch {
      /* poll reflects the true state */
    } finally {
      setSubmitting(false);
    }
  };

  if (gone) {
    return (
      <Stage accent={accent}>
        <Center>
          <Kicker>That's a wrap</Kicker>
          <p className="mt-3 text-3xl font-black tracking-tight">Thanks for playing.</p>
          <button onClick={onLeave} className="mt-8 font-mono text-xs text-white/40 hover:text-white">
            ← leave
          </button>
        </Center>
      </Stage>
    );
  }

  if (!st) {
    return (
      <Stage accent={accent}>
        <Center>
          <Kicker>Connecting…</Kicker>
        </Center>
      </Stage>
    );
  }

  const you = st.you;

  return (
    <Stage accent={accent}>
      {st.status === 'question' && !st.answered && (
        <ProgressLine fraction={ms === null ? 0 : ms / total} accent={accent} />
      )}
      <div className="flex min-h-screen flex-col">
        {/* mini rail */}
        <div className="flex items-center justify-between px-5 pt-7">
          <span className="truncate font-semibold">{you.nickname}</span>
          <span className="flex items-center gap-3">
            {you.streak > 1 && (
              <span className="font-mono text-xs" style={{ color: accent }}>
                ▲{you.streak}
              </span>
            )}
            <span className="font-mono text-lg tabular-nums">{you.score}</span>
          </span>
        </div>
        <Rule className="mt-4" />

        <div className="flex flex-1 flex-col px-5">
          {st.status === 'lobby' && (
            <Center>
              <Kicker>You're in</Kicker>
              <p className="mt-3 text-4xl font-black tracking-tight">{you.nickname}</p>
              <p className="mt-4 text-white/45">Eyes on the big screen. Get ready…</p>
              <div className="mx-auto mt-6 h-1 w-24 animate-pulse" style={{ background: accent }} />
            </Center>
          )}

          {st.status === 'question' && st.question && (
            <Question
              state={st}
              accent={accent}
              seconds={seconds}
              selected={selected}
              setSelected={setSelected}
              submitting={submitting}
              onSubmit={submit}
            />
          )}

          {st.status === 'reveal' && <Reveal state={st} accent={accent} />}
          {st.status === 'ended' && <Ended state={st} accent={accent} onLeave={onLeave} />}
        </div>
      </div>
    </Stage>
  );
}

function Question({
  state,
  accent,
  seconds,
  selected,
  setSelected,
  submitting,
  onSubmit,
}: {
  state: LivePlayerState;
  accent: string;
  seconds: number | null;
  selected: number[];
  setSelected: (v: number[]) => void;
  submitting: boolean;
  onSubmit: (ids: number[]) => void;
}) {
  const q = state.question!;
  const multiple = q.multiple;

  if (state.answered) {
    return (
      <Center>
        <Kicker>Locked in</Kicker>
        <p className="mt-3 text-3xl font-black tracking-tight" style={{ color: accent }}>
          Answer sent.
        </p>
        <p className="mt-4 text-white/45">Hold tight for the results…</p>
      </Center>
    );
  }

  const toggle = (id: number) => {
    if (multiple) {
      setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    } else {
      onSubmit([id]);
    }
  };

  return (
    <div className="flex flex-1 flex-col py-6">
      <div className="flex items-center justify-between">
        <Kicker>
          Q{state.question_index + 1} / {state.question_count}
        </Kicker>
        {seconds !== null && (
          <span className="font-mono text-3xl font-black tabular-nums">{seconds}</span>
        )}
      </div>

      <MathText className="mt-4 text-2xl font-bold leading-tight tracking-tight">
        {q.text}
      </MathText>
      {q.image && <img src={q.image} alt="" className="mt-4 max-h-40 rounded-lg border border-white/10" />}

      <div className="mt-6">
        <Rule />
        {q.choices.map((c, i) => {
          const on = selected.includes(c.id);
          return (
            <div key={c.id}>
              <button
                onClick={() => toggle(c.id)}
                disabled={submitting}
                className="flex w-full items-center gap-3 px-1 py-4 text-left transition disabled:opacity-60"
                style={on ? { background: hexToRgba(accent, 0.14) } : undefined}
              >
                <KeySquare index={i} filled={on} accent={accent} />
                <MathText inline className="flex-1 text-lg font-semibold text-white">
                  {c.text}
                </MathText>
              </button>
              <Rule />
            </div>
          );
        })}
      </div>

      {multiple && (
        <button
          onClick={() => onSubmit(selected)}
          disabled={submitting || !selected.length}
          className="mt-6 w-full rounded-[6px] px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] transition disabled:opacity-40"
          style={{ background: accent, color: '#0a0a0f' }}
        >
          ▸ Submit
        </button>
      )}
    </div>
  );
}

function Reveal({ state, accent }: { state: LivePlayerState; accent: string }) {
  const r = state.result;
  const correct = r?.is_correct;
  return (
    <Center>
      {r?.answered ? (
        <>
          <Kicker>{correct ? 'Nailed it' : 'Not quite'}</Kicker>
          <p
            className="mt-3 text-6xl font-black tracking-tight"
            style={{ color: correct ? accent : MISS }}
          >
            {correct ? 'CORRECT' : 'MISSED'}
          </p>
          {correct && r.points > 0 && (
            <p className="mt-3 font-mono text-2xl">+{r.points}</p>
          )}
        </>
      ) : (
        <>
          <Kicker>Time's up</Kicker>
          <p className="mt-3 text-5xl font-black tracking-tight text-white/40">NO ANSWER</p>
        </>
      )}
      <p className="mt-8 font-mono text-white/55">
        {state.you.score} pts · {ordinal(state.you.rank)}
      </p>
    </Center>
  );
}

function Ended({
  state,
  accent,
  onLeave,
}: {
  state: LivePlayerState;
  accent: string;
  onLeave: () => void;
}) {
  const podium = state.podium ?? [];
  const me = state.you;
  const won = podium[0]?.nickname === me.nickname;

  return (
    <div className="flex flex-1 flex-col justify-center py-8">
      <Kicker>{won ? 'Champion' : 'Final'}</Kicker>
      <p className="mt-2 text-5xl font-black tracking-tight" style={won ? { color: accent } : undefined}>
        {won ? 'You won.' : ordinal(me.rank)}
      </p>
      <p className="mt-1 font-mono text-white/55">{me.score} pts</p>

      <div className="mt-8">
        {podium.map((p) => {
          const mine = p.nickname === me.nickname;
          const champ = p.rank === 1;
          return (
            <div
              key={p.rank}
              className={`flex items-center gap-4 px-3 py-3 ${champ || mine ? 'rounded-[6px]' : ''}`}
              style={
                champ
                  ? { background: accent, color: '#0a0a0f' }
                  : mine
                    ? { background: hexToRgba(accent, 0.14), boxShadow: `inset 3px 0 0 ${accent}` }
                    : undefined
              }
            >
              <span
                className={`font-mono text-2xl font-black tabular-nums ${champ || mine ? '' : 'text-white/30'}`}
              >
                {p.rank}
              </span>
              <span className="flex-1 truncate text-lg font-bold">{p.nickname}</span>
              <span className="font-mono tabular-nums">{p.score}</span>
            </div>
          );
        })}
      </div>

      <button onClick={onLeave} className="mt-10 self-start font-mono text-xs text-white/40 hover:text-white">
        ← leave
      </button>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div>{children}</div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
