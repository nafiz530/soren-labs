import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp, fmtClock } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './respiration-in-seeds.css';

/**
 * Respiration in seeds — Biology, Builder tier (Experiment 035).
 *
 * The classic two-flask comparison. Flask A holds soaked, germinating bean
 * seeds; flask B holds a second batch that the student must boil over the
 * Bunsen (then cool under the tap) to make a dead control. One air pump
 * pushes the same slow stream through both flasks, so both lime-water vials
 * get an identical test — the fair-test lesson. Living seeds cloud their
 * vial with CO₂ (saturating kinetics, τ ≈ 40 sim-s) and run ~1.2 °C above
 * room; boiled seeds do neither. A fridge and a bag of dry dormant seeds
 * let the student probe temperature and water as the other conditions
 * respiration needs.
 */

const ROOM_T = 22;
const FRIDGE_T = 6;
const TAP_T = 15;
const FLAME_T = 118;
const TAU_CLOUD = 40; // s — saturating lime-water clouding time constant
const TAU_HOME = 30; // s — thermal relaxation on the open bench
const TAU_FRIDGE = 16;
const TAU_FLAME = 11;
const TAU_TAP = 7;
const HEAT_COEF = 1.05; // °C of metabolic warming at respiration rate 1
const Q10 = 2.5; // respiration roughly ×2.5 per +10 °C
const BOIL_TIME = 30; // sim-s of rolling boil to kill the seeds

type SeedKind = 'germinating' | 'soaked' | 'dry' | 'boiled';
type Zone = 'home' | 'tripod' | 'tap' | 'fridge' | 'drag';
type BagKind = Extract<SeedKind, 'dry' | 'germinating'>;

interface Flask {
  id: 'A' | 'B';
  zone: Zone;
  dragX: number;
  dragY: number;
  seeds: SeedKind;
  cook: number; // 0..1 boiling / scorching progress
  temp: number; // °C, true value (readouts add honest ±0.1 °C jitter)
  cloud: number; // 0..100 vial cloudiness
  rate: number; // current respiration rate factor
}

interface Mote { x: number; y: number; vx: number; vy: number; r: number; a: number }
interface Bubble { vial: 'A' | 'B'; x: number; y: number; r: number; vy: number; ph: number }
interface Puff { x: number; y: number; r: number; vy: number; ph: number; life: number; kind: 'steam' | 'mist' }
interface Drop { x: number; y: number; vx: number; vy: number; life: number }
interface TracePt { t: number; cA: number; cB: number; TA: number; TB: number }
interface Row { id: number; flask: 'A' | 'B'; condition: string; t: number; cloud: number; temp: number }

interface UiSnap {
  t: number;
  pumpOn: boolean;
  burnerLit: boolean;
  cA: number; cB: number;
  TA: number; TB: number;
  cookB: number;
  zoneA: Zone; zoneB: Zone;
  seedsA: SeedKind; seedsB: SeedKind;
  dragging: boolean;
}

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'meet', title: 'Meet the two flasks', detail: 'Flask A holds soaked, sprouting bean seeds; flask B holds a second living batch. Both necks feed a delivery tube that bubbles air through a vial of lime water.', hint: 'Lime water turns milky when carbon dioxide arrives — that is our CO₂ detector.' },
  { id: 'boil', title: 'Boil the control seeds', detail: 'Light the Bunsen, drag flask B onto the tripod above the flame and keep it there about 30 simulated seconds until the seeds visibly cook, then drag it under the tap to cool.', hint: 'Prefer buttons? “Light the Bunsen” and “Set flask B on the tripod” do the same moves.' },
  { id: 'flow', title: 'Start the airflow', detail: 'Tap the air pump. It pushes the same slow stream of air through both flasks, so each vial of lime water gets an identical test.', hint: 'Same airflow on both sides — that is what makes this a fair test.' },
  { id: 'watch', title: 'Watch vial A cloud', detail: 'Carbon dioxide from respiring seeds turns lime water milky. Watch vial A climb while boiled vial B stays crystal clear.', hint: 'Use ×4 or ×8 playback in the toolbar if the wait feels long.' },
  { id: 'thermo', title: 'Read the thermometers', detail: 'The probes in the cotton plugs show living seeds running a little above room temperature. Record a reading to bank the cloudiness and the heat gap.', hint: 'Living seeds sit roughly 1 °C above room; the dead batch tracks the room exactly.' },
  { id: 'conclude', title: 'Answer the conclusion', detail: 'Open Observations and answer: which seeds respired? Use your own cloudiness numbers as the evidence.', hint: 'Wrong answers get coaching drawn from your own data — you can retry.' },
];

const BADGES: BadgeDef[] = [
  { id: 'fair-test', title: 'Fair test', icon: '⚖', detail: 'Started the single air pump that feeds both vials equally.' },
  { id: 'milky-moment', title: 'Milky moment', icon: '☁', detail: 'Saw the first visible clouding in vial A — CO₂ from living seeds.' },
  { id: 'clear-control', title: 'Clear control', icon: '○', detail: 'Vial B stayed crystal clear through a full run — a proper dead control.' },
  { id: 'heat-seeker', title: 'Heat seeker', icon: '🌡', detail: 'Recorded the temperature gap between living and dead seeds (≥ 0.6 °C).' },
  { id: 'concluded', title: 'Concluded', icon: '✓', detail: 'Answered the conclusion correctly, backed by your own data.' },
];

const meta = getLabBySlug('respiration-in-seeds')!;

function seedRate(kind: SeedKind): number {
  if (kind === 'germinating') return 1;
  if (kind === 'soaked') return 0.85;
  return 0; // dry dormant or boiled dead
}

function conditionLabel(f: Flask): string {
  switch (f.seeds) {
    case 'boiled': return 'boiled — dead control';
    case 'dry': return 'dry dormant';
    case 'soaked': return f.temp < 14 ? 'soaked, chilled' : 'soaked, living';
    default: return f.temp < 14 ? 'germinating, chilled' : 'germinating, warm';
  }
}

function makeSim() {
  return {
    t: 0,
    pumpOn: false,
    burnerLit: false,
    pumpStart: -1,
    loopKind: null as null | 'pour' | 'hum',
    flasks: {
      A: { id: 'A', zone: 'home', dragX: 0, dragY: 0, seeds: 'germinating', cook: 0, temp: ROOM_T, cloud: 0, rate: 1 } as Flask,
      B: { id: 'B', zone: 'home', dragX: 0, dragY: 0, seeds: 'soaked', cook: 0, temp: ROOM_T, cloud: 0, rate: 0.85 } as Flask,
    },
    drag: null as null | { kind: 'flask'; id: 'A' | 'B' },
    bagDrag: null as null | { bag: BagKind; x: number; y: number },
    motes: Array.from({ length: 16 }, () => ({
      x: Math.random(), y: Math.random() * 0.9,
      vx: (Math.random() - 0.5) * 0.006, vy: -(0.002 + Math.random() * 0.004),
      r: 0.8 + Math.random() * 1.4, a: 0.05 + Math.random() * 0.1,
    })) as Mote[],
    bubbles: [] as Bubble[],
    puffs: [] as Puff[],
    drops: [] as Drop[],
    uiAcc: 0, traceAcc: 0, tracePush: 0, bubAcc: 0, steamAcc: 0, mistAcc: 0, dropAcc: 0,
    slideAt: 0, slideBagAt: 0,
    milky: false, clearCtl: false, controlReady: false, boiledEvent: false, scorchEvent: false,
    trace: [] as TracePt[],
  };
}

type Sim = ReturnType<typeof makeSim>;

// ---------------------------------------------------------------- geometry

interface Pt { x: number; y: number }
interface Layout {
  s: number; narrow: boolean; w: number; h: number; benchY: number;
  home: { A: Pt; B: Pt };
  tripod: Pt; tap: Pt; fridge: Pt; spout: Pt;
  vial: { A: Pt; B: Pt };
  pump: Pt;
  bags: { kind: BagKind; x: number; y: number }[];
}

function layoutOf(w: number, h: number): Layout {
  const narrow = w < 620;
  const s = clamp(w / 940, 0.55, 1.05);
  const benchY = h - (narrow ? 42 : 56);
  const fx = narrow ? 0.1 : 0.075;
  const ax = narrow ? 0.28 : 0.27;
  const va = narrow ? 0.395 : 0.375;
  const bx = narrow ? 0.54 : 0.52;
  const vb = narrow ? 0.655 : 0.625;
  const px = narrow ? 0.74 : 0.73;
  const tx = narrow ? 0.85 : 0.84;
  const tpx = narrow ? 0.94 : 0.955;
  const trayY = benchY + (h - benchY) * 0.52;
  const trayX = w * 0.05;
  return {
    s, narrow, w, h, benchY,
    home: {
      A: { x: w * ax, y: benchY - 56 * s },
      B: { x: w * bx, y: benchY - 56 * s },
    },
    tripod: { x: w * tx, y: benchY - 142 * s },
    tap: { x: w * tpx, y: benchY - 82 * s },
    fridge: { x: w * fx, y: benchY - 64 * s },
    spout: { x: w * tpx - 14 * s, y: 64 },
    vial: { A: { x: w * va, y: benchY }, B: { x: w * vb, y: benchY } },
    pump: { x: w * px, y: benchY - 17 * s },
    bags: [
      { kind: 'dry', x: trayX + 17 * s, y: trayY },
      { kind: 'germinating', x: trayX + 49 * s, y: trayY },
    ],
  };
}

function flaskPos(id: 'A' | 'B', L: Layout, sim: Sim): Pt {
  const f = sim.flasks[id];
  if (f.zone === 'drag') return { x: f.dragX, y: f.dragY };
  switch (f.zone) {
    case 'tripod': return L.tripod;
    case 'tap': return L.tap;
    case 'fridge': return L.fridge;
    default: return L.home[id];
  }
}

const near = (px: number, py: number, x: number, y: number, r: number) => Math.hypot(px - x, py - y) < r;

// Fixed pseudo-random seed pile inside the conical flask.
const SEED_PILE = [
  { dx: -0.55, dy: 0.05, r: 1, rot: 0.4 }, { dx: -0.18, dy: 0.1, r: 1.05, rot: -0.3 },
  { dx: 0.2, dy: 0.06, r: 0.98, rot: 0.5 }, { dx: 0.55, dy: 0.02, r: 1, rot: -0.5 },
  { dx: -0.38, dy: -0.16, r: 0.94, rot: 0.2 }, { dx: 0.0, dy: -0.2, r: 1.02, rot: -0.15 },
  { dx: 0.38, dy: -0.18, r: 0.95, rot: 0.35 }, { dx: -0.62, dy: -0.02, r: 0.9, rot: -0.4 },
  { dx: 0.66, dy: -0.05, r: 0.92, rot: 0.45 }, { dx: -0.05, dy: 0.22, r: 0.96, rot: 0.1 },
  { dx: 0.28, dy: 0.24, r: 0.9, rot: -0.2 }, { dx: -0.3, dy: 0.26, r: 0.93, rot: 0.3 },
  { dx: 0.6, dy: 0.14, r: 0.88, rot: -0.35 }, { dx: -0.75, dy: 0.16, r: 0.86, rot: 0.25 },
];

function seedColor(kind: SeedKind, cook: number): string {
  if (kind === 'dry') return '#c4b190';
  if (kind === 'boiled') return '#9b8666';
  const c = clamp(cook, 0, 1);
  const r = Math.round(232 - c * 122);
  const g = Math.round(221 - c * 103);
  const b = Math.round(194 - c * 89);
  return `rgb(${r},${g},${b})`;
}

function tempColor(t: number): string {
  // blue (cold) → slate (room) → orange (warm) → red (boiling)
  if (t < 20) return '#5b87b0';
  if (t < 32) {
    const k = clamp((t - 20) / 12, 0, 1);
    return `rgb(${Math.round(91 + k * 119)},${Math.round(135 - k * 2)},${Math.round(176 - k * 104)})`;
  }
  const k = clamp((t - 32) / 68, 0, 1);
  return `rgb(${Math.round(210 + k * 45)},${Math.round(133 - k * 104)},${Math.round(72 - k * 42)})`;
}

// ---------------------------------------------------------------- component

export default function SeedRespirationLab() {
  const sim = useRef<Sim>(makeSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [controlReady, setControlReady] = useState(false);
  const [pumped, setPumped] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [conclusion, setConclusion] = useState<'correct' | 'wrong' | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [trace, setTrace] = useState<TracePt[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    t: 0, pumpOn: false, burnerLit: false, cA: 0, cB: 0, TA: ROOM_T, TB: ROOM_T,
    cookB: 0, zoneA: 'home', zoneB: 'home', seedsA: 'germinating', seedsB: 'soaked', dragging: false,
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
    const s = sim.current;
    const fA = s.flasks.A;
    const fB = s.flasks.B;
    setUi({
      t: s.t,
      pumpOn: s.pumpOn,
      burnerLit: s.burnerLit,
      cA: clamp(fA.cloud + Math.sin(s.t * 1.31) * 1.2, 0, 100),
      cB: clamp(fB.cloud + Math.sin(s.t * 1.13 + 2) * 1.2, 0, 100),
      TA: fA.temp + Math.sin(s.t * 0.9) * 0.07 + Math.sin(s.t * 0.23 + 1) * 0.05,
      TB: fB.temp + Math.sin(s.t * 0.9 + 2.1) * 0.07 + Math.sin(s.t * 0.23 + 3) * 0.05,
      cookB: fB.cook,
      zoneA: fA.zone,
      zoneB: fB.zone,
      seedsA: fA.seeds,
      seedsB: fB.seeds,
      dragging: s.drag !== null || s.bagDrag !== null,
    });
  }, []);

  const concludedCorrect = badges.includes('concluded');

  // ---- mentor completion flags -------------------------------------------
  const done = [mentorAcked, controlReady, pumped, badges.includes('milky-moment'), recorded, concludedCorrect];

  useEffect(() => {
    const next = done.findIndex((d, i) => !d && i <= mentorIndex);
    if (next > mentorIndex) {
      setMentorIndex(next);
      labSound.step();
    } else if (done[done.length - 1] && mentorIndex < MENTOR_STEPS.length - 1) {
      setMentorIndex(MENTOR_STEPS.length - 1);
    }
  }, [done, mentorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ---------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    const s = sim.current;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'boil':
        if (!s.burnerLit) return { target: 'burner', gesture: 'press', title: 'Light the Bunsen', body: 'Press “Light the Bunsen” — or tap the burner itself in the scene.' };
        if (s.flasks.B.zone !== 'tripod') return { target: 'scene', gesture: 'drag', title: 'Drag flask B over the flame', body: 'Grab flask B and drop it on the tripod above the blue flame. Keep it there until the seeds visibly cook.' };
        if (s.flasks.B.seeds === 'boiled' && s.flasks.B.temp >= 30) return { target: 'cool', gesture: 'press', title: 'Cool flask B', body: 'The seeds are cooked but hot — press “Cool flask B under the tap”, then return it to its stand.' };
        return null;
      case 'flow':
        return { target: 'pump', gesture: 'press', title: 'Start the air pump', body: 'One pump, two tubes: the same slow stream of air flows through both flasks. Press “Start the air pump”.' };
      case 'watch':
        return { target: 'scene', gesture: 'point', title: 'Watch the vials', body: 'Vial A (orange band) should cloud while vial B (slate band) stays clear. Speed up playback if you like.' };
      case 'thermo':
        return { target: 'record', gesture: 'press', title: 'Record the reading', body: 'Bank the live cloudiness and temperatures with “Record reading” — the heat gap is worth keeping.' };
      case 'conclude':
        return { target: 'observations', gesture: 'tap', title: 'Answer the conclusion', body: 'Open Observations and answer “Which seeds respire?” using your own cloudiness numbers.' };
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- sound loops (one at a time: pump pour > burner hum) -----------------
  const syncLoops = useCallback(() => {
    const s = sim.current;
    const want = s.pumpOn ? 'pour' : s.burnerLit ? 'hum' : null;
    if (want !== s.loopKind) {
      labSound.stopLoop();
      if (want) labSound.startLoop(want);
      s.loopKind = want;
    }
  }, []);

  // ---- apparatus actions ----------------------------------------------------
  const toggleBurner = useCallback(() => {
    const s = sim.current;
    s.burnerLit = !s.burnerLit;
    labSound.click();
    if (s.burnerLit) labSound.ping(520, 0.07);
    syncLoops();
    syncUi();
  }, [syncLoops, syncUi]);

  const togglePump = useCallback(() => {
    const s = sim.current;
    s.pumpOn = !s.pumpOn;
    labSound.click();
    if (s.pumpOn) {
      if (s.pumpStart < 0) s.pumpStart = s.t;
      setPumped(true);
      earn('fair-test');
      pushToast('good', '🫧', 'Airflow on — the same slow stream now bubbles through both vials.');
    }
    syncLoops();
    syncUi();
  }, [earn, pushToast, syncLoops, syncUi]);

  const placeFlask = useCallback((id: 'A' | 'B', zone: Zone) => {
    const s = sim.current;
    const f = s.flasks[id];
    if (f.zone === zone) {
      labSound.tick();
      return;
    }
    f.zone = zone;
    labSound.thunk(false);
    labSound.glassClink(true);
    if (zone === 'tripod' && !s.burnerLit) {
      pushToast('info', '🔥', 'Flask in place — but the Bunsen is not lit yet. Light it to boil.');
      labSound.warn();
    } else if (zone === 'tap') {
      labSound.drip(true);
    }
    syncUi();
  }, [pushToast, syncUi]);

  const swapBag = useCallback((bag: BagKind, id: 'A' | 'B') => {
    const s = sim.current;
    const f = s.flasks[id];
    f.seeds = bag;
    f.cook = 0;
    labSound.slosh(0.55);
    if (bag === 'dry') {
      pushToast('info', '🫘', `Dry dormant seeds swapped into flask ${id} — no water, no respiration. Rinse the vial to test them cleanly.`);
    } else {
      pushToast('good', '🌱', `Fresh germinating seeds swapped into flask ${id} — living and respiring again.`);
    }
    syncUi();
  }, [pushToast, syncUi]);

  const rinseVials = useCallback(() => {
    const s = sim.current;
    s.flasks.A.cloud = 0;
    s.flasks.B.cloud = 0;
    labSound.slosh(0.8);
    pushToast('info', '🧪', 'Both vials rinsed and refilled with fresh lime water.');
    syncUi();
  }, [pushToast, syncUi]);

  const record = useCallback(() => {
    const s = sim.current;
    const fA = s.flasks.A;
    const fB = s.flasks.B;
    const cA = clamp(fA.cloud + Math.sin(s.t * 1.31) * 1.2, 0, 100);
    const cB = clamp(fB.cloud + Math.sin(s.t * 1.13 + 2) * 1.2, 0, 100);
    const tA = fA.temp + Math.sin(s.t * 0.9) * 0.07;
    const tB = fB.temp + Math.sin(s.t * 0.9 + 2.1) * 0.07;
    const base = rows.length;
    setRows((cur) => [
      ...cur,
      { id: base + 1, flask: 'A', condition: conditionLabel(fA), t: s.t, cloud: cA, temp: tA },
      { id: base + 2, flask: 'B', condition: conditionLabel(fB), t: s.t, cloud: cB, temp: tB },
    ]);
    setRecorded(true);
    labSound.click();
    const gap = Math.abs(fA.temp - fB.temp);
    if (gap >= 0.6) earn('heat-seeker');
    if (!s.pumpOn) {
      pushToast('warn', '⏳', 'Recorded — but the pump is off, so no air is carrying CO₂ to the vials.');
    } else {
      pushToast('good', '✎', `Recorded — vial A ${cA.toFixed(0)}% · vial B ${cB.toFixed(0)}% · heat gap ${gap.toFixed(1)} °C`);
    }
  }, [rows.length, earn, pushToast]);

  const answerConclusion = useCallback((pick: number) => {
    if (pick === 1) {
      setConclusion('correct');
      earn('concluded');
      labSound.milestone();
      pushToast('good', '✓', 'Concluded correctly — only the living, germinating seeds respire.');
    } else {
      setConclusion('wrong');
      labSound.warn();
    }
  }, [earn, pushToast]);

  const resetAll = useCallback(() => {
    sim.current = makeSim();
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setControlReady(false);
    setPumped(false);
    setRecorded(false);
    setConclusion(null);
    setBadges([]);
    setTrace([]);
    labSound.stopLoop();
    syncUi();
  }, [syncUi]);

  // ---- physics ----------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const simDt = dt * speed;
    s.t += simDt;

    for (const id of ['A', 'B'] as const) {
      const f = s.flasks[id];
      const alive = f.seeds === 'germinating' || f.seeds === 'soaked';
      const q = clamp(Math.pow(Q10, (f.temp - ROOM_T) / 10), 0.07, 2.2);
      f.rate = alive ? seedRate(f.seeds) * q : 0;

      let env = ROOM_T;
      let tau = TAU_HOME;
      if (f.zone === 'fridge') { env = FRIDGE_T; tau = TAU_FRIDGE; }
      else if (f.zone === 'tripod' && s.burnerLit) { env = FLAME_T; tau = TAU_FLAME; }
      else if (f.zone === 'tap') { env = TAP_T; tau = TAU_TAP; }
      // On the open bench the only heat source is metabolism; in a bath the
      // bath dominates (a whisper of metabolic heat still applies).
      const target = f.zone === 'home'
        ? ROOM_T + HEAT_COEF * f.rate
        : env + HEAT_COEF * f.rate * 0.12;
      f.temp += (target - f.temp) * (1 - Math.exp(-simDt / tau));

      // Cooking over the flame
      if (f.zone === 'tripod' && s.burnerLit && f.temp > 88 && f.cook < 1 && f.seeds !== 'boiled') {
        f.cook = Math.min(1, f.cook + simDt / BOIL_TIME);
        if (f.cook >= 1) {
          if (f.seeds === 'dry') {
            if (!s.scorchEvent) {
              s.scorchEvent = true;
              pushToast('warn', '🫘', 'The dry seeds just scorched — they were dormant already, no respiration to kill.');
              labSound.warn();
            }
          } else {
            f.seeds = 'boiled';
            if (!s.boiledEvent) {
              s.boiledEvent = true;
              labSound.ping(660, 0.09);
              pushToast('good', '♨', `Flask ${id}’s seeds are cooked — the living cells are gone. Now cool it under the tap.`);
            } else {
              pushToast('info', '♨', `Flask ${id}’s seeds are cooked too — those cells are dead now.`);
            }
          }
        }
      }

      // Lime-water clouding — only while the pump carries air (and its CO₂) through
      if (s.pumpOn && f.rate > 0) {
        f.cloud = clamp(f.cloud + (100 - f.cloud) * (f.rate / TAU_CLOUD) * simDt, 0, 100);
      }
    }

    const fA = s.flasks.A;
    const fB = s.flasks.B;

    if (!s.controlReady && fB.seeds === 'boiled' && fB.temp < 30) {
      s.controlReady = true;
      setControlReady(true);
      labSound.step();
      pushToast('good', '❄', 'Control ready — flask B is boiled and cooled. The dead-control side of the comparison is set.');
    }

    if (!s.milky && fA.cloud >= 10) {
      s.milky = true;
      earn('milky-moment');
      labSound.ping(880, 0.1);
      pushToast('good', '☁', 'Vial A is turning milky — carbon dioxide is arriving from the living seeds.');
    }

    if (!s.clearCtl && s.pumpOn && fA.cloud >= 60 && fB.cloud < 5 && fB.seeds === 'boiled' && s.pumpStart >= 0 && s.t - s.pumpStart > 90) {
      s.clearCtl = true;
      earn('clear-control');
    }

    // ---- particles (visual time follows the sim clock, gently capped) ------
    const vdt = Math.min(simDt, dt * 3);
    if (s.pumpOn) {
      s.bubAcc += simDt * 7;
      while (s.bubAcc >= 1) {
        s.bubAcc -= 1;
        for (const v of ['A', 'B'] as const) {
          if (s.bubbles.length > 80) break;
          s.bubbles.push({ vial: v, x: (Math.random() - 0.5) * 5, y: 0, r: 1.2 + Math.random() * 2.2, vy: 16 + Math.random() * 14, ph: Math.random() * 6.28 });
        }
      }
    }
    for (let i = s.bubbles.length - 1; i >= 0; i -= 1) {
      const b = s.bubbles[i];
      b.y += (b.vy / 34) * vdt;
      if (b.y > 1) s.bubbles.splice(i, 1);
    }

    for (const id of ['A', 'B'] as const) {
      const f = s.flasks[id];
      if (f.temp > 78) {
        s.steamAcc += simDt * 2.5;
        while (s.steamAcc >= 1) {
          s.steamAcc -= 1;
          s.puffs.push({ x: (Math.random() - 0.5) * 12, y: 0, r: 4 + Math.random() * 4, vy: 22 + Math.random() * 12, ph: (id === 'A' ? 0 : Math.PI) + Math.random() * 0.4, life: 1, kind: 'steam' });
        }
      }
    }
    if (s.flasks.A.zone === 'fridge' || s.flasks.B.zone === 'fridge') {
      s.mistAcc += simDt * 1.2;
      while (s.mistAcc >= 1) {
        s.mistAcc -= 1;
        s.puffs.push({ x: 30 + (Math.random() - 0.5) * 20, y: -60, r: 5 + Math.random() * 4, vy: 8, ph: Math.random() * 6.28, life: 1, kind: 'mist' });
      }
    }
    for (let i = s.puffs.length - 1; i >= 0; i -= 1) {
      const p = s.puffs[i];
      p.y += p.vy * vdt;
      p.r += 10 * vdt;
      p.life -= vdt * 0.55;
      if (p.life <= 0) s.puffs.splice(i, 1);
    }

    const tapActive = s.flasks.A.zone === 'tap' || s.flasks.B.zone === 'tap';
    if (tapActive) {
      s.dropAcc += simDt * 26;
      while (s.dropAcc >= 1) {
        s.dropAcc -= 1;
        s.drops.push({ x: (Math.random() - 0.5) * 10, y: 0, vx: (Math.random() - 0.5) * 26, vy: 40 + Math.random() * 30, life: 1 });
      }
    }
    for (let i = s.drops.length - 1; i >= 0; i -= 1) {
      const d = s.drops[i];
      d.y += (d.vy / 120) * vdt;
      d.x += (d.vx / 120) * vdt;
      d.life -= vdt * 0.9;
      if (d.life <= 0 || d.y > 0.6) s.drops.splice(i, 1);
    }

    for (const m of s.motes) {
      m.x += (m.vx + Math.sin(s.t * 0.6 + m.y * 9) * 0.0015) * dt * 60 * 0.016;
      m.y += m.vy * dt;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      if (m.x < -0.02) m.x = 1.02;
      if (m.x > 1.02) m.x = -0.02;
    }

    // ---- trace sampling (every 2 simulated seconds) -------------------------
    s.traceAcc += simDt;
    if (s.traceAcc >= 2) {
      s.traceAcc = 0;
      s.trace.push({ t: s.t, cA: fA.cloud, cB: fB.cloud, TA: fA.temp, TB: fB.temp });
      if (s.trace.length > 480) s.trace.shift();
    }
    s.tracePush += dt;
    if (s.tracePush > 1) {
      s.tracePush = 0;
      setTrace(s.trace.slice());
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, earn, pushToast, syncUi]);

  // ---- drawing -------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const L = layoutOf(w, h);
    const t = performance.now() / 1000;
    const sc = L.s;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench
    ctx.fillStyle = '#ccd6df';
    ctx.fillRect(0, L.benchY, w, h - L.benchY);
    ctx.fillStyle = '#d9e1e8';
    ctx.fillRect(0, L.benchY, w, 5 * sc);
    ctx.strokeStyle = '#b8c4cf';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, L.benchY);
    ctx.lineTo(w, L.benchY);
    ctx.stroke();

    // shadows on the bench
    const shadow = (x: number, y: number, rx: number) => {
      ctx.fillStyle = 'rgba(23,35,52,0.09)';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    shadow(L.vial.A.x, L.benchY + 4, 20 * sc);
    shadow(L.vial.B.x, L.benchY + 4, 20 * sc);
    shadow(L.pump.x, L.benchY + 4, 38 * sc);
    shadow(L.tripod.x, L.benchY + 4, 36 * sc);
    shadow(L.tap.x, L.benchY + 4, 34 * sc);

    // ---------- fridge (left) ----------
    drawFridge(ctx, L, t);

    // ---------- tap (top right) + basin ----------
    drawTap(ctx, L, t, s);

    // ---------- air pump ----------
    drawPump(ctx, L, t, s);

    // ---------- tripod + bunsen ----------
    drawBurnerRig(ctx, L, t, s);

    // ---------- vials ----------
    drawVial(ctx, L, 'A', s);
    drawVial(ctx, L, 'B', s);

    // ---------- tubes ----------
    const posA = flaskPos('A', L, s);
    const posB = flaskPos('B', L, s);
    drawTubes(ctx, L, s, posA, posB, t);

    // ---------- flasks (dragged one on top) ----------
    const order: Array<'A' | 'B'> = s.drag?.id === 'A' ? ['B', 'A'] : ['A', 'B'];
    for (const id of order) {
      const f = s.flasks[id];
      const p = id === 'A' ? posA : posB;
      if (f.zone !== 'fridge') shadow(p.x, f.zone === 'home' ? L.benchY + 4 : p.y + 62 * sc, 44 * sc);
      drawFlask(ctx, p.x, p.y, sc, f, t, id === 'A' ? '#f97316' : '#5d7a99');
    }

    // ---------- seed bag tray ----------
    drawTray(ctx, L, s);

    // ---------- particles in front ----------
    drawParticles(ctx, L, s, t);

    // ---------- drag affordances ----------
    if (s.drag) {
      const id = s.drag.id;
      const targets: Array<{ p: Pt; r: number }> = [
        { p: L.tripod, r: 52 * sc }, { p: L.tap, r: 52 * sc }, { p: L.fridge, r: 56 * sc }, { p: L.home[id], r: 46 * sc },
      ];
      const cur = { x: s.flasks[id].dragX, y: s.flasks[id].dragY };
      for (const tg of targets) {
        const hot = near(cur.x, cur.y, tg.p.x, tg.p.y, tg.r + 14 * sc);
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = hot ? 2.5 : 1.5;
        ctx.strokeStyle = hot ? 'rgba(249,115,22,0.9)' : 'rgba(94,120,148,0.5)';
        ctx.beginPath();
        ctx.arc(tg.p.x, tg.p.y, tg.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (hot) {
          ctx.fillStyle = 'rgba(249,115,22,0.10)';
          ctx.beginPath();
          ctx.arc(tg.p.x, tg.p.y, tg.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (s.bagDrag) {
      drawBag(ctx, s.bagDrag.x, s.bagDrag.y, sc, s.bagDrag.bag, t, true);
    }

    // ---------- dust motes ----------
    for (const m of s.motes) {
      ctx.fillStyle = `rgba(90,110,135,${m.a})`;
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const L = layoutOf(rect.width, rect.height);
    const s = sim.current;

    // air pump toggle
    if (near(px, py, L.pump.x, L.pump.y, 40 * L.s + 12)) {
      togglePump();
      notePointer(true);
      return;
    }
    // burner toggle
    if (near(px, py, L.tripod.x, L.benchY - 16 * L.s, 30 * L.s + 14)) {
      toggleBurner();
      notePointer(true);
      return;
    }
    // seed bags
    for (const b of L.bags) {
      if (near(px, py, b.x, b.y, 24 * L.s + 12)) {
        s.bagDrag = { bag: b.kind, x: b.x, y: b.y };
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.slide(0.4);
        notePointer(true);
        return;
      }
    }
    // flasks (B drawn on top by default, so test it first)
    for (const id of ['B', 'A'] as const) {
      const p = flaskPos(id, L, s);
      if (near(px, py, p.x, p.y, 62 * L.s + 10)) {
        const f = s.flasks[id];
        f.zone = 'drag';
        f.dragX = px;
        f.dragY = py;
        s.drag = { kind: 'flask', id };
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.glassClink(true);
        notePointer(true);
        syncUi();
        return;
      }
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (!s.drag && !s.bagDrag) return;
    const rect = canvas.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 26, rect.width - 26);
    const py = clamp(e.clientY - rect.top, 40, rect.height - 40);
    const nowT = performance.now();
    if (s.drag) {
      const f = s.flasks[s.drag.id];
      f.dragX = px;
      f.dragY = py;
      if (nowT - s.slideAt > 110) {
        s.slideAt = nowT;
        labSound.slide(0.25);
      }
    } else if (s.bagDrag) {
      s.bagDrag.x = px;
      s.bagDrag.y = py;
      if (nowT - s.slideBagAt > 130) {
        s.slideBagAt = nowT;
        labSound.slide(0.2);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const s = sim.current;
    try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!s.drag && !s.bagDrag) return;
    if (s.drag) {
      const id = s.drag.id;
      const f = s.flasks[id];
      const rect = canvas?.getBoundingClientRect();
      const L = layoutOf(rect?.width ?? 800, rect?.height ?? 500);
      const zones: Array<{ zone: Zone; p: Pt; r: number }> = [
        { zone: 'tripod', p: L.tripod, r: 60 * L.s },
        { zone: 'tap', p: L.tap, r: 60 * L.s },
        { zone: 'fridge', p: L.fridge, r: 64 * L.s },
        { zone: 'home', p: L.home[id], r: 54 * L.s },
      ];
      let placed: Zone = 'home';
      for (const z of zones) {
        if (near(f.dragX, f.dragY, z.p.x, z.p.y, z.r + 16)) { placed = z.zone; break; }
      }
      s.drag = null;
      placeFlask(id, placed);
      return;
    }
    if (s.bagDrag) {
      const bag = s.bagDrag;
      s.bagDrag = null;
      const rect = canvas?.getBoundingClientRect();
      const L = layoutOf(rect?.width ?? 800, rect?.height ?? 500);
      for (const id of ['A', 'B'] as const) {
        const p = flaskPos(id, L, s);
        if (near(bag.x, bag.y, p.x, p.y, 60 * L.s)) {
          swapBag(bag.bag, id);
          notePointer(true);
          return;
        }
      }
      labSound.thunk(true);
    }
  };

  // ---- keyboard duplicate of the main gesture --------------------------------
  const advance = useCallback(() => {
    const s = sim.current;
    const fB = s.flasks.B;
    if (!s.burnerLit && fB.seeds !== 'boiled') { toggleBurner(); return; }
    if (s.burnerLit && fB.seeds !== 'boiled' && fB.zone !== 'tripod') { placeFlask('B', 'tripod'); return; }
    if (fB.seeds === 'boiled' && fB.temp >= 30 && fB.zone !== 'tap') { placeFlask('B', 'tap'); return; }
    if (fB.zone !== 'home' && fB.seeds === 'boiled' && fB.temp < 30) { placeFlask('B', 'home'); return; }
    if (!s.pumpOn) { togglePump(); return; }
    if (rows.length === 0) { record(); return; }
    labSound.tick();
  }, [toggleBurner, placeFlask, togglePump, record, rows.length]);

  // ---- coach -------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (conclusion === 'wrong') {
      return { tone: 'warn', line: `Look at your own numbers: vial A reads ${ui.cA.toFixed(0)}% milky while vial B sits at ${ui.cB.toFixed(0)}% — the carbon dioxide is coming from the living seeds only. Try again.` };
    }
    if (ui.seedsB !== 'boiled' && ui.pumpOn && ui.cB > 3) {
      return { tone: 'warn', line: 'Vial B is clouding too — those control seeds are still alive. Boil flask B (and cool it) to make it a fair dead control.' };
    }
    if (ui.burnerLit && ui.zoneB === 'tripod' && ui.seedsB !== 'boiled') {
      return { tone: 'info', line: `Flask B is boiling — cook progress ${(ui.cookB * 100).toFixed(0)}%. Keep it over the flame until the seeds darken fully.` };
    }
    if (ui.seedsB === 'boiled' && ui.TB >= 30) {
      return { tone: 'info', line: `Flask B is still ${ui.TB.toFixed(1)} °C — drag it under the tap to cool, then back to its stand.` };
    }
    if (!mentorAcked) {
      return { tone: 'info', line: 'Two flasks of soaked seeds, two vials of lime water — one airflow for both. Press “Got it” to begin.' };
    }
    if (!controlReady) {
      return { tone: 'info', line: 'Prepare the control: light the Bunsen, boil flask B for about 30 s, then cool it under the tap.' };
    }
    if (!ui.pumpOn) {
      return { tone: 'info', line: 'Control ready. Start the air pump — one slow stream through both flasks, the fair-test heart of this comparison.' };
    }
    if (ui.cA < 40) {
      return { tone: 'info', line: `Vial A ${ui.cA.toFixed(0)}% milky · vial B ${ui.cB.toFixed(0)}% — watch them diverge. Raise the playback speed if the wait drags.` };
    }
    if (!recorded) {
      return { tone: 'good', line: 'Vial A properly milky, vial B clear. Record the reading — the small temperature gap is worth banking too.' };
    }
    if (!concludedCorrect) {
      return { tone: 'good', line: 'Open Observations and answer the conclusion, using your own cloudiness data as the evidence.' };
    }
    if (ui.zoneA === 'fridge') {
      return { tone: 'info', line: 'Chilled seeds respire about six times slower — notice how slowly the milky cloud builds now.' };
    }
    return { tone: 'good', line: 'Conclusion earned: living, germinating seeds respire — CO₂ in the vial, a whisper of heat in the flask. The fridge and the dry seeds are yours to explore next.' };
  }, [conclusion, mentorAcked, controlReady, recorded, concludedCorrect, ui]);

  // ---- status ---------------------------------------------------------------------
  const complete = concludedCorrect;
  const statusText = complete
    ? 'Experiment complete'
    : ui.dragging ? 'Moving apparatus'
    : ui.burnerLit && ui.zoneB === 'tripod' && ui.seedsB !== 'boiled' ? 'Boiling the control'
    : ui.pumpOn ? (ui.cA < 10 ? 'Air flowing — watching the vials' : 'Vial A clouding')
    : controlReady ? 'Ready for airflow'
    : 'Experiment ready';
  const statusTone = complete ? 'complete' : ui.pumpOn || ui.burnerLit ? 'active' : 'ready';

  // ---- observations charts -----------------------------------------------------------
  const cloudSeries = useMemo(() => [
    { label: 'Vial A (germinating)', color: '#f97316', points: trace.map((p) => ({ x: p.t, y: p.cA })), live: true },
    { label: 'Vial B (control)', color: '#5d7a99', points: trace.map((p) => ({ x: p.t, y: p.cB })) },
  ], [trace]);
  const tempSeries = useMemo(() => [
    { label: 'Flask A', color: '#f97316', points: trace.map((p) => ({ x: p.t, y: p.TA })), live: true },
    { label: 'Flask B', color: '#5d7a99', points: trace.map((p) => ({ x: p.t, y: p.TB })) },
    { label: 'Room', color: '#98a4b0', points: trace.map((p) => ({ x: p.t, y: ROOM_T })), dashed: true },
  ], [trace]);
  const tempClose = useMemo(() => [
    { label: 'Flask A', color: '#f97316', points: trace.map((p) => ({ x: p.t, y: clamp(p.TA, 20.5, 25.5) })), live: true },
    { label: 'Flask B', color: '#5d7a99', points: trace.map((p) => ({ x: p.t, y: clamp(p.TB, 20.5, 25.5) })) },
  ], [trace]);

  const flowPct = ui.pumpOn ? 100 : 0;

  // ---- render -----------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Fair test — one airflow, two flasks"
      legend={[
        { color: '#f97316', label: 'Flask A · germinating seeds' },
        { color: '#5d7a99', label: 'Flask B · control' },
        { color: '#cfe6f2', label: 'Lime water (clear)' },
        { color: '#f2f0e6', label: 'Milky — CO₂ present' },
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
            <option value={4}>4× faster</option>
            <option value={8}>8× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          className="resp-canvas"
          tabIndex={0}
          role="application"
          aria-label="Respiration bench — drag flasks onto the tripod, the tap or the fridge, tap the pump to start the airflow"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); advance(); notePointer(true); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="resp-actions">
            <button className="action-button" type="button" data-nudge="burner" onClick={() => { toggleBurner(); notePointer(true); }}>
              <span className="dispense-icon" aria-hidden="true">🔥</span>
              <span>{ui.burnerLit ? 'Put out the Bunsen' : 'Light the Bunsen'}</span>
              <small>or tap the burner in the scene</small>
            </button>
            <button className="action-button" type="button" data-nudge="pump" onClick={() => { togglePump(); notePointer(true); }}>
              <span className="dispense-icon" aria-hidden="true">🫧</span>
              <span>{ui.pumpOn ? 'Stop the air pump' : 'Start the air pump'}</span>
              <small>same stream through both flasks</small>
            </button>
            <button className="action-button" type="button" data-nudge="boil" onClick={() => { placeFlask('B', 'tripod'); notePointer(true); }}>
              <span className="dispense-icon" aria-hidden="true">♨</span>
              <span>Set flask B on the tripod</span>
              <small>…or drag it over the flame</small>
            </button>
            <button className="action-button" type="button" data-nudge="cool" onClick={() => { placeFlask('B', 'tap'); notePointer(true); }}>
              <span className="dispense-icon" aria-hidden="true">🚿</span>
              <span>Cool flask B under the tap</span>
              <small>then return it to its stand</small>
            </button>
          </div>
          <div className="resp-actions resp-actions-2">
            <button className="action-button" type="button" onClick={() => { placeFlask('B', 'home'); notePointer(true); }}>
              <span aria-hidden="true">⌂</span><span>Flask B back to its stand</span>
            </button>
            <button className="action-button" type="button" onClick={() => { placeFlask('A', ui.zoneA === 'fridge' ? 'home' : 'fridge'); notePointer(true); }}>
              <span aria-hidden="true">❄</span>
              <span>{ui.zoneA === 'fridge' ? 'Take flask A out of the fridge' : 'Chill flask A in the fridge'}</span>
            </button>
            <button className="action-button" type="button" onClick={() => { swapBag('dry', 'A'); notePointer(true); }}>
              <span aria-hidden="true">🫘</span><span>Dry seeds → flask A</span>
            </button>
            <button className="action-button" type="button" onClick={() => { swapBag('germinating', 'A'); notePointer(true); }}>
              <span aria-hidden="true">🌱</span><span>Fresh germinating seeds → flask A</span>
            </button>
            <button className="action-button" type="button" onClick={() => { rinseVials(); notePointer(true); }}>
              <span aria-hidden="true">◍</span><span>Rinse &amp; refill both vials</span>
            </button>
          </div>
          <div className="resp-live">
            <div className="resp-clock"><span>SIMULATED TIME</span><strong>{fmtClock(ui.t)}</strong></div>
            <div className={`resp-vialchip a${ui.cA >= 10 ? ' milky' : ''}`}>
              <span>VIAL A · GERMINATING</span>
              <strong>{ui.cA.toFixed(0)}% milky</strong>
              <div className="resp-track"><span style={{ width: `${ui.cA}%` }} /></div>
            </div>
            <div className={`resp-vialchip b${ui.cB >= 10 ? ' milky' : ''}`}>
              <span>VIAL B · CONTROL</span>
              <strong>{ui.cB.toFixed(0)}% milky</strong>
              <div className="resp-track"><span style={{ width: `${ui.cB}%` }} /></div>
            </div>
            <div className="resp-flow"><span>AIRFLOW</span><div className="resp-track"><span style={{ width: `${flowPct}%` }} /></div></div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Boil flask B to kill its cells, start the one pump, and let the vials tell the story: lime water turns milky only where carbon dioxide arrives. The fridge and the dry-seed bag let you test temperature and water too.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { record(); notePointer(true); }}
          >
            ✎ Record reading — banks both flasks (cloudiness · temperature)
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Lime water &amp; heat</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Vial A cloudiness (germinating seeds)</span>
            <strong>{ui.cA.toFixed(1)} <small>% milky</small></strong>
            <div className="reading-track"><span style={{ width: `${ui.cA}%` }} /></div>
            <div className="reading-scale"><span>clear</span><span>milky</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Vial B cloudiness</span><strong>{ui.cB.toFixed(1)} %</strong></div>
            <div><span>Flask A temp</span><strong>{ui.TA.toFixed(1)} °C</strong></div>
            <div><span>Flask B temp</span><strong>{ui.TB.toFixed(1)} °C</strong></div>
            <div><span>Heat gap A−B</span><strong>{(ui.TA - ui.TB).toFixed(1)} °C</strong></div>
            <div><span>Room</span><strong>22.0 °C</strong></div>
            <div><span>Boil progress</span><strong>{(ui.cookB * 100).toFixed(0)}%</strong></div>
            <div><span>Airflow</span><strong>{ui.pumpOn ? 'ON' : 'off'}</strong></div>
            <div><span>Sim clock</span><strong>{fmtClock(ui.t)}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Meet the two flasks: A holds soaked, germinating seeds; B holds a second living batch.</li>
              <li>Light the Bunsen, drag flask B onto the tripod and boil until the seeds visibly cook (~30 s), then cool it under the tap.</li>
              <li>Tap the air pump — the same slow stream flows through both flasks and bubbles into both vials.</li>
              <li>Watch vial A turn milky while vial B stays clear; read the small temperature gap on the probes.</li>
              <li>Record readings, then answer the conclusion in Observations with your own numbers.</li>
              <li>Explore: chill flask A in the fridge, or swap in dry dormant seeds and rinse the vials.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Only one variable differs between the flasks — life. Same seeds, same airflow, same lime water. That is what makes the comparison fair.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Which seeds respire?</h3>
            <div className="resp-conclusion" data-nudge="conclude">
              {conclusion !== 'correct' ? (
                <>
                  <p className="observation-note">Answer from your own data below — every option is judged against your cloudiness and temperature numbers.</p>
                  <div className="resp-options">
                    <button type="button" onClick={() => answerConclusion(0)}>Both batches — seeds always release carbon dioxide.</button>
                    <button type="button" onClick={() => answerConclusion(1)}>Only the living, germinating seeds — they release CO₂ and a little heat; boiling killed the control.</button>
                    <button type="button" onClick={() => answerConclusion(2)}>Only the boiled seeds — heat makes seeds release carbon dioxide.</button>
                    <button type="button" onClick={() => answerConclusion(3)}>Neither — seeds are too small to respire.</button>
                  </div>
                  {conclusion === 'wrong' && (
                    <div className="resp-evidence">
                      <strong>Check your evidence:</strong> vial A currently reads {ui.cA.toFixed(0)}% milky and vial B {ui.cB.toFixed(0)}%, with a heat gap of {(ui.TA - ui.TB).toFixed(1)} °C. Where did the carbon dioxide come from?
                    </div>
                  )}
                </>
              ) : (
                <div className="resp-verdict">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>Correct — only the living, germinating seeds respire.</strong>
                    <p>They released carbon dioxide (vial A went milky) and a little heat (flask A ran ~1 °C above room). Boiling killed the control’s cells, so vial B stayed clear and flask B tracked the room.</p>
                  </div>
                </div>
              )}
            </div>

            <h3 style={{ marginTop: 18 }}>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">No readings banked yet. Press “Record reading” while the pump runs — each press stores both flasks’ live cloudiness and temperature.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Flask</th><th>Condition</th><th>Sim-time (s)</th><th>Cloudiness (%)</th><th>Temp (°C)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.flask}${r.id}`}><td>{Math.ceil(r.id / 2)}</td><td>{r.flask}</td><td>{r.condition}</td><td>{r.t.toFixed(0)}</td><td>{r.cloud.toFixed(1)}</td><td>{r.temp.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 style={{ marginTop: 18 }}>Cloudiness vs time</h3>
            {trace.length > 1 ? (
              <>
                <TraceChart series={cloudSeries} xLabel="sim time (s)" yLabel="cloudiness (%)" yMin={0} yMax={100} />
                <div className="resp-chartkey">
                  <span><i style={{ background: '#f97316' }} /> vial A — germinating seeds</span>
                  <span><i style={{ background: '#5d7a99' }} /> vial B — boiled control</span>
                </div>
              </>
            ) : (
              <p className="observation-note">Start the airflow and the trace will draw itself here — cloudiness for both vials, live series highlighted.</p>
            )}

            <h3 style={{ marginTop: 18 }}>Temperature trace</h3>
            {trace.length > 1 ? (
              <>
                <TraceChart series={tempSeries} xLabel="sim time (s)" yLabel="temperature (°C)" />
                <p className="observation-note">The full trace shows flask B’s boil-and-cool excursion. The close-up below zooms to 20.5–25.5 °C, where the living-seeds heat gap (~1 °C) lives.</p>
                <TraceChart series={tempClose} xLabel="sim time (s)" yLabel="temperature (°C)" yMin={20.5} yMax={25.5} height={170} />
              </>
            ) : (
              <p className="observation-note">Temperature points appear as the simulated clock runs — including flask B’s boil and cool-down.</p>
            )}
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Living cells respire: sugar and oxygen become carbon dioxide, water and released energy. Germinating seeds do it briskly because they are busy building roots and shoots; the carbon dioxide leaves the flask in the outgoing air and reacts with calcium hydroxide in the lime water, precipitating fine particles of chalk that turn it milky.</p>
            <div className="equation">C₆H₁₂O₆ + 6 O₂ → 6 CO₂ + 6 H₂O + energy</div>
            <p>Boiling the control seeds destroys their enzymes and kills every cell — a dead seed makes no carbon dioxide, so its vial stays crystal clear. That contrast is the whole experiment: the only difference between the flasks is life itself.</p>
            <p>Respiration also releases heat. A heap of germinating seeds runs roughly a degree above the room — small, but real, and exactly what careful thermometers show. Cooling slows the chemistry (roughly ×2.5 per 10 °C), which is why fridge-cold seeds cloud their vial about six times slower; and dry dormant seeds hardly respire at all, because enzymes need water to work.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={() => { /* observations completion flows through the conclusion card */ }}
    />
  );
}

// ---------------------------------------------------------------- SVG chart

interface Series { label: string; color: string; points: { x: number; y: number }[]; dashed?: boolean; live?: boolean }

function TraceChart(props: { series: Series[]; xLabel: string; yLabel: string; yMin?: number; yMax?: number; height?: number }) {
  const W = 560;
  const H = props.height ?? 200;
  const pad = { l: 46, r: 12, t: 10, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const xs = props.series.flatMap((s0) => s0.points.map((p) => p.x));
  const xMax = Math.max(60, ...xs, 1);
  const yMin = props.yMin ?? Math.min(0, ...props.series.flatMap((s0) => s0.points.map((p) => p.y)), 0);
  const yMaxRaw = props.yMax ?? Math.max(1, ...props.series.flatMap((s0) => s0.points.map((p) => p.y)));
  const yMax = yMaxRaw <= yMin ? yMin + 1 : yMaxRaw;
  const sx = (v: number) => pad.l + (v / xMax) * iw;
  const sy = (v: number) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * xMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * (yMax - yMin));
  const clipId = `respclip-${props.yLabel.replace(/[^a-z]/gi, '')}-${H}`;

  return (
    <svg className="resp-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${props.yLabel} versus ${props.xLabel} chart`}>
      <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="#f7f9fb" />
      {xTicks.map((v, i) => (
        <g key={`x${i}`}>
          <line x1={sx(v)} y1={pad.t} x2={sx(v)} y2={pad.t + ih} stroke="#e8edf2" strokeWidth="1" />
          <text x={sx(v)} y={H - pad.b + 13} fill="#9aa4b1" fontSize="9" textAnchor="middle">{v.toFixed(0)}</text>
        </g>
      ))}
      {yTicks.map((v, i) => (
        <g key={`y${i}`}>
          <line x1={pad.l} y1={sy(v)} x2={pad.l + iw} y2={sy(v)} stroke="#e8edf2" strokeWidth="1" />
          <text x={pad.l - 6} y={sy(v) + 3} fill="#9aa4b1" fontSize="9" textAnchor="end">{v.toFixed(1)}</text>
        </g>
      ))}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ih} stroke="#c5cdd6" strokeWidth="1.5" />
      <line x1={pad.l} y1={pad.t + ih} x2={pad.l + iw} y2={pad.t + ih} stroke="#c5cdd6" strokeWidth="1.5" />
      <text x={pad.l + iw / 2} y={H - 2} fill="#7a8795" fontSize="9" textAnchor="middle">{props.xLabel}</text>
      <text x={10} y={pad.t + ih / 2} fill="#7a8795" fontSize="9" textAnchor="middle" transform={`rotate(-90 10 ${pad.t + ih / 2})`}>{props.yLabel}</text>
      <clipPath id={clipId}>
        <rect x={pad.l} y={pad.t} width={iw} height={ih} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {props.series.map((s0) => (
          s0.points.length > 1 ? (
            <polyline
              key={s0.label}
              points={s0.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
              fill="none"
              stroke={s0.color}
              strokeWidth={s0.live ? 2.4 : 1.8}
              strokeDasharray={s0.dashed ? '4 4' : undefined}
              strokeLinejoin="round"
            />
          ) : null
        ))}
        {props.series.filter((s0) => s0.live && s0.points.length > 0).map((s0) => (
          <circle key={`${s0.label}-live`} cx={sx(s0.points[s0.points.length - 1].x)} cy={sy(s0.points[s0.points.length - 1].y)} r="4" fill={s0.color} stroke="#fff" strokeWidth="1.5" />
        ))}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- canvas art

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFlask(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, f: Flask, t: number, accent: string) {
  const inFridge = f.zone === 'fridge';
  ctx.save();
  if (inFridge) ctx.globalAlpha = 0.96;

  // conical body + neck outline
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y - 52 * s);
  ctx.lineTo(x - 42 * s, y + 46 * s);
  ctx.quadraticCurveTo(x - 44 * s, y + 56 * s, x - 32 * s, y + 56 * s);
  ctx.lineTo(x + 32 * s, y + 56 * s);
  ctx.quadraticCurveTo(x + 44 * s, y + 56 * s, x + 42 * s, y + 46 * s);
  ctx.lineTo(x + 10 * s, y - 52 * s);
  ctx.lineTo(x + 10 * s, y - 62 * s);
  ctx.lineTo(x - 10 * s, y - 62 * s);
  ctx.closePath();
  const glass = ctx.createLinearGradient(x - 40 * s, 0, x + 40 * s, 0);
  glass.addColorStop(0, 'rgba(255,255,255,0.62)');
  glass.addColorStop(0.55, 'rgba(214,230,240,0.42)');
  glass.addColorStop(1, 'rgba(255,255,255,0.55)');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // glass highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.moveTo(x - 20 * s, y + 22 * s);
  ctx.lineTo(x - 7 * s, y - 34 * s);
  ctx.stroke();

  // seeds pile
  for (let i = 0; i < SEED_PILE.length; i += 1) {
    const sp = SEED_PILE[i];
    const alive = f.seeds === 'germinating' || f.seeds === 'soaked';
    const swell = alive ? 1 + 0.035 * Math.sin(t * 1.1 + i * 1.7) : 1;
    const rr = sp.r * (f.seeds === 'dry' ? 0.68 : 1) * swell;
    ctx.save();
    ctx.translate(x + sp.dx * 26 * s, y + 34 * s + sp.dy * 11 * s);
    ctx.rotate(sp.rot);
    ctx.fillStyle = seedColor(f.seeds, f.cook);
    ctx.strokeStyle = 'rgba(90,70,40,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8 * s * rr, 5.5 * s * rr, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (f.seeds === 'germinating') {
      ctx.strokeStyle = '#8fbc7a';
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.moveTo(0, -4 * s * rr);
      ctx.lineTo(1.5 * s, -9 * s * rr);
      ctx.stroke();
    }
    ctx.restore();
  }

  // neck accent band (A orange / B slate)
  ctx.fillStyle = accent;
  roundRect(ctx, x - 10 * s, y - 52 * s, 20 * s, 5 * s, 2);
  ctx.fill();

  // cotton bung
  ctx.fillStyle = '#efe7d2';
  roundRect(ctx, x - 12 * s, y - 88 * s, 24 * s, 12 * s, 4 * s);
  ctx.fill();
  ctx.strokeStyle = '#c9bda0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // side arm (delivery tube stub, right side)
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(x + 10 * s, y - 58 * s);
  ctx.lineTo(x + 24 * s, y - 58 * s);
  ctx.stroke();

  // thermometer probe in the bung
  const colH = clamp((f.temp - 4) / 116, 0.05, 1) * 24 * s;
  ctx.strokeStyle = '#cfd8e0';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 88 * s);
  ctx.lineTo(x + 1 * s, y - 112 * s);
  ctx.stroke();
  ctx.fillStyle = tempColor(f.temp);
  roundRect(ctx, x - 0.25 * s, y - 88 * s - colH, 2.5 * s, colH, 1.2 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 1 * s, y - 84 * s, 4 * s, 0, Math.PI * 2);
  ctx.fill();
  // scale ticks (shapes only — no text on the canvas)
  ctx.strokeStyle = '#aab6c1';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k += 1) {
    const ty = y - 112 * s + (k / 4) * 24 * s;
    ctx.beginPath();
    ctx.moveTo(x + 3 * s, ty);
    ctx.lineTo(x + 7 * s, ty);
    ctx.stroke();
  }

  if (inFridge) {
    ctx.fillStyle = 'rgba(150,200,235,0.16)';
    ctx.beginPath();
    ctx.moveTo(x - 10 * s, y - 52 * s);
    ctx.lineTo(x - 42 * s, y + 46 * s);
    ctx.quadraticCurveTo(x - 44 * s, y + 56 * s, x - 32 * s, y + 56 * s);
    ctx.lineTo(x + 32 * s, y + 56 * s);
    ctx.quadraticCurveTo(x + 44 * s, y + 56 * s, x + 42 * s, y + 46 * s);
    ctx.lineTo(x + 10 * s, y - 52 * s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawVial(ctx: CanvasRenderingContext2D, L: Layout, id: 'A' | 'B', sim: Sim) {
  const s = L.s;
  const f = sim.flasks[id];
  const v = L.vial[id];
  const vw = 30 * s;
  const vh = 48 * s;
  const top = L.benchY - vh;
  const liquidTop = L.benchY - 20 * s;
  const cloud = clamp(f.cloud, 0, 100) / 100;

  // liquid
  ctx.fillStyle = 'rgba(202,228,240,0.6)';
  ctx.fillRect(v.x - vw / 2 + 2, liquidTop, vw - 4, L.benchY - liquidTop - 2);
  if (cloud > 0.01) {
    ctx.fillStyle = `rgba(250,250,242,${(cloud * 0.92).toFixed(3)})`;
    ctx.fillRect(v.x - vw / 2 + 2, liquidTop, vw - 4, L.benchY - liquidTop - 2);
  }
  // meniscus
  ctx.strokeStyle = cloud > 0.35 ? 'rgba(240,240,230,0.95)' : 'rgba(160,195,215,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(v.x - vw / 2 + 3, liquidTop);
  ctx.quadraticCurveTo(v.x, liquidTop - 3, v.x + vw / 2 - 3, liquidTop);
  ctx.stroke();

  // bubbles
  if (sim.pumpOn) {
    for (const b of sim.bubbles) {
      if (b.vial !== id) continue;
      const by = liquidTop + (1 - b.y) * (L.benchY - liquidTop - 4);
      const bx = v.x + b.x * s + Math.sin(b.ph + b.y * 9) * 3 * s;
      if (by < liquidTop - 1) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, b.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // glass
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.6;
  roundRect(ctx, v.x - vw / 2, top, vw, vh, 5 * s);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(v.x - vw / 2 + 4, top + 6);
  ctx.lineTo(v.x - vw / 2 + 4, L.benchY - 5);
  ctx.stroke();

  // identity band
  ctx.fillStyle = id === 'A' ? '#f97316' : '#5d7a99';
  roundRect(ctx, v.x - vw / 2, top - 4 * s, vw, 4 * s, 2 * s);
  ctx.fill();

  // delivery tube dipping into the vial
  ctx.strokeStyle = '#a9c0ce';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(v.x, top - 2);
  ctx.lineTo(v.x, liquidTop + 10 * s);
  ctx.stroke();
}

function drawTubes(ctx: CanvasRenderingContext2D, L: Layout, sim: Sim, posA: Pt, posB: Pt, t: number) {
  const s = L.s;

  const delivery = (from: Pt, v: Pt) => {
    const x1 = from.x + 24 * s;
    const y1 = from.y - 58 * s;
    const x2 = v.x;
    const y2 = L.benchY - 48 * s;
    const cx = (x1 + x2) / 2;
    const cy = Math.max(y1, y2) + 26 * s;
    ctx.strokeStyle = '#a9c0ce';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(238,246,250,0.9)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    if (sim.pumpOn) {
      ctx.save();
      ctx.strokeStyle = 'rgba(249,115,22,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 10]);
      ctx.lineDashOffset = -((t * 34) % 13);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
      ctx.restore();
    }
  };

  const inlet = (from: Pt, portY: number) => {
    const x1 = from.x - 24 * s;
    const y1 = from.y - 58 * s;
    const x2 = L.pump.x - 33 * s;
    const y2 = L.pump.y + portY;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 + 30 * s;
    ctx.strokeStyle = '#b9cbd6';
    ctx.lineWidth = 4.5 * s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    if (sim.pumpOn) {
      ctx.save();
      ctx.strokeStyle = 'rgba(94,140,180,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 10]);
      ctx.lineDashOffset = -((t * 34) % 13);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      ctx.restore();
    }
  };

  delivery(posA, L.vial.A);
  delivery(posB, L.vial.B);
  inlet(posA, -8 * s);
  inlet(posB, 8 * s);
}

function drawPump(ctx: CanvasRenderingContext2D, L: Layout, t: number, sim: Sim) {
  const s = L.s;
  const p = L.pump;
  const wob = sim.pumpOn ? Math.sin(t * 26) * 0.8 : 0;
  ctx.save();
  ctx.translate(0, wob);
  const g = ctx.createLinearGradient(0, p.y - 18 * s, 0, p.y + 18 * s);
  g.addColorStop(0, '#54627a');
  g.addColorStop(1, '#3c4756');
  ctx.fillStyle = g;
  roundRect(ctx, p.x - 33 * s, p.y - 18 * s, 66 * s, 34 * s, 7 * s);
  ctx.fill();
  ctx.strokeStyle = '#2e3846';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#8da8b9';
  roundRect(ctx, p.x - 38 * s, p.y - 11 * s, 6 * s, 6 * s, 2 * s);
  ctx.fill();
  roundRect(ctx, p.x - 38 * s, p.y + 5 * s, 6 * s, 6 * s, 2 * s);
  ctx.fill();
  const pulse = sim.pumpOn ? 1 + 0.14 * Math.sin(t * 9) : 1;
  ctx.fillStyle = sim.pumpOn ? '#e8b04b' : '#93a0af';
  ctx.beginPath();
  ctx.arc(p.x - 6 * s, p.y, 9 * s * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e3846';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = sim.pumpOn ? '#7ac86a' : '#7d8a99';
  ctx.beginPath();
  ctx.arc(p.x + 18 * s, p.y - 8 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();
  if (sim.pumpOn) {
    ctx.fillStyle = 'rgba(122,200,106,0.25)';
    ctx.beginPath();
    ctx.arc(p.x + 18 * s, p.y - 8 * s, 6 * s + Math.sin(t * 3) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBurnerRig(ctx: CanvasRenderingContext2D, L: Layout, t: number, sim: Sim) {
  const s = L.s;
  const x = L.tripod.x;
  const benchY = L.benchY;

  // flame (behind the gauze and flask)
  if (sim.burnerLit) {
    const flick = 1 + 0.07 * Math.sin(t * 13) + 0.04 * Math.sin(t * 29 + 1.7);
    const baseY = benchY - 28 * s;
    const tipY = benchY - 84 * s;
    const flameH = (baseY - tipY) * flick;
    const grad = ctx.createLinearGradient(0, baseY, 0, baseY - flameH);
    grad.addColorStop(0, 'rgba(120,170,255,0.65)');
    grad.addColorStop(0.55, 'rgba(96,140,240,0.4)');
    grad.addColorStop(1, 'rgba(130,170,255,0.05)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, baseY);
    ctx.quadraticCurveTo(x - 11 * s, baseY - flameH * 0.5, x + Math.sin(t * 9) * 2, baseY - flameH);
    ctx.quadraticCurveTo(x + 11 * s, baseY - flameH * 0.5, x + 9 * s, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(190,215,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, baseY);
    ctx.quadraticCurveTo(x - 4.5 * s, baseY - flameH * 0.3, x, baseY - flameH * 0.42);
    ctx.quadraticCurveTo(x + 4.5 * s, baseY - flameH * 0.3, x + 4 * s, baseY);
    ctx.closePath();
    ctx.fill();
  }

  // tripod legs + head + gauze
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(x - 30 * s, benchY);
  ctx.lineTo(x - 13 * s, benchY - 86 * s);
  ctx.moveTo(x + 30 * s, benchY);
  ctx.lineTo(x + 13 * s, benchY - 86 * s);
  ctx.moveTo(x, benchY);
  ctx.lineTo(x, benchY - 86 * s);
  ctx.stroke();
  ctx.fillStyle = '#4b5563';
  roundRect(ctx, x - 36 * s, benchY - 92 * s, 72 * s, 6 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = '#c8cfd7';
  roundRect(ctx, x - 26 * s, benchY - 96 * s, 52 * s, 5 * s, 2 * s);
  ctx.fill();
  ctx.strokeStyle = '#9aa4ae';
  ctx.lineWidth = 0.7;
  for (let i = -24; i <= 24; i += 6) {
    ctx.beginPath();
    ctx.moveTo(x + i * s, benchY - 96 * s);
    ctx.lineTo(x + i * s, benchY - 91 * s);
    ctx.stroke();
  }

  // bunsen burner body
  const brass = ctx.createLinearGradient(x - 8 * s, 0, x + 8 * s, 0);
  brass.addColorStop(0, '#e6c268');
  brass.addColorStop(0.5, '#d9a441');
  brass.addColorStop(1, '#a87c2c');
  ctx.fillStyle = brass;
  roundRect(ctx, x - 7 * s, benchY - 26 * s, 14 * s, 22 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = '#3c4756';
  roundRect(ctx, x - 13 * s, benchY - 6 * s, 26 * s, 7 * s, 3 * s);
  ctx.fill();
  roundRect(ctx, x - 11 * s, benchY - 30 * s, 22 * s, 6 * s, 2 * s);
  ctx.fill();
  ctx.fillStyle = sim.burnerLit ? '#f9b44a' : '#242c37';
  ctx.beginPath();
  ctx.arc(x, benchY - 22 * s, 2.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7d8a99';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(x + 13 * s, benchY - 3 * s);
  ctx.lineTo(x + 30 * s, benchY - 3 * s);
  ctx.stroke();
}

function drawTap(ctx: CanvasRenderingContext2D, L: Layout, t: number, sim: Sim) {
  const s = L.s;
  const tapX = L.tap.x;
  const benchY = L.benchY;

  // basin on the bench
  ctx.fillStyle = 'rgba(160,200,230,0.5)';
  roundRect(ctx, tapX - 26 * s, benchY - 20 * s, 52 * s, 18 * s, 4 * s);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.6;
  roundRect(ctx, tapX - 30 * s, benchY - 24 * s, 60 * s, 24 * s, 5 * s);
  ctx.stroke();

  // wall bracket + arm
  ctx.fillStyle = '#5d6a79';
  roundRect(ctx, tapX + 10 * s, 26, 16 * s, 18 * s, 4 * s);
  ctx.fill();
  ctx.strokeStyle = '#7d8a99';
  ctx.lineWidth = 6 * s;
  ctx.beginPath();
  ctx.moveTo(tapX + 12 * s, 44);
  ctx.quadraticCurveTo(tapX + 6 * s, 52, L.spout.x, L.spout.y - 4);
  ctx.stroke();
  ctx.strokeStyle = '#aab6c1';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(tapX + 12 * s, 43);
  ctx.quadraticCurveTo(tapX + 6 * s, 51, L.spout.x, L.spout.y - 4);
  ctx.stroke();
  ctx.fillStyle = '#5d6a79';
  roundRect(ctx, L.spout.x - 4 * s, L.spout.y - 4, 8 * s, 8 * s, 2 * s);
  ctx.fill();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(tapX + 18 * s, 30);
  ctx.lineTo(tapX + 24 * s, 22);
  ctx.stroke();

  // water stream when a flask is under the tap
  const active = sim.flasks.A.zone === 'tap' || sim.flasks.B.zone === 'tap';
  if (active) {
    const endY = L.tap.y - 66 * s;
    ctx.strokeStyle = 'rgba(150,200,235,0.55)';
    ctx.lineWidth = 7 * s;
    ctx.beginPath();
    ctx.moveTo(L.spout.x, L.spout.y);
    for (let i = 1; i <= 6; i += 1) {
      const f = i / 6;
      const yy = L.spout.y + (endY - L.spout.y) * f;
      const xx = L.spout.x + Math.sin(t * 7 + i) * 2.2 * s * f;
      ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,235,250,0.7)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(L.spout.x, L.spout.y);
    ctx.lineTo(L.spout.x, endY);
    ctx.stroke();
  }
}

function drawFridge(ctx: CanvasRenderingContext2D, L: Layout, t: number) {
  const s = L.s;
  const x = L.fridge.x;
  const top = L.benchY - 128 * s;
  const wdt = 92 * s;
  const hgt = 128 * s;

  ctx.fillStyle = '#e6edf3';
  roundRect(ctx, x - wdt / 2, top, wdt, hgt, 8 * s);
  ctx.fill();
  ctx.strokeStyle = '#9fb2c2';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = '#cfe0ec';
  roundRect(ctx, x - wdt / 2 + 7 * s, top + 9 * s, wdt - 14 * s, hgt - 22 * s, 5 * s);
  ctx.fill();
  ctx.strokeStyle = '#9fb2c2';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - wdt / 2 + 6 * s, top + hgt * 0.62);
  ctx.lineTo(x + wdt / 2 - 6 * s, top + hgt * 0.62);
  ctx.stroke();
  ctx.fillStyle = '#7d8a99';
  roundRect(ctx, x + wdt / 2 - 14 * s, top + 12 * s, 4.5 * s, 22 * s, 2 * s);
  ctx.fill();
  // snowflake mark (pure shapes)
  ctx.strokeStyle = '#5d7a99';
  ctx.lineWidth = 1.8;
  const cy = top + hgt * 0.8;
  const cr = 9 * s;
  for (let k = 0; k < 3; k += 1) {
    const a = (k * Math.PI) / 3 + 0.26;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * cr, cy - Math.sin(a) * cr);
    ctx.lineTo(x + Math.cos(a) * cr, cy + Math.sin(a) * cr);
    ctx.stroke();
  }
  const aura = 0.12 + 0.05 * Math.sin(t * 1.4);
  ctx.fillStyle = `rgba(150,200,235,${aura.toFixed(3)})`;
  roundRect(ctx, x - wdt / 2 - 5 * s, top - 5 * s, wdt + 10 * s, hgt + 10 * s, 11 * s);
  ctx.fill();
}

function drawTray(ctx: CanvasRenderingContext2D, L: Layout, sim: Sim) {
  const s = L.s;
  const tray = L.bags[0];
  const trayX = tray.x - 17 * s;
  const trayY = tray.y - 15 * s;
  ctx.fillStyle = '#e0e7ed';
  roundRect(ctx, trayX, trayY, 66 * s, 30 * s, 6 * s);
  ctx.fill();
  ctx.strokeStyle = '#aab6c1';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  for (const b of L.bags) {
    if (sim.bagDrag && sim.bagDrag.bag === b.kind) continue;
    drawBag(ctx, b.x, b.y, s, b.kind, 0, false);
  }
}

function drawBag(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: BagKind, t: number, lifted: boolean) {
  ctx.save();
  if (lifted) {
    ctx.shadowColor = 'rgba(23,35,52,0.25)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;
  }
  const bw = 22 * s;
  const bh = 28 * s;
  ctx.fillStyle = kind === 'dry' ? '#e6d9bd' : '#dfe8cf';
  ctx.beginPath();
  ctx.moveTo(x - bw / 2, y - bh / 2);
  ctx.lineTo(x + bw / 2, y - bh / 2);
  ctx.lineTo(x + bw / 2 - 2 * s, y + bh / 2);
  ctx.quadraticCurveTo(x, y + bh / 2 + 4 * s, x - bw / 2 + 2 * s, y + bh / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = kind === 'dry' ? '#b7a687' : '#a9b48c';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  for (let i = -1; i <= 1; i += 1) {
    ctx.fillStyle = seedColor(kind === 'dry' ? 'dry' : 'germinating', 0);
    ctx.beginPath();
    ctx.ellipse(x + i * 6 * s, y - bh / 2, 4 * s * (kind === 'dry' ? 0.7 : 1), 2.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#b7a687';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - bw / 2 + 2 * s, y - bh / 2 + 4 * s);
  ctx.lineTo(x + bw / 2 - 2 * s, y - bh / 2 + 4 * s);
  ctx.stroke();
  if (kind === 'germinating') {
    const sway = Math.sin(t * 2 + x * 0.1) * 1.5 * s;
    ctx.strokeStyle = '#8fbc7a';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.moveTo(x, y + 2 * s);
    ctx.lineTo(x + sway, y - 6 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + sway, y - 6 * s);
    ctx.quadraticCurveTo(x + sway + 4 * s, y - 8 * s, x + sway + 5 * s, y - 4 * s);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#a08e6d';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y + 2 * s);
    ctx.lineTo(x + 5 * s, y + 2 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, L: Layout, sim: Sim, t: number) {
  const s = L.s;

  // steam from hot flasks / fridge mist
  for (const p of sim.puffs) {
    let px = 0;
    let py = 0;
    if (p.kind === 'steam') {
      const src = p.ph > 1.6 ? flaskPos('B', L, sim) : flaskPos('A', L, sim);
      px = src.x + p.x * s;
      py = src.y - 90 * s - p.y * s;
    } else {
      px = L.fridge.x + p.x * s - 15 * s;
      py = L.benchY - 60 * s + p.y * s * 0.4;
    }
    ctx.fillStyle = p.kind === 'steam'
      ? `rgba(255,255,255,${(0.4 * p.life).toFixed(3)})`
      : `rgba(170,215,245,${(0.35 * p.life).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px + Math.sin(p.ph + t * 2) * 3, py, p.r * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // tap droplets
  for (const d of sim.drops) {
    ctx.fillStyle = `rgba(150,200,235,${(0.8 * clamp(d.life, 0, 1)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(L.spout.x + d.x * s, L.spout.y + 10 + d.y * (L.tap.y - L.spout.y) * 1.6, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}
