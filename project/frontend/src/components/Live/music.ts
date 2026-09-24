import { useEffect, useRef } from 'react';

/*
 * Live-quiz music — generated, not sampled.
 *
 * The app ships no audio files (and no licence to bundle any), so the three
 * beds are synthesised on the fly with the Web Audio API: a cinematic challenge
 * cue while a question is live, outcome beds for missed and unanswered reveals,
 * a brighter bouncy loop for the scoreboard interlude, and a one-shot fanfare at
 * the finish. It's self-contained, a few KB of code, and works offline.
 *
 * Each live-game screen can opt into this. Audio is local to the device, so
 * hosts and players each have their own mute preference.
 *
 * Scheduling follows the standard Web Audio pattern: a coarse setInterval looks
 * a little way ahead and queues notes on the audio clock, which is sample-accurate.
 */

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type Bed = 'lobby' | 'quiz' | 'challenge' | 'miss' | 'timeout' | 'party' | 'end' | 'stop';

// Chord voicings [bass, ...tones] as MIDI notes.
const QUIZ = [
  [45, 57, 60, 64], // Am
  [43, 55, 59, 62], // G
];
// Player challenge progression: the diminished E chord gives it a brief,
// otherworldly shadow before the A-major dominant resolves the phrase.
const CHALLENGE = [
  [38, 50, 53, 57], // Dm
  [34, 46, 50, 53], // Bb
  [40, 52, 55, 58], // Edim — gloomy, alien colour
  [33, 45, 49, 52], // A (major dominant)
];
const QUIZ_LEAD = [74, 77, 81, 77, 74, 77, 82, 77, 76, 79, 84, 79, 76, 79, 85, 81];
const GHOST = [69, 70, 67, 73]; // uneasy chromatic wails over the challenge chords
const PARTY = [
  [48, 60, 64, 67], // C
  [43, 55, 59, 62], // G
  [45, 57, 60, 64], // Am
  [41, 53, 57, 60], // F
];
const MISS = [45, 48, 52]; // Am, subdued
const TIMEOUT = [
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

  /** Map game state to a bed. Hosts keep the classic cue; players get outcomes. */
  setPhase(
    status: string | null,
    result?: { answered: boolean; is_correct: boolean },
    audience: 'host' | 'player' = 'host',
  ) {
    let bed: Bed = 'stop';
    if (status === 'question') bed = audience === 'player' ? 'challenge' : 'quiz';
    else if (status === 'reveal') {
      if (audience === 'player' && result && !result.answered) bed = 'timeout';
      else if (audience === 'player' && result && !result.is_correct) bed = 'miss';
      else bed = audience === 'player' ? 'challenge' : 'quiz';
    } else if (status === 'scoreboard') bed = 'party';
    else if (status === 'lobby') bed = 'lobby';
    else if (status === 'ended') bed = 'end';
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
    const bpm =
      this.bed === 'party' ? 132 : this.bed === 'challenge' ? 128 : this.bed === 'lobby' ? 82 : this.bed === 'timeout' ? 108 : this.bed === 'miss' ? 92 : 118;
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
    else if (this.bed === 'challenge') this.challengeStep(step, t);
    else if (this.bed === 'miss') this.missStep(step, t);
    else if (this.bed === 'timeout') this.timeoutStep(step, t);
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
    if (sb === 0 || sb === 4) {
      this.voice(t, chord[0], { type: 'triangle', dur: 0.35, gain: 0.22, cutoff: 900 });
    }
    const tone = chord[1 + (s % 3)];
    this.voice(t, tone, { type: 'square', dur: 0.16, gain: 0.1, cutoff: 2200 });
  }

  private challengeStep(step: number, t: number) {
    const s = step % 32;
    const chord = CHALLENGE[Math.floor(s / 8)];
    const sb = s % 8;
    if (sb === 0 || sb === 3 || sb === 4 || sb === 6) this.kick(t);
    this.hat(t, sb % 2 === 1 ? 0.15 : 0.055);
    if (sb === 0) {
      chord.slice(1).forEach((note) => this.pad(t, note, 0.72));
      this.voice(t, chord[0], { type: 'triangle', dur: 0.5, gain: 0.25, cutoff: 850 });
      this.ghost(t + 0.06, GHOST[Math.floor(s / 8)], 1.35);
    }
    if (sb === 4) this.voice(t, chord[0] + 12, { type: 'triangle', dur: 0.28, gain: 0.18, cutoff: 1200 });

    // Relentless sixteenth-note arpeggio; the lead only enters in the back half
    // of the phrase, so the cue feels like it is building toward the deadline.
    const arpeggio = chord[1 + (s % 3)] + 12;
    this.voice(t, arpeggio, { type: 'square', dur: 0.14, gain: 0.11, cutoff: 2600 });
    if (s >= 16 && sb % 2 === 0) {
      this.voice(t, QUIZ_LEAD[s - 16], { type: 'sawtooth', dur: 0.2, gain: 0.08, cutoff: 3400 });
    }
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

  /** A downcast minor loop for an answer that was submitted but incorrect. */
  private missStep(step: number, t: number) {
    const s = step % 16;
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2) this.hat(t, 0.06);
    if (s === 0) this.ghost(t + 0.05, 57, 1.25);
    if (s === 0 || s === 6 || s === 10) {
      this.voice(t, MISS[(s / 2) % MISS.length | 0], {
        type: 'triangle', dur: 0.42, gain: 0.16, cutoff: 800,
      });
    }
    if (s === 4 || s === 12) {
      this.voice(t, 57, { type: 'sine', dur: 0.38, gain: 0.08, cutoff: 1200 });
    }
  }

  /** A warm, upbeat reset cue for an unanswered reveal—no gloomy penalty mood. */
  private timeoutStep(step: number, t: number) {
    const s = step % 32;
    const chord = TIMEOUT[Math.floor(s / 8)];
    const sb = s % 8;
    if (sb === 0 || sb === 4) this.kick(t);
    this.hat(t, sb % 2 === 1 ? 0.1 : 0.04);
    if (sb === 0) {
      this.voice(t, chord[0], { type: 'triangle', dur: 0.42, gain: 0.18, cutoff: 1050 });
      this.ghost(t + 0.05, chord[2] + 12, 1.2);
    }
    // A simple, buoyant melody says “next one” without making the timeout feel punitive.
    const note = chord[1 + (s % 3)] + (sb === 6 ? 12 : 0);
    this.voice(t, note, { type: 'triangle', dur: 0.24, gain: 0.1, cutoff: 2400, attack: 0.02 });
  }

  /** A detuned, pitch-falling wail that makes the player challenge cue eerie. */
  private ghost(time: number, midi: number, dur: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const end = time + dur;

    osc.type = 'sine';
    osc.detune.value = -9;
    osc.frequency.setValueAtTime(hz(midi + 7), time);
    osc.frequency.exponentialRampToValueAtTime(hz(midi), time + dur * 0.55);
    osc.frequency.exponentialRampToValueAtTime(hz(midi - 5), end);

    filter.type = 'bandpass';
    filter.frequency.value = 1050;
    filter.Q.value = 1.8;
    lfo.type = 'sine';
    lfo.frequency.value = 4.2;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.115, time + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    lfo.start(time);
    osc.start(time);
    lfo.stop(end + 0.03);
    osc.stop(end + 0.03);
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
 * React glue: one engine per live-game screen. Unlocks on the first user gesture
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
