import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { fmtClock, clamp, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './electrolysis-of-water.css';

/**
 * Electrolysis of water — a Hofmann voltameter on a 2D canvas bench.
 *
 * Two inverted graduated tubes stand over platinum electrodes in water
 * acidified with a little dilute sulfuric acid. The student closes a knife
 * switch, watches bubbles stream off both electrodes, and the columns build
 * honestly at a 2 : 1 volume ratio (Faraday's law drives the rate). Readings
 * are banked into a table, plotted as two volume–time series, and each gas is
 * identified with its own flame test: drag the burning splint to the hydrogen
 * outlet (pop + flash) and the glowing splint to the oxygen outlet (relight).
 */

// ---- chemistry / physics constants -----------------------------------------
const R_CELL = 40; // Ω — resistance of the acidified-water cell
const MOLAR_VOL = 22414; // mL/mol — molar volume near room conditions
const FARADAY = 96485; // C/mol
const ML_PER_C_H2 = MOLAR_VOL / (2 * FARADAY); // mL of H₂ per coulomb (2 e⁻)
const TUBE_CAP = 24; // mL — full-scale of each graduated tube
const AM_FS = 0.5; // A — ammeter full scale
const H2_MIN_TEST = 1.0; // mL of H₂ before a pop test is fair
const O2_MIN_TEST = 0.5; // mL of O₂ before a relight test is fair
const RECORD_MIN_H = 2.0; // mL before the record button unlocks
const RECORD_MIN_O = 1.0;
const SPLINT_LEN = 46; // px
const VOLT_OPTIONS = [6, 9, 12];

/** H₂ collection rate (mL/s) — straight from Faraday's law at I = V / R. */
const rateH2 = (volts: number) => (volts / R_CELL) * ML_PER_C_H2;
const currentA = (volts: number) => volts / R_CELL;

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'inspect', title: 'Inspect the apparatus', detail: 'A Hofmann voltameter: two inverted graduated tubes over platinum electrodes in water acidified with a little dilute sulfuric acid. Hydrogen will collect on the left (cathode, negative), oxygen on the right (anode, positive).', hint: 'Find the battery pack, ammeter and brass knife switch on the bench below the tank.' },
  { id: 'switch', title: 'Close the switch', detail: 'Click the brass knife switch on the bench — or press the button here — to drive current through the electrolyte.', hint: 'Bubbles stream off both platinum electrodes the moment the circuit closes.' },
  { id: 'columns', title: 'Watch the gas columns build', detail: 'Bubbles rise into each tube and push the water level down. The left column climbs twice as fast as the right — watch it happen.', hint: 'Gas gathers slowly at real time — use the Speed selector in the toolbar if the wait feels long.' },
  { id: 'record', title: 'Record a volume pair', detail: 'Once both columns are measurable (at least 2 mL of hydrogen), record the time, both volumes and the computed ratio in your table.', hint: 'The ratio column is where the chemistry shows itself.' },
  { id: 'test-h2', title: 'Test the hydrogen', detail: 'Drag the burning splint from its stand to the LEFT tube outlet and let go. A loud pop with a bright flash confirms hydrogen.', hint: 'On touch screens, drag with a finger — or use the flame-test button below the scene.' },
  { id: 'test-o2', title: 'Test the oxygen', detail: 'Drag the glowing splint to the RIGHT tube outlet. If its ember bursts back into flame, the gas is oxygen.', hint: 'A glowing splint relights only where oxygen is.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-bubbles', title: 'First bubbles', icon: '◌', detail: 'Streamed bubbles off both electrodes with your own switch flip.' },
  { id: 'ratio-keeper', title: 'Ratio keeper', icon: '≈', detail: 'Recorded a volume ratio within 5% of the famous 2 : 1.' },
  { id: 'gas-tester', title: 'Gas tester', icon: '✓', detail: 'Popped the hydrogen and relit the oxygen — both flame tests done.' },
  { id: 'voltage-explorer', title: 'Second wind', icon: '⇄', detail: 'Collected and recorded gas at a second battery voltage.' },
  { id: 'full-tubes', title: 'Full tubes', icon: '▦', detail: 'Filled the hydrogen column past 18 mL in one session.' },
];

// ---- types -------------------------------------------------------------------
interface TrialRow { id: number; t: number; vH: number; vO: number; ratio: number; volts: number }
interface UiSnap { t: number; vH: number; vO: number; running: boolean; current: number }
interface Bubble { x: number; y: number; r: number; vy: number; ph: number }
interface PopRing { x: number; y: number; t: number }
type SplintId = 'burning' | 'glowing';
type TubeId = 'left' | 'right';
type SplintMode = 'rest' | 'drag' | 'hold' | 'back';
interface SplintState { x: number; y: number; mode: SplintMode; fx: number; fy: number; retT: number }
type EffectKind = 'pop' | 'relight' | 'flare' | 'calm';
interface GasEffect { kind: EffectKind; tube: TubeId; splint: SplintId; t: number }

const EFFECT_DUR: Record<EffectKind, number> = { pop: 0.55, relight: 1.5, flare: 0.7, calm: 0.45 };

interface SimState {
  t: number; vH: number; vO: number; running: boolean;
  acc: number; uiAcc: number; spawnH: number; spawnO: number; pingAcc: number;
  needle: number; switchAnim: number; flow: number;
  bubblesH: Bubble[]; bubblesO: Bubble[]; pops: PopRing[];
  effect: GasEffect | null;
  drag: SplintId | null; dragMoved: number; dragNoted: boolean;
  splints: Record<SplintId, SplintState>;
  nearOutlet: TubeId | null;
  lastSlide: number;
  firstBubbleDone: boolean; fullTubeDone: boolean;
  /** Peak hydrogen volume this run — keeps the "columns built" mentor step
   *  sticky even after a flame test vents part of the column. */
  vHPeak: number;
}

interface Geom {
  cw: number; ch: number; floorY: number; cx: number;
  troughL: number; troughR: number; troughT: number; troughB: number; waterY: number;
  lx: number; tubeW: number; gap: number; span: number; tubeTop: number; tubeB: number;
  cathX: number; anodeX: number;
  outL: { x: number; y: number }; outR: { x: number; y: number };
  railY: number; batCx: number; packT: number; packB: number; cells: number; pitch: number;
  amX: number; amR: number; swCx: number;
  stationL: { x: number; y: number }; stationR: { x: number; y: number };
}

const meta = getLabBySlug('electrolysis-of-water')!;

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/** Gas–water interface height inside a tube (px) for a collected volume v. */
function interfaceY(g: Geom, v: number) {
  const innerTop = g.tubeTop + g.tubeW / 2 + 3;
  return innerTop + (clamp(v, 0, TUBE_CAP) / TUBE_CAP) * (g.tubeB - innerTop);
}

/** Where a splint sits while it is held at a tube outlet (tip on the nozzle). */
function holdCenter(tube: TubeId, g: Geom) {
  const out = tube === 'left' ? g.outL : g.outR;
  const a = tube === 'left' ? -0.5 : Math.PI + 0.5;
  return { x: out.x - Math.cos(a) * (SPLINT_LEN / 2), y: out.y - Math.sin(a) * (SPLINT_LEN / 2) };
}

export default function ElectrolysisLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef<SimState>({
    t: 0, vH: 0, vO: 0, running: false,
    acc: 0, uiAcc: 0, spawnH: 0, spawnO: 0, pingAcc: 0.8,
    needle: 0, switchAnim: 0, flow: 0,
    bubblesH: [], bubblesO: [], pops: [],
    effect: null,
    drag: null, dragMoved: 0, dragNoted: false,
    splints: {
      burning: { x: 0, y: 0, mode: 'rest', fx: 0, fy: 0, retT: 0 },
      glowing: { x: 0, y: 0, mode: 'rest', fx: 0, fy: 0, retT: 0 },
    },
    nearOutlet: null,
    lastSlide: 0,
    firstBubbleDone: false, fullTubeDone: false,
    vHPeak: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls -----------------------------------------------------
  const [volts, setVolts] = useState(6);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [tested, setTested] = useState({ h2: false, o2: false });
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ t: 0, vH: 0, vO: 0, running: false, current: 0 });

  const earn = useCallback((id: string) => {
    setBadges((cur) => {
      if (cur.includes(id)) return cur;
      const b = BADGES.find((x) => x.id === id);
      if (b) setToast({ tone: 'good', icon: b.icon, msg: `Badge earned — ${b.title}` });
      labSound.badge();
      return [...cur, id];
    });
  }, []);

  const pushToast = useCallback((tone: 'good' | 'warn' | 'info', icon: string, msg: string) => {
    setToast({ tone, icon, msg });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    setUi({ t: s.t, vH: s.vH, vO: s.vO, running: s.running, current: s.needle * AM_FS });
  }, []);

  // ---- mentor completion flags ----------------------------------------------
  const done = [
    mentorAcked,
    hasRun,
    sim.current.vHPeak >= 4,
    rows.length >= 1,
    tested.h2,
    tested.o2,
  ];

  useEffect(() => {
    const next = done.findIndex((d, i) => !d && i <= mentorIndex);
    if (next > mentorIndex) {
      setMentorIndex(next);
      labSound.step();
    } else if (done[done.length - 1] && mentorIndex < MENTOR_STEPS.length - 1) {
      setMentorIndex(MENTOR_STEPS.length - 1);
    }
  }, [done, mentorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'switch': return { target: 'switch', gesture: 'press', title: 'Close the circuit', body: 'Press the big switch button — or click the brass knife switch on the bench. Current only flows while it is closed.' };
      case 'columns': return { target: 'scene', gesture: 'point', title: 'Watch the columns', body: 'Bubbles rise into both tubes; the left one climbs twice as fast. The Speed selector in the toolbar hurries the clock.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the pair', body: 'Press Record to bank the time, both volumes and the computed ratio into your observations table.' };
      case 'test-h2': return { target: 'scene', gesture: 'drag', title: 'Pop-test the hydrogen', body: 'Drag the burning splint to the LEFT tube’s outlet and let go. Expect a flash and a bang.' };
      case 'test-o2': return { target: 'scene', gesture: 'drag', title: 'Relight-test the oxygen', body: 'Drag the glowing splint to the RIGHT tube’s outlet. Oxygen makes a dying ember burst back into flame.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ----------------------------------------------------------------
  const geom = useCallback((): Geom => {
    const canvas = canvasRef.current;
    const cw = canvas?.clientWidth ?? 800;
    const ch = canvas?.clientHeight ?? 500;
    const floorY = ch - 22;
    const cx = cw / 2;
    const troughW = clamp(cw * 0.44, 150, 330);
    const troughL = cx - troughW / 2;
    const troughR = cx + troughW / 2;
    const troughH = clamp(ch * 0.3, 96, 160);
    const troughB = ch - 64;
    const troughT = troughB - troughH;
    const waterY = troughT + Math.max(10, troughH * 0.09);
    const tubeW = clamp(troughW * 0.185, 44, 60);
    const gap = tubeW * 0.62;
    const span = tubeW * 2 + gap;
    const lx = cx - span / 2;
    const tubeTop = clamp(ch * 0.16, 52, 92);
    const tubeB = troughB - 14;
    const cathX = lx + tubeW / 2;
    const anodeX = lx + tubeW * 1.5 + gap;
    const outL = { x: lx - 14, y: tubeTop + tubeW * 0.35 };
    const outR = { x: lx + span + 14, y: tubeTop + tubeW * 0.35 };
    const railY = ch - 42;
    const batCx = Math.max(56, cw * 0.075);
    const cells = Math.round(volts / 1.5);
    const pitch = cells > 6 ? 10 : 12;
    const packB = ch - 26;
    const packT = packB - cells * pitch;
    const amX = clamp(cathX - 48, batCx + 38, cathX - 36);
    const amR = 17;
    const swCx = Math.min(cw - 62, Math.max(anodeX + 92, cw * 0.84));
    const stationL = { x: Math.max(40, cw * 0.12), y: ch * 0.42 };
    const stationR = { x: cw - Math.max(40, cw * 0.12), y: ch * 0.42 };
    return {
      cw, ch, floorY, cx, troughL, troughR, troughT, troughB, waterY,
      lx, tubeW, gap, span, tubeTop, tubeB, cathX, anodeX, outL, outR,
      railY, batCx, packT, packB, cells, pitch, amX, amR, swCx, stationL, stationR,
    };
  }, [volts]);

  // ---- switch --------------------------------------------------------------------
  const toggleSwitch = useCallback(() => {
    const s = sim.current;
    // a full tube can never resume collecting — the bench refuses to close
    if (!s.running && (s.vH >= TUBE_CAP - 0.01 || s.vO >= TUBE_CAP - 0.01)) {
      labSound.warn();
      pushToast('warn', '▦', 'A collecting tube is full — the switch stays open. Record your reading, run the flame tests, or reset the bench for a fresh run.');
      notePointer(false);
      syncUi();
      return;
    }
    s.running = !s.running;
    setRunning(s.running);
    labSound.click();
    if (s.running) {
      setHasRun(true);
      labSound.startLoop('pour');
    } else {
      labSound.stopLoop();
    }
    notePointer(true);
    syncUi();
  }, [notePointer, pushToast, syncUi]);

  // ---- splint helpers ---------------------------------------------------------------
  const sendHome = useCallback((id: SplintId) => {
    const sp = sim.current.splints[id];
    sp.fx = sp.x;
    sp.fy = sp.y;
    sp.mode = 'back';
    sp.retT = 0;
  }, []);

  // ---- gas tests (the real gesture payoff) ---------------------------------------------
  const gasTest = useCallback((splint: SplintId, tube: TubeId) => {
    const s = sim.current;
    if (s.effect) { sendHome(splint); return; }
    const sp = s.splints[splint];
    const isH2Tube = tube === 'left';
    const enough = isH2Tube ? s.vH >= H2_MIN_TEST : s.vO >= O2_MIN_TEST;
    sp.mode = 'hold';
    if (!enough) {
      s.effect = { kind: 'calm', tube, splint, t: 0 };
      labSound.warn();
      pushToast('warn', '⚠', isH2Tube
        ? 'The hydrogen column is still too thin — let a little more gas collect before the flame test.'
        : 'The oxygen column is still too thin — let a little more collect before the splint test.');
      notePointer(true);
      return;
    }
    if (isH2Tube && splint === 'burning') {
      s.effect = { kind: 'pop', tube, splint, t: 0 };
      s.vH = Math.max(0, s.vH - 0.6);
      // composed pop: percussive thump + sharp transient + the tube ringing
      labSound.thunk(false);
      labSound.click();
      labSound.glassClink(false);
      setTested((cur) => (cur.h2 ? cur : { ...cur, h2: true }));
      pushToast('good', '✷', 'Pop! The burning splint ignited the hydrogen — 2H₂ + O₂ → 2H₂O. Bright flash and a bang: hydrogen confirmed.');
    } else if (isH2Tube && splint === 'glowing') {
      s.effect = { kind: 'calm', tube, splint, t: 0 };
      pushToast('info', '✦', 'The glowing tip simply fades in hydrogen — no relight. Bring the burning splint here instead.');
    } else if (!isH2Tube && splint === 'glowing') {
      s.effect = { kind: 'relight', tube, splint, t: 0 };
      s.vO = Math.max(0, s.vO - 0.3);
      labSound.slide(0.9);
      labSound.tick();
      setTested((cur) => (cur.o2 ? cur : { ...cur, o2: true }));
      pushToast('good', '⟳', 'The glowing splint burst back into flame — oxygen feeds combustion, so embers wake up in it. Oxygen confirmed.');
    } else {
      s.effect = { kind: 'flare', tube, splint, t: 0 };
      pushToast('info', '↯', 'The flame flares brighter in oxygen — a useful hint, but the classic proof is the glowing splint. Bring that one here.');
    }
    notePointer(true);
    syncUi();
  }, [notePointer, pushToast, sendHome, syncUi]);

  // ---- physics ------------------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    // knife-switch lever + ammeter needle (real time, damped)
    const target = s.running ? 1 : 0;
    s.switchAnim += (target - s.switchAnim) * Math.min(1, dt * 7);
    const iTarget = s.running ? currentA(volts) / AM_FS : 0;
    s.needle += (iTarget - s.needle) * Math.min(1, dt * 3.2);

    // splints flying home
    const g = geom();
    for (const id of ['burning', 'glowing'] as SplintId[]) {
      const sp = s.splints[id];
      if (sp.mode === 'back') {
        sp.retT += dt / 0.35;
        const home = id === 'burning' ? g.stationL : g.stationR;
        const k = easeOut(Math.min(1, sp.retT));
        sp.x = sp.fx + (home.x - sp.fx) * k;
        sp.y = sp.fy + (home.y - sp.fy) * k;
        if (sp.retT >= 1) sp.mode = 'rest';
      }
    }

    // flame-test effect timing
    if (s.effect) {
      s.effect.t += dt;
      if (s.effect.t >= EFFECT_DUR[s.effect.kind]) {
        const sp = s.splints[s.effect.splint];
        const hc = holdCenter(s.effect.tube, g);
        sp.fx = hc.x;
        sp.fy = hc.y;
        sp.mode = 'back';
        sp.retT = 0;
        s.effect = null;
      }
    }

    const dts = dt * speed;

    // electrolysis — simulated time, fixed sub-steps, honest 2 : 1 with ≤1% jitter
    if (s.running) {
      const rH = rateH2(volts);
      const rO = rH / 2;
      s.acc += dts;
      const h = 1 / 120;
      while (s.acc >= h) {
        s.acc -= h;
        s.t += h;
        s.vO = Math.min(TUBE_CAP, s.vO + rO * h * (1 + 0.008 * Math.sin(s.t * 0.23 + 2.1)));
        s.vH = Math.min(TUBE_CAP, s.vH + rH * h * (1 + 0.008 * Math.sin(s.t * 0.31)));
      }
      if (s.vH > s.vHPeak) s.vHPeak = s.vH;
      if (!s.firstBubbleDone && s.vH > 0.25) {
        s.firstBubbleDone = true;
        earn('first-bubbles');
        pushToast('info', '◌', 'Bubble streams on both electrodes — twice as thick at the cathode. Water is being split.');
      }
      if (!s.fullTubeDone && s.vH >= 18) {
        s.fullTubeDone = true;
        earn('full-tubes');
      }
      s.flow += dt * (60 + currentA(volts) * 160);

      // spawn bubbles (rate follows the current; cathode twice the anode)
      s.spawnH += dts * (2.5 + currentA(volts) * 26);
      s.spawnO += dts * (1.25 + currentA(volts) * 13);
      const rSpawn = 1.6 + Math.random() * 2.2;
      while (s.spawnH >= 1) {
        s.spawnH -= 1;
        if (s.bubblesH.length < 70) s.bubblesH.push({
          x: g.cathX + (Math.random() - 0.5) * (g.tubeW - 16),
          y: g.tubeB - 10 + Math.random() * 6,
          r: rSpawn, vy: 60 + rSpawn * 18, ph: Math.random() * 6.28,
        });
      }
      while (s.spawnO >= 1) {
        s.spawnO -= 1;
        if (s.bubblesO.length < 70) s.bubblesO.push({
          x: g.anodeX + (Math.random() - 0.5) * (g.tubeW - 16),
          y: g.tubeB - 10 + Math.random() * 6,
          r: rSpawn * 0.9, vy: 60 + rSpawn * 16, ph: Math.random() * 6.28,
        });
      }

      // throttled bubble pings on top of the loop ambience
      s.pingAcc -= dt;
      if (s.pingAcc <= 0) {
        s.pingAcc = 0.75 + Math.random() * 0.7;
        labSound.ping(1350 + Math.random() * 850, 0.02 + Math.random() * 0.02);
      }

      // tube-full guard: the bench opens the switch itself the moment a tube
      // fills, so a capped hydrogen column can never quietly spoil the 2 : 1
      // contract by letting the oxygen keep climbing
      if (s.vH >= TUBE_CAP - 0.01 || s.vO >= TUBE_CAP - 0.01) {
        s.running = false;
        setRunning(false);
        labSound.stopLoop();
        labSound.click();
        labSound.warn();
        pushToast('warn', '▦', s.vH >= TUBE_CAP - 0.01
          ? 'The hydrogen tube is full — the bench opened the switch by itself. Record the pair, then run the flame tests.'
          : 'The oxygen tube is full — the bench opened the switch by itself. Record the pair, then run the flame tests.');
        syncUi();
      }
    }

    // bubble motion + pop at the gas–water interface
    const iH = interfaceY(g, s.vH);
    const iO = interfaceY(g, s.vO);
    const moveBubbles = (arr: Bubble[], iy: number, x0: number, x1: number) => {
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        const b = arr[i];
        b.y -= b.vy * dts;
        b.ph += dts * 3.5;
        b.x = clamp(b.x + Math.sin(b.ph) * 12 * dts, x0, x1);
        if (b.y - b.r <= iy) {
          if (s.pops.length < 40) s.pops.push({ x: b.x, y: iy, t: 0 });
          arr.splice(i, 1);
        }
      }
    };
    moveBubbles(s.bubblesH, iH, g.lx + 5, g.lx + g.tubeW - 5);
    moveBubbles(s.bubblesO, iO, g.lx + g.tubeW + g.gap + 5, g.lx + g.span - 5);

    for (const p of s.pops) p.t += dt;
    s.pops = s.pops.filter((p) => p.t < 0.22);

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, volts, geom, earn, pushToast, syncUi]);

  // ---- drawing ------------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const tSec = performance.now() / 1000;

    // background + floor
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, g.floorY);
    ctx.lineTo(w, g.floorY);
    ctx.stroke();
    ctx.strokeStyle = '#dde4ea';
    ctx.lineWidth = 1;
    for (let x = 8; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, g.floorY);
      ctx.lineTo(x - 10, g.floorY + 10);
      ctx.stroke();
    }

    drawTrough(ctx, g, tSec);

    // tubes (glass, gas tint, water, graduations, outlets, electrodes)
    drawTube(ctx, g, 'left', s.vH, tSec, s.running);
    drawTube(ctx, g, 'right', s.vO, tSec, s.running);

    // bubbles + interface pop rings
    drawBubbles(ctx, s.bubblesH);
    drawBubbles(ctx, s.bubblesO);
    for (const p of s.pops) {
      const a = 1 - p.t / 0.22;
      ctx.strokeStyle = `rgba(160,196,222,${a * 0.8})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + p.t * 46, 0, Math.PI * 2);
      ctx.stroke();
    }

    // circuit: wires + current dashes + battery + ammeter + knife switch
    drawWires(ctx, g, s.running, s.flow);
    drawBattery(ctx, g);
    drawAmmeter(ctx, g, s.needle);
    drawSwitch(ctx, g, s.switchAnim);

    // splint stations + splints
    drawStand(ctx, g.stationL);
    drawStand(ctx, g.stationR);
    for (const id of ['burning', 'glowing'] as SplintId[]) {
      const sp = s.splints[id];
      const home = id === 'burning' ? g.stationL : g.stationR;
      const homeAngle = id === 'burning' ? -0.5 : Math.PI + 0.5;
      let cx = home.x;
      let cy = home.y;
      let angle = homeAngle;
      let flame = id === 'burning' ? 1 : 0;
      let ember = 1;
      if (sp.mode === 'drag') {
        cx = sp.x;
        cy = sp.y;
      } else if (sp.mode === 'hold' && s.effect && s.effect.splint === id) {
        const hc = holdCenter(s.effect.tube, g);
        cx = hc.x;
        cy = hc.y;
        angle = s.effect.tube === 'left' ? -0.5 : Math.PI + 0.5;
        if (id === 'burning') flame = s.effect.kind === 'flare' ? 1.55 : 1;
        else if (s.effect.kind === 'relight') flame = Math.min(1, s.effect.t / 0.25);
        // a glowing splint held over hydrogen simply dies — show the fade
        if (id === 'glowing' && s.effect.kind === 'calm' && s.effect.tube === 'left') {
          ember = Math.max(0, 1 - s.effect.t / EFFECT_DUR.calm);
        }
      } else if (sp.mode === 'back') {
        cx = sp.x;
        cy = sp.y;
      } else {
        sp.x = cx;
        sp.y = cy;
      }
      drawSplint(ctx, cx, cy, angle, id, flame, tSec, ember);
    }

    // drop-target highlight while dragging
    if (s.nearOutlet) {
      const out = s.nearOutlet === 'left' ? g.outL : g.outR;
      const pulse = 0.55 + 0.25 * Math.sin(tSec * 6);
      ctx.strokeStyle = `rgba(249,115,22,${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(out.x, out.y, 13 + 2.5 * Math.sin(tSec * 6), 0, Math.PI * 2);
      ctx.stroke();
    }

    // flame-test effects
    if (s.effect) drawEffect(ctx, s.effect, g, w, h, tSec);
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------------
  const splintAt = (px: number, py: number, g: Geom): SplintId | null => {
    const s = sim.current;
    for (const id of ['burning', 'glowing'] as SplintId[]) {
      const sp = s.splints[id];
      if (sp.mode === 'drag' || sp.mode === 'hold') continue;
      const home = id === 'burning' ? g.stationL : g.stationR;
      const cx = sp.mode === 'back' ? sp.x : home.x;
      const cy = sp.mode === 'back' ? sp.y : home.y;
      if (Math.hypot(px - cx, py - cy) < 28) return id;
    }
    return null;
  };

  const nearestOutlet = (px: number, py: number, g: Geom): TubeId | null => {
    if (Math.hypot(px - g.outL.x, py - g.outL.y) < 38) return 'left';
    if (Math.hypot(px - g.outR.x, py - g.outR.y) < 38) return 'right';
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    // the knife switch is a click target on the bench
    if (Math.hypot(px - g.swCx, py - (g.railY - 10)) < 36) {
      toggleSwitch();
      return;
    }
    const id = splintAt(px, py, g);
    if (id) {
      const s = sim.current;
      const sp = s.splints[id];
      sp.mode = 'drag';
      sp.x = px;
      sp.y = py;
      s.drag = id;
      s.dragMoved = 0;
      s.dragNoted = false;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.3);
      notePointer(true);
      canvas.style.cursor = 'grabbing';
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;
    const g = geom();
    if (s.drag) {
      const sp = s.splints[s.drag];
      s.dragMoved += Math.hypot(px - sp.x, py - sp.y);
      sp.x = px;
      sp.y = py;
      if (s.dragMoved > 14 && !s.dragNoted) {
        s.dragNoted = true;
        notePointer(true);
      }
      const nowT = performance.now();
      if (nowT - s.lastSlide > 130) {
        s.lastSlide = nowT;
        labSound.slide(0.22);
      }
      s.nearOutlet = nearestOutlet(px, py, g);
      canvas.style.cursor = 'grabbing';
      return;
    }
    const overSwitch = Math.hypot(px - g.swCx, py - (g.railY - 10)) < 36;
    const overSplint = splintAt(px, py, g) !== null;
    canvas.style.cursor = overSwitch ? 'pointer' : overSplint ? 'grab' : 'default';
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const s = sim.current;
    if (!s.drag) return;
    const id = s.drag;
    s.drag = null;
    s.nearOutlet = null;
    try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const sp = s.splints[id];
    const tube = nearestOutlet(sp.x, sp.y, geom());
    if (tube) gasTest(id, tube);
    else sendHome(id);
    if (canvas) canvas.style.cursor = 'default';
  };

  // ---- controls ---------------------------------------------------------------------
  const changeVoltage = (v: number) => {
    if (v === volts) return;
    setVolts(v);
    labSound.tick();
    notePointer(true);
  };

  const recordReading = () => {
    const s = sim.current;
    if (s.vH < RECORD_MIN_H || s.vO < RECORD_MIN_O) return;
    const vH = Math.round(s.vH * 10) / 10;
    const vO = Math.round(s.vO * 10) / 10;
    const row: TrialRow = {
      id: rows.length + 1,
      t: s.t,
      vH,
      vO,
      // the ratio divides one recorded graduation reading by the other —
      // reading resolution and all, exactly like a bench notebook
      ratio: vH / vO,
      volts,
    };
    setRows((cur) => [...cur, row]);
    labSound.click();
    notePointer(true);
    if (Math.abs(row.ratio - 2) / 2 <= 0.05) {
      earn('ratio-keeper');
      labSound.milestone();
      pushToast('good', '≈', `Ratio ${row.ratio.toFixed(2)} : 1 — within 5% of the famous 2 : 1. Avogadro just nodded.`);
    } else {
      pushToast('info', '✎', `Recorded: V(H₂) = ${row.vH.toFixed(1)} mL against V(O₂) = ${row.vO.toFixed(1)} mL — ratio ${row.ratio.toFixed(2)} : 1. Reading resolution bites while the columns are small; let them grow and record again.`);
    }
    if (new Set([...rows.map((r) => r.volts), volts]).size >= 2) earn('voltage-explorer');
  };

  const resetAll = () => {
    const s = sim.current;
    s.t = 0; s.vH = 0; s.vO = 0; s.running = false;
    s.acc = 0; s.uiAcc = 0; s.spawnH = 0; s.spawnO = 0; s.pingAcc = 0.8;
    s.needle = 0; s.switchAnim = 0; s.flow = 0;
    s.bubblesH = []; s.bubblesO = []; s.pops = [];
    s.effect = null; s.drag = null; s.nearOutlet = null;
    s.splints.burning = { x: 0, y: 0, mode: 'rest', fx: 0, fy: 0, retT: 0 };
    s.splints.glowing = { x: 0, y: 0, mode: 'rest', fx: 0, fy: 0, retT: 0 };
    s.firstBubbleDone = false; s.fullTubeDone = false; s.vHPeak = 0;
    labSound.stopLoop();
    setRunning(false);
    setHasRun(false);
    setTested({ h2: false, o2: false });
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setBadges([]);
    syncUi();
  };

  // ---- badge watcher -------------------------------------------------------------------
  useEffect(() => {
    if (tested.h2 && tested.o2) earn('gas-tester');
  }, [tested, earn]);

  // ---- analysis ----------------------------------------------------------------------------
  // a slope only means one voltage — scope the fit to rows recorded at the
  // supply selected right now, so mixed-voltage runs never fake a rate
  const fitH = useMemo(
    () => {
      const scoped = rows.filter((r) => r.volts === volts);
      return scoped.length >= 2 ? linearFit(scoped.map((r) => ({ x: r.t, y: r.vH }))) : null;
    },
    [rows, volts],
  );

  // ---- coach -----------------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (!mentorAcked) return { tone: 'info', line: 'A Hofmann voltameter: two inverted graduated tubes over platinum electrodes in water acidified with a little dilute sulfuric acid — battery, ammeter and knife switch wait on the bench below.' };
    if (ui.vH >= TUBE_CAP - 0.05 || ui.vO >= TUBE_CAP - 0.05) return { tone: 'warn', line: 'A tube is full, so the bench opened the switch by itself — the columns hold their 2 : 1 gas. Record the pair, run the flame tests, or reset for a fresh run.' };
    if (!hasRun) return { tone: 'info', line: 'Close the knife switch — current through the electrolyte splits the water: hydrogen bubbles up on the left (cathode), oxygen on the right (anode).' };
    if (!ui.running && ui.vH > 0.05 && rows.length === 0) return { tone: 'info', line: 'Switch open — the columns hold their gas. Close it to keep collecting, or record what you have.' };
    if (tested.h2 && tested.o2) {
      const held = ui.vO >= 0.2 ? `your columns read ${(ui.vH / ui.vO).toFixed(2)} : 1` : 'the columns grew at 2 : 1 all along';
      return { tone: 'good', line: `Both gases identified — a pop for hydrogen, a relight for oxygen — and ${held}, exactly what 2H₂O → 2H₂ + O₂ predicts.` };
    }
    if (tested.h2 && !tested.o2 && ui.vO >= O2_MIN_TEST) return { tone: 'good', line: 'Hydrogen confirmed with a bang. Now drag the glowing splint to the right outlet — oxygen should wake its ember back into flame.' };
    if (!tested.h2 && ui.vH >= H2_MIN_TEST && rows.length >= 1) return { tone: 'good', line: 'Reading banked — time for the flame test: drag the burning splint to the LEFT tube outlet and brace for the pop.' };
    if (ui.running && rows.length === 0 && ui.vH >= RECORD_MIN_H) return { tone: 'good', line: `V(H₂) = ${ui.vH.toFixed(1)} mL against V(O₂) = ${ui.vO.toFixed(1)} mL — ratio ≈ ${(ui.vH / Math.max(ui.vO, 0.1)).toFixed(2)} : 1. Record the pair.` };
    if (ui.running) return { tone: 'info', line: `Collecting at ${volts} V — bubbles stream twice as thick at the cathode. Gas gathers slowly at real time; the Speed selector hurries the clock, never the chemistry.` };
    return { tone: 'info', line: 'Close the switch to keep the columns climbing — or open Observations to review your recorded pairs.' };
  }, [mentorAcked, ui, hasRun, rows.length, tested, volts]);

  // ---- status ---------------------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Experiment complete'
    : ui.running ? 'Electrolysing…'
    : hasRun ? 'Switch open — gas held'
    : 'Experiment ready';
  const recordReady = ui.vH >= RECORD_MIN_H && ui.vO >= RECORD_MIN_O;

  // ---- render ------------------------------------------------------------------------------------------
  const ratioLive = ui.vO > 0.2 ? ui.vH / ui.vO : null;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.running ? 'active' : 'ready'}
      captionChip="Hofmann voltameter bench"
      legend={[
        { color: '#3b6fd4', label: 'Cathode (−) → hydrogen' },
        { color: '#d24a35', label: 'Anode (+) → oxygen' },
        { color: '#c6ced7', label: 'Platinum electrodes' },
        { color: '#f97316', label: 'Burning / glowing splints' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — inspect the bench', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <label>Speed
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Time speed">
            <option value={1}>1× real time</option>
            <option value={2}>2× faster</option>
            <option value={4}>4× fastest</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Electrolysis bench — press Space to close or open the switch; drag a splint to a gas outlet to test the collected gas"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              toggleSwitch();
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="elec-top-row">
            <button
              className="action-button"
              type="button"
              data-nudge="switch"
              aria-pressed={running}
              onClick={toggleSwitch}
            >
              <span className="dispense-icon" aria-hidden="true">⏻</span>
              <span>{running ? 'Open the switch' : 'Close the switch'}</span>
              <small>{running ? 'current flowing — bubbles on' : 'or click the brass switch on the bench'}</small>
            </button>
            <div className="stopwatch">
              <span>ELECTROLYSIS TIME · SIMULATED</span>
              <strong className={ui.running ? 'running' : ''}>{fmtClock(ui.t)}</strong>
              <div className="count-line">
                <span>V(H₂) {Math.min(100, (ui.vH / TUBE_CAP) * 100).toFixed(0)}% · V(O₂) {Math.min(100, (ui.vO / TUBE_CAP) * 100).toFixed(0)}%</span>
                <div><span style={{ width: `${Math.min(100, (ui.vH / TUBE_CAP) * 100)}%` }} /></div>
              </div>
            </div>
          </div>
          <div className="elec-live-row">
            <div className="elec-live"><span>HYDROGEN (LEFT)</span><strong>{ui.vH.toFixed(1)}<small>mL</small></strong></div>
            <div className="elec-live"><span>OXYGEN (RIGHT)</span><strong>{ui.vO.toFixed(1)}<small>mL</small></strong></div>
            <div className="elec-live"><span>RATIO V(H₂)/V(O₂)</span><strong className="elec-ratio">{ratioLive ? ratioLive.toFixed(2) : '—'}</strong></div>
            <div className="elec-live"><span>AMMETER</span><strong>{ui.current.toFixed(2)}<small>A</small></strong></div>
          </div>
          <div className="voltage-toggle" data-nudge="voltage" role="group" aria-label="Battery voltage">
            {VOLT_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                className={`seg${volts === v ? ' on' : ''}`}
                aria-pressed={volts === v}
                onClick={() => changeVoltage(v)}
              >
                <span className="seg-title">{v} V</span>
                <span className="seg-sub">{v / 1.5} cells · {(rateH2(v) * 60).toFixed(1)} mL/min H₂</span>
              </button>
            ))}
          </div>
          <div className="splint-row">
            <button
              className="splint-button"
              type="button"
              onClick={() => gasTest('burning', 'left')}
              disabled={ui.vH < H2_MIN_TEST}
              title={ui.vH < H2_MIN_TEST ? 'Let at least 1 mL of hydrogen collect first' : 'Run the classic pop test for hydrogen'}
            >
              <span>Pop test — burning splint → hydrogen outlet</span>
              <small>{ui.vH < H2_MIN_TEST ? 'needs ≥ 1 mL of hydrogen' : 'drag it on the bench, or press here'}</small>
            </button>
            <button
              className="splint-button"
              type="button"
              onClick={() => gasTest('glowing', 'right')}
              disabled={ui.vO < O2_MIN_TEST}
              title={ui.vO < O2_MIN_TEST ? 'Let at least 0.5 mL of oxygen collect first' : 'Run the classic relight test for oxygen'}
            >
              <span>Relight test — glowing splint → oxygen outlet</span>
              <small>{ui.vO < O2_MIN_TEST ? 'needs ≥ 0.5 mL of oxygen' : 'drag it on the bench, or press here'}</small>
            </button>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>The ratio readout comes from the graduations themselves — nothing is fed from the formula. Gas gathers slowly at real time; the Speed selector hurries the clock, and raising the voltage raises the current and the rate together.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordReading(); notePointer(true); }}
            disabled={!recordReady}
          >
            {recordReady
              ? `✎ Record reading — V(H₂) = ${ui.vH.toFixed(1)} mL · V(O₂) = ${ui.vO.toFixed(1)} mL · ${volts} V`
              : 'Record unlocks after 2 mL of hydrogen'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Gas volumes</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Hydrogen collected · left tube (cathode)</span>
            <strong>{ui.vH.toFixed(1)} <small>mL</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (ui.vH / TUBE_CAP) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0 mL</span><span>{TUBE_CAP} mL — tube full</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Oxygen collected</span><strong>{ui.vO.toFixed(1)} <small>mL</small></strong></div>
            <div><span>Ratio V(H₂)/V(O₂)</span><strong>{ratioLive ? ratioLive.toFixed(2) : '—'}</strong></div>
            <div><span>Current (ammeter)</span><strong>{ui.current.toFixed(2)} <small>A</small></strong></div>
            <div><span>Electrolysis time</span><strong>{fmtClock(ui.t)}</strong></div>
            <div><span>Supply voltage</span><strong>{volts} <small>V</small></strong></div>
            <div><span>H₂ rate now</span><strong>{ui.running ? (rateH2(volts) * 60).toFixed(1) : '0.0'} <small>mL/min</small></strong></div>
          </div>
          <div className="ratio-readout">
            <span>Volume ratio V(H₂) : V(O₂)</span>
            <strong>{ratioLive ? <>{ratioLive.toFixed(2)} <small>: 1</small></> : <small style={{ fontSize: 13 }}>waiting for measurable columns…</small>}</strong>
            <p>Equal volumes hold equal numbers of molecules, so twice the hydrogen volume means twice the molecules — exactly what 2H₂O → 2H₂ + O₂ demands. Accepted value: 2.00 : 1.</p>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Inspect the Hofmann voltameter: two inverted graduated tubes over platinum electrodes in water acidified with a little dilute sulfuric acid.</li>
              <li>Close the knife switch — bubbles stream off both electrodes and rise into the tubes.</li>
              <li>Let the columns build; the hydrogen (left) climbs twice as fast as the oxygen (right).</li>
              <li>Record the time, both volumes and the computed ratio in your table.</li>
              <li>Drag the burning splint to the left outlet — hydrogen answers with a pop.</li>
              <li>Drag the glowing splint to the right outlet — oxygen relights it.</li>
              <li>Change the battery voltage and collect again: the rate follows the voltage, the 2 : 1 ratio never moves.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Collection is slow at real time — that is honest electrolysis. Use the Speed selector in the toolbar, and judge the ratio from volumes of at least a few millilitres so reading resolution cannot mislead you.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Gas volumes — read off the graduations</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Close the switch, let both columns build past 2 mL of hydrogen, and record your first pair. The ratio column is computed from your own two readings.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>time</th><th>supply</th><th>V(H₂)</th><th>V(O₂)</th><th>ratio</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{fmtClock(r.t)}</td>
                      <td>{r.volts} V</td>
                      <td>{r.vH.toFixed(1)} mL</td>
                      <td>{r.vO.toFixed(1)} mL</td>
                      <td>{r.ratio.toFixed(2)} : 1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 1 && (
              <>
                <h3 style={{ marginTop: 16 }}>Volume–time graph</h3>
                <GasChart
                  rows={rows}
                  liveH={Math.round(ui.vH * 10) / 10}
                  liveO={Math.round(ui.vO * 10) / 10}
                  liveT={Math.round(ui.t)}
                />
                <div className="gas-chart-legend">
                  <span><i style={{ background: '#e8632a' }} /> hydrogen V(H₂)</span>
                  <span><i style={{ background: '#3b6fd4' }} /> oxygen V(O₂)</span>
                  <span><i style={{ background: '#fff', border: '1px dashed #9aa4b1' }} /> live (unrecorded)</span>
                </div>
              </>
            )}
            {fitH && (
              <p className="observation-note">
                Your hydrogen line at {volts} V: slope = {(fitH.m * 60).toFixed(2)} mL/min (R² = {fitH.r2.toFixed(4)}),
                against theory&apos;s {(rateH2(volts) * 60).toFixed(2)} mL/min for the same supply.
                Record another pair at this voltage to sharpen the fit — or switch the supply, collect again, and watch the graph kink while the 2 : 1 gap stays put.
              </p>
            )}
            <p className="observation-note">Every volume in the table came off the tube graduations at the moment you pressed record — the ratio column simply divides one recorded reading by the other. While the columns grow, hydrogen sits at twice oxygen&apos;s reading; each flame test vents a little gas (in the same 2 : 1 proportion), so take your careful measurements before testing.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Pure water barely conducts, so a little dilute sulfuric acid is added as the electrolyte — it supplies ions that carry the charge while the water itself is what gets decomposed at the platinum electrodes:</p>
            <div className="equation">2H₂O(l) → 2H₂(g) + O₂(g)</div>
            <p>At the negative cathode, hydrogen ions are attracted in and gain electrons; at the positive anode, water molecules lose electrons and release oxygen:</p>
            <div className="equation">Cathode (−): 2H⁺(aq) + 2e⁻ → H₂(g)</div>
            <div className="equation">Anode (+): 2H₂O(l) → O₂(g) + 4H⁺(aq) + 4e⁻</div>
            <p>The sulfate ions never take part — they just shuttle charge around the loop, which is why the acid is not consumed. Because equal volumes of gas contain equal numbers of molecules, the equation&apos;s 2 : 2 : 1 split appears in the tubes as exactly two volumes of hydrogen for every one of oxygen.</p>
            <p>The rate is pure Faraday: charge delivered is gas delivered, coulomb by coulomb, twice as much hydrogen as oxygen. Raise the battery voltage and the current climbs (I = V/R with the cell at about 40 Ω here), so the bubbles, the ammeter and the volume–time slope all rise together — while the 2 : 1 ratio refuses to budge.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
    />
  );
}

// ---- dual-series analysis chart (observations tab) -------------------------------

function GasChart(props: { rows: TrialRow[]; liveH: number; liveO: number; liveT: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, rect.width);
      const h = 220;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { l: 44, r: 14, t: 14, b: 32 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const xs = props.rows.map((r) => r.t);
      if (props.liveT > 0) xs.push(props.liveT);
      const ys = props.rows.flatMap((r) => [r.vH, r.vO]);
      if (props.liveH > 0) ys.push(props.liveH, props.liveO);
      const tMax = Math.max(60, Math.ceil(Math.max(60, ...xs, 0) / 30) * 30);
      const vMax = Math.max(6, Math.ceil(Math.max(6, ...ys, 0) / 3) * 3);
      const sx = (t: number) => pad.l + (t / tMax) * iw;
      const sy = (v: number) => pad.t + ih - (v / vMax) * ih;

      // grid + tick labels
      ctx.strokeStyle = '#e8edf2';
      ctx.lineWidth = 1;
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.fillStyle = '#9aa4b1';
      for (let i = 0; i <= 4; i += 1) {
        const x = pad.l + (iw * i) / 4;
        const y = pad.t + (ih * (4 - i)) / 4;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ih);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + iw, y);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(tMax * i / 4)}s`, x, h - pad.b + 14);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(vMax * i / 4)}`, pad.l - 6, y + 3);
      }

      // axes
      ctx.strokeStyle = '#c5cdd6';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('time (s)', pad.l + iw / 2, h - 4);
      ctx.save();
      ctx.translate(11, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('volume (mL)', 0, 0);
      ctx.restore();

      const drawSeries = (pts: { x: number; y: number }[], color: string, live: { x: number; y: number } | null) => {
        if (pts.length === 0 && !live) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(0));
        for (const p of pts) ctx.lineTo(sx(p.x), sy(p.y));
        if (live) ctx.lineTo(sx(live.x), sy(live.y));
        ctx.stroke();
        for (const p of pts) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(sx(p.x), sy(p.y), 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (live) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(sx(live.x), sy(live.y), 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      };
      drawSeries(props.rows.map((r) => ({ x: r.t, y: r.vO })), '#3b6fd4', props.liveO > 0.05 ? { x: props.liveT, y: props.liveO } : null);
      drawSeries(props.rows.map((r) => ({ x: r.t, y: r.vH })), '#e8632a', props.liveH > 0.05 ? { x: props.liveT, y: props.liveH } : null);
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rows, props.liveH, props.liveO, props.liveT]);

  return <canvas ref={canvasRef} className="lab-plot" style={{ width: '100%', height: 220 }} aria-label="Collected gas volume versus time plot" />;
}

// ---- scene drawing helpers (NO text is drawn on the scene canvas) -------------------

function drawTrough(ctx: CanvasRenderingContext2D, g: Geom, tSec: number) {
  // stand legs (drawn first — wires and meters pass in front)
  ctx.fillStyle = '#435062';
  roundRect(ctx, g.troughL + 8, g.troughB, 6, g.floorY - g.troughB - 2, 2);
  ctx.fill();
  roundRect(ctx, g.troughR - 14, g.troughB, 6, g.floorY - g.troughB - 2, 2);
  ctx.fill();
  // tank glass
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, g.troughL, g.troughT, g.troughR - g.troughL, g.troughB - g.troughT, 7);
  ctx.fill();
  // water body (acidified electrolyte — faint tint)
  const wg = ctx.createLinearGradient(0, g.waterY, 0, g.troughB);
  wg.addColorStop(0, 'rgba(208,231,243,0.9)');
  wg.addColorStop(1, 'rgba(183,214,234,0.95)');
  ctx.fillStyle = wg;
  ctx.fillRect(g.troughL + 2, g.waterY, g.troughR - g.troughL - 4, g.troughB - g.waterY - 3);
  // rippling surface
  ctx.strokeStyle = 'rgba(140,175,205,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = g.troughL + 3; x <= g.troughR - 3; x += 6) {
    const y = g.waterY + Math.sin(tSec * 1.6 + x * 0.05) * 1.4;
    if (x === g.troughL + 3) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // glass outline
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2.5;
  roundRect(ctx, g.troughL, g.troughT, g.troughR - g.troughL, g.troughB - g.troughT, 7);
  ctx.stroke();
}

function tubePath(ctx: CanvasRenderingContext2D, tx: number, g: Geom) {
  ctx.beginPath();
  ctx.moveTo(tx, g.tubeB);
  ctx.lineTo(tx, g.tubeTop + g.tubeW / 2);
  ctx.arc(tx + g.tubeW / 2, g.tubeTop + g.tubeW / 2, g.tubeW / 2, Math.PI, 0);
  ctx.lineTo(tx + g.tubeW, g.tubeB);
}

function drawTube(ctx: CanvasRenderingContext2D, g: Geom, tube: TubeId, v: number, tSec: number, running: boolean) {
  const tx = tube === 'left' ? g.lx : g.lx + g.tubeW + g.gap;
  const cx = tx + g.tubeW / 2;
  const iy = interfaceY(g, v);

  // inside: gas headspace + water column
  ctx.save();
  tubePath(ctx, tx, g);
  ctx.clip();
  ctx.fillStyle = tube === 'left' ? 'rgba(253,246,227,0.65)' : 'rgba(213,232,247,0.7)';
  ctx.fillRect(tx, g.tubeTop - 2, g.tubeW, iy - g.tubeTop + 2);
  const wg = ctx.createLinearGradient(0, iy, 0, g.tubeB);
  wg.addColorStop(0, 'rgba(203,228,242,0.95)');
  wg.addColorStop(1, 'rgba(176,209,232,0.95)');
  ctx.fillStyle = wg;
  ctx.fillRect(tx, iy, g.tubeW, g.tubeB - iy);
  // meniscus (gently wobbling while gas arrives)
  const wob = running ? Math.sin(tSec * 2.2) * 1.3 : 0;
  ctx.strokeStyle = 'rgba(120,160,190,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx + 2, iy + wob);
  ctx.lineTo(tx + g.tubeW - 2, iy + wob * 0.8);
  ctx.stroke();
  // glass sheen
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(tx + 6, g.tubeB - 14);
  ctx.lineTo(tx + 6, g.tubeTop + g.tubeW * 0.9);
  ctx.stroke();
  ctx.restore();

  // glass outline
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  tubePath(ctx, tx, g);
  ctx.stroke();

  // graduations — minor every 2 mL, major every 4 mL (readings live in the panel)
  const innerTop = g.tubeTop + g.tubeW / 2 + 3;
  const side = tube === 'left' ? -1 : 1;
  const gx = tube === 'left' ? tx - 2 : tx + g.tubeW + 2;
  for (let ml = 0; ml <= TUBE_CAP; ml += 2) {
    const y = innerTop + (ml / TUBE_CAP) * (g.tubeB - innerTop);
    const major = ml % 4 === 0;
    ctx.strokeStyle = major ? '#98a4b0' : '#c0cad3';
    ctx.lineWidth = major ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx + side * (major ? 10 : 5), y);
    ctx.stroke();
  }

  // gas outlet: brass side-tap with a tiny wheel
  const ny = g.tubeTop + g.tubeW * 0.35;
  const nx = tube === 'left' ? tx : tx + g.tubeW;
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, tube === 'left' ? nx - 12 : nx, ny - 3, 12, 6, 2);
  ctx.fill();
  ctx.strokeStyle = '#a4762a';
  ctx.lineWidth = 1;
  roundRect(ctx, tube === 'left' ? nx - 12 : nx, ny - 3, 12, 6, 2);
  ctx.stroke();
  ctx.strokeStyle = '#a4762a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tube === 'left' ? nx - 6 : nx + 6, ny - 3);
  ctx.lineTo(tube === 'left' ? nx - 6 : nx + 6, ny - 9);
  ctx.stroke();
  ctx.fillStyle = '#8a6420';
  ctx.beginPath();
  ctx.arc(tube === 'left' ? nx - 6 : nx + 6, ny - 10, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // platinum electrode + stem (stem coloured by polarity)
  ctx.fillStyle = '#c6ced7';
  ctx.strokeStyle = '#66727e';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - 7, g.tubeB - 20, 14, 16, 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = tube === 'left' ? '#3b6fd4' : '#d24a35';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, g.tubeB - 6);
  ctx.lineTo(cx, g.railY);
  ctx.stroke();
  // sealed gland where the stem leaves the tank
  ctx.fillStyle = '#435062';
  ctx.beginPath();
  ctx.arc(cx, g.troughB, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBubbles(ctx: CanvasRenderingContext2D, arr: Bubble[]) {
  for (const b of arr) {
    ctx.fillStyle = 'rgba(238,247,252,0.9)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,200,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawCurrent(ctx: CanvasRenderingContext2D, segs: [number, number, number, number][], flow: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(249,115,22,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 10]);
  let travelled = 0;
  for (const [x1, y1, x2, y2] of segs) {
    ctx.lineDashOffset = -(flow + travelled);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    travelled += Math.hypot(x2 - x1, y2 - y1);
  }
  ctx.restore();
}

function drawWires(ctx: CanvasRenderingContext2D, g: Geom, running: boolean, flow: number) {
  const glandY = g.troughB + 4;
  // cathode wire (blue) — electrode to battery negative
  const cathSegs: [number, number, number, number][] = [
    [g.cathX, glandY, g.cathX, g.railY],
    [g.cathX, g.railY, g.amX - g.amR - 2, g.railY],
    [g.amX + g.amR + 2, g.railY, g.batCx + 16, g.railY],
  ];
  // anode wire (red) — electrode to the switch
  const anodeSegs: [number, number, number, number][] = [
    [g.anodeX, glandY, g.anodeX, g.railY],
    [g.anodeX, g.railY, g.swCx - 26, g.railY],
  ];
  // return cable (red) — switch, along the bench front, up to battery positive
  const retSegs: [number, number, number, number][] = [
    [g.swCx + 26, g.railY, g.swCx + 46, g.railY],
    [g.swCx + 46, g.railY, g.swCx + 46, g.ch - 12],
    [g.swCx + 46, g.ch - 12, g.batCx - 28, g.ch - 12],
    [g.batCx - 28, g.ch - 12, g.batCx - 28, g.packT + 4],
    [g.batCx - 28, g.packT + 4, g.batCx - 14, g.packT + 4],
  ];
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#3b6fd4';
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of cathSegs) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.strokeStyle = '#d24a35';
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of [...anodeSegs, ...retSegs]) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  if (running) drawCurrent(ctx, cathSegs, flow);
  if (running) drawCurrent(ctx, [...anodeSegs, ...retSegs], flow);
}

function drawBattery(ctx: CanvasRenderingContext2D, g: Geom) {
  for (let i = 0; i < g.cells; i += 1) {
    const y = g.packT + i * g.pitch + g.pitch / 2;
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.batCx - 17, y);
    ctx.lineTo(g.batCx + 17, y);
    ctx.stroke();
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(g.batCx - 8, y + g.pitch * 0.32);
    ctx.lineTo(g.batCx + 8, y + g.pitch * 0.32);
    ctx.stroke();
  }
  // terminal caps: negative (blue) where the cathode wire lands, positive (red) at the top
  ctx.fillStyle = '#3b6fd4';
  roundRect(ctx, g.batCx + 13, g.railY - 5, 10, 10, 3);
  ctx.fill();
  ctx.fillStyle = '#d24a35';
  roundRect(ctx, g.batCx - 23, g.packT - 1, 10, 10, 3);
  ctx.fill();
}

function drawAmmeter(ctx: CanvasRenderingContext2D, g: Geom, u: number) {
  const { amX, railY, amR } = g;
  ctx.fillStyle = '#fdfefe';
  ctx.strokeStyle = '#172334';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(amX, railY, amR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(amX, railY, amR + 3, 0, Math.PI * 2);
  ctx.stroke();
  const pivot = { x: amX, y: railY + amR * 0.42 };
  const arcR = amR * 0.8;
  ctx.strokeStyle = '#b6c1cc';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, arcR, (-50 * Math.PI) / 180 - Math.PI / 2, (50 * Math.PI) / 180 - Math.PI / 2);
  ctx.stroke();
  for (let i = 0; i <= 4; i += 1) {
    const a = ((-50 + (i * 100) / 4) * Math.PI) / 180 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(pivot.x + Math.cos(a) * arcR, pivot.y + Math.sin(a) * arcR);
    ctx.lineTo(pivot.x + Math.cos(a) * (arcR - 4), pivot.y + Math.sin(a) * (arcR - 4));
    ctx.stroke();
  }
  const na = ((-50 + clamp(u, 0, 1) * 100) * Math.PI) / 180 - Math.PI / 2;
  ctx.strokeStyle = '#e8632a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(pivot.x + Math.cos(na) * amR * 0.78, pivot.y + Math.sin(na) * amR * 0.78);
  ctx.stroke();
  ctx.fillStyle = '#172334';
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSwitch(ctx: CanvasRenderingContext2D, g: Geom, anim: number) {
  const closed = anim >= 0.95;
  // base plate
  ctx.fillStyle = '#435062';
  roundRect(ctx, g.swCx - 36, g.railY + 2, 72, 12, 4);
  ctx.fill();
  // brass posts
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, g.swCx - 30, g.railY - 12, 7, 16, 2);
  ctx.fill();
  roundRect(ctx, g.swCx + 23, g.railY - 12, 7, 16, 2);
  ctx.fill();
  // lever
  const px = g.swCx - 26;
  const py = g.railY - 9;
  const a = -0.62 * (1 - clamp(anim, 0, 1));
  const ex = px + Math.cos(a) * 50;
  const ey = py + Math.sin(a) * 50;
  ctx.strokeStyle = '#172334';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  // insulated handle knob
  ctx.fillStyle = '#b3431f';
  ctx.beginPath();
  ctx.arc(ex, ey, 5.5, 0, Math.PI * 2);
  ctx.fill();
  // pivot
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  if (closed) {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(g.swCx + 26, g.railY - 9, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStand(ctx: CanvasRenderingContext2D, st: { x: number; y: number }) {
  ctx.fillStyle = '#b08d63';
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = 1.5;
  roundRect(ctx, st.x - 14, st.y + 16, 28, 9, 3);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#435062';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(st.x - 8, st.y + 8);
  ctx.lineTo(st.x - 8, st.y + 16);
  ctx.moveTo(st.x + 8, st.y + 8);
  ctx.lineTo(st.x + 8, st.y + 16);
  ctx.stroke();
}

function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, tSec: number) {
  if (s <= 0) return;
  const fl = 1 + Math.sin(tSec * 12 + x) * 0.14 + Math.sin(tSec * 23 + y) * 0.07;
  const fh = 17 * s * fl;
  const fw = 4.6 * s;
  const halo = ctx.createRadialGradient(x, y - fh * 0.35, 2, x, y - fh * 0.35, 16 + 14 * s);
  halo.addColorStop(0, `rgba(255,180,90,${0.34 * Math.min(1, s)})`);
  halo.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y - fh * 0.35, 16 + 14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(249,115,22,0.85)';
  ctx.beginPath();
  ctx.moveTo(x - fw, y);
  ctx.quadraticCurveTo(x - fw, y - fh * 0.45, x, y - fh);
  ctx.quadraticCurveTo(x + fw, y - fh * 0.45, x + fw, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,217,138,0.95)';
  ctx.beginPath();
  ctx.moveTo(x - fw * 0.55, y);
  ctx.quadraticCurveTo(x - fw * 0.55, y - fh * 0.28, x, y - fh * 0.62);
  ctx.quadraticCurveTo(x + fw * 0.55, y - fh * 0.28, x + fw * 0.55, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,247,226,0.95)';
  ctx.beginPath();
  ctx.moveTo(x - fw * 0.28, y);
  ctx.quadraticCurveTo(x - fw * 0.28, y - fh * 0.15, x, y - fh * 0.34);
  ctx.quadraticCurveTo(x + fw * 0.28, y - fh * 0.15, x + fw * 0.28, y);
  ctx.closePath();
  ctx.fill();
}

function drawEmber(ctx: CanvasRenderingContext2D, x: number, y: number, tSec: number, scale = 1) {
  if (scale <= 0.02) return;
  const pulse = (0.7 + 0.3 * Math.sin(tSec * 3.1 + x * 0.2)) * scale;
  const haloR = Math.max(1.2, 11 * pulse);
  const halo = ctx.createRadialGradient(x, y, 1, x, y, haloR);
  halo.addColorStop(0, `rgba(217,119,6,${0.3 * pulse})`);
  halo.addColorStop(1, 'rgba(217,119,6,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(178,62,30,${0.95 * scale})`;
  ctx.beginPath();
  ctx.arc(x, y, 3.2 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,190,130,${(0.5 + 0.5 * pulse) * scale})`;
  ctx.beginPath();
  ctx.arc(x - 0.6, y - 0.6, Math.max(0.4, 1.4 * pulse), 0, Math.PI * 2);
  ctx.fill();
}

function drawSplint(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, kind: SplintId, flameScale: number, tSec: number, emberScale = 1) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const x1 = cx - dx * (SPLINT_LEN / 2);
  const y1 = cy - dy * (SPLINT_LEN / 2);
  const x2 = cx + dx * (SPLINT_LEN / 2);
  const y2 = cy + dy * (SPLINT_LEN / 2);
  // shadow
  ctx.strokeStyle = 'rgba(23,35,52,0.14)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1 + 2, y1 + 3);
  ctx.lineTo(x2 + 2, y2 + 3);
  ctx.stroke();
  // wooden stick
  ctx.strokeStyle = '#c9a06a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // charred tip
  ctx.strokeStyle = '#5b4632';
  ctx.beginPath();
  ctx.moveTo(x1 + (x2 - x1) * 0.78, y1 + (y2 - y1) * 0.78);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (kind === 'burning') {
    drawFlame(ctx, x2, y2 - 2, flameScale, tSec);
  } else {
    drawEmber(ctx, x2, y2, tSec, emberScale);
    if (flameScale > 0) drawFlame(ctx, x2, y2 - 2, flameScale, tSec);
  }
}

function drawEffect(ctx: CanvasRenderingContext2D, e: GasEffect, g: Geom, w: number, h: number, tSec: number) {
  const out = e.tube === 'left' ? g.outL : g.outR;
  if (e.kind === 'pop') {
    const p = Math.min(1, e.t / 0.55);
    ctx.fillStyle = `rgba(255,243,219,${0.32 * (1 - p)})`;
    ctx.fillRect(0, 0, w, h);
    const core = ctx.createRadialGradient(out.x, out.y, 2, out.x, out.y, 10 + 52 * p);
    core.addColorStop(0, `rgba(255,255,245,${0.95 * (1 - p)})`);
    core.addColorStop(0.55, `rgba(255,187,105,${0.75 * (1 - p)})`);
    core.addColorStop(1, 'rgba(255,187,105,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(out.x, out.y, 10 + 52 * p, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(232,99,42,${0.85 * (1 - p)})`;
    ctx.lineWidth = 3 * (1 - p) + 0.6;
    ctx.beginPath();
    ctx.arc(out.x, out.y, 14 + 78 * p, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.35;
      const r0 = 8 + 30 * p;
      const r1 = r0 + 12 + 34 * p;
      ctx.strokeStyle = `rgba(255,168,76,${0.9 * (1 - p)})`;
      ctx.beginPath();
      ctx.moveTo(out.x + Math.cos(a) * r0, out.y + Math.sin(a) * r0);
      ctx.lineTo(out.x + Math.cos(a) * r1, out.y + Math.sin(a) * r1);
      ctx.stroke();
    }
  } else if (e.kind === 'flare') {
    const p = Math.min(1, e.t / 0.7);
    const halo = ctx.createRadialGradient(out.x, out.y - 12, 4, out.x, out.y - 12, 34);
    halo.addColorStop(0, `rgba(255,196,110,${0.4 * (1 - p)})`);
    halo.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(out.x, out.y - 12, 34, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'relight') {
    // rising embers off the fresh flame
    const p = Math.min(1, e.t / 1.5);
    for (let i = 0; i < 4; i += 1) {
      const ep = (p * 1.4 + i * 0.22) % 1;
      const a = 1 - ep;
      ctx.fillStyle = `rgba(255,170,90,${a * 0.8})`;
      ctx.beginPath();
      ctx.arc(out.x + Math.sin(tSec * 3 + i * 2) * 5, out.y - 10 - ep * 26, 1.6 + a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
