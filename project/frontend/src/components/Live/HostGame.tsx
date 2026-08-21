import { useCallback, useEffect, useState } from 'react';
import type { LiveHostState } from '../../types';
import { liveAPI } from '../../services/api';
import MathText from '../UI/MathText';
import {
  Kicker, KeySquare, LiveDot, ProgressLine, Rule, Stage,
  hexToRgba, useDeadline, useInterval,
} from './shared';

/**
 * The host's presenter screen — built for a shared display. A broadcast board:
 * ink stage, the PIN set as a headline, questions as a numbered ledger, and a
 * results board on reveal. All game control lives here.
 */
export default function HostGame({
  sessionId,
  onExit,
}: {
  sessionId: number;
  onExit: () => void;
}) {
  const [st, setSt] = useState<LiveHostState | null>(null);
  const [busy, setBusy] = useState(false);

  const poll = useCallback(async () => {
    try {
      const { data } = await liveAPI.hostState(sessionId);
      setSt(data);
    } catch {
      /* transient — next tick retries */
    }
  }, [sessionId]);

  useEffect(() => {
    poll();
  }, [poll]);
  useInterval(poll, st?.status === 'ended' || busy ? null : 1000);

  const accent = st?.accent || '#2563eb';
  const ms = useDeadline(st?.deadline, st?.server_time);
  const total = (st?.seconds_per_question || 20) * 1000;
  const seconds = ms === null ? null : Math.ceil(ms / 1000);

  const act = async (fn: () => Promise<{ data: LiveHostState }>) => {
    setBusy(true);
    try {
      const { data } = await fn();
      setSt(data);
    } finally {
      setBusy(false);
    }
  };

  if (!st) {
    return (
      <Stage accent={accent}>
        <div className="flex min-h-screen items-center justify-center">
          <Kicker>Connecting…</Kicker>
        </div>
      </Stage>
    );
  }

  return (
    <Stage accent={accent}>
      {st.status === 'question' && (
        <ProgressLine fraction={ms === null ? 0 : ms / total} accent={accent} />
      )}

      <div className="flex min-h-screen flex-col px-6 sm:px-10">
        {/* top rail */}
        <header className="flex items-center justify-between pt-8">
          <div className="min-w-0">
            <Kicker>NlightR · Live</Kicker>
            <p className="mt-1 truncate text-lg font-bold tracking-tight">{st.title}</p>
          </div>
          <div className="flex items-center gap-5">
            {st.status !== 'lobby' && st.status !== 'ended' && (
              <span className="font-mono text-sm tracking-[0.2em] text-white/70 tabular-nums">
                {String(st.question_index + 1).padStart(2, '0')} / {String(st.question_count).padStart(2, '0')}
              </span>
            )}
            {(st.status === 'question' || st.status === 'reveal') && <LiveDot />}
            <button
              onClick={() => act(() => liveAPI.end(sessionId)).then(onExit)}
              className="font-mono text-lg text-white/40 transition hover:text-white"
              aria-label="End game"
            >
              ✕
            </button>
          </div>
        </header>
        <Rule className="mt-6" />

        <div className="flex flex-1 flex-col py-8">
          {st.status === 'lobby' && (
            <Lobby st={st} accent={accent} busy={busy} onStart={() => act(() => liveAPI.start(sessionId))} />
          )}
          {(st.status === 'question' || st.status === 'reveal') && (
            <Board
              st={st}
              accent={accent}
              seconds={seconds}
              busy={busy}
              onReveal={() => act(() => liveAPI.reveal(sessionId))}
              onNext={() => act(() => liveAPI.next(sessionId))}
            />
          )}
          {st.status === 'ended' && <Final st={st} accent={accent} onExit={onExit} />}
        </div>
      </div>
    </Stage>
  );
}

function CommandButton({
  onClick,
  disabled,
  accent,
  variant = 'solid',
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  accent: string;
  variant?: 'solid' | 'ghost';
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[6px] px-8 py-3.5 text-sm font-bold uppercase tracking-[0.15em] transition disabled:opacity-40 ${
        variant === 'ghost' ? 'border border-white/25 text-white hover:bg-white/5' : ''
      }`}
      style={variant === 'solid' ? { background: accent, color: '#0a0a0f' } : undefined}
    >
      {children}
    </button>
  );
}

function Lobby({
  st,
  accent,
  busy,
  onStart,
}: {
  st: LiveHostState;
  accent: string;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="grid gap-10 lg:grid-cols-[auto_1fr] lg:items-center">
        <div>
          <Kicker>Game PIN</Kicker>
          <div className="mt-3">
            <span className="block font-mono text-7xl font-black tabular-nums tracking-[0.1em] sm:text-8xl">
              {st.pin}
            </span>
            <div className="mt-4 h-1.5 w-full" style={{ background: accent }} />
          </div>
          <p className="mt-5 max-w-xs text-sm text-white/50">
            Open this site and choose{' '}
            <span className="font-semibold text-white">Join a quiz</span> — no account needed.
          </p>
        </div>

        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <Kicker>In the room</Kicker>
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: accent }}>
              {String(st.player_count).padStart(2, '0')}
            </span>
          </div>
          {st.players.length === 0 ? (
            <p className="text-white/40">Waiting for players to join…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {st.players.map((p, i) => (
                <span
                  key={p.nickname}
                  className="flex animate-[fadeIn_.3s_ease] items-center gap-2 rounded-[5px] border border-white/12 bg-white/[0.03] px-3 py-1.5"
                >
                  <span className="font-mono text-[11px] text-white/35 tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-semibold">{p.nickname}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-12">
        <CommandButton onClick={onStart} disabled={busy || st.player_count === 0} accent={accent}>
          ▸ Start game
        </CommandButton>
      </div>
    </div>
  );
}

function Board({
  st,
  accent,
  seconds,
  busy,
  onReveal,
  onNext,
}: {
  st: LiveHostState;
  accent: string;
  seconds: number | null;
  busy: boolean;
  onReveal: () => void;
  onNext: () => void;
}) {
  const q = st.question!;
  const revealing = st.status === 'reveal';
  const correct = new Set(st.correct_choice_ids ?? []);
  const dist = st.distribution ?? {};
  const maxCount = Math.max(1, ...Object.values(dist));
  const last = st.question_index + 1 >= st.question_count;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <Kicker>Question {st.question_index + 1}</Kicker>
          <MathText className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {q.text}
          </MathText>
          {q.image && (
            <img src={q.image} alt="" className="mt-5 max-h-52 rounded-lg border border-white/10" />
          )}
        </div>
        {!revealing && seconds !== null && (
          <div className="shrink-0 text-right">
            <span className="block font-mono text-6xl font-black tabular-nums leading-none sm:text-7xl">
              {seconds}
            </span>
            <Kicker className="mt-1 block">seconds</Kicker>
          </div>
        )}
      </div>

      {/* answers ledger */}
      <div className="mt-8">
        <Rule />
        {q.choices.map((c, i) => {
          const isRight = correct.has(c.id);
          const count = dist[String(c.id)] ?? 0;
          return (
            <div key={c.id}>
              <div
                className={`flex items-center gap-4 px-1 py-4 transition ${
                  revealing && !isRight ? 'opacity-35' : ''
                }`}
                style={revealing && isRight ? { background: hexToRgba(accent, 0.12) } : undefined}
              >
                <KeySquare index={i} filled={revealing && isRight} accent={accent} />
                <MathText inline className="flex-1 text-xl font-semibold text-white">
                  {c.text}
                </MathText>
                {revealing && (
                  <span className="font-mono tabular-nums text-white/60">{count}</span>
                )}
                {revealing && isRight && (
                  <span className="text-2xl" style={{ color: accent }}>✓</span>
                )}
              </div>
              {revealing && (
                <div className="h-[3px] w-full bg-white/[0.06]">
                  <div
                    className="h-full transition-[width] duration-500"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                      background: isRight ? accent : 'rgba(255,255,255,.22)',
                    }}
                  />
                </div>
              )}
              <Rule />
            </div>
          );
        })}
      </div>

      {/* action rail */}
      <div className="mt-6 flex items-center justify-between">
        <span className="font-mono text-sm tracking-wide text-white/45 tabular-nums">
          {st.answered_count ?? 0} / {st.player_count} answered
        </span>
        {revealing ? (
          <CommandButton onClick={onNext} disabled={busy} accent={accent}>
            {last ? 'Final results ▸' : 'Next ▸'}
          </CommandButton>
        ) : (
          <CommandButton onClick={onReveal} disabled={busy} accent={accent} variant="ghost">
            Show results
          </CommandButton>
        )}
      </div>

      {revealing && st.scoreboard && st.scoreboard.length > 0 && (
        <div className="mt-8">
          <Kicker>Standings</Kicker>
          <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {st.scoreboard.map((row) => (
              <div key={row.rank} className="flex items-center gap-3 py-1.5">
                <span className="w-6 font-mono text-sm text-white/35 tabular-nums">
                  {String(row.rank).padStart(2, '0')}
                </span>
                <span className="flex-1 truncate font-semibold">{row.nickname}</span>
                <span className="font-mono tabular-nums" style={{ color: accent }}>
                  {row.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Final({ st, accent, onExit }: { st: LiveHostState; accent: string; onExit: () => void }) {
  const podium = st.podium ?? [];
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center">
      <Kicker>Final standings</Kicker>
      <h2 className="mb-8 mt-2 text-5xl font-black tracking-tight">Results</h2>

      <div>
        {podium.map((row) => {
          const champ = row.rank === 1;
          return (
            <div
              key={row.rank}
              className={`flex items-center gap-5 px-5 py-4 ${champ ? 'rounded-[6px]' : ''}`}
              style={champ ? { background: accent, color: '#0a0a0f' } : undefined}
            >
              <span
                className={`font-mono text-4xl font-black tabular-nums ${champ ? '' : 'text-white/30'}`}
              >
                {row.rank}
              </span>
              <span className="flex-1 truncate text-2xl font-bold">{row.nickname}</span>
              <span className="font-mono text-xl tabular-nums">{row.score}</span>
              {champ && (
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">
                  Winner
                </span>
              )}
            </div>
          );
        })}
        {podium.length === 0 && <p className="text-white/40">No players finished.</p>}
      </div>

      <div className="mt-10">
        <CommandButton onClick={onExit} accent={accent} variant="ghost">
          Done
        </CommandButton>
      </div>
    </div>
  );
}
