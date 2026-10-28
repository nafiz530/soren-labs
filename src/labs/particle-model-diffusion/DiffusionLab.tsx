import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp, fmtClock } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './particle-model-diffusion.css';

/**
 * Particles & diffusion — the two-chamber particle model, made hands-on.
 *
 * A sealed glass box, split by a sliding glass divider: the left chamber
 * starts full of heavy orange-brown gas (bromine-like), the right full of
 * invisible, fast air. The student DRAGS the divider up out of the box and
 * both populations mix by honest molecular dynamics — elastic, momentum-
 * conserving collisions between unequal masses and with the walls, speeds
 * drawn from a Maxwell-Boltzmann distribution (⟨v⟩ ∝ √(T/m)). The mixing
 * index (% of orange particles in the right half) climbs toward 50% and
 * draws itself as a live curve; runs are recorded and raced on one chart.
 * A second mode sprays a perfume burst from a point source in a room of
 * air — the same physics, radially.
 */

// ---- model constants (sim units: the box is 600 × 360 "model px") ----------

const BOX_W = 600;
const BOX_H = 360;
const CX = BOX_W / 2;

const N_GAS = 170; // orange particles in the divider mode (left chamber)
const N_AIR = 170; // air particles in the divider mode (right chamber)
const N_ROOM_AIR = 190; // air already in the room for the perfume mode
const N_SPRAY = 120; // perfume particles released per spray

const R_GAS = 4.6; // orange gas particle radius (same in both mass settings —
// the mass experiment must change mass only, not particle size)
const R_AIR = 3.6;
const M_AIR = 1; // model mass of an "air" particle, in u

// Speeds: each velocity component is Gaussian with this sigma at 300 K and
// mass 1 u, scaled by √(T/300 K) / √(m/u) — a 2-D Maxwell-Boltzmann mix.
const SIGMA_REF = 118; // model px/s per component

const H_STEP = 1 / 120; // fixed physics sub-step (sim seconds)

// uniform collision grid: cell edge ≥ the largest pair distance (2·R_GAS)
const CELL = 10;
const GW = Math.ceil(BOX_W / CELL);
const GH = Math.ceil(BOX_H / CELL);

const TEMPS = [
  { id: 'cold', name: 'Cold', kelvin: 150 },
  { id: 'room', name: 'Room', kelvin: 300 },
  { id: 'hot', name: 'Hot', kelvin: 600 },
] as const;

const MASSES = [
  { id: 'heavy', name: 'Heavy gas', u: 4 },
  { id: 'light', name: 'Light gas', u: 1 },
] as const;

type TempId = (typeof TEMPS)[number]['id'];
type MassId = (typeof MASSES)[number]['id'];
type Mode = 'divider' | 'perfume';

const PARK = { x: BOX_W + 40, y: BOX_H + 26 }; // probe parking spot (box coords)

const tempOf = (id: TempId) => TEMPS.find((t) => t.id === id) ?? TEMPS[1];
const massOf = (id: MassId) => MASSES.find((m) => m.id === id) ?? MASSES[0];
const sigmaFor = (m: number, kelvin: number) => (SIGMA_REF * Math.sqrt(kelvin / 300)) / Math.sqrt(m);

// ---- mentor + badges --------------------------------------------------------

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'inspect',
    title: 'Look inside the chambers',
    detail:
      'Left chamber: heavy orange-brown gas. Right chamber: invisible, quicksilver air. Both sit at the same temperature — watch how the orange particles already jostle and ricochet inside their sealed half.',
    hint: 'The sidebar shows live mean speeds — the air is already whizzing past the orange.',
  },
  {
    id: 'open',
    title: 'Open the divider',
    detail:
      'Drag the glass plate up out of the box — or press “Open the divider”. The orange gas spills through the gap the instant it opens; the clock starts with the gap.',
    hint: 'Pull it all the way out — a half-open plate throttles the mixing.',
  },
  {
    id: 'mixed',
    title: 'Watch it mix itself',
    detail:
      'No fan, no stirring, no pulling — collisions alone carry the orange gas across. Wait until the mixing index passes 45%; the last few percent take a long time.',
    hint: 'Turn on particle trails to see the random walk each particle takes.',
  },
  {
    id: 'record',
    title: 'Record the run',
    detail:
      'Bank the run: the temperature, the gas mass and the times to 25% and 45% mixing land in your observation table — curve and all.',
  },
  {
    id: 'hot',
    title: 'Try it hot and race the curves',
    detail:
      'Reset the bench, choose the hot temperature and repeat the whole run. The new curve draws straight over the old one — hotter particles mix faster.',
    hint: 'Speed up playback (2× or 4×) — the simulated clock keeps every number consistent.',
  },
  {
    id: 'light',
    title: 'Try the light gas',
    detail:
      'Reset once more and pick the light gas. Same temperature, a quarter of the mass of the heavy setting: the orange particles now keep pace with the air, and the mixing curve steepens.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'first-spill', title: 'First spill', icon: '✦', detail: 'Watched the first orange particles cross into the far chamber.' },
  { id: 'mixed-45', title: 'Well mixed', icon: '◉', detail: 'Watched the mixing index climb past 45% — as uniform as diffusion gets in a hurry.' },
  { id: 'hot-run', title: 'Hot run recorded', icon: '♨', detail: 'Banked a complete run at the hot temperature (600 K).' },
  { id: 'light-run', title: 'Light gas recorded', icon: '○', detail: 'Banked a complete run with the light gas (1 u).' },
  { id: 'raced', title: 'Curve racer', icon: '⇄', detail: 'Raced two different conditions on one mixing chart.' },
];

// ---- types ------------------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
  r: number;
  orange: boolean;
  trail: number[]; // x,y pairs in box coords
  trailAcc: number;
}

interface SeriesPt {
  t: number;
  m: number;
}

interface RunRow {
  id: number;
  mode: Mode;
  temp: TempId;
  mass: MassId;
  t25: number | null;
  t45: number | null;
}

interface BankedRun {
  id: number;
  mode: Mode;
  temp: TempId;
  mass: MassId;
  pts: SeriesPt[];
}

interface Geom {
  w: number;
  h: number;
  scale: number;
  bw: number;
  bh: number;
  boxX0: number;
  boxY0: number;
  benchY: number;
  cx: number;
}

interface SimState {
  mode: Mode;
  ps: Particle[];
  grid: number[][];
  kelvin: number;
  plateY: number; // bottom edge of the divider plate (box coords; BOX_H = closed)
  plateTarget: number;
  plateDrag: boolean;
  prevPlateY: number;
  auto: { t: number; dur: number; from: number; to: number } | null;
  running: boolean; // clock running (from the first gap / the spray)
  runStarted: boolean; // conditions locked
  runT: number;
  mix: number; // % of orange particles in the right half (raw count)
  ema: number; // smoothed mixing index for threshold latching
  t25: number | null;
  t45: number | null;
  series: SeriesPt[];
  sampleAcc: number;
  vGas: number;
  vAir: number;
  orangeRight: number;
  orangeTotal: number;
  sprayed: boolean;
  recorded: boolean;
  firstCross: boolean;
  flash: number; // perfume spray flash, seconds remaining (visual)
  probe: { x: number; y: number; held: boolean; auto: { t: number; dur: number; fx: number; fy: number; tx: number; ty: number } | null; inside: boolean };
  pending: '' | 'spill' | 'spray';
  pending25: boolean;
  pending45: boolean;
  colCount: number; // particle–particle collisions this frame (for the tick rain)
  clickAcc: number;
  slideAt: number;
  acc: number;
  uiAcc: number;
  syncs: number;
  idle: number;
}

interface UiSnap {
  syncs: number;
  mode: Mode;
  mix: number;
  ema: number;
  runT: number;
  running: boolean;
  runStarted: boolean;
  gap: number;
  sprayed: boolean;
  recorded: boolean;
  t25: number | null;
  t45: number | null;
  vGas: number;
  vAir: number;
  orangeRight: number;
  orangeTotal: number;
  probeIn: boolean;
  probeT: number | null;
  probeChamber: 'left' | 'right' | null;
}

const meta = getLabBySlug('particle-model-diffusion')!;

// ---- module helpers ---------------------------------------------------------

let gaussSpare: number | null = null;
function gauss(): number {
  if (gaussSpare !== null) {
    const v = gaussSpare;
    gaussSpare = null;
    return v;
  }
  let u = 0;
  let v = 0;
  let s = 0;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const f = Math.sqrt((-2 * Math.log(s)) / s);
  gaussSpare = v * f;
  return u * f;
}

/** Elastic, momentum-conserving collision between two disks of unequal mass. */
function collidePair(s: SimState, pi: Particle, pj: Particle) {
  const dx = pi.x - pj.x;
  const dy = pi.y - pj.y;
  const rr = pi.r + pj.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 < 1e-12) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const invI = 1 / pi.m;
  const invJ = 1 / pj.m;
  const invSum = invI + invJ;
  // positional separation (weighted by inverse mass, slightly damped)
  const corr = (0.8 * (rr - d)) / invSum;
  pi.x += nx * corr * invI;
  pi.y += ny * corr * invI;
  pj.x -= nx * corr * invJ;
  pj.y -= ny * corr * invJ;
  // impulse along the normal (restitution 1 → momentum and KE both conserved)
  const dvx = pi.vx - pj.vx;
  const dvy = pi.vy - pj.vy;
  const vn = dvx * nx + dvy * ny;
  if (vn >= 0) return; // already separating
  const j = (-2 * vn) / invSum;
  pi.vx += j * nx * invI;
  pi.vy += j * ny * invI;
  pj.vx -= j * nx * invJ;
  pj.vy -= j * ny * invJ;
  s.colCount += 1;
}

/** Seed n particles on a jittered grid inside a region, at Maxwell-Boltzmann speeds. */
function seedGas(ps: Particle[], x0: number, x1: number, y0: number, y1: number, n: number, r: number, m: number, orange: boolean, sigma: number) {
  const w = x1 - x0;
  const h = y1 - y0;
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / h)));
  const rows = Math.ceil(n / cols);
  const slots: number[] = [];
  for (let i = 0; i < cols * rows; i += 1) slots.push(i);
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = slots[i];
    slots[i] = slots[j];
    slots[j] = tmp;
  }
  const cw = w / cols;
  const ch = h / rows;
  for (let k = 0; k < n; k += 1) {
    const slot = slots[k];
    const c = slot % cols;
    const rw = Math.floor(slot / cols);
    ps.push({
      x: x0 + (c + 0.5) * cw + (Math.random() - 0.5) * cw * 0.5,
      y: y0 + (rw + 0.5) * ch + (Math.random() - 0.5) * ch * 0.5,
      vx: gauss() * sigma,
      vy: gauss() * sigma,
      m,
      r,
      orange,
      trail: [],
      trailAcc: 0,
    });
  }
}

// soft glow sprite for the orange gas (pre-rendered once)
let blobSprite: HTMLCanvasElement | null = null;
function getBlob(): HTMLCanvasElement {
  if (blobSprite === null) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(226,104,34,0.5)');
      grad.addColorStop(0.55, 'rgba(214,94,30,0.22)');
      grad.addColorStop(1, 'rgba(214,94,30,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    blobSprite = c;
  }
  return blobSprite;
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

const CHART_COLORS = ['#5d8fb8', '#4f9d8a', '#8f7fb8', '#7a8798'];

// =============================================================================
//  The lab
// =============================================================================

export default function DiffusionLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef<SimState>({
    mode: 'divider',
    ps: [],
    grid: [],
    kelvin: 300,
    plateY: BOX_H,
    plateTarget: BOX_H,
    plateDrag: false,
    prevPlateY: BOX_H,
    auto: null,
    running: false,
    runStarted: false,
    runT: 0,
    mix: 0,
    ema: 0,
    t25: null,
    t45: null,
    series: [],
    sampleAcc: 0,
    vGas: 0,
    vAir: 0,
    orangeRight: 0,
    orangeTotal: 0,
    sprayed: false,
    recorded: false,
    firstCross: false,
    flash: 0,
    probe: { x: PARK.x, y: PARK.y, held: false, auto: null, inside: false },
    pending: '',
    pending25: false,
    pending45: false,
    colCount: 0,
    clickAcc: 0,
    slideAt: 0,
    acc: 0,
    uiAcc: 0,
    syncs: 0,
    idle: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ------------------------------------------------------
  const [mode, setMode] = useState<Mode>('divider');
  const [tempId, setTempId] = useState<TempId>('room');
  const [massId, setMassId] = useState<MassId>('heavy');
  const [speed, setSpeed] = useState(1);
  const [trails, setTrails] = useState(false);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [banked, setBanked] = useState<BankedRun[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [everSpilled, setEverSpilled] = useState(false);
  const [everMixed45, setEverMixed45] = useState(false);
  const [massNote, setMassNote] = useState(false);
  const [tempNote, setTempNote] = useState(false);
  const [probeNote, setProbeNote] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [fit, setFit] = useState<{ m: number; b: number; r2: number } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    syncs: 0,
    mode: 'divider',
    mix: 0,
    ema: 0,
    runT: 0,
    running: false,
    runStarted: false,
    gap: 0,
    sprayed: false,
    recorded: false,
    t25: null,
    t45: null,
    vGas: 0,
    vAir: 0,
    orangeRight: 0,
    orangeTotal: 0,
    probeIn: false,
    probeT: null,
    probeChamber: null,
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
    s.syncs += 1;
    const probeIn = s.probe.x > 2 && s.probe.x < BOX_W - 2 && s.probe.y > 2 && s.probe.y < BOX_H - 2;
    setUi({
      syncs: s.syncs,
      mode: s.mode,
      mix: s.mix,
      ema: s.ema,
      runT: s.runT,
      running: s.running,
      runStarted: s.runStarted,
      gap: clamp((BOX_H - s.plateY) / BOX_H, 0, 1),
      sprayed: s.sprayed,
      recorded: s.recorded,
      t25: s.t25,
      t45: s.t45,
      vGas: s.vGas,
      vAir: s.vAir,
      orangeRight: s.orangeRight,
      orangeTotal: s.orangeTotal,
      probeIn,
      probeT: probeIn ? s.kelvin + (Math.random() - 0.5) * 1.2 : null,
      probeChamber: probeIn ? (s.probe.x < CX ? 'left' : 'right') : null,
    });
  }, []);

  // ---- reseeding ---------------------------------------------------------------
  const reseed = useCallback((m: Mode) => {
    const s = sim.current;
    const kelvin = tempOf(tempId).kelvin;
    const mGas = massOf(massId).u;
    s.ps = [];
    s.kelvin = kelvin;
    if (m === 'divider') {
      seedGas(s.ps, R_GAS, CX - R_GAS - 4, R_GAS, BOX_H - R_GAS, N_GAS, R_GAS, mGas, true, sigmaFor(mGas, kelvin));
      seedGas(s.ps, CX + R_AIR + 4, BOX_W - R_AIR, R_AIR, BOX_H - R_AIR, N_AIR, R_AIR, M_AIR, false, sigmaFor(M_AIR, kelvin));
      s.plateY = BOX_H;
      s.plateTarget = BOX_H;
      s.prevPlateY = BOX_H;
      s.auto = null;
      s.plateDrag = false;
    } else {
      seedGas(s.ps, R_AIR, BOX_W - R_AIR, R_AIR, BOX_H - R_AIR, N_ROOM_AIR, R_AIR, M_AIR, false, sigmaFor(M_AIR, kelvin));
    }
    s.running = false;
    s.runStarted = false;
    s.runT = 0;
    s.sampleAcc = 0;
    s.series = [];
    s.ema = 0;
    s.mix = 0;
    s.t25 = null;
    s.t45 = null;
    s.firstCross = false;
    s.sprayed = false;
    s.recorded = false;
    s.flash = 0;
    s.vGas = 0;
    s.vAir = 0;
    s.orangeRight = 0;
    s.orangeTotal = 0;
    s.probe.x = PARK.x;
    s.probe.y = PARK.y;
    s.probe.auto = null;
    s.probe.held = false;
    s.probe.inside = false;
    syncUi();
  }, [tempId, massId, syncUi]);

  // ---- mentor completion flags ---------------------------------------------------
  const hotRow = rows.some((r) => r.temp === 'hot');
  const lightRow = rows.some((r) => r.mass === 'light');
  const done = [
    mentorAcked,
    everSpilled,
    everMixed45,
    rows.length >= 1,
    hotRow && rows.length >= 2,
    lightRow,
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

  // ---- nudge ------------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'open':
        return mode === 'divider'
          ? { target: 'scene', gesture: 'drag', title: 'Open the divider', body: 'Grab the glass plate — or its brass handle — and drag it up out of the box. The orange gas spills through the gap the moment it opens.' }
          : { target: 'scene', gesture: 'tap', title: 'Spray the perfume', body: 'Click the little bottle in the corner of the room to release a burst of particles — then watch them find every corner.' };
      case 'mixed':
        return { target: 'scene', gesture: 'point', title: 'Watch it mix itself', body: 'Collisions alone carry the orange gas across — wait for the mixing index in the sidebar to pass 45%.' };
      case 'record':
        return { target: 'record', gesture: 'press', title: 'Record the run', body: 'Press “Record this run” — the conditions and the times to 25% and 45% mixing land in your table.' };
      case 'hot':
        return { target: 'temp', gesture: 'press', title: 'Race it hot', body: 'Press Reset, choose the hot temperature, then open the divider again — the new curve draws over the old one.' };
      case 'light':
        return { target: 'mass', gesture: 'press', title: 'Try the light gas', body: 'Reset once more and pick the light gas — same temperature, faster particles, steeper curve.' };
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex, mode]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry --------------------------------------------------------------------
  const geom = useCallback((): Geom => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const scale = Math.min((w - 44) / BOX_W, (h * 0.68) / BOX_H, 1.05);
    const bw = BOX_W * scale;
    const bh = BOX_H * scale;
    const boxX0 = (w - bw) / 2;
    const boxY0 = Math.max(26, (h - bh) / 2 - 26);
    const benchY = boxY0 + bh + 30;
    return { w, h, scale, bw, bh, boxX0, boxY0, benchY, cx: boxX0 + bw / 2 };
  }, []);

  const bottleGeom = useCallback((g: Geom) => {
    const floorY = g.boxY0 + (BOX_H - 3) * g.scale;
    const w = Math.max(22, 26 * g.scale);
    const hh = Math.max(30, 34 * g.scale);
    const x = g.boxX0 + 24 * g.scale;
    return { x, y: floorY - hh, w, h: hh, floorY, nozzle: { x: x + w * 0.72, y: floorY - hh - 12 } };
  }, []);

  // ---- the spray ---------------------------------------------------------------------
  const spray = useCallback(() => {
    const s = sim.current;
    if (s.mode !== 'perfume' || s.sprayed) {
      if (s.mode === 'perfume' && s.sprayed) {
        pushToast('info', '✧', 'One spray per run — press reset to air the room out, then spray again.');
      }
      return;
    }
    const kelvin = tempOf(tempId).kelvin;
    const mGas = massOf(massId).u;
    const sig = sigmaFor(mGas, kelvin);
    const g = geom();
    const b = bottleGeom(g);
    const nz = {
      x: clamp((b.nozzle.x - g.boxX0) / g.scale, R_GAS + 2, BOX_W - R_GAS - 2),
      y: clamp((b.nozzle.y - g.boxY0) / g.scale, R_GAS + 2, BOX_H - R_GAS - 2),
    };
    for (let i = 0; i < N_SPRAY; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const sp = sig * (0.7 + Math.random() * 1.1);
      const rr = Math.sqrt(Math.random()) * 13;
      s.ps.push({
        x: clamp(nz.x + Math.cos(a) * rr, R_GAS, BOX_W - R_GAS),
        y: clamp(nz.y + Math.sin(a) * rr, R_GAS, BOX_H - R_GAS),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.8 - sig * 0.5,
        m: mGas,
        r: R_GAS,
        orange: true,
        trail: [],
        trailAcc: 0,
      });
    }
    s.sprayed = true;
    s.running = true;
    s.runStarted = true;
    s.runT = 0;
    s.sampleAcc = 0;
    s.series = [{ t: 0, m: 0 }];
    s.firstCross = true;
    s.pending = 'spray';
    s.flash = 0.7;
    labSound.click();
    labSound.slosh(0.55);
    notePointer(true);
  }, [tempId, massId, geom, bottleGeom, pushToast, notePointer]);

  // ---- physics step -------------------------------------------------------------------
  const stepFn = useCallback(
    (dt: number, nowS: number) => {
      const s = sim.current;
      s.idle += dt;
      if (s.ps.length === 0) reseed(s.mode);
      if (s.grid.length === 0) {
        for (let i = 0; i < GW * GH; i += 1) s.grid.push([]);
      }

      const kelvin = s.kelvin;
      const useTrails = trails;
      const isDivider = s.mode === 'divider';

      s.acc += dt * speed;
      let guard = 0;
      while (s.acc >= H_STEP && guard < 400) {
        s.acc -= H_STEP;
        guard += 1;
        const ps = s.ps;
        const n = ps.length;

        // integrate
        for (let i = 0; i < n; i += 1) {
          const p = ps[i];
          p.x += p.vx * H_STEP;
          p.y += p.vy * H_STEP;
        }

        // uniform grid rebuild
        const grid = s.grid;
        for (let c = 0; c < grid.length; c += 1) grid[c].length = 0;
        for (let i = 0; i < n; i += 1) {
          const p = ps[i];
          const gx = Math.min(GW - 1, Math.max(0, Math.floor(p.x / CELL)));
          const gy = Math.min(GH - 1, Math.max(0, Math.floor(p.y / CELL)));
          grid[gy * GW + gx].push(i);
        }

        // pair collisions (each unordered pair once: same cell + forward neighbours)
        for (let cy = 0; cy < GH; cy += 1) {
          for (let cx = 0; cx < GW; cx += 1) {
            const cell = grid[cy * GW + cx];
            const cl = cell.length;
            if (cl === 0) continue;
            const east = cx + 1 < GW ? grid[cy * GW + cx + 1] : null;
            const south = cy + 1 < GH ? grid[(cy + 1) * GW + cx] : null;
            const sw = cy + 1 < GH && cx > 0 ? grid[(cy + 1) * GW + cx - 1] : null;
            const se = cy + 1 < GH && cx + 1 < GW ? grid[(cy + 1) * GW + cx + 1] : null;
            for (let a = 0; a < cl; a += 1) {
              const i = cell[a];
              const pi = ps[i];
              for (let b = a + 1; b < cl; b += 1) collidePair(s, pi, ps[cell[b]]);
              if (east) for (let b = 0; b < east.length; b += 1) collidePair(s, pi, ps[east[b]]);
              if (sw) for (let b = 0; b < sw.length; b += 1) collidePair(s, pi, ps[sw[b]]);
              if (south) for (let b = 0; b < south.length; b += 1) collidePair(s, pi, ps[south[b]]);
              if (se) for (let b = 0; b < se.length; b += 1) collidePair(s, pi, ps[se[b]]);
            }
          }
        }

        // walls + divider plate
        for (let i = 0; i < n; i += 1) {
          const p = ps[i];
          if (p.x < p.r) {
            p.x = p.r;
            if (p.vx < 0) p.vx = -p.vx;
          } else if (p.x > BOX_W - p.r) {
            p.x = BOX_W - p.r;
            if (p.vx > 0) p.vx = -p.vx;
          }
          if (p.y < p.r) {
            p.y = p.r;
            if (p.vy < 0) p.vy = -p.vy;
          } else if (p.y > BOX_H - p.r) {
            p.y = BOX_H - p.r;
            if (p.vy > 0) p.vy = -p.vy;
          }
          if (isDivider && s.plateY > 3) {
            const nx = clamp(p.x, CX - 4, CX + 4);
            const ny = Math.min(p.y, s.plateY);
            const dx = p.x - nx;
            const dy = p.y - ny;
            const d2 = dx * dx + dy * dy;
            if (d2 < p.r * p.r) {
              if (d2 > 1e-9) {
                const d = Math.sqrt(d2);
                const ux = dx / d;
                const uy = dy / d;
                p.x = nx + ux * p.r;
                p.y = ny + uy * p.r;
                const vn = p.vx * ux + p.vy * uy;
                if (vn < 0) {
                  p.vx -= 2 * vn * ux;
                  p.vy -= 2 * vn * uy;
                }
              } else {
                // centre inside the plate — push out sideways
                if (p.x < CX) {
                  p.x = CX - 4 - p.r;
                  if (p.vx > 0) p.vx = -p.vx;
                } else {
                  p.x = CX + 4 + p.r;
                  if (p.vx < 0) p.vx = -p.vx;
                }
              }
            }
          }
        }

        // trails
        if (useTrails) {
          for (let i = 0; i < n; i += 1) {
            const p = ps[i];
            if (!p.orange) continue;
            p.trailAcc += H_STEP;
            if (p.trailAcc >= 0.06) {
              p.trailAcc = 0;
              p.trail.push(p.x, p.y);
              if (p.trail.length > 44) p.trail.splice(0, 2);
            }
          }
        }

        if (s.running) s.runT += H_STEP;
      }

      // ---- sampling, mixing index, threshold latching (every 0.25 sim s) ----
      s.sampleAcc += dt * speed;
      if (s.sampleAcc >= 0.25) {
        s.sampleAcc -= 0.25;
        let right = 0;
        let total = 0;
        let vGas = 0;
        let vAir = 0;
        let nG = 0;
        let nA = 0;
        for (const p of s.ps) {
          if (p.orange) {
            total += 1;
            if (p.x > CX) right += 1;
            vGas += Math.hypot(p.vx, p.vy);
            nG += 1;
          } else {
            vAir += Math.hypot(p.vx, p.vy);
            nA += 1;
          }
        }
        s.orangeRight = right;
        s.orangeTotal = total;
        s.mix = total > 0 ? (right / total) * 100 : 0;
        s.vGas = nG > 0 ? vGas / nG : 0;
        s.vAir = nA > 0 ? vAir / nA : 0;
        s.ema += 0.25 * (s.mix - s.ema);
        if (s.running) {
          s.series.push({ t: s.runT, m: s.mix });
          if (s.series.length > 2400) s.series.splice(0, s.series.length - 2400);
          if (!s.firstCross && s.mix > 0) {
            s.firstCross = true;
            s.pending = 'spill';
          }
          if (s.t25 === null && s.ema >= 25) {
            s.t25 = s.runT;
            s.pending25 = true;
          }
          if (s.t45 === null && s.ema >= 45) {
            s.t45 = s.runT;
            s.pending45 = true;
          }
        }
      }

      // ---- divider plate follows the pointer / auto-pull ----
      if (s.plateDrag) {
        s.plateY += (s.plateTarget - s.plateY) * Math.min(1, dt * 18);
      } else if (s.auto) {
        s.auto.t += dt;
        const k = Math.min(1, s.auto.t / s.auto.dur);
        const e = k * k * (3 - 2 * k);
        s.plateY = s.auto.from + (s.auto.to - s.auto.from) * e;
        if (k >= 1) {
          s.auto = null;
          labSound.glassClink(true);
        }
      }
      const plateSpeed = Math.abs(s.plateY - s.prevPlateY);
      if ((s.plateDrag || s.auto) && nowS - s.slideAt > 0.11 && plateSpeed > 0.03) {
        s.slideAt = nowS;
        labSound.slide(clamp(0.25 + plateSpeed * 0.05, 0.2, 1));
      }
      s.prevPlateY = s.plateY;

      // the clock starts the moment the gap first opens
      if (isDivider && !s.running && BOX_H - s.plateY > 3) {
        s.running = true;
        s.runStarted = true;
        s.runT = 0;
        s.series = [{ t: 0, m: s.mix }];
      }

      // ---- probe auto-flight home ----
      const pa = s.probe.auto;
      if (pa) {
        pa.t += dt;
        const k = Math.min(1, pa.t / pa.dur);
        const e = k * k * (3 - 2 * k);
        s.probe.x = pa.fx + (pa.tx - pa.fx) * e;
        s.probe.y = pa.fy + (pa.ty - pa.fy) * e;
        if (k >= 1) s.probe.auto = null;
      }
      const probeInside = s.probe.x > 2 && s.probe.x < BOX_W - 2 && s.probe.y > 2 && s.probe.y < BOX_H - 2;
      if (probeInside && !s.probe.inside) {
        s.probe.inside = true;
        setProbeNote(true);
        labSound.tick();
        window.setTimeout(() => setProbeNote(false), 6000);
      } else if (!probeInside) {
        s.probe.inside = false;
      }

      // ---- collision tick rain (soft clicks scaled by collision rate) ----
      const cps = s.colCount / Math.max(dt, 1e-3);
      s.colCount = 0;
      if (cps > 2) {
        const rate = Math.min(13, 0.8 * Math.sqrt(cps));
        s.clickAcc = Math.min(3, s.clickAcc + dt * rate);
        while (s.clickAcc >= 1) {
          s.clickAcc -= 1;
          labSound.tick();
        }
      } else {
        s.clickAcc = 0;
      }

      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.4);

      // ---- deferred events ----
      if (s.pending === 'spill') {
        s.pending = '';
        earn('first-spill');
        setEverSpilled(true);
        labSound.glassClink(true);
        pushToast('info', '✦', 'First spill — orange particles are crossing the divide, one collision at a time.');
      } else if (s.pending === 'spray') {
        s.pending = '';
        earn('first-spill');
        setEverSpilled(true);
        pushToast('info', '✦', 'A burst of perfume particles — watch the random walk carry them to every corner of the room.');
      }
      if (s.pending25) {
        s.pending25 = false;
        labSound.ping(560, 0.07);
      }
      if (s.pending45) {
        s.pending45 = false;
        labSound.milestone();
        earn('mixed-45');
        setEverMixed45(true);
        pushToast('good', '◉', '45% mixed — the gases are nearly uniform. Record the run, then race a different condition.');
      }

      s.uiAcc += dt;
      if (s.uiAcc > 0.1) {
        s.uiAcc = 0;
        syncUi();
      }
      void kelvin;
    },
    [speed, trails, reseed, earn, pushToast, syncUi],
  );

  // ---- drawing -----------------------------------------------------------------------
  const drawFn = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const s = sim.current;
      const g = geom();
      const t = s.idle;

      // background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#eef2f6');
      bg.addColorStop(1, '#e2e8ee');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // bench
      ctx.strokeStyle = '#c9d2db';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, g.benchY);
      ctx.lineTo(w, g.benchY);
      ctx.stroke();
      ctx.strokeStyle = '#dde4ea';
      ctx.lineWidth = 1;
      for (let x = 10; x < w; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, g.benchY);
        ctx.lineTo(x - 10, g.benchY + 10);
        ctx.stroke();
      }

      // plinth the box stands on
      ctx.fillStyle = '#5d6a79';
      roundRect(ctx, g.boxX0 - 12, g.boxY0 + g.bh - 4, g.bw + 24, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#3a4450';
      roundRect(ctx, g.boxX0 + g.bw * 0.22, g.benchY - 18, 14, 20, 3);
      ctx.fill();
      roundRect(ctx, g.boxX0 + g.bw * 0.78 - 14, g.benchY - 18, 14, 20, 3);
      ctx.fill();

      // faint dotted marker for the measurement boundary (the "right half")
      ctx.save();
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = 'rgba(144,160,176,0.4)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(g.cx, g.boxY0 + 6);
      ctx.lineTo(g.cx, g.boxY0 + g.bh - 6);
      ctx.stroke();
      ctx.restore();

      // ---- interior: glow blobs, trails, particles (clipped to the box) ----
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.boxX0 + 3, g.boxY0 + 3, g.bw - 6, g.bh - 6);
      ctx.clip();

      const toX = (x: number) => g.boxX0 + x * g.scale;
      const toY = (y: number) => g.boxY0 + y * g.scale;

      // soft gas glow
      const blob = getBlob();
      const blobSize = Math.max(16, R_GAS * g.scale * 5.5);
      for (const p of s.ps) {
        if (!p.orange) continue;
        ctx.drawImage(blob, toX(p.x) - blobSize / 2, toY(p.y) - blobSize / 2, blobSize, blobSize);
      }

      // fading trails (three alpha buckets keep it cheap)
      if (trails) {
        const buckets: Path2D[] = [new Path2D(), new Path2D(), new Path2D()];
        for (const p of s.ps) {
          if (!p.orange) continue;
          const n2 = p.trail.length / 2;
          if (n2 < 2) continue;
          for (let i = 1; i < n2; i += 1) {
            const bIdx = Math.min(2, Math.floor((i / n2) * 3));
            buckets[bIdx].moveTo(toX(p.trail[(i - 1) * 2]), toY(p.trail[(i - 1) * 2 + 1]));
            buckets[bIdx].lineTo(toX(p.trail[i * 2]), toY(p.trail[i * 2 + 1]));
          }
        }
        const alphas = [0.1, 0.22, 0.36];
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 3; i += 1) {
          ctx.strokeStyle = `rgba(232,99,42,${alphas[i]})`;
          ctx.stroke(buckets[i]);
        }
      }

      // particles
      for (const p of s.ps) {
        if (p.orange) {
          ctx.fillStyle = '#cf5b17';
          ctx.strokeStyle = '#7c3a10';
        } else {
          ctx.fillStyle = 'rgba(126,148,168,0.55)';
          ctx.strokeStyle = 'rgba(100,120,140,0.4)';
        }
        const rr = p.orange ? Math.max(2.2, p.r * g.scale) : Math.max(1.6, p.r * g.scale);
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.y), rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // perfume spray flash
      if (s.mode === 'perfume' && s.flash > 0) {
        const b = bottleGeom(g);
        const k = 1 - s.flash / 0.7;
        ctx.strokeStyle = `rgba(232,99,42,${0.55 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.nozzle.x, b.nozzle.y, 8 + k * 46, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + k * 2;
          const rr2 = 10 + k * 40;
          ctx.fillStyle = `rgba(226,120,50,${0.5 * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(b.nozzle.x + Math.cos(a) * rr2, b.nozzle.y + Math.sin(a) * rr2, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ---- divider plate ----
      if (s.mode === 'divider') {
        const plateBotPx = g.boxY0 + s.plateY * g.scale;
        const plateTopPx = plateBotPx - (BOX_H + 34) * g.scale;
        ctx.fillStyle = 'rgba(214,232,240,0.55)';
        ctx.fillRect(g.cx - 4 * g.scale, Math.max(-80, plateTopPx), 8 * g.scale, plateBotPx - Math.max(-80, plateTopPx));
        ctx.strokeStyle = s.plateDrag ? '#e8632a' : '#8da8b9';
        ctx.lineWidth = s.plateDrag ? 2.5 : 1.75;
        ctx.strokeRect(g.cx - 4 * g.scale, Math.max(-80, plateTopPx), 8 * g.scale, plateBotPx - Math.max(-80, plateTopPx));
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g.cx - 1.2 * g.scale, Math.max(-80, plateTopPx) + 4);
        ctx.lineTo(g.cx - 1.2 * g.scale, plateBotPx - 4);
        ctx.stroke();
        // collar at the slot
        ctx.fillStyle = '#d9a441';
        roundRect(ctx, g.cx - 8, g.boxY0 - 5, 16, 10, 3);
        ctx.fill();
        ctx.strokeStyle = '#8a6420';
        ctx.lineWidth = 1;
        ctx.stroke();
        // brass handle on top of the plate
        const handleY = Math.max(-80, plateTopPx) - 9;
        ctx.fillStyle = '#d9a441';
        roundRect(ctx, g.cx - 21, handleY, 42, 9, 4);
        ctx.fill();
        ctx.strokeStyle = '#8a6420';
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.fillStyle = '#b57f26';
        roundRect(ctx, g.cx - 5, handleY - 6, 10, 7, 2);
        ctx.fill();
        // affordance: pulsing dashes on the handle before the first opening
        if (!s.running && !s.plateDrag) {
          ctx.save();
          ctx.setLineDash([5, 6]);
          ctx.lineDashOffset = -t * 24;
          ctx.strokeStyle = 'rgba(249,115,22,0.75)';
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          ctx.arc(g.cx, handleY + 4, 26 + Math.sin(t * 3) * 2.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // drag affordance
        if (s.plateDrag) {
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = '#e8632a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(g.cx, plateBotPx);
          ctx.lineTo(g.cx, g.boxY0 + g.bh);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ---- glass walls (front) ----
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(g.boxX0, g.boxY0, g.bw, g.bh);
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 3;
      ctx.strokeRect(g.boxX0, g.boxY0, g.bw, g.bh);
      ctx.strokeStyle = '#c6d8e2';
      ctx.lineWidth = 1;
      ctx.strokeRect(g.boxX0 + 4, g.boxY0 + 4, g.bw - 8, g.bh - 8);
      // corner caps
      ctx.strokeStyle = '#5d6a79';
      ctx.lineWidth = 3;
      const cap = 16;
      const corners: [number, number, number, number][] = [
        [g.boxX0, g.boxY0, 1, 1],
        [g.boxX0 + g.bw, g.boxY0, -1, 1],
        [g.boxX0, g.boxY0 + g.bh, 1, -1],
        [g.boxX0 + g.bw, g.boxY0 + g.bh, -1, -1],
      ];
      for (const [x, y, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x + sx * cap, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + sy * cap);
        ctx.stroke();
      }
      // slot in the top wall
      ctx.fillStyle = '#3a4450';
      ctx.fillRect(g.cx - 9, g.boxY0 - 3, 18, 6);

      // glass reflections (one drifts with idle time — the bench never sleeps)
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.boxX0 + 4, g.boxY0 + 4, g.bw - 8, g.bh - 8);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      const shimmer = Math.sin(t * 0.45) * 18;
      ctx.save();
      ctx.translate(g.boxX0 + g.bw * 0.18 + shimmer, g.boxY0);
      ctx.rotate(0.35);
      ctx.fillRect(0, -20, 26, g.bh * 1.5);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.save();
      ctx.translate(g.boxX0 + g.bw * 0.7 - shimmer * 0.6, g.boxY0);
      ctx.rotate(0.35);
      ctx.fillRect(0, -20, 12, g.bh * 1.5);
      ctx.restore();
      ctx.restore();

      // ---- perfume bottle ----
      if (s.mode === 'perfume') {
        const b = bottleGeom(g);
        // body
        const bodyG = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        bodyG.addColorStop(0, 'rgba(240,205,150,0.75)');
        bodyG.addColorStop(1, 'rgba(190,130,60,0.7)');
        ctx.fillStyle = bodyG;
        roundRect(ctx, b.x, b.y, b.w, b.h, 6);
        ctx.fill();
        ctx.strokeStyle = '#8a5a14';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // liquid
        const level = s.sprayed ? 0.28 : 0.62;
        const lh = (b.h - 8) * level;
        const liq = ctx.createLinearGradient(0, b.y + b.h - 4 - lh, 0, b.y + b.h - 4);
        liq.addColorStop(0, 'rgba(201,138,46,0.95)');
        liq.addColorStop(1, 'rgba(122,72,18,0.95)');
        ctx.fillStyle = liq;
        roundRect(ctx, b.x + 3.5, b.y + b.h - 4 - lh, b.w - 7, lh, 4);
        ctx.fill();
        // neck + pump head
        ctx.fillStyle = '#a9845c';
        ctx.fillRect(b.x + b.w * 0.4, b.y - 7, b.w * 0.2, 8);
        ctx.fillStyle = '#3a4450';
        roundRect(ctx, b.x + b.w * 0.28, b.y - 17, b.w * 0.44, 11, 3);
        ctx.fill();
        ctx.fillStyle = '#2b333d';
        ctx.fillRect(b.nozzle.x - 2.5, b.y - 22, 5, 6);
        // highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(b.x + 5, b.y + 6);
        ctx.lineTo(b.x + 5, b.y + b.h - 8);
        ctx.stroke();
        // affordance before the spray
        if (!s.sprayed && !s.probe.held) {
          ctx.save();
          ctx.setLineDash([5, 6]);
          ctx.lineDashOffset = -t * 24;
          ctx.strokeStyle = 'rgba(249,115,22,0.75)';
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 30 + Math.sin(t * 3) * 2.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ---- temperature probe ----
      const px = g.boxX0 + s.probe.x * g.scale;
      const py = g.boxY0 + s.probe.y * g.scale;
      const rodEndX = px + 16;
      const rodEndY = py - 42;
      ctx.strokeStyle = 'rgba(141,153,166,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rodEndX, rodEndY);
      ctx.quadraticCurveTo(px + 44, py - 68, w - 8, g.boxY0 + 26);
      ctx.stroke();
      ctx.strokeStyle = '#5d6a79';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(rodEndX, rodEndY);
      ctx.stroke();
      ctx.fillStyle = '#3a4450';
      roundRect(ctx, rodEndX - 5, rodEndY - 8, 10, 16, 3);
      ctx.fill();
      const bulbGrad = ctx.createRadialGradient(px - 1.5, py - 1.5, 1, px, py, 5.5);
      bulbGrad.addColorStop(0, '#f6d27c');
      bulbGrad.addColorStop(1, '#b57f26');
      ctx.fillStyle = bulbGrad;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a6420';
      ctx.lineWidth = 1;
      ctx.stroke();
      // status LED on the grip
      const inside = s.probe.x > 2 && s.probe.x < BOX_W - 2 && s.probe.y > 2 && s.probe.y < BOX_H - 2;
      ctx.fillStyle = inside ? '#34c759' : '#9aa4b1';
      ctx.beginPath();
      ctx.arc(rodEndX, rodEndY - 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (s.probe.held) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(249,115,22,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
    [geom, bottleGeom, trails],
  );

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;
    const g = geom();

    // probe first (it can sit anywhere, including over the plate)
    const probePx = g.boxX0 + s.probe.x * g.scale;
    const probePy = g.boxY0 + s.probe.y * g.scale;
    if (Math.hypot(px - probePx, py - probePy) < 28) {
      s.probe.held = true;
      s.probe.auto = null;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      labSound.creak(0.35);
      notePointer(true);
      return;
    }

    if (s.mode === 'divider') {
      const plateBotPx = g.boxY0 + s.plateY * g.scale;
      const plateTopPx = plateBotPx - (BOX_H + 34) * g.scale;
      if (Math.abs(px - g.cx) < 30 && py > Math.max(-60, plateTopPx - 16) && py < plateBotPx + 14) {
        s.plateDrag = true;
        s.auto = null;
        s.plateTarget = s.plateY;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic pointer */
        }
        notePointer(true);
        return;
      }
    } else {
      const b = bottleGeom(g);
      if (Math.hypot(px - (b.x + b.w / 2), py - (b.y + b.h / 2)) < 36) {
        spray();
        return;
      }
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (s.probe.held) {
      const g = geom();
      s.probe.x = clamp((px - g.boxX0) / g.scale, -20, BOX_W + 90);
      s.probe.y = clamp((py - g.boxY0) / g.scale, -30, BOX_H + 60);
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (s.plateDrag) {
      const g = geom();
      s.plateTarget = clamp((py - g.boxY0) / g.scale, 0, BOX_H);
      canvas.style.cursor = 'grabbing';
      return;
    }

    // hover cursor
    const g = geom();
    const probePx = g.boxX0 + s.probe.x * g.scale;
    const probePy = g.boxY0 + s.probe.y * g.scale;
    let cursor = '';
    if (Math.hypot(px - probePx, py - probePy) < 28) {
      cursor = 'grab';
    } else if (s.mode === 'divider') {
      const plateBotPx = g.boxY0 + s.plateY * g.scale;
      const plateTopPx = plateBotPx - (BOX_H + 34) * g.scale;
      if (Math.abs(px - g.cx) < 30 && py > Math.max(-60, plateTopPx - 16) && py < plateBotPx + 14) cursor = 'grab';
    } else if (!s.sprayed) {
      const b = bottleGeom(g);
      if (Math.hypot(px - (b.x + b.w / 2), py - (b.y + b.h / 2)) < 36) cursor = 'pointer';
    }
    canvas.style.cursor = cursor;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const s = sim.current;
    if (s.probe.held) {
      s.probe.held = false;
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      const inside = s.probe.x > 2 && s.probe.x < BOX_W - 2 && s.probe.y > 2 && s.probe.y < BOX_H - 2;
      if (!inside) {
        s.probe.auto = { t: 0, dur: 0.55, fx: s.probe.x, fy: s.probe.y, tx: PARK.x, ty: PARK.y };
      }
      labSound.thunk(true);
      notePointer(true);
    } else if (s.plateDrag) {
      s.plateDrag = false;
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      notePointer(true);
    }
  };

  // ---- controls ---------------------------------------------------------------------
  const openDivider = useCallback(() => {
    const s = sim.current;
    if (s.mode !== 'divider' || s.plateY < 6) return;
    s.auto = { t: 0, dur: 1.5, from: s.plateY, to: 4 };
    notePointer(true);
  }, [notePointer]);

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    const s = sim.current;
    s.mode = next;
    setMode(next);
    reseed(next);
    labSound.tick();
    pushToast('info', '⇄', next === 'perfume' ? 'Perfume-bottle room — click the bottle in the corner to release a burst.' : 'Divider jars — fresh chambers, glass plate closed.');
    notePointer(true);
  };

  const changeTemp = (id: TempId) => {
    if (id === tempId || sim.current.runStarted) return;
    setTempId(id);
    labSound.tick();
    setTempNote(true);
    window.setTimeout(() => setTempNote(false), 6000);
    notePointer(true);
    // reseed at the new temperature (the bench is still closed, so nothing is lost)
    window.setTimeout(() => reseed(sim.current.mode), 0);
  };

  const changeMass = (id: MassId) => {
    if (id === massId || sim.current.runStarted) return;
    setMassId(id);
    labSound.tick();
    setMassNote(true);
    window.setTimeout(() => setMassNote(false), 6000);
    notePointer(true);
    window.setTimeout(() => reseed(sim.current.mode), 0);
  };

  const toggleTrails = () => {
    const next = !trails;
    setTrails(next);
    labSound.tick();
    notePointer(true);
    if (!next) {
      for (const p of sim.current.ps) {
        p.trail = [];
        p.trailAcc = 0;
      }
    }
  };

  const recordRun = () => {
    const s = sim.current;
    if (s.t25 === null || s.recorded) return;
    const row: RunRow = { id: rows.length + 1, mode: s.mode, temp: tempId, mass: massId, t25: s.t25, t45: s.t45 };
    const nextRows = [...rows, row];
    setRows(nextRows);
    setBanked((cur) => [...cur, { id: row.id, mode: s.mode, temp: tempId, mass: massId, pts: s.series.slice() }].slice(-4));
    s.recorded = true;
    labSound.click();
    const t45txt = s.t45 !== null ? ` · t₄₅ ${s.t45.toFixed(1)} s` : '';
    pushToast('good', '✎', `Recorded run ${row.id} — ${tempOf(tempId).name.toLowerCase()} · ${massOf(massId).name.toLowerCase()} · t₂₅ ${s.t25.toFixed(1)} s${t45txt}`);
    if (tempId === 'hot') earn('hot-run');
    if (massId === 'light') earn('light-run');
    const raced = nextRows.some((a, i) => nextRows.some((b, j) => j > i && (a.temp !== b.temp || a.mass !== b.mass || a.mode !== b.mode)));
    if (raced) earn('raced');
    notePointer(true);
    syncUi();
  };

  const resetAll = () => {
    reseed(sim.current.mode);
    pushToast('info', '↺', sim.current.mode === 'divider' ? 'Bench reset — divider closed, fresh gases on both sides.' : 'Room reset — fresh air, perfume bottle refilled.');
  };

  // ---- coach -------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (massNote) return { tone: 'info', line: 'Mass swapped: at the same temperature the light gas moves at twice the heavy gas\u2019s speed — average speed scales as 1/\u221Am, so 4 u : 1 u means 1 : 2.' };
    if (tempNote) return { tone: 'info', line: 'Temperature set: particle speeds rescale with \u221AT — hot (600 K) moves \u221A2 \u2248 1.41\u00D7 faster than room (300 K), cold the same fraction slower.' };
    if (probeNote) return { tone: 'info', line: 'The probe reads the same temperature on both sides of the box — the orange gas lags because its particles are heavier, not because they are colder.' };
    if (!mentorAcked) return { tone: 'info', line: 'Two sealed chambers, one glass divider. Orange-heavy gas on the left, invisible quicksilver air on the right — both at room temperature.' };
    if (ui.mode === 'divider' && !ui.running) {
      return { tone: 'info', line: 'Drag the glass plate up out of the box when you are ready — the clock starts the moment the gap opens.' };
    }
    if (ui.mode === 'perfume' && !ui.sprayed) {
      return { tone: 'info', line: 'Click the little bottle in the corner of the room — a burst of particles will spread from that one spot.' };
    }
    if (ui.t45 === null && ui.running) {
      const line = ui.mix < 25
        ? `${ui.mix.toFixed(0)}% of the orange gas has crossed — every collision is perfectly elastic; nothing is pulling it, it is just statistics adding up.`
        : `${ui.mix.toFixed(0)}% mixed — the last stretch is the slowest. Diffusion approaches uniformity but never quite finishes.`;
      return { tone: 'info', line };
    }
    if (ui.t45 !== null && !ui.recorded) {
      return { tone: 'good', line: 'Well mixed — record the run, then reset and change one condition to race the curves.' };
    }
    if (rows.length >= 1 && !hotRow) {
      return { tone: 'good', line: 'Run banked. Reset the bench, choose the hot temperature and repeat — the new curve will draw straight over the old one.' };
    }
    if (hotRow && !lightRow) {
      return { tone: 'good', line: 'Two climates compared. One variable left: reset and pick the light gas for the final race.' };
    }
    if (lightRow && rows.length < 2) {
      return { tone: 'good', line: 'Light-gas run banked — record one more under different conditions to see the curves race on one chart.' };
    }
    if (lightRow) {
      return { tone: 'good', line: 'Full sweep: temperature and mass both raced. Open Observations — your t\u2084\u2085-versus-t\u2082\u2085 points should all sit on ONE straight line, whatever the conditions.' };
    }
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [massNote, tempNote, probeNote, mentorAcked, ui, rows.length, hotRow, lightRow]);

  // ---- status -----------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : ui.t45 !== null
      ? 'Well mixed — record it'
      : ui.running
        ? `Mixing — ${ui.mix.toFixed(0)}%`
        : ui.mode === 'divider'
          ? ui.gap > 0.02
            ? 'Divider open'
            : 'Ready — divider closed'
          : ui.sprayed
            ? 'Perfume spreading'
            : 'Room ready — perfume waits';
  const statusTone: 'ready' | 'active' | 'complete' = complete ? 'complete' : ui.running ? 'active' : 'ready';

  const legend = useMemo(
    () =>
      ui.mode === 'divider'
        ? [
            { color: '#cf5b17', label: 'Orange gas (heavy)' },
            { color: '#7e94a8', label: 'Air (drawn faint)' },
            { color: '#a9c6da', label: 'Glass divider' },
          ]
        : [
            { color: '#cf5b17', label: 'Perfume particles' },
            { color: '#7e94a8', label: 'Room air (drawn faint)' },
            { color: '#c98a2e', label: 'Perfume bottle' },
          ],
    [ui.mode],
  );

  const getLive = useCallback(() => sim.current.series, []);

  const plotPts = useMemo(
    () => rows.filter((r) => r.t25 !== null && r.t45 !== null).map((r) => ({ x: r.t25 as number, y: r.t45 as number })),
    [rows],
  );

  // ---- render ------------------------------------------------------------------------
  const recordLabel =
    ui.t25 !== null && !ui.recorded
      ? `✎ Record this run — ${tempOf(tempId).name.toLowerCase()} · ${massOf(massId).name.toLowerCase()} · t₂₅ ${ui.t25.toFixed(1)} s${ui.t45 !== null ? ` · t₄₅ ${ui.t45.toFixed(1)} s` : ''}`
      : ui.recorded
        ? '✓ Run recorded — reset to change conditions and race again'
        : 'Record unlocks when 25% of the orange gas has crossed';

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Molecular dynamics · elastic collisions"
      legend={legend}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack:
          mentorIndex === 0 && !mentorAcked
            ? { label: 'Got it — start the experiment', onClick: () => setMentorAcked(true) }
            : undefined,
      }}
      toolbarExtra={
        <label>
          Playback
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Playback speed">
            <option value={1}>1× real time</option>
            <option value={2}>2× faster</option>
            <option value={4}>4× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Diffusion bench — drag the glass divider up to let the gases mix, click the perfume bottle to spray, drag the temperature probe into a chamber"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              if (sim.current.mode === 'divider') openDivider();
              else spray();
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
          <div className="diff-layout">
            <div className="diff-conds">
              <div className="diff-seg-label" data-nudge="mode">
                <span>Bench</span>
              </div>
              <div className="diff-seg-row two">
                <button type="button" className={mode === 'divider' ? 'diff-seg-btn active' : 'diff-seg-btn'} onClick={() => changeMode('divider')} aria-pressed={mode === 'divider'}>
                  Divider jars
                </button>
                <button type="button" className={mode === 'perfume' ? 'diff-seg-btn active' : 'diff-seg-btn'} onClick={() => changeMode('perfume')} aria-pressed={mode === 'perfume'}>
                  Perfume bottle
                </button>
              </div>

              <div className="diff-seg-label" data-nudge="temp">
                <span>Temperature</span>
                <strong>{tempOf(tempId).kelvin} K</strong>
              </div>
              <div className="diff-seg-row three">
                {TEMPS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={tempId === t.id ? 'diff-seg-btn active' : 'diff-seg-btn'}
                    disabled={ui.runStarted}
                    onClick={() => changeTemp(t.id)}
                    aria-pressed={tempId === t.id}
                  >
                    {t.name} · {t.kelvin} K
                  </button>
                ))}
              </div>

              <div className="diff-seg-label" data-nudge="mass">
                <span>Orange gas mass</span>
                <strong>{massOf(massId).u} u</strong>
              </div>
              <div className="diff-seg-row two">
                {MASSES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={massId === m.id ? 'diff-seg-btn active' : 'diff-seg-btn'}
                    disabled={ui.runStarted}
                    onClick={() => changeMass(m.id)}
                    aria-pressed={massId === m.id}
                  >
                    {m.name} · {m.u} u
                  </button>
                ))}
              </div>

              <button type="button" className={trails ? 'diff-seg-btn trails active' : 'diff-seg-btn trails'} onClick={toggleTrails} aria-pressed={trails}>
                {trails ? '∘ Particle trails — on' : '∘ Particle trails — off'}
              </button>

              <p className="diff-note">Air particles are 1 u — at one temperature, speed scales as 1/√m, so the 4 u : 1 u choice is a 1 : 2 speed ratio.</p>
              {ui.runStarted && <p className="diff-lock">Conditions are locked while a run is live — press reset to change them.</p>}
            </div>

            <div className="diff-actions">
              <button
                className="action-button"
                type="button"
                onClick={() => {
                  if (sim.current.mode === 'divider') openDivider();
                  else spray();
                }}
                disabled={ui.mode === 'divider' ? ui.gap > 0.98 : ui.sprayed}
              >
                <span className="dispense-icon" aria-hidden="true">{ui.mode === 'divider' ? '⇑' : '✧'}</span>
                <span>{ui.mode === 'divider' ? 'Open the divider' : 'Spray the perfume'}</span>
                <small>{ui.mode === 'divider' ? 'or drag the glass plate yourself' : 'or click the bottle on the bench'}</small>
              </button>

              <div className="diff-clock">
                <span>SIM CLOCK · FROM THE MOMENT THE GAP OPENS</span>
                <strong className={ui.running ? 'running' : ''}>{fmtClock(ui.runT)}</strong>
                <div className="diff-clock-track">
                  <span style={{ width: `${clamp((ui.ema / 45) * 100, 0, 100)}%` }} />
                </div>
                <div className="diff-clock-scale">
                  <span>{ui.t25 !== null ? `t₂₅ ${ui.t25.toFixed(1)} s` : 'waiting for 25%'}</span>
                  <span>{ui.t45 !== null ? `t₄₅ ${ui.t45.toFixed(1)} s` : 'waiting for 45%'}</span>
                </div>
              </div>

              <button type="button" className="text-button diff-reset" onClick={() => { labSound.reset(); resetAll(); }}>
                ↺ Close divider &amp; reset gases
              </button>
            </div>
          </div>

          <div className="hint-row">
            <span>✦</span>
            <p style={{ margin: 0 }}>Nothing pulls the gas across — each particle simply bounces. Thousands of elastic collisions add up to the mixing you see: that is diffusion.</p>
          </div>

          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRun(); notePointer(true); }}
            disabled={ui.t25 === null || ui.recorded}
          >
            {recordLabel}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header">
            <div>
              <span className="panel-kicker">LIVE INSTRUMENT</span>
              <h2>Mixing bench</h2>
            </div>
            <span className="instrument-live">LIVE</span>
          </div>
          <div className="reading-main">
            <span>Orange gas in the right half</span>
            <strong>
              {ui.mix.toFixed(0)} <small>%</small>
            </strong>
            <div className="reading-track">
              <span style={{ width: `${clamp((ui.mix / 50) * 100, 0, 100)}%` }} />
            </div>
            <div className="reading-scale">
              <span>0%</span>
              <span>50% = uniform</span>
            </div>
          </div>
          <div className="reading-grid">
            <div>
              <span>{ui.mode === 'divider' ? 'Divider' : 'Spray'}</span>
              <strong>{ui.mode === 'divider' ? (ui.gap > 0.98 ? 'Open' : ui.gap > 0.02 ? 'Partly open' : 'Closed') : ui.sprayed ? 'Released' : 'Waiting'}</strong>
            </div>
            <div>
              <span>Clock</span>
              <strong>{fmtClock(ui.runT)}</strong>
            </div>
            <div>
              <span>Mean speed, orange</span>
              <strong>{Math.round(ui.vGas)} <small>px/s</small></strong>
            </div>
            <div>
              <span>Mean speed, air</span>
              <strong>{Math.round(ui.vAir)} <small>px/s</small></strong>
            </div>
            <div>
              <span>Orange left / right</span>
              <strong>
                {ui.orangeTotal - ui.orangeRight} / {ui.orangeRight}
              </strong>
            </div>
            <div>
              <span>Temperature</span>
              <strong>{tempOf(tempId).kelvin} K</strong>
            </div>
          </div>
          <div className="diff-probe">
            <span>TEMPERATURE PROBE · DRAG IT INTO EITHER CHAMBER</span>
            <strong>
              {ui.probeT !== null ? (
                <>
                  {ui.probeT.toFixed(0)} <small>K</small>
                </>
              ) : (
                <small className="diff-probe-out">outside the box</small>
              )}
            </strong>
            <p>
              {ui.probeT !== null
                ? `Reading the ${ui.probeChamber === 'left' ? 'left' : 'right'} chamber — both sides share one temperature; the orange gas lags on speed, not warmth.`
                : 'Park the brass bulb anywhere inside the box to read the simulated temperature.'}
            </p>
          </div>
          <MixingChart runs={banked} getLive={getLive} version={ui.syncs} liveOn={ui.running} height={185} xLabel={ui.mode === 'divider' ? 'time since the divider opened (s)' : 'time since the spray (s)'} />
          <div className="diff-chart-legend">
            {banked.map((r, i) => (
              <span key={r.id}>
                <i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} /> run {r.id} · {tempOf(r.temp).name.toLowerCase()} · {massOf(r.mass).name.toLowerCase()}
              </span>
            ))}
            <span>
              <i style={{ background: '#e8632a' }} /> this run
            </span>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Look inside the two chambers: heavy orange gas left, invisible fast air right — the sidebar shows both mean speeds.</li>
              <li>Drag the glass divider up out of the box (or press “Open the divider”). The clock starts the moment the gap opens.</li>
              <li>Watch the mixing index climb. Turn on particle trails to see each particle&apos;s random walk.</li>
              <li>Record the run once it passes 25% — the conditions, t₂₅ and t₄₅ land in your table.</li>
              <li>Reset, set the hot temperature, and repeat: the new curve draws over the old one.</li>
              <li>Reset once more, pick the light gas, and race all three curves on one chart.</li>
              <li>Curious? Switch to the perfume-bottle bench and spray a burst into the room from a single spot.</li>
            </ol>
            <div className="hint-box">
              <span>✦</span>
              <p>
                <strong>Lab tip</strong>Speed up playback (2× or 4×) to rush the slow middle of a cold run — the simulated clock keeps every recorded number consistent. Pull the divider fully out: a half-open plate throttles the mixing.
              </p>
            </div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Open the divider, let the gases mix, and record your first run — the times to 25% and 45% mixing are latched automatically from the live curve.</p>
            ) : (
              <table className="trial-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Bench</th>
                    <th>Temp</th>
                    <th>Gas</th>
                    <th>t₂₅ (s)</th>
                    <th>t₄₅ (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.mode === 'divider' ? 'Divider' : 'Perfume'}</td>
                      <td>{tempOf(r.temp).name} · {tempOf(r.temp).kelvin} K</td>
                      <td>{massOf(r.mass).name} · {massOf(r.mass).u} u</td>
                      <td>{r.t25 !== null ? r.t25.toFixed(1) : '—'}</td>
                      <td>{r.t45 !== null ? r.t45.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 style={{ marginTop: 16 }}>Raced mixing curves</h3>
            <MixingChart runs={banked} getLive={getLive} version={ui.syncs} liveOn={ui.running} height={215} xLabel={ui.mode === 'divider' ? 'time since the divider opened (s)' : 'time since the spray (s)'} />
            <p className="observation-note">
              Live run in orange; recorded runs faded. Dashed guides mark 25%, 45% and the 50% uniformity line. Hotter or lighter gases climb the same shape faster — the curve never changes shape, only its clock.
            </p>

            {plotPts.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>t₄₅ versus t₂₅ — one line for every gas</h3>
                <Plot
                  points={plotPts}
                  xLabel="time to 25% mixing (s)"
                  yLabel="time to 45% mixing (s)"
                  fitLine
                  onFit={(f) => setFit(f)}
                  height={210}
                />
                {fit && (
                  <p className="observation-note">
                    Slope = {fit.m.toFixed(2)} (R² = {fit.r2.toFixed(3)}). Whatever the temperature or the mass, t₄₅ is a fixed multiple of t₂₅ — every setting walks the same mixing curve, only rescaled in time. That is why diffusion experiments are honest comparisons: change one thing and the whole curve simply stretches or squeezes.
                  </p>
                )}
              </>
            )}
            <p className="observation-note">The mixing index wobbles by a few percent — it is a real count of a few hundred particles, and √N statistics are part of the measurement.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why the gases mix themselves</h3>
            <p>Each particle in the box obeys the simplest possible rules: move in a straight line, bounce off walls, and collide with other particles elastically — momentum and kinetic energy both conserved, no attraction anywhere (an ideal gas). Speeds start from a Maxwell–Boltzmann-style distribution: every velocity component is drawn independently, which is exactly how thermal motion arranges itself.</p>
            <div className="equation">⟨v⟩ ∝ √(T / m)</div>
            <p>At one temperature, a 4 u gas moves at half the speed of a 1 u gas — the 4 : 1 mass ratio in this lab is a 1 : 2 speed ratio, live in the sidebar&apos;s mean-speed readouts. Raise the temperature and every speed rescales with √T: the hot setting (600 K) moves √2 ≈ 1.41× faster than room (300 K).</p>
            <p>Nothing pulls either gas across the box. Yet each particle, bounced about by thousands of collisions, performs a random walk — and a cloud of random walkers spreads out, because there are far more ways to be spread out than bunched up. The orange front you watch creep across is not a force but statistics: that is diffusion. The mixing index rises quickly at first and then creeps toward 50% forever — uniformity is approached, never perfectly finished.</p>
            <h3 style={{ marginTop: 14 }}>The real bench, made safe</h3>
            <p>This is the much-loved bromine demonstration without the fume cupboard: a jar of orange-brown bromine vapour opened beneath a jar of air, the brown colour climbing upward even though bromine is several times denser than air — diffusion beating gravity. Here the heavy gas is a model 4 u gas and the &ldquo;bromine&rdquo; is a harmless orange dot. One honest subtlety the model keeps: the fast, light air keeps barging into the heavy gas and jostles it along, so heavy gases mix somewhat slower — but not four times slower — than light ones at the same temperature.</p>
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

// ---- multi-run overlay chart (sidebar live trace + observations tab) ---------------

function MixingChart(props: {
  runs: BankedRun[];
  getLive: () => SeriesPt[];
  version: number;
  liveOn: boolean;
  height?: number;
  xLabel: string;
}) {
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
      const h = props.height ?? 200;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { l: 40, r: 12, t: 12, b: 30 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const live = props.getLive();
      const allT = [...props.runs.flatMap((r) => r.pts.map((p) => p.t)), ...live.map((p) => p.t)];
      const tMax = Math.max(30, Math.ceil(Math.max(30, ...allT, 0) / 15) * 15);
      const sx = (t: number) => pad.l + (t / tMax) * iw;
      const sy = (m: number) => pad.t + ih - (clamp(m, 0, 52) / 52) * ih;

      // grid + ticks
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.fillStyle = '#9aa4b1';
      ctx.strokeStyle = '#e8edf2';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const x = pad.l + (iw * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ih);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round((tMax * i) / 4)}s`, x, h - pad.b + 13);
      }
      for (const m of [0, 25, 45, 50]) {
        const y = sy(m);
        ctx.setLineDash(m === 50 ? [2, 3] : m === 0 ? [] : [6, 5]);
        ctx.strokeStyle = m === 25 || m === 45 ? '#c9b28d' : '#e6ebf1';
        ctx.lineWidth = m === 25 || m === 45 ? 1.25 : 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + iw, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'right';
        ctx.fillStyle = m === 25 || m === 45 ? '#b3854a' : '#9aa4b1';
        ctx.fillText(`${m}`, pad.l - 5, y + 3);
        ctx.fillStyle = '#9aa4b1';
      }

      // axes
      ctx.strokeStyle = '#c5cdd6';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();

      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText(props.xLabel, pad.l + iw / 2, h - 3);
      ctx.save();
      ctx.translate(10, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('% orange in right half', 0, 0);
      ctx.restore();

      const drawSeries = (pts: SeriesPt[], color: string, width: number, alpha: number) => {
        if (pts.length === 0) return;
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(sx(pts[0].t), sy(pts[0].m));
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(sx(pts[i].t), sy(pts[i].m));
        ctx.stroke();
        ctx.globalAlpha = 1;
      };

      props.runs.forEach((r, i) => drawSeries(r.pts, CHART_COLORS[i % CHART_COLORS.length], 1.75, 0.85));
      drawSeries(live, '#e8632a', 2.5, 1);

      // live dot
      if (props.liveOn && live.length > 0) {
        const last = live[live.length - 1];
        ctx.fillStyle = '#e8632a';
        ctx.beginPath();
        ctx.arc(sx(last.t), sy(last.m), 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    renderRef.current = render;
    render();
  }, [props.runs, props.version, props.height, props.liveOn, props.xLabel, props.getLive]);

  return <canvas ref={canvasRef} className="lab-plot" style={{ width: '100%', height: props.height ?? 200 }} aria-label="Mixing index versus time chart" />;
}
