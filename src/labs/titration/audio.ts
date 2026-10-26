/**
 * LabSound — a small, dependency-free sound engine for the titration lab.
 *
 * Every effect is synthesized live with the Web Audio API, so the lab ships
 * with zero audio assets and still sounds like a real bench: drips plunking
 * into liquid, the stopcock's mechanical clicks, liquid sloshing when the
 * flask is swirled, glass resonances and a quiet room tone underneath.
 *
 * The AudioContext is created lazily on the first user gesture (browser
 * autoplay policy), and everything degrades silently if Web Audio is absent.
 */

type AudioWindow = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

const now = (ctx: AudioContext) => ctx.currentTime;

export class LabSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private pour: { src: AudioBufferSourceNode; gain: GainNode; wobble: OscillatorNode; bubbles: number } | null = null;
  private ambient: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Master switch + level, mirrored by the UI. */
  enabled = true;
  level = 0.75;

  /** Create / resume the audio graph. Safe to call on every interaction. */
  unlock(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const w = window as unknown as AudioWindow;
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) return null;
      let ctx: AudioContext;
      try {
        ctx = new AC();
      } catch {
        return null;
      }
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? this.level : 0;
      this.master.connect(ctx.destination);
      this.noise = this.buildNoise();
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    this.rampMaster(value ? this.level : 0);
    if (value) this.unlock();
  }

  setLevel(value: number) {
    this.level = Math.max(0, Math.min(1, value));
    this.rampMaster(this.enabled ? this.level : 0);
  }

  private rampMaster(value: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const g = this.master.gain;
    g.cancelScheduledValues(now(ctx));
    g.setTargetAtTime(value, now(ctx), 0.05);
  }

  // ---------------------------------------------------------------- helpers

  private buildNoise(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseBurst(opts: {
    filter: BiquadFilterType;
    freq: number;
    q?: number;
    gain: number;
    attack?: number;
    decay: number;
    delay?: number;
  }) {
    const ctx = this.unlock();
    if (!ctx || !this.noise || !this.master || !this.enabled) return;
    const t = now(ctx) + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filter;
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q ?? 0.9;
    const gain = ctx.createGain();
    const attack = opts.attack ?? 0.004;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + opts.decay);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + opts.decay + 0.05);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private tone(opts: {
    type?: OscillatorType;
    from: number;
    to?: number;
    gain: number;
    decay: number;
    delay?: number;
    sweepTime?: number;
  }) {
    const ctx = this.unlock();
    if (!ctx || !this.master || !this.enabled) return;
    const t = now(ctx) + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(1, opts.from), t);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + (opts.sweepTime ?? 0.08));
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + opts.decay + 0.05);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  // ------------------------------------------------------------------ banks

  /**
   * A drop of titrant landing in the flask. Near the endpoint the drops are
   * smaller, so they sound lighter and higher — a subtle physical cue.
   */
  drip(fine = false) {
    if (fine) {
      this.tone({ from: 430, to: 860, gain: 0.16, decay: 0.13, sweepTime: 0.06 });
      this.noiseBurst({ filter: 'bandpass', freq: 3600, q: 1.6, gain: 0.05, decay: 0.03 });
    } else {
      this.tone({ from: 230, to: 540, gain: 0.34, decay: 0.19, sweepTime: 0.075 });
      this.noiseBurst({ filter: 'bandpass', freq: 2400, q: 1.2, gain: 0.09, decay: 0.05 });
    }
  }

  /** Bubbles rising through liquid while the stream is flowing. */
  bubble() {
    this.tone({ from: 260 + Math.random() * 120, to: 620 + Math.random() * 260, gain: 0.05, decay: 0.09, sweepTime: 0.05, type: 'triangle' });
  }

  /** The stopcock lever being turned open (true) or released (false). */
  stopcock(open: boolean) {
    const base = open ? 340 : 280;
    this.noiseBurst({ filter: 'highpass', freq: 1900, gain: 0.22, decay: 0.018 });
    this.tone({ type: 'square', from: base, to: base * 0.72, gain: 0.1, decay: 0.045 });
    this.noiseBurst({ filter: 'highpass', freq: 2400, gain: 0.15, decay: 0.014, delay: 0.045 });
    this.tone({ type: 'square', from: base * 0.8, to: base * 0.6, gain: 0.07, decay: 0.035, delay: 0.045 });
  }

  /** Liquid rolling around the glass while you swirl the flask. */
  slosh(strength: number) {
    const s = Math.max(0.15, Math.min(1, strength));
    this.noiseBurst({ filter: 'bandpass', freq: 380 + s * 300, q: 1.1, gain: 0.09 + s * 0.16, attack: 0.05, decay: 0.16 + s * 0.2 });
    this.noiseBurst({ filter: 'bandpass', freq: 300 + s * 240, q: 1.0, gain: 0.06 + s * 0.12, attack: 0.04, decay: 0.14 + s * 0.18, delay: 0.11 });
    this.tone({ from: 150 + s * 90, to: 110, gain: 0.04 + s * 0.05, decay: 0.22, sweepTime: 0.12 });
  }

  /** Soft glass resonance, e.g. when the flask is set down after swirling. */
  glassClink(soft = true) {
    const partials = soft ? [2093, 2637, 3137] : [2093, 2637, 3520, 4186];
    const gains = soft ? [0.07, 0.045, 0.03] : [0.12, 0.08, 0.06, 0.04];
    partials.forEach((freq, i) => {
      this.tone({ type: 'sine', from: freq, gain: gains[i], decay: soft ? 0.1 : 0.16, delay: i * 0.006 });
    });
  }

  /** Start the continuous stream noise while the stopcock is held open. */
  startPour() {
    const ctx = this.unlock();
    if (!ctx || !this.noise || !this.master || this.pour) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.85;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 940;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(this.enabled ? 0.11 : 0, now(ctx), 0.09);
    // A slow LFO makes the stream feel alive instead of like static hiss.
    const wobble = ctx.createOscillator();
    const wobbleGain = ctx.createGain();
    wobble.frequency.value = 5.4 + Math.random();
    wobbleGain.gain.value = 0.035;
    wobble.connect(wobbleGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    wobble.start();
    const bubbles = window.setInterval(() => { if (this.enabled) this.bubble(); }, 130 + Math.random() * 90);
    this.pour = { src, gain, wobble, bubbles };
  }

  stopPour() {
    const ctx = this.ctx;
    const pour = this.pour;
    if (!ctx || !pour) return;
    this.pour = null;
    window.clearInterval(pour.bubbles);
    pour.gain.gain.cancelScheduledValues(now(ctx));
    pour.gain.gain.setTargetAtTime(0.0001, now(ctx), 0.05);
    window.setTimeout(() => {
      try { pour.src.stop(); } catch { /* already stopped */ }
      pour.src.disconnect();
      pour.wobble.stop();
      pour.wobble.disconnect();
      pour.gain.disconnect();
    }, 220);
  }

  /** Very quiet bench-room tone: air, a distant vent, glassware ambience. */
  private startAmbient() {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master || this.ambient) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.018, now(ctx), 1.2);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.ambient = { src, gain };
  }

  // ------------------------------------------------------------------ UI

  /** Tiny UI tick for buttons and tabs. */
  tick() {
    this.noiseBurst({ filter: 'highpass', freq: 4200, gain: 0.05, decay: 0.012 });
  }

  /** A mentor step quietly completing. */
  step() {
    this.tone({ type: 'sine', from: 740, gain: 0.08, decay: 0.16 });
    this.tone({ type: 'sine', from: 988, gain: 0.06, decay: 0.2, delay: 0.09 });
  }

  /** The endpoint: a permanent faint pink. Warm, satisfying, not loud. */
  endpoint() {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, gain: 0.14, decay: 0.55, delay: i * 0.1 });
      this.tone({ type: 'sine', from: f * 2, gain: 0.03, decay: 0.4, delay: i * 0.1 });
    });
    this.glassClink(false);
  }

  /** A badge unlocking. */
  badge() {
    [659.25, 880, 1174.66].forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, gain: 0.1, decay: 0.3, delay: i * 0.07 });
    });
  }

  /** Warning cue when the endpoint is overshot. */
  warn() {
    this.tone({ type: 'sine', from: 392, to: 220, gain: 0.12, decay: 0.4, sweepTime: 0.25 });
    this.tone({ type: 'sine', from: 392, to: 220, gain: 0.1, decay: 0.35, sweepTime: 0.22, delay: 0.18 });
  }

  /** Water rushing when the experiment is reset (flask emptied and refilled). */
  reset() {
    this.noiseBurst({ filter: 'bandpass', freq: 700, q: 0.6, gain: 0.12, attack: 0.03, decay: 0.5 });
    this.noiseBurst({ filter: 'bandpass', freq: 520, q: 0.6, gain: 0.09, attack: 0.05, decay: 0.4, delay: 0.12 });
    this.glassClink(true);
  }
}

/** Shared singleton — import and call from any event handler. */
export const labSound = new LabSound();
