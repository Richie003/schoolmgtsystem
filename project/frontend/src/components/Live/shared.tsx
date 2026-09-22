import { useEffect, useRef, useState } from 'react';
import type { LiveStanding } from '../../types';

/*
 * NlightR Live — a "broadcast" visual language.
 *
 * Deliberately NOT the Kahoot look (vivid gradient + four colour quadrants) and
 * not the generic glassmorphism card either. The stage is ink-black with film
 * grain and a hairline grid; print-style registration marks sit in the corners;
 * type is oversized and set in tabular numerals. The one saturated colour is the
 * hosting school's brand accent, passed down from the server — so every game
 * wears its own school's identity rather than a template's.
 */

// A tiny fractal-noise tile used as film grain over the stage.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Answer keys — a ledger of options, not coloured tiles. */
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const optionKey = (i: number) => KEYS[i % KEYS.length];

/**
 * A restrained, "designed" palette for the per-option key square — muted-rich,
 * never primary RGBY. It gives the ledger rhythm without turning into Kahoot's
 * flat quadrants; everything else on the row stays monochrome.
 */
export const SPINE = ['#e0533d', '#2f9e8f', '#d9a441', '#6a5acd', '#c65b9b', '#3f8fd0'];
export const spine = (i: number) => SPINE[i % SPINE.length];

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full || '2563eb', 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
/** setInterval that always calls the latest callback. A null delay pauses it. */
export function useInterval(callback: () => void, delay: number | null) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Milliseconds left until the server's deadline, synced once to the server
 * clock (so a skewed client clock can't drift the timer) then run locally at
 * 100ms for a smooth drain. Returns null when no question is live.
 */
export function useDeadline(deadline?: string, serverTime?: string): number | null {
  const [, force] = useState(0);
  const skew = useRef(0);
  const target = useRef<number | null>(null);

  useEffect(() => {
    if (deadline && serverTime) {
      skew.current = Date.now() - Date.parse(serverTime);
      target.current = Date.parse(deadline);
    } else {
      target.current = null;
    }
  }, [deadline, serverTime]);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (target.current === null) return null;
  return Math.max(0, target.current - (Date.now() - skew.current));
}

// ---------------------------------------------------------------------------
// Stage & atoms
// ---------------------------------------------------------------------------
/** The ink stage: grain, hairline grid, an accent glow and corner marks. */
export function Stage({
  accent = '#2563eb',
  children,
}: {
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0f] text-neutral-100">
      {/* accent glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(80% 55% at 50% -8%, ${hexToRgba(accent, 0.28)}, transparent 62%)`,
        }}
      />
      {/* hairline grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,.035) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(255,255,255,.035) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(120% 90% at 50% 0%, black, transparent 85%)',
        }}
      />
      {/* film grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: GRAIN }}
      />
      <CornerMarks />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}

function CornerMarks() {
  const base = 'pointer-events-none absolute h-4 w-4 border-white/25';
  return (
    <>
      <span className={`${base} left-5 top-5 border-l border-t`} />
      <span className={`${base} right-5 top-5 border-r border-t`} />
      <span className={`${base} bottom-5 left-5 border-b border-l`} />
      <span className={`${base} bottom-5 right-5 border-b border-r`} />
    </>
  );
}

/** Wide-tracked uppercase micro-label — the editorial "kicker". */
export function Kicker({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-[0.34em] text-white/45 ${className}`}
    >
      {children}
    </span>
  );
}

/** The boxed monospace key that labels each answer row. */
export function KeySquare({
  index,
  filled = false,
  accent,
}: {
  index: number;
  filled?: boolean;
  accent?: string;
}) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] font-mono text-base font-bold"
      style={
        filled
          ? { background: accent, color: '#0a0a0f' }
          : { background: hexToRgba(spine(index), 0.16), color: spine(index), boxShadow: `inset 0 0 0 1px ${hexToRgba(spine(index), 0.5)}` }
      }
    >
      {optionKey(index)}
    </span>
  );
}

/** The blinking "● LIVE" indicator for the top rail. */
export function LiveDot({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.2em] text-white/70">
      <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
      {label}
    </span>
  );
}

/** A hairline rule. */
export function Rule({ className = '' }: { className?: string }) {
  return <div className={`h-px w-full bg-white/10 ${className}`} />;
}

/**
 * A one-shot confetti burst over the whole viewport. Self-contained canvas — no
 * library — that rains for a few seconds then fades and stops. Honours reduced
 * motion (renders nothing). The colour set is stable across re-renders (keyed on
 * the accent string) so polling doesn't keep restarting the burst.
 */
export function Confetti({ accent, count = 150 }: { accent: string; count?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors = [accent, '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#ffffff'];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (canvas.width = window.innerWidth * dpr);
    const H = (canvas.height = window.innerHeight * dpr);

    const parts = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: -Math.random() * H * 0.4,
      w: (6 + Math.random() * 6) * dpr,
      h: (9 + Math.random() * 7) * dpr,
      vx: (Math.random() - 0.5) * 1.6 * dpr,
      vy: (2.4 + Math.random() * 3.2) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.24,
      color: colors[(Math.random() * colors.length) | 0],
    }));

    let raf = 0;
    const start = performance.now();
    const DURATION = 3200;
    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03 * dpr; // gravity
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < DURATION) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [accent, count]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}

const ROW_REM = 3.5; // must match the row height (h-14) below, for the slide math.

/**
 * The scoreboard, mid-reshuffle. Rows are rendered in their NEW order but start
 * translated to where they sat in the PREVIOUS ranking, then slide into place —
 * so the board visibly rearranges itself highest-to-lowest. A movement caret and
 * a "+points" flash tell each player what just happened.
 */
export function Standings({
  rows,
  accent,
  highlight,
}: {
  rows: LiveStanding[];
  accent: string;
  highlight?: string;
}) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // Two frames: paint at the old positions once, then release to the new ones.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSettled(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-xl">
      {rows.map((r) => {
        const delta = r.prev_rank - r.rank; // + => moved up
        const mine = highlight != null && r.nickname === highlight;
        return (
          <div
            key={r.nickname}
            className="flex h-14 items-center gap-3 border-b border-white/10 px-2"
            style={{
              transform: settled ? 'translateY(0)' : `translateY(calc(${delta} * ${ROW_REM}rem))`,
              transition: 'transform 720ms cubic-bezier(.2,.7,.2,1)',
              background: mine ? hexToRgba(accent, 0.14) : undefined,
            }}
          >
            <span
              className="w-7 shrink-0 font-mono text-xl font-black tabular-nums"
              style={mine ? { color: accent } : undefined}
            >
              {r.rank}
            </span>
            <span
              className="w-8 shrink-0 font-mono text-xs"
              style={{ color: delta > 0 ? accent : 'rgba(255,255,255,.35)' }}
            >
              {delta !== 0 ? `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}` : ''}
            </span>
            <span className="flex-1 truncate text-lg font-bold">
              {r.nickname}
              {mine && <span className="ml-2 text-xs font-normal text-white/50">you</span>}
            </span>
            {r.gained > 0 && (
              <span
                className="rounded-full px-2 py-0.5 font-mono text-xs font-bold"
                style={{ background: hexToRgba(accent, 0.18), color: accent }}
              >
                +{r.gained}
              </span>
            )}
            <span className="w-16 shrink-0 text-right font-mono tabular-nums">{r.score}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The thin draining progress line pinned to the top of the stage. */
export function ProgressLine({ fraction, accent }: { fraction: number; accent: string }) {
  return (
    <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-white/5">
      <div
        className="h-full transition-[width] duration-100 ease-linear"
        style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, background: accent }}
      />
    </div>
  );
}
