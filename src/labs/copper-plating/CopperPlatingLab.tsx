import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { fmtClock, clamp, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './copper-plating.css';

/**
 * Copper plating — an electroplating bench on a 2D canvas.
 *
 * An iron nail and a thick copper strip hang in blue copper(II) sulfate
 * solution, wired to a bench supply through a current selector and a knife
 * switch. The student closes the switch and pink copper plates onto the nail
 * (the cathode) at an honest Faraday-law rate while the copper anode loses
 * exactly the same mass — the blue of the bath never fades. Drag the
 * crocodile clips to the other electrodes and the plating runs backwards;
 * drag the nail out mid-run and weigh the deposit on the digital balance.
 * Recorded rows become a mass–time line whose slope is M·I/(z·F).
 */

// ---- chemistry constants ------------------------------------------------------
const FARADAY = 96485; // C/mol
const M_CU = 63.5; // g/mol — molar mass of copper
const Z_CU = 2; // electrons per Cu²⁺
const K_G_PER_C = M_CU / (Z_CU * FARADAY); // g of copper per coulomb ≈ 3.291e-4
const RHO_CU = 8.96; // g/cm³ — density of copper
const NAIL_AREA = 3.9; // cm² — plated area of the immersed nail
const MICRON_PER_G = 1e4 / (RHO_CU * NAIL_AREA); // µm of coat per gram ≈ 286
const STRIP_MASS0 = 12.0; // g — the thick copper anode
const SOLUTION_CU0 = 8.0; // g of copper(II) dissolved in the bath
const CURRENT_OPTIONS = [0.2, 0.5, 1.0]; // A
const AM_FS = 1.0; // A — ammeter full scale
const FULL_PLATE = 0.5; // g — the "full plate" badge target
const PINK_UM = 4; // µm — first clearly visible coat
const RECORD_MIN_MASS = 0.02; // g — record button unlock
const COAT_PX_PER_G = 26; // px of drawn coat per gram (0.5 g → 13 px)
const COAT_SPREAD_G = 0.05; // g at which the coat has crept the full length
const DRAIN_LIMIT = 0.8; // g stripped straight from the bath before the warn

/** Fixed nodule seeds — the coat grows matte and slightly nodular. */
const NODULES = [
  { u: 0.13, amp: 0.55 }, { u: 0.28, amp: 0.9 }, { u: 0.41, amp: 0.5 },
  { u: 0.57, amp: 1.0 }, { u: 0.69, amp: 0.65 }, { u: 0.83, amp: 0.8 },
  { u: 0.94, amp: 0.6 },
];
/** Fixed pit seeds on the anode — dissolution eats the strip unevenly. */
const PITS = [
  { v: 0.16, side: -1, size: 0.8 }, { v: 0.27, side: 1, size: 1.0 },
  { v: 0.38, side: -1, size: 0.6 }, { v: 0.49, side: 1, size: 0.75 },
  { v: 0.6, side: -1, size: 1.0 }, { v: 0.72, side: 1, size: 0.55 },
  { v: 0.84, side: -1, size: 0.85 },
];
/** Matte speckles on the grown coat. */
const SPECKLES = [
  { u: 0.2, side: 0.55 }, { u: 0.34, side: -0.5 }, { u: 0.46, side: 0.7 },
  { u: 0.6, side: -0.65 }, { u: 0.75, side: 0.45 }, { u: 0.9, side: -0.6 },
];

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'wire', title: 'Wire the cell, check the polarity', detail: 'An iron nail and a thick copper strip hang in blue copper(II) sulfate solution. The blue clip from the supply’s negative terminal grips the nail — it is the cathode. The red clip from the positive terminal grips the strip — the anode. Copper plates onto whichever electrode is negative.', hint: 'Polarity decides everything here: the negative electrode collects the pink coat.' },
  { id: 'switch', title: 'Close the switch at 0.2 A', detail: 'Set the current selector to 0.2 A and close the knife switch — the brass lever on the bench, or the big button. A gentle current grows the smoothest coat.', hint: 'Plating is honestly slow at real time — the Speed selector hurries the clock, never the chemistry.' },
  { id: 'watch', title: 'Watch the deposit and the anode', detail: 'Pink copper creeps up the nail and thickens, while the strip slowly thins and pits. The ammeter holds steady and the blue of the bath never fades.', hint: 'The anode gives up exactly the mass the nail gains — watch both readouts move together.' },
  { id: 'record', title: 'Record the mass line', detail: 'Bank two or three rows into your observations table: time, current, deposit mass and thickness. On the graph, mass climbs as a straight line whose slope is the plating rate.', hint: 'Rows spread over a few sim-minutes make the slope honest.' },
  { id: 'swap', title: 'Swap the clips, watch it reverse', detail: 'Drag either crocodile clip to the other electrode and let go — or press the swap button. The nail turns positive, and plating runs backwards: the deposit dissolves off the nail while copper plates onto the strip.', hint: 'The bench opens the switch while you move a live lead — close it again after the swap.' },
  { id: 'sprint', title: 'Run at 1.0 A and compare slopes', detail: 'Plate at a full amp and record again, then open Observations: the line at 1.0 A climbs five times steeper than at 0.2 A — Faraday’s law, slope against slope.', hint: 'The fitted slope at each current should sit close to M·I/(z·F).' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-pink', title: 'First pink flash', icon: '✦', detail: 'Watched the first pink coat of copper appear on the nail.' },
  { id: 'faraday', title: 'Faraday follower', icon: '⚖', detail: 'Recorded a deposit mass within 5% of Faraday’s law prediction.' },
  { id: 'clip-swapper', title: 'Clip swapper', icon: '⇄', detail: 'Swapped the crocodile clips and reversed the plating direction.' },
  { id: 'sprint', title: '1 A sprint', icon: '⚡', detail: 'Plated 0.2 g of copper at a full amp.' },
  { id: 'full-plate', title: 'Full plate', icon: '◉', detail: 'Grew the deposit past 0.5 g — a serious coat of copper.' },
];

// ---- types ----------------------------------------------------------------------
interface TrialRow { id: number; t: number; current: number; polarity: 'plate' | 'strip'; mass: number; um: number }
interface UiSnap {
  t: number; charge: number; deposit: number; um: number; anodeLost: number;
  flowing: boolean; broken: boolean; needleA: number;
  polarity: 'normal' | 'reversed'; nailMode: NailMode; clipDrag: ClipId | null;
  balanceReading: number; balanceSettled: boolean; recordArmed: boolean;
}
interface Ion { x: number; y: number; ph: number; hot: number }
interface Bubble { x: number; y: number; r: number; vy: number; ph: number }
interface Ring { x: number; y: number; t: number; big: boolean }
interface Drip { x: number; y: number; vy: number }
interface Sparkle { x: number; y: number; t: number }
type NailMode = 'in' | 'drag' | 'return' | 'balance';
type ClipId = 'blue' | 'red';
type Electrode = 'nail' | 'strip';
interface ClipState { mode: 'attached' | 'drag' | 'return'; x: number; y: number; fx: number; fy: number; retT: number }
interface NailState { mode: NailMode; x: number; y: number; fx: number; fy: number; retT: number; target: 'home' | 'balance' }

interface SimState {
  t: number; // simulated seconds of actually carried current
  chargeC: number; // C — charge passed while the nail was negative (Faraday ledger)
  deposit: number; // g of copper on the nail
  stripMass: number; // g — the copper anode
  solutionCu: number; // g of copper(II) in the bath
  blueOn: Electrode; // which electrode the blue (negative) clip grips
  switchClosed: boolean;
  hasRun: boolean; humOn: boolean;
  acc: number; uiAcc: number; flow: number;
  needle: number; switchAnim: number;
  ions: Ion[]; bubbles: Bubble[]; rings: Ring[]; drips: Drip[]; sparkles: Sparkle[];
  spawnBubble: number; pingAcc: number; dripAcc: number; sparkAcc: number; lastSlide: number;
  nail: NailState;
  clipDrag: ClipId | null;
  clips: Record<ClipId, ClipState>;
  balanceT: number; balancePinged: boolean;
  pinkDone: boolean; fullDone: boolean; sprintDone: boolean; recordArmed: boolean;
  swapCount: number; stripped: number; gain1A: number; depositPeak: number;
  drainedWarned: boolean; liftedNote: boolean;
}

interface Geom {
  cw: number; ch: number; floorY: number;
  beakerL: number; beakerR: number; beakerT: number; beakerB: number; beakerW: number; beakerH: number; beakerCx: number;
  solY: number; bridgeY: number; termY: number; wireTopY: number;
  nailX: number; stripX: number; shankLen: number; coatLen: number;
  stripTop: number; stripLen: number; stripW: number;
  psuL: number; psuR: number; psuT: number; psuW: number;
  amX: number; amY: number; amR: number;
  swCx: number; swY: number;
  balCx: number; balT: number; balB: number; balW: number; panY: number; panRx: number;
}

const meta = getLabBySlug('copper-plating')!;

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const thicknessOf = (m: number) => m * MICRON_PER_G;
const coatPx = (m: number) => (m >= 0.004 ? clamp(m * COAT_PX_PER_G, 1.1, 14) : 0);
const polarityOf = (s: SimState): 'normal' | 'reversed' => (s.blueOn === 'nail' ? 'normal' : 'reversed');
const isFlowing = (s: SimState) =>
  s.switchClosed && s.nail.mode === 'in' && s.clips.blue.mode === 'attached' && s.clips.red.mode === 'attached';

const gauss = (x: number) => Math.exp(-x * x);
function noduleAt(u: number, tPx: number) {
  const amp = Math.min(2.6, tPx * 0.32);
  let sum = 0;
  for (const n of NODULES) sum += n.amp * gauss((u - n.u) * 9);
  return amp * sum * 0.5;
}

function nailHome(g: Geom) { return { x: g.nailX, y: g.bridgeY - 4 }; }
function balancePos(g: Geom) { return { x: g.balCx - g.panRx * 0.3, y: g.panY - 7 }; }
function termPos(attach: Electrode, s: SimState, g: Geom) {
  if (attach === 'strip') return { x: g.stripX, y: g.termY };
  const lying = s.nail.mode === 'balance';
  return { x: s.nail.x + (lying ? -8 : 0), y: s.nail.y - (lying ? 12 : 10) };
}
function clipAttach(id: ClipId, s: SimState): Electrode {
  return id === 'blue' ? s.blueOn : s.blueOn === 'nail' ? 'strip' : 'nail';
}
function getClipVisual(id: ClipId, s: SimState, g: Geom) {
  const c = s.clips[id];
  if (c.mode === 'attached') {
    const p = termPos(clipAttach(id, s), s, g);
    return { x: p.x, y: p.y, angle: Math.PI / 2 + (clipAttach(id, s) === 'nail' ? -0.38 : 0.38), open: false };
  }
  return { x: c.x, y: c.y, angle: Math.PI / 2, open: c.mode === 'drag' };
}
function balanceValue(t: number, m: number) {
  return clamp(m * (1 - Math.exp(-t * 3.4) * Math.cos(t * 7.2)), 0, m * 1.05);
}

export default function CopperPlatingLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef<SimState>({
    t: 0,
    chargeC: 0,
    deposit: 0,
    stripMass: STRIP_MASS0,
    solutionCu: SOLUTION_CU0,
    blueOn: 'nail',
    switchClosed: false,
    hasRun: false, humOn: false,
    acc: 0, uiAcc: 0, flow: 0,
    needle: 0, switchAnim: 0,
    ions: [], bubbles: [], rings: [], drips: [], sparkles: [],
    spawnBubble: 0, pingAcc: 0.9, dripAcc: 0, sparkAcc: 0, lastSlide: 0,
    nail: { mode: 'in', x: 0, y: 0, fx: 0, fy: 0, retT: 0, target: 'home' },
    clipDrag: null,
    clips: {
      blue: { mode: 'attached', x: 0, y: 0, fx: 0, fy: 0, retT: 0 },
      red: { mode: 'attached', x: 0, y: 0, fx: 0, fy: 0, retT: 0 },
    },
    balanceT: 0, balancePinged: false,
    pinkDone: false, fullDone: false, sprintDone: false, recordArmed: false,
    swapCount: 0, stripped: 0, gain1A: 0, depositPeak: 0,
    drainedWarned: false, liftedNote: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ------------------------------------------------------
  const [current, setCurrent] = useState(0.2);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    t: 0, charge: 0, deposit: 0, um: 0, anodeLost: 0,
    flowing: false, broken: false, needleA: 0,
    polarity: 'normal', nailMode: 'in', clipDrag: null,
    balanceReading: 0, balanceSettled: false, recordArmed: false,
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
    setUi({
      t: s.t,
      charge: s.chargeC,
      deposit: s.deposit,
      um: thicknessOf(s.deposit),
      anodeLost: STRIP_MASS0 - s.stripMass,
      flowing: isFlowing(s),
      broken: s.switchClosed && !isFlowing(s),
      needleA: s.needle * AM_FS,
      polarity: polarityOf(s),
      nailMode: s.nail.mode,
      clipDrag: s.clipDrag,
      balanceReading: s.nail.mode === 'balance' ? balanceValue(s.balanceT, s.deposit) : 0,
      balanceSettled: s.nail.mode === 'balance' && s.balanceT >= 1.25,
      recordArmed: s.recordArmed,
    });
  }, []);

  // ---- mentor completion flags -----------------------------------------------
  const distinctCurrents = new Set(rows.map((r) => r.current)).size;
  const done = [
    mentorAcked,
    hasRun,
    sim.current.depositPeak >= 0.05,
    rows.length >= 2,
    sim.current.swapCount >= 1 && sim.current.stripped >= 0.02,
    distinctCurrents >= 2 && sawGraph,
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
      case 'switch': return { target: 'switch', gesture: 'press', title: 'Close the switch', body: 'Set 0.2 A on the current selector, then close the knife switch — the button here or the brass lever on the bench.' };
      case 'watch': return { target: 'scene', gesture: 'point', title: 'Watch both electrodes', body: 'Pink copper creeps up the nail while the strip thins and pits. The Speed selector in the toolbar hurries the clock.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the line', body: 'Bank two or three rows — time, current, mass and thickness — so the mass–time graph has a slope to fit.' };
      case 'swap': return { target: 'swap', gesture: 'press', title: 'Swap the clips', body: 'Drag either crocodile clip to the other electrode — or press Swap here. Then close the switch and watch plating run backwards.' };
      case 'sprint': return { target: 'current', gesture: 'press', title: 'Run at 1.0 A', body: 'Select 1.0 A, plate and record again — then open Observations and compare the slopes of your two lines.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ------------------------------------------------------------------
  const geom = useCallback((): Geom => {
    const canvas = canvasRef.current;
    const cw = canvas?.clientWidth ?? 800;
    const ch = canvas?.clientHeight ?? 500;
    const floorY = ch - 22;
    const beakerW = clamp(cw * 0.34, 150, 260);
    const beakerH = clamp(ch * 0.58, 200, 300);
    const beakerB = floorY - 8;
    const beakerT = beakerB - beakerH;
    const beakerCx = cw * 0.52;
    const beakerL = beakerCx - beakerW / 2;
    const beakerR = beakerCx + beakerW / 2;
    const solY = beakerT + clamp(beakerH * 0.14, 18, 34);
    const bridgeY = beakerT - 4;
    const termY = bridgeY - 22;
    const wireTopY = Math.max(28, termY - 24);
    const nailX = beakerCx - beakerW * 0.22;
    const stripX = beakerCx + beakerW * 0.22;
    const shankLen = beakerB - 16 - bridgeY;
    const coatLen = bridgeY + shankLen - solY;
    const stripTop = bridgeY + 6;
    const stripLen = clamp(shankLen * 0.8, 60, 260);
    const stripW = clamp(beakerW * 0.07, 9, 18);
    const psuW = clamp(cw * 0.115, 56, 92);
    const psuL = clamp(cw * 0.03, 8, 26);
    const psuR = psuL + psuW;
    const psuT = floorY - 40;
    const amX = psuR + clamp(cw * 0.045, 24, 40);
    const amR = clamp(cw * 0.026, 13, 17);
    const amY = floorY - clamp(ch * 0.075, 26, 36);
    const swCx = amX + clamp(cw * 0.075, 58, 86);
    const swY = floorY - clamp(ch * 0.07, 24, 32);
    const balW = clamp(cw * 0.115, 56, 92);
    const balCx = cw - balW / 2 - clamp(cw * 0.03, 8, 22);
    const balB = floorY;
    const balT = floorY - 26;
    const panY = balT - 10;
    const panRx = balW * 0.36;
    return {
      cw, ch, floorY, beakerL, beakerR, beakerT, beakerB, beakerW, beakerH, beakerCx,
      solY, bridgeY, termY, wireTopY, nailX, stripX, shankLen, coatLen,
      stripTop, stripLen, stripW, psuL, psuR, psuT, psuW, amX, amY, amR, swCx, swY,
      balCx, balT, balB, balW, panY, panRx,
    };
  }, []);

  // ---- switch ---------------------------------------------------------------------
  const toggleSwitch = useCallback(() => {
    const s = sim.current;
    s.switchClosed = !s.switchClosed;
    setRunning(s.switchClosed);
    labSound.click();
    if (s.switchClosed && !(s.clips.blue.mode === 'attached' && s.clips.red.mode === 'attached' && s.nail.mode === 'in')) {
      labSound.warn();
      pushToast('warn', '⚠', 'The switch is closed but the circuit is incomplete — a clip is off its terminal, or the nail is out of the bath. Nothing flows yet.');
    }
    notePointer(true);
    syncUi();
  }, [notePointer, pushToast, syncUi]);

  // ---- clip swap (the polarity gesture) ----------------------------------------------
  const doSwap = useCallback(() => {
    const s = sim.current;
    // never re-wire while a lead or the nail is mid-gesture — the drag owns them
    if (s.clipDrag || s.nail.mode === 'drag') return;
    const g = geom();
    const wasNormal = s.blueOn === 'nail';
    if (s.switchClosed) {
      s.switchClosed = false;
      setRunning(false);
      labSound.click();
      labSound.warn();
      pushToast('warn', '⚠', 'You moved a live lead — the bench opened the switch for you. Close it again once both clips grip an electrode.');
    }
    for (const id of ['blue', 'red'] as ClipId[]) {
      const v = getClipVisual(id, s, g);
      s.clips[id].fx = v.x;
      s.clips[id].fy = v.y;
      s.clips[id].retT = 0;
      s.clips[id].mode = 'return';
    }
    s.blueOn = wasNormal ? 'strip' : 'nail';
    s.swapCount += 1;
    labSound.click();
    if (wasNormal) {
      earn('clip-swapper');
      pushToast('info', '⇄', 'Clips swapped — the nail is positive now. Close the switch and the pink deposit will dissolve back off while copper plates onto the strip.');
    } else {
      pushToast('good', '⇄', 'Clips swapped back — the nail is negative again: plating resumes onto the nail.');
    }
    notePointer(true);
    syncUi();
  }, [geom, earn, notePointer, pushToast, syncUi]);

  // ---- nail flights (balance trap + return) -------------------------------------------
  const sendNailTo = useCallback((target: 'home' | 'balance') => {
    const s = sim.current;
    s.nail.fx = s.nail.x;
    s.nail.fy = s.nail.y;
    s.nail.retT = 0;
    s.nail.target = target;
    s.nail.mode = 'return';
  }, []);

  // ---- physics -------------------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const g = geom();
    const flowing = isFlowing(s);
    // ions seed lazily — the geometry only exists once the canvas is mounted
    if (s.ions.length === 0) s.ions = makeIons(g);

    // mechanical animations (real time)
    s.switchAnim += ((s.switchClosed ? 1 : 0) - s.switchAnim) * Math.min(1, dt * 7);
    const iTarget = flowing ? current / AM_FS : 0;
    s.needle += (iTarget - s.needle) * Math.min(1, dt * 3.2);

    // hum ambience while current actually flows
    if (flowing && !s.humOn) { labSound.startLoop('hum'); s.humOn = true; }
    if (!flowing && s.humOn) { labSound.stopLoop(); s.humOn = false; }

    if (flowing && !s.hasRun) { s.hasRun = true; setHasRun(true); }

    // nail flight
    if (s.nail.mode === 'return') {
      s.nail.retT += dt / 0.4;
      const k = easeOut(Math.min(1, s.nail.retT));
      const dest = s.nail.target === 'balance' ? balancePos(g) : nailHome(g);
      s.nail.x = s.nail.fx + (dest.x - s.nail.fx) * k;
      s.nail.y = s.nail.fy + (dest.y - s.nail.fy) * k;
      if (s.nail.retT >= 1) {
        s.nail.x = dest.x;
        s.nail.y = dest.y;
        if (s.nail.target === 'balance') {
          s.nail.mode = 'balance';
          s.balanceT = 0;
          s.balancePinged = false;
          labSound.thunk(false);
        } else {
          s.nail.mode = 'in';
          s.rings.push({ x: g.nailX, y: g.solY, t: 0, big: true });
          labSound.slosh(0.45);
          labSound.glassClink(false);
        }
      }
    }

    // while parked in the bath the nail always hangs at its bridge notch —
    // re-anchoring every frame keeps it honest through window resizes
    if (s.nail.mode === 'in') {
      const home = nailHome(g);
      s.nail.x = home.x;
      s.nail.y = home.y;
    }

    // clip flights
    for (const id of ['blue', 'red'] as ClipId[]) {
      const c = s.clips[id];
      if (c.mode === 'return') {
        c.retT += dt / 0.3;
        const k = easeOut(Math.min(1, c.retT));
        const dest = termPos(clipAttach(id, s), s, g);
        c.x = c.fx + (dest.x - c.fx) * k;
        c.y = c.fy + (dest.y - c.fy) * k;
        if (c.retT >= 1) { c.mode = 'attached'; labSound.click(); }
      }
    }

    // balance settle
    if (s.nail.mode === 'balance') {
      s.balanceT += dt;
      if (!s.balancePinged && s.balanceT >= 1.25) { s.balancePinged = true; labSound.ping(980, 0.05); }
    }

    const dts = dt * speed;

    // electroplating — simulated time, fixed sub-steps, honest Faraday bookkeeping
    if (flowing) {
      s.acc += dts;
      const h = 1 / 120;
      const kG = K_G_PER_C * current;
      while (s.acc >= h) {
        s.acc -= h;
        s.t += h;
        const dm = kG * h;
        if (s.blueOn === 'nail') {
          // nail is the cathode: Cu²⁺ + 2e⁻ → Cu on the nail; the anode dissolves
          s.deposit += dm;
          s.stripMass -= dm;
          s.chargeC += current * h;
          if (current >= 1) s.gain1A += dm;
        } else {
          // reversed: the nail's deposit oxidises back off while the strip
          // plates up. The bath pays for whatever the bare nail cannot give
          // back — but never below zero copper, so mass stays conserved.
          const take = Math.min(s.deposit, dm);
          const fromBath = Math.max(0, Math.min(s.solutionCu, dm - take));
          s.deposit -= take;
          s.stripMass += take + fromBath;
          s.solutionCu -= fromBath;
          s.stripped += take;
        }
      }
      if (s.deposit > s.depositPeak) s.depositPeak = s.deposit;
      if (!s.recordArmed && s.deposit >= RECORD_MIN_MASS) s.recordArmed = true;

      if (!s.pinkDone && thicknessOf(s.deposit) >= PINK_UM) {
        s.pinkDone = true;
        earn('first-pink');
        pushToast('info', '✦', `First pink flash — a ${thicknessOf(s.deposit).toFixed(1)} µm coat of copper is settling over the nail. It thickens from here.`);
      }
      if (!s.fullDone && s.deposit >= FULL_PLATE) {
        s.fullDone = true;
        earn('full-plate');
        labSound.milestone();
        pushToast('good', '◉', 'Full plate — half a gram of copper on the nail. Faraday says that took about twenty-five sim-minutes at a full amp.');
      }
      if (!s.sprintDone && s.gain1A >= 0.2) { s.sprintDone = true; earn('sprint'); }

      // the bath can only give what the nail gives back — warn when it starts
      // paying the bill itself. The supply holds the current steady (that is
      // what a bench supply does), so the cost shows in the chemistry instead:
      // the blue fades as the bath's own Cu²⁺ runs down.
      if (!s.drainedWarned && s.solutionCu <= SOLUTION_CU0 - DRAIN_LIMIT) {
        s.drainedWarned = true;
        labSound.warn();
        pushToast('warn', '⚠', 'The nail is bare, so the bath itself is paying for the plating — the blue is fading as its copper(II) ions run low. Swap the clips back so the strip feeds the bath again, or reset for a fresh one.');
      }

      s.flow += dt * (30 + current * 70);

      // a whisper of hydrogen at the top current (current density on a small nail)
      s.spawnBubble += dts * Math.max(0, current - 0.75) * 6.5;
      while (s.spawnBubble >= 1) {
        s.spawnBubble -= 1;
        if (s.bubbles.length < 34) {
          const cx = s.blueOn === 'nail' ? g.nailX : g.stripX;
          const yTop = g.solY + 24;
          const yBot = s.blueOn === 'nail' ? g.bridgeY + g.shankLen - 12 : g.stripTop + g.stripLen - 10;
          s.bubbles.push({
            x: cx + (Math.random() - 0.5) * 14,
            y: yTop + Math.random() * Math.max(20, yBot - yTop),
            r: 1.2 + Math.random() * 1.1,
            vy: 46 + Math.random() * 30,
            ph: Math.random() * 6.28,
          });
        }
      }

      // glints where the copper is landing
      s.sparkAcc += dt;
      if (s.sparkAcc > 0.26 && s.deposit > 0.002) {
        s.sparkAcc = 0;
        if (s.sparkles.length < 7) {
          const cathX = s.blueOn === 'nail' ? g.nailX : g.stripX;
          const half = (s.blueOn === 'nail' ? 6 + coatPx(s.deposit) : g.stripW / 2 + 2);
          s.sparkles.push({
            x: cathX + (Math.random() < 0.5 ? -1 : 1) * (half + 1 + Math.random() * 3),
            y: g.solY + 14 + Math.random() * (g.coatLen * 0.8),
            t: 0,
          });
        }
      }
    }

    // ion migration — Cu²⁺ drifts to the cathode while current flows
    updateIons(s, g, flowing, current, dt);

    // bubbles rise and pop at the surface
    for (let i = s.bubbles.length - 1; i >= 0; i -= 1) {
      const b = s.bubbles[i];
      b.y -= b.vy * dts;
      b.ph += dts * 3;
      b.x += Math.sin(b.ph) * 8 * dts;
      if (b.y - b.r <= g.solY) {
        if (s.rings.length < 40) s.rings.push({ x: b.x, y: g.solY, t: 0, big: false });
        s.bubbles.splice(i, 1);
        s.pingAcc -= dt;
        if (s.pingAcc <= 0) {
          s.pingAcc = 0.7 + Math.random() * 0.6;
          labSound.ping(1300 + Math.random() * 700, 0.02);
        }
      }
    }

    // drips off a lifted nail
    if (s.nail.mode === 'drag') {
      const tip = { x: s.nail.x, y: s.nail.y + g.shankLen };
      if (tip.x > g.beakerL + 4 && tip.x < g.beakerR - 4 && tip.y < g.solY - 8) {
        s.dripAcc += dt;
        if (s.dripAcc > 0.3 && s.drips.length < 8) {
          s.dripAcc = 0;
          s.drips.push({ x: tip.x + (Math.random() - 0.5) * 8, y: tip.y, vy: 30 });
        }
      }
    }
    for (let i = s.drips.length - 1; i >= 0; i -= 1) {
      const d = s.drips[i];
      d.vy += 900 * dt;
      d.y += d.vy * dt;
      if (d.y >= g.solY) {
        if (s.rings.length < 40) s.rings.push({ x: d.x, y: g.solY, t: 0, big: false });
        s.drips.splice(i, 1);
      }
    }

    for (const r of s.rings) r.t += dt;
    s.rings = s.rings.filter((r) => r.t < (r.big ? 0.6 : 0.22));
    for (const sp of s.sparkles) sp.t += dt;
    s.sparkles = s.sparkles.filter((sp) => sp.t < 0.5);

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, current, geom, earn, pushToast, syncUi]);

  // ---- drawing -----------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const flowing = isFlowing(s);
    const tSec = performance.now() / 1000;

    drawBackground(ctx, w, h, g.floorY);
    drawBeakerBack(ctx, g, tSec, s.solutionCu / SOLUTION_CU0);

    // life inside the solution
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.beakerL + 5, g.solY + 3, g.beakerW - 10, g.beakerB - g.solY - 11);
    ctx.clip();
    drawIons(ctx, s.ions);
    drawBubbles(ctx, s.bubbles);
    ctx.restore();

    drawStrip(ctx, g, s);
    if (s.nail.mode === 'in') drawNail(ctx, g, s);
    drawBeakerFront(ctx, g, tSec);
    drawBridge(ctx, g);

    drawPSU(ctx, g, s, current, flowing, tSec);
    drawAmmeter(ctx, g, s.needle);
    drawKnifeSwitch(ctx, g, s.switchAnim);
    drawBalance(ctx, g, s, tSec);

    drawWires(ctx, g, s, flowing);

    for (const id of ['blue', 'red'] as ClipId[]) {
      const v = getClipVisual(id, s, g);
      drawClip(ctx, v.x, v.y, v.angle, id === 'blue' ? '#3b6fd4' : '#d24a35', v.open);
    }

    if (s.nail.mode !== 'in') drawNail(ctx, g, s);

    drawRings(ctx, s.rings);
    drawDrips(ctx, s.drips);
    drawSparkles(ctx, s.sparkles);

    // drag affordances
    const pulse = 0.5 + 0.3 * Math.sin(tSec * 6);
    if (s.nail.mode === 'drag') {
      ctx.strokeStyle = `rgba(249,115,22,${pulse * 0.9})`;
      ctx.lineWidth = 2.5;
      roundRect(ctx, g.beakerL - 4, g.beakerT - 12, g.beakerW + 8, 26, 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.balCx, g.panY, g.panRx + 10 + 2.5 * Math.sin(tSec * 6), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (s.clipDrag) {
      const dragged = s.clipDrag;
      const other: ClipId = dragged === 'blue' ? 'red' : 'blue';
      const ownTerm = termPos(clipAttach(dragged, s), s, g);
      const otherTerm = termPos(clipAttach(other, s), s, g);
      ctx.strokeStyle = `rgba(249,115,22,${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(otherTerm.x, otherTerm.y, 14 + 2.5 * Math.sin(tSec * 6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(120,140,160,${pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(ownTerm.x, ownTerm.y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [geom, current]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction -----------------------------------------------------------
  const clipAt = (px: number, py: number, g: Geom): ClipId | null => {
    const s = sim.current;
    for (const id of ['blue', 'red'] as ClipId[]) {
      const c = s.clips[id];
      if (c.mode !== 'attached') continue;
      const v = getClipVisual(id, s, g);
      if (Math.hypot(px - v.x, py - v.y) < 24) return id;
    }
    return null;
  };

  const nailAt = (px: number, py: number, g: Geom): boolean => {
    const s = sim.current;
    if (s.nail.mode === 'balance') {
      // lying on the balance pan — grabbable anywhere along its length so the
      // student can always drag it back into the bath (no touch dead-end)
      const len = g.shankLen + 4;
      return px > s.nail.x - len - 14 && px < s.nail.x + 26 && py > s.nail.y - 16 && py < g.floorY + 10;
    }
    if (s.nail.mode !== 'in') return false;
    const tipY = s.nail.y + g.shankLen;
    if (Math.abs(px - s.nail.x) < 30 && py > s.nail.y - 18 && py < tipY + 14) return true;
    return Math.hypot(px - s.nail.x, py - s.nail.y) < 28;
  };

  const overBalance = (px: number, py: number, g: Geom) =>
    Math.hypot(px - g.balCx, py - (g.panY - 4)) < g.panRx + 26;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();

    // knife switch
    if (Math.hypot(px - g.swCx, py - (g.swY - 10)) < 36) {
      toggleSwitch();
      return;
    }
    // crocodile clips
    const clip = clipAt(px, py, g);
    if (clip) {
      const v = getClipVisual(clip, s, g);
      if (s.switchClosed) {
        s.switchClosed = false;
        setRunning(false);
        labSound.click();
        labSound.warn();
        pushToast('warn', '⚠', 'You unclipped a live lead — the bench opened the switch for you. Drop the clip on either terminal, then close it again.');
      }
      s.clips[clip].x = v.x;
      s.clips[clip].y = v.y;
      s.clips[clip].mode = 'drag';
      s.clipDrag = clip;
      labSound.creak(0.5);
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      notePointer(true);
      syncUi();
      return;
    }
    // the nail (grabbable in the bath AND lying on the balance pan)
    if (nailAt(px, py, g)) {
      s.nail.fx = s.nail.x;
      s.nail.fy = s.nail.y;
      s.nail.mode = 'drag';
      labSound.creak(0.4);
      canvas.style.cursor = 'grabbing';
      if (!s.liftedNote && s.deposit > 0.004) {
        s.liftedNote = true;
        pushToast('info', '⇑', 'The nail is out — the circuit broke and the ammeter fell to zero. Dip it back in, or set it on the balance pan to weigh the coat.');
      }
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      notePointer(true);
      syncUi();
      return;
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
    const g = geom();
    const nowT = performance.now();

    if (s.clipDrag) {
      const c = s.clips[s.clipDrag];
      c.x = clamp(px, 20, g.cw - 20);
      c.y = clamp(py, 20, g.ch - 30);
      if (nowT - s.lastSlide > 110) {
        s.lastSlide = nowT;
        labSound.slide(0.3);
      }
      return;
    }
    if (s.nail.mode === 'drag') {
      s.nail.x = clamp(px, 30, g.cw - 30);
      s.nail.y = clamp(py, 30, g.ch - 60);
      if (nowT - s.lastSlide > 110) {
        s.lastSlide = nowT;
        labSound.slide(0.35);
      }
      return;
    }
    const overSwitch = Math.hypot(px - g.swCx, py - (g.swY - 10)) < 36;
    const grabbable = clipAt(px, py, g) !== null || nailAt(px, py, g);
    canvas.style.cursor = overSwitch ? 'pointer' : grabbable ? 'grab' : 'default';
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const s = sim.current;
    const g = geom();

    if (s.clipDrag) {
      const id = s.clipDrag;
      const c = s.clips[id];
      s.clipDrag = null;
      const own = clipAttach(id, s);
      const other: Electrode = own === 'nail' ? 'strip' : 'nail';
      const otherT = termPos(other, s, g);
      if (Math.hypot(c.x - otherT.x, c.y - otherT.y) < 34) {
        // dropped on the other electrode → the pair swap
        doSwap();
      } else {
        c.fx = c.x;
        c.fy = c.y;
        c.retT = 0;
        c.mode = 'return';
        labSound.slide(0.4);
      }
      try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (canvas) canvas.style.cursor = 'default';
      syncUi();
      return;
    }

    if (s.nail.mode === 'drag') {
      if (overBalance(s.nail.x, s.nail.y, g)) {
        sendNailTo('balance');
        pushToast('info', '⚖', 'On the balance — the reading settles in a moment. Set it against the anode-lost tile: a straight run loses exactly what the nail gains.');
      } else {
        sendNailTo('home');
      }
      try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (canvas) canvas.style.cursor = 'default';
      notePointer(true);
      syncUi();
    }
  };

  // ---- controls ---------------------------------------------------------------------
  const changeCurrent = (v: number) => {
    if (v === current) return;
    setCurrent(v);
    labSound.tick();
    notePointer(true);
  };

  const recordRow = () => {
    const s = sim.current;
    if (!s.recordArmed) return;
    const m = Math.round(s.deposit * 1000) / 1000;
    const row: TrialRow = {
      id: rows.length + 1,
      t: s.t,
      current,
      polarity: s.blueOn === 'nail' ? 'plate' : 'strip',
      mass: m,
      um: Math.round(thicknessOf(m) * 10) / 10,
    };
    setRows((cur) => [...cur, row]);
    labSound.tick();
    notePointer(true);
    // the law's prediction integrates the charge actually carried while the
    // nail was negative — honest through current changes and pauses alike
    const theory = K_G_PER_C * s.chargeC;
    if (row.polarity === 'plate' && theory >= 0.02 && Math.abs(m - theory) / theory <= 0.05) {
      earn('faraday');
      labSound.milestone();
      pushToast('good', '⚖', `Faraday follower — you recorded ${m.toFixed(3)} g against the law’s ${theory.toFixed(3)} g after ${s.chargeC.toFixed(0)} C of charge. That is the equation working underneath your coat of copper.`);
    } else {
      pushToast('info', '✎', `Recorded: ${m.toFixed(3)} g at ${row.current.toFixed(1)} A after ${fmtClock(row.t)} — thickness ${row.um.toFixed(1)} µm.`);
    }
  };

  const resetAll = () => {
    const s = sim.current;
    const g = geom();
    s.t = 0;
    s.chargeC = 0;
    s.deposit = 0;
    s.stripMass = STRIP_MASS0;
    s.solutionCu = SOLUTION_CU0;
    s.blueOn = 'nail';
    s.switchClosed = false;
    s.hasRun = false;
    s.humOn = false;
    s.acc = 0; s.uiAcc = 0; s.flow = 0;
    s.needle = 0; s.switchAnim = 0;
    s.bubbles = []; s.rings = []; s.drips = []; s.sparkles = [];
    s.spawnBubble = 0; s.pingAcc = 0.9; s.dripAcc = 0; s.sparkAcc = 0;
    const home = nailHome(g);
    s.nail = { mode: 'in', x: home.x, y: home.y, fx: home.x, fy: home.y, retT: 0, target: 'home' };
    s.clipDrag = null;
    s.clips.blue = { mode: 'attached', x: 0, y: 0, fx: 0, fy: 0, retT: 0 };
    s.clips.red = { mode: 'attached', x: 0, y: 0, fx: 0, fy: 0, retT: 0 };
    s.balanceT = 0; s.balancePinged = false;
    s.pinkDone = false; s.fullDone = false; s.sprintDone = false; s.recordArmed = false;
    s.swapCount = 0; s.stripped = 0; s.gain1A = 0; s.depositPeak = 0;
    s.drainedWarned = false; s.liftedNote = false;
    s.ions = makeIons(g);
    labSound.stopLoop();
    setRunning(false);
    setHasRun(false);
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setSawGraph(false);
    setBadges([]);
    syncUi();
  };

  // ---- analysis -----------------------------------------------------------------------
  const scoped = useMemo(
    () => rows.filter((r) => r.current === current && r.polarity === 'plate'),
    [rows, current],
  );
  const fit = useMemo(
    () => (scoped.length >= 2 ? linearFit(scoped.map((r) => ({ x: r.t, y: r.mass }))) : null),
    [scoped],
  );
  const theorySlopeH = K_G_PER_C * current * 3600; // g per sim-hour at the selected current
  // the law's prediction for the WHOLE run, honestly integrated from the charge
  // carried while the nail was negative — current changes and pauses keep the
  // books straight; only a reversed run parts the two
  const theoryNow = K_G_PER_C * ui.charge;
  const theoryDiff = theoryNow > 0.02 ? ((ui.deposit - theoryNow) / theoryNow) * 100 : null;

  // ---- coach -----------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (!mentorAcked) return { tone: 'info', line: 'An electroplating bench: an iron nail and a copper strip hang in blue copper(II) sulfate solution, wired through a current selector and a knife switch. The blue clip grips the nail — check the polarity before you close anything.' };
    if (ui.clipDrag) return { tone: 'warn', line: 'That lead is off — the circuit is broken. Drop the clip back on its terminal, or onto the other electrode: the pair swap, and the plating direction swaps with them.' };
    if (ui.nailMode === 'drag') return { tone: 'info', line: 'The nail is out of the bath — the ammeter fell to zero and plating pauses. Dip it back in, or set it on the balance pan to weigh the coat.' };
    if (ui.nailMode === 'balance') return { tone: 'good', line: `On the balance: ${ui.balanceReading.toFixed(3)} g of copper on the nail — in a straight run the anode has given up exactly as much. Drag the nail back into the bath (or press W) to keep plating.` };
    if (ui.polarity === 'reversed') return { tone: 'warn', line: 'Polarity reversed — the nail is the anode now, so its pink deposit dissolves back off while copper plates onto the strip. Plating always follows the negative electrode.' };
    if (!hasRun) return { tone: 'info', line: 'Set 0.2 A and close the knife switch — the brass lever on the bench or the big button. Copper drifts to the nail the moment current flows.' };
    if (ui.broken) return { tone: 'warn', line: 'The switch is closed but nothing flows — a clip is off its terminal, or the nail is out of the bath. Complete the circuit and the ammeter wakes up.' };
    if (!ui.flowing && hasRun) return { tone: 'info', line: 'Switch open — the deposit holds exactly where it is. Close it to keep plating, or record what you have.' };
    if (current >= 1) return { tone: 'info', line: 'A full amp stacks copper five times faster than 0.2 A — and a whisper of hydrogen fizzles off the nail. Real benches keep the current gentle for the smoothest coat.' };
    if (ui.deposit < 0.01) return { tone: 'info', line: 'Current flowing — copper(II) ions drift across the bath to the nail. The first pink flash takes a couple of sim-minutes; the Speed selector hurries the clock.' };
    if (rows.length < 2) return { tone: 'good', line: `Coat growing: ${ui.deposit.toFixed(3)} g, ${ui.um.toFixed(1)} µm thick — and the anode has given up exactly as much. Record a row or two for your line.` };
    if (!sawGraph && distinctCurrents < 2) return { tone: 'good', line: 'Your mass line has points on it — record another at a different current, then open Observations and compare slopes.' };
    return { tone: 'good', line: `Nicely plated: ${ui.deposit.toFixed(3)} g and climbing straight as Faraday promised. Swap the clips, weigh the nail, or chase the full 0.5 g coat.` };
  }, [mentorAcked, ui, hasRun, current, rows.length, distinctCurrents, sawGraph]);

  // ---- status ------------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Experiment complete'
    : ui.nailMode === 'balance' ? 'Weighing the deposit'
    : ui.clipDrag || ui.nailMode === 'drag' ? 'Circuit broken — apparatus moved'
    : ui.flowing ? (ui.polarity === 'reversed' ? 'Stripping — polarity reversed' : 'Electroplating…')
    : hasRun ? 'Switch open — deposit held'
    : 'Bench ready';
  const onBalance = ui.nailMode === 'balance';

  // ---- render ------------------------------------------------------------------------------
  const livePoint = ui.flowing && ui.polarity === 'normal'
    ? { x: Math.round(ui.t * 10) / 10, y: Math.round(ui.deposit * 1000) / 1000 }
    : null;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.flowing ? 'active' : 'ready'}
      captionChip="Electroplating bench"
      legend={[
        { color: '#e8a87c', label: 'Copper deposit (pink)' },
        { color: '#b87333', label: 'Copper anode (+)' },
        { color: '#8f9aa6', label: 'Iron nail (cathode −)' },
        { color: '#3b6fd4', label: 'Negative lead & clip' },
        { color: '#d24a35', label: 'Positive lead & clip' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — the cell is wired', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <label>Speed
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Time speed">
            <option value={1}>1× real time</option>
            <option value={4}>4× faster</option>
            <option value={16}>16× fastest</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Electroplating bench — press Space to close or open the switch, drag a crocodile clip to the other electrode to swap polarity, drag the nail out to weigh it on the balance"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); toggleSwitch(); }
            else if ((e.key === 's' || e.key === 'S') && !e.repeat) { e.preventDefault(); doSwap(); }
            else if ((e.key === 'w' || e.key === 'W') && !e.repeat) {
              e.preventDefault();
              const s = sim.current;
              if (s.nail.mode === 'in') sendNailTo('balance');
              else if (s.nail.mode === 'balance') sendNailTo('home');
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
          <div className="cp-top-row">
            <button
              className="action-button"
              type="button"
              data-nudge="switch"
              aria-pressed={running}
              onClick={toggleSwitch}
            >
              <span className="dispense-icon" aria-hidden="true">⏻</span>
              <span>{running ? 'Open the switch' : 'Close the switch'}</span>
              <small>{running ? (ui.polarity === 'reversed' ? 'current on — deposit dissolving' : 'current on — deposit growing') : 'or click the brass lever on the bench'}</small>
            </button>
            <div className="stopwatch">
              <span>PLATING TIME · SIMULATED</span>
              <strong className={ui.flowing ? 'running' : ''}>{fmtClock(ui.t)}</strong>
              <div className="count-line">
                <span>{(ui.deposit * 1000).toFixed(0)} mg of the 500 mg full plate</span>
                <div><span style={{ width: `${Math.min(100, (ui.deposit / FULL_PLATE) * 100)}%` }} /></div>
              </div>
            </div>
          </div>
          <div className="cp-live-row">
            <div className="cp-live"><span>DEPOSIT ON NAIL</span><strong className="pink">{ui.deposit.toFixed(3)}<small>g</small></strong></div>
            <div className="cp-live"><span>COAT THICKNESS</span><strong>{ui.um.toFixed(1)}<small>µm</small></strong></div>
            <div className="cp-live"><span>ANODE LOST</span><strong>{ui.anodeLost.toFixed(3)}<small>g</small></strong></div>
            <div className="cp-live"><span>AMMETER</span><strong>{ui.needleA.toFixed(2)}<small>A</small></strong></div>
          </div>
          <div className="current-toggle" data-nudge="current" role="group" aria-label="Plating current">
            {CURRENT_OPTIONS.map((i) => (
              <button
                key={i}
                type="button"
                className={`seg${current === i ? ' on' : ''}`}
                aria-pressed={current === i}
                onClick={() => changeCurrent(i)}
              >
                <span className="seg-title">{i.toFixed(1)} A</span>
                <span className="seg-sub">{(K_G_PER_C * i * 3600).toFixed(2)} g per sim-hour</span>
              </button>
            ))}
          </div>
          <div className="cp-clip-row">
            <button
              className="clip-button"
              type="button"
              data-nudge="swap"
              onClick={doSwap}
            >
              <span>⇄ Swap the crocodile clips</span>
              <small>drag a clip on the bench — or press here (S)</small>
            </button>
            <div className="balance-card">
              <span>DIGITAL BALANCE · NAIL TARED</span>
              <strong className={onBalance ? 'on' : ''}>
                {onBalance ? <>{ui.balanceReading.toFixed(3)} <small>g of copper</small></> : <small className="balance-idle">drag the nail onto the pan to weigh it</small>}
              </strong>
              <em className={onBalance ? (ui.balanceSettled ? 'settled' : 'settling') : ''}>
                {onBalance ? (ui.balanceSettled ? 'reading stable' : 'settling…') : 'ready — zeroed'}
              </em>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Plating follows the negative electrode: copper leaves the anode and coats the cathode, gram for gram. Drag the nail out mid-run — the balance weighs the coat while the bench holds its books. Space closes the switch · S swaps the clips · W weighs the nail.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRow(); notePointer(true); }}
            disabled={!ui.recordArmed}
          >
            {ui.recordArmed
              ? `✎ Record — ${fmtClock(ui.t)} · ${current.toFixed(1)} A · ${ui.deposit.toFixed(3)} g`
              : 'Record unlocks once the deposit passes 0.02 g'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Plating readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Deposit on the nail · cathode when normal</span>
            <strong>{ui.deposit.toFixed(3)} <small>g</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (ui.deposit / 0.6) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0 g</span><span>0.5 g — full plate</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Coat thickness</span><strong>{ui.um.toFixed(1)} <small>µm</small></strong></div>
            <div><span>Selected current</span><strong>{current.toFixed(1)} <small>A</small></strong></div>
            <div><span>Anode lost (−gained)</span><strong>{ui.anodeLost.toFixed(3)} <small>g</small></strong></div>
            <div><span>Plating time</span><strong>{fmtClock(ui.t)}</strong></div>
            <div><span>Charge passed (Q)</span><strong>{ui.charge.toFixed(0)} <small>C</small></strong></div>
            <div><span>Nail polarity</span><strong>{ui.polarity === 'normal' ? 'cathode (−)' : 'anode (+)'}</strong></div>
          </div>
          <div className="faraday-readout">
            <span>Faraday check · m = M·I·t / (z·F)</span>
            <strong>{theoryNow.toFixed(3)} <small>g predicted</small></strong>
            <p>with M = 63.5 g/mol, z = 2 and F = 96 485 C/mol. Your bench has carried {ui.charge.toFixed(0)} C of charge through the bath while the nail was negative, which the law turns into {theoryNow.toFixed(3)} g of copper — and the nail holds {ui.deposit.toFixed(3)} g{theoryDiff !== null && Math.abs(theoryDiff) >= 0.1 ? ` (${theoryDiff >= 0 ? '+' : ''}${theoryDiff.toFixed(1)}%)` : ''}. Change the current or pause mid-run and the charge ledger still keeps the books straight; only a reversed run strips mass back off the nail, and the gap below the prediction is exactly what it took.</p>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Check the wiring: the blue clip from the negative terminal grips the nail, the red clip grips the copper strip.</li>
              <li>Set 0.2 A and close the knife switch — pink copper starts creeping over the nail.</li>
              <li>Watch both electrodes: the deposit thickens while the strip thins and pits, and the blue of the bath holds.</li>
              <li>Record a few rows — time, current, mass, thickness — and watch the mass–time line climb.</li>
              <li>Drag a crocodile clip to the other electrode to swap the polarity, then close the switch and watch the plating reverse.</li>
              <li>Run at 1.0 A, record again, and compare the slopes of your two lines in Observations.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Plating is honestly slow — at 0.2 A a full sim-hour lays down barely a quarter of a gram. Use the Speed selector (up to 16×) to hurry the clock; the chemistry never changes, only your patience does.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Close the switch and let the deposit pass 0.02 g — then record your first row. Two or three rows at one current give the graph a slope worth fitting.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>time</th><th>current</th><th>mass (g)</th><th>thickness (µm)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{fmtClock(r.t)}</td>
                      <td>{r.current.toFixed(1)} A</td>
                      <td>{r.mass.toFixed(3)}{r.polarity === 'strip' ? ' ▼' : ''}</td>
                      <td>{r.um.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 1 && (
              <>
                <h3 style={{ marginTop: 16 }}>Deposit mass–time graph · {current.toFixed(1)} A runs</h3>
                <Plot
                  points={scoped.map((r) => ({ x: r.t, y: r.mass }))}
                  xLabel="time (s)"
                  yLabel="deposit mass (g)"
                  fitLine
                  livePoint={livePoint}
                  height={220}
                />
                <p className="observation-note">The graph plots your rows recorded at {current.toFixed(1)} A; the orange dot is the live bench. Rows taken while the clips were swapped (marked ▼ in the table) sit the fit out — their slope runs the wrong way.</p>
                {fit && (
                  <p className="observation-note">Your line at {current.toFixed(1)} A: slope = {(fit.m * 3600).toFixed(3)} g per sim-hour (R² = {fit.r2.toFixed(4)}), against Faraday’s {theorySlopeH.toFixed(3)} g per sim-hour — M·I/(z·F) with M = 63.5 and z = 2. Switch the selector to another current and the same graph tells a proportionally flatter or steeper story.</p>
                )}
              </>
            )}
            <p className="observation-note">Every mass in this table is what the balance would read at the moment you pressed record — rounded to the milligram, nothing fed from the formula. At 0.2 A the law promises 0.237 g per sim-hour, at 0.5 A 0.592 g, and at a full amp 1.185 g: your slopes should sit close to all three.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>The bath is copper(II) sulfate solution: blue, and packed with Cu²⁺ ions. Make an iron nail the cathode and those ions drift to it, collect two electrons each, and lock on as metal:</p>
            <div className="equation">Cathode (−): Cu²⁺(aq) + 2e⁻ → Cu(s)</div>
            <p>At the same time the copper anode gives those electrons up, dissolving ion by ion — which is why the strip thins and pits while the nail fattens:</p>
            <div className="equation">Anode (+): Cu(s) → Cu²⁺(aq) + 2e⁻</div>
            <p>The anode replenishes the bath exactly as fast as the cathode drains it, so the blue never fades — and because the iron is the cathode, it never oxidises: the current protects it while the coat builds.</p>
            <p>The amounts are pure Faraday. Charge delivered is metal delivered:</p>
            <div className="equation">m = M · I · t / (z · F)</div>
            <p>with M = 63.5 g/mol, z = 2 electrons per ion and F = 96 485 C/mol. At one amp that is 1.185 g of copper per sim-hour — a straight mass–time line whose slope is proportional to the current. Divide the mass by copper’s density and the plated area and the line reads as thickness too: 0.5 g over the nail’s 3.9 cm² is a coat about 143 µm thick.</p>
            <p>Reverse the polarity and every arrow flips: the nail becomes the anode, its pink coat dissolves back off, and the strip — now the cathode — plates up. Plating direction is decided by nothing but which electrode is negative.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && distinctCurrents >= 2) setSawGraph(true); }}
    />
  );
}

// ---- module-level helpers: ions ---------------------------------------------------

function makeIons(g: Geom): Ion[] {
  const ions: Ion[] = [];
  const x0 = g.beakerL + 10;
  const x1 = g.beakerR - 10;
  const y0 = g.solY + 12;
  const y1 = g.beakerB - 14;
  for (let i = 0; i < 26; i += 1) {
    ions.push({
      x: x0 + Math.random() * (x1 - x0),
      y: y0 + Math.random() * (y1 - y0),
      ph: Math.random() * 6.28,
      hot: 0,
    });
  }
  return ions;
}

function updateIons(s: SimState, g: Geom, flowing: boolean, cur: number, dt: number) {
  const cathX = s.blueOn === 'nail' ? g.nailX : g.stripX;
  const anodeX = s.blueOn === 'nail' ? g.stripX : g.nailX;
  const x0 = g.beakerL + 10;
  const x1 = g.beakerR - 10;
  const y0 = g.solY + 12;
  const y1 = g.beakerB - 14;
  for (const ion of s.ions) {
    ion.ph += dt * 2;
    if (flowing) {
      const dir = Math.sign(cathX - ion.x) || 1;
      ion.x += dir * (7 + cur * 26) * dt;
      ion.x += Math.sin(ion.ph * 2.2) * 10 * dt;
      if (Math.abs(ion.x - cathX) < 10) ion.hot = Math.min(1, ion.hot + dt * 2.4);
    } else {
      ion.x += Math.sin(ion.ph * 1.3) * 7 * dt;
      ion.hot = Math.max(0, ion.hot - dt);
    }
    ion.y += Math.cos(ion.ph * 1.7) * 7 * dt;
    if (ion.hot >= 1 || ion.x <= x0 || ion.x >= x1 || ion.y <= y0 || ion.y >= y1) {
      ion.x = anodeX + (Math.random() - 0.5) * 18;
      ion.y = y0 + Math.random() * (y1 - y0);
      ion.hot = 0;
      ion.ph = Math.random() * 6.28;
    }
    ion.x = clamp(ion.x, x0, x1);
    ion.y = clamp(ion.y, y0, y1);
  }
}

// ---- module-level drawing helpers ---------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, floorY: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#eef2f6');
  bg.addColorStop(1, '#e2e8ee');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c9d2db';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, floorY);
  ctx.lineTo(w, floorY);
  ctx.stroke();
  ctx.strokeStyle = '#dde4ea';
  ctx.lineWidth = 1;
  for (let x = 8; x < w; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, floorY);
    ctx.lineTo(x - 10, floorY + 10);
    ctx.stroke();
  }
}

function drawBeakerBack(ctx: CanvasRenderingContext2D, g: Geom, tSec: number, sat: number) {
  // soft shadow under the beaker
  ctx.fillStyle = 'rgba(23,35,52,0.07)';
  ctx.beginPath();
  ctx.ellipse(g.beakerCx, g.beakerB + 5, g.beakerW * 0.55, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // back wall
  ctx.fillStyle = 'rgba(224,237,244,0.4)';
  roundRect(ctx, g.beakerL, g.beakerT, g.beakerW, g.beakerH, 14);
  ctx.fill();
  // solution — blue copper(II) sulfate, saturation honest to the Cu²⁺ left
  const alpha = 0.2 + 0.65 * sat;
  const sol = ctx.createLinearGradient(0, g.solY, 0, g.beakerB);
  sol.addColorStop(0, `rgba(96,160,214,${alpha})`);
  sol.addColorStop(1, `rgba(40,94,156,${Math.min(0.92, alpha + 0.15)})`);
  ctx.fillStyle = sol;
  ctx.beginPath();
  ctx.moveTo(g.beakerL + 4, g.solY);
  ctx.lineTo(g.beakerR - 4, g.solY);
  ctx.lineTo(g.beakerR - 4, g.beakerB - 12);
  ctx.quadraticCurveTo(g.beakerR - 4, g.beakerB - 3, g.beakerR - 15, g.beakerB - 3);
  ctx.lineTo(g.beakerL + 15, g.beakerB - 3);
  ctx.quadraticCurveTo(g.beakerL + 4, g.beakerB - 3, g.beakerL + 4, g.beakerB - 12);
  ctx.closePath();
  ctx.fill();
  // meniscus + shimmer
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let x = g.beakerL + 6; x <= g.beakerR - 6; x += 6) {
    const y = g.solY + Math.sin(x * 0.09 + tSec * 1.2) * 1.4;
    if (x === g.beakerL + 6) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // drifting glints
  for (let i = 0; i < 2; i += 1) {
    const gx = g.beakerL + 24 + ((tSec * (7 + i * 4) + i * 130) % (g.beakerW - 48));
    const gy = g.solY + 26 + i * 34;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, 16, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBeakerFront(ctx: CanvasRenderingContext2D, g: Geom, tSec: number) {
  // graduations (ticks only — readings live in the side panel)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 7; i += 1) {
    const y = g.beakerT + (g.beakerH * i) / 8;
    const long = i % 2 === 0;
    ctx.beginPath();
    ctx.moveTo(g.beakerL + 4, y);
    ctx.lineTo(g.beakerL + 4 + (long ? 12 : 6), y);
    ctx.stroke();
  }
  // glass front sheen
  const sheen = ctx.createLinearGradient(g.beakerL, 0, g.beakerL + g.beakerW * 0.45, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRect(ctx, g.beakerL + 2, g.solY, g.beakerW * 0.45, g.beakerH - (g.solY - g.beakerT) - 6, 10);
  ctx.fill();
  // walls
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.beakerL, g.beakerT);
  ctx.lineTo(g.beakerL, g.beakerB - 12);
  ctx.quadraticCurveTo(g.beakerL, g.beakerB, g.beakerL + 14, g.beakerB);
  ctx.lineTo(g.beakerR - 14, g.beakerB);
  ctx.quadraticCurveTo(g.beakerR, g.beakerB, g.beakerR, g.beakerB - 12);
  ctx.lineTo(g.beakerR, g.beakerT);
  ctx.stroke();
  // rim line + spout
  ctx.strokeStyle = '#9db7c7';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(g.beakerL - 2, g.beakerT);
  ctx.lineTo(g.beakerR + 2, g.beakerT);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(g.beakerL - 1, g.beakerT - 1);
  ctx.quadraticCurveTo(g.beakerL - 10, g.beakerT - 6, g.beakerL - 2, g.beakerT - 9);
  ctx.stroke();
  // a live highlight on the right wall
  ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.15 * Math.sin(tSec * 1.7)})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(g.beakerR - 5, g.solY + 16);
  ctx.lineTo(g.beakerR - 5, g.beakerB - 26);
  ctx.stroke();
}

function drawBridge(ctx: CanvasRenderingContext2D, g: Geom) {
  // wooden bridge across the mouth, with notches the electrodes pass through
  const segs: [number, number][] = [
    [g.beakerL - 12, g.nailX - 10],
    [g.nailX + 10, g.stripX - 9],
    [g.stripX + 9, g.beakerR + 12],
  ];
  const wood = ctx.createLinearGradient(0, g.bridgeY - 6, 0, g.bridgeY + 5);
  wood.addColorStop(0, '#c9a06a');
  wood.addColorStop(1, '#a87f4e');
  for (const [x0, x1] of segs) {
    ctx.fillStyle = wood;
    roundRect(ctx, x0, g.bridgeY - 6, x1 - x0, 11, 3);
    ctx.fill();
    ctx.strokeStyle = '#8a6a44';
    ctx.lineWidth = 1;
    roundRect(ctx, x0, g.bridgeY - 6, x1 - x0, 11, 3);
    ctx.stroke();
  }
  // notch edge pins
  ctx.fillStyle = '#6e5233';
  for (const x of [g.nailX - 11, g.nailX + 11, g.stripX - 10, g.stripX + 10]) {
    ctx.beginPath();
    ctx.arc(x, g.bridgeY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStrip(ctx: CanvasRenderingContext2D, g: Geom, s: SimState) {
  const frac = clamp(s.stripMass / STRIP_MASS0, 0, 1.25);
  const w = g.stripW * (0.62 + 0.38 * Math.min(1, frac)) + Math.max(0, Math.min(5, (s.stripMass - STRIP_MASS0) * 20));
  const x = g.stripX;
  const top = g.stripTop;
  const bot = top + g.stripLen;
  // hook flange resting on the bridge
  ctx.fillStyle = '#c97b45';
  roundRect(ctx, x - w / 2 - 6, g.bridgeY - 5, w + 12, 7, 2);
  ctx.fill();
  ctx.strokeStyle = '#7e4525';
  ctx.lineWidth = 1;
  roundRect(ctx, x - w / 2 - 6, g.bridgeY - 5, w + 12, 7, 2);
  ctx.stroke();
  // body
  const body = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  body.addColorStop(0, '#a96134');
  body.addColorStop(0.45, '#e29a5e');
  body.addColorStop(1, '#9c5a30');
  ctx.fillStyle = body;
  roundRect(ctx, x - w / 2, top, w, g.stripLen, 3);
  ctx.fill();
  ctx.strokeStyle = '#7e4525';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x - w / 2, top, w, g.stripLen, 3);
  ctx.stroke();
  // pitting — dissolution eats the anode unevenly
  const lost = Math.max(0, STRIP_MASS0 - s.stripMass);
  if (lost > 0.004) {
    const ps = clamp(lost / 0.25, 0, 1.3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - w / 2, top, w, g.stripLen);
    ctx.clip();
    for (const p of PITS) {
      const py = top + p.v * g.stripLen;
      const px = x + p.side * (w / 2 + 1);
      ctx.fillStyle = 'rgba(94,52,26,0.55)';
      ctx.beginPath();
      ctx.arc(px, py, 1 + 3.2 * p.size * ps, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // plated coat when the strip is the cathode
  const excess = Math.max(0, s.stripMass - STRIP_MASS0);
  if (excess > 0.003) {
    const T = clamp(excess * COAT_PX_PER_G, 1, 6);
    const coat = ctx.createLinearGradient(x - w / 2 - T, 0, x + w / 2 + T, 0);
    coat.addColorStop(0, '#cf7847');
    coat.addColorStop(0.5, '#f2b48c');
    coat.addColorStop(1, '#cf7847');
    ctx.fillStyle = coat;
    roundRect(ctx, x - w / 2 - T, g.solY - 2, w + T * 2, bot - g.solY + 4, 4);
    ctx.fill();
    ctx.strokeStyle = '#a05a36';
    ctx.lineWidth = 1;
    roundRect(ctx, x - w / 2 - T, g.solY - 2, w + T * 2, bot - g.solY + 4, 4);
    ctx.stroke();
  }
}

function drawNail(ctx: CanvasRenderingContext2D, g: Geom, s: SimState) {
  const lying = s.nail.mode === 'balance';
  ctx.save();
  ctx.translate(s.nail.x, s.nail.y);
  if (lying) {
    // lie flat: head resting on the pan, tip reaching down to the bench line
    // (computed from the geometry so the whole nail stays on the canvas)
    const len = g.shankLen + 4;
    const lie = Math.acos(clamp((g.floorY - 6 - s.nail.y) / len, -1, 1));
    ctx.rotate(lie);
  }
  // drop shadow
  ctx.strokeStyle = 'rgba(23,35,52,0.13)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(0, g.shankLen);
  ctx.stroke();
  // head
  const head = ctx.createLinearGradient(-11, 0, 11, 0);
  head.addColorStop(0, '#98a3af');
  head.addColorStop(0.5, '#c1cad4');
  head.addColorStop(1, '#8a95a1');
  ctx.fillStyle = head;
  roundRect(ctx, -11, -4, 22, 8, 3);
  ctx.fill();
  ctx.strokeStyle = '#5b6672';
  ctx.lineWidth = 1.4;
  roundRect(ctx, -11, -4, 22, 8, 3);
  ctx.stroke();
  // shank
  const tip = g.shankLen + 4;
  const w0 = 6;
  const w1 = 2.2;
  ctx.beginPath();
  ctx.moveTo(-w0, 4);
  ctx.lineTo(-w1, tip - 8);
  ctx.lineTo(0, tip);
  ctx.lineTo(w1, tip - 8);
  ctx.lineTo(w0, 4);
  ctx.closePath();
  const iron = ctx.createLinearGradient(-6, 0, 6, 0);
  iron.addColorStop(0, '#8a95a1');
  iron.addColorStop(0.45, '#b7c1cc');
  iron.addColorStop(1, '#7c8794');
  ctx.fillStyle = iron;
  ctx.fill();
  ctx.strokeStyle = '#5b6672';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // copper coat — creeps up from the tip, then thickens, matte and nodular
  const m = s.deposit;
  if (m > 0.003) {
    const T = coatPx(m);
    const lenNow = Math.max(6, g.coatLen * clamp(m / COAT_SPREAD_G, 0, 1));
    const top = tip - lenNow;
    const halfAt = (v: number) => w0 + (w1 - w0) * clamp((v - 4) / Math.max(1, g.shankLen), 0, 1);
    ctx.beginPath();
    const steps = 14;
    for (let i = 0; i <= steps; i += 1) {
      const v = top + (lenNow * i) / steps;
      const u = i / steps;
      const half = halfAt(v) + T * (0.92 + 0.3 * u) + noduleAt(u, T);
      if (i === 0) ctx.moveTo(half, v); else ctx.lineTo(half, v);
    }
    ctx.lineTo(0, tip + T * 0.7);
    for (let i = steps; i >= 0; i -= 1) {
      const v = top + (lenNow * i) / steps;
      const u = i / steps;
      const half = halfAt(v) + T * (0.92 + 0.3 * u) + noduleAt(u, T);
      ctx.lineTo(-half, v);
    }
    ctx.closePath();
    const coat = ctx.createLinearGradient(0, top, 0, tip);
    coat.addColorStop(0, '#f2b48c');
    coat.addColorStop(1, '#cf7847');
    ctx.fillStyle = coat;
    ctx.fill();
    ctx.strokeStyle = '#a05a36';
    ctx.lineWidth = 1;
    ctx.stroke();
    // matte speckles once the coat has body
    if (T > 2) {
      ctx.fillStyle = 'rgba(160,90,54,0.32)';
      for (const sp of SPECKLES) {
        const v = top + lenNow * sp.u;
        const half = halfAt(v) + T * 0.8;
        ctx.beginPath();
        ctx.arc(sp.side * half, v, 1 + T * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawPSU(ctx: CanvasRenderingContext2D, g: Geom, s: SimState, cur: number, flowing: boolean, tSec: number) {
  // body
  const body = ctx.createLinearGradient(0, g.psuT, 0, g.floorY);
  body.addColorStop(0, '#435062');
  body.addColorStop(1, '#313d4d');
  ctx.fillStyle = body;
  roundRect(ctx, g.psuL, g.psuT, g.psuW, g.floorY - g.psuT, 7);
  ctx.fill();
  ctx.strokeStyle = '#242e3c';
  ctx.lineWidth = 1.5;
  roundRect(ctx, g.psuL, g.psuT, g.psuW, g.floorY - g.psuT, 7);
  ctx.stroke();
  // vents
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(g.psuL + 8, g.psuT + 10 + i * 6);
    ctx.lineTo(g.psuL + g.psuW * 0.34, g.psuT + 10 + i * 6);
    ctx.stroke();
  }
  // terminal posts: negative (blue) left, positive (red) right
  const negX = g.psuL + g.psuW * 0.3;
  const posX = g.psuL + g.psuW * 0.7;
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, negX - 4.5, g.psuT - 7, 9, 9, 2);
  ctx.fill();
  roundRect(ctx, posX - 4.5, g.psuT - 7, 9, 9, 2);
  ctx.fill();
  ctx.fillStyle = '#3b6fd4';
  roundRect(ctx, negX - 3, g.psuT - 9, 6, 6, 2);
  ctx.fill();
  ctx.fillStyle = '#d24a35';
  roundRect(ctx, posX - 3, g.psuT - 9, 6, 6, 2);
  ctx.fill();
  // dial — the needle mirrors the selected current (jitters while working)
  const dx = g.psuL + g.psuW * 0.76;
  const dy = g.psuT + (g.floorY - g.psuT) * 0.62;
  const dr = Math.min(10, g.psuW * 0.14);
  ctx.fillStyle = '#f1f4f7';
  ctx.beginPath();
  ctx.arc(dx, dy, dr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(dx, dy, dr + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#98a4b0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const a = (-125 + (i * 70) / 4) * (Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(dx + Math.cos(a) * (dr - 3), dy + Math.sin(a) * (dr - 3));
    ctx.lineTo(dx + Math.cos(a) * dr, dy + Math.sin(a) * dr);
    ctx.stroke();
  }
  const frac = clamp((cur - 0.2) / 0.8, 0, 1);
  const jitter = flowing ? Math.sin(tSec * 37) * 0.03 : 0;
  const na = (-125 + frac * 70) * (Math.PI / 180) + jitter;
  ctx.strokeStyle = '#e8632a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(dx, dy);
  ctx.lineTo(dx + Math.cos(na) * dr * 0.8, dy + Math.sin(na) * dr * 0.8);
  ctx.stroke();
  // power LED
  ctx.fillStyle = s.switchClosed ? `rgba(52,199,89,${0.75 + 0.25 * Math.sin(tSec * 4)})` : 'rgba(120,140,160,0.4)';
  ctx.beginPath();
  ctx.arc(g.psuL + g.psuW * 0.44, g.psuT + (g.floorY - g.psuT) * 0.62, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawAmmeter(ctx: CanvasRenderingContext2D, g: Geom, u: number) {
  const { amX, amY, amR } = g;
  ctx.fillStyle = '#fdfefe';
  ctx.strokeStyle = '#172334';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(amX, amY, amR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(amX, amY, amR + 3, 0, Math.PI * 2);
  ctx.stroke();
  const pivot = { x: amX, y: amY + amR * 0.42 };
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

function drawKnifeSwitch(ctx: CanvasRenderingContext2D, g: Geom, anim: number) {
  const closed = anim >= 0.95;
  ctx.fillStyle = '#435062';
  roundRect(ctx, g.swCx - 36, g.swY + 2, 72, 12, 4);
  ctx.fill();
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, g.swCx - 30, g.swY - 12, 7, 16, 2);
  ctx.fill();
  roundRect(ctx, g.swCx + 23, g.swY - 12, 7, 16, 2);
  ctx.fill();
  const px = g.swCx - 26;
  const py = g.swY - 9;
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
  ctx.fillStyle = '#b3431f';
  ctx.beginPath();
  ctx.arc(ex, ey, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  if (closed) {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(g.swCx + 26, g.swY - 9, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBalance(ctx: CanvasRenderingContext2D, g: Geom, s: SimState, tSec: number) {
  // shadow
  ctx.fillStyle = 'rgba(23,35,52,0.07)';
  ctx.beginPath();
  ctx.ellipse(g.balCx, g.balB + 4, g.balW * 0.55, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // base
  const base = ctx.createLinearGradient(0, g.balT, 0, g.balB);
  base.addColorStop(0, '#435062');
  base.addColorStop(1, '#2c3644');
  ctx.fillStyle = base;
  roundRect(ctx, g.balCx - g.balW / 2, g.balT, g.balW, g.balB - g.balT, 6);
  ctx.fill();
  ctx.strokeStyle = '#242e3c';
  ctx.lineWidth = 1.5;
  roundRect(ctx, g.balCx - g.balW / 2, g.balT, g.balW, g.balB - g.balT, 6);
  ctx.stroke();
  // feet
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, g.balCx - g.balW / 2 + 6, g.balB - 4, 8, 5, 2);
  ctx.fill();
  roundRect(ctx, g.balCx + g.balW / 2 - 14, g.balB - 4, 8, 5, 2);
  ctx.fill();
  // display window — bars only, the number lives in the side panel
  ctx.fillStyle = '#141d29';
  roundRect(ctx, g.balCx - g.balW * 0.32, g.balT + 6, g.balW * 0.64, 12, 3);
  ctx.fill();
  const onBal = s.nail.mode === 'balance';
  if (onBal) {
    const v = clamp(balanceValue(s.balanceT, Math.max(s.deposit, 0.001)) / FULL_PLATE, 0, 1);
    const lit = Math.round(v * 3);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < lit ? `rgba(249,115,22,${0.85})` : 'rgba(120,140,160,0.25)';
      roundRect(ctx, g.balCx - g.balW * 0.24 + i * (g.balW * 0.16), g.balT + 9, g.balW * 0.1, 6, 2);
      ctx.fill();
    }
    if (s.balanceT < 1.25) {
      ctx.fillStyle = `rgba(245,182,66,${0.4 + 0.5 * Math.sin(tSec * 10)})`;
      ctx.beginPath();
      ctx.arc(g.balCx + g.balW * 0.26, g.balT + 12, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(120,140,160,0.3)';
    ctx.beginPath();
    ctx.arc(g.balCx, g.balT + 12, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // stem + pan
  ctx.strokeStyle = '#8a96a4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(g.balCx, g.balT);
  ctx.lineTo(g.balCx, g.panY + 2);
  ctx.stroke();
  const pan = ctx.createLinearGradient(g.balCx - g.panRx, 0, g.balCx + g.panRx, 0);
  pan.addColorStop(0, '#aab4bf');
  pan.addColorStop(0.5, '#e6ebf0');
  pan.addColorStop(1, '#9aa4b1');
  ctx.fillStyle = pan;
  ctx.beginPath();
  ctx.ellipse(g.balCx, g.panY, g.panRx, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#66727e';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(g.balCx, g.panY, g.panRx, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
}

type Seg = [number, number, number, number];

function drawWirePath(ctx: CanvasRenderingContext2D, segs: Seg[], color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segs) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
}

function drawCurrent(ctx: CanvasRenderingContext2D, segs: Seg[], flow: number) {
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

function drawWires(ctx: CanvasRenderingContext2D, g: Geom, s: SimState, flowing: boolean) {
  const negPost = { x: g.psuL + g.psuW * 0.3, y: g.psuT - 4 };
  const posPost = { x: g.psuL + g.psuW * 0.7, y: g.psuT - 4 };
  const blue = getClipVisual('blue', s, g);
  const red = getClipVisual('red', s, g);
  const blueTail = { x: blue.x - Math.cos(blue.angle) * 15, y: blue.y - Math.sin(blue.angle) * 15 };
  const redTail = { x: red.x - Math.cos(red.angle) * 15, y: red.y - Math.sin(red.angle) * 15 };
  const riseB = g.amX + g.amR + 14;
  const riseR = g.beakerR + 16;
  const benchY = g.floorY - 10;
  // negative lead: post → ammeter → up and over to the clip the blue clip grips
  const blueSegs: Seg[] = [
    [negPost.x, negPost.y, negPost.x, g.amY],
    [negPost.x, g.amY, g.amX - g.amR - 2, g.amY],
    [g.amX + g.amR + 2, g.amY, riseB, g.amY],
    [riseB, g.amY, riseB, g.wireTopY],
    [riseB, g.wireTopY, blueTail.x, g.wireTopY],
    [blueTail.x, g.wireTopY, blueTail.x, blueTail.y],
  ];
  // positive lead: post → along the bench front → up the right → over to the red clip
  const redSegs: Seg[] = [
    [posPost.x, posPost.y, posPost.x, benchY],
    [posPost.x, benchY, riseR, benchY],
    [riseR, benchY, riseR, g.wireTopY],
    [riseR, g.wireTopY, redTail.x, g.wireTopY],
    [redTail.x, g.wireTopY, redTail.x, redTail.y],
  ];
  drawWirePath(ctx, blueSegs, '#3b6fd4');
  drawWirePath(ctx, redSegs, '#d24a35');
  if (flowing) {
    drawCurrent(ctx, blueSegs, s.flow);
    drawCurrent(ctx, redSegs, s.flow);
  }
}

function drawClip(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, open: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // shadow
  ctx.strokeStyle = 'rgba(23,35,52,0.16)';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, 2);
  ctx.lineTo(8, 2);
  ctx.stroke();
  // tail stub
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(-9, 0);
  ctx.stroke();
  // insulated sleeve
  ctx.fillStyle = color;
  roundRect(ctx, -9, -4.5, 12, 9, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,35,52,0.45)';
  ctx.lineWidth = 1;
  roundRect(ctx, -9, -4.5, 12, 9, 3);
  ctx.stroke();
  // jaws
  const spread = open ? 3.4 : 0.7;
  ctx.fillStyle = '#c6ced7';
  ctx.strokeStyle = '#66727e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1, -1.6 - spread);
  ctx.lineTo(13.5, -spread * 0.75);
  ctx.lineTo(12, 1.1 - spread);
  ctx.lineTo(2, -0.4 - spread * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1, 1.6 + spread);
  ctx.lineTo(13.5, spread * 0.75);
  ctx.lineTo(12, -1.1 + spread);
  ctx.lineTo(2, 0.4 + spread * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // hinge pin
  ctx.fillStyle = '#435062';
  ctx.beginPath();
  ctx.arc(1.5, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawIons(ctx: CanvasRenderingContext2D, ions: Ion[]) {
  for (const ion of ions) {
    const r = 1.8 + 0.5 * Math.sin(ion.ph * 2);
    if (ion.hot > 0) {
      const a = 0.55 * Math.max(0, 1 - ion.hot);
      const c1 = 96 + (226 - 96) * ion.hot;
      const c2 = 158 + (138 - 158) * ion.hot;
      const c3 = 214 + (96 - 214) * ion.hot;
      ctx.fillStyle = `rgba(${c1 | 0},${c2 | 0},${c3 | 0},${a})`;
    } else {
      ctx.fillStyle = 'rgba(96,158,214,0.5)';
    }
    ctx.beginPath();
    ctx.arc(ion.x, ion.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBubbles(ctx: CanvasRenderingContext2D, bubbles: Bubble[]) {
  for (const b of bubbles) {
    ctx.fillStyle = 'rgba(238,247,252,0.9)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,200,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawRings(ctx: CanvasRenderingContext2D, rings: Ring[]) {
  for (const r of rings) {
    const dur = r.big ? 0.6 : 0.22;
    const a = 1 - r.t / dur;
    ctx.strokeStyle = r.big ? `rgba(160,196,222,${a * 0.8})` : `rgba(200,224,240,${a * 0.7})`;
    ctx.lineWidth = r.big ? 2 : 1.4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, (r.big ? 6 : 2) + r.t * (r.big ? 70 : 40), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawDrips(ctx: CanvasRenderingContext2D, drips: Drip[]) {
  for (const d of drips) {
    ctx.fillStyle = 'rgba(79,155,216,0.85)';
    ctx.beginPath();
    ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(79,155,216,0.35)';
    ctx.beginPath();
    ctx.arc(d.x, d.y - 3.5, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSparkles(ctx: CanvasRenderingContext2D, sparkles: Sparkle[]) {
  for (const sp of sparkles) {
    const a = 1 - sp.t / 0.5;
    const r = 2.4 + 2.4 * a;
    ctx.strokeStyle = `rgba(255,226,194,${a * 0.9})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sp.x - r, sp.y);
    ctx.lineTo(sp.x + r, sp.y);
    ctx.moveTo(sp.x, sp.y - r);
    ctx.lineTo(sp.x, sp.y + r);
    ctx.stroke();
  }
}
