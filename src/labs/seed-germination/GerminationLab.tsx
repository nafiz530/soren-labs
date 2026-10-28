import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './seed-germination.css';

/**
 * Seed germination — six petri dishes, one honest question.
 *
 * The student prepares a classic comparison (control, dry, oil-sealed, fridge,
 * flooded, dark), sets a simulated day/night clock running, and watches beans
 * swell, split and sprout with stochastic, condition-driven timing. Tapping a
 * dish opens a magnified seed dissection; recorded days build germination
 * curves; the conclusion card settles the classic myth: light is not needed.
 */

const SEEDS_PER_DISH = 10;
const DAY_SECONDS = 10; // 1 simulated day at 1× playback
const COLD_FACTOR = 1 / 6; // fridge 5 °C slows development ~6×
const FLOOD_FACTOR = 0.45; // waterlogged-but-open germination rate

const DISH_COLORS = ['#f97316', '#a3835f', '#8a6fae', '#5b8db8', '#3fa3a0', '#33415c'];
const DISH_NOTES = [
  'control — moist, warm, air',
  'dry paper',
  'flooded + oil-sealed lid',
  'moist, in the fridge',
  'flooded, lid open',
  'dark hood, otherwise perfect',
];

const STAGE_NAMES = ['Dormant', 'Swelling', 'Testa split', 'Radicle out', 'Shoot up', 'First leaves', 'Rotting'];

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'prepare', title: 'Prepare the six dishes', detail: 'The bench is preset with the classic comparison: control, dry, oil-sealed, fridge-cold, flooded and dark. Change any dish with the condition chips — or arm the watering can and hold it over a dish to pour.', hint: 'Tap a dish to inspect its seeds; drag it into the fridge compartment to chill it.' },
  { id: 'clock', title: 'Set the clock running', detail: 'Press “Set the clock running”. One simulated day passes about every ten seconds — speed up to 4× or 16× once you have seen the first swelling.', hint: 'The window shows day and night; germination carries on through both.' },
  { id: 'imbibe', title: 'Spot imbibition and the testa split', detail: 'Watch the control dish: seeds visibly fatten as they drink (imbibition), then the seed coat — the testa — splits open.', hint: 'Dry seeds stay wrinkled and dormant; that is the comparison doing its job.' },
  { id: 'anatomy', title: 'Name radicle and plumule', detail: 'Tap any dish to open the magnified seed dissection. Match the parts: testa, the two cotyledons, the radicle (baby root) and the plumule (baby shoot).', hint: 'Hover the label chips to light up each part inside the dissection.' },
  { id: 'record', title: 'Record three different days', detail: 'Bank the germinated count for all six dishes with “Record day”. A seed counts once its radicle is visible — at least three different days makes an honest curve.', hint: 'Day 1 with zero sprouts is a perfectly good baseline row.' },
  { id: 'conclude', title: 'Answer the conclusion', detail: 'Open Observations and pick what seeds actually need to germinate. Your own dish data is the evidence — including the dark one.', hint: 'One of the four options is a myth.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-sprout', title: 'First sprout', icon: '🌱', detail: 'Watched the first radicle break through in the control dish.' },
  { id: 'myth-buster', title: 'Myth buster', icon: '🌙', detail: 'Showed the dark dish germinating — and left light out of the conclusion.' },
  { id: 'anatomy', title: 'Seed anatomist', icon: '⌖', detail: 'Opened the magnified seed dissection.' },
  { id: 'three-days', title: 'Three days logged', icon: '✎', detail: 'Recorded germination counts on three different days.' },
  { id: 'full-seedling', title: 'Full seedling', icon: '🌿', detail: 'Grew one seed all the way to its first leaves.' },
];

// ---------------------------------------------------------------- types

type WaterLevel = number; // 0 dry · 1 moist · 2 standing water (float while pouring)

interface Seed {
  /** Position inside the dish, unit disc coords. */
  x: number;
  y: number;
  /** Resting orientation of the bean. */
  ang: number;
  /** Random phase for the idle swelling wobble. */
  phase: number;
  /** Cumulative effective-day thresholds for each stage. */
  tImb: number;
  tSplit: number;
  tRad: number;
  tPlum: number;
  tLeaf: number;
  /** Accumulated development in effective days (grows only while conditions allow). */
  dev: number;
  /** Accumulated wet days — drives rot timing when oxygen is missing. */
  wet: number;
  /** Rot fuzz progress 0..1. */
  rot: number;
  /** Whether this seed is one of the ~50 % that manages in open standing water. */
  floodViable: boolean;
  /** Wet days this seed tolerates under an oil seal before it rots. */
  rotAt: number;
}

interface Dish {
  water: WaterLevel;
  sealed: boolean;
  inFridge: boolean;
  dark: boolean;
  seeds: Seed[];
  germSeen: boolean;
  rotSeen: boolean;
}

interface Mote { x: number; y: number; vx: number; vy: number; p: number; s: number }
interface Drop { dish: number; x: number; y: number; vy: number }
type Ev = { kind: 'germ' | 'leaf' | 'rot' | 'dark80'; dish: number };

interface DayRow { day: number; counts: number[] }

interface UiSnap {
  simDays: number;
  day: number;
  hour: number;
  minute: number;
  running: boolean;
  started: boolean;
  counts: number[];
  water: number[];
  sealed: boolean[];
  inFridge: boolean[];
  dark: boolean[];
  maxStage: number[];
  anySplit: boolean;
  anyRot: boolean;
  controlPct: number;
  darkPct: number;
}

// ---------------------------------------------------------------- model

function stageOf(s: Seed): number {
  if (s.rot > 0.05) return 6;
  if (s.dev >= s.tLeaf) return 5;
  if (s.dev >= s.tPlum) return 4;
  if (s.dev >= s.tRad) return 3;
  if (s.dev >= s.tSplit) return 2;
  if (s.dev >= s.tImb) return 1;
  return 0;
}

function germinated(d: Dish): number {
  let n = 0;
  for (const s of d.seeds) {
    const st = stageOf(s);
    if (st >= 3 && st <= 5) n += 1;
  }
  return n;
}

function makeSeed(x: number, y: number): Seed {
  const tImb = 0.7 + Math.random() * 0.7;
  const tSplit = tImb + 0.25 + Math.random() * 0.5;
  const tRad = tSplit + 0.2 + Math.random() * 0.5;
  const tPlum = tRad + 1.0 + Math.random() * 1.2;
  const tLeaf = tPlum + 1.0 + Math.random() * 1.6;
  return {
    x, y,
    ang: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2,
    tImb, tSplit, tRad, tPlum, tLeaf,
    dev: 0, wet: 0, rot: 0,
    floodViable: Math.random() < 0.5,
    rotAt: 2.2 + Math.random() * 1.6,
  };
}

function makeSeeds(): Seed[] {
  const out: Seed[] = [];
  for (let i = 0; i < SEEDS_PER_DISH; i++) {
    const r = 0.62 * Math.sqrt((i + 0.5) / SEEDS_PER_DISH);
    const th = i * 2.399963 + Math.random() * 0.5;
    out.push(makeSeed(r * Math.cos(th), r * Math.sin(th)));
  }
  return out;
}

function makeDishes(): Dish[] {
  const fresh = (): { seeds: Seed[]; germSeen: boolean; rotSeen: boolean } => ({
    seeds: makeSeeds(), germSeen: false, rotSeen: false,
  });
  return [
    { water: 1, sealed: false, inFridge: false, dark: false, ...fresh() },
    { water: 0, sealed: false, inFridge: false, dark: false, ...fresh() },
    { water: 2, sealed: true, inFridge: false, dark: false, ...fresh() },
    { water: 1, sealed: false, inFridge: true, dark: false, ...fresh() },
    { water: 2, sealed: false, inFridge: false, dark: false, ...fresh() },
    { water: 1, sealed: false, inFridge: false, dark: true, ...fresh() },
  ];
}

function makeMotes(): Mote[] {
  const out: Mote[] = [];
  for (let i = 0; i < 16; i++) {
    out.push({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.014,
      vy: -0.005 - Math.random() * 0.012,
      p: Math.random() * Math.PI * 2,
      s: 0.6 + Math.random() * 1.5,
    });
  }
  return out;
}

function waterName(lv: number): string {
  if (lv < 0.35) return 'Dry paper';
  if (lv < 1.65) return 'Moist paper';
  return 'Standing water';
}

function phaseName(hour: number): string {
  if (hour < 5) return 'Night';
  if (hour < 11) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 21) return 'Evening';
  return 'Night';
}

// ---------------------------------------------------------------- color helpers

function hexToRgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const k = clamp(t, 0, 1);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
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

// ---------------------------------------------------------------- layout

interface Slot { x: number; y: number; r: number }

function layoutFor(w: number, h: number) {
  const narrow = w < 620;
  const fw = narrow ? clamp(w * 0.32, 96, 130) : clamp(w * 0.2, 118, 168);
  const fridge = { x: 10, y: 56, w: fw, h: h - 74 };
  const gx = fridge.x + fridge.w + 16;
  const gw = Math.max(70, w - gx - 14);
  const cols = narrow ? 2 : 3;
  const rows = narrow ? 3 : 2;
  const gap = 12;
  const cw = (gw - (cols - 1) * gap) / cols;
  const ch = (h - 66 - (rows - 1) * gap) / rows;
  const slots: Slot[] = [];
  for (let i = 0; i < 6; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      x: gx + col * (cw + gap) + cw / 2,
      y: 62 + row * (ch + gap) + ch / 2,
      r: Math.max(24, Math.min(cw, ch) * 0.42),
    });
  }
  return { narrow, fridge, slots, lamp: { x: w - 88, y: 8, w: 68, h: 44 } };
}

function dishPositions(lay: ReturnType<typeof layoutFor>, s: { dishes: Dish[]; drag: { dish: number; x: number; y: number } | null }): Slot[] {
  const fridgeIdx: number[] = [];
  s.dishes.forEach((d, i) => { if (d.inFridge) fridgeIdx.push(i); });
  const inner = { x: lay.fridge.x + 10, y: lay.fridge.y + 14, w: lay.fridge.w - 20, h: lay.fridge.h - 28 };
  const n = Math.max(1, fridgeIdx.length);
  return s.dishes.map((d, i) => {
    if (s.drag && s.drag.dish === i) return { x: s.drag.x, y: s.drag.y, r: lay.slots[i].r };
    if (d.inFridge) {
      const k = fridgeIdx.indexOf(i);
      const ch = inner.h / n;
      return { x: inner.x + inner.w / 2, y: inner.y + ch * (k + 0.5), r: Math.max(20, Math.min(inner.w, ch) * 0.4) };
    }
    return lay.slots[i];
  });
}

// ---------------------------------------------------------------- seed drawing

function drawSeedShape(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, sz: number, ang: number,
  seed: Seed, t: number, wet: boolean,
) {
  const st = stageOf(seed);
  const swell = clamp(seed.dev / seed.tImb, 0, 1);
  const wob = wet ? Math.sin(t * 2.2 + seed.phase) * 0.022 : 0;
  const scale = (0.82 + 0.36 * swell) * (1 + wob) * (1 - 0.2 * seed.rot);
  const s = sz * scale;
  const coat = mix(mix('#b98d5e', '#dcb87f', swell), '#79705e', seed.rot);
  const coatEdge = mix('#8a6420', '#5d5748', seed.rot);

  if (st <= 1) {
    // whole bean
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.66, ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = coatEdge;
    ctx.lineWidth = Math.max(0.8, s * 0.09);
    ctx.stroke();
    // hilum scar
    ctx.fillStyle = 'rgba(90,60,30,0.55)';
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(ang + 1.1) * s * 0.78, y + Math.sin(ang + 1.1) * s * 0.5, s * 0.14, s * 0.1, ang, 0, Math.PI * 2);
    ctx.fill();
    // wrinkles while dry
    if (swell < 0.45) {
      ctx.strokeStyle = 'rgba(110,80,45,0.4)';
      ctx.lineWidth = Math.max(0.5, s * 0.05);
      for (let k = 0; k < 3; k++) {
        const a = ang + 0.5 + k * 0.7;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * s * 0.2, y + Math.sin(a) * s * 0.14);
        ctx.lineTo(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.5);
        ctx.stroke();
      }
    }
  } else {
    // testa split — two cotyledon halves drifting apart
    const open = 0.1 + 0.18 * clamp((seed.dev - seed.tSplit) / 0.8, 0, 1);
    const ox = Math.cos(ang + Math.PI / 2) * s * open;
    const oy = Math.sin(ang + Math.PI / 2) * s * open * 0.7;
    for (const dir of [-1, 1]) {
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.ellipse(x + ox * dir, y + oy * dir, s * 0.92, s * 0.62, ang, dir === -1 ? Math.PI / 2 : -Math.PI / 2, dir === -1 ? (Math.PI * 3) / 2 : Math.PI / 2);
      ctx.fill();
      ctx.strokeStyle = coatEdge;
      ctx.lineWidth = Math.max(0.8, s * 0.09);
      ctx.stroke();
      // inner face — lighter food-store flesh
      ctx.fillStyle = mix('#e9d9a8', '#a89a78', seed.rot);
      ctx.beginPath();
      ctx.ellipse(x + ox * dir * 0.94, y + oy * dir * 0.94, s * 0.5, s * 0.36, ang, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // radicle — the baby root, always growing DOWN (gravitropism)
  if (st >= 3) {
    const radP = clamp((seed.dev - seed.tRad) / 1.3, 0, 1);
    const len = s * (0.8 + 3.4 * radP);
    const rx = x + Math.cos(ang + Math.PI / 2) * s * 0.15;
    const ry = y + s * 0.45;
    const rc = mix('#f2ead6', '#9a8a70', seed.rot);
    ctx.strokeStyle = rc;
    ctx.lineWidth = Math.max(1.1, s * 0.3 * (1 - radP * 0.45));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.bezierCurveTo(rx - s * 0.5, ry + len * 0.45, rx + s * 0.35, ry + len * 0.7, rx - s * 0.08, ry + len);
    ctx.stroke();
    if (radP > 0.5) {
      // root hairs
      ctx.lineWidth = Math.max(0.5, s * 0.07);
      ctx.strokeStyle = mix('#efe6cf', '#9a8a70', seed.rot);
      for (let k = 0; k < 4; k++) {
        const f = 0.45 + k * 0.16;
        const hx = rx - s * 0.5 * (1 - f) + s * 0.85 * f * 0.6;
        const hy = ry + len * f;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - s * 0.28, hy + s * 0.1);
        ctx.moveTo(hx + s * 0.2, hy - s * 0.05);
        ctx.lineTo(hx + s * 0.42, hy + s * 0.08);
        ctx.stroke();
      }
    }
  }

  // plumule — the baby shoot, curving UP
  if (st >= 4) {
    const shootP = clamp((seed.dev - seed.tPlum) / 1.6, 0, 1);
    const leafP = st >= 5 ? clamp((seed.dev - seed.tLeaf) / 1.2, 0, 1) : 0;
    const len = s * (0.6 + 3.0 * shootP);
    const bx = x - Math.cos(ang + Math.PI / 2) * s * 0.1;
    const by = y - s * 0.42;
    ctx.strokeStyle = mix('#6fae5a', '#8b8a6a', seed.rot);
    ctx.lineWidth = Math.max(1, s * 0.26);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(bx + s * 0.6, by - len * 0.35, bx - s * 0.35, by - len * 0.7, bx + s * 0.05, by - len);
    ctx.stroke();
    if (leafP > 0) {
      const ls = s * 0.55 * (0.4 + 0.6 * leafP);
      ctx.fillStyle = mix('#5da24a', '#8b8a6a', seed.rot);
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(bx + s * 0.05 + dir * ls * 0.8, by - len - ls * 0.2, ls, ls * 0.45, dir * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // rot fuzz halo
  if (seed.rot > 0.05) {
    ctx.fillStyle = `rgba(130,118,96,${0.16 * seed.rot})`;
    ctx.beginPath();
    ctx.arc(x, y, s * (1.1 + 0.5 * seed.rot), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(110,100,82,${0.4 * seed.rot})`;
    ctx.lineWidth = Math.max(0.5, s * 0.06);
    for (let k = 0; k < 9; k++) {
      const a = seed.phase + k * 0.7;
      const l = s * (0.5 + 0.55 * seed.rot);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.5);
      ctx.lineTo(x + Math.cos(a) * (s * 0.7 + l), y + Math.sin(a) * (s * 0.5 + l * 0.8));
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- component

const meta = getLabBySlug('seed-germination')!;

export default function GerminationLab() {
  // ---- simulation state (refs — the canvas loop owns the biology) ----------
  const sim = useRef({
    dishes: makeDishes(),
    simDays: 0,
    running: false,
    started: false,
    drag: null as { dish: number; x: number; y: number } | null,
    dragMoved: false,
    downX: 0,
    downY: 0,
    pour: -1,
    drops: [] as Drop[],
    motes: makeMotes(),
    wallT: 0,
    uiAcc: 0,
    events: [] as Ev[],
    sawLeaf: false,
    dark80Seen: false,
    peek: { dish: -1, until: 0 },
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ----------------------------------------------------
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState<'inspect' | 'water'>('inspect');
  const [selected, setSelected] = useState(0);
  const [anatomy, setAnatomy] = useState<number | null>(null);
  const [hoverPart, setHoverPart] = useState<string | null>(null);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [conclusion, setConclusion] = useState<{ correct: boolean; line: string } | null>(null);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [prepTouched, setPrepTouched] = useState(false);
  const [anatomyOpened, setAnatomyOpened] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    simDays: 0, day: 1, hour: 6, minute: 0, running: false, started: false,
    counts: [0, 0, 0, 0, 0, 0], water: [1, 0, 2, 1, 2, 1],
    sealed: [false, false, true, false, false, false],
    inFridge: [false, false, false, true, false, false],
    dark: [false, false, false, false, false, true],
    maxStage: [0, 0, 0, 0, 0, 0], anySplit: false, anyRot: false, controlPct: 0, darkPct: 0,
  });

  const conclusionOkRef = useRef(false);
  conclusionOkRef.current = conclusion?.correct === true;

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
    const day = Math.floor(s.simDays) + 1;
    const phase = s.simDays % 1;
    const hour = Math.floor(phase * 24);
    const minute = Math.floor((phase * 24 - hour) * 60);
    const counts = s.dishes.map(germinated);
    const maxStage = s.dishes.map((d) => d.seeds.reduce((m, sd) => Math.max(m, stageOf(sd)), 0));
    setUi({
      simDays: s.simDays, day, hour, minute,
      running: s.running, started: s.started,
      counts,
      water: s.dishes.map((d) => d.water),
      sealed: s.dishes.map((d) => d.sealed),
      inFridge: s.dishes.map((d) => d.inFridge),
      dark: s.dishes.map((d) => d.dark),
      maxStage,
      anySplit: maxStage.some((m) => m >= 2),
      anyRot: s.dishes.some((d) => d.seeds.some((sd) => sd.rot > 0.3)),
      controlPct: (counts[0] / SEEDS_PER_DISH) * 100,
      darkPct: (counts[5] / SEEDS_PER_DISH) * 100,
    });
  }, []);

  // ---- mentor completion flags ---------------------------------------------
  const distinctDays = useMemo(() => new Set(rows.map((r) => r.day)).size, [rows]);
  const done = [
    prepTouched,
    ui.started && ui.simDays >= 1,
    ui.anySplit,
    anatomyOpened,
    distinctDays >= 3,
    conclusion?.correct === true,
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

  // ---- nudge -----------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'prepare': return { target: 'prep', gesture: 'tap', title: 'Adjust the dishes', body: 'Use the condition chips for water, air, warmth and light — or hold the watering can over a dish on the bench.' };
      case 'clock': return { target: 'run', gesture: 'press', title: 'Set the clock running', body: 'One simulated day passes about every ten seconds. Speed up once you have seen the seeds swell.' };
      case 'imbibe': return { target: 'scene', gesture: 'point', title: 'Watch the control dish', body: 'Seeds fatten as they drink, then the testa splits. The dry dish stays wrinkled — that is the comparison.' };
      case 'anatomy': return { target: 'scene', gesture: 'tap', title: 'Tap a dish', body: 'Tapping any dish opens the magnified seed dissection — testa, cotyledons, radicle and plumule.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the day', body: 'Bank the germinated counts for all six dishes. Three different days make an honest curve.' };
      case 'conclude': return { target: 'conclusion', gesture: 'tap', title: 'Answer the conclusion', body: 'In Observations, pick exactly what seeds need to germinate — your own dish data is the evidence.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- preparation actions ----------------------------------------------------
  const markPrep = useCallback(() => setPrepTouched(true), []);

  const setDishWater = useCallback((i: number, lv: number) => {
    sim.current.dishes[i].water = lv;
    markPrep();
    labSound.slosh(0.5);
    syncUi();
    notePointer(true);
  }, [markPrep, syncUi, notePointer]);

  const setSealed = useCallback((i: number, v: boolean) => {
    sim.current.dishes[i].sealed = v;
    markPrep();
    labSound.click();
    syncUi();
    notePointer(true);
  }, [markPrep, syncUi, notePointer]);

  const setFridge = useCallback((i: number, v: boolean) => {
    sim.current.dishes[i].inFridge = v;
    markPrep();
    labSound.thunk(true);
    syncUi();
    notePointer(true);
  }, [markPrep, syncUi, notePointer]);

  const setDark = useCallback((i: number, v: boolean) => {
    sim.current.dishes[i].dark = v;
    markPrep();
    labSound.tick();
    syncUi();
    notePointer(true);
  }, [markPrep, syncUi, notePointer]);

  const selectDish = useCallback((i: number) => {
    setSelected(i);
    labSound.tick();
    notePointer(true);
  }, [notePointer]);

  const startPour = useCallback((dish: number) => {
    const s = sim.current;
    if (s.pour === dish) return;
    s.pour = dish;
    markPrep();
    labSound.startLoop('pour');
    notePointer(true);
  }, [markPrep, notePointer]);

  const endPour = useCallback(() => {
    const s = sim.current;
    if (s.pour < 0) return;
    s.pour = -1;
    labSound.stopLoop();
    syncUi();
  }, [syncUi]);

  const openAnatomy = useCallback((i: number) => {
    setSelected(i);
    setAnatomy(i);
    if (!anatomyOpened) {
      setAnatomyOpened(true);
      earn('anatomy');
    }
    labSound.glassClink(true);
    notePointer(true);
  }, [anatomyOpened, earn, notePointer]);

  // ---- clock -------------------------------------------------------------------
  const startClock = useCallback(() => {
    const s = sim.current;
    if (!s.started) {
      s.started = true;
      s.simDays = Math.max(s.simDays, 0.02);
    }
    s.running = true;
    labSound.click();
    syncUi();
    notePointer(true);
  }, [syncUi, notePointer]);

  const pauseClock = useCallback(() => {
    sim.current.running = false;
    labSound.tick();
    syncUi();
  }, [syncUi]);

  const toggleRun = useCallback(() => {
    if (sim.current.running) pauseClock();
    else startClock();
  }, [pauseClock, startClock]);

  // ---- recording ------------------------------------------------------------------
  const curDay = ui.day;
  const alreadyRecorded = rows.some((r) => r.day === curDay);
  const canRecord = ui.started && ui.simDays >= 0.35 && !alreadyRecorded;

  const recordDay = useCallback(() => {
    const s = sim.current;
    if (!s.started || s.simDays < 0.35) return;
    const day = Math.floor(s.simDays) + 1;
    if (rows.some((r) => r.day === day)) return;
    const counts = s.dishes.map(germinated);
    const nextRows = [...rows, { day, counts }].sort((a, b) => a.day - b.day);
    setRows(nextRows);
    labSound.click();
    pushToast('good', '✎', `Day ${day} banked — control ${counts[0]}/${SEEDS_PER_DISH}, dark ${counts[5]}/${SEEDS_PER_DISH}.`);
    if (new Set(nextRows.map((r) => r.day)).size >= 3) earn('three-days');
    notePointer(true);
  }, [rows, earn, pushToast, notePointer]);

  // ---- conclusion -------------------------------------------------------------------
  const togglePick = (k: string) => {
    setPicks((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
    labSound.tick();
    notePointer(true);
  };

  const submitConclusion = () => {
    const has = (k: string) => picks.includes(k);
    const correct = has('water') && has('air') && has('warmth') && !has('light');
    const counts = sim.current.dishes.map(germinated);
    let line: string;
    if (correct) {
      line = `Correct — water, air and warmth. Your own dishes prove it: dry ${counts[1]}/10, oil-sealed ${counts[2]}/10, fridge-slowed ${counts[3]}/10, and the dark dish ${counts[5]}/10 — light never mattered.`;
      labSound.milestone();
      pushToast('good', '✅', 'Conclusion correct — seeds need water, air and warmth, not light.');
      if (counts[5] / SEEDS_PER_DISH >= 0.8) earn('myth-buster');
    } else {
      const bits: string[] = [];
      if (has('light')) bits.push(`the dark dish germinated ${counts[5]}/10 without any light`);
      if (!has('water')) bits.push(`the dry dish stayed dormant at ${counts[1]}/10`);
      if (!has('air')) bits.push(`the oil-sealed dish swelled, then rotted (${counts[2]}/10)`);
      if (!has('warmth')) bits.push(`the fridge dish is crawling at ${counts[3]}/10, about six times slower`);
      line = `Not yet — your own data disagrees: ${bits.join('; ')}. Adjust the picks and check again.`;
      labSound.warn();
    }
    setConclusion({ correct, line });
    notePointer(true);
  };

  useEffect(() => {
    if (conclusion?.correct && ui.darkPct >= 80) earn('myth-buster');
  }, [conclusion, ui.darkPct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- biology -----------------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.wallT += dt;

    // idle dust motes — always alive
    for (const m of s.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      if (m.x < -0.02) m.x = 1.02;
      if (m.x > 1.02) m.x = -0.02;
    }

    if (s.running) {
      const dDays = (dt * speed) / DAY_SECONDS;
      s.simDays += dDays;
      for (let di = 0; di < s.dishes.length; di++) {
        const d = s.dishes[di];
        const wet = d.water >= 0.35;
        const flooded = d.water >= 1.65;
        const base = flooded ? FLOOD_FACTOR : 1;
        const temp = d.inFridge ? COLD_FACTOR : 1;
        for (const sd of d.seeds) {
          if (wet) sd.wet += dDays;
          else sd.wet = Math.max(0, sd.wet - dDays * 0.5);
          if (sd.rot < 1) {
            if (d.sealed && sd.wet > sd.rotAt) sd.rot = clamp(sd.rot + dDays * 0.9, 0, 1);
            else if (flooded && !sd.floodViable && sd.wet > 7) sd.rot = clamp(sd.rot + dDays * 0.25, 0, 1);
          }
          if (sd.rot < 0.05) {
            let rate = wet ? base * temp : 0;
            if (d.sealed && sd.dev > sd.tImb + 0.3) rate = 0; // oxygen exhausted past swelling
            if (flooded && !sd.floodViable && sd.dev > sd.tImb + 0.4) rate = 0;
            sd.dev += rate * dDays;
          }
        }
        const germ = germinated(d);
        if (germ >= 1 && !d.germSeen) {
          d.germSeen = true;
          s.events.push({ kind: 'germ', dish: di });
        }
        if (!d.rotSeen && d.seeds.some((sd) => sd.rot > 0.5)) {
          d.rotSeen = true;
          s.events.push({ kind: 'rot', dish: di });
        }
        if (!s.sawLeaf && d.seeds.some((sd) => stageOf(sd) === 5)) {
          s.sawLeaf = true;
          s.events.push({ kind: 'leaf', dish: di });
        }
        if (di === 5 && !s.dark80Seen && germ / SEEDS_PER_DISH >= 0.8) {
          s.dark80Seen = true;
          s.events.push({ kind: 'dark80', dish: 5 });
        }
      }
    }

    // watering-can pour — the hold gesture fills the dish
    if (s.pour >= 0) {
      const d = s.dishes[s.pour];
      d.water = clamp(d.water + dt * 0.85, 0, 2);
      if (s.drops.length < 48) {
        for (let k = 0; k < 2; k++) {
          s.drops.push({ dish: s.pour, x: (Math.random() - 0.5) * 0.8, y: -0.38 - Math.random() * 0.25, vy: 0.22 });
        }
      }
    }
    for (let i = s.drops.length - 1; i >= 0; i--) {
      const dr = s.drops[i];
      dr.vy += 1.7 * dt;
      dr.y += dr.vy * dt;
      if (dr.y > 0.14) s.drops.splice(i, 1);
    }

    // flush biology events → sounds, badges, toasts
    if (s.events.length) {
      for (const ev of s.events) {
        if (ev.kind === 'germ') {
          labSound.ping(523, 0.09);
          if (ev.dish === 0) {
            earn('first-sprout');
            pushToast('good', '🌱', 'First radicle — the control dish has its first sprout.');
          }
        } else if (ev.kind === 'leaf') {
          labSound.ping(784, 0.11);
          earn('full-seedling');
          pushToast('good', '🌿', 'A seedling is standing on its cotyledons — first true leaves.');
        } else if (ev.kind === 'rot') {
          labSound.warn();
        } else if (ev.kind === 'dark80') {
          pushToast('info', '🌙', 'The dark dish germinated 8 of 10 — no light needed.');
          if (conclusionOkRef.current) earn('myth-buster');
        }
      }
      s.events.length = 0;
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, earn, pushToast, syncUi]);

  // ---- drawing -------------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const lay = layoutFor(w, h);
    const pos = dishPositions(lay, s);
    const dayPhase = s.simDays % 1;
    const sunAlt = Math.sin((dayPhase - 0.25) * Math.PI * 2);
    const daylight = clamp(0.5 + sunAlt * 0.8, 0, 1);
    const t = s.wallT;
    const floodedSel = s.dishes[selected].water >= 1.65;
    const moistSel = s.dishes[selected].water >= 0.35 && !floodedSel;

    // room wall — day/night shift
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, mix('#eef2f6', '#2c3954', 1 - daylight));
    wall.addColorStop(1, mix('#e2e8ee', '#39476a', 1 - daylight));
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    // window with travelling sun / moon
    const wx = lay.fridge.x + lay.fridge.w + 18;
    const ww = Math.max(80, lay.lamp.x - wx - 16);
    const wh = 38;
    roundRect(ctx, wx, 8, ww, wh, 8);
    ctx.fillStyle = mix('#b9d8ec', '#1a2744', 1 - daylight);
    ctx.fill();
    ctx.strokeStyle = '#b6c3cf';
    ctx.lineWidth = 2;
    ctx.stroke();
    const sunX = wx + 6 + dayPhase * (ww - 12);
    if (sunAlt > -0.08) {
      ctx.fillStyle = `rgba(247,200,92,${clamp(0.35 + sunAlt, 0.2, 1)})`;
      ctx.beginPath();
      ctx.arc(clamp(sunX, wx + 8, wx + ww - 8), 27, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(226,232,240,0.9)';
      ctx.beginPath();
      ctx.arc(clamp(sunX, wx + 8, wx + ww - 8), 27, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mix('#b9d8ec', '#1a2744', 1 - daylight);
      ctx.beginPath();
      ctx.arc(clamp(sunX, wx + 8, wx + ww - 8) + 4, 25, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(200,210,220,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx + ww / 3, 10); ctx.lineTo(wx + ww / 3, 44);
    ctx.moveTo(wx + (2 * ww) / 3, 10); ctx.lineTo(wx + (2 * ww) / 3, 44);
    ctx.moveTo(wx + 2, 27); ctx.lineTo(wx + ww - 2, 27);
    ctx.stroke();

    // windowsill lamp — the light myth lives here
    const lit = !s.dishes[selected].dark;
    const lx = lay.lamp.x + lay.lamp.w / 2;
    const ly = lay.lamp.y + 10;
    ctx.strokeStyle = '#7d8b99';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx, 4);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.fillStyle = lit ? '#f7c85c' : '#b9c2cc';
    ctx.beginPath();
    ctx.moveTo(lx - 16, ly + 14);
    ctx.lineTo(lx + 16, ly + 14);
    ctx.lineTo(lx + 10, ly);
    ctx.lineTo(lx - 10, ly);
    ctx.closePath();
    ctx.fill();
    if (lit) {
      ctx.fillStyle = 'rgba(247,200,92,0.85)';
      ctx.beginPath();
      ctx.arc(lx, ly + 17, 5, 0, Math.PI * 2);
      ctx.fill();
      const glow = ctx.createRadialGradient(lx, ly + 18, 4, lx, ly + 18, 60);
      glow.addColorStop(0, 'rgba(247,200,92,0.30)');
      glow.addColorStop(1, 'rgba(247,200,92,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, ly + 18, 60, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#cdd6de';
      ctx.beginPath();
      ctx.arc(lx, ly + 17, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // bench slab
    const bench = ctx.createLinearGradient(0, 52, 0, h - 10);
    bench.addColorStop(0, mix('#e9edf2', '#8c97ab', (1 - daylight) * 0.5));
    bench.addColorStop(1, mix('#dfe5ec', '#77828f', (1 - daylight) * 0.5));
    ctx.fillStyle = bench;
    ctx.fillRect(0, 52, w, h - 62);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 53);
    ctx.lineTo(w, 53);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,133,148,0.14)';
    for (let gy = 70; gy < h - 16; gy += 26) {
      ctx.beginPath();
      ctx.moveTo(lay.fridge.x + lay.fridge.w + 8, gy);
      ctx.lineTo(w - 10, gy);
      ctx.stroke();
    }

    // fridge compartment
    roundRect(ctx, lay.fridge.x, lay.fridge.y, lay.fridge.w, lay.fridge.h, 12);
    ctx.fillStyle = mix('#dde6ee', '#9fb4c8', 0.3);
    ctx.fill();
    ctx.strokeStyle = '#aebccb';
    ctx.lineWidth = 2;
    ctx.stroke();
    roundRect(ctx, lay.fridge.x + 6, lay.fridge.y + 8, lay.fridge.w - 12, lay.fridge.h - 16, 8);
    const cold = ctx.createLinearGradient(0, lay.fridge.y, 0, lay.fridge.y + lay.fridge.h);
    cold.addColorStop(0, '#cfe2ee');
    cold.addColorStop(1, '#bcd6e8');
    ctx.fillStyle = cold;
    ctx.fill();
    // frost specks
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let k = 0; k < 14; k++) {
      const fx = lay.fridge.x + 12 + ((k * 37) % (lay.fridge.w - 24));
      const fy = lay.fridge.y + 16 + ((k * 53) % (lay.fridge.h - 32));
      ctx.fillRect(fx, fy, 2, 2);
    }
    // cold mist wisps
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      const my = lay.fridge.y + 30 + k * 42;
      for (let mx = lay.fridge.x + 10; mx <= lay.fridge.x + lay.fridge.w - 10; mx += 6) {
        const yy = my + Math.sin(mx * 0.12 + t * 0.8 + k * 2) * 4;
        if (mx === lay.fridge.x + 10) ctx.moveTo(mx, yy);
        else ctx.lineTo(mx, yy);
      }
      ctx.stroke();
    }

    // ---- petri dishes ----
    for (let di = 0; di < s.dishes.length; di++) {
      const d = s.dishes[di];
      const { x: cx, y: cy, r: R } = pos[di];
      const flooded = d.water >= 1.65;
      const moist = d.water >= 0.35 && !flooded;
      const peeking = d.dark && s.peek.dish === di && s.wallT < s.peek.until;

      // shadow
      ctx.fillStyle = 'rgba(23,35,52,0.10)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + R * 0.62, R * 1.02, R * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // glass base
      const glass = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R);
      glass.addColorStop(0, '#f5f9fb');
      glass.addColorStop(1, '#dbe5ec');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 2;
      ctx.stroke();

      // paper disc
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
      ctx.fillStyle = flooded ? '#c7d6cd' : moist ? '#d5e2d2' : '#e9e2cc';
      ctx.fill();
      if (moist) {
        const damp = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 0.86);
        damp.addColorStop(0, 'rgba(120,170,200,0.22)');
        damp.addColorStop(1, 'rgba(120,170,200,0.05)');
        ctx.fillStyle = damp;
        ctx.fill();
      }

      // standing water + shimmer
      if (flooded) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(105,155,185,0.48)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.2 * Math.sin(t * 2.4)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.6, t * 0.7, t * 0.7 + 1.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.35, -t * 0.9, -t * 0.9 + 0.9);
        ctx.stroke();
      }

      // seeds (clipped inside the dish)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2);
      ctx.clip();
      const seedSz = R * 0.13;
      for (const sd of d.seeds) {
        drawSeedShape(ctx, cx + sd.x * R * 0.68, cy + sd.y * R * 0.68, seedSz, sd.ang, sd, t, d.water >= 0.35);
      }
      ctx.restore();

      // oil film over flooded sealed dishes — the no-air seal
      if (d.sealed && flooded) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(186,158,208,0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,190,205,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.7, 0.4, 2.1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(196,150,216,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.55, 3.2, 5.1);
        ctx.stroke();
      }

      // sealed glass lid
      if (d.sealed) {
        ctx.strokeStyle = 'rgba(141,168,185,0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.06, Math.PI * 1.1, Math.PI * 1.5);
        ctx.stroke();
        ctx.fillStyle = '#c9d6e0';
        ctx.beginPath();
        ctx.arc(cx, cy - R * 1.06, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // cold tint for fridge dishes
      if (d.inFridge) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(150,200,230,0.2)';
        ctx.fill();
      }

      // dark hood — raised while peeking
      if (d.dark) {
        ctx.save();
        if (peeking) {
          ctx.translate(cx - R * 0.7, cy - R * 1.5);
          ctx.rotate(-0.22);
          ctx.globalAlpha = 0.88;
        } else {
          ctx.translate(cx, cy);
          ctx.globalAlpha = 1;
        }
        roundRect(ctx, -R * 1.12, -R * 1.12, R * 2.24, R * 2.24, 14);
        ctx.fillStyle = '#2b3547';
        ctx.fill();
        ctx.strokeStyle = '#1d2635';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-R * 0.7, -R * 0.75);
        ctx.lineTo(R * 0.5, -R * 0.8);
        ctx.stroke();
        ctx.fillStyle = '#4a5872';
        ctx.beginPath();
        ctx.arc(0, -R * 1.12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (peeking) {
          ctx.beginPath();
          ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(20,28,44,0.22)';
          ctx.fill();
        }
      }

      // selection ring
      if (selected === di) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -t * 14;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // night wash — germination carries on regardless
    if (daylight < 0.98) {
      ctx.fillStyle = `rgba(23,35,52,${(1 - daylight) * 0.26})`;
      ctx.fillRect(0, 0, w, h);
    }

    // dust motes
    for (const m of s.motes) {
      const a = 0.10 + 0.10 * Math.sin(t * 1.4 + m.p);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // pour droplets above their dish
    for (const dr of s.drops) {
      const p = pos[dr.dish];
      ctx.fillStyle = 'rgba(110,165,200,0.85)';
      ctx.beginPath();
      ctx.arc(p.x + dr.x * p.r * 0.7, p.y + dr.y * p.r * 0.7, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // watering can while pouring
    if (s.pour >= 0) {
      const p = pos[s.pour];
      const canX = p.x + Math.sin(t * 3) * 2;
      const canY = p.y - p.r * 1.85;
      ctx.fillStyle = '#7f8b98';
      roundRect(ctx, canX - 14, canY - 6, 24, 20, 4);
      ctx.fill();
      ctx.strokeStyle = '#7f8b98';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(canX + 10, canY - 2);
      ctx.lineTo(canX + 24, canY - 12);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(canX - 20, canY + 4, 8, Math.PI * 0.4, Math.PI * 1.4);
      ctx.stroke();
    }

    // ---- magnified seed dissection ----
    if (anatomy !== null) {
      const d = s.dishes[anatomy];
      const rw = Math.min(w * 0.88, 520);
      const rh = Math.min(h * 0.78, 330);
      const rx = (w - rw) / 2;
      const ry = (h - rh) / 2 + 6;
      ctx.save();
      ctx.fillStyle = 'rgba(23,35,52,0.22)';
      roundRect(ctx, rx + 5, ry + 6, rw, rh, 16);
      ctx.fill();
      roundRect(ctx, rx, ry, rw, rh, 16);
      ctx.fillStyle = 'rgba(248,250,252,0.97)';
      ctx.fill();
      ctx.strokeStyle = '#c9d2db';
      ctx.lineWidth = 2;
      ctx.stroke();

      // left: the most-developed live seed from this dish, magnified
      let best = d.seeds[0];
      for (const sd of d.seeds) if (sd.dev > best.dev) best = sd;
      const liveX = rx + rw * 0.2;
      const liveY = ry + rh * 0.52;
      ctx.beginPath();
      ctx.arc(liveX, liveY, Math.min(rh * 0.34, rw * 0.14), 0, Math.PI * 2);
      ctx.fillStyle = floodedSel ? '#c7d6cd' : moistSel ? '#d5e2d2' : '#e9e2cc';
      ctx.fill();
      ctx.strokeStyle = '#c3ced9';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawSeedShape(ctx, liveX, liveY + 4, Math.min(rh * 0.1, rw * 0.045), best.ang, best, t, d.water >= 0.35);

      // right: the dissection cutaway — testa, cotyledons, embryo
      const dx = rx + rw * 0.62;
      const dy = ry + rh * 0.5;
      const S = Math.min(rh * 0.3, rw * 0.13);
      const hl = hoverPart;

      // two cotyledons spread open like a book
      for (const dir of [-1, 1]) {
        const hy = dy + dir * S * 0.62;
        const cot = ctx.createLinearGradient(dx - S, hy - S * 0.5, dx + S, hy + S * 0.5);
        cot.addColorStop(0, hl === 'cotyledon' ? '#f6e9bd' : '#e9d9a8');
        cot.addColorStop(1, '#d9c383');
        ctx.fillStyle = cot;
        ctx.beginPath();
        ctx.ellipse(dx, hy, S * 0.98, S * 0.6, dir * 0.08, 0, Math.PI * 2);
        ctx.fill();
        // testa — the coat around each half
        ctx.strokeStyle = hl === 'testa' ? '#e8632a' : '#a97b4f';
        ctx.lineWidth = hl === 'testa' ? 6 : 4;
        if (hl === 'testa') {
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 12;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        // food-store speckles
        ctx.fillStyle = 'rgba(160,140,90,0.35)';
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.arc(dx - S * 0.5 + k * S * 0.25, hy + (k % 2 === 0 ? -S * 0.12 : S * 0.15), S * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // hilum scar on the testa edge
      ctx.fillStyle = 'rgba(90,60,30,0.6)';
      ctx.beginPath();
      ctx.ellipse(dx + S * 0.92, dy - S * 0.5, S * 0.1, S * 0.07, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // embryo axis between the cotyledons — radicle pointing down
      ctx.fillStyle = hl === 'radicle' ? '#fbd9a8' : '#f2e6cf';
      if (hl === 'radicle') {
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.moveTo(dx - S * 0.16, dy - S * 0.34);
      ctx.quadraticCurveTo(dx - S * 0.34, dy + S * 0.15, dx - S * 0.18, dy + S * 0.62);
      ctx.quadraticCurveTo(dx - S * 0.02, dy + S * 0.85, dx + S * 0.1, dy + S * 0.6);
      ctx.quadraticCurveTo(dx + S * 0.16, dy + S * 0.1, dx + S * 0.02, dy - S * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#d8c9a8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // plumule — tiny folded leaves at the top of the embryo
      ctx.fillStyle = hl === 'plumule' ? '#8fd07a' : '#5da24a';
      if (hl === 'plumule') {
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 14;
      }
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(dx + dir * S * 0.2, dy - S * 0.42, S * 0.24, S * 0.12, dir * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }, [selected, anatomy, hoverPart]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;

    // lamp click toggles the hood on the selected dish
    const L = layoutFor(canvas.clientWidth, canvas.clientHeight);
    if (px >= L.lamp.x && px <= L.lamp.x + L.lamp.w && py >= L.lamp.y && py <= L.lamp.y + L.lamp.h) {
      setDark(selected, !s.dishes[selected].dark);
      return;
    }

    const pos = dishPositions(L, s);
    let hit = -1;
    for (let i = 5; i >= 0; i--) {
      if (Math.hypot(px - pos[i].x, py - pos[i].y) < pos[i].r + 12) { hit = i; break; }
    }
    if (hit >= 0) {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      if (tool === 'water') {
        startPour(hit);
      } else {
        s.drag = { dish: hit, x: pos[hit].x, y: pos[hit].y };
        s.dragMoved = false;
        s.downX = px;
        s.downY = py;
        labSound.creak(0.25);
      }
      notePointer(true);
    } else {
      notePointer(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (!s.dragMoved && Math.hypot(px - s.downX, py - s.downY) > 12) {
      s.dragMoved = true;
      labSound.slide(0.5);
    }
    if (s.dragMoved) {
      s.drag.x = clamp(px, 40, canvas.clientWidth - 40);
      s.drag.y = clamp(py, 72, canvas.clientHeight - 48);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const canvas = canvasRef.current;
    try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (s.pour >= 0) {
      endPour();
      return;
    }
    if (!s.drag) return;
    const { dish, x, y } = s.drag;
    s.drag = null;
    const d = s.dishes[dish];
    if (s.dragMoved) {
      const L = layoutFor(canvas?.clientWidth ?? 800, canvas?.clientHeight ?? 500);
      const inFridgeNow = x < L.fridge.x + L.fridge.w + 8 && y > L.fridge.y - 10 && y < L.fridge.y + L.fridge.h + 10;
      if (d.inFridge !== inFridgeNow) {
        d.inFridge = inFridgeNow;
        markPrep();
        labSound.thunk(true);
        if (inFridgeNow) labSound.glassClink(true);
      } else {
        labSound.thunk(true);
      }
      syncUi();
    } else {
      // a clean tap: peek under the hood, then open the dissection
      if (d.dark) s.peek = { dish, until: s.wallT + 6 };
      openAnatomy(dish);
    }
  };

  // ---- reset -------------------------------------------------------------------------
  const resetAll = () => {
    const s = sim.current;
    s.dishes = makeDishes();
    s.simDays = 0;
    s.running = false;
    s.started = false;
    s.drag = null;
    s.pour = -1;
    s.drops.length = 0;
    s.events.length = 0;
    s.sawLeaf = false;
    s.dark80Seen = false;
    s.peek = { dish: -1, until: 0 };
    setRows([]);
    setPicks([]);
    setConclusion(null);
    setAnatomy(null);
    setSelected(0);
    setMentorIndex(0);
    setPrepTouched(false);
    setBadges([]);
    syncUi();
  };

  // ---- analysis -----------------------------------------------------------------------
  const waterPoints = useMemo(() => {
    if (rows.length === 0) return [];
    const latest = rows[rows.length - 1].counts;
    return [
      { x: 0, y: (latest[1] / SEEDS_PER_DISH) * 100 },
      { x: 1, y: (latest[0] / SEEDS_PER_DISH) * 100 },
      { x: 2, y: (latest[4] / SEEDS_PER_DISH) * 100 },
    ];
  }, [rows]);

  // ---- coach -----------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (conclusion && !conclusion.correct) return { tone: 'warn', line: conclusion.line };
    if (ui.anyRot && !conclusion) return { tone: 'warn', line: 'Grey-brown fuzz in the oil-sealed dish — the seeds swelled, ran out of oxygen and rotted. That is the no-air evidence.' };
    if (!prepTouched) return { tone: 'info', line: 'The bench is preset with the classic comparison — change any dish you like, then set the clock running.' };
    if (!ui.started) return { tone: 'info', line: 'Dishes ready. Press “Set the clock running” — the first swelling shows within a simulated day or two.' };
    if (ui.running && !ui.anySplit) return { tone: 'info', line: `Day ${ui.day} — watch the control dish fatten as the seeds drink. The dry dish stays wrinkled: that is the comparison working.` };
    if (ui.anySplit && !anatomyOpened) return { tone: 'good', line: 'Testa splits! Tap any dish to open the seed dissection and name the radicle and plumule.' };
    if (distinctDays < 3) return { tone: 'info', line: 'Bank the day with “Record day” — three different days make an honest germination curve.' };
    if (!conclusion) return { tone: 'good', line: 'Three days logged — open Observations and answer the conclusion with your own evidence.' };
    return { tone: 'good', line: 'Experiment complete. Compare the curves: water, air and warmth did the work — the dark dish kept pace the whole way.' };
  }, [conclusion, prepTouched, ui, anatomyOpened, distinctDays]);

  // ---- status -----------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : ui.running
      ? `Day ${ui.day} — germination under way`
      : ui.started
        ? `Paused — day ${ui.day}`
        : 'Six dishes ready on the bench';

  // ---- render helpers -----------------------------------------------------------------------
  const hh = String(ui.hour).padStart(2, '0');
  const mm = String(ui.minute).padStart(2, '0');
  const conditionLine = (i: number) =>
    `${waterName(ui.water[i])} · ${ui.sealed[i] ? 'sealed lid + oil film' : 'open lid'} · ${ui.inFridge[i] ? 'fridge 5 °C' : 'bench 25 °C'} · ${ui.dark[i] ? 'dark hood' : 'lamp light'}`;

  const liveRow: DayRow | null = ui.started ? { day: ui.day, counts: ui.counts } : null;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.running ? 'active' : 'ready'}
      captionChip="Six-dish comparison · honest stochastic timing"
      legend={[
        { color: '#c9a06a', label: 'Dry seed (testa)' },
        { color: '#f2ead6', label: 'Radicle — baby root' },
        { color: '#6fae5a', label: 'Plumule — shoot & leaves' },
        { color: '#8a7d6b', label: 'Rot (no oxygen)' },
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
            <option value={1}>1× — 10 s per day</option>
            <option value={4}>4× faster</option>
            <option value={16}>16× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Germination bench — six petri dishes; tap a dish to dissect it, hold the watering can to pour, drag a dish into the fridge"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && anatomy !== null) {
              setAnatomy(null);
              labSound.tick();
              return;
            }
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              if (anatomy !== null) { setAnatomy(null); labSound.tick(); return; }
              toggleRun();
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div className="germ-controls">
          {anatomy !== null && (
            <div className="germ-anatomy" data-nudge="anatomy">
              <div className="germ-anatomy-head">
                <strong>Seed dissection — dish {anatomy + 1}</strong>
                <button type="button" onClick={() => { setAnatomy(null); labSound.tick(); }}>Close ✕</button>
              </div>
              <p className="germ-anatomy-note">Hover a part to light it up inside the cutaway. Left: the most-developed live seed from this dish, magnified.</p>
              <div className="germ-partrow">
                {[
                  { id: 'testa', name: 'Testa', sub: 'the seed coat' },
                  { id: 'cotyledon', name: 'Cotyledons ×2', sub: 'the food store' },
                  { id: 'radicle', name: 'Radicle', sub: 'the baby root' },
                  { id: 'plumule', name: 'Plumule', sub: 'the baby shoot' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`germ-partchip${hoverPart === p.id ? ' on' : ''}`}
                    onMouseEnter={() => setHoverPart(p.id)}
                    onMouseLeave={() => setHoverPart(null)}
                    onFocus={() => setHoverPart(p.id)}
                    onBlur={() => setHoverPart(null)}
                    aria-pressed={hoverPart === p.id}
                  >
                    <strong>{p.name}</strong>
                    <span>{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="germ-dishbar" data-nudge="prep" role="group" aria-label="Choose a petri dish to prepare">
            {DISH_COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`germ-dishchip${selected === i ? ' on' : ''}`}
                onClick={() => selectDish(i)}
                aria-pressed={selected === i}
                title={`Dish ${i + 1} — ${DISH_NOTES[i]}`}
              >
                <span className="germ-dishdot" style={{ background: c }} aria-hidden="true" />
                Dish {i + 1}
              </button>
            ))}
          </div>
          <p className="germ-dishnote">Dish {selected + 1} · {conditionLine(selected)}</p>

          <div className="germ-prep">
            <div className="germ-prep-row">
              <span className="germ-prep-label">Water</span>
              <div className="germ-seg" role="group" aria-label="Water level for the selected dish">
                {[0, 1, 2].map((lv) => (
                  <button key={lv} type="button" className="germ-segbtn"
                    aria-pressed={Math.abs(ui.water[selected] - lv) < 0.35}
                    onClick={() => setDishWater(selected, lv)}>
                    {lv === 0 ? 'Dry paper' : lv === 1 ? 'Moist paper' : 'Standing water'}
                  </button>
                ))}
              </div>
            </div>
            <div className="germ-prep-row">
              <span className="germ-prep-label">Air</span>
              <div className="germ-seg" role="group" aria-label="Air supply for the selected dish">
                <button type="button" className="germ-segbtn" aria-pressed={!ui.sealed[selected]}
                  onClick={() => setSealed(selected, false)}>Open lid</button>
                <button type="button" className="germ-segbtn" aria-pressed={ui.sealed[selected]}
                  onClick={() => setSealed(selected, true)}>Sealed + oil film</button>
              </div>
            </div>
            <div className="germ-prep-row">
              <span className="germ-prep-label">Warmth</span>
              <div className="germ-seg" role="group" aria-label="Warmth for the selected dish">
                <button type="button" className="germ-segbtn" aria-pressed={!ui.inFridge[selected]}
                  onClick={() => setFridge(selected, false)}>Bench · 25 °C</button>
                <button type="button" className="germ-segbtn" aria-pressed={ui.inFridge[selected]}
                  onClick={() => setFridge(selected, true)}>Fridge · 5 °C</button>
              </div>
            </div>
            <div className="germ-prep-row">
              <span className="germ-prep-label">Light</span>
              <div className="germ-seg" role="group" aria-label="Light for the selected dish">
                <button type="button" className="germ-segbtn" aria-pressed={!ui.dark[selected]}
                  onClick={() => setDark(selected, false)}>Lamp light</button>
                <button type="button" className="germ-segbtn" aria-pressed={ui.dark[selected]}
                  onClick={() => setDark(selected, true)}>Dark hood</button>
              </div>
            </div>
          </div>

          <div className="germ-tools">
            <button
              type="button"
              className={`germ-toolbtn${tool === 'inspect' ? ' on' : ''}`}
              onClick={() => { setTool('inspect'); labSound.tick(); }}
              aria-pressed={tool === 'inspect'}
            >
              <span aria-hidden="true">⌖</span> Inspect — tap a dish
            </button>
            <button
              type="button"
              className={`germ-toolbtn${tool === 'water' ? ' on' : ''}`}
              onClick={() => { setTool('water'); labSound.tick(); }}
              aria-pressed={tool === 'water'}
            >
              <span aria-hidden="true">💧</span> Watering can — hold on a dish
            </button>
          </div>

          <button
            className="action-button germ-pour"
            type="button"
            onPointerDown={() => startPour(selected)}
            onPointerUp={endPour}
            onPointerLeave={endPour}
            onPointerCancel={endPour}
          >
            <span className="dispense-icon" aria-hidden="true">💧</span>
            <span>Hold to pour on dish {selected + 1}</span>
            <small>or arm the can and hold over the bench</small>
          </button>

          <div className="germ-clockrow">
            <div className="germ-clock" data-nudge="run">
              <span>SIM CLOCK · 1 DAY ≈ 10 S AT 1×</span>
              <strong>Day {ui.day} · {hh}:{mm}</strong>
              <span className="germ-phase">{phaseName(ui.hour)} · {ui.running ? 'running' : ui.started ? 'paused' : 'stopped'}</span>
            </div>
            <button className="action-button" type="button" onClick={toggleRun}>
              <span className="dispense-icon" aria-hidden="true">{ui.running ? '⏸' : '▶'}</span>
              <span>{ui.running ? 'Pause the clock' : ui.started ? 'Resume the clock' : 'Set the clock running'}</span>
            </button>
          </div>

          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Drag a dish into the fridge compartment to chill it. Tap a dark dish to peek under the hood — the seeds keep germinating either way. Water added later still wakes dry seeds.</p></div>

          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={recordDay}
            disabled={!canRecord}
          >
            {canRecord
              ? `✎ Record day ${curDay} — ${ui.counts[0]}/${SEEDS_PER_DISH} sprouted in the control`
              : alreadyRecorded
                ? `Day ${curDay} already recorded — let the clock run on`
                : 'Record unlocks once the clock is running'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Germinated in the control dish</span><strong>{ui.counts[0]} <small>/ {SEEDS_PER_DISH} seeds</small></strong>
            <div className="reading-track"><span style={{ width: `${ui.controlPct}%` }} /></div>
            <div className="reading-scale"><span>Day 1</span><span>live</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Simulated day</span><strong>Day {ui.day} · {hh}:{mm}</strong></div>
            <div><span>Phase</span><strong>{phaseName(ui.hour)}</strong></div>
            <div><span>Water (dish {selected + 1})</span><strong>{waterName(ui.water[selected])}</strong></div>
            <div><span>Air (dish {selected + 1})</span><strong>{ui.sealed[selected] ? 'Sealed + oil' : 'Open lid'}</strong></div>
            <div><span>Warmth (dish {selected + 1})</span><strong>{ui.inFridge[selected] ? '5 °C fridge' : '25 °C bench'}</strong></div>
            <div><span>Light (dish {selected + 1})</span><strong>{ui.dark[selected] ? 'Dark hood' : 'Lamp light'}</strong></div>
            <div><span>Furthest stage</span><strong>{STAGE_NAMES[ui.maxStage[selected]]}</strong></div>
            <div><span>Germinated (dish {selected + 1})</span><strong>{ui.counts[selected]}/{SEEDS_PER_DISH}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Prepare the six dishes — they open preset with the classic comparison. Change water, air, warmth or light with the chips, hold the watering can over a dish to pour, or drag a dish into the fridge.</li>
              <li>Set the clock running. One simulated day passes in about ten seconds at 1×; speed up to 4× or 16× later.</li>
              <li>Watch for imbibition (seeds swelling as they drink) and the testa split in the control dish.</li>
              <li>Tap a dish to open the seed dissection and name the testa, cotyledons, radicle and plumule.</li>
              <li>Record the day at least three times — a seed counts once its radicle is visible (about 2 mm).</li>
              <li>Answer the conclusion in Observations using your own dish data.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>A zero-sprout baseline on day 1 is real data — record it. Curves that start at zero are the honest ones.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Germination table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Set the clock running and press “Record day”. Rows bank the germinated count for every dish — a seed counts once its radicle is visible.</p>
            ) : (
              <table className="trial-table germ-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    {DISH_COLORS.map((c, i) => (
                      <th key={i}><span className="germ-thdot" style={{ background: c }} aria-hidden="true" />D{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.day}>
                      <td>{r.day}</td>
                      {r.counts.map((c, i) => (
                        <td key={i} className={c > 0 && i === 5 ? 'germ-darkcell' : undefined}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {rows.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Germination curves</h3>
                <GermChart rows={rows} live={liveRow} />
                <div className="germ-chartlegend">
                  {DISH_COLORS.map((c, i) => (
                    <span key={i}><i style={{ background: c }} />D{i + 1} · {DISH_NOTES[i]}</span>
                  ))}
                </div>

                <h3 style={{ marginTop: 16 }}>Water comparison</h3>
                <Plot
                  points={waterPoints}
                  xLabel="Water: 0 dry · 1 moist · 2 flooded"
                  yLabel="Germinated (%)"
                  height={200}
                />
                <p className="observation-note">Same warmth, same air, same light — only the water differs between the dry, moist and flooded-open dishes. Moist paper wins: standing water crowds out oxygen.</p>
              </>
            )}

            <h3 style={{ marginTop: 16 }}>What do seeds need to germinate?</h3>
            <div className="germ-conclusion" data-nudge="conclusion">
              <p>Pick every factor your own dishes show is genuinely needed — and leave out the one that is a myth.</p>
              <div className="germ-pickrow">
                {[
                  { id: 'water', name: 'Water' },
                  { id: 'air', name: 'Air (oxygen)' },
                  { id: 'warmth', name: 'Warmth' },
                  { id: 'light', name: 'Light' },
                ].map((p) => (
                  <button key={p.id} type="button" className={`germ-pickchip${picks.includes(p.id) ? ' on' : ''}`}
                    onClick={() => togglePick(p.id)} aria-pressed={picks.includes(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
              <button type="button" className="action-button germ-check" onClick={submitConclusion} disabled={picks.length === 0}>
                Check my answer
              </button>
              {conclusion && (
                <p className={`germ-verdict ${conclusion.correct ? 'good' : 'warn'}`}>{conclusion.line}</p>
              )}
            </div>
            <p className="observation-note">A seed counts as germinated once its radicle — the first baby root — breaks through the testa and reaches about 2 mm. Everything after that is seedling growth.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Germination begins with <strong>imbibition</strong>: the dry seed drinks water, swelling to well over its resting size. Water rehydrates the seed&apos;s tissues and switches on enzymes inside the cotyledons, which begin digesting the stored food into fuel the embryo can use. That is why the first visible change in every moist dish is simple swelling.</p>
            <p>The embryo then grows. The <strong>radicle</strong> — the baby root — breaks out first and always grows downward, guided by gravity (gravitropism), so the seedling can take in water and anchor itself. Only then does the <strong>plumule</strong> — the baby shoot — curve upward, carrying the first green leaves into the light while the two cotyledons feed it.</p>
            <p>Each factor in the six dishes maps to one link in that chain:</p>
            <ul>
              <li><strong>Water</strong> starts imbibition and enzyme action — dry seeds stay dormant, alive but paused, sometimes for years.</li>
              <li><strong>Oxygen</strong> feeds respiration, the embryo&apos;s power supply. Under an oil seal the seeds swell, then rot as fungi and anaerobic decay take over.</li>
              <li><strong>Warmth</strong> sets the pace of every enzyme-catalysed reaction — the fridge dish runs about six times slower than the bench.</li>
              <li><strong>Light</strong> is the myth: most seeds germinate perfectly well in complete darkness, because a buried seed would never see light anyway. Light matters later, once the first leaves start photosynthesising.</li>
            </ul>
            <p>Standing water is a subtler case: it supplies plenty of water but crowds out oxygen, which is why the flooded-open dish limps to about half its seeds slowly sprouting. The moist-paper control keeps both water and air in generous supply — which is exactly why it is the control.</p>
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

// ---------------------------------------------------------------- chart

function GermChart({ rows, live }: { rows: DayRow[]; live: DayRow | null }) {
  const W = 380;
  const H = 240;
  const pad = { l: 42, r: 12, t: 14, b: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxDay = Math.max(2, ...rows.map((r) => r.day), live?.day ?? 0);
  const xMax = Math.ceil(maxDay) + 0.5;
  const X = (d: number) => pad.l + (d / xMax) * iw;
  const Y = (p: number) => pad.t + ih - (p / 100) * ih;
  const xStep = Math.max(1, Math.ceil(xMax / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="germ-chart" role="img" aria-label="Germination percentage versus day for the six dishes">
      <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="#f7f9fb" />
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <line x1={pad.l} y1={Y(p)} x2={pad.l + iw} y2={Y(p)} stroke="#e8edf2" />
          <text x={pad.l - 6} y={Y(p) + 3} textAnchor="end" fontSize="9" fill="#9aa4b1">{p}</text>
        </g>
      ))}
      {Array.from({ length: Math.floor(xMax / xStep) + 1 }, (_, k) => k * xStep).map((d) => (
        <g key={d}>
          <line x1={X(d)} y1={pad.t} x2={X(d)} y2={pad.t + ih} stroke="#e8edf2" />
          <text x={X(d)} y={H - pad.b + 14} textAnchor="middle" fontSize="9" fill="#9aa4b1">{d}</text>
        </g>
      ))}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ih} stroke="#c5cdd6" />
      <line x1={pad.l} y1={pad.t + ih} x2={pad.l + iw} y2={pad.t + ih} stroke="#c5cdd6" />
      <text x={pad.l + iw / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#7a8795">Day</text>
      <text x={11} y={pad.t + ih / 2} textAnchor="middle" fontSize="10" fill="#7a8795" transform={`rotate(-90 11 ${pad.t + ih / 2})`}>Germinated (%)</text>
      {DISH_COLORS.map((c, i) => {
        const pts: { x: number; y: number }[] = rows.map((r) => ({ x: X(r.day), y: Y((r.counts[i] / SEEDS_PER_DISH) * 100) }));
        if (live) pts.push({ x: X(live.day), y: Y((live.counts[i] / SEEDS_PER_DISH) * 100) });
        if (pts.length === 0) return null;
        const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const last = pts[pts.length - 1];
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, k) => <circle key={k} cx={p.x} cy={p.y} r="2.4" fill={c} />)}
            {live && <circle cx={last.x} cy={last.y} r="4.6" fill="none" stroke={c} strokeWidth="1.6" />}
          </g>
        );
      })}
    </svg>
  );
}
