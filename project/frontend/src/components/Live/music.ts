import { useEffect, useRef } from 'react';

/*
 * Live-quiz music — generated, not sampled.
 *
 * The app ships no audio files (and no licence to bundle any), so the three
 * beds are synthesised on the fly with the Web Audio API: a driving loop while
 * a question is live, a brighter bouncy loop for the scoreboard interlude, and
 * a one-shot fanfare at the finish. It's chiptune-flavoured by nature, but it's
 * self-contained, a few KB of code, and works offline.
 *
 * Only the HOST screen ever calls this — a projector, one speaker. Players stay
 * silent so a room of phones doesn't turn into an out-of-sync racket.
 *
 * Scheduling follows the standard Web Audio pattern: a coarse setInterval looks
 * a little way ahead and queues notes on the audio clock, which is sample-accurate.
 */

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type Bed = 'lobby' | 'quiz' | 'party' | 'end' | 'stop';

// Chord voicings [bass, ...tones] as MIDI notes.
const QUIZ = [
  [45, 57, 60, 64], // Am
  [43, 55, 59, 62], // G
];
const PARTY = [
  [48, 60, 64, 67], // C
  [43, 55, 59, 62], // G
  [45, 57, 60, 64], // Am
  [41, 53, 57, 60], // F
];
const LOBBY = [60, 64, 67, 71]; // Cmaj7 shimmer

export class LiveMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bed: Bed = 'stop';
  private muted = false;

  /** Create/resume the audio graph. Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.buildNoise();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.startScheduler();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, t, 0.05);
    }
  }

  /** Map a game status to a bed; fires the fanfare once on entering 'ended'. */
  setPhase(status: string | null) {
    const bed: Bed =
      status === 'question' || status === 'reveal'
        ? 'quiz'
        : status === 'scoreboard'
          ? 'party'
          : status === 'lobby'
            ? 'lobby'
            : status === 'ended'
              ? 'end'
              : 'stop';
    if (bed === this.bed) return;
    this.bed = bed;
    this.step = 0;
    if (bed === 'end') this.fanfare();
  }

  dispose() {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.master = null;
    }
  }

  // -- scheduler ---------------------------------------------------------
  private startScheduler() {
    if (this.timer != null || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  private secondsPerStep() {
    // one step = an eighth note
    const bpm = this.bed === 'party' ? 132 : this.bed === 'lobby' ? 82 : 118;
    return 60 / bpm / 2;
  }

  private tick() {
    if (!this.ctx) return;
    const spb = this.secondsPerStep();
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.schedule(this.step, this.nextTime);
      this.step = (this.step + 1) % 64;
      this.nextTime += spb;
    }
  }

  private schedule(step: number, t: number) {
    if (this.bed === 'quiz') this.quizStep(step, t);
    else if (this.bed === 'party') this.partyStep(step, t);
    else if (this.bed === 'lobby') this.lobbyStep(step, t);
    // 'end' / 'stop' → silence (the fanfare is a one-shot fired in setPhase)
  }

  private quizStep(step: number, t: number) {
    const s = step % 16;
    const chord = QUIZ[s < 8 ? 0 : 1];
    const sb = s % 8;
    if (sb % 4 === 0) this.kick(t);
    this.hat(t, sb % 2 === 1 ? 0.12 : 0.05);
    if (sb === 0 || sb === 4) this.voice(t, chord[0], { type: 'triangle', dur: 0.35, gain: 0.22, cutoff: 900 });
    const tone = chord[1 + (s % 3)];
    this.voice(t, tone, { type: 'square', dur: 0.16, gain: 0.1, cutoff: 2200 });
  }

  private partyStep(step: number, t: number) {
    const s = step % 32;
    const chord = PARTY[Math.floor(s / 8)];
    const sb = s % 8;
    if (sb % 4 === 0) this.kick(t);
    if (sb === 4) this.hat(t, 0.2); // backbeat
    this.hat(t, sb % 2 === 1 ? 0.13 : 0.06);
    if (sb === 0 || sb === 3 || sb === 6) this.voice(t, chord[0], { type: 'triangle', dur: 0.28, gain: 0.2, cutoff: 1100 });
    const tone = chord[1 + (s % 3)] + 12; // sparkle an octave up
    this.voice(t, tone, { type: 'square', dur: 0.14, gain: 0.11, cutoff: 3200 });
  }

  private lobbyStep(step: number, t: number) {
    const s = step % 8;
    if (s % 2 === 0) {
      const note = LOBBY[(step / 2) % LOBBY.length | 0] + 12;
      this.voice(t, note, { type: 'triangle', dur: 0.9, gain: 0.07, cutoff: 1600, attack: 0.04 });
    }
  }

  private fanfare() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.03;
    [60, 64, 67, 72].forEach((m, i) =>
      this.voice(t0 + i * 0.13, m, { type: 'triangle', dur: 0.2, gain: 0.26, cutoff: 3200 }),
    );
    [60, 64, 67, 72].forEach((m) => this.pad(t0 + 0.55, m, 1.9));
    this.kick(t0);
    this.kick(t0 + 0.55);
    this.kick(t0 + 0.82);
  }

  // -- voices ------------------------------------------------------------
  private voice(
    time: number,
    midi: number,
    o: { type: OscillatorType; dur: number; gain: number; cutoff: number; attack?: number },
  ) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.cutoff;
    osc.type = o.type;
    osc.frequency.value = hz(midi);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    const a = o.attack ?? 0.005;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(o.gain, time + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + o.dur);
    osc.start(time);
    osc.stop(time + o.dur + 0.03);
  }

  private pad(time: number, midi: number, dur: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1900;
    osc.type = 'sawtooth';
    osc.frequency.value = hz(midi);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.13, time + 0.15);
    gain.gain.linearRampToValueAtTime(0.0001, time + dur);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private kick(time: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  private hat(time: number, level: number) {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.master);
    src.start(time);
    src.stop(time + 0.06);
  }

  private buildNoise() {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
}

/**
 * React glue: one engine per host screen. Unlocks on the first user gesture
 * (browsers block audio until then) and follows the muted flag. Returns the
 * engine so the caller can drive `setPhase` and `unlock`.
 */
export function useLiveMusic(muted: boolean): LiveMusic {
  const ref = useRef<LiveMusic | null>(null);
  if (ref.current === null) ref.current = new LiveMusic();

  useEffect(() => {
    const engine = ref.current!;
    const unlock = () => engine.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    ref.current?.setMuted(muted);
  }, [muted]);

  return ref.current;
}
