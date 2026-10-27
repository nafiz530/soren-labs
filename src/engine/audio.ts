/**
 * LabSound — the shared, dependency-free sound engine for every Soren lab.
 *
 * All effects are synthesized live with the Web Audio API: zero audio assets,
 * tiny footprint, works offline. The AudioContext is created lazily on the
 * first user gesture (browser autoplay policy) and everything degrades
 * silently when Web Audio is unavailable.
 *
 * Labs call the named events; the engine decides how they sound.
 */

type AudioWindow = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

const now = (ctx: AudioContext) => ctx.currentTime;

class LabSoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambient: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private loop: { src: AudioBufferSourceNode; gain: GainNode; wobble: OscillatorNode; timer: number } | null = null;

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

  // ------------------------------------------------------------ lab events

  /** Tiny UI tick for buttons, tabs and sliders. */
  tick() {
    this.noiseBurst({ filter: 'highpass', freq: 4200, gain: 0.05, decay: 0.012 });
  }

  /** A firmer mechanical click — switches, valves, key presses. */
  click() {
    this.noiseBurst({ filter: 'highpass', freq: 1900, gain: 0.22, decay: 0.018 });
    this.tone({ type: 'square', from: 320, to: 230, gain: 0.1, decay: 0.045 });
  }

  /** A soft thud — an object being placed or landing on the bench. */
  thunk(soft = true) {
    this.tone({ from: soft ? 130 : 95, to: 60, gain: soft ? 0.22 : 0.34, decay: soft ? 0.16 : 0.24, sweepTime: 0.07, type: 'sine' });
    this.noiseBurst({ filter: 'lowpass', freq: 620, gain: 0.1, decay: 0.05 });
  }

  /** A short sliding/whoosh — something being dragged along the bench. */
  slide(strength = 0.6) {
    const s = Math.max(0.1, Math.min(1, strength));
    this.noiseBurst({ filter: 'bandpass', freq: 800 + s * 500, q: 0.7, gain: 0.05 + s * 0.08, attack: 0.03, decay: 0.12 + s * 0.1 });
  }

  /** A metallic ping — tuning forks, meter needles settling, springs. */
  ping(freq = 440, gain = 0.12) {
    this.tone({ type: 'sine', from: freq, gain, decay: 0.5 });
    this.tone({ type: 'sine', from: freq * 2.76, gain: gain * 0.35, decay: 0.3, delay: 0.005 });
  }

  /** Water / liquid landing — drips, drops into a cylinder. */
  drip(fine = false) {
    if (fine) {
      this.tone({ from: 430, to: 860, gain: 0.16, decay: 0.13, sweepTime: 0.06 });
      this.noiseBurst({ filter: 'bandpass', freq: 3600, q: 1.6, gain: 0.05, decay: 0.03 });
    } else {
      this.tone({ from: 230, to: 540, gain: 0.34, decay: 0.19, sweepTime: 0.075 });
      this.noiseBurst({ filter: 'bandpass', freq: 2400, q: 1.2, gain: 0.09, decay: 0.05 });
    }
  }

  /** Liquid rolling around a container while swirling. */
  slosh(strength: number) {
    const s = Math.max(0.15, Math.min(1, strength));
    this.noiseBurst({ filter: 'bandpass', freq: 380 + s * 300, q: 1.1, gain: 0.09 + s * 0.16, attack: 0.05, decay: 0.16 + s * 0.2 });
    this.noiseBurst({ filter: 'bandpass', freq: 300 + s * 240, q: 1.0, gain: 0.06 + s * 0.12, attack: 0.04, decay: 0.14 + s * 0.18, delay: 0.11 });
    this.tone({ from: 150 + s * 90, to: 110, gain: 0.04 + s * 0.05, decay: 0.22, sweepTime: 0.12 });
  }

  /** Soft glass resonance — glassware being handled. */
  glassClink(soft = true) {
    const partials = soft ? [2093, 2637, 3137] : [2093, 2637, 3520, 4186];
    const gains = soft ? [0.07, 0.045, 0.03] : [0.12, 0.08, 0.06, 0.04];
    partials.forEach((freq, i) => {
      this.tone({ type: 'sine', from: freq, gain: gains[i], decay: soft ? 0.1 : 0.16, delay: i * 0.006 });
    });
  }

  /** A creaking flex — string tension, spring stretch, wooden supports. */
  creak(strength = 0.5) {
    const s = Math.max(0.1, Math.min(1, strength));
    this.tone({ type: 'sawtooth', from: 90 + s * 60, to: 140 + s * 90, gain: 0.035 + s * 0.04, decay: 0.14, sweepTime: 0.1 });
    this.noiseBurst({ filter: 'bandpass', freq: 700 + s * 400, q: 3, gain: 0.03 + s * 0.03, decay: 0.1 });
  }

  /** Continuous loop noise — a flowing stream, motor hum, heater coil.
   *  Call startLoop() once and stopLoop() when it ends. */
  startLoop(kind: 'pour' | 'hum' = 'pour') {
    const ctx = this.unlock();
    if (!ctx || !this.noise || !this.master || this.loop) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = kind === 'pour' ? 0.85 : 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'pour' ? 940 : 260;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(this.enabled ? (kind === 'pour' ? 0.11 : 0.07) : 0, now(ctx), 0.09);
    const wobble = ctx.createOscillator();
    const wobbleGain = ctx.createGain();
    wobble.frequency.value = kind === 'pour' ? 5.4 + Math.random() : 1.2;
    wobbleGain.gain.value = kind === 'pour' ? 0.035 : 0.012;
    wobble.connect(wobbleGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    wobble.start();
    const timer = kind === 'pour'
      ? window.setInterval(() => { if (this.enabled) this.drip(true); }, 420 + Math.random() * 260)
      : 0;
    this.loop = { src, gain, wobble, timer };
  }

  stopLoop() {
    const ctx = this.ctx;
    const loop = this.loop;
    if (!ctx || !loop) return;
    this.loop = null;
    if (loop.timer) window.clearInterval(loop.timer);
    loop.gain.gain.cancelScheduledValues(now(ctx));
    loop.gain.gain.setTargetAtTime(0.0001, now(ctx), 0.05);
    window.setTimeout(() => {
      try { loop.src.stop(); } catch { /* already stopped */ }
      loop.src.disconnect();
      loop.wobble.stop();
      loop.wobble.disconnect();
      loop.gain.disconnect();
    }, 220);
  }

  /** Very quiet bench-room tone: air, a distant vent. */
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

  /** A mentor step quietly completing. */
  step() {
    this.tone({ type: 'sine', from: 740, gain: 0.08, decay: 0.16 });
    this.tone({ type: 'sine', from: 988, gain: 0.06, decay: 0.2, delay: 0.09 });
  }

  /** A milestone: warm major arpeggio, satisfying but not loud. */
  milestone() {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, gain: 0.14, decay: 0.55, delay: i * 0.1 });
      this.tone({ type: 'sine', from: f * 2, gain: 0.03, decay: 0.4, delay: i * 0.1 });
    });
  }

  /** A badge unlocking. */
  badge() {
    [659.25, 880, 1174.66].forEach((f, i) => {
      this.tone({ type: 'triangle', from: f, gain: 0.1, decay: 0.3, delay: i * 0.07 });
    });
  }

  /** Warning cue — something went wrong or is about to. */
  warn() {
    this.tone({ type: 'sine', from: 392, to: 220, gain: 0.12, decay: 0.4, sweepTime: 0.25 });
    this.tone({ type: 'sine', from: 392, to: 220, gain: 0.1, decay: 0.35, sweepTime: 0.22, delay: 0.18 });
  }

  /** Reset / rinse — water rushing when the bench is cleared. */
  reset() {
    this.noiseBurst({ filter: 'bandpass', freq: 700, q: 0.6, gain: 0.12, attack: 0.03, decay: 0.5 });
    this.noiseBurst({ filter: 'bandpass', freq: 520, q: 0.6, gain: 0.09, attack: 0.05, decay: 0.4, delay: 0.12 });
    this.glassClink(true);
  }
}

/** Shared singleton — import and call from any event handler. */
export const labSound = new LabSoundEngine();
