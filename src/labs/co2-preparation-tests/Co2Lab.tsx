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
import './co2-preparation-tests.css';

/**
 * Make & test CO₂ — preparation and testing bench for the Soren Lab Engine.
 *
 * The student drags the dilute hydrochloric acid bottle over the thistle
 * funnel of a conical flask of marble chips and HOLDS to pour. The reaction
 * CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑ fizzes, bubbles ride the delivery tube
 * over and down into an upright gas jar on its shelf (downward displacement
 * of air — CO₂ is denser than air, so it pools at the closed base of the
 * mouth-up jar while the leftover air drifts out of the open mouth) and a
 * whitish haze climbs from the base. Once full, the student proves the gas:
 * a burning candle lowered deep into the jar is snuffed with a wisp of
 * smoke, and gas bubbled through lime water turns it milky — then, overdone,
 * beautifully clear again.
 */

const ACID_MAX = 84; // acid units the flask takes on a full pour
const FIZZ_GATE = 24; // acid needed to drown the chips before the reaction runs
const ACID_PER_JAR = 22; // acid units consumed per full jar of CO₂
const MARBLE_PER_JAR = 0.02; // fraction of marble consumed per full jar
const K_RATE = 0.058; // jar-fraction per simulated second at 1.0 M and full acid
const POUR_RATE = 34; // acid units per simulated second of pouring
const LIME_DRAIN = 0.062; // jar fraction per second drawn through lime water
const ACID_OPTIONS = [0.5, 1, 1.5, 2];
const SNUFF_TIME = 0.5; // seconds of immersion before the flame dies

// ---------------------------------------------------------------- mentor ----

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'setup',
    title: 'Check the apparatus',
    detail: 'Marble chips sit in the flask, the thistle funnel dips low through the stopper, and the delivery tube rises over and dips right down to the base of the gas jar standing mouth-up on its shelf. Acknowledge it when it looks right.',
    hint: 'The tube ends at the bottom of the upright jar because CO₂ is denser than air — the gas pools at the base while the leftover air drifts out of the open mouth.',
  },
  {
    id: 'pour',
    title: 'Pour the dilute acid',
    detail: 'Drag the hydrochloric acid bottle over the thistle funnel and hold it there — the stream covers the chips and the reaction begins.',
    hint: 'The funnel’s tube must end below the acid, or gas would escape past it.',
  },
  {
    id: 'fill',
    title: 'Watch the jar fill',
    detail: 'Fizzing chips send CO₂ up and over the delivery tube. The dense haze climbs from the base of the jar toward the mouth — wait for the full jar.',
    hint: 'The stopwatch counts simulated seconds, so 2× / 4× playback never bends your data.',
  },
  {
    id: 'candle',
    title: 'Snuff the candle',
    detail: 'Drag the burning candle down deep into the jar and hold it in the gas. If this is carbon dioxide, the flame dies with a wisp of smoke.',
    hint: 'Lower it deep — the CO₂ layer hugs the bottom of the jar, underneath the leftover air.',
  },
  {
    id: 'lime',
    title: 'Turn the lime water milky',
    detail: 'Drag the lime water bottle to the jar and hold — gas bubbles through it and clouds it white with calcium carbonate.',
    hint: 'CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O — the classic positive test.',
  },
  {
    id: 'clear',
    title: 'Overdo it',
    detail: 'Keep bubbling past milky. Excess CO₂ dissolves the precipitate as soluble calcium hydrogencarbonate — the lime water clears again.',
    hint: 'That clear-again surprise is the signature of too much CO₂ — a lovely teaching moment.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'first-fizz', title: 'First fizz', icon: '✦', detail: 'Started the marble + acid reaction.' },
  { id: 'jar-filled', title: 'Jar of gas', icon: '⬒', detail: 'Filled the gas jar by downward displacement of air.' },
  { id: 'candle-snuffed', title: 'Candle snuffed', icon: '🕯', detail: 'Extinguished a flame in the collected gas.' },
  { id: 'milky', title: 'Milky lime water', icon: '🥛', detail: 'Turned lime water milky with carbon dioxide.' },
  { id: 'clear-again', title: 'Went clear again', icon: '💧', detail: 'Bubbled excess CO₂ until the milkiness dissolved away.' },
];

// ----------------------------------------------------------------- types ----

type LimeState = 'fresh' | 'milky' | 'clear';

interface Tool {
  x: number;
  y: number;
  held: boolean;
  grabDX: number;
  grabDY: number;
  auto: { phase: 0 | 1 | 2; t: number; fromX: number; fromY: number } | null;
}

interface Chip { dx: number; rise: number; size: number; rot: number; tone: number }
interface Dot { dx: number; dy: number; r: number }
interface AcidBubble { x: number; y: number; vy: number; wob: number; r: number }
interface TubeBubble { s: number; r: number }
interface JarBubble { x: number; y: number; vy: number; life: number; r: number }
interface Escape { x: number; y: number; vx: number; vy: number; r: number; a: number }
interface Smoke { x: number; y: number; vy: number; r: number; a: number; seed: number }
interface LimeTubeBubble { p: number }
interface LimeInBubble { y: number }

interface Layout {
  w: number; h: number; floorY: number;
  flaskX: number; flaskW: number; flaskH: number; flaskBaseY: number;
  neckW: number; neckTopY: number;
  cupX: number; cupY: number;
  standX: number; standW: number; standTopY: number;
  jarX: number; jarW: number; jarH: number; jarBaseY: number; mouthY: number;
  tubePts: { x: number; y: number }[];
  tubeCum: number[];
  tubeLen: number;
  limeAnchor: { x: number; y: number };
  bottleHome: { x: number; y: number };
  candleHome: { x: number; y: number };
  limeHome: { x: number; y: number };
}

interface Sim {
  L: Layout;
  layoutW: number; layoutH: number;
  time: number;
  uiAcc: number;
  acid: number;
  marble: number;
  jar: number;
  activeConc: number;
  fizzing: boolean;
  fizzEverStarted: boolean;
  fizzRate: number;
  pouring: boolean;
  spawnAcc: number;
  watch: number;
  liveOn: boolean;
  live: { t: number; v: number }[];
  lastSample: number;
  livePeakAcid: number;
  tFillCur: number | null;
  trial: number;
  runId: number;
  bottle: Tool;
  candle: Tool;
  lime: Tool;
  candleLit: boolean;
  candleSnuffed: boolean;
  snuffT: number;
  candleDip: number;
  limeState: LimeState;
  limePhase: 'clouding' | 'clearing';
  limeTurb: number;
  limeConnected: boolean;
  limeBubT: number;
  lastSloshAt: number;
  lastPingAt: number;
  slideAt: number;
  loopOn: boolean;
  mentorIdx: number;
  mentorAcked: boolean;
  chips: Chip[];
  limeDots: Dot[];
  acidBubbles: AcidBubble[];
  tubeBubbles: TubeBubble[];
  jarBubbles: JarBubble[];
  escapes: Escape[];
  smoke: Smoke[];
  limeTubeBubbles: LimeTubeBubble[];
  limeInBubbles: LimeInBubble[];
}

interface UiSnap {
  jar: number; watch: number; fizzing: boolean; rate: number;
  acid: number; marble: number; pouring: boolean; activeConc: number; trial: number;
  candleLit: boolean; candleSnuffed: boolean; candleDip: number;
  limeState: LimeState; limeTurb: number; limeConnected: boolean;
  liveOn: boolean; livePts: { t: number; v: number }[];
  held: null | 'bottle' | 'candle' | 'lime';
}

interface TableRow { id: number; trial: number; c: number; tFill: number | null; test: string; obs: string }
interface RunSeries { id: number; c: number; tFill: number | null; pts: { t: number; v: number }[]; fresh: boolean }

/** Referentially stable empty series — keeps the chart observer idle between runs. */
const NO_LIVE: { t: number; v: number }[] = [];

const meta = getLabBySlug('co2-preparation-tests')!;

// ---------------------------------------------------------------- layout ----

/** Catmull-Rom sampler so the delivery tube is one smooth bent glass line. */
function catmull(pts: { x: number; y: number }[], per: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < p.length - 2; i += 1) {
    const p0 = p[i - 1]; const p1 = p[i]; const p2 = p[i + 1]; const p3 = p[i + 2];
    for (let j = 0; j < per; j += 1) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function makeLayout(w: number, h: number): Layout {
  const floorY = h - 18;
  const flaskW = clamp(w * 0.135, 74, 118);
  const flaskH = clamp(h * 0.3, 96, 150);
  const flaskX = clamp(w * 0.235, flaskW / 2 + 24, w * 0.3);
  const flaskBaseY = floorY - 4;
  const neckW = Math.max(22, flaskW * 0.34);
  const neckTopY = flaskBaseY - flaskH;
  const cupX = flaskX - flaskW * 0.13;
  const cupY = neckTopY - 78;
  // the shelf: a small wooden stand carrying the upright gas jar
  const jarW = clamp(w * 0.15, 66, 104);
  const jarH = clamp(h * 0.34, 104, 168);
  const standW = Math.max(jarW + 34, clamp(w * 0.19, 100, 150));
  const standX = clamp(w * 0.78, flaskX + flaskW / 2 + standW / 2 + 74, w - standW / 2 - 8);
  const standTopY = floorY - 36;
  const jarX = standX;
  const jarBaseY = standTopY - 3;
  const mouthY = jarBaseY - jarH; // the jar stands mouth-up: open top, closed base
  // delivery tube: out of the stopper, up and over, then DOWN inside the
  // mouth-up jar to its base — downward delivery of a dense gas
  const sx = flaskX + neckW * 0.3;
  const apexY = Math.min(neckTopY - 30, mouthY - 26);
  const tipX = jarX - jarW * 0.24;
  const midX = (sx + tipX) / 2;
  const tubePts = catmull([
    { x: sx, y: neckTopY + 8 },
    { x: sx, y: apexY + 18 },
    { x: sx + 34, y: apexY },
    { x: midX, y: apexY - 5 },
    { x: tipX - 8, y: apexY + 2 },
    { x: tipX, y: mouthY - 16 },
    { x: tipX, y: mouthY + 10 },
    { x: tipX, y: jarBaseY - 15 },
  ], 12);
  const tubeCum: number[] = [0];
  for (let i = 1; i < tubePts.length; i += 1) {
    tubeCum.push(tubeCum[i - 1] + Math.hypot(tubePts[i].x - tubePts[i - 1].x, tubePts[i].y - tubePts[i - 1].y));
  }
  const flaskRight = flaskX + flaskW / 2;
  const jarLeft = jarX - jarW / 2;
  return {
    w, h, floorY, flaskX, flaskW, flaskH, flaskBaseY, neckW, neckTopY, cupX, cupY,
    standX, standW, standTopY, jarX, jarW, jarH, jarBaseY, mouthY,
    tubePts, tubeCum, tubeLen: tubeCum[tubeCum.length - 1],
    limeAnchor: { x: Math.min(jarX + jarW / 2 + 48, w - 26), y: mouthY + 4 },
    bottleHome: { x: clamp(flaskX - flaskW / 2 - 38, 26, flaskX - flaskW / 2 - 26), y: floorY - 30 },
    candleHome: { x: clamp(flaskRight + 58, 0, jarLeft - 44), y: floorY - 14 },
    limeHome: { x: clamp(flaskRight + 124, 0, jarLeft - 30), y: floorY - 22 },
  };
}

function pointOnTube(L: Layout, s: number): { x: number; y: number } {
  const d = clamp(s, 0, L.tubeLen);
  for (let i = 1; i < L.tubePts.length; i += 1) {
    if (L.tubeCum[i] >= d) {
      const a = L.tubePts[i - 1];
      const b = L.tubePts[i];
      const seg = L.tubeCum[i] - L.tubeCum[i - 1];
      const t = seg > 0.0001 ? (d - L.tubeCum[i - 1]) / seg : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return L.tubePts[L.tubePts.length - 1];
}

function relayout(s: Sim): void {
  s.L = makeLayout(s.layoutW, s.layoutH);
  if (!s.bottle.held && !s.bottle.auto) { s.bottle.x = s.L.bottleHome.x; s.bottle.y = s.L.bottleHome.y; }
  if (!s.candle.held && !s.candle.auto) { s.candle.x = s.L.candleHome.x; s.candle.y = s.L.candleHome.y; }
  if (!s.lime.held && !s.lime.auto) { s.lime.x = s.L.limeHome.x; s.lime.y = s.L.limeHome.y; }
}

function makeSim(): Sim {
  const chips: Chip[] = [];
  for (let i = 0; i < 9; i += 1) {
    chips.push({ dx: (Math.random() - 0.5) * 1.7, rise: Math.random(), size: 5.5 + Math.random() * 5, rot: Math.random() * Math.PI, tone: Math.random() });
  }
  const limeDots: Dot[] = [];
  for (let i = 0; i < 12; i += 1) {
    limeDots.push({ dx: (Math.random() - 0.5) * 22, dy: Math.random() * 26, r: 0.7 + Math.random() * 1.1 });
  }
  const L = makeLayout(800, 500);
  return {
    L, layoutW: 800, layoutH: 500,
    time: 0, uiAcc: 0,
    acid: 0, marble: 1, jar: 0, activeConc: 1,
    fizzing: false, fizzEverStarted: false, fizzRate: 0, pouring: false, spawnAcc: 0,
    watch: 0, liveOn: false, live: [], lastSample: 0, livePeakAcid: 0, tFillCur: null, trial: 0, runId: 1,
    bottle: { x: L.bottleHome.x, y: L.bottleHome.y, held: false, grabDX: 0, grabDY: 0, auto: null },
    candle: { x: L.candleHome.x, y: L.candleHome.y, held: false, grabDX: 0, grabDY: 0, auto: null },
    lime: { x: L.limeHome.x, y: L.limeHome.y, held: false, grabDX: 0, grabDY: 0, auto: null },
    candleLit: true, candleSnuffed: false, snuffT: 0, candleDip: 0,
    limeState: 'fresh', limePhase: 'clouding', limeTurb: 0, limeConnected: false, limeBubT: 0,
    lastSloshAt: 0, lastPingAt: 0, slideAt: 0, loopOn: false,
    mentorIdx: 0, mentorAcked: false,
    chips, limeDots,
    acidBubbles: [], tubeBubbles: [], jarBubbles: [], escapes: [], smoke: [],
    limeTubeBubbles: [], limeInBubbles: [],
  };
}

// ------------------------------------------------------------- component ----

export default function Co2Lab() {
  const simRef = useRef<Sim>(makeSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [conc, setConc] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [runs, setRuns] = useState<RunSeries[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    jar: 0, watch: 0, fizzing: false, rate: 0, acid: 0, marble: 1, pouring: false,
    activeConc: 1, trial: 0, candleLit: true, candleSnuffed: false, candleDip: 0,
    limeState: 'fresh', limeTurb: 0, limeConnected: false, liveOn: false, livePts: [], held: null,
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

  const addRow = useCallback((trial: number, c: number, tFill: number | null, test: string, obs: string) => {
    setRows((cur) => [...cur, { id: cur.length + 1, trial, c, tFill, test, obs }]);
    labSound.click();
  }, []);

  const syncUi = useCallback(() => {
    const s = simRef.current;
    setUi({
      jar: s.jar, watch: s.watch, fizzing: s.fizzing, rate: s.fizzRate,
      acid: s.acid, marble: s.marble, pouring: s.pouring, activeConc: s.activeConc, trial: s.trial,
      candleLit: s.candleLit, candleSnuffed: s.candleSnuffed, candleDip: s.candleDip,
      limeState: s.limeState, limeTurb: s.limeTurb, limeConnected: s.limeConnected,
      liveOn: s.liveOn, livePts: s.live.slice(), held: s.bottle.held ? 'bottle' : s.candle.held ? 'candle' : s.lime.held ? 'lime' : null,
    });
  }, []);

  useEffect(() => {
    simRef.current.mentorIdx = mentorIndex;
    simRef.current.mentorAcked = mentorAcked;
  }, [mentorIndex, mentorAcked]);

  // ---- mentor completion flags -------------------------------------------
  const hasFizzed = badges.includes('first-fizz');
  const hasFilled = badges.includes('jar-filled');
  const hasSnuffed = badges.includes('candle-snuffed');
  const hasMilky = badges.includes('milky');
  const hasClear = badges.includes('clear-again');
  const done = [mentorAcked, hasFizzed, hasFilled, hasSnuffed, hasMilky, hasClear];

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
    if (!mentorAcked || done[done.length - 1]) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'pour': return { target: 'scene', gesture: 'drag', title: 'Pour the acid', body: 'Drag the acid bottle over the thistle funnel above the flask and hold it there — the stream must drown the marble chips.' };
      case 'fill': return { target: 'scene', gesture: 'point', title: 'Watch the haze climb', body: 'Bubbles ride the delivery tube and the dense CO₂ haze climbs from the jar’s base. The stopwatch stops itself when the jar is full.' };
      case 'candle': return { target: 'scene', gesture: 'drag', title: 'Lower the candle', body: 'Drag the burning candle deep into the jar and hold — the flame should die in the CO₂ layer at the bottom.' };
      case 'lime': return { target: 'scene', gesture: 'drag', title: 'Bubble through lime water', body: 'Drag the lime water bottle to the jar and hold it there — gas streams through the liquid and clouds it.' };
      case 'clear': return { target: 'lime', gesture: 'press', title: 'Keep bubbling', body: 'Hold the lime water at the jar — or press the bubble button — until the milkiness dissolves back to clear.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex, hasFizzed, hasFilled, hasSnuffed, hasMilky, hasClear]); // eslint-disable-line react-hooks/exhaustive-deps

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- auto actions (keyboard alternatives) --------------------------------
  const startAutoBottle = useCallback(() => {
    const s = simRef.current;
    if (!s || s.bottle.held || s.bottle.auto || s.acid >= ACID_MAX - 0.5) return;
    s.bottle.auto = { phase: 0, t: 0, fromX: s.bottle.x, fromY: s.bottle.y };
    labSound.creak(0.4);
    notePointer(true);
  }, [notePointer]);

  const startAutoCandle = useCallback(() => {
    const s = simRef.current;
    if (!s || s.candle.held || s.candle.auto || !s.candleLit || s.jar < 0.85) return;
    s.candle.auto = { phase: 0, t: 0, fromX: s.candle.x, fromY: s.candle.y };
    labSound.creak(0.3);
    notePointer(true);
  }, [notePointer]);

  const toggleAutoLime = useCallback(() => {
    const s = simRef.current;
    if (!s || s.lime.held) return;
    if (s.lime.auto && s.lime.auto.phase < 2) {
      s.lime.auto.phase = 2;
      s.lime.auto.t = 0;
      s.lime.auto.fromX = s.lime.x;
      s.lime.auto.fromY = s.lime.y;
    } else if (!s.lime.auto) {
      s.lime.auto = { phase: 0, t: 0, fromX: s.lime.x, fromY: s.lime.y };
    }
    labSound.tick();
    notePointer(true);
  }, [notePointer]);

  const keyAction = useCallback(() => {
    const s = simRef.current;
    if (!s) return;
    if ((!s.fizzEverStarted || (!s.fizzing && s.acid < FIZZ_GATE)) && s.acid < ACID_MAX - 2) { startAutoBottle(); return; }
    if (s.jar >= 0.85 && s.candleLit && !s.candleSnuffed) { startAutoCandle(); return; }
    if (s.jar >= 0.12 && s.limeState !== 'clear') toggleAutoLime();
  }, [startAutoBottle, startAutoCandle, toggleAutoLime]);

  // ---- simulation step ------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = simRef.current;
    const cv = canvasRef.current;
    if (cv && (cv.clientWidth !== s.layoutW || cv.clientHeight !== s.layoutH)) {
      s.layoutW = cv.clientWidth;
      s.layoutH = cv.clientHeight;
      relayout(s);
    }
    const L = s.L;
    s.time += dt;
    const sdt = dt * speed;
    const now = performance.now();

    // ---- tool auto-flights + easing home ----
    const ba = s.bottle.auto;
    if (ba) {
      ba.t += dt;
      const target = { x: L.cupX + 46, y: L.cupY - 10 };
      if (ba.phase === 0) {
        const k = Math.min(1, ba.t / 0.55);
        const e = k * k * (3 - 2 * k);
        s.bottle.x = ba.fromX + (target.x - ba.fromX) * e;
        s.bottle.y = ba.fromY + (target.y - ba.fromY) * e;
        if (k >= 1) { ba.phase = 1; ba.t = 0; }
      } else if (ba.phase === 1) {
        s.bottle.x = target.x;
        s.bottle.y = target.y;
        if (s.acid >= ACID_MAX - 0.5) { ba.phase = 2; ba.t = 0; ba.fromX = s.bottle.x; ba.fromY = s.bottle.y; }
      } else {
        const k = Math.min(1, ba.t / 0.55);
        const e = k * k * (3 - 2 * k);
        s.bottle.x = ba.fromX + (L.bottleHome.x - ba.fromX) * e;
        s.bottle.y = ba.fromY + (L.bottleHome.y - ba.fromY) * e;
        if (k >= 1) s.bottle.auto = null;
      }
    } else if (!s.bottle.held) {
      const k = Math.min(1, dt * 9);
      s.bottle.x += (L.bottleHome.x - s.bottle.x) * k;
      s.bottle.y += (L.bottleHome.y - s.bottle.y) * k;
    }

    const ca = s.candle.auto;
    if (ca) {
      ca.t += dt;
      const stage = { x: Math.min(L.jarX + L.jarW / 2 + 44, L.w - 22), y: L.mouthY - 8 };
      const inside = { x: L.jarX, y: L.jarBaseY - L.jarH * 0.7 + 34 };
      if (ca.phase === 0) {
        const k = Math.min(1, ca.t / 0.55);
        const e = k * k * (3 - 2 * k);
        s.candle.x = ca.fromX + (stage.x - ca.fromX) * e;
        s.candle.y = ca.fromY + (stage.y - ca.fromY) * e;
        if (k >= 1) { ca.phase = 1; ca.t = 0; }
      } else if (ca.phase === 1) {
        const k = Math.min(1, ca.t / 0.8);
        const e = k * k * (3 - 2 * k);
        s.candle.x = stage.x + (inside.x - stage.x) * e;
        s.candle.y = stage.y + (inside.y - stage.y) * e;
        if (!s.candleLit) { ca.phase = 2; ca.t = 0; ca.fromX = s.candle.x; ca.fromY = s.candle.y; }
      } else {
        const k = Math.min(1, ca.t / 0.55);
        const e = k * k * (3 - 2 * k);
        s.candle.x = ca.fromX + (L.candleHome.x - ca.fromX) * e;
        s.candle.y = ca.fromY + (L.candleHome.y - ca.fromY) * e;
        if (k >= 1) s.candle.auto = null;
      }
    } else if (!s.candle.held) {
      const k = Math.min(1, dt * 9);
      s.candle.x += (L.candleHome.x - s.candle.x) * k;
      s.candle.y += (L.candleHome.y - s.candle.y) * k;
    }

    const la = s.lime.auto;
    if (la) {
      la.t += dt;
      if (la.phase === 0) {
        const k = Math.min(1, la.t / 0.55);
        const e = k * k * (3 - 2 * k);
        s.lime.x = la.fromX + (L.limeAnchor.x - la.fromX) * e;
        s.lime.y = la.fromY + (L.limeAnchor.y - la.fromY) * e;
        if (k >= 1) { la.phase = 1; la.t = 0; }
      } else if (la.phase === 1) {
        s.lime.x = L.limeAnchor.x;
        s.lime.y = L.limeAnchor.y;
        if (s.jar <= 0.02 && !s.fizzing) { la.phase = 2; la.t = 0; la.fromX = s.lime.x; la.fromY = s.lime.y; }
      } else {
        const k = Math.min(1, la.t / 0.55);
        const e = k * k * (3 - 2 * k);
        s.lime.x = la.fromX + (L.limeHome.x - la.fromX) * e;
        s.lime.y = la.fromY + (L.limeHome.y - la.fromY) * e;
        if (k >= 1) s.lime.auto = null;
      }
    } else if (!s.lime.held) {
      const k = Math.min(1, dt * 9);
      s.lime.x += (L.limeHome.x - s.lime.x) * k;
      s.lime.y += (L.limeHome.y - s.lime.y) * k;
    }

    // ---- pouring the acid ----
    const bottleNearCup = Math.hypot(s.bottle.x - L.cupX, s.bottle.y - L.cupY) < 58;
    const bottleActing = s.bottle.held || (s.bottle.auto !== null && s.bottle.auto.phase === 1);
    s.pouring = bottleActing && bottleNearCup && s.acid < ACID_MAX;
    if (s.pouring) {
      if (s.acid <= 0.01) {
        s.activeConc = conc; // a fresh fill takes the selected bottle's concentration
      } else if (conc !== s.activeConc) {
        // Topping up from a different bottle honestly blends the mixture by
        // volume — otherwise a topped-up flask would mislabel its rate runs.
        const added = Math.min(POUR_RATE * sdt, ACID_MAX - s.acid);
        if (added > 0) s.activeConc = (s.activeConc * s.acid + conc * added) / (s.acid + added);
      }
      s.acid = Math.min(ACID_MAX, s.acid + POUR_RATE * sdt);
    }

    // ---- reaction chemistry ----
    const acidFrac = s.acid / ACID_MAX;
    const marbleFactor = s.marble > 0.3 ? 1 : Math.max(0.12, s.marble / 0.3);
    const R = K_RATE * s.activeConc * acidFrac * marbleFactor;
    const wasFizzing = s.fizzing;
    s.fizzing = s.acid >= FIZZ_GATE && s.marble > 0.05 && R > 0.0005;

    if (s.fizzing) {
      if (!s.fizzEverStarted) {
        s.fizzEverStarted = true;
        earn('first-fizz');
        pushToast('good', '✦', 'Fizz! CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑');
      }
      // a fresh series begins when the reaction starts (or when a drained jar
      // refills after a test vented the gas) — never while the jar is still full
      if (!s.liveOn && s.jar < 0.55) {
        s.liveOn = true;
        s.watch = 0;
        s.lastSample = 0;
        s.live = [{ t: 0, v: s.jar }];
        s.livePeakAcid = s.acid;
        s.tFillCur = null;
      }
      if (s.liveOn) {
        s.watch += sdt;
        // a run only counts as "freshly poured" if the flask was filled to the
        // brim at some point while it ran — the pour is still running when the
        // fizz begins, so capture the peak, not the starting level
        s.livePeakAcid = Math.max(s.livePeakAcid, s.acid);
      }
      const prevJar = s.jar;
      s.jar = Math.min(1, s.jar + R * sdt);
      const made = s.jar - prevJar;
      s.acid = Math.max(0, s.acid - made * ACID_PER_JAR);
      s.marble = Math.max(0, s.marble - made * MARBLE_PER_JAR);
      s.fizzRate = 6 + R * 170;

      // spawn bubbles at the chips
      s.spawnAcc += s.fizzRate * sdt;
      while (s.spawnAcc >= 1) {
        s.spawnAcc -= 1;
        s.acidBubbles.push({
          x: L.flaskX + (Math.random() - 0.5) * L.flaskW * 0.44,
          y: L.flaskBaseY - 10 - Math.random() * 10,
          vy: 46 + Math.random() * 30,
          wob: Math.random() * 6.28,
          r: 1.6 + Math.random() * 1.6,
        });
      }

      // sample the live series
      if (s.watch - s.lastSample >= 0.25) {
        s.lastSample = s.watch;
        s.live.push({ t: Math.round(s.watch * 10) / 10, v: s.jar });
      }

      // jar just became full — bank the trial
      if (s.jar >= 0.999 && s.liveOn) {
        const tFill = Math.round(s.watch * 10) / 10;
        s.live.push({ t: tFill, v: 1 });
        s.trial += 1;
        const run: RunSeries = { id: s.runId++, c: s.activeConc, tFill, pts: s.live.slice(), fresh: s.livePeakAcid >= ACID_MAX * 0.85 };
        s.liveOn = false;
        s.live = [];
        s.tFillCur = tFill;
        setRuns((cur) => [...cur, run].slice(-8));
        addRow(s.trial, s.activeConc, tFill, 'Jar collection', 'Jar filled by downward displacement of air');
        earn('jar-filled');
        labSound.milestone();
        pushToast('good', '⬒', `Jar full in ${tFill.toFixed(1)} s — now prove it is CO₂.`);
        syncUi();
      }
    } else {
      s.fizzRate = 0;
      if (wasFizzing && s.liveOn) {
        // the acid ran down before the jar filled — keep the honest partial curve
        const run: RunSeries = { id: s.runId++, c: s.activeConc, tFill: null, pts: s.live.slice(), fresh: false };
        s.liveOn = false;
        s.live = [];
        setRuns((cur) => [...cur, run].slice(-8));
        pushToast('warn', 'ⱗ', 'The fizz has stopped — the acid is spent. Reset the bench for fresh chips.');
        syncUi();
      }
    }

    // ---- candle: does the flame sit inside the CO₂ layer? ----
    if (s.candleLit) {
      const fx = s.candle.x;
      const fy = s.candle.y - 34;
      // the CO₂ fills the mouth-up jar from the closed base up to the interface
      const intY = L.jarBaseY - s.jar * (L.jarBaseY - L.mouthY);
      const inX = Math.abs(fx - L.jarX) < L.jarW / 2 - 6;
      const inY = fy > L.mouthY + 2 && fy < L.jarBaseY - 8;
      const immersed = inX && inY && fy > intY + 6;
      if (immersed) {
        s.snuffT += dt;
        if (s.snuffT >= SNUFF_TIME) {
          s.candleLit = false;
          s.candleSnuffed = true;
          s.candleDip = 1;
          for (let i = 0; i < 9; i += 1) {
            s.smoke.push({ x: fx + (Math.random() - 0.5) * 6, y: fy - 2 - Math.random() * 8, vy: 20 + Math.random() * 14, r: 2 + Math.random() * 2.6, a: 0.5 + Math.random() * 0.25, seed: Math.random() * 6.28 });
          }
          labSound.slide(0.85); // the whoosh of the flame dying
          labSound.thunk(true);
          addRow(s.trial, s.activeConc, s.tFillCur, 'Burning candle', 'Flame extinguished — the gas will not support combustion');
          earn('candle-snuffed');
          labSound.milestone();
          pushToast('good', '🕯', 'Flame out — CO₂ is denser than air and will not burn.');
          syncUi();
        }
      } else {
        s.snuffT = Math.max(0, s.snuffT - dt * 2.5);
      }
      s.candleDip = Math.min(1, s.snuffT / SNUFF_TIME);
    }

    // ---- lime water: bubble gas through it ----
    const limeActing = s.lime.held || (s.lime.auto !== null && s.lime.auto.phase === 1);
    const limeNear = limeActing && Math.abs(s.lime.x - L.jarX) < L.jarW / 2 + 64 && s.lime.y > L.mouthY - 64 && s.lime.y < L.mouthY + 96;
    s.limeConnected = limeNear && s.jar > 0.02;
    if (s.limeConnected) {
      s.jar = Math.max(0, s.jar - LIME_DRAIN * sdt);
      // a steady stream of gas bubbles riding the delivery tube to the lime water
      s.limeBubT += sdt;
      if (s.limeBubT >= 0.055) {
        s.limeBubT = 0;
        s.limeTubeBubbles.push({ p: 0 });
        if (s.limeTubeBubbles.length > 11) s.limeTubeBubbles.shift();
      }
      if (now - s.lastSloshAt > 430) {
        s.lastSloshAt = now;
        labSound.slosh(0.28 + s.limeTurb * 0.2);
      }
      if (s.limeState !== 'clear') {
        if (s.limePhase === 'clouding') {
          s.limeTurb = Math.min(1, s.limeTurb + 0.16 * sdt);
          if (s.limeTurb >= 0.55 && s.limeState === 'fresh') {
            s.limeState = 'milky';
            addRow(s.trial, s.activeConc, s.tFillCur, 'Lime water', 'Turned milky — calcium carbonate precipitate formed');
            earn('milky');
            labSound.milestone();
            pushToast('good', '🥛', 'Lime water turned milky — that is the CO₂ fingerprint.');
            syncUi();
          }
          if (s.limeTurb >= 0.98) s.limePhase = 'clearing';
        } else {
          s.limeTurb = Math.max(0.12, s.limeTurb - 0.185 * sdt);
          if (s.limeState === 'milky' && s.limeTurb <= 0.3) {
            s.limeState = 'clear';
            addRow(s.trial, s.activeConc, null, 'Lime water (excess)', 'Cleared again — excess CO₂ dissolved it as soluble hydrogencarbonate');
            earn('clear-again');
            pushToast('good', '💧', 'Overdone beautifully — the milkiness dissolved away.');
            syncUi();
          }
        }
      }
    }

    // ---- bubbles: acid → tube → jar ----
    const acidTop = L.flaskBaseY - (s.acid / ACID_MAX) * L.flaskH * 0.52;
    for (let i = s.acidBubbles.length - 1; i >= 0; i -= 1) {
      const b = s.acidBubbles[i];
      b.y -= b.vy * sdt;
      b.x += Math.sin(b.wob + b.y * 0.05) * 14 * sdt;
      if (b.y < L.flaskBaseY - L.flaskH * 0.5) b.x += (L.flaskX - b.x) * Math.min(1, dt * 4);
      if (b.y <= acidTop + 3) {
        s.acidBubbles.splice(i, 1);
        if (s.acid >= FIZZ_GATE) s.tubeBubbles.push({ s: 0, r: 2 + Math.random() * 1.4 });
      }
    }
    const tubeEnd = L.tubePts[L.tubePts.length - 1];
    for (let i = s.tubeBubbles.length - 1; i >= 0; i -= 1) {
      const b = s.tubeBubbles[i];
      b.s += (L.tubeLen / 0.8) * sdt;
      if (b.s >= L.tubeLen) {
        s.tubeBubbles.splice(i, 1);
        if (s.jar >= 0.995) {
          // jar full: excess CO₂ spills over the open mouth and sinks — it is denser than air
          s.escapes.push({ x: L.jarX + L.jarW * 0.3, y: L.mouthY - 4, vx: 20 + Math.random() * 22, vy: 10 + Math.random() * 14, r: 2.6 + Math.random() * 2, a: 0.7 });
        } else {
          s.jarBubbles.push({ x: tubeEnd.x, y: tubeEnd.y, vy: 20 + Math.random() * 16, life: 0.5, r: 2 + Math.random() * 1.6 });
        }
      }
    }
    for (let i = s.jarBubbles.length - 1; i >= 0; i -= 1) {
      const b = s.jarBubbles[i];
      b.y -= b.vy * sdt;
      b.life -= sdt;
      if (b.life <= 0) {
        s.jarBubbles.splice(i, 1);
        if (now - s.lastPingAt > 140) {
          s.lastPingAt = now;
          labSound.ping(860 + Math.random() * 520, 0.045);
        }
      }
    }
    for (let i = s.escapes.length - 1; i >= 0; i -= 1) {
      const e = s.escapes[i];
      e.x += e.vx * sdt;
      e.y += e.vy * sdt;
      e.r += 2.6 * sdt;
      e.a -= 0.9 * sdt;
      if (e.a <= 0) s.escapes.splice(i, 1);
    }
    for (let i = s.smoke.length - 1; i >= 0; i -= 1) {
      const m = s.smoke[i];
      m.y -= m.vy * dt;
      m.x += Math.sin(s.time * 2.2 + m.seed) * 12 * dt;
      m.r += 3.4 * dt;
      m.a -= 0.4 * dt;
      if (m.a <= 0) s.smoke.splice(i, 1);
    }
    for (let i = s.limeTubeBubbles.length - 1; i >= 0; i -= 1) {
      const lb = s.limeTubeBubbles[i];
      lb.p += sdt / 0.45;
      if (lb.p >= 1) {
        s.limeTubeBubbles.splice(i, 1);
        s.limeInBubbles.push({ y: 0 });
        if (s.limeInBubbles.length > 12) s.limeInBubbles.shift();
      }
    }
    for (let i = s.limeInBubbles.length - 1; i >= 0; i -= 1) {
      const ib = s.limeInBubbles[i];
      ib.y += 1.6 * sdt;
      if (ib.y > 1) s.limeInBubbles.splice(i, 1);
    }

    // ---- fizz ambience loop (pour stream and bubbling share one voice) ----
    const wantLoop = s.pouring || s.fizzing || s.limeConnected;
    if (wantLoop && !s.loopOn) {
      s.loopOn = true;
      labSound.startLoop('pour');
    } else if (!wantLoop && s.loopOn) {
      s.loopOn = false;
      labSound.stopLoop();
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, conc, earn, pushToast, addRow, syncUi]);

  // ---- drawing ----------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = simRef.current;
    const L = s.L;
    const t = s.time;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // floor
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, L.floorY);
    ctx.lineTo(w, L.floorY);
    ctx.stroke();
    ctx.strokeStyle = '#dde4ea';
    ctx.lineWidth = 1;
    for (let x = 8; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, L.floorY);
      ctx.lineTo(x - 10, L.floorY + 10);
      ctx.stroke();
    }

    // soft shadows on the bench
    const shadow = (x: number, y: number, rx: number) => {
      ctx.fillStyle = 'rgba(23,35,52,0.08)';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    shadow(L.flaskX, L.flaskBaseY + 5, L.flaskW * 0.6);
    shadow(s.bottle.x, L.floorY + 2, 24);
    shadow(s.candle.x, L.floorY + 2, 15);
    shadow(s.lime.x, L.floorY + 2, 20);
    shadow(L.standX, L.floorY + 2, L.standW * 0.5);
    shadow(L.jarX, L.standTopY + 3, L.jarW * 0.6);

    // ---- the wooden stand carrying the upright gas jar ----
    ctx.fillStyle = '#d8cfc0';
    roundRect(ctx, L.standX - L.standW / 2, L.standTopY, L.standW, 11, 4);
    ctx.fill();
    ctx.strokeStyle = '#b3a893';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#c4b9a6';
    for (const lx of [L.standX - L.standW / 2 + 12, L.standX + L.standW / 2 - 14]) {
      roundRect(ctx, lx - 4, L.standTopY + 10, 8, L.floorY - L.standTopY - 10, 3);
      ctx.fill();
    }

    // ---- conical flask with acid, chips, stopper, thistle funnel, tube ----
    drawFlaskAssembly(ctx, L, s);

    // ---- the upright gas jar (mouth-up, dense CO₂ pools at its base) ----
    drawJar(ctx, L, s, t);

    // jar bubbles + escaping waste gas
    for (const b of s.jarBubbles) {
      ctx.fillStyle = `rgba(244,249,252,${Math.max(0, Math.min(1, b.life * 2)) * 0.85})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(141,168,185,0.5)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    for (const e of s.escapes) {
      ctx.fillStyle = `rgba(158,178,196,${Math.max(0, e.a) * 0.55})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- candle smoke wisps ----
    for (const m of s.smoke) {
      ctx.fillStyle = `rgba(116,126,138,${Math.max(0, m.a) * 0.5})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- pouring stream ----
    if (s.pouring) {
      const sx = s.bottle.x - 32;
      const sy = s.bottle.y - 30;
      const ex = L.cupX;
      const ey = L.cupY - 10;
      const mx = (sx + ex) / 2;
      const my = Math.min(sy, ey) + 24;
      ctx.strokeStyle = 'rgba(178,214,190,0.85)';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      for (let i = 0; i < 4; i += 1) {
        const k = (t * 2.2 + i / 4) % 1;
        const qy = (1 - k) * (1 - k) * sy + 2 * (1 - k) * k * my + k * k * ey;
        const qx = (1 - k) * (1 - k) * sx + 2 * (1 - k) * k * mx + k * k * ex;
        ctx.fillStyle = 'rgba(196,226,206,0.9)';
        ctx.beginPath();
        ctx.arc(qx, qy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // splash rings in the cup
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i += 1) {
        const rr = 4 + ((t * 3 + i * 0.5) % 1) * 9;
        ctx.globalAlpha = 1 - rr / 13;
        ctx.beginPath();
        ctx.ellipse(L.cupX, L.cupY - 4, rr, rr * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---- lime water connection ----
    if (s.limeConnected) {
      const ax = L.jarX + L.jarW * 0.2;
      const ay = L.mouthY + 10;
      const bx = s.lime.x - 12;
      const by = s.lime.y - 22;
      const cx = (ax + bx) / 2;
      const cy = Math.min(ay, by) - 20;
      ctx.strokeStyle = '#c2d3de';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cx, cy, bx, by);
      ctx.stroke();
      ctx.strokeStyle = '#f2f7fa';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      for (const lb of s.limeTubeBubbles) {
        const k = clamp(lb.p, 0, 1);
        const px = (1 - k) * (1 - k) * ax + 2 * (1 - k) * k * cx + k * k * bx;
        const py = (1 - k) * (1 - k) * ay + 2 * (1 - k) * k * cy + k * k * by;
        ctx.fillStyle = 'rgba(250,253,255,0.95)';
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- tools ----
    drawAcidBottle(ctx, s.bottle.x, s.bottle.y, s.pouring);
    drawCandle(ctx, s, t);
    drawLimeBottle(ctx, s, t);

    // when the candle pokes into the jar, re-glaze the glass over it
    const fx = s.candle.x;
    const fy = s.candle.y - 20;
    if (fx > L.jarX - L.jarW / 2 && fx < L.jarX + L.jarW / 2 && fy > L.mouthY && fy < L.jarBaseY) {
      ctx.fillStyle = 'rgba(226,238,244,0.3)';
      roundRect(ctx, L.jarX - L.jarW / 2 + 3, L.mouthY + 3, L.jarW - 6, L.jarBaseY - L.mouthY - 7, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(141,168,185,0.8)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // ---- guidance pulses (never any text) ----
    const pulse = () => 0.42 + 0.38 * Math.sin(t * 4);
    const wantCupPulse = s.mentorIdx === 1 && !s.fizzEverStarted;
    if (wantCupPulse || s.bottle.held) {
      const hot = s.bottle.held && Math.hypot(s.bottle.x - L.cupX, s.bottle.y - L.cupY) < 90;
      ctx.strokeStyle = `rgba(249,115,22,${hot ? 0.9 : pulse()})`;
      ctx.lineWidth = hot ? 2.6 : 2;
      ctx.beginPath();
      ctx.ellipse(L.cupX, L.cupY, 27, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const jarStepActive =
      (s.mentorIdx === 2 && s.jar < 0.995) ||
      (s.mentorIdx === 3 && s.candleLit && !s.candleSnuffed) ||
      (s.mentorIdx === 4 && s.limeState === 'fresh') ||
      (s.mentorIdx === 5 && s.limeState === 'milky');
    const toolNearJar = (s.candle.held || s.lime.held) && Math.abs((s.candle.held ? s.candle.x : s.lime.x) - L.jarX) < L.jarW / 2 + 80;
    if (jarStepActive || toolNearJar) {
      ctx.strokeStyle = `rgba(249,115,22,${toolNearJar ? 0.9 : pulse()})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      roundRect(ctx, L.jarX - L.jarW / 2 - 9, L.mouthY - 9, L.jarW + 18, L.jarH + 18, 12);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, []);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ------------------------------------------------------
  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = simRef.current;
    if (!s.bottle.held && !s.bottle.auto && Math.abs(p.x - s.bottle.x) < 28 && Math.abs(p.y - s.bottle.y) < 42) {
      s.bottle.held = true;
      s.bottle.grabDX = p.x - s.bottle.x;
      s.bottle.grabDY = p.y - s.bottle.y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.35);
      notePointer(true);
      return;
    }
    if (!s.candle.held && !s.candle.auto && Math.abs(p.x - s.candle.x) < 24 && Math.abs(p.y - (s.candle.y - 14)) < 38) {
      s.candle.held = true;
      s.candle.grabDX = p.x - s.candle.x;
      s.candle.grabDY = p.y - s.candle.y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.3);
      notePointer(true);
      return;
    }
    if (!s.lime.held && !s.lime.auto && Math.abs(p.x - s.lime.x) < 26 && Math.abs(p.y - s.lime.y) < 32) {
      s.lime.held = true;
      s.lime.grabDX = p.x - s.lime.x;
      s.lime.grabDY = p.y - s.lime.y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.glassClink(false);
      notePointer(true);
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = simRef.current;
    const L = s.L;
    const now = performance.now();
    if (s.bottle.held) {
      s.bottle.x = clamp(p.x - s.bottle.grabDX, 22, L.w - 22);
      s.bottle.y = clamp(p.y - s.bottle.grabDY, 30, L.h - 44);
    } else if (s.candle.held) {
      s.candle.x = clamp(p.x - s.candle.grabDX, 18, L.w - 18);
      s.candle.y = clamp(p.y - s.candle.grabDY, 26, L.h - 30);
    } else if (s.lime.held) {
      s.lime.x = clamp(p.x - s.lime.grabDX, 20, L.w - 20);
      s.lime.y = clamp(p.y - s.lime.grabDY, 26, L.h - 34);
    }
    const busy = s.bottle.held || s.candle.held || s.lime.held;
    if (busy && now - s.slideAt > 160) {
      s.slideAt = now;
      labSound.slide(0.22);
    }
    const canvas = canvasRef.current;
    if (canvas) {
      let cursor = 'default';
      if (busy) cursor = 'grabbing';
      else if (
        (Math.abs(p.x - s.bottle.x) < 28 && Math.abs(p.y - s.bottle.y) < 42) ||
        (Math.abs(p.x - s.candle.x) < 24 && Math.abs(p.y - (s.candle.y - 14)) < 38) ||
        (Math.abs(p.x - s.lime.x) < 26 && Math.abs(p.y - s.lime.y) < 32)
      ) cursor = 'grab';
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = simRef.current;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    s.bottle.held = false;
    s.candle.held = false;
    s.lime.held = false;
  };

  // ---- controls --------------------------------------------------------------
  const changeConc = (v: number) => {
    setConc(v);
    labSound.tick();
  };

  const resetAll = () => {
    const s = simRef.current;
    if (s.liveOn) {
      const run: RunSeries = { id: s.runId++, c: s.activeConc, tFill: null, pts: s.live.slice(), fresh: false };
      s.liveOn = false;
      s.live = [];
      setRuns((cur) => [...cur, run].slice(-8));
    }
    s.acid = 0;
    s.marble = 1;
    s.jar = 0;
    s.fizzing = false;
    s.fizzRate = 0;
    s.watch = 0;
    s.tFillCur = null;
    s.pouring = false;
    s.spawnAcc = 0;
    s.candleLit = true;
    s.candleSnuffed = false;
    s.snuffT = 0;
    s.candleDip = 0;
    s.candle.auto = null;
    if (!s.candle.held) { s.candle.x = s.L.candleHome.x; s.candle.y = s.L.candleHome.y; }
    s.limeState = 'fresh';
    s.limePhase = 'clouding';
    s.limeTurb = 0;
    s.limeConnected = false;
    s.limeBubT = 0;
    s.lime.auto = null;
    if (!s.lime.held) { s.lime.x = s.L.limeHome.x; s.lime.y = s.L.limeHome.y; }
    s.bottle.auto = null;
    if (!s.bottle.held) { s.bottle.x = s.L.bottleHome.x; s.bottle.y = s.L.bottleHome.y; }
    s.acidBubbles = [];
    s.tubeBubbles = [];
    s.jarBubbles = [];
    s.escapes = [];
    s.smoke = [];
    s.limeTubeBubbles = [];
    s.limeInBubbles = [];
    if (s.loopOn) {
      s.loopOn = false;
      labSound.stopLoop();
    }
    syncUi();
  };

  // ---- analysis -----------------------------------------------------------------
  const fills = useMemo(
    () => runs.flatMap((r) => (r.tFill != null && r.fresh ? [{ c: r.c, t: r.tFill }] : [])),
    [runs],
  );
  // a rate line needs two fills at two DIFFERENT concentrations to mean anything
  const canFit = fills.length >= 2 && new Set(fills.map((f) => f.c)).size >= 2;
  const rateFit = useMemo(
    () => (canFit ? linearFit(fills.map((f) => ({ x: f.c, y: 100 / f.t }))) : null),
    [canFit, fills],
  );

  // ---- coach --------------------------------------------------------------------
  const acidSpent = hasFizzed && !ui.fizzing && ui.acid < FIZZ_GATE && ui.marble > 0.05;
  const complete = done[done.length - 1];
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (!mentorAcked) return { tone: 'info', line: 'Check the apparatus: marble chips in the flask, thistle funnel dipping low, delivery tube dipping to the base of the mouth-up gas jar on its shelf.' };
    if (ui.pouring) return { tone: 'info', line: 'Acid streaming in — it must cover the chips and the funnel’s tip before the marble can react.' };
    if (ui.acid > 2 && ui.acid < FIZZ_GATE && !hasFizzed) return { tone: 'info', line: 'Keep pouring — the acid needs to drown the chips before the fizz begins.' };
    if (!hasFizzed) return { tone: 'info', line: 'Drag the acid bottle over the thistle funnel and hold it there — the reaction starts once the chips are covered.' };
    if (acidSpent) return { tone: 'warn', line: 'The acid is spent and the fizz has stopped. Reset for fresh chips — and try a different concentration while you are at it.' };
    if (ui.fizzing && ui.jar < 0.55 && ui.acid < ACID_MAX * 0.8) return { tone: 'info', line: 'Fizzing — but the flask is only partly charged. Hold the pour a little longer: a full flask of acid fizzs fastest, and only full flasks join the rate graph.' };
    if (ui.fizzing && ui.jar < 0.99) return { tone: 'info', line: `CaCO₃ + 2HCl → CO₂↑ — jar ${Math.round(ui.jar * 100)}% full, ≈${ui.rate.toFixed(0)} bubbles/s. The dense haze climbs from the base.` };
    if (!hasFilled && ui.jar >= 0.99) return { tone: 'good', line: 'The jar is full of dense gas — time to prove it is CO₂ with the candle and the lime water.' };
    if (!hasSnuffed && hasFilled) return { tone: 'info', line: 'Drag the burning candle deep into the jar — hold it in the haze and watch the flame die.' };
    if (!hasMilky && hasSnuffed) return { tone: 'info', line: 'Flame out — lovely. Now drag the lime water bottle to the jar and hold it to bubble gas through.' };
    if (!hasClear && hasMilky) return { tone: 'info', line: 'Milky! Keep bubbling past it — excess CO₂ will dissolve the precipitate and clear the lime water again.' };
    if (!complete) return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
    if (rateFit) return { tone: 'good', line: `All tests done. Rate ≈ ${rateFit.m.toFixed(1)} %/s per M of acid — reset, change the concentration, and race another fill.` };
    return { tone: 'good', line: 'All tests done — reset for fresh chips, change the acid concentration and compare the fill times in Observations.' };
  }, [mentorAcked, ui, hasFizzed, hasFilled, hasSnuffed, hasMilky, hasClear, acidSpent, complete, rateFit]);

  // ---- status --------------------------------------------------------------------
  const statusText = complete
    ? 'Experiment complete'
    : ui.pouring
      ? 'Pouring acid'
      : ui.limeConnected
        ? 'Bubbling through lime water'
        : ui.fizzing
          ? `Fizzing — jar ${Math.round(ui.jar * 100)}%`
          : acidSpent
            ? 'Acid used up — reset'
            : 'Fresh marble chips ready';
  const statusTone: 'ready' | 'active' | 'complete' | 'warn' = complete
    ? 'complete'
    : (ui.pouring || ui.fizzing || ui.limeConnected) ? 'active' : acidSpent ? 'warn' : 'ready';

  const liveOn = ui.liveOn;
  const limeWord = ui.limeState === 'fresh' ? '— fresh' : ui.limeState === 'milky' ? '— milky' : '— clear again';
  const sNow = simRef.current;

  // ---- render ---------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Downward delivery of a dense gas"
      legend={[
        { color: '#b9c2cb', label: 'Marble chips' },
        { color: '#bcd9c2', label: 'Dilute HCl' },
        { color: '#a9bfcd', label: 'CO₂ haze' },
        { color: '#eef4f6', label: 'Lime water' },
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
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Carbon dioxide bench — drag the acid bottle to the thistle funnel and hold to pour; drag the candle and the lime water to the gas jar"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); keyAction(); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="co2-layout">
            <div className="co2-actions">
              <button
                className="action-button"
                type="button"
                data-nudge="bottle"
                onClick={() => { startAutoBottle(); }}
                disabled={ui.acid >= ACID_MAX - 2 || sNow.bottle.auto !== null || sNow.bottle.held}
              >
                <span className="dispense-icon" aria-hidden="true">⌁</span>
                <span>{ui.acid > 2 ? 'Top up the acid' : 'Pour the acid for me'}</span>
                <small>or drag the bottle onto the funnel</small>
              </button>
              <button
                className="action-button"
                type="button"
                data-nudge="candle"
                onClick={() => { startAutoCandle(); }}
                disabled={!(sNow.jar >= 0.85 && sNow.candleLit) || sNow.candle.auto !== null || sNow.candle.held}
              >
                <span className="dispense-icon" aria-hidden="true">🕯</span>
                <span>Lower the candle</span>
                <small>{sNow.jar < 0.85 ? 'needs a fuller jar' : 'or drag it into the jar yourself'}</small>
              </button>
              <button
                className="action-button"
                type="button"
                data-nudge="lime"
                onClick={() => { toggleAutoLime(); }}
                disabled={(sNow.jar < 0.12 && !(sNow.lime.auto && sNow.lime.auto.phase < 2)) || sNow.lime.held || sNow.limeState === 'clear'}
              >
                <span className="dispense-icon" aria-hidden="true">🥛</span>
                <span>{sNow.lime.auto && sNow.lime.auto.phase < 2 ? 'Stop bubbling' : 'Bubble gas through lime water'}</span>
                <small>{sNow.limeState === 'clear' ? 'already cleared again' : 'hold it at the jar to keep bubbling'}</small>
              </button>
            </div>
            <div className="co2-meters">
              <div className="co2-acid-label"><span>Acid concentration</span><strong>{conc.toFixed(1)} M</strong></div>
              <div className="co2-acid-row" role="group" aria-label="Acid concentration in moles per litre">
                {ACID_OPTIONS.map((o) => (
                  <button
                    key={o}
                    className={`co2-acid-btn${conc === o ? ' active' : ''}`}
                    type="button"
                    aria-pressed={conc === o}
                    onClick={() => changeConc(o)}
                  >
                    {o.toFixed(1)} M
                  </button>
                ))}
              </div>
              <div className="co2-meter">
                <label><span>Jar CO₂</span><strong>{Math.round(ui.jar * 100)}%</strong></label>
                <div className="co2-bar"><span style={{ width: `${ui.jar * 100}%` }} /></div>
              </div>
              <div className="co2-meter">
                <label><span>Acid in flask</span><strong>{Math.round((ui.acid / ACID_MAX) * 100)}%</strong></label>
                <div className="co2-bar acid"><span style={{ width: `${(ui.acid / ACID_MAX) * 100}%` }} /></div>
              </div>
              <div className="co2-watch">
                <span>FILL CLOCK · SIMULATED TIME</span>
                <strong className={ui.fizzing ? 'running' : ''}>{fmtClock(ui.watch)}</strong>
                <div className="co2-tests">
                  <span className={ui.candleSnuffed ? 'done' : ''}>Candle {ui.candleSnuffed ? '✓ snuffed' : '— pending'}</span>
                  <span className={ui.limeState !== 'fresh' ? 'done' : ''}>Lime water {limeWord}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Hold the acid bottle over the thistle funnel to pour; hold the lime water at the jar to keep bubbling; lower the candle deep. The stopwatch counts simulated seconds, so faster playback never bends your data.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Jar CO₂ level (live)</span>
            <strong>{Math.round(ui.jar * 100)} <small>%</small></strong>
            <div className="reading-track"><span style={{ width: `${ui.jar * 100}%` }} /></div>
            <div className="reading-scale"><span>empty jar</span><span>full jar</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Fill stopwatch</span><strong>{fmtClock(ui.watch)}</strong></div>
            <div><span>Fizz rate</span><strong>{ui.fizzing ? `≈${ui.rate.toFixed(0)} /s` : '—'}</strong></div>
            <div><span>Acid in flask</span><strong>{ui.acid > 0.5 ? `${ui.activeConc.toFixed(1)} M` : '—'}</strong></div>
            <div><span>Acid remaining</span><strong>{Math.round((ui.acid / ACID_MAX) * 100)} <small>%</small></strong></div>
            <div><span>Marble chips</span><strong>{Math.round(ui.marble * 100)} <small>%</small></strong></div>
            <div><span>Candle</span><strong>{ui.candleLit ? 'burning' : 'snuffed out'}</strong></div>
            <div><span>Lime water</span><strong>{ui.limeState === 'fresh' ? 'fresh & clear' : ui.limeState === 'milky' ? 'milky white' : 'clear again'}</strong></div>
            <div><span>Trial</span><strong>{ui.trial > 0 ? `#${ui.trial}` : '—'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Acknowledge the apparatus: chips in the flask, thistle funnel dipping low, gas jar standing mouth-up on its shelf with the delivery tube reaching its base.</li>
              <li>Drag the dilute hydrochloric acid bottle over the thistle funnel and hold to pour until the chips drown.</li>
              <li>Watch the bubbles ride the delivery tube and the dense haze climb from the base of the jar; the clock stops when it is full.</li>
              <li>Drag the burning candle deep into the jar and hold — the flame should die with a wisp of smoke.</li>
              <li>Drag the lime water bottle to the jar and hold to bubble gas through it — it turns milky.</li>
              <li>Keep bubbling to overdo it: the milkiness dissolves and the lime water clears again.</li>
              <li>Reset for fresh chips, choose a new acid concentration, and compare the fill times in Observations.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>The jar stands mouth-up with the delivery tube dipping right down to its base — CO₂ is about one and a half times denser than air, so it pools at the bottom and the level climbs while the leftover air drifts out of the mouth. That is downward displacement of air. Lower the candle deep: the CO₂ layer hugs the bottom of the jar.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your observation table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Fill the jar and run the tests — every fill and every test result banks a row here automatically.</p>
            ) : (
              <table className="trial-table co2-obs-table">
                <thead><tr><th>#</th><th>Trial</th><th>Acid (M)</th><th>t fill (s)</th><th>Test performed</th><th>Observation</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.trial > 0 ? r.trial : '—'}</td>
                      <td>{r.c.toFixed(1)}</td>
                      <td>{r.tFill != null ? r.tFill.toFixed(1) : '—'}</td>
                      <td>{r.test}</td>
                      <td>{r.obs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(runs.length > 0 || liveOn) && (
              <>
                <h3 style={{ marginTop: 16 }}>Jar CO₂ level vs time</h3>
                <Co2Chart runs={runs} live={liveOn ? ui.livePts : NO_LIVE} liveOn={liveOn} />
                <p className="observation-note">The live run is orange; earlier runs fade to blue-grey. Compare slopes at different acid concentrations — steeper means faster collection.</p>
              </>
            )}
            {canFit ? (
              <>
                <h3 style={{ marginTop: 16 }}>Collection rate vs acid concentration</h3>
                <Plot
                  points={fills.map((f) => ({ x: f.c, y: 100 / f.t }))}
                  xLabel="acid concentration (M)"
                  yLabel="fill rate (%/s)"
                  fitLine
                  height={200}
                />
                {rateFit && (
                  <p className="observation-note">
                    Best straight line: rate ≈ {rateFit.m.toFixed(1)} %/s per mole per litre (R² = {rateFit.r2.toFixed(3)}).
                    Doubling the acid concentration roughly doubles the fizz — rate is proportional to concentration.
                  </p>
                )}
              </>
            ) : fills.length >= 2 ? (
              <p className="observation-note">Two fresh fills at the same concentration agree with each other — now change the concentration and race another fill to unlock the rate line.</p>
            ) : null}
            <p className="observation-note">Only fills from a freshly filled flask join the rate graph — a partly charged flask honestly takes longer, and the table keeps those runs visible.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Marble is calcium carbonate. Hydrochloric acid attacks the carbonate, releasing carbon dioxide gas in a lively fizz that streams off the chips:</p>
            <div className="equation">CaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂↑</div>
            <p>The gas is about one and a half times denser than air, so an upside-down jar would simply let it pour back out of the open mouth. Instead the jar stands mouth-up and the delivery tube bends down inside it: incoming CO₂ sinks to the closed base, the level of dense gas climbs, and the lighter air floats out of the mouth at the top. That is collection by downward displacement of air, and the whitish haze rising inside the jar lets you watch it happen. Lighter-than-air gases such as hydrogen need the opposite arrangement — an inverted jar fed from below.</p>
            <p>Two tests prove the gas. A burning flame needs oxygen; CO₂ neither burns nor supports combustion, so the candle dies with a wisp of smoke. And lime water is a saturated solution of calcium hydroxide, which reacts with CO₂ to make an insoluble white solid:</p>
            <div className="equation">CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O</div>
            <p>Push more CO₂ through and the white precipitate dissolves again as soluble calcium hydrogencarbonate — the milkiness clearing is the classic “too much” signal:</p>
            <div className="equation">CaCO₃ + CO₂ + H₂O → Ca(HCO₃)₂ (soluble)</div>
            <p>The rate of collection is proportional to the acid concentration: double the moles per litre and you double the fizz. Plot fill rate against concentration and the points sit on a straight line through the origin — your own evidence for concentration affecting rate.</p>
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

// ------------------------------------------------------------- drawing ----

function drawFlaskAssembly(ctx: CanvasRenderingContext2D, L: Layout, s: Sim) {
  const fx = L.flaskX;
  const fw = L.flaskW;
  const fby = L.flaskBaseY;
  const nty = L.neckTopY;
  const nw = L.neckW;
  const shoulderY = fby - L.flaskH * 0.7;

  // glass body
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(fx - nw / 2, nty);
    ctx.lineTo(fx - nw / 2, shoulderY);
    ctx.lineTo(fx - fw / 2, fby - 6);
    ctx.quadraticCurveTo(fx - fw / 2, fby, fx - fw / 2 + 6, fby);
    ctx.lineTo(fx + fw / 2 - 6, fby);
    ctx.quadraticCurveTo(fx + fw / 2, fby, fx + fw / 2, fby - 6);
    ctx.lineTo(fx + nw / 2, shoulderY);
    ctx.lineTo(fx + nw / 2, nty);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = 'rgba(228,240,246,0.4)';
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // acid
  const acidH = (s.acid / ACID_MAX) * L.flaskH * 0.52;
  if (acidH > 1) {
    ctx.save();
    body();
    ctx.clip();
    const acidTop = fby - acidH;
    const grad = ctx.createLinearGradient(0, acidTop, 0, fby);
    grad.addColorStop(0, 'rgba(196,226,205,0.85)');
    grad.addColorStop(1, 'rgba(168,206,178,0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(fx - fw / 2, acidTop, fw, acidH);
    ctx.fillStyle = 'rgba(240,249,242,0.8)';
    ctx.beginPath();
    ctx.ellipse(fx, acidTop, fw * 0.3, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // rising bubbles in the acid
    for (const b of s.acidBubbles) {
      ctx.fillStyle = 'rgba(252,255,254,0.85)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // marble chips
  ctx.save();
  body();
  ctx.clip();
  const chipScale = 0.45 + 0.55 * s.marble;
  for (const c of s.chips) {
    const size = c.size * chipScale;
    const cx = fx + c.dx * fw * 0.3;
    const cy = fby - 9 - c.rise * 7;
    ctx.beginPath();
    for (let k = 0; k < 6; k += 1) {
      const a = c.rot + (k / 6) * Math.PI * 2;
      const rr = size * (0.8 + 0.25 * Math.sin(c.tone * 9 + k * 2.1));
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.72;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const cg = ctx.createLinearGradient(cx, cy - size, cx, cy + size);
    cg.addColorStop(0, '#e8ebee');
    cg.addColorStop(1, '#b3bcc5');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = '#98a2ac';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // stopper
  ctx.fillStyle = '#c98a4b';
  roundRect(ctx, fx - nw / 2 - 3, nty - 15, nw + 6, 15, 3);
  ctx.fill();
  ctx.strokeStyle = '#8f5a2b';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // thistle funnel (dips to the chips)
  ctx.strokeStyle = '#c2d3de';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L.cupX, L.cupY + 16);
  ctx.lineTo(L.cupX, fby - 24);
  ctx.stroke();
  ctx.strokeStyle = '#f2f7fa';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(L.cupX, L.cupY + 16);
  ctx.lineTo(L.cupX, fby - 24);
  ctx.stroke();
  // funnel cup
  ctx.beginPath();
  ctx.moveTo(L.cupX - 17, L.cupY - 11);
  ctx.lineTo(L.cupX - 5, L.cupY + 14);
  ctx.lineTo(L.cupX + 5, L.cupY + 14);
  ctx.lineTo(L.cupX + 17, L.cupY - 11);
  ctx.closePath();
  ctx.fillStyle = 'rgba(228,240,246,0.55)';
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(L.cupX, L.cupY - 11, 17, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(240,247,251,0.75)';
  ctx.fill();
  ctx.stroke();
  if (s.pouring) {
    ctx.fillStyle = 'rgba(196,226,205,0.9)';
    ctx.beginPath();
    ctx.ellipse(L.cupX, L.cupY - 10, 12, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // delivery tube (bent glass, tip inside the jar)
  ctx.strokeStyle = '#c2d3de';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L.tubePts[0].x, L.tubePts[0].y);
  for (let i = 1; i < L.tubePts.length; i += 1) ctx.lineTo(L.tubePts[i].x, L.tubePts[i].y);
  ctx.stroke();
  ctx.strokeStyle = '#f2f7fa';
  ctx.lineWidth = 5;
  ctx.stroke();
  // bubbles riding the tube
  for (const b of s.tubeBubbles) {
    const p = pointOnTube(L, b.s);
    ctx.fillStyle = 'rgba(250,253,255,0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(141,168,185,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  const tip = L.tubePts[L.tubePts.length - 1];
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(tip.x, tip.y, 4.4, 3, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawJar(ctx: CanvasRenderingContext2D, L: Layout, s: Sim, t: number) {
  const jx = L.jarX;
  const jw = L.jarW;
  const jb = L.jarBaseY;
  const jm = L.mouthY;
  const intH = jb - jm;

  // interior (open mouth at the top, closed rounded base at the bottom)
  ctx.beginPath();
  ctx.moveTo(jx - jw / 2 + 3, jm + 6);
  ctx.lineTo(jx - jw / 2 + 3, jb - 12);
  ctx.quadraticCurveTo(jx - jw / 2 + 3, jb - 2, jx - jw / 2 + 13, jb - 2);
  ctx.lineTo(jx + jw / 2 - 13, jb - 2);
  ctx.quadraticCurveTo(jx + jw / 2 - 3, jb - 2, jx + jw / 2 - 3, jb - 12);
  ctx.lineTo(jx + jw / 2 - 3, jm + 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(230,239,244,0.22)';
  ctx.fill();

  // CO₂ haze pools at the closed base and climbs toward the open mouth
  if (s.jar > 0.004) {
    const interfaceY = jb - s.jar * intH;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(jx - jw / 2 + 3, jb - 3);
    ctx.lineTo(jx - jw / 2 + 3, interfaceY);
    for (let x = 0; x <= jw - 6; x += 6) {
      const wx = jx - jw / 2 + 3 + x;
      const wy = interfaceY + Math.sin(wx * 0.11 + t * 1.6) * 2.2;
      ctx.lineTo(wx, wy);
    }
    ctx.lineTo(jx + jw / 2 - 3, jb - 3);
    ctx.closePath();
    const hz = ctx.createLinearGradient(0, interfaceY, 0, jb);
    hz.addColorStop(0, 'rgba(196,210,221,0.5)');
    hz.addColorStop(1, 'rgba(150,170,188,0.8)');
    ctx.fillStyle = hz;
    ctx.fill();
    ctx.strokeStyle = 'rgba(238,246,250,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(jx - jw / 2 + 3, interfaceY);
    for (let x = 0; x <= jw - 6; x += 6) {
      const wx = jx - jw / 2 + 3 + x;
      const wy = interfaceY + Math.sin(wx * 0.11 + t * 1.6) * 2.2;
      ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // glass walls, flared lip at the open mouth
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(jx - jw / 2 - 5, jm - 2);
  ctx.lineTo(jx - jw / 2 + 3, jm + 6);
  ctx.lineTo(jx - jw / 2 + 3, jb - 12);
  ctx.quadraticCurveTo(jx - jw / 2 + 3, jb - 2, jx - jw / 2 + 13, jb - 2);
  ctx.lineTo(jx + jw / 2 - 13, jb - 2);
  ctx.quadraticCurveTo(jx + jw / 2 - 3, jb - 2, jx + jw / 2 - 3, jb - 12);
  ctx.lineTo(jx + jw / 2 - 3, jm + 6);
  ctx.lineTo(jx + jw / 2 + 5, jm - 2);
  ctx.stroke();
  // the open mouth
  ctx.beginPath();
  ctx.ellipse(jx, jm + 2, jw / 2 - 1, 4.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // glass streaks
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(jx - jw / 2 + 7, jm + 18);
  ctx.lineTo(jx - jw / 2 + 7, jb - 16);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(jx + jw / 2 - 10, jm + 26);
  ctx.lineTo(jx + jw / 2 - 10, jb - 22);
  ctx.stroke();
}

function drawAcidBottle(ctx: CanvasRenderingContext2D, x: number, y: number, pouring: boolean) {
  ctx.save();
  ctx.translate(x, y + 24);
  if (pouring) ctx.rotate(-0.62);
  ctx.translate(0, -24);
  // body
  const grad = ctx.createLinearGradient(-17, 0, 17, 0);
  grad.addColorStop(0, '#b9cfb4');
  grad.addColorStop(0.5, '#d3e3cb');
  grad.addColorStop(1, '#a8c2a4');
  ctx.fillStyle = grad;
  roundRect(ctx, -17, -26, 34, 50, 7);
  ctx.fill();
  ctx.strokeStyle = '#7e9a7c';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // shoulder + cap
  ctx.fillStyle = '#c4d6bd';
  ctx.beginPath();
  ctx.moveTo(-10, -26);
  ctx.lineTo(-7, -34);
  ctx.lineTo(7, -34);
  ctx.lineTo(10, -26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5d6a79';
  roundRect(ctx, -9, -42, 18, 9, 2);
  ctx.fill();
  // label (colour only — no text on the canvas)
  ctx.fillStyle = '#f6f8f4';
  roundRect(ctx, -12, -10, 24, 17, 2);
  ctx.fill();
  ctx.strokeStyle = '#d5ddd2';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#9dc9a0';
  ctx.fillRect(-12, 1, 24, 5);
  ctx.fillStyle = '#e9c832';
  ctx.fillRect(-12, -6, 24, 3);
  ctx.restore();
}

function drawCandle(ctx: CanvasRenderingContext2D, s: Sim, t: number) {
  const c = s.candle;
  // brass holder + wire handle
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 12, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6420';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = '#b08a35';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(c.x + 10, c.y - 1);
  ctx.quadraticCurveTo(c.x + 22, c.y - 6, c.x + 26, c.y - 14);
  ctx.stroke();
  // wax body
  const wg = ctx.createLinearGradient(c.x - 5, 0, c.x + 5, 0);
  wg.addColorStop(0, '#fdf6e8');
  wg.addColorStop(1, '#ecdfc2');
  ctx.fillStyle = wg;
  roundRect(ctx, c.x - 5, c.y - 24, 10, 22, 2.5);
  ctx.fill();
  ctx.strokeStyle = '#d8c9a4';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fdf6e8';
  ctx.beginPath();
  ctx.arc(c.x - 3.4, c.y - 16, 1.6, 0, Math.PI * 2);
  ctx.arc(c.x + 3.2, c.y - 11, 1.3, 0, Math.PI * 2);
  ctx.fill();
  // wick
  ctx.strokeStyle = '#4a3f33';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 24);
  ctx.lineTo(c.x, c.y - 29);
  ctx.stroke();
  if (s.candleLit) {
    drawFlame(ctx, c.x, c.y - 35, t, s.candleDip);
  } else if (s.smoke.length > 0) {
    ctx.fillStyle = 'rgba(200,90,40,0.5)';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 30, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, dip: number) {
  const k = 1 - 0.85 * dip;
  if (k <= 0.05) return;
  const sway = Math.sin(t * 9 + 1.7) * 1.8 * (1 + dip * 2.6);
  const h = 17 * k * (1 + Math.sin(t * 13) * 0.05);
  const w = 7 * k;
  const gl = ctx.createRadialGradient(x, y, 1, x, y, 26 * k);
  gl.addColorStop(0, 'rgba(249,115,22,0.22)');
  gl.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(x, y, 26 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + sway, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.45, x, y + h * 0.28);
  ctx.quadraticCurveTo(x - w, y - h * 0.45, x + sway, y - h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(249,115,22,0.92)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + sway * 0.4, y - h * 0.55);
  ctx.quadraticCurveTo(x + w * 0.45, y - h * 0.22, x, y + h * 0.18);
  ctx.quadraticCurveTo(x - w * 0.45, y - h * 0.22, x + sway * 0.4, y - h * 0.55);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,210,87,0.95)';
  ctx.fill();
  ctx.fillStyle = 'rgba(122,179,224,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.2, w * 0.28, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLimeBottle(ctx: CanvasRenderingContext2D, s: Sim, t: number) {
  const b = s.lime;
  ctx.save();
  ctx.translate(b.x, b.y);
  // glass body
  ctx.fillStyle = 'rgba(232,240,244,0.55)';
  roundRect(ctx, -15, -18, 30, 38, 6);
  ctx.fill();
  // liquid: clear pale, clouding with turbidity
  const lg = ctx.createLinearGradient(0, -12, 0, 18);
  lg.addColorStop(0, 'rgba(234,243,245,0.85)');
  lg.addColorStop(1, 'rgba(214,230,235,0.9)');
  ctx.fillStyle = lg;
  roundRect(ctx, -13, -12, 26, 29, 4);
  ctx.fill();
  const turb = s.limeTurb;
  if (turb > 0.02) {
    ctx.fillStyle = `rgba(240,244,246,${turb * 0.8})`;
    roundRect(ctx, -13, -12, 26, 29, 4);
    ctx.fill();
    for (const d of s.limeDots) {
      const drift = s.limeConnected ? Math.sin(t * 2 + d.dx) * 1.5 : 0;
      ctx.fillStyle = `rgba(250,252,253,${turb * 0.85})`;
      ctx.beginPath();
      ctx.arc(d.dx + drift, 4 + d.dy, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // rising bubbles inside the lime water
  if (s.limeConnected) {
    for (const ib of s.limeInBubbles) {
      ctx.fillStyle = 'rgba(252,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(Math.sin(ib.y * 9) * 6, 15 - ib.y * 27, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -15, -18, 30, 38, 6);
  ctx.stroke();
  // cap + tube stub
  ctx.fillStyle = '#5d6a79';
  roundRect(ctx, -9, -25, 18, 8, 2);
  ctx.fill();
  ctx.strokeStyle = '#c2d3de';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-12, -21);
  ctx.lineTo(-17, -21);
  ctx.stroke();
  ctx.restore();
}

// ---- multi-run analysis chart (observations tab; text is allowed here) -------

function Co2Chart(props: { runs: RunSeries[]; live: { t: number; v: number }[]; liveOn: boolean }) {
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
      const h = 210;
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
      const sx = (t: number) => pad.l + (t / tMax) * iw;
      const sy = (v: number) => pad.t + ih - v * ih;

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
        ctx.fillText(`${i * 25}`, pad.l - 6, y + 3);
      }

      ctx.strokeStyle = '#c5cdd6';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('time since fizz began (s)', pad.l + iw / 2, h - 4);
      ctx.save();
      ctx.translate(11, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('jar CO₂ level (%)', 0, 0);
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

      props.runs.forEach((r, i) => {
        const last = i === props.runs.length - 1 && !props.liveOn;
        drawSeries(r.pts, last ? '#3b6fd4' : 'rgba(125,148,171,0.55)', last ? 2 : 1.5, last);
      });
      if (props.liveOn && props.live.length > 0) {
        drawSeries(props.live, '#e8632a', 2, true);
      }
    };

    renderRef.current = render;
    render();
  }, [props.runs, props.live, props.liveOn]);

  return (
    <canvas
      ref={canvasRef}
      className="lab-plot"
      style={{ width: '100%', height: 210 }}
      aria-label="Jar carbon dioxide level versus time for every run"
    />
  );
}

// ---------------------------------------------------------------- helpers ----

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
