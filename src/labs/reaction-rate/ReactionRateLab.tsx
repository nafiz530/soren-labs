import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { fmtClock, linearFit, clamp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './reaction-rate.css';

/**
 * Rate of reaction — marble chips + hydrochloric acid, read with a gas syringe.
 *
 * The student drags a marble charge into the flask (one large chip, three
 * medium chips or a spoonful of powder), sets the acid concentration and the
 * water-bath temperature, and races complete runs. Every run banks a curve of
 * CO₂ volume against time; overlaying them shows which factor sped the
 * reaction up most.
 *
 * Chemistry model (honest, stated in the theory tab):
 *   CaCO₃(s) + 2HCl(aq) → CaCl₂(aq) + H₂O(l) + CO₂(g)↑
 *   charge    : 0.75 g CaCO₃ (7.5 mmol) in every form → 180 mL of CO₂ if the
 *               marble is the limiting reagent (molar volume 24,000 mL/mol)
 *   acid      : 25 mL of dilute HCl; at 0.5 M it is the limiting reagent and
 *               the run ends at 150 mL instead of 180 mL
 *   rate      : dV/dt = 6.0 · [HCl](t) · SA · 1.7^((T−20)/10) · (marble)^(2/3)
 *               with SA = 1× (large chip), 3× (medium chips), 12× (powder)
 *   [HCl](t)  = c₀ − V/300 (the acid is consumed 2 mol per mol of CO₂)
 */

type ChargeId = 'big' | 'medium' | 'powder';

const CHARGES: { id: ChargeId; label: string; short: string; mult: number }[] = [
  { id: 'big', label: 'One large chip', short: 'Large chip', mult: 1 },
  { id: 'medium', label: 'Three medium chips', short: 'Medium chips', mult: 3 },
  { id: 'powder', label: 'A spoonful of powder', short: 'Powder', mult: 12 },
];

const SA_MULT: Record<ChargeId, number> = { big: 1, medium: 3, powder: 12 };

const CONC_OPTIONS = [0.5, 1, 1.5, 2];
const TEMP_OPTIONS = [20, 40, 60];
const V_MARBLE = 180; // mL of CO₂ from the full 0.75 g charge (7.5 mmol × 24 L/mol)
const K_RATE = 6; // mL/s at 1.0 M, large chip, 20 °C — baseline run ≈ 2 min at 1×
const Q10 = 1.7; // rate multiplier per extra 10 °C of bath temperature
const SYRINGE_CAP = 200; // mL capacity of the gas syringe
const MOLAR_VOLUME_ML = 24000; // mL per mole of gas at room conditions
const CO2_G_PER_ML = 44 / MOLAR_VOLUME_ML; // ≈ 0.0018 g of mass lost per mL collected
const CHARGE_G = 0.75;
const HALF_BADGE_RATIO = 0.65; // "t½ halved" badge tolerance

const tempFactor = (t: number) => Math.pow(Q10, (t - 20) / 10);
const chargeLabel = (id: ChargeId) => CHARGES.find((c) => c.id === id)?.short ?? '—';

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'load', title: 'Load the marble', detail: 'Drag a marble charge from the tray into the flask — one large chip, three medium chips, or the powder spoon. Every charge is the same 0.75 g of marble; only the surface area differs.', hint: 'On touch screens, drag with a finger — or use the three charge buttons under the scene.' },
  { id: 'baseline', title: 'Run the baseline', detail: 'Set 1.0 M acid and a 20 °C bath, then press Start — or tap Space. Watch the bubbles stream and the syringe plunger push out.', hint: 'The curve draws itself in Observations while the run goes.' },
  { id: 'conc', title: 'Race the concentration', detail: 'Keep the same charge and the same temperature, change the acid concentration, and race a second run against your baseline.', hint: 'Doubling the molarity should roughly double the initial rate — check the table.' },
  { id: 'temp', title: 'Race the temperature', detail: 'Back to your original concentration, but run the water bath warmer — 40 or 60 °C — and race again.', hint: 'Roughly ×1.7 per extra 10 °C in this model.' },
  { id: 'powder', title: 'Go to powder', detail: 'Drag the powder spoon into the flask and race the same conditions — now surface area gets its turn.', hint: 'Hold on to something.' },
  { id: 'conclude', title: 'Name the winner', detail: 'Open Observations, study the overlay chart and the initial-rate column, then answer: which factor sped the run up most?', hint: 'Compare like with like — one factor changed at a time.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-run', title: 'First curve', icon: '✦', detail: 'Banked a first complete run on the gas syringe.' },
  { id: 'race-three', title: 'Three runs raced', icon: '⇄', detail: 'Raced three complete runs in one session.' },
  { id: 'half-half', title: 't½ halved', icon: '⏱', detail: 'Doubled the acid concentration (same charge, same temperature) and cut the half-time to roughly half.' },
  { id: 'powder-frenzy', title: 'Powder frenzy', icon: '⁂', detail: 'The fastest run of the session used the powder charge.' },
  { id: 'five-runs', title: 'Five-run scientist', icon: '★', detail: 'Banked five complete runs — a proper rate study.' },
];

interface RunRow {
  id: number;
  form: ChargeId;
  c: number;
  temp: number;
  vEnd: number;
  tHalf: number;
  rate: number;
  limiting: 'marble' | 'acid';
  pts: { t: number; v: number }[];
}

interface Bubble { x: number; y: number; vy: number; wob: number; r: number }
interface TubeDot { s: number; r: number }
interface Pop { x: number; y: number; t: number }
interface Steam { x: number; y: number; vy: number; sway: number; r: number; a: number }

interface Layout {
  w: number; h: number; floorY: number;
  bathX: number; bathY: number; bathW: number; bathH: number; waterY: number;
  flaskCX: number; flaskBaseY: number; flaskW: number; shoulderY: number;
  neckW: number; neckTopY: number; acidY: number;
  tubePts: { x: number; y: number }[];
  tubeCum: number[];
  tubeLen: number;
  syX: number; syY: number; syLen: number; syH: number;
  standX: number;
  trayX: number; trayY: number; trayW: number; trayH: number;
  cells: { x: number; y: number; w: number; h: number }[];
  thermX: number; thermTop: number; thermBot: number;
}

interface Sim {
  L: Layout;
  layoutW: number; layoutH: number;
  time: number;
  phase: 'ready' | 'running';
  chargeForm: ChargeId | null;
  c0: number;
  temp: number;
  vEnd: number;
  V: number;
  pl: number;
  rate: number;
  watch: number;
  acc: number;
  uiAcc: number;
  samples: { t: number; v: number }[];
  bestChord: number;
  prevT: number;
  prevV: number;
  tHalfLive: number | null;
  runId: number;
  bubbles: Bubble[];
  tubeDots: TubeDot[];
  pops: Pop[];
  steam: Steam[];
  spawnAcc: number;
  tubeAcc: number;
  steamAcc: number;
  drag: { held: boolean; form: ChargeId; x: number; y: number; over: boolean };
  auto: { t: number; form: ChargeId; fx: number; fy: number } | null;
  hover: ChargeId | null;
  lastPopAt: number;
  lastSlideAt: number;
  lastSloshAt: number;
  lastSwapWarnAt: number;
}

interface UiSnap {
  phase: 'ready' | 'running';
  V: number; pl: number; rate: number; watch: number;
  form: ChargeId | null;
  liveOn: boolean;
  livePts: { t: number; v: number }[];
  tHalfLive: number | null;
  bestChord: number;
}

/** Referentially stable empty series — keeps the chart observer idle between runs. */
const NO_LIVE: { t: number; v: number }[] = [];

const meta = getLabBySlug('reaction-rate')!;

// deterministic marble specks (no Math.random at draw time — stable visuals)
const SPECKS: { dx: number; dy: number; r: number; t: number }[] = (() => {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out: { dx: number; dy: number; r: number; t: number }[] = [];
  for (let i = 0; i < 120; i += 1) out.push({ dx: rnd() * 2 - 1, dy: rnd(), r: 0.5 + rnd() * 1.15, t: rnd() });
  return out;
})();

// irregular chip silhouette (7 jittered radii)
const CHIP_SHAPE = [1, 0.74, 0.92, 1.06, 0.82, 0.97, 0.7];

function makeLayout(w: number, h: number): Layout {
  const floorY = h - 16;
  const flaskW = clamp(w * 0.115, 54, 96);
  const flaskH = clamp(h * 0.4, 148, 214);
  const bathW = clamp(w * 0.3, 96, 230);
  const bathH = clamp(h * 0.3, 96, 150);
  const flaskCX = clamp(w * 0.27, bathW / 2 + 10, w * 0.3);
  const bathX = flaskCX - bathW / 2;
  const bathY = floorY - 12 - bathH;
  const flaskBaseY = floorY - 16;
  const neckW = Math.max(18, flaskW * 0.3);
  const shoulderY = flaskBaseY - flaskH * 0.62;
  const neckTopY = flaskBaseY - flaskH;
  const acidY = flaskBaseY - flaskH * 0.5;
  const syY = Math.max(46, neckTopY - 46);
  const syX = Math.max(flaskCX + flaskW / 2 + 72, w * 0.52);
  const syLen = Math.max(96, w - 26 - syX);
  const syH = 36;
  const standX = syX + syLen * 0.7;
  // delivery tube: out of the stopper, up, round the corner, along to the syringe
  const sx = flaskCX + neckW * 0.18;
  const r = 14;
  const arc: { x: number; y: number }[] = [];
  for (let k = 1; k <= 5; k += 1) {
    const ang = Math.PI + (k / 6) * (Math.PI / 2);
    arc.push({ x: sx + r + r * Math.cos(ang), y: syY + r + r * Math.sin(ang) });
  }
  const tubePts = [
    { x: sx, y: neckTopY + 2 },
    { x: sx, y: syY + r },
    ...arc,
    { x: sx + r, y: syY },
    { x: syX - 4, y: syY },
    { x: syX + 6, y: syY },
  ];
  const tubeCum: number[] = [0];
  for (let i = 1; i < tubePts.length; i += 1) {
    tubeCum.push(tubeCum[i - 1] + Math.hypot(tubePts[i].x - tubePts[i - 1].x, tubePts[i].y - tubePts[i - 1].y));
  }
  const tubeLen = tubeCum[tubeCum.length - 1];
  const trayW = clamp(w * 0.42, 152, 212);
  const trayH = 52;
  const trayX = 12;
  const trayY = 14;
  const cellW = (trayW - 24) / 3;
  const cells = [0, 1, 2].map((i) => ({ x: trayX + 8 + i * (cellW + 4), y: trayY + 8, w: cellW, h: trayH - 16 }));
  return {
    w, h, floorY, bathX, bathY, bathW, bathH, waterY: bathY + bathH * 0.16,
    flaskCX, flaskBaseY, flaskW, shoulderY, neckW, neckTopY, acidY,
    tubePts, tubeCum, tubeLen, syX, syY, syLen, syH, standX,
    trayX, trayY, trayW, trayH, cells,
    thermX: bathX + bathW - 13, thermTop: bathY + 26, thermBot: bathY + bathH - 16,
  };
}

function pointOnTube(L: Layout, s: number): { x: number; y: number } {
  const d = clamp(s, 0, L.tubeLen);
  for (let i = 1; i < L.tubePts.length; i += 1) {
    if (L.tubeCum[i] >= d) {
      const f = (d - L.tubeCum[i - 1]) / Math.max(1e-6, L.tubeCum[i] - L.tubeCum[i - 1]);
      return {
        x: L.tubePts[i - 1].x + (L.tubePts[i].x - L.tubePts[i - 1].x) * f,
        y: L.tubePts[i - 1].y + (L.tubePts[i].y - L.tubePts[i - 1].y) * f,
      };
    }
  }
  return L.tubePts[L.tubePts.length - 1];
}

function makeSim(): Sim {
  return {
    L: makeLayout(800, 500),
    layoutW: 800, layoutH: 500,
    time: 0,
    phase: 'ready',
    chargeForm: null,
    c0: 1, temp: 20, vEnd: V_MARBLE,
    V: 0, pl: 0, rate: 0, watch: 0, acc: 0, uiAcc: 0,
    samples: [], bestChord: 0, prevT: 0, prevV: 0, tHalfLive: null, runId: 1,
    bubbles: [], tubeDots: [], pops: [], steam: [],
    spawnAcc: 0, tubeAcc: 0, steamAcc: 0,
    drag: { held: false, form: 'big', x: 0, y: 0, over: false },
    auto: null, hover: null,
    lastPopAt: 0, lastSlideAt: 0, lastSloshAt: 0, lastSwapWarnAt: 0,
  };
}

/** Interpolated time at which the curve crossed half the endpoint volume. */
function halfTimeFromSamples(samples: { t: number; v: number }[], vEnd: number): number {
  const half = vEnd / 2;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].v >= half) {
      const a = samples[i - 1];
      const b = samples[i];
      const f = (half - a.v) / Math.max(1e-6, b.v - a.v);
      return a.t + f * (b.t - a.t);
    }
  }
  return samples.length ? samples[samples.length - 1].t : 0;
}

export default function ReactionRateLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const simRef = useRef<Sim>(makeSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls -----------------------------------------------------
  const [conc, setConc] = useState(1);
  const [temp, setTemp] = useState(20);
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [everLoaded, setEverLoaded] = useState(false);
  const [chargeSel, setChargeSel] = useState<ChargeId | null>(null);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [conclusion, setConclusion] = useState<{ done: boolean; wrong: string | null }>({ done: false, wrong: null });
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    phase: 'ready', V: 0, pl: 0, rate: 0, watch: 0, form: null,
    liveOn: false, livePts: [], tHalfLive: null, bestChord: 0,
  });

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
    const s = simRef.current;
    setUi({
      phase: s.phase, V: s.V, pl: s.pl, rate: s.rate, watch: s.watch, form: s.chargeForm,
      liveOn: s.phase === 'running', livePts: s.samples.slice(),
      tHalfLive: s.tHalfLive, bestChord: s.bestChord,
    });
  }, []);

  // ---- charge loading (drag drop, button flight and keyboard all land here) --
  const commitCharge = useCallback((form: ChargeId) => {
    const s = simRef.current;
    if (s.phase === 'running') {
      // a run started while this charge was in flight — never swap mid-run
      if (performance.now() - s.lastSwapWarnAt > 1600) {
        s.lastSwapWarnAt = performance.now();
        labSound.warn();
        pushToast('warn', '⏳', 'Hold on — the charge is locked while a run is going. Let it finish or stop it first.');
      }
      return;
    }
    const changed = s.chargeForm !== form;
    s.chargeForm = form;
    setChargeSel(form);
    labSound.thunk(false);
    if (!everLoaded) setEverLoaded(true);
    if (changed) pushToast('good', '⬒', `${chargeLabel(form)} loaded — still 0.75 g of marble, so the endpoint will not change.`);
    syncUi();
  }, [everLoaded, pushToast, syncUi]);

  // ---- run lifecycle ---------------------------------------------------------
  const startRun = useCallback(() => {
    const s = simRef.current;
    if (s.phase === 'running') return;
    if (!s.chargeForm) {
      labSound.warn();
      pushToast('warn', '⚠', 'Load a marble charge first — drag one from the tray into the flask.');
      return;
    }
    if (s.auto) {
      pushToast('info', '⏳', 'The charge is still landing — start the run in a moment.');
      return;
    }
    s.phase = 'running';
    s.c0 = conc;
    s.temp = temp;
    s.vEnd = Math.min(V_MARBLE, 300 * conc); // 300·c₀ mL is where the acid runs out
    s.V = 0;
    s.pl = 0;
    s.watch = 0;
    s.samples = [{ t: 0, v: 0 }];
    s.bestChord = 0;
    s.prevT = 0;
    s.prevV = 0;
    s.tHalfLive = null;
    s.rate = K_RATE * conc * SA_MULT[s.chargeForm] * tempFactor(temp);
    s.bubbles.length = 0;
    s.tubeDots.length = 0;
    labSound.click();
    labSound.startLoop('pour'); // the fizz ambience under the whole run
    labSound.slosh(0.3);
    syncUi();
  }, [conc, temp, pushToast, syncUi]);

  const stopRun = useCallback(() => {
    const s = simRef.current;
    if (s.phase !== 'running') return;
    s.phase = 'ready';
    s.V = 0;
    s.rate = 0;
    s.watch = 0;
    s.samples = [];
    s.tHalfLive = null;
    s.bestChord = 0;
    s.bubbles.length = 0;
    s.tubeDots.length = 0;
    labSound.stopLoop();
    labSound.click();
    pushToast('info', '↺', 'Run discarded — only complete runs reach the table. The flask is recharged.');
    syncUi();
  }, [pushToast, syncUi]);

  const completeRun = useCallback(() => {
    const s = simRef.current;
    if (s.phase !== 'running') return;
    s.phase = 'ready';
    s.samples.push({ t: Math.round(s.watch * 100) / 100, v: Math.round(s.vEnd * 10) / 10 });
    const form = s.chargeForm!;
    const row: RunRow = {
      id: s.runId,
      form,
      c: s.c0,
      temp: s.temp,
      vEnd: Math.round(s.vEnd * 10) / 10,
      tHalf: Math.round(halfTimeFromSamples(s.samples, s.vEnd) * 10) / 10,
      rate: Math.round(s.bestChord * 10) / 10,
      limiting: s.vEnd < V_MARBLE - 0.5 ? 'acid' : 'marble',
      pts: s.samples.slice(),
    };
    s.runId += 1;
    s.V = 0;
    s.rate = 0;
    s.watch = 0;
    s.samples = [];
    s.tHalfLive = null;
    s.bestChord = 0;
    s.bubbles.length = 0;
    s.tubeDots.length = 0;
    labSound.stopLoop();
    const nextRows = [...rows, row].slice(-9);
    setRows(nextRows);

    // badges
    if (rows.length === 0) {
      labSound.milestone();
      earn('first-run');
    } else {
      labSound.click();
    }
    if (nextRows.length >= 3) earn('race-three');
    if (nextRows.length >= 5) earn('five-runs');
    for (let i = 0; i < nextRows.length; i += 1) {
      for (let j = 0; j < nextRows.length; j += 1) {
        const a = nextRows[i];
        const b = nextRows[j];
        if (a.form === b.form && a.temp === b.temp && (b.c === 2 * a.c || a.c === 2 * b.c)) {
          const fast = b.c > a.c ? b : a;
          const slow = b.c > a.c ? a : b;
          if (fast.tHalf <= slow.tHalf * HALF_BADGE_RATIO) earn('half-half');
        }
      }
    }
    const best = Math.max(...nextRows.map((r) => r.rate));
    if (nextRows.length >= 2 && nextRows.some((r) => r.form === 'powder' && r.rate === best)) earn('powder-frenzy');

    // ONE toast — a second setToast in the same tick would silently clobber this one
    pushToast(
      row.limiting === 'acid' ? 'info' : 'good',
      row.limiting === 'acid' ? 'ⱗ' : '⬒',
      `Banked run #${row.id} — ${chargeLabel(form)} · ${row.c.toFixed(1)} M · ${row.temp} °C · t½ ${row.tHalf.toFixed(1)} s · rate ${row.rate.toFixed(1)} mL/s`
        + (row.limiting === 'acid' ? `. Endpoint ${row.vEnd.toFixed(0)} mL, not 180 — at ${row.c.toFixed(1)} M the acid ran out before the marble did.` : ''),
    );
    syncUi();
  }, [rows, earn, pushToast, syncUi]);

  // ---- mentor completion flags ------------------------------------------------
  const baselineRun = rows.some((r) => r.c === 1 && r.temp === 20);
  const concRace = rows.some((a) => rows.some((b) => a.id !== b.id && a.form === b.form && a.temp === b.temp && a.c !== b.c));
  const tempRace = rows.some((a) => rows.some((b) => a.id !== b.id && a.form === b.form && a.c === b.c && a.temp !== b.temp));
  const powderRun = rows.some((r) => r.form === 'powder');
  const concluded = conclusion.done;
  const done = [everLoaded, baselineRun, concRace, tempRace, powderRun, concluded];

  useEffect(() => {
    const next = done.findIndex((d, i) => !d && i <= mentorIndex);
    if (next > mentorIndex) {
      setMentorIndex(next);
      labSound.step();
    } else if (done[done.length - 1] && mentorIndex < MENTOR_STEPS.length - 1) {
      setMentorIndex(MENTOR_STEPS.length - 1);
    }
  }, [done, mentorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge --------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'load': return { target: 'scene', gesture: 'drag', title: 'Drag a marble charge', body: 'Pick up the large chip, the medium chips or the powder spoon from the tray and drop it into the flask. Each drag replaces the charge.' };
      case 'baseline': return { target: 'run', gesture: 'press', title: 'Start the baseline', body: 'With 1.0 M acid and a 20 °C bath, press Start — or tap Space — and let the syringe fill.' };
      case 'conc': return { target: 'conc', gesture: 'tap', title: 'Change the concentration', body: 'Pick a new molarity with the same charge and temperature, then race another full run.' };
      case 'temp': return { target: 'temp', gesture: 'tap', title: 'Warm the bath', body: 'Switch the water bath to 40 or 60 °C at your original concentration and race again.' };
      case 'powder': return { target: 'charge', gesture: 'press', title: 'Load the powder', body: 'Press the powder button (or drag the spoon into the flask) and race the same conditions.' };
      case 'conclude': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'The overlay chart and the initial-rate column hold the answer — then close the conclusion.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- simulation step -------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = simRef.current;
    const cv = canvasRef.current;
    if (cv && (cv.clientWidth !== s.layoutW || cv.clientHeight !== s.layoutH)) {
      s.layoutW = cv.clientWidth;
      s.layoutH = cv.clientHeight;
      s.L = makeLayout(Math.max(1, cv.clientWidth), Math.max(1, cv.clientHeight));
    }
    const L = s.L;
    s.time += dt;
    const sdt = dt * speed;
    const now = performance.now();

    // button-loaded charge auto-flight
    if (s.auto) {
      s.auto.t += dt;
      const k = Math.min(1, s.auto.t / 0.55);
      const e = k * k * (3 - 2 * k);
      const tx = L.flaskCX;
      const ty = (L.neckTopY + L.flaskBaseY) / 2;
      s.drag.x = s.auto.fx + (tx - s.auto.fx) * e;
      s.drag.y = s.auto.fy + (ty - s.auto.fy) * e;
      s.drag.over = k > 0.4;
      if (k >= 1) {
        const form = s.auto.form;
        s.auto = null;
        s.drag.over = false;
        commitCharge(form);
      }
    }

    // steam over the warm bath
    if (temp > 20) {
      s.steamAcc += dt * (temp === 60 ? 6.5 : 2.4);
      while (s.steamAcc >= 1) {
        s.steamAcc -= 1;
        s.steam.push({
          x: L.bathX + 14 + Math.random() * (L.bathW - 28),
          y: L.waterY + 4,
          vy: 16 + Math.random() * 14,
          sway: Math.random() * 6.28,
          r: 2.5 + Math.random() * 2.5,
          a: 0.34,
        });
      }
    }
    for (let i = s.steam.length - 1; i >= 0; i -= 1) {
      const p = s.steam[i];
      p.y -= p.vy * dt;
      p.x += Math.sin(s.time * 2 + p.sway) * 6 * dt;
      p.r += 4 * dt;
      p.a -= 0.09 * dt;
      if (p.a <= 0.02) s.steam.splice(i, 1);
    }

    // ---- chemistry, integrated at a fixed sub-step --------------------------
    s.acc += sdt;
    const h = 1 / 240;
    while (s.acc >= h) {
      s.acc -= h;
      if (s.phase !== 'running') break;
      s.watch += h;
      const c = Math.max(0, s.c0 - s.V / 300);
      const m = Math.max(0, 1 - s.V / V_MARBLE);
      const rate = K_RATE * c * SA_MULT[s.chargeForm!] * tempFactor(s.temp) * Math.pow(m, 2 / 3);
      s.rate = rate;
      s.V = Math.min(s.vEnd, s.V + rate * h);
      const last = s.samples[s.samples.length - 1];
      if (last && (s.V - last.v >= 2 || s.watch - last.t >= 0.25)) {
        s.samples.push({ t: Math.round(s.watch * 100) / 100, v: Math.round(s.V * 10) / 10 });
        // the initial rate is measured on the RAW clock and volume — display
        // rounding must never inflate the number the table records
        const chord = (s.V - s.prevV) / Math.max(1 / 240, s.watch - s.prevT);
        if (chord > s.bestChord) s.bestChord = chord;
        s.prevT = s.watch;
        s.prevV = s.V;
      }
      if (s.tHalfLive === null && s.V >= s.vEnd / 2 && s.samples.length > 1) {
        s.tHalfLive = Math.round(halfTimeFromSamples(s.samples, s.vEnd) * 10) / 10;
      }
      if (s.V >= s.vEnd - 0.25 || rate < 0.15 || s.watch > 900) {
        completeRun();
        break;
      }
    }

    // ---- fizz visuals + sounds ------------------------------------------------
    if (s.phase === 'running') {
      const spawnRate = clamp(s.rate * 2.2, 0, 130);
      s.spawnAcc += spawnRate * sdt;
      while (s.spawnAcc >= 1) {
        s.spawnAcc -= 1;
        const wide = s.chargeForm === 'powder' ? 0.72 : 0.5;
        s.bubbles.push({
          x: L.flaskCX + (Math.random() - 0.5) * L.flaskW * wide,
          y: L.flaskBaseY - 6 - Math.random() * 8,
          vy: 42 + Math.random() * 34 + Math.min(70, s.rate * 0.5),
          wob: Math.random() * 6.28,
          r: (s.chargeForm === 'powder' ? 1.2 : 1.7) + Math.random() * 1.7,
        });
        if (s.bubbles.length > 170) s.bubbles.shift();
      }
      s.tubeAcc += clamp(s.rate * 0.25, 1.6, 26) * sdt;
      while (s.tubeAcc >= 1) {
        s.tubeAcc -= 1;
        s.tubeDots.push({ s: 0, r: 1.1 + Math.random() * 0.9 });
        if (s.tubeDots.length > 34) s.tubeDots.shift();
      }
      // bubble pops at the acid surface — the per-bubble pings, rate-scaled
      const gap = clamp(820 / (3 + s.rate * 0.8), 50, 820);
      if (now - s.lastPopAt > gap && s.bubbles.length > 2) {
        s.lastPopAt = now;
        labSound.ping(700 + Math.min(900, s.rate * 4) + Math.random() * 180, 0.012 + Math.min(0.05, s.rate * 0.00025));
      }
      if (s.rate > 25 && now - s.lastSloshAt > 520) {
        s.lastSloshAt = now;
        labSound.slosh(0.3 + Math.min(0.6, (s.rate - 25) / 120));
      }
      // plunger slide
      if (Math.abs(s.V - s.pl) > 0.6 && now - s.lastSlideAt > 340) {
        s.lastSlideAt = now;
        labSound.slide(0.14 + Math.min(0.5, s.rate * 0.003));
      }
    }

    for (let i = s.bubbles.length - 1; i >= 0; i -= 1) {
      const b = s.bubbles[i];
      b.y -= b.vy * sdt;
      b.x += Math.sin(s.time * 9 + b.wob) * 9 * sdt;
      if (b.y <= L.acidY + 2) {
        s.pops.push({ x: b.x, y: L.acidY + 2, t: 0 });
        if (s.pops.length > 26) s.pops.shift();
        s.bubbles.splice(i, 1);
      }
    }
    for (let i = s.tubeDots.length - 1; i >= 0; i -= 1) {
      const d = s.tubeDots[i];
      d.s += (60 + Math.min(500, s.rate * 2.5)) * sdt;
      if (d.s > L.tubeLen) s.tubeDots.splice(i, 1);
    }
    for (let i = s.pops.length - 1; i >= 0; i -= 1) {
      s.pops[i].t += dt;
      if (s.pops[i].t > 0.28) s.pops.splice(i, 1);
    }

    // plunger eases toward the true volume (smooth push-out and retract)
    s.pl += (s.V - s.pl) * Math.min(1, sdt * 7);
    if (Math.abs(s.V - s.pl) < 0.02) s.pl = s.V;

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, temp, completeRun, commitCharge, syncUi]);

  // ---- drawing -------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = simRef.current;
    const L = s.L;
    const t = s.time;
    const running = s.phase === 'running';

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench top
    ctx.fillStyle = '#d8dee5';
    ctx.fillRect(0, L.floorY, w, h - L.floorY);
    ctx.strokeStyle = '#c3ccd5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, L.floorY);
    ctx.lineTo(w, L.floorY);
    ctx.stroke();

    // ---- water bath on its hotplate ----
    if (temp >= 40) {
      const glow = ctx.createRadialGradient(L.flaskCX, L.floorY, 8, L.flaskCX, L.floorY, L.bathW * 0.7);
      const a = temp === 60 ? 0.3 + 0.08 * Math.sin(t * 2.6) : 0.16;
      glow.addColorStop(0, `rgba(249,115,22,${a})`);
      glow.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(L.bathX - 20, L.floorY - 60, L.bathW + 40, 70);
    }
    // hotplate slab
    ctx.fillStyle = '#3a4552';
    roundRect(ctx, L.bathX - 6, L.floorY - 12, L.bathW + 12, 12, 4);
    ctx.fill();
    ctx.fillStyle = temp >= 40 ? '#f97316' : '#6b7684';
    ctx.beginPath();
    ctx.arc(L.bathX + 12, L.floorY - 6, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // basin (back wall + water)
    ctx.fillStyle = 'rgba(214,232,240,0.5)';
    roundRect(ctx, L.bathX, L.bathY, L.bathW, L.bathH, 10);
    ctx.fill();
    const water = ctx.createLinearGradient(0, L.waterY, 0, L.bathY + L.bathH);
    water.addColorStop(0, 'rgba(180,216,231,0.85)');
    water.addColorStop(1, 'rgba(140,190,214,0.9)');
    ctx.fillStyle = water;
    roundRect(ctx, L.bathX + 3, L.waterY, L.bathW - 6, L.bathY + L.bathH - L.waterY - 4, 8);
    ctx.fill();
    // rippling surface
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 2; k += 1) {
      ctx.beginPath();
      for (let x = L.bathX + 8; x <= L.bathX + L.bathW - 8; x += 6) {
        const y = L.waterY + 2 + k * 5 + Math.sin(x * 0.09 + t * (1.5 + k)) * 1.6;
        if (x === L.bathX + 8) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ---- thermometer in the bath (no numbers — the red column is the reading) ----
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    roundRect(ctx, L.thermX - 4, L.thermTop, 8, L.thermBot - L.thermTop, 4);
    ctx.fill();
    ctx.stroke();
    const frac = clamp((temp - 10) / 55, 0.05, 1);
    const colTop = L.thermBot - frac * (L.thermBot - L.thermTop);
    ctx.fillStyle = '#e0512f';
    roundRect(ctx, L.thermX - 1.8, colTop, 3.6, L.thermBot - colTop, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(L.thermX, L.thermBot + 3, 5, 0, Math.PI * 2);
    ctx.fill();

    // ---- conical flask with its charge ----
    const shake = running && s.rate > 22 ? Math.min(1, (s.rate - 22) / 90) : 0;
    ctx.save();
    if (shake > 0) ctx.translate(Math.sin(t * 55) * 1.4 * shake, Math.cos(t * 47) * 1.1 * shake);
    const fw2 = L.flaskW / 2;
    const flaskPath = () => {
      ctx.beginPath();
      ctx.moveTo(L.flaskCX - L.neckW / 2, L.neckTopY);
      ctx.lineTo(L.flaskCX - L.neckW / 2, L.shoulderY);
      ctx.lineTo(L.flaskCX - fw2, L.flaskBaseY - 14);
      ctx.quadraticCurveTo(L.flaskCX - fw2, L.flaskBaseY, L.flaskCX - fw2 + 10, L.flaskBaseY);
      ctx.lineTo(L.flaskCX + fw2 - 10, L.flaskBaseY);
      ctx.quadraticCurveTo(L.flaskCX + fw2, L.flaskBaseY, L.flaskCX + fw2, L.flaskBaseY - 14);
      ctx.lineTo(L.flaskCX + L.neckW / 2, L.shoulderY);
      ctx.lineTo(L.flaskCX + L.neckW / 2, L.neckTopY);
      ctx.closePath();
    };
    flaskPath();
    ctx.fillStyle = 'rgba(240,246,249,0.55)';
    ctx.fill();
    ctx.save();
    flaskPath();
    ctx.clip();
    // acid
    const acid = ctx.createLinearGradient(0, L.acidY, 0, L.flaskBaseY);
    acid.addColorStop(0, 'rgba(205,229,205,0.95)');
    acid.addColorStop(1, 'rgba(178,214,186,0.95)');
    ctx.fillStyle = acid;
    ctx.fillRect(L.flaskCX - fw2 - 4, L.acidY, L.flaskW + 8, L.flaskBaseY - L.acidY + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(L.flaskCX - fw2, L.acidY);
    ctx.lineTo(L.flaskCX + fw2, L.acidY);
    ctx.stroke();
    // marble charge
    const mFrac = Math.max(0, 1 - s.V / V_MARBLE);
    if (s.chargeForm) {
      if (s.chargeForm === 'powder') {
        drawPowderHeap(ctx, L.flaskCX, L.flaskBaseY, L.flaskW * 0.62, 15 * (0.35 + 0.65 * Math.cbrt(Math.max(mFrac, 0.06))));
      } else {
        const scale = 0.3 + 0.7 * Math.cbrt(Math.max(mFrac, 0.05));
        if (s.chargeForm === 'big') {
          drawChipShape(ctx, L.flaskCX, L.flaskBaseY - 11, 15 * scale, 0.3);
        } else {
          drawChipShape(ctx, L.flaskCX - 13 * scale, L.flaskBaseY - 8, 7.5 * scale, 1.1);
          drawChipShape(ctx, L.flaskCX + 2 * scale, L.flaskBaseY - 13, 7.5 * scale, 2.6);
          drawChipShape(ctx, L.flaskCX + 14 * scale, L.flaskBaseY - 8, 7.5 * scale, 4.4);
        }
      }
    }
    // froth at the surface during a frenzy
    if (running && s.rate > 22) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let k = 0; k < 10; k += 1) {
        const x = L.flaskCX - fw2 * 0.62 + (k / 9) * L.flaskW * 1.24 + Math.sin(t * 9 + k * 1.7) * 2;
        ctx.beginPath();
        ctx.ellipse(x, L.acidY + 1, 4.2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // bubbles
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const b of s.bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // pop flashes
    for (const p of s.pops) {
      const k = p.t / 0.28;
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - k)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + k * 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // glass outline + highlight
    flaskPath();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(L.flaskCX - fw2 * 0.55, L.flaskBaseY - 26);
    ctx.lineTo(L.flaskCX - L.neckW * 0.34, L.shoulderY + 8);
    ctx.stroke();
    ctx.restore();

    // stopper
    ctx.fillStyle = '#4a5568';
    roundRect(ctx, L.flaskCX - L.neckW / 2 - 3, L.neckTopY - 10, L.neckW + 6, 13, 4);
    ctx.fill();

    // ---- delivery tube ----
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(141,168,185,0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(L.tubePts[0].x, L.tubePts[0].y);
    for (let i = 1; i < L.tubePts.length; i += 1) ctx.lineTo(L.tubePts[i].x, L.tubePts[i].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(233,242,248,0.95)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(L.tubePts[0].x, L.tubePts[0].y);
    for (let i = 1; i < L.tubePts.length; i += 1) ctx.lineTo(L.tubePts[i].x, L.tubePts[i].y);
    ctx.stroke();
    // bubbles racing along the tube
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (const d of s.tubeDots) {
      const p = pointOnTube(L, d.s);
      ctx.beginPath();
      ctx.arc(p.x, p.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- gas syringe on its stand ----
    // stand rod + base (behind the barrel)
    ctx.strokeStyle = '#55606d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(L.standX, L.floorY - 4);
    ctx.lineTo(L.standX, L.syY);
    ctx.stroke();
    ctx.fillStyle = '#414c59';
    roundRect(ctx, L.standX - 26, L.floorY - 7, 52, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#d9a441';
    roundRect(ctx, L.standX - 11, L.syY - L.syH / 2 - 7, 22, L.syH + 14, 5);
    ctx.fill();

    // barrel
    const innerX0 = L.syX + 7;
    const innerLen = L.syLen - 14;
    ctx.fillStyle = 'rgba(238,246,250,0.6)';
    roundRect(ctx, L.syX, L.syY - L.syH / 2, L.syLen, L.syH, 8);
    ctx.fill();
    ctx.fillStyle = '#f6fafc';
    roundRect(ctx, innerX0, L.syY - L.syH / 2 + 5, innerLen, L.syH - 10, 4);
    ctx.fill();
    // gas fog ahead of the plunger
    const vFrac = clamp(s.pl / SYRINGE_CAP, 0, 1);
    const sealX = innerX0 + 5 + vFrac * (innerLen - 16);
    if (s.pl > 1) {
      ctx.fillStyle = `rgba(157,203,227,${Math.min(0.3, (s.pl / 60) * 0.3)})`;
      ctx.fillRect(innerX0 + 1, L.syY - L.syH / 2 + 5, Math.max(0, sealX - innerX0 - 1), L.syH - 10);
    }
    // graduation ticks (marks only — readings live in the sidebar)
    ctx.strokeStyle = '#8aa0b0';
    ctx.lineWidth = 1.2;
    for (let i = 0; i <= 10; i += 1) {
      const x = innerX0 + (i / 10) * innerLen;
      ctx.beginPath();
      ctx.moveTo(x, L.syY - L.syH / 2 + 4);
      ctx.lineTo(x, L.syY - L.syH / 2 + 4 + (i % 5 === 0 ? 9 : 5));
      ctx.stroke();
    }
    // plunger seal + rod + handle
    ctx.fillStyle = '#414c59';
    roundRect(ctx, sealX, L.syY - L.syH / 2 + 4, 9, L.syH - 8, 3);
    ctx.fill();
    const rodEnd = Math.min(w - 6, L.syX + L.syLen + 18 + vFrac * 30);
    ctx.strokeStyle = '#b9c3cd';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sealX + 8, L.syY);
    ctx.lineTo(rodEnd, L.syY);
    ctx.stroke();
    ctx.fillStyle = '#6b7684';
    roundRect(ctx, rodEnd - 3, L.syY - 11, 6, 22, 3);
    ctx.fill();
    // inlet nub joining tube to barrel
    ctx.fillStyle = '#8da8b9';
    roundRect(ctx, L.syX - 7, L.syY - 5, 9, 10, 2);
    ctx.fill();
    // barrel outline on top of everything
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    roundRect(ctx, L.syX, L.syY - L.syH / 2, L.syLen, L.syH, 8);
    ctx.stroke();

    // ---- steam ----
    for (const p of s.steam) {
      ctx.fillStyle = `rgba(255,255,255,${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- bath front wall (glass sheen over the flask) ----
    ctx.fillStyle = 'rgba(163,205,222,0.2)';
    roundRect(ctx, L.bathX + 3, L.waterY, L.bathW - 6, L.bathY + L.bathH - L.waterY - 4, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(141,168,185,0.8)';
    ctx.lineWidth = 2;
    roundRect(ctx, L.bathX, L.bathY, L.bathW, L.bathH, 10);
    ctx.stroke();

    // ---- marble tray (wall shelf, top left) ----
    ctx.fillStyle = '#d9c9ae';
    roundRect(ctx, L.trayX, L.trayY + L.trayH - 6, L.trayW, 10, 4);
    ctx.fill();
    ctx.strokeStyle = '#b09a72';
    ctx.lineWidth = 1.5;
    roundRect(ctx, L.trayX, L.trayY + L.trayH - 6, L.trayW, 10, 4);
    ctx.stroke();
    const pulse = !everLoaded && !running ? 0.5 + 0.5 * Math.sin(t * 2.6) : 0;
    CHARGES.forEach((ch, i) => {
      const cell = L.cells[i];
      const active = s.chargeForm === ch.id;
      const hovered = s.hover === ch.id && !s.drag.held && !running;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 7);
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = active ? 2 : 1.5;
      ctx.strokeStyle = active ? '#f0c9a8' : hovered ? 'rgba(249,115,22,0.8)' : `rgba(135,151,164,${0.55 + pulse * 0.4})`;
      roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
      if (ch.id === 'big') drawChipShape(ctx, cx, cy + 2, 12, 0.4);
      else if (ch.id === 'medium') {
        drawChipShape(ctx, cx - 10, cy + 4, 6, 1.2);
        drawChipShape(ctx, cx + 1, cy - 3, 6, 2.8);
        drawChipShape(ctx, cx + 10, cy + 4, 6, 4.6);
      } else {
        // a small spoon with a heap of powder
        ctx.strokeStyle = '#8da8b9';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy - 7);
        ctx.lineTo(cx - 3, cy + 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.ellipse(cx + 4, cy + 4, 9, 5.5, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8da8b9';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = '#cdd4dc';
        for (const sp of SPECKS.slice(0, 34)) {
          ctx.beginPath();
          ctx.arc(cx + 4 + sp.dx * 7, cy + 3 - sp.dy * 5, sp.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // ---- dragged charge ghost + drop zone ----
    const showGhost = s.drag.held || s.auto !== null;
    if (showGhost) {
      const dzR = L.flaskW * 0.95 + 18;
      const dzY = (L.neckTopY + L.flaskBaseY) / 2;
      ctx.setLineDash(s.drag.over ? [] : [6, 6]);
      ctx.strokeStyle = s.drag.over ? '#f97316' : 'rgba(249,115,22,0.55)';
      ctx.lineWidth = s.drag.over ? 2.5 : 1.8;
      if (s.drag.over) {
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 12;
      }
      ctx.beginPath();
      ctx.arc(L.flaskCX, dzY, dzR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      // the ghost item itself
      ctx.save();
      ctx.translate(s.drag.x, s.drag.y);
      ctx.rotate(Math.sin(t * 6) * 0.1);
      ctx.scale(1.18, 1.18);
      ctx.shadowColor = 'rgba(23,35,52,0.3)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 5;
      if (s.drag.form === 'big') drawChipShape(ctx, 0, 0, 13, 0.5);
      else if (s.drag.form === 'medium') {
        drawChipShape(ctx, -8, 3, 6, 1.3);
        drawChipShape(ctx, 1, -3, 6, 2.9);
        drawChipShape(ctx, 9, 3, 6, 4.7);
      } else {
        ctx.fillStyle = '#cdd4dc';
        for (const sp of SPECKS.slice(0, 40)) {
          ctx.beginPath();
          ctx.arc(sp.dx * 8, -sp.dy * 7 + 3, sp.r + 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }, [temp, everLoaded]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction -------------------------------------------------------
  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    const canvas = canvasRef.current;
    if (!p || !canvas) return;
    const s = simRef.current;
    const idx = CHARGES.findIndex((_, i) => {
      const cell = s.L.cells[i];
      return p.x > cell.x - 10 && p.x < cell.x + cell.w + 10 && p.y > cell.y - 10 && p.y < cell.y + cell.h + 10;
    });
    if (idx >= 0) {
      if (s.phase === 'running') {
        if (performance.now() - s.lastSwapWarnAt > 1600) {
          s.lastSwapWarnAt = performance.now();
          labSound.warn();
          pushToast('warn', '⏳', 'Hold on — the charge is locked while a run is going. Stop it or let it finish first.');
        }
        notePointer(false);
        return;
      }
      s.drag.held = true;
      s.drag.form = CHARGES[idx].id;
      s.drag.x = p.x;
      s.drag.y = p.y;
      s.drag.over = false;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.glassClink(true);
      notePointer(true);
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = simRef.current;
    const canvas = canvasRef.current;
    const now = performance.now();
    if (s.drag.held) {
      s.drag.x = clamp(p.x, 16, s.L.w - 16);
      s.drag.y = clamp(p.y, 16, s.L.h - 16);
      const dzY = (s.L.neckTopY + s.L.flaskBaseY) / 2;
      s.drag.over = Math.hypot(s.drag.x - s.L.flaskCX, s.drag.y - dzY) < s.L.flaskW * 0.95 + 18;
      if (now - s.lastSlideAt > 150) {
        s.lastSlideAt = now;
        labSound.slide(0.2);
      }
    } else {
      const idx = CHARGES.findIndex((_, i) => {
        const cell = s.L.cells[i];
        return p.x > cell.x - 10 && p.x < cell.x + cell.w + 10 && p.y > cell.y - 10 && p.y < cell.y + cell.h + 10;
      });
      s.hover = idx >= 0 ? CHARGES[idx].id : null;
      if (canvas) {
        const cursor = idx >= 0 && s.phase !== 'running' ? 'grab' : 'default';
        if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = simRef.current;
    if (!s.drag.held) return;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    s.drag.held = false;
    if (s.drag.over) {
      s.drag.over = false;
      commitCharge(s.drag.form);
    } else {
      labSound.slide(0.3);
      notePointer(false);
    }
  };

  // ---- controls --------------------------------------------------------------
  const flightFrom = (form: ChargeId) => {
    const s = simRef.current;
    const idx = CHARGES.findIndex((c) => c.id === form);
    const cell = s.L.cells[idx];
    return { fx: cell.x + cell.w / 2, fy: cell.y + cell.h / 2 };
  };

  const loadCharge = (form: ChargeId) => {
    const s = simRef.current;
    if (s.phase === 'running' || s.auto) return;
    const { fx, fy } = flightFrom(form);
    s.auto = { t: 0, form, fx, fy };
    s.drag.form = form;
    s.drag.held = false;
    s.drag.over = false;
    labSound.glassClink(true);
    notePointer(true);
  };

  const toggleRun = () => {
    const s = simRef.current;
    if (s.phase === 'running') {
      stopRun();
      notePointer(true);
    } else {
      startRun();
      notePointer(true);
    }
  };

  const answerConclusion = (pick: 'conc' | 'temp' | 'sa') => {
    if (pick === 'sa') {
      setConclusion({ done: true, wrong: null });
      labSound.milestone();
      pushToast('good', '🏁', 'Concluded — surface area won it. The powder gave the acid 12× the surface to attack.');
    } else {
      labSound.warn();
      const hint = pick === 'conc'
        ? 'Concentration helped — doubling it doubled the rate — but compare the biggest jumps in your initial-rate column.'
        : 'Temperature helped too — ×1.7 per 10 °C, up to ×8.4 across the bath — but one factor still multiplied the rate harder. Compare the biggest jumps in your initial-rate column.';
      setConclusion({ done: false, wrong: hint });
    }
    notePointer(true);
  };

  const resetAll = () => {
    const s = simRef.current;
    s.phase = 'ready';
    s.chargeForm = null;
    s.c0 = 1;
    s.temp = 20;
    s.vEnd = V_MARBLE;
    s.V = 0;
    s.pl = 0;
    s.rate = 0;
    s.watch = 0;
    s.acc = 0;
    s.samples = [];
    s.bestChord = 0;
    s.prevT = 0;
    s.prevV = 0;
    s.tHalfLive = null;
    s.runId = 1;
    s.bubbles.length = 0;
    s.tubeDots.length = 0;
    s.pops.length = 0;
    s.steam.length = 0;
    s.drag.held = false;
    s.auto = null;
    s.hover = null;
    labSound.stopLoop();
    setRows([]);
    setConc(1);
    setTemp(20);
    setChargeSel(null);
    setEverLoaded(false);
    setMentorIndex(0);
    setMentorAcked(false);
    setConclusion({ done: false, wrong: null });
    setBadges([]);
    syncUi();
  };

  // ---- analysis -----------------------------------------------------------------
  const fitGroup = useMemo(() => {
    // the rate-vs-concentration line needs like-with-like points: pick the
    // (charge, temperature) group that spans the most concentrations
    const map = new Map<string, RunRow[]>();
    rows.forEach((r) => {
      const key = `${r.form}|${r.temp}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    });
    let bestList: RunRow[] = [];
    let bestDistinct = 0;
    map.forEach((list) => {
      const distinct = new Set(list.map((r) => r.c)).size;
      if (distinct > bestDistinct || (distinct === bestDistinct && list.length > bestList.length)) {
        bestList = list;
        bestDistinct = distinct;
      }
    });
    if (bestDistinct < 2) return { form: 'big' as ChargeId, temp: 20, points: [] as { x: number; y: number }[] };
    return {
      form: bestList[0].form,
      temp: bestList[0].temp,
      points: bestList.map((r) => ({ x: r.c, y: r.rate })),
    };
  }, [rows]);

  const rateFit = useMemo(() => (fitGroup.points.length >= 2 ? linearFit(fitGroup.points) : null), [fitGroup]);

  const conclusionGate = rows.length >= 4
    && rows.some((r) => r.form === 'powder')
    && new Set(rows.map((r) => r.temp)).size >= 2
    && new Set(rows.map((r) => r.c)).size >= 2;

  // ---- coach ---------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.phase === 'running') {
      if (ui.rate > 25) return { tone: 'good', line: `A proper frenzy — ${ui.rate.toFixed(0)} mL/s. Powder gives the acid twelve times the surface to attack.` };
      return { tone: 'info', line: `${ui.V.toFixed(0)} mL of ${Math.round(simRef.current.vEnd)} mL · ${ui.rate.toFixed(1)} mL/s · t½ ${ui.tHalfLive ? `${ui.tHalfLive.toFixed(1)} s` : 'pending'}. The curve is steepest right now — that steep start is the initial rate.` };
    }
    if (!everLoaded) return { tone: 'info', line: 'Drag a marble charge from the tray into the flask — one large chip, the medium chips, or the powder spoon. All three weigh the same 0.75 g.' };
    if (rows.length === 0) return { tone: 'info', line: `Conditions: ${conc.toFixed(1)} M acid · ${temp} °C bath · ${ui.form ? chargeLabel(ui.form) : 'no charge'}. Press Start — or Space — and the syringe does the measuring.` };
    if (conclusionGate && !conclusion.done) return { tone: 'good', line: 'You have raced every factor — open Observations and answer which one sped the reaction up most.' };
    const last = rows[rows.length - 1];
    return { tone: 'good', line: `Banked: t½ ${last.tHalf.toFixed(1)} s at ${last.c.toFixed(1)} M · ${last.temp} °C · ${chargeLabel(last.form)}. Change one factor and race it again.` };
  }, [ui, everLoaded, rows, conc, temp, conclusionGate, conclusion.done]);

  // ---- status --------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Experiment complete'
    : ui.phase === 'running' ? 'Run in progress'
    : !everLoaded ? 'Load a marble charge'
    : rows.length ? 'Run banked — race another'
    : 'Ready to run';
  const statusTone: 'ready' | 'active' | 'complete' = complete ? 'complete' : ui.phase === 'running' ? 'active' : 'ready';

  const massLost = ui.V * CO2_G_PER_ML;
  const acidFrac = Math.max(0, 1 - ui.V / (300 * (ui.phase === 'running' ? simRef.current.c0 : conc)));
  const marbleG = Math.max(0, CHARGE_G * (1 - ui.V / V_MARBLE));
  const runEnd = ui.phase === 'running' ? Math.round(simRef.current.vEnd) : rows.length ? Math.round(rows[rows.length - 1].vEnd) : V_MARBLE;
  const startLabel = ui.phase === 'running' ? 'Stop & discard the run' : everLoaded ? 'Start the run' : 'Load a marble charge first';

  // ---- render ---------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Comparative rate bench · gas syringe"
      legend={[
        { color: '#b9c2cb', label: 'Marble (0.75 g per charge)' },
        { color: '#bcd9c2', label: 'Dilute HCl (25 mL)' },
        { color: '#a9c6d8', label: 'Water bath' },
        { color: '#8da8b9', label: 'Gas syringe (200 mL)' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start the experiment', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <label>Playback
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Playback speed">
            <option value={1}>1× real time</option>
            <option value={2}>2× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Rate of reaction bench — drag a marble charge from the tray into the flask; the gas syringe measures the carbon dioxide"
          onKeyDown={(e) => {
            if (e.repeat) return;
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleRun(); }
            if (e.key === '1' && simRef.current.phase !== 'running') loadCharge('big');
            if (e.key === '2' && simRef.current.phase !== 'running') loadCharge('medium');
            if (e.key === '3' && simRef.current.phase !== 'running') loadCharge('powder');
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="rate-layout">
            <div className="rate-actions">
              <button
                className="action-button"
                type="button"
                data-nudge="run"
                onClick={toggleRun}
                disabled={!everLoaded && ui.phase !== 'running'}
              >
                <span className="dispense-icon" aria-hidden="true">{ui.phase === 'running' ? '⏸' : '▶'}</span>
                <span>{startLabel}</span>
                <small>{ui.phase === 'running' ? 'the run will not be recorded' : 'or press Space'}</small>
              </button>
              <div className="rate-charge-row" role="group" aria-label="Marble charge" data-nudge="charge">
                {CHARGES.map((ch, i) => (
                  <button
                    key={ch.id}
                    type="button"
                    className={`rate-charge-btn${chargeSel === ch.id ? ' active' : ''}`}
                    aria-pressed={chargeSel === ch.id}
                    disabled={ui.phase === 'running'}
                    onClick={() => loadCharge(ch.id)}
                    title={`${ch.label} — 0.75 g, ×${ch.mult} surface`}
                  >
                    <span aria-hidden="true">{i === 0 ? '⬤' : i === 1 ? '● ● ●' : '⁂'}</span>
                    <small>{ch.short}</small>
                  </button>
                ))}
              </div>
              <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Every charge is 0.75 g of marble — only the surface area differs (×1, ×3, ×12). Each run recharges the flask with fresh acid, so the factor you change is the only difference.</p></div>
            </div>
            <div className="rate-conds">
              <div className="rate-seg-label"><span>Acid concentration</span><strong>{conc.toFixed(1)} M · 25 mL</strong></div>
              <div className="rate-seg-row four" role="group" aria-label="Acid concentration in moles per litre" data-nudge="conc">
                {CONC_OPTIONS.map((o) => (
                  <button key={o} type="button" className={`rate-seg-btn${conc === o ? ' active' : ''}`} aria-pressed={conc === o} disabled={ui.phase === 'running'} onClick={() => { setConc(o); labSound.tick(); }}>
                    {o.toFixed(1)} M
                  </button>
                ))}
              </div>
              <div className="rate-seg-label"><span>Water-bath temperature</span><strong>{temp} °C</strong></div>
              <div className="rate-seg-row three" role="group" aria-label="Water bath temperature in degrees Celsius" data-nudge="temp">
                {TEMP_OPTIONS.map((o) => (
                  <button key={o} type="button" className={`rate-seg-btn${temp === o ? ' active' : ''}`} aria-pressed={temp === o} disabled={ui.phase === 'running'} onClick={() => { setTemp(o); labSound.tick(); }}>
                    {o} °C
                  </button>
                ))}
              </div>
              <div className="rate-clock">
                <span>RUN CLOCK · SIMULATED TIME</span>
                <strong className={ui.phase === 'running' ? 'running' : ''}>{fmtClock(ui.watch)}</strong>
                <div className="rate-progress"><span style={{ width: `${Math.min(100, (ui.V / runEnd) * 100)}%` }} /></div>
                <div className="rate-progress-scale"><span>0 mL</span><span>{runEnd} mL endpoint</span></div>
              </div>
            </div>
          </div>
        </div>
      }
      sidebarTop={
        <>
          <section className="instrument-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Gas syringe readings</h2></div><span className="instrument-live">LIVE</span></div>
            <div className="reading-main">
              <span>Volume of CO₂ collected (live)</span>
              <strong>{ui.V.toFixed(1)} <small>mL</small></strong>
              <div className="reading-track"><span style={{ width: `${Math.min(100, (ui.V / SYRINGE_CAP) * 100)}%` }} /></div>
              <div className="reading-scale"><span>empty syringe</span><span>200 mL</span></div>
            </div>
            <div className="reading-grid">
              <div><span>Mass lost</span><strong>{massLost.toFixed(2)} <small>g</small></strong></div>
              <div><span>Rate now</span><strong>{ui.phase === 'running' ? `${ui.rate.toFixed(1)} mL/s` : '—'}</strong></div>
              <div><span>Marble left</span><strong>{ui.form ? `${marbleG.toFixed(2)} g` : '—'}</strong></div>
              <div><span>Acid left</span><strong>{ui.form ? `${Math.round(acidFrac * 100)} %` : '—'}</strong></div>
              <div><span>Run clock</span><strong>{fmtClock(ui.watch)}</strong></div>
              <div><span>t½ (live)</span><strong>{ui.tHalfLive ? `${ui.tHalfLive.toFixed(1)} s` : '—'}</strong></div>
              <div><span>Charge</span><strong>{ui.form ? chargeLabel(ui.form) : 'none'}</strong></div>
              <div><span>Bath</span><strong>{temp} °C</strong></div>
            </div>
            <div className="g-readout">
              <span>Initial rate of this run</span>
              <strong>{ui.phase === 'running' ? <>{ui.bestChord.toFixed(1)} <small>mL/s</small></> : rows.length ? <>{rows[rows.length - 1].rate.toFixed(1)} <small>mL/s</small></> : <small style={{ fontSize: 13 }}>measured from the steepest start of the curve</small>}</strong>
              <p>From the steepest chord of the volume–time curve · mass lost = volume × 44/24,000 g (molar volume 24,000 mL/mol at room conditions).</p>
            </div>
          </section>
          <section className="instrument-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE TRACE</span><h2>Gas volume vs time</h2></div><span className="instrument-live">LIVE</span></div>
            {(rows.length > 0 || ui.liveOn) ? (
              <RateChart runs={rows} live={ui.liveOn ? ui.livePts : NO_LIVE} liveOn={ui.liveOn} height={185} />
            ) : (
              <p className="observation-note">Press Start and this run&apos;s curve draws here as the syringe fills — earlier races stay behind it, faded blue, ready to be outrun.</p>
            )}
          </section>
        </>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag a marble charge into the conical flask — one large chip, three medium chips, or the powder spoon. Every charge is 0.75 g; only the surface area differs.</li>
              <li>Set the acid concentration and the water-bath temperature, then press Start (or Space). Bubbles stream, the plunger pushes out, the curve draws.</li>
              <li>The run banks itself when the fizz dies away — endpoint, t½ and initial rate land in the table.</li>
              <li>Change ONE factor — concentration, temperature, or the marble&apos;s form — and race another full run.</li>
              <li>Open Observations: the overlay chart races every curve you have banked.</li>
              <li>Answer the conclusion — which factor sped the reaction up most?</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Each run recharges the flask with 25 mL of fresh acid and a fresh 0.75 g charge, so the only difference between runs is the factor you changed. The clock counts simulated seconds — faster playback never bends your data. Keys 1–3 load charges; Space starts and stops.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Run a complete race — the endpoint volume, the half-time and the initial rate of every run bank here automatically.</p>
            ) : (
              <table className="trial-table rate-obs-table">
                <thead><tr><th>#</th><th>Charge</th><th>Acid (M)</th><th>Bath (°C)</th><th>V end (mL)</th><th>t½ (s)</th><th>Rate (mL/s)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{chargeLabel(r.form)}</td>
                      <td>{r.c.toFixed(1)}</td>
                      <td>{r.temp}</td>
                      <td>{r.vEnd.toFixed(0)}{r.limiting === 'acid' ? ' *' : ''}</td>
                      <td>{r.tHalf.toFixed(1)}</td>
                      <td>{r.rate.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.some((r) => r.limiting === 'acid') && (
              <p className="observation-note">* acid-limited: at 0.5 M the 25 mL of acid runs out before the 0.75 g of marble does, so the endpoint drops to 150 mL. Every marble-limited run ends at 180 mL — rate factors never change the endpoint, only the limiting reagent does. Mass lost at the endpoint: {(V_MARBLE * CO2_G_PER_ML).toFixed(2)} g (0.18 g per 100 mL of CO₂).</p>
            )}
            {(rows.length > 0 || ui.liveOn) && (
              <>
                <h3 style={{ marginTop: 16 }}>Gas volume vs time — every run</h3>
                <RateChart runs={rows} live={ui.liveOn ? ui.livePts : NO_LIVE} liveOn={ui.liveOn} />
                <p className="observation-note">The latest run draws bold orange; earlier races fade to blue. Steeper start = faster reaction; the flattening tail is the acid and the marble surface dying away together.</p>
              </>
            )}
            {fitGroup.points.length >= 2 ? (
              <>
                <h3 style={{ marginTop: 16 }}>Initial rate vs acid concentration</h3>
                <Plot
                  points={fitGroup.points}
                  xLabel="acid concentration (M)"
                  yLabel="initial rate (mL/s)"
                  fitLine
                  height={200}
                />
                {rateFit && (
                  <p className="observation-note">
                    {chargeLabel(fitGroup.form)} at {fitGroup.temp} °C: rate ≈ {rateFit.m.toFixed(1)} mL/s per mole per litre (R² = {rateFit.r2.toFixed(3)}).
                    Double the concentration and you double the rate — the points climb a straight line.
                  </p>
                )}
              </>
            ) : rows.length >= 2 ? (
              <p className="observation-note">Two runs agree — now keep the charge and temperature fixed, change only the concentration, and the rate-versus-concentration line unlocks.</p>
            ) : null}
            {conclusionGate ? (
              <div className="rate-conclusion">
                <h3>Which factor sped it up most?</h3>
                <p>You have raced concentration, temperature and surface area. Compare the initial-rate column like with like, then call it:</p>
                <div className="rate-conclusion-row">
                  <button type="button" disabled={conclusion.done} onClick={() => answerConclusion('conc')}>Concentration</button>
                  <button type="button" disabled={conclusion.done} onClick={() => answerConclusion('temp')}>Temperature</button>
                  <button type="button" disabled={conclusion.done} onClick={() => answerConclusion('sa')}>Surface area</button>
                </div>
                {conclusion.wrong && <p className="rate-conclusion-wrong">{conclusion.wrong}</p>}
                {conclusion.done && (
                  <p className="rate-conclusion-right">
                    Surface area — the powder&apos;s ×12 multiplier beat temperature (×1.7 per 10 °C, so ×8.4 across the 40 °C span) and concentration (×4 across the whole 0.5–2.0 M range). Your own initial-rate column shows it: nothing else multiplied the rate like powder did.
                  </p>
                )}
              </div>
            ) : (
              <p className="observation-note">Bank at least four runs that vary each factor — two concentrations, two temperatures and the powder — to unlock the conclusion.</p>
            )}
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Marble is calcium carbonate, and hydrochloric acid attacks the carbonate ion, releasing carbon dioxide as a stream of bubbles:</p>
            <div className="equation">CaCO₃ (s) + 2HCl (aq) → CaCl₂ (aq) + H₂O (l) + CO₂ (g)↑</div>
            <p>The gas syringe collects the CO₂, so the volume you read is a direct count of reaction events. This model treats the reaction as approximately first order in the acid:</p>
            <div className="equation">rate = k · [HCl]</div>
            <p>Doubling the molarity doubles the fizz. The temperature factor is Q₁₀-style: about ×1.7 per extra 10 °C of bath (20 °C → ×1, 40 °C → ×2.9, 60 °C → ×8.4) — more collisions happen per second, and a larger share of them carries enough energy to react. Surface area multiplies too: the large chip counts ×1, the three medium chips ×3, and the powder ×12 — the same 0.75 g offers ever more faces to the acid.</p>
            <p>Why does the curve flatten? Both reactants fade as the run goes on: the acid is consumed two moles per mole of gas, and the shrinking marble presents less and less surface (the model scales it as mass^⅔, the way a dissolving lump does). The endpoint is set by whichever reagent runs out first — at 0.5 M the 25 mL of acid is limiting (150 mL), everywhere else the 0.75 g of marble is (180 mL).</p>
            <p>The syringe also gives you mass loss for free. Taking the molar volume of CO₂ as 24,000 mL per mole at room conditions, every millilitre collected carries away 44/24,000 ≈ 0.0018 g — about 0.18 g per 100 mL. (As a bookkeeping check: 0.01 mol of CO₂ — 240 mL — has a mass of exactly 0.44 g, which is why a balance reading to 0.01 g sees the mass loss of a full run clearly.)</p>
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

// ------------------------------------------------------------- drawing helpers ----

function drawChipShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < CHIP_SHAPE.length; i += 1) {
    const ang = (i / CHIP_SHAPE.length) * Math.PI * 2;
    const rr = r * CHIP_SHAPE[i];
    const px = Math.cos(ang) * rr;
    const py = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#eef2f5');
  grad.addColorStop(0.55, '#c9d1d8');
  grad.addColorStop(1, '#9aa5af');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#8b97a3';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.25);
  ctx.lineTo(r * 0.1, -r * 0.55);
  ctx.lineTo(r * 0.45, -r * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawPowderHeap(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, h: number) {
  for (const sp of SPECKS) {
    const x = cx + sp.dx * (w / 2) * (1 - sp.dy * 0.3);
    const y = baseY - sp.dy * h - 1;
    ctx.fillStyle = sp.t > 0.5 ? '#d7dde2' : '#aab3bc';
    ctx.beginPath();
    ctx.arc(x, y, sp.r, 0, Math.PI * 2);
    ctx.fill();
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

// ---- multi-run overlay chart (sidebar live trace + observations tab; text is allowed here) ------

function RateChart(props: { runs: RunRow[]; live: { t: number; v: number }[]; liveOn: boolean; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderRef = useRef<() => void>(() => {});

  // resize redraw only — never torn down by data updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => renderRef.current());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, rect.width);
      const h = props.height ?? 210;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { l: 44, r: 14, t: 14, b: 32 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const allT = [...props.runs.flatMap((r) => r.pts.map((p) => p.t)), ...props.live.map((p) => p.t)];
      const tMax = Math.max(30, Math.ceil(Math.max(30, ...allT, 0) / 15) * 15);
      const vMax = SYRINGE_CAP;
      const sx = (t: number) => pad.l + (t / tMax) * iw;
      const sy = (v: number) => pad.t + ih - (v / vMax) * ih;

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
        ctx.fillText(`${Math.round((tMax * i) / 4)}s`, x, h - pad.b + 14);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round((vMax * i) / 4)}`, pad.l - 6, y + 3);
      }

      ctx.strokeStyle = '#c5cdd6';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('time since the run started (s)', pad.l + iw / 2, h - 4);
      ctx.save();
      ctx.translate(11, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('CO₂ volume (mL)', 0, 0);
      ctx.restore();

      const drawSeries = (pts: { t: number; v: number }[], color: string, width: number, dot: boolean) => {
        if (pts.length === 0) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(pts[0].v));
        for (const p of pts) ctx.lineTo(sx(p.t), sy(p.v));
        ctx.stroke();
        if (dot) {
          const last = pts[pts.length - 1];
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(sx(last.t), sy(last.v), 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      };

      // previous runs fade to blue; the latest banked run (or the live one) is bold orange
      const latestId = props.liveOn ? -1 : (props.runs.length ? props.runs[props.runs.length - 1].id : -1);
      props.runs.forEach((r) => {
        drawSeries(r.pts, r.id === latestId ? '#e8632a' : 'rgba(76,111,175,0.45)', r.id === latestId ? 2.2 : 1.5, r.id === latestId);
      });
      if (props.liveOn && props.live.length > 0) {
        drawSeries(props.live, '#e8632a', 2.2, true);
      }
    };

    renderRef.current = render;
    render();
  }, [props.runs, props.live, props.liveOn, props.height]);

  return (
    <canvas
      ref={canvasRef}
      className="lab-plot"
      style={{ width: '100%', height: props.height ?? 210 }}
      aria-label="Carbon dioxide volume versus time for every run"
    />
  );
}
