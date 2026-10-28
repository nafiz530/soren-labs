import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp, lerp, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './osmosis-potato.css';

/**
 * Osmosis in potato — Experiment 033 (Biology, Builder).
 *
 * The student bores six cylinders out of a potato with a cork borer, weighs
 * each one on a digital balance, baths one cylinder per salt concentration
 * (0.0 → 1.0 mol/dm³), runs a compressed soak clock, then reweighs everything.
 * Percentage mass changes are plotted against concentration; the fitted line's
 * x-intercept is the isotonic point. A lens view shows the potato cells going
 * turgid or flaccid while water particles cross their membranes.
 *
 * Honesty model:
 *   %mass(c) = 34 × (0.33 − c)   → distilled ≈ +11%, 1.0 M ≈ −23%
 *   %len(c)  = %mass(c) / 3.2    (cell walls resist stretch)
 *   masses carry ±0.1 g jitter, lengths ±0.5 mm — like the real bench.
 *   Soak: 600 simulated seconds to equilibrium (≈ 12 real s at 1×, τ = 120 s).
 */

const CONCS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
const BEAKER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const CYL_TARGET = 6;
const ISO_TRUE = 0.33;      // true isotonic concentration (mol/dm³)
const SLOPE_PCT = 34;       // % mass change per mol/dm³ of salt
const LEN_FACTOR = 1 / 3.2;// length change relative to mass change
const SOAK_SIM_S = 600;     // simulated seconds to full equilibrium (10 sim-min)
const SIM_RATE = 50;        // simulated soak seconds per real second at 1×
const TAU = 120;            // osmotic approach time constant (sim s)

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'bore', title: 'Bore six cylinders', detail: 'Drag the cork borer onto the potato and hold it there — a cylinder extrudes as you press. Six cylinders collect in the tray at the top.', hint: 'On touch screens, drag with a finger and hold — or press “Bore next cylinder”.' },
  { id: 'weigh', title: 'Weigh them all', detail: 'Drag each cylinder onto the digital balance and let the digits settle — its starting mass and length are banked in your table.', hint: 'About 5.0 g each. The ±0.1 g wobble is honest; real balances do it too.' },
  { id: 'bathe', title: 'One cylinder per beaker', detail: 'Drag a weighed cylinder into each of the six solutions — distilled water on the left, 1.0 mol/dm³ on the right.', hint: 'The coach will not let you double up a beaker — full coverage or no soak.' },
  { id: 'soak', title: 'Run the soak', detail: 'Start the clock and let osmosis work. Watch the distilled-water cylinder plump up while the 1.0 M one shrivels.', hint: 'Ten sim-minutes — about twelve real seconds at 1×, three at 4×.' },
  { id: 'reweigh', title: 'Reweigh and compute', detail: 'Drag each soaked cylinder back onto the balance. Final mass, final length and both percentage changes are computed for you.', hint: 'Appearance follows the sign: turgid above +3%, flaccid below −3%.' },
  { id: 'plot', title: 'Find the isotonic point', detail: 'Open Observations: your six points and the fitted line cross 0% somewhere — that concentration is the isotonic point. Answer the conclusion card.', hint: 'Pick the chip that matches your own x-intercept.' },
];

const BADGES: BadgeDef[] = [
  { id: 'clean-bore', title: 'Clean bore', icon: '🥔', detail: 'Cut all six cylinders with the cork borer.' },
  { id: 'full-set', title: 'Full set weighed', icon: '⚖', detail: 'Banked initial and final masses for all six cylinders.' },
  { id: 'straight-story', title: 'Straight story', icon: '📈', detail: 'Plotted five or more points and read the fitted line’s intercept.' },
  { id: 'isotonic-found', title: 'Isotonic found', icon: '◎', detail: 'Picked the correct isotonic concentration from your own data.' },
  { id: 'cell-watcher', title: 'Cell-level watcher', icon: '🔬', detail: 'Opened the lens on both a turgid and a flaccid cylinder.' },
];

const CONC_CHIPS = [
  { id: 'low', label: '≈ 0.0–0.1 M' },
  { id: 'mid', label: '≈ 0.2 M' },
  { id: 'iso', label: '≈ 0.3–0.4 M' },
  { id: 'high', label: '≈ 0.6 M' },
  { id: 'top', label: '≈ 0.9 M' },
];

const WATER_CHIPS = [
  { id: 'in', label: 'Into the potato cells' },
  { id: 'out', label: 'Out of the potato cells' },
  { id: 'none', label: 'No net movement' },
];

interface Row {
  cyl: number;
  conc: number | null;
  initMass: number | null;
  initLen: number | null;
  finalMass: number | null;
  finalLen: number | null;
  pctMass: number | null;
  pctLen: number | null;
  appearance: string | null;
}

type CylPhase = 'tray' | 'hand' | 'beaker' | 'balance';

interface CylSim {
  id: number;
  x: number;
  y: number;
  homeSlot: number;
  lenMM: number;
  initLenMM: number;
  mass: number;
  initMass: number;
  initDone: boolean;
  finalDone: boolean;
  conc: number | null;
  phase: CylPhase;
  wob: number;
}

interface SimState {
  cyls: CylSim[];
  nextId: number;
  bore: { x: number; y: number; dragging: boolean; prog: number; auto: boolean; inPotato: boolean; creakAt: number; grabDx?: number; grabDy?: number };
  drag: { id: number | null; offX: number; offY: number; sx: number; sy: number; fromX: number; fromY: number; fromPhase: CylPhase; moved: boolean; slideAt: number; px?: number; py?: number };
  anim: null | { id: number; sx: number; sy: number; tx: number; ty: number; t: number; dur: number; kind: 'balance' | 'beaker' | 'tray'; slot: number | null };
  clock: number;
  soaking: boolean;
  soakDone: boolean;
  dripAcc: number;
  balance: { id: number | null; settle: number; locked: boolean };
  mag: { open: boolean; id: number | null };
  seen: { turgid: boolean; flaccid: boolean };
  badgedCells: boolean;
  time: number;
  uiAcc: number;
  flickAcc: number;
  flickT: number;
  flickVal: number;
  dust: { x: number; y: number; r: number; s: number }[];
  motes: { cell: number; ang: number; dist: number; spd: number }[];
}

interface UiSnap {
  clock: number;
  soaking: boolean;
  soakDone: boolean;
  balMass: string;
  balLen: string;
  balState: 'idle' | 'settling' | 'locked';
  boreBusy: boolean;
  dragId: number | null;
  magOpen: boolean;
}

interface Geom {
  cw: number;
  ch: number;
  slotW: number;
  trayY: number;
  trayH: number;
  labelH: number;
  beakTop: number;
  beakBot: number;
  board: { x: number; y: number; w: number; h: number };
  bal: { x: number; y: number; w: number; h: number };
  pot: { cx: number; cy: number; rx: number; ry: number };
  boreHome: { x: number; y: number };
  pan: { cx: number; cy: number };
  mag: { cx: number; cy: number; r: number };
  pxMM: number;
}

const meta = getLabBySlug('osmosis-potato')!;

const jitter = (m: number) => (Math.random() - 0.5) * 2 * m;
const pctMassTruth = (c: number) => SLOPE_PCT * (ISO_TRUE - c);
const pctLenTruth = (c: number) => pctMassTruth(c) * LEN_FACTOR;
const round2 = (v: number) => Math.round(v * 100) / 100;
const roundHalf = (v: number) => Math.round(v * 2) / 2;

function fmtSimClock(simSeconds: number): string {
  const s = Math.max(0, Math.floor(simSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function beakerLetterOf(conc: number): string {
  const i = CONCS.indexOf(conc);
  return BEAKER_LETTERS[i >= 0 ? i : 5];
}

function appearanceOf(pctMass: number): string {
  if (pctMass > 3) return 'Turgid';
  if (pctMass < -3) return 'Flaccid';
  return 'Firm';
}

export default function OsmosisLab() {
  // ---- simulation state (refs — the canvas loop owns the motion) ----------
  const sim = useRef<SimState>({
    cyls: [],
    nextId: 1,
    bore: { x: 0, y: 0, dragging: false, prog: 0, auto: false, inPotato: false, creakAt: 0 },
    drag: { id: null, offX: 0, offY: 0, sx: 0, sy: 0, fromX: 0, fromY: 0, fromPhase: 'tray', moved: false, slideAt: 0 },
    anim: null,
    clock: 0,
    soaking: false,
    soakDone: false,
    dripAcc: 0,
    balance: { id: null, settle: 0, locked: false },
    mag: { open: false, id: null },
    seen: { turgid: false, flaccid: false },
    badgedCells: false,
    time: 0,
    uiAcc: 0,
    flickAcc: 0,
    flickT: 0,
    flickVal: 0,
    dust: Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), r: 0.8 + Math.random() * 1.6, s: 0.4 + Math.random() * 1.2 })),
    motes: Array.from({ length: 18 }, () => ({ cell: Math.floor(Math.random() * 6), ang: Math.random() * Math.PI * 2, dist: 0.15 + Math.random() * 1.1, spd: 0.5 + Math.random() * 0.8 })),
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student-facing state -------------------------------------------------
  const [rows, setRows] = useState<Row[]>([]);
  const [speed, setSpeed] = useState(1);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [warnNote, setWarnNote] = useState<string | null>(null);
  const [concAnswer, setConcAnswer] = useState<string | null>(null);
  const [concWrong, setConcWrong] = useState<string | null>(null);
  const [waterAnswer, setWaterAnswer] = useState<string | null>(null);
  const [waterWrong, setWaterWrong] = useState<string | null>(null);
  const [ui, setUi] = useState<UiSnap>({ clock: 0, soaking: false, soakDone: false, balMass: '0.00', balLen: '—', balState: 'idle', boreBusy: false, dragId: null, magOpen: false });

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

  useEffect(() => {
    if (!warnNote) return;
    const t = window.setTimeout(() => setWarnNote(null), 5200);
    return () => window.clearTimeout(t);
  }, [warnNote]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    let balMass = '0.00';
    let balLen = '—';
    let balState: UiSnap['balState'] = 'idle';
    const b = s.balance;
    if (b.id != null) {
      const c = s.cyls.find((x) => x.id === b.id);
      if (c && c.phase === 'balance') {
        if (b.locked) {
          balState = 'locked';
          balMass = c.mass.toFixed(2);
          balLen = c.lenMM.toFixed(1);
        } else {
          balState = 'settling';
          balMass = (c.mass * (0.25 + Math.random() * 0.75)).toFixed(2);
          balLen = (c.lenMM * (0.9 + Math.random() * 0.2)).toFixed(1);
        }
      }
    } else if (s.flickT > 0) {
      balMass = Math.abs(s.flickVal).toFixed(2);
    }
    setUi({
      clock: s.clock,
      soaking: s.soaking,
      soakDone: s.soakDone,
      balMass,
      balLen,
      balState,
      boreBusy: s.bore.auto,
      dragId: s.drag.id,
      magOpen: s.mag.open,
    });
  }, []);

  // ---- derived progress ------------------------------------------------------
  const cutCount = rows.length;
  const initCount = rows.filter((r) => r.initMass != null).length;
  const bathedCount = rows.filter((r) => r.conc != null).length;
  const finalCount = rows.filter((r) => r.finalMass != null).length;
  const completeRows = useMemo(() => rows.filter((r) => r.finalMass != null && r.conc != null), [rows]);
  const filledSlots = useMemo(() => CONCS.map((c) => rows.some((r) => r.conc === c)), [rows]);

  const done = [
    cutCount >= CYL_TARGET,
    cutCount >= CYL_TARGET && initCount >= CYL_TARGET,
    cutCount >= CYL_TARGET && bathedCount >= CYL_TARGET,
    cutCount >= CYL_TARGET && bathedCount >= CYL_TARGET && ui.soakDone,
    cutCount >= CYL_TARGET && finalCount >= CYL_TARGET,
    sawGraph && completeRows.length >= 5,
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

  // ---- nudge ---------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'bore': return { target: 'scene', gesture: 'drag', title: 'Bore a cylinder', body: 'Drag the cork borer onto the potato and hold — a cylinder extrudes, then pops into the tray. Repeat until you have six.' };
      case 'weigh': return { target: 'scene', gesture: 'drag', title: 'Weigh a cylinder', body: 'Drag a cylinder from the tray onto the balance at the right. Wait for the digits to settle — that banks its row.' };
      case 'bathe': return { target: 'scene', gesture: 'drag', title: 'Fill the beakers', body: 'One weighed cylinder per beaker: drag each into a different concentration, distilled water up to 1.0 mol/dm³.' };
      case 'soak': return { target: 'soak', gesture: 'press', title: 'Start the soak', body: 'All six beakers are loaded — press “Start the soak” and watch turgid meet flaccid.' };
      case 'reweigh': return { target: 'scene', gesture: 'drag', title: 'Reweigh a cylinder', body: 'Drag a soaked cylinder out of its beaker onto the balance to bank its final mass and length.' };
      case 'plot': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your plot, the fitted line and the conclusion card live in the Observations tab.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ------------------------------------------------------------
  const geom = useCallback((): Geom => {
    const cw = canvasRef.current?.clientWidth ?? 800;
    const ch = canvasRef.current?.clientHeight ?? 480;
    const slotW = cw / 6;
    const trayY = 10;
    const trayH = 46;
    const labelH = 26;
    const beakTop = Math.round(ch * 0.56);
    const beakBot = ch - labelH - 6;
    const board = { x: 12, y: trayY + trayH + 12, w: Math.max(120, cw * 0.44 - 12), h: Math.max(70, beakTop - (trayY + trayH) - 22) };
    const bal = { x: cw * 0.56, y: board.y, w: Math.max(120, cw - 12 - cw * 0.56), h: board.h };
    const pot = {
      cx: board.x + board.w * 0.4,
      cy: board.y + board.h * 0.56,
      rx: Math.max(36, board.w * 0.3),
      ry: Math.max(24, board.h * 0.34),
    };
    const boreHome = { x: board.x + board.w * 0.84, y: board.y + board.h * 0.3 };
    const pan = { cx: bal.x + bal.w / 2, cy: bal.y + bal.h * 0.34 };
    const mag = { cx: cw * 0.505, cy: board.y + board.h * 0.52, r: clamp(Math.min(cw * 0.17, board.h * 0.46), 46, 92) };
    const pxMM = clamp(cw / 620, 0.6, 1.1);
    return { cw, ch, slotW, trayY, trayH, labelH, beakTop, beakBot, board, bal, pot, boreHome, pan, mag, pxMM };
  }, []);

  // park the cork borer at its home spot once the canvas has a size
  useEffect(() => {
    const g = geom();
    sim.current.bore.x = g.boreHome.x;
    sim.current.bore.y = g.boreHome.y;
  }, [geom]);

  const traySlotPos = useCallback((slot: number) => {
    const g = geom();
    return { x: g.slotW * (slot + 0.5), y: g.trayY + g.trayH / 2 + 2 };
  }, [geom]);

  const beakerSlotPos = useCallback((slot: number) => {
    const g = geom();
    return { x: g.slotW * (slot + 0.5), y: g.beakTop + (g.beakBot - g.beakTop) * 0.56 };
  }, [geom]);

  const cylById = useCallback((id: number) => sim.current.cyls.find((c) => c.id === id) ?? null, []);

  /** Live turgor signal in [-1, 1] for the lens view (sign = water direction). */
  const turgorOf = useCallback((c: CylSim | null): number => {
    if (!c) return 0;
    if (c.conc == null) return 0.35; // fresh-cut potato cells are mildly turgid
    const s = sim.current;
    const p = s.soakDone ? 1 : s.soaking ? 1 - Math.exp(-s.clock / TAU) : 0;
    return clamp((pctMassTruth(c.conc) * p) / 12, -1, 1);
  }, []);

  // ---- discrete events ------------------------------------------------------
  const completeBore = useCallback(() => {
    const s = sim.current;
    if (s.cyls.length >= CYL_TARGET) return;
    const id = s.nextId;
    s.nextId += 1;
    const initLen = 50 + jitter(1);
    const initMass = round2(5 + jitter(0.1));
    const g = geom();
    const home = traySlotPos(s.cyls.length);
    const cyl: CylSim = {
      id,
      x: g.pot.cx + g.pot.rx * 0.5,
      y: g.pot.cy,
      homeSlot: s.cyls.length,
      lenMM: initLen,
      initLenMM: initLen,
      mass: initMass,
      initMass,
      initDone: false,
      finalDone: false,
      conc: null,
      phase: 'tray',
      wob: Math.random() * Math.PI * 2,
    };
    s.cyls.push(cyl);
    setRows((cur) => [...cur, { cyl: id, conc: null, initMass: null, initLen: null, finalMass: null, finalLen: null, pctMass: null, pctLen: null, appearance: null }]);
    labSound.thunk(false);
    labSound.click();
    pushToast('info', '🥔', `Cylinder #${id} cut — ${initLen.toFixed(0)} mm long, about 5 g. It pops into the tray.`);
    if (!s.anim) s.anim = { id, sx: cyl.x, sy: cyl.y, tx: home.x, ty: home.y, t: 0, dur: 0.45, kind: 'tray', slot: null };
    if (s.cyls.length >= CYL_TARGET) earn('clean-bore');
    syncUi();
  }, [geom, traySlotPos, earn, pushToast, syncUi]);

  const bankBalanceReading = useCallback(() => {
    const s = sim.current;
    if (s.balance.id == null) return;
    const c = cylById(s.balance.id);
    if (!c || c.phase !== 'balance') return;
    if (!c.initDone) {
      c.initDone = true;
      setRows((cur) => cur.map((r) => (r.cyl === c.id ? { ...r, initMass: round2(c.mass), initLen: round2(c.lenMM) } : r)));
      labSound.ping(1046, 0.08);
      pushToast('good', '⚖', `Cylinder #${c.id}: ${c.mass.toFixed(2)} g · ${c.lenMM.toFixed(1)} mm banked.`);
    } else if (s.soakDone && !c.finalDone) {
      c.finalDone = true;
      const finalMass = round2(c.mass + jitter(0.1));
      const finalLen = roundHalf(c.lenMM + jitter(0.5));
      const pctMass = ((finalMass - c.initMass) / c.initMass) * 100;
      const pctLen = ((finalLen - c.initLenMM) / c.initLenMM) * 100;
      setRows((cur) => cur.map((r) => (r.cyl === c.id
        ? { ...r, finalMass, finalLen, pctMass: round2(pctMass), pctLen: round2(pctLen), appearance: appearanceOf(pctMass) }
        : r)));
      labSound.ping(1174, 0.09);
      pushToast('good', '🧾', `Cylinder #${c.id} final: ${finalMass.toFixed(2)} g (${pctMass >= 0 ? '+' : ''}${pctMass.toFixed(1)}% mass).`);
      if (s.cyls.every((x) => x.finalDone)) {
        labSound.milestone();
        earn('full-set');
        pushToast('good', '🏆', 'All six reweighed — your data set is complete. Open Observations.');
      }
    } else {
      labSound.tick();
    }
    syncUi();
  }, [cylById, earn, pushToast, syncUi]);

  /** Shared landing logic for pointer drops and keyboard-driven auto moves. */
  const commitDrop = useCallback((id: number, kind: 'balance' | 'beaker' | 'tray', slot: number | null) => {
    const s = sim.current;
    const c = cylById(id);
    if (!c) return;
    if (kind === 'balance') {
      if (s.soaking) {
        setWarnNote('The cylinders are soaking — let the clock finish before weighing again.');
        labSound.warn();
        const home = traySlotPos(c.homeSlot);
        c.x = home.x;
        c.y = home.y;
        c.phase = 'tray';
        return;
      }
      if (s.balance.id != null && s.balance.id !== id) {
        const prev = cylById(s.balance.id);
        if (prev && prev.phase === 'balance') {
          const prevHome = traySlotPos(prev.homeSlot);
          prev.x = prevHome.x;
          prev.y = prevHome.y;
          prev.phase = 'tray';
        }
      }
      const g = geom();
      c.x = g.pan.cx;
      c.y = g.pan.cy - 14;
      c.phase = 'balance';
      s.balance = { id, settle: 0, locked: false };
      labSound.thunk(false);
      return;
    }
    if (kind === 'beaker') {
      const i = slot ?? 0;
      const conc = CONCS[i];
      const home = traySlotPos(c.homeSlot);
      if (s.cyls.some((x) => x.conc === conc && x.id !== id)) {
        setWarnNote('One cylinder per beaker — that concentration is taken. Spread them out.');
        labSound.warn();
        c.x = home.x;
        c.y = home.y;
        c.phase = 'tray';
        return;
      }
      if (!c.initDone) {
        setWarnNote('Weigh this cylinder first — the table needs its starting mass and length.');
        labSound.warn();
        c.x = home.x;
        c.y = home.y;
        c.phase = 'tray';
        return;
      }
      if (s.soaking) {
        setWarnNote('The soak is running — the cylinders stay put until it finishes.');
        labSound.warn();
        c.x = home.x;
        c.y = home.y;
        c.phase = 'tray';
        return;
      }
      const wasConc = c.conc;
      c.conc = conc;
      const pos = beakerSlotPos(i);
      c.x = pos.x;
      c.y = pos.y;
      c.phase = 'beaker';
      if (wasConc !== conc) setRows((cur) => cur.map((r) => (r.cyl === id ? { ...r, conc } : r)));
      labSound.slosh(0.75);
      labSound.drip(false);
      return;
    }
    // tray (or anywhere else on the bench)
    const home = traySlotPos(c.homeSlot);
    const wasConc = c.conc;
    c.x = home.x;
    c.y = home.y;
    c.phase = 'tray';
    if (wasConc != null) {
      c.conc = null;
      setRows((cur) => cur.map((r) => (r.cyl === id ? { ...r, conc: null } : r)));
      labSound.drip(true);
    } else {
      labSound.thunk(true);
    }
  }, [cylById, geom, traySlotPos, beakerSlotPos]);

  const startSoak = useCallback(() => {
    const s = sim.current;
    if (s.soaking || s.soakDone) return;
    if (s.cyls.length < CYL_TARGET || !s.cyls.every((c) => c.conc != null)) {
      setWarnNote('Every beaker needs exactly one weighed cylinder before the soak can start.');
      labSound.warn();
      return;
    }
    s.soaking = true;
    s.clock = 0;
    labSound.click();
    labSound.startLoop('hum');
    pushToast('info', '⏳', 'Soak running — distilled water plumps, 1.0 M shrinks. Open the lens to watch the cells.');
    syncUi();
  }, [pushToast, syncUi]);

  // ---- auto actions (keyboard / button duplicates of the gestures) ---------
  const startAutoBore = useCallback(() => {
    const s = sim.current;
    if (s.cyls.length >= CYL_TARGET || s.bore.auto || s.anim) return;
    const g = geom();
    const hole = boreHolePos(g, s.cyls.length);
    s.bore.x = hole.hx - 16;
    s.bore.y = hole.hy - 62;
    s.bore.auto = true;
    s.bore.prog = 0;
    labSound.creak(0.5);
    syncUi();
  }, [geom, syncUi]);

  const autoWeigh = useCallback(() => {
    const s = sim.current;
    if (s.anim || s.drag.id != null) return;
    if (s.soaking) {
      setWarnNote('Mid-soak weighing is not allowed — the clock is still running.');
      labSound.warn();
      return;
    }
    const target = !s.soakDone
      ? s.cyls.find((c) => !c.initDone && c.phase === 'tray')
      : s.cyls.find((c) => !c.finalDone && c.phase === 'beaker') ?? s.cyls.find((c) => !c.finalDone && c.phase !== 'beaker');
    if (!target) {
      setWarnNote(s.soakDone ? 'Everything is already reweighed — open Observations.' : 'Nothing left to weigh right now.');
      labSound.tick();
      return;
    }
    const g = geom();
    s.anim = { id: target.id, sx: target.x, sy: target.y, tx: g.pan.cx, ty: g.pan.cy - 14, t: 0, dur: 0.55, kind: 'balance', slot: null };
    labSound.slide(0.4);
    notePointer(true);
  }, [geom, notePointer]);

  const autoBathe = useCallback(() => {
    const s = sim.current;
    if (s.anim || s.drag.id != null) return;
    const target = s.cyls.find((c) => c.conc == null && c.initDone && c.phase === 'tray');
    if (!target) return;
    const freeSlot = CONCS.findIndex((c) => !s.cyls.some((x) => x.conc === c));
    if (freeSlot < 0) return;
    const pos = beakerSlotPos(freeSlot);
    s.anim = { id: target.id, sx: target.x, sy: target.y, tx: pos.x, ty: pos.y, t: 0, dur: 0.55, kind: 'beaker', slot: freeSlot };
    labSound.slide(0.4);
    notePointer(true);
  }, [beakerSlotPos, notePointer]);

  const toggleLens = useCallback(() => {
    const s = sim.current;
    if (s.mag.open) {
      s.mag.open = false;
      labSound.tick();
    } else {
      const target = (s.mag.id != null ? cylById(s.mag.id) : null) ?? s.cyls[0] ?? null;
      if (!target) {
        labSound.tick();
        return;
      }
      s.mag.id = target.id;
      s.mag.open = true;
      labSound.glassClink(true);
      notePointer(true);
    }
    syncUi();
  }, [cylById, notePointer, syncUi]);

  const nextAction = useCallback(() => {
    const s = sim.current;
    if (s.anim || s.drag.id != null || s.bore.auto) return;
    if (s.cyls.length < CYL_TARGET) { startAutoBore(); return; }
    if (s.cyls.some((c) => !c.initDone)) { autoWeigh(); return; }
    if (s.cyls.some((c) => c.conc == null)) { autoBathe(); return; }
    if (!s.soaking && !s.soakDone) { startSoak(); return; }
    if (s.soakDone && s.cyls.some((c) => !c.finalDone)) { autoWeigh(); return; }
    pushToast('info', '📈', 'All measurements are in — open Observations to plot and conclude.');
    labSound.tick();
  }, [startAutoBore, autoWeigh, autoBathe, startSoak, pushToast]);

  // ---- simulation step ------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.time += dt;

    // idle dust drift
    for (const d of s.dust) {
      d.x += d.s * dt * 0.006;
      if (d.x > 1.04) d.x = -0.04;
    }

    // balance idle digit flicker
    s.flickAcc += dt;
    if (s.flickAcc > 1.15) {
      s.flickAcc = 0;
      s.flickT = 0.28;
      s.flickVal = jitter(0.02);
    }
    if (s.flickT > 0) s.flickT -= dt;

    // cork borer: manual hold + auto run
    if (s.bore.auto) {
      s.bore.prog += dt / 1.15;
      if (s.time - s.bore.creakAt > 0.22) {
        s.bore.creakAt = s.time;
        labSound.creak(0.25 + s.bore.prog * 0.5);
      }
      if (s.bore.prog >= 1) {
        s.bore.prog = 0;
        s.bore.auto = false;
        completeBore();
        const g = geom();
        s.bore.x = g.boreHome.x;
        s.bore.y = g.boreHome.y;
      }
    } else if (s.bore.dragging) {
      if (s.bore.inPotato) {
        s.bore.prog = Math.min(1, s.bore.prog + dt / 0.95);
        if (s.time - s.bore.creakAt > 0.18) {
          s.bore.creakAt = s.time;
          labSound.creak(0.25 + s.bore.prog * 0.5);
        }
        if (s.bore.prog >= 1) {
          s.bore.prog = 0;
          completeBore();
        }
      } else if (s.bore.prog > 0) {
        s.bore.prog = Math.max(0, s.bore.prog - dt * 2.4);
      }
    }

    // keyboard-driven glide of a cylinder to its landing spot
    if (s.anim) {
      const a = s.anim;
      const c = cylById(a.id);
      if (!c) {
        s.anim = null;
      } else {
        a.t += dt;
        const k = clamp(a.t / a.dur, 0, 1);
        const e = k * k * (3 - 2 * k);
        c.x = lerp(a.sx, a.tx, e);
        c.y = lerp(a.sy, a.ty, e);
        if (k >= 1) {
          s.anim = null;
          commitDrop(a.id, a.kind, a.slot);
        }
      }
    }

    // soak clock + honest kinetics
    if (s.soaking) {
      s.clock += dt * SIM_RATE * speed;
      const p = 1 - Math.exp(-s.clock / TAU);
      for (const c of s.cyls) {
        if (c.conc == null) continue;
        c.mass = c.initMass * (1 + (pctMassTruth(c.conc) / 100) * p);
        c.lenMM = c.initLenMM * (1 + (pctLenTruth(c.conc) / 100) * p);
      }
      s.dripAcc += dt;
      if (s.dripAcc > 2.6) {
        s.dripAcc = 0;
        labSound.drip(true);
      }
      if (s.clock >= SOAK_SIM_S) {
        s.clock = SOAK_SIM_S;
        s.soaking = false;
        s.soakDone = true;
        labSound.stopLoop();
        labSound.milestone();
        pushToast('good', '⏳', 'Soak complete — ten sim-minutes are up. Reweigh every cylinder on the balance.');
        syncUi();
      }
    }

    // balance settling → bank the reading
    const b = s.balance;
    if (b.id != null) {
      const c = cylById(b.id);
      if (!c || c.phase !== 'balance') {
        s.balance = { id: null, settle: 0, locked: false };
      } else if (!b.locked) {
        b.settle += dt;
        if (b.settle >= 0.9) {
          b.locked = true;
          bankBalanceReading();
        }
      }
    }

    // lens watching (badge) + water particle motion
    if (s.mag.open && s.mag.id != null) {
      const c = cylById(s.mag.id);
      const t = turgorOf(c);
      if (t > 0.25) s.seen.turgid = true;
      if (t < -0.25) s.seen.flaccid = true;
      if (s.seen.turgid && s.seen.flaccid && !s.badgedCells) {
        s.badgedCells = true;
        earn('cell-watcher');
      }
      if (Math.abs(t) >= 0.05) {
        for (const m of s.motes) {
          const dir = t >= 0 ? -1 : 1; // inward when water enters the cells
          m.dist += dir * Math.abs(t) * m.spd * dt;
          if (m.dist < 0.12) m.dist = 1.28;
          if (m.dist > 1.28) m.dist = 0.14;
        }
      }
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, geom, cylById, completeBore, commitDrop, bankBalanceReading, turgorOf, earn, pushToast, syncUi]);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // dust motes
    for (const d of s.dust) {
      ctx.fillStyle = 'rgba(90,110,130,0.07)';
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // floor line
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 3);
    ctx.lineTo(w, h - 3);
    ctx.stroke();

    // ---- tray (cylinder rack) ----
    ctx.fillStyle = '#d8c09a';
    roundRect(ctx, 6, g.trayY, w - 12, g.trayH, 8);
    ctx.fill();
    ctx.strokeStyle = '#b2925f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,120,70,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i += 1) {
      const x = g.slotW * i;
      ctx.beginPath();
      ctx.moveTo(x, g.trayY + 6);
      ctx.lineTo(x, g.trayY + g.trayH - 6);
      ctx.stroke();
    }

    // ---- cutting board + potato ----
    ctx.fillStyle = '#e4cda3';
    roundRect(ctx, g.board.x, g.board.y, g.board.w, g.board.h, 10);
    ctx.fill();
    ctx.strokeStyle = '#b2925f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,120,70,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const yy = g.board.y + (g.board.h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(g.board.x + 8, yy);
      ctx.lineTo(g.board.x + g.board.w - 8, yy);
      ctx.stroke();
    }

    // potato (shrinks slightly and gains bore holes as cylinders are cut)
    const bites = Math.min(s.cyls.length, 6);
    const shrink = 1 - bites * 0.035;
    const prx = g.pot.rx * shrink;
    const pry = g.pot.ry * shrink;
    const potatoGrad = ctx.createRadialGradient(g.pot.cx - prx * 0.3, g.pot.cy - pry * 0.35, pry * 0.2, g.pot.cx, g.pot.cy, prx);
    potatoGrad.addColorStop(0, '#f0d7a1');
    potatoGrad.addColorStop(0.6, '#dcb87e');
    potatoGrad.addColorStop(1, '#c09a5c');
    ctx.fillStyle = potatoGrad;
    ctx.beginPath();
    ctx.ellipse(g.pot.cx, g.pot.cy, prx, pry, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8f6b39';
    ctx.lineWidth = 2;
    ctx.stroke();
    // skin speckles (deterministic)
    ctx.fillStyle = 'rgba(140,100,50,0.35)';
    for (let i = 0; i < 9; i += 1) {
      const a = i * 2.4;
      const rr = 0.45 + ((i * 37) % 10) / 40;
      ctx.beginPath();
      ctx.arc(g.pot.cx + Math.cos(a) * prx * rr, g.pot.cy + Math.sin(a) * pry * rr, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // bore holes from completed cuts
    for (let i = 0; i < bites; i += 1) {
      const hole = boreHolePos(g, i);
      ctx.fillStyle = '#8a6434';
      ctx.beginPath();
      ctx.ellipse(hole.hx, hole.hy, 6.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6d4d24';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#f4e0b0';
      ctx.beginPath();
      ctx.ellipse(hole.hx, hole.hy, 3, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- beakers ----
    const hoverSlot = s.drag.id != null ? beakerSlotUnderPointer(s.drag.px ?? -1, s.drag.py ?? -1, g) : -1;
    for (let i = 0; i < 6; i += 1) {
      drawBeaker(ctx, g, i, s, hoverSlot === i);
    }

    // ---- digital balance ----
    drawBalance(ctx, g, s);

    // ---- cylinders (resting / beaker / balance) ----
    for (const c of s.cyls) {
      if (c.phase === 'hand') continue;
      drawCylinder(ctx, c, g, s);
    }

    // ---- cork borer (+ extruding cylinder) ----
    drawBorer(ctx, s);

    // ---- carried cylinder (on top of everything) ----
    if (s.drag.id != null) {
      const c = cylById(s.drag.id);
      if (c) drawCylinder(ctx, c, g, s, true);
    }

    // ---- magnifier (cell-level view) ----
    if (s.mag.open && s.mag.id != null) {
      const c = cylById(s.mag.id);
      drawMagnifier(ctx, g, s, c, turgorOf(c));
    }
  }, [geom, cylById, turgorOf]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (s.drag.id != null || s.bore.dragging || s.anim || s.bore.auto) { notePointer(false); return; }
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();

    // cylinder pickup (topmost first)
    for (let i = s.cyls.length - 1; i >= 0; i -= 1) {
      const c = s.cyls[i];
      if (c.phase === 'hand') continue;
      if (s.soaking && c.phase === 'beaker') continue;
      const lenPx = c.lenMM * g.pxMM;
      const hit = Math.abs(px - c.x) < lenPx / 2 + 14 && Math.abs(py - c.y) < lenPx / 6 + 14;
      if (hit) {
        s.drag = {
          id: c.id,
          offX: c.x - px,
          offY: c.y - py,
          sx: px,
          sy: py,
          fromX: c.x,
          fromY: c.y,
          fromPhase: c.phase,
          moved: false,
          slideAt: 0,
          px,
          py,
        };
        c.phase = 'hand';
        if (s.balance.id === c.id) s.balance = { id: null, settle: 0, locked: false };
        s.mag.open = true;
        s.mag.id = c.id;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.tick();
        notePointer(true);
        syncUi();
        return;
      }
    }

    // cork borer pickup (always available — it lives on the board)
    const dx = px - s.bore.x;
    const dy = py - (s.bore.y + 18);
    if (Math.hypot(dx, dy) < 36) {
      s.bore.dragging = true;
      s.bore.grabDx = s.bore.x - px;
      s.bore.grabDy = s.bore.y - py;
      const tip = borerTip(s.bore);
      s.bore.inPotato = pointInPotato(tip.tx, tip.ty, g, s.cyls.length);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.35);
      notePointer(true);
      return;
    }

    // empty tap closes the lens
    if (s.mag.open) {
      s.mag.open = false;
      syncUi();
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

    if (s.drag.id != null) {
      const c = cylById(s.drag.id);
      if (c) {
        c.x = clamp(px + s.drag.offX, 12, canvas.clientWidth - 12);
        c.y = clamp(py + s.drag.offY, 12, canvas.clientHeight - 12);
        if (!s.drag.moved && Math.hypot(px - s.drag.sx, py - s.drag.sy) > 7) s.drag.moved = true;
        const nowT = performance.now();
        if (nowT - s.drag.slideAt > 150) {
          s.drag.slideAt = nowT;
          labSound.slide(0.18);
        }
      }
      s.drag.px = px;
      s.drag.py = py;
      return;
    }

    if (s.bore.dragging) {
      const g = geom();
      s.bore.x = clamp(px + (s.bore.grabDx ?? 0), 20, canvas.clientWidth - 20);
      s.bore.y = clamp(py + (s.bore.grabDy ?? 0), 20, g.beakTop - 20);
      const tip = borerTip(s.bore);
      s.bore.inPotato = pointInPotato(tip.tx, tip.ty, g, s.cyls.length);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const s = sim.current;
    if (s.drag.id != null) {
      const id = s.drag.id;
      const moved = s.drag.moved;
      const fromPhase = s.drag.fromPhase;
      const fromX = s.drag.fromX;
      const fromY = s.drag.fromY;
      s.drag.id = null;
      try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      const c = cylById(id);
      if (!c) return;
      if (!moved) {
        // a tap: select only — put it back where it was
        c.x = fromX;
        c.y = fromY;
        c.phase = fromPhase;
        if (fromPhase === 'balance') s.balance = { id, settle: 0, locked: false };
        labSound.tick();
      } else {
        const rect = canvas?.getBoundingClientRect();
        const px = rect ? e.clientX - rect.left : c.x;
        const py = rect ? e.clientY - rect.top : c.y;
        const gg = geom();
        if (px > gg.bal.x - 14 && px < gg.bal.x + gg.bal.w + 14 && py > gg.bal.y - 10 && py < gg.bal.y + gg.bal.h + 24) {
          commitDrop(id, 'balance', null);
          notePointer(true);
        } else if (py > gg.beakTop - 16) {
          const slot = clamp(Math.floor(px / gg.slotW), 0, 5);
          commitDrop(id, 'beaker', slot);
          notePointer(true);
        } else {
          commitDrop(id, 'tray', null);
          notePointer(true);
        }
      }
      syncUi();
      return;
    }
    if (s.bore.dragging) {
      s.bore.dragging = false;
      s.bore.inPotato = false;
      if (s.bore.prog > 0 && s.bore.prog < 1) {
        s.bore.prog = 0;
        labSound.creak(0.2);
      }
      try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    }
  };

  // ---- conclusion card --------------------------------------------------------
  const answerConc = (id: string) => {
    if (concAnswer) return;
    if (id === 'iso') {
      setConcAnswer(id);
      labSound.milestone();
      earn('isotonic-found');
      pushToast('good', '◎', 'Correct — the line crosses zero near 0.3–0.4 mol/dm³. No net water movement there.');
    } else {
      setConcWrong(id);
      labSound.warn();
      pushToast('warn', '⚠', 'Not quite — read where your fitted line crosses the 0% line and try again.');
    }
  };

  const answerWater = (id: string) => {
    if (waterAnswer) return;
    if (id === 'in') {
      setWaterAnswer(id);
      labSound.ping(880, 0.1);
      pushToast('good', '💧', 'Right — below the isotonic point the solution is hypotonic, so water enters the cells.');
    } else {
      setWaterWrong(id);
      labSound.warn();
      pushToast('warn', '⚠', 'Think about the mass change you measured in beaker A — the cylinder got heavier.');
    }
  };

  // ---- analysis -----------------------------------------------------------------
  const fit = useMemo(
    () => (completeRows.length >= 2 ? linearFit(completeRows.map((r) => ({ x: r.conc as number, y: r.pctMass as number }))) : null),
    [completeRows],
  );
  const isoEst = fit && fit.m < 0 ? clamp(-fit.b / fit.m, 0, 1.2) : null;

  // ---- reset ---------------------------------------------------------------------
  const resetAll = () => {
    const s = sim.current;
    labSound.stopLoop();
    s.cyls = [];
    s.nextId = 1;
    s.bore = { x: 0, y: 0, dragging: false, prog: 0, auto: false, inPotato: false, creakAt: 0 };
    s.drag.id = null;
    s.anim = null;
    s.clock = 0;
    s.soaking = false;
    s.soakDone = false;
    s.balance = { id: null, settle: 0, locked: false };
    s.mag = { open: false, id: null };
    s.seen = { turgid: false, flaccid: false };
    s.badgedCells = false;
    const g = geom();
    s.bore.x = g.boreHome.x;
    s.bore.y = g.boreHome.y;
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setSawGraph(false);
    setConcAnswer(null);
    setConcWrong(null);
    setWaterAnswer(null);
    setWaterWrong(null);
    syncUi();
  };

  // ---- coach ------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (warnNote) return { tone: 'warn', line: warnNote };
    if (cutCount < CYL_TARGET) return { tone: 'info', line: `Drag the cork borer onto the potato and hold — a cylinder extrudes. ${cutCount}/${CYL_TARGET} cut so far.` };
    if (initCount < CYL_TARGET) return { tone: 'info', line: `${initCount}/${CYL_TARGET} weighed. Drag each cylinder onto the balance and let the digits settle before moving it.` };
    if (bathedCount < CYL_TARGET) return { tone: 'info', line: `${bathedCount}/${CYL_TARGET} beakers filled — one cylinder per concentration, distilled water through to 1.0 mol/dm³.` };
    if (ui.soaking) return { tone: 'info', line: `Soak running — ${fmtSimClock(ui.clock)} / ${fmtSimClock(SOAK_SIM_S)} simulated. Distilled plumps, 1.0 M shrinks; the lens shows why.` };
    if (!ui.soakDone) return { tone: 'good', line: 'All six bathing — press “Start the soak” and let the clock run to equilibrium.' };
    if (finalCount < CYL_TARGET) return { tone: 'info', line: `${finalCount}/${CYL_TARGET} reweighed. Drag each soaked cylinder back onto the balance to bank its final mass.` };
    if (!sawGraph) return { tone: 'good', line: 'Full data set banked — open Observations: six points, one fitted line, one isotonic point.' };
    if (isoEst != null) return { tone: 'good', line: `Your fitted line crosses 0% at ≈ ${isoEst.toFixed(2)} mol/dm³ — answer the conclusion card to finish.` };
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [warnNote, cutCount, initCount, bathedCount, finalCount, sawGraph, isoEst, ui.soaking, ui.soakDone, ui.clock]);

  // ---- status -------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : ui.soaking
      ? 'Soak in progress'
      : cutCount < CYL_TARGET
        ? 'Cutting cylinders'
        : initCount < CYL_TARGET
          ? 'Weighing cylinders'
          : bathedCount < CYL_TARGET
            ? 'Filling beakers'
            : !ui.soakDone
              ? 'Bench loaded — ready to soak'
              : finalCount < CYL_TARGET
                ? 'Reweighing cylinders'
                : 'Analysis';

  // ---- render ---------------------------------------------------------------------------
  const soakPct = Math.min(100, (ui.clock / SOAK_SIM_S) * 100);
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.conc ?? 99) - (b.conc ?? 99) || a.cyl - b.cyl),
    [rows],
  );

  const boreBtnLabel = cutCount >= CYL_TARGET ? 'All six cylinders cut' : ui.boreBusy ? 'Boring…' : 'Bore next cylinder';
  const weighBtnLabel = ui.soakDone ? 'Reweigh next cylinder' : 'Weigh next cylinder';
  const soakBtnLabel = ui.soakDone
    ? 'Soak complete — reweigh your cylinders'
    : ui.soaking
      ? `Soaking · ${fmtSimClock(ui.clock)} / ${fmtSimClock(SOAK_SIM_S)} sim`
      : bathedCount >= CYL_TARGET
        ? 'Start the soak — 10 sim-minutes'
        : `Soak unlocks at ${CYL_TARGET}/${CYL_TARGET} beakers (${bathedCount} filled)`;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.soaking ? 'active' : 'ready'}
      captionChip="Hands-on: bore · weigh · bathe · reweigh"
      legend={[
        { color: '#e2c288', label: 'Potato cylinders' },
        { color: '#8da8b9', label: 'NaCl solutions' },
        { color: '#d9a441', label: 'Cork borer & lens' },
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
        <label>Soak speed
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Soak playback speed">
            <option value={1}>1× (12 s real)</option>
            <option value={4}>4× (3 s real)</option>
          </select>
        </label>
      }
      scene={
        <div className="osm-stage">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="application"
            aria-label="Osmosis bench — drag the cork borer to cut potato cylinders, drag cylinders onto the balance and into the six salt beakers"
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); nextAction(); }
              if (e.key === 'Escape') {
                const s = sim.current;
                if (s.drag.id != null) {
                  const c = cylById(s.drag.id);
                  if (c) { c.x = s.drag.fromX; c.y = s.drag.fromY; c.phase = s.drag.fromPhase; }
                  s.drag.id = null;
                }
                s.mag.open = false;
                syncUi();
              }
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="osm-beaker-labels" aria-hidden="true">
            {CONCS.map((c, i) => (
              <span key={c} className={`osm-blabel${filledSlots[i] ? ' filled' : ''}`}>
                <strong>{BEAKER_LETTERS[i]} · {c.toFixed(1)} M</strong>
                <small>{c === 0 ? 'distilled water' : 'NaCl solution'}</small>
              </span>
            ))}
          </div>
        </div>
      }
      controls={
        <div>
          <div className="osm-actions">
            <button
              className="action-button"
              type="button"
              data-nudge="bore"
              onClick={() => { startAutoBore(); notePointer(true); }}
              disabled={cutCount >= CYL_TARGET || ui.boreBusy}
            >
              <span className="dispense-icon" aria-hidden="true">🥔</span>
              <span>{boreBtnLabel}</span>
              <small>or drag the borer across the potato</small>
            </button>
            <button
              className="action-button"
              type="button"
              data-nudge="weigh"
              onClick={() => { autoWeigh(); }}
              disabled={ui.soaking || (cutCount >= CYL_TARGET && initCount >= CYL_TARGET && (ui.soakDone ? finalCount >= CYL_TARGET : false))}
            >
              <span className="dispense-icon" aria-hidden="true">⚖</span>
              <span>{weighBtnLabel}</span>
              <small>or drag a cylinder onto the pan</small>
            </button>
            <button
              className="action-button"
              type="button"
              data-nudge="lens"
              onClick={() => { toggleLens(); }}
              disabled={cutCount === 0}
            >
              <span className="dispense-icon" aria-hidden="true">🔬</span>
              <span>{ui.magOpen ? 'Close the lens' : 'Lens on cylinder'}</span>
              <small>see turgid vs flaccid cells</small>
            </button>
          </div>
          <button
            className="record-button osm-soak-btn"
            type="button"
            data-nudge="soak"
            onClick={() => { startSoak(); notePointer(true); }}
            disabled={bathedCount < CYL_TARGET || ui.soaking || ui.soakDone}
          >
            {soakBtnLabel}
          </button>

          <div className={`osm-balance${ui.balState === 'locked' ? ' locked' : ui.balState === 'settling' ? ' settling' : ''}`}>
            <div className="osm-balance-head">
              <span>DIGITAL BALANCE · CALIPER</span>
              <span>{ui.balState === 'settling' ? 'SETTLING…' : ui.balState === 'locked' ? 'LOCKED' : 'READY'}</span>
            </div>
            <strong className="osm-digits">{ui.balMass} <small>g</small></strong>
            <div className="osm-balance-sub">
              <span>cylinder length</span>
              <strong>{ui.balLen}{ui.balLen === '—' ? '' : ' mm'}</strong>
            </div>
            {ui.dragId != null && <p className="osm-carrying">Carrying cylinder #{ui.dragId} — drop it on the balance, a beaker, or the tray.</p>}
          </div>

          <div className="osm-clock">
            <div className="osm-clock-head">
              <span>SOAK CLOCK · SIMULATED</span>
              <strong>{fmtSimClock(ui.clock)} <small>/ {fmtSimClock(SOAK_SIM_S)}</small></strong>
            </div>
            <div className="osm-clock-track"><span style={{ width: `${soakPct}%` }} /></div>
          </div>

          <div className="osm-chk">
            {rows.map((r) => {
              const state = r.finalMass != null ? 'done' : r.conc != null ? ((ui.soaking || ui.soakDone) ? 'bathing' : 'placed') : r.initMass != null ? 'weighed' : 'cut';
              return (
                <span key={r.cyl} className={`osm-chk-chip ${state}`} title={`Cylinder #${r.cyl}`}>
                  #{r.cyl}
                  <i>{state === 'done' ? '✓' : state === 'bathing' ? '≈' : state === 'placed' ? '○' : state === 'weighed' ? '⚖' : '·'}</i>
                </span>
              );
            })}
          </div>

          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Press Space (or focus the bench and press Enter) at any moment — the next sensible step happens by itself: bore, weigh, bathe, soak, reweigh.</p></div>
          <div className="hint-row"><span>💡</span><p style={{ margin: 0 }}>Masses jitter ±0.1 g and lengths ±0.5 mm, just like the real bench — your six points still line up because the error is random, not systematic.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Balance (live)</span><strong>{ui.balMass} <small>g</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (Number(ui.balMass) / 6) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0 g</span><span>6 g</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Cylinders cut</span><strong>{cutCount}/{CYL_TARGET}</strong></div>
            <div><span>Initial masses</span><strong>{initCount}/{CYL_TARGET}</strong></div>
            <div><span>Beakers filled</span><strong>{bathedCount}/{CYL_TARGET}</strong></div>
            <div><span>Soak clock</span><strong>{fmtSimClock(ui.clock)}</strong></div>
            <div><span>Reweighed</span><strong>{finalCount}/{CYL_TARGET}</strong></div>
            <div><span>Appearance set</span><strong>{rows.filter((r) => r.appearance).length}/{CYL_TARGET}</strong></div>
          </div>
          <div className="g-readout">
            <span>Isotonic point (from your fit)</span>
            <strong>{isoEst != null ? <>{isoEst.toFixed(2)} <small>mol/dm³</small></> : <small style={{ fontSize: 13 }}>reweigh 2+ cylinders to fit the line</small>}</strong>
            {fit && isoEst != null && <p>Least-squares fit over {completeRows.length} points · slope {fit.m.toFixed(1)} %/M · R² = {fit.r2.toFixed(4)} · x-intercept where % mass change = 0.</p>}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the cork borer onto the potato and hold — six cylinders collect in the tray (or press “Bore next cylinder”).</li>
              <li>Drag each cylinder onto the digital balance and wait for the digits to settle: its starting mass and length are banked.</li>
              <li>Drag one weighed cylinder into each beaker — 0.0 M distilled water through to 1.0 M salt.</li>
              <li>Start the soak and let the simulated clock run to ten minutes; watch plump and shrivel happen.</li>
              <li>Drag every cylinder back onto the balance; percentage changes and appearance are computed.</li>
              <li>Open Observations: read the fitted line’s x-intercept and answer the conclusion card.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>One cylinder per concentration is what makes the graph honest — each point is an independent measurement of a different water potential.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Bore your first cylinder — the table fills as you weigh, bathe and reweigh each one.</p>
            ) : (
              <div className="osm-table-wrap">
                <table className="trial-table">
                  <thead><tr><th>Beaker</th><th>Conc (M)</th><th>Initial (g)</th><th>Final (g)</th><th>% mass</th><th>% length</th><th>Appearance</th></tr></thead>
                  <tbody>
                    {sortedRows.map((r) => (
                      <tr key={r.cyl}>
                        <td>{r.conc != null ? beakerLetterOf(r.conc) : `#${r.cyl}`}</td>
                        <td>{r.conc != null ? r.conc.toFixed(1) : '—'}</td>
                        <td>{r.initMass != null ? r.initMass.toFixed(2) : '—'}</td>
                        <td>{r.finalMass != null ? r.finalMass.toFixed(2) : '—'}</td>
                        <td>{r.pctMass != null ? `${r.pctMass >= 0 ? '+' : ''}${r.pctMass.toFixed(1)}` : '—'}</td>
                        <td>{r.pctLen != null ? `${r.pctLen >= 0 ? '+' : ''}${r.pctLen.toFixed(1)}` : '—'}</td>
                        <td>{r.appearance ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {completeRows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>% mass change vs concentration</h3>
                <Plot points={completeRows.map((r) => ({ x: r.conc as number, y: r.pctMass as number }))} xLabel="Concentration (mol/dm³)" yLabel="% mass change" fitLine height={220} />
                {isoEst != null && <p className="observation-note">The fitted line crosses 0% at <strong>{isoEst.toFixed(2)} mol/dm³</strong> — that is your measured isotonic point{fit ? ` (slope ${fit.m.toFixed(1)} %/M, R² ${fit.r2.toFixed(3)})` : ''}.</p>}
              </>
            )}

            <h3 style={{ marginTop: 16 }}>Where is the isotonic concentration?</h3>
            <p className="observation-note">Pick the range that matches your own x-intercept — the concentration where potato cylinders neither gain nor lose mass.</p>
            <div className="osm-chips" role="group" aria-label="Isotonic concentration choices">
              {CONC_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`osm-chip${concAnswer === chip.id ? ' correct' : concWrong === chip.id ? ' wrong' : ''}`}
                  onClick={() => answerConc(chip.id)}
                  disabled={concAnswer != null}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <h3 style={{ marginTop: 16 }}>Which way did the water go?</h3>
            <p className="observation-note">In beaker A (0.0 M distilled water) the cylinder gained mass. What was the water doing?</p>
            <div className="osm-chips" role="group" aria-label="Water movement question">
              {WATER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`osm-chip${waterAnswer === chip.id ? ' correct' : waterWrong === chip.id ? ' wrong' : ''}`}
                  onClick={() => answerWater(chip.id)}
                  disabled={waterAnswer != null}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {concAnswer === 'iso' && waterAnswer === 'in' && (
              <p className="observation-note osm-final-note">Both conclusions locked in: below ≈ 0.33 mol/dm³ the solutions are hypotonic — water enters the cells and they press turgid against their walls. Above it the solutions are hypertonic — water leaves and the cells go flaccid. At the isotonic point, water crosses the membrane equally both ways.</p>
            )}
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Osmosis is the diffusion of water across a partially permeable membrane, from where water is plentiful (high water potential) to where it is scarce (low water potential). Dissolving salt in water lowers its water potential: the more salt, the thirstier the solution looks to a potato cell.</p>
            <p>A potato cylinder is a sponge of plant cells. In distilled water the outside solution has the higher water potential, so water flows in — the cells swell and press hard against their cellulose walls, and the whole cylinder gains mass and goes turgid. In concentrated salt solution the reverse happens: water leaves, the protoplasts pull inward from the walls, and the cylinder loses mass and goes flaccid.</p>
            <div className="equation">% mass change = 100 × (final − initial) / initial</div>
            <p>Plotting % mass change against concentration gives a straight, falling line. Where it crosses zero, the cylinder gained nothing and lost nothing — the solution’s water potential matches the potato tissue’s. That concentration is the isotonic point, and for potato tissue it sits near 0.3–0.4 mol/dm³.</p>
            <p>Length changes less than mass because cellulose cell walls resist stretching and shrinking — the walls keep the shape while the water volume does the moving. That is also why the flaccid cylinder wrinkles instead of simply shrinking: the wall stays roughly in place while the protoplast pulls away inside it.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => {
        if (t === 'observations' && completeRows.length >= 5) {
          setSawGraph(true);
          earn('straight-story');
        }
      }}
    />
  );
}

// ---- canvas helpers (pure shapes — no text anywhere on the scene canvas) -------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function boreHolePos(g: Geom, i: number) {
  const a = 0.7 + i * 1.05;
  return { hx: g.pot.cx + Math.cos(a) * g.pot.rx * 0.52, hy: g.pot.cy + Math.sin(a) * g.pot.ry * 0.52 };
}

function borerTip(bore: { x: number; y: number }) {
  const a = 0.26;
  const L = 64;
  return { tx: bore.x + Math.sin(a) * L, ty: bore.y + Math.cos(a) * L };
}

function pointInPotato(x: number, y: number, g: Geom, bites: number) {
  const shrink = 1 - Math.min(bites, 6) * 0.035;
  const rx = g.pot.rx * shrink;
  const ry = g.pot.ry * shrink;
  const dx = x - g.pot.cx;
  const dy = y - g.pot.cy;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

function beakerSlotUnderPointer(px: number, py: number, g: Geom) {
  if (py < g.beakTop - 16) return -1;
  return clamp(Math.floor(px / g.slotW), 0, 5);
}

function drawBeaker(ctx: CanvasRenderingContext2D, g: Geom, i: number, s: SimState, hovered: boolean) {
  const conc = CONCS[i];
  const cx = g.slotW * (i + 0.5);
  const bw = clamp(g.slotW * 0.6, 34, 84);
  const top = g.beakTop + 4;
  const bot = g.beakBot - 2;
  const bh = bot - top;
  const occupied = s.cyls.some((c) => c.conc === conc);

  // drop-target highlight
  if (hovered && s.drag.id != null) {
    ctx.fillStyle = 'rgba(249,115,22,0.10)';
    roundRect(ctx, cx - bw / 2 - 6, top - 8, bw + 12, bh + 10, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(249,115,22,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // solution body (subtle density tint that grows with concentration)
  const solH = bh * 0.62 + (occupied ? 3 : 0);
  const tint = conc === 0
    ? { r: 214, g: 236, b: 246, a: 0.9 }
    : { r: 168, g: 196, b: 214, a: 0.55 + conc * 0.32 };
  const sol = ctx.createLinearGradient(0, bot - solH, 0, bot);
  sol.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},${tint.a})`);
  sol.addColorStop(1, `rgba(${Math.round(tint.r * 0.82)},${Math.round(tint.g * 0.85)},${Math.round(tint.b * 0.9)},${Math.min(1, tint.a + 0.1)})`);
  ctx.fillStyle = sol;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2 + 3, bot - solH);
  ctx.lineTo(cx - bw / 2 + 3, bot - 4);
  ctx.quadraticCurveTo(cx - bw / 2 + 3, bot, cx - bw / 2 + 10, bot);
  ctx.lineTo(cx + bw / 2 - 10, bot);
  ctx.quadraticCurveTo(cx + bw / 2 - 3, bot, cx + bw / 2 - 3, bot - 4);
  ctx.lineTo(cx + bw / 2 - 3, bot - solH);
  ctx.closePath();
  ctx.fill();

  // meniscus
  ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${Math.min(1, tint.a + 0.08)})`;
  ctx.beginPath();
  ctx.ellipse(cx, bot - solH, bw / 2 - 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // shimmer streaks (idle animation)
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - bw / 2 + 4, bot - solH + 3, bw - 8, Math.max(4, solH - 6));
  ctx.clip();
  for (let k = 0; k < 2; k += 1) {
    const ph = (s.time * (10 + i * 2) + k * 40 + i * 17) % (bw + 30);
    const sx = cx - bw / 2 - 15 + ph;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx, bot - 4);
    ctx.lineTo(sx + 9, bot - solH + 4);
    ctx.stroke();
  }
  ctx.restore();

  // bubbles while a cylinder soaks inside
  if (occupied && s.soaking) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k < 3; k += 1) {
      const cyc = (s.time * (0.35 + k * 0.22) + k * 0.37) % 1;
      const by = bot - 6 - cyc * (solH - 12);
      const bx = cx - bw / 6 + ((k * 13) % Math.max(6, bw / 2));
      ctx.beginPath();
      ctx.arc(bx, by, 1.6 + (1 - cyc) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // glass walls
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2 + 2, top);
  ctx.lineTo(cx - bw / 2 + 2, bot - 6);
  ctx.quadraticCurveTo(cx - bw / 2 + 2, bot, cx - bw / 2 + 10, bot);
  ctx.lineTo(cx + bw / 2 - 10, bot);
  ctx.quadraticCurveTo(cx + bw / 2 - 2, bot, cx + bw / 2 - 2, bot - 6);
  ctx.lineTo(cx + bw / 2 - 2, top);
  ctx.stroke();
  // rim
  ctx.strokeStyle = '#a9c0cf';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, top, bw / 2 - 2, 4, 0, 0, Math.PI * 2);
  ctx.stroke();

  // glass glare
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2 + 7, top + 12);
  ctx.lineTo(cx - bw / 2 + 7, bot - 14);
  ctx.stroke();
}

function drawBalance(ctx: CanvasRenderingContext2D, g: Geom, s: SimState) {
  const bodyTop = g.bal.y + g.bal.h - 34;
  // feet + body
  ctx.fillStyle = '#2c3542';
  roundRect(ctx, g.bal.x + 12, bodyTop + 26, 14, 8, 2);
  ctx.fill();
  roundRect(ctx, g.bal.x + g.bal.w - 26, bodyTop + 26, 14, 8, 2);
  ctx.fill();
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + 28);
  bodyGrad.addColorStop(0, '#48556a');
  bodyGrad.addColorStop(1, '#333e4e');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, g.bal.x + 8, bodyTop, g.bal.w - 16, 28, 6);
  ctx.fill();
  ctx.strokeStyle = '#232c39';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // screen plate (the digits themselves live in the DOM readout)
  ctx.fillStyle = '#101823';
  roundRect(ctx, g.bal.x + g.bal.w / 2 - 34, bodyTop + 6, 68, 16, 3);
  ctx.fill();
  const busy = s.balance.id != null;
  const led = busy ? (Math.sin(s.time * 14) > 0 ? '#6fe38b' : '#2f6b47') : (Math.sin(s.time * 3) > 0.4 ? '#6fe38b' : '#33564a');
  ctx.fillStyle = led;
  ctx.beginPath();
  ctx.arc(g.bal.x + g.bal.w / 2 + 46, bodyTop + 14, 3, 0, Math.PI * 2);
  ctx.fill();
  // stem + pan
  ctx.fillStyle = '#9fb0bf';
  roundRect(ctx, g.pan.cx - 3, g.pan.cy + 4, 6, Math.max(4, bodyTop - g.pan.cy - 4), 2);
  ctx.fill();
  const panGrad = ctx.createLinearGradient(0, g.pan.cy - 4, 0, g.pan.cy + 6);
  panGrad.addColorStop(0, '#e6edf3');
  panGrad.addColorStop(1, '#b7c6d2');
  ctx.fillStyle = panGrad;
  roundRect(ctx, g.pan.cx - 38, g.pan.cy - 4, 76, 8, 4);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // pan shine sweep (idle)
  const sweep = (s.time * 26) % 90;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(g.pan.cx - 38 + sweep * 0.8, g.pan.cy - 3, 7, 2);
}

function drawCylinder(ctx: CanvasRenderingContext2D, c: CylSim, g: Geom, s: SimState, carried = false) {
  const lenPct = ((c.lenMM - c.initLenMM) / c.initLenMM) * 100;
  const baseL = c.lenMM * g.pxMM;
  const L = Math.max(18, baseL * (1 + 0.8 * (lenPct / 100)));
  const D = Math.max(8, (baseL / 3.4) * (1 + 1.7 * (lenPct / 100)));
  const turg = c.conc == null ? 0.35 : clamp((pctMassTruth(c.conc) * (s.soakDone ? 1 : s.soaking ? 1 - Math.exp(-s.clock / TAU) : 0)) / 12, -1, 1);
  const flac = clamp(-turg, 0, 1);

  let tilt = 0;
  if (c.phase === 'beaker') tilt = -1.12;
  else if (c.phase === 'tray') tilt = Math.sin(s.time * 2.1 + c.wob) * 0.055 * flac;
  else if (c.phase === 'hand') tilt = Math.sin(s.time * 5 + c.wob) * 0.04;

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(tilt);
  if (carried) {
    ctx.shadowColor = 'rgba(23,35,52,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
  }

  // flesh
  const flesh = ctx.createLinearGradient(0, -D / 2, 0, D / 2);
  const dull = flac * 0.5;
  flesh.addColorStop(0, turg >= 0 ? '#f7e6bd' : '#e7d3a4');
  flesh.addColorStop(0.5, `rgb(${Math.round(236 - dull * 60)},${Math.round(208 - dull * 55)},${Math.round(150 - dull * 40)})`);
  flesh.addColorStop(1, '#cfa96e');
  ctx.fillStyle = flesh;
  roundRect(ctx, -L / 2, -D / 2, L, D, D / 2);
  ctx.fill();
  ctx.strokeStyle = '#b28c4f';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // skin caps (the cut ends)
  ctx.fillStyle = 'rgba(160,116,58,0.55)';
  roundRect(ctx, -L / 2, -D / 2, D * 0.35, D, D / 2);
  ctx.fill();
  roundRect(ctx, L / 2 - D * 0.35, -D / 2, D * 0.35, D, D / 2);
  ctx.fill();

  // gloss streak — bright and shifting when turgid, dull when flaccid
  const gloss = 0.1 + 0.42 * clamp(turg, 0, 1);
  const gx = Math.sin(s.time * 0.9 + c.wob) * L * 0.08;
  ctx.fillStyle = `rgba(255,255,255,${gloss.toFixed(3)})`;
  roundRect(ctx, -L * 0.28 + gx, -D * 0.32, L * 0.5, Math.max(1.5, D * 0.16), D * 0.08);
  ctx.fill();

  // wrinkles when flaccid
  if (flac > 0.25) {
    ctx.strokeStyle = `rgba(120,85,40,${(flac * 0.5).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    const n = 4;
    for (let k = 0; k < n; k += 1) {
      const wx = -L * 0.3 + (k * L * 0.62) / (n - 1);
      ctx.beginPath();
      ctx.moveTo(wx, -D * 0.34);
      ctx.quadraticCurveTo(wx + 3, 0, wx, D * 0.34);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawBorer(ctx: CanvasRenderingContext2D, s: SimState) {
  const a = 0.26;
  const L = 64;
  const tip = borerTip(s.bore);
  const active = s.bore.dragging || s.bore.auto;
  const bx = s.bore.x;
  const by = s.bore.y;

  // extruding cylinder while boring
  if (s.bore.prog > 0 && s.cyls.length < CYL_TARGET) {
    const ex = tip.tx + Math.sin(a) * (s.bore.prog * 26);
    const ey = tip.ty + Math.cos(a) * (s.bore.prog * 26);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#b28c4f';
    ctx.lineWidth = 12.5;
    ctx.beginPath();
    ctx.moveTo(tip.tx, tip.ty);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = '#f4e0b0';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(tip.tx, tip.ty);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // tube
  const grad = ctx.createLinearGradient(bx - 7, 0, bx + 7, 0);
  grad.addColorStop(0, '#eef3f7');
  grad.addColorStop(0.5, '#c3ced8');
  grad.addColorStop(1, '#8fa2b1');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tip.tx, tip.ty);
  ctx.stroke();
  // inner bore line
  ctx.strokeStyle = 'rgba(40,55,70,0.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(bx, by + 6);
  ctx.lineTo(tip.tx, tip.ty - 4);
  ctx.stroke();
  // brass ferrule near the tip
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(bx + Math.sin(a) * (L - 10), by + Math.cos(a) * (L - 10));
  ctx.lineTo(tip.tx, tip.ty);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // T-handle
  ctx.strokeStyle = '#8fa2b1';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(bx - 16, by - 6);
  ctx.lineTo(bx + 16, by - 6);
  ctx.stroke();
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, bx - 18, by - 9, 8, 7, 2);
  ctx.fill();
  roundRect(ctx, bx + 10, by - 9, 8, 7, 2);
  ctx.fill();

  // affordance ring when idle and cylinders are still needed
  if (!active && s.cyls.length < CYL_TARGET) {
    const pulse = 0.5 + 0.5 * Math.sin(s.time * 3);
    ctx.strokeStyle = `rgba(249,115,22,${(0.25 + pulse * 0.3).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(bx, by + 14, 26 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawMagnifier(ctx: CanvasRenderingContext2D, g: Geom, s: SimState, cyl: CylSim | null, turg: number) {
  const { cx, cy, r } = g.mag;
  const cells: { x: number; y: number; w: number; h: number }[] = [];
  const cw = r * 0.56;
  const chh = cw * 0.62;
  for (let i = 0; i < 6; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    cells.push({ x: cx + (col - 1) * (cw + 8) - cw / 2, y: cy + (row - 0.5) * (chh + 12) - chh / 2, w: cw, h: chh });
  }

  // lens backdrop
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(28,24,18,0.78)';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const flesh = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  flesh.addColorStop(0, '#f6e9cf');
  flesh.addColorStop(1, '#e3cfa4');
  ctx.fillStyle = flesh;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const gap = clamp((1 - turg) * 0.13, 0, 0.3);
  const protoCol = turg >= 0
    ? `rgb(${Math.round(169 + 30 * turg)},${Math.round(205 + 12 * turg)},${Math.round(125 - 10 * turg)})`
    : `rgb(${Math.round(169 - 20 * turg)},${Math.round(205 - 40 * turg)},${Math.round(125 - 25 * turg)})`;

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    // cell wall (fixed outline — walls resist osmosis)
    ctx.strokeStyle = '#a37b42';
    ctx.lineWidth = 2.5;
    roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 7);
    ctx.stroke();
    // protoplast (presses on the wall when turgid, pulls in when flaccid)
    const px = cell.x + cell.w * gap * 0.5;
    const py = cell.y + cell.h * gap * 0.5;
    const pw = cell.w * (1 - gap);
    const ph = cell.h * (1 - gap);
    ctx.fillStyle = protoCol;
    roundRect(ctx, px, py, pw, ph, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,120,60,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // vacuole — large and bright when turgid
    const vr = Math.max(3, Math.min(pw, ph) * (0.28 + 0.1 * clamp(turg, -1, 1)));
    const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, vr * 0.2, px + pw / 2, py + ph / 2, vr);
    vg.addColorStop(0, 'rgba(140,190,110,0.75)');
    vg.addColorStop(1, 'rgba(110,160,90,0.35)');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, vr, 0, Math.PI * 2);
    ctx.fill();
    // membrane water chevrons (direction = sign of the turgor drive)
    if (Math.abs(turg) > 0.12) {
      const inward = turg > 0;
      const col = inward ? 'rgba(74,144,217,0.9)' : 'rgba(232,116,63,0.9)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      const pulse = Math.sin(s.time * 5 + i) * 2;
      for (let k = 0; k < 2; k += 1) {
        const side = (i + k) % 2 === 0 ? -1 : 1;
        const mx = cell.x + cell.w / 2 + side * (cell.w / 2 + 5 + (inward ? -pulse : pulse));
        const dir = inward ? -side : side;
        ctx.beginPath();
        ctx.moveTo(mx - dir * 4, cell.y + cell.h / 2 - 5);
        ctx.lineTo(mx + dir * 2, cell.y + cell.h / 2);
        ctx.lineTo(mx - dir * 4, cell.y + cell.h / 2 + 5);
        ctx.stroke();
      }
    }
  }

  // water particles crossing the membranes
  for (const m of s.motes) {
    const cell = cells[m.cell % cells.length];
    if (!cell) continue;
    const ccx = cell.x + cell.w / 2;
    const ccy = cell.y + cell.h / 2;
    const rad = Math.max(cell.w, cell.h) / 2;
    const x = ccx + Math.cos(m.ang) * rad * m.dist;
    const y = ccy + Math.sin(m.ang) * rad * 0.62 * m.dist;
    ctx.fillStyle = 'rgba(86,150,224,0.8)';
    ctx.beginPath();
    ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // glass glare
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, -2.4, -1.6);
  ctx.stroke();
  ctx.restore();

  // brass rim + handle
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#8a6420';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, cx - 6, cy + r + 2, 12, 18, 4);
  ctx.fill();

  // dashed link back to the cylinder under the lens
  if (cyl) {
    ctx.strokeStyle = 'rgba(217,164,65,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cyl.x, cyl.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
