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
import './water-of-crystallization.css';

/**
 * Water of crystallisation — CuSO₄·5H₂O dehydration bench.
 *
 * A weighed 5.00 g charge of blue copper(II) sulfate pentahydrate sits in a
 * crucible on a pipe-clay triangle over a Bunsen burner. The student lights
 * the valve (tap to light gently, hold for the hotter roar), keeps the lid
 * slightly ajar so steam escapes without spitting, and watches the mass fall
 * on the live analytical balance as the colour marches blue → pale blue →
 * white. Locking the final mass (3.20 g) fills the x-in-CuSO₄·xH₂O
 * calculation card; dragging the water dropper over the white powder flashes
 * the vivid blue back with an exothermic hiss. Overheating past ~300 °C
 * decomposes the anhydrous salt to black CuO and ruins the numbers — redo.
 */

// ---- chemistry (script-calibrated; see the model constants below) -----------
const M_HYD = 249.7; // g/mol CuSO₄·5H₂O
const M_ANH = 159.6; // g/mol CuSO₄
const M_WATER = 18.0; // g/mol H₂O
const M0 = 5.0; // charge mass, g
const N0 = M0 / M_HYD; // mol of hydrate in the charge
const M_ANH_TOT = N0 * M_ANH; // 3.1958 g — the true anhydrous mass
const W_PER_X = (M0 * (M_HYD - M_ANH)) / M_HYD / 5; // 0.36083 g per water of crystallisation
const DECOMP_LOSS = 0.5019; // CuSO₄ → CuO + SO₃ mass fraction lost at full decomposition

// ---- thermal model -----------------------------------------------------------
const AMBIENT = 22;
const T_GENTLE = 262; // gentle-flame equilibrium, °C (safe: under 300)
const TAU_GENTLE = 40; // s
const T_HOT = 520; // hot-flame equilibrium, °C (decomposition territory)
const TAU_HOT = 22; // s
const TAU_COOL = 90; // cooling back to ambient, s

// ---- dehydration kinetics (slow near 100 °C, fast near 250 °C) ---------------
const KA = 0.03; // first four waters
const KB = 0.1; // the last, strongly bound water
const KC = 0.05; // decomposition to CuO above 400 °C
const ESCAPE_LID_ON = 0.1; // lid fully on: steam recondenses, loss nearly stalls
const SPIT_CAP = 0.007; // g/s crystal loss with the lid fully off
const SPIT_GAIN = 0.09;
const WHITE_W = 0.05; // waters left below which the powder reads "white" — locking here keeps x within ±0.1 (script-verified)
const REHYD_W = 4.2; // waters re-added for the vivid blue to be back

const DROP_G = M_WATER * N0; // one squeeze returns exactly one water of crystallisation (0.3604 g)
const DROP_WATERS = DROP_G / M_WATER / N0; // = 1.0 — five drops rebuild CuSO₄·5H₂O and the 5.00 g charge
const SQUEEZE_TIME = 0.9; // s of holding before a drop falls

type Flame = 'off' | 'gentle' | 'hot';
type LidState = 'on' | 'ajar' | 'off';

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'weigh', title: 'Weigh the crucible charge', detail: 'The balance is tared with the empty crucible, so it reads the contents alone: 5.00 g of blue copper(II) sulfate crystals. Everything you do next changes this number.', hint: 'The final mass should land near 3.20 g — hold that thought.' },
  { id: 'light', title: 'Light the burner gently', detail: 'Tap the valve on the Bunsen burner to light it, or press-and-hold the valve to open it further for the hotter roar. Start gentle.', hint: 'Gentle keeps the crucible under ~300 °C; the hot flame is faster but risks decomposing the salt.' },
  { id: 'heat', title: 'Heat with the lid ajar until white', detail: 'Drag the crucible lid so it sits slightly ajar — steam must escape, but the gap should be small enough that no crystals spit out. Keep heating until the powder is truly white.', hint: 'Lid fully on traps steam; fully off lets crystals spit. Ajar is the working compromise.' },
  { id: 'record', title: 'Stop heating and lock the final mass', detail: 'The moment the powder is white, press “Stop heating · lock final mass”. The balance reading freezes into your calculation.', hint: 'Locking while the powder is still pale blue records water that has not left yet.' },
  { id: 'compute', title: 'Compute x in CuSO₄·xH₂O', detail: 'Open Observations: your locked masses feed the calculation — mass lost, moles of water, moles of copper(II) sulfate, and x itself.', hint: 'x should come out within ±0.1 of 5.0 for a careful run.' },
  { id: 'rehydrate', title: 'Bring the blue back', detail: 'Drag the water dropper over the white powder and hold to squeeze. Watch the colour flash back and feel the heat leave the crucible.', hint: 'Hydrating anhydrous copper(II) sulfate is strongly exothermic — mind the hiss.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-steam', title: 'First steam', icon: '♨', detail: 'Watched the first wisps of steam leave the blue crystals.' },
  { id: 'steady-hands', title: 'Steady hands', icon: '⚖', detail: 'Kept the lid ajar through the steamy phase — no spitting, no trapped vapour.' },
  { id: 'gentle-heater', title: 'Gentle heater', icon: '🕯', detail: 'Dehydrated to pure white without ever passing 300 °C.' },
  { id: 'sharp-x', title: 'Sharp chemist', icon: '✕', detail: 'Derived x within ±0.1 of 5.0 from your own balance readings.' },
  { id: 'blue-returned', title: 'Blue returned', icon: '💧', detail: 'Rehydrated the white dust until it flashed back to vivid blue.' },
];

interface StageRow { id: number; stage: string; colour: string; T: number; m: number }

interface UiSnap {
  t: number;
  T: number;
  Tpeak: number;
  mDisp: number; // balance reading incl. jitter
  wD: number; // waters of crystallisation remaining (dehydration only)
  wVis: number; // incl. re-added water — drives colour
  c: number; // decomposition fraction
  spit: number;
  flame: Flame;
  lid: LidState;
  locked: boolean;
  lockM: number;
  lockW: number;
  lockT: number;
  lockX: number;
  lockPct: number;
  verdict: 'clean' | 'early' | 'spat' | 'decomposed' | '';
  steaming: boolean;
  spitting: boolean;
  wAdd: number;
}

interface Sim {
  t: number; // simulated seconds
  time: number; // real seconds (animations)
  T: number;
  Tpeak: number;
  w4: number; // waters lost from the first four
  w1: number; // last water lost (0..1)
  wAdd: number; // waters re-added by the dropper (colour), capped at 5
  addG: number; // total grams of water added (mass)
  c: number;
  spit: number;
  m: number;
  flame: Flame;
  everLit: boolean;
  lid: { state: LidState; uTarget: number; x: number; y: number; tilt: number; held: boolean; grabDX: number; grabDY: number };
  dropper: { x: number; y: number; held: boolean; grabDX: number; grabDY: number; squeeze: number; auto: { phase: number; t: number; fromX: number; fromY: number } | null };
  valveHold: number; // -1 idle, else seconds held
  valvePressLit: boolean; // the flame was already lit when this press began
  locked: boolean;
  lockM: number;
  lockW: number;
  lockT: number;
  lockX: number;
  lockPct: number;
  verdict: 'clean' | 'early' | 'spat' | 'decomposed' | '';
  lidAjarThroughSteam: boolean;
  steamOn: boolean; // first-steam latch
  heatPulse: number; // rehydration exotherm
  samples: { t: number; m: number; w: number; c: number }[];
  sampleAcc: number;
  acc: number;
  uiAcc: number;
  steamAcc: number;
  fleckAcc: number;
  dripBackAt: number;
  sizzleAt: number;
  dragSoundAt: number;
  dropWarnAt: number;
  warnAt: number;
  steam: { x: number; y: number; r: number; age: number; life: number; wob: number }[];
  drops: { x: number; y: number; vy: number }[];
  flecks: { x: number; y: number; vx: number; vy: number; age: number }[];
  condens: { x: number; y: number; vy: number; r: number }[];
  flashes: { x: number; y: number; age: number }[];
  pending: string[];
}

const meta = getLabBySlug('water-of-crystallization')!;

// ---- colour model ------------------------------------------------------------
// Interpolated powder colour: deep blue pentahydrate → pale blue → white,
// then blended toward black copper(II) oxide as decomposition proceeds.
const STOPS: { w: number; rgb: [number, number, number] }[] = [
  { w: 0, rgb: [247, 245, 240] },
  { w: 0.35, rgb: [243, 243, 238] },
  { w: 1.5, rgb: [214, 230, 238] },
  { w: 3.0, rgb: [130, 185, 224] },
  { w: 4.0, rgb: [70, 145, 210] },
  { w: 5.0, rgb: [42, 118, 200] },
];
const CUO_RGB: [number, number, number] = [52, 54, 58];

function colourAt(w: number, c: number): string {
  const ww = clamp(w, 0, 5);
  let rgb: [number, number, number] = STOPS[STOPS.length - 1].rgb;
  for (let i = 1; i < STOPS.length; i += 1) {
    if (ww <= STOPS[i].w) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const k = (ww - a.w) / (b.w - a.w);
      rgb = [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k),
      ];
      break;
    }
  }
  const f = clamp(c * 1.15, 0, 1);
  const r = Math.round(rgb[0] + (CUO_RGB[0] - rgb[0]) * f);
  const g = Math.round(rgb[1] + (CUO_RGB[1] - rgb[1]) * f);
  const bl = Math.round(rgb[2] + (CUO_RGB[2] - rgb[2]) * f);
  return `rgb(${r},${g},${bl})`;
}

function stageInfo(wD: number, wAdd: number, c: number): string {
  if (c > 0.04) return 'Decomposing — black CuO forming';
  if (wAdd >= REHYD_W) return 'Blue again — CuSO₄·5H₂O';
  if (wAdd > 0.4) return 'Rehydrating — blue returns';
  if (wD >= 4.5) return 'Blue hydrate — CuSO₄·5H₂O';
  if (wD >= 2.8) return 'Pale blue — losing the first waters';
  if (wD >= 1.2) return 'Bluish white — near the last water';
  if (wD > WHITE_W) return 'Whitening — the last water leaves';
  return 'White anhydrous CuSO₄';
}

const shapeA = (r: number) => Math.min(r, 1.5);
const shapeB = (r: number) => Math.min(0.8, r * 4.5);
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const kA_T = (T: number) => KA * Math.pow(Math.max(0, (T - 60) / 90), 1.6);
const kB_T = (T: number) => KB * Math.pow(Math.max(0, (T - 150) / 100), 1.8);

const AJAR_U = 0.3; // lid-path parameter of the ajar rest (slid along the rim, tilted)

const LID_SNAPS: { state: LidState; u: number }[] = [
  { state: 'on', u: 0 },
  { state: 'ajar', u: AJAR_U },
  { state: 'off', u: 1 },
];

export default function CrystallizationLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef<Sim>({
    t: 0, time: 0, T: AMBIENT, Tpeak: AMBIENT,
    w4: 0, w1: 0, wAdd: 0, addG: 0, c: 0, spit: 0, m: M0,
    flame: 'off', everLit: false,
    lid: { state: 'off', uTarget: 1, x: 0, y: 0, tilt: 0.54, held: false, grabDX: 0, grabDY: 0 },
    dropper: { x: 0, y: 0, held: false, grabDX: 0, grabDY: 0, squeeze: 0, auto: null },
    valveHold: -1,
    valvePressLit: false,
    locked: false, lockM: 0, lockW: 5, lockT: 0, lockX: 0, lockPct: 0, verdict: '',
    lidAjarThroughSteam: true,
    steamOn: false,
    heatPulse: 0,
    samples: [{ t: 0, m: M0, w: 5, c: 0 }],
    sampleAcc: 0, acc: 0, uiAcc: 0, steamAcc: 0, fleckAcc: 0,
    dripBackAt: 0, sizzleAt: 0, dragSoundAt: 0, warnAt: 0, dropWarnAt: 0,
    steam: [], drops: [], flecks: [], condens: [], flashes: [],
    pending: [],
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls + UI snapshot ---------------------------------------
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<StageRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawCalc, setSawCalc] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    t: 0, T: AMBIENT, Tpeak: AMBIENT, mDisp: M0, wD: 5, wVis: 5, c: 0, spit: 0,
    flame: 'off', lid: 'off', locked: false, lockM: 0, lockW: 5, lockT: 0, lockX: 0, lockPct: 0, verdict: '',
    steaming: false, spitting: false, wAdd: 0,
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

  // ---- geometry --------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const benchY = h - 24;
    const A = clamp(w * 0.34, 110, Math.max(110, w * 0.5)); // burner + tripod centre line
    const balW = w < 520 ? 92 : 116;
    // clamped so the dropper stand always keeps its patch of bench to the right
    const balX = clamp(w * 0.72, A + 130, w - balW / 2 - 18);
    const mouthY = benchY - 196;
    const ringY = benchY - 150;
    const lidParkX = Math.min(balX - balW / 2 - 22, A + 132);
    const dropParkX = Math.min(w - 24, balX + balW / 2 + 28);
    return { w, h, benchY, A, balW, balX, mouthY, ringY, lidParkX, dropParkX };
  }, []);

  const lidPos = useCallback((u: number) => {
    const g = geom();
    // u = 0 → centred on the crucible mouth; AJAR_U → slid along the rim and
    // tilted so steam escapes through the gap; 1 → parked on the bench.
    if (u <= AJAR_U) {
      const k = u / AJAR_U;
      return { x: g.A + k * 15, y: g.mouthY - 5 + k * 3, tilt: -0.34 * k };
    }
    const k = smoothstep((u - AJAR_U) / (1 - AJAR_U));
    const x0 = g.A + 15;
    const y0 = g.mouthY - 2;
    return { x: x0 + k * (g.lidParkX - x0), y: y0 + k * (g.benchY - 4 - y0), tilt: -0.34 + k * 0.88 };
  }, [geom]);

  const dropperPark = useCallback(() => {
    const g = geom();
    return { x: g.dropParkX, y: g.benchY - 114 };
  }, [geom]);

  // ---- helpers reachable from the loop --------------------------------------
  const dropperOverPowder = useCallback((s: Sim) => {
    const g = geom();
    const tipX = s.dropper.x;
    const tipY = s.dropper.y + 38;
    return Math.abs(tipX - g.A) < 42 && tipY < g.mouthY + 26 && tipY > g.mouthY - 120;
  }, [geom]);

  const setFlame = useCallback((next: Flame) => {
    const s = sim.current;
    if (s.flame === next) return;
    const wasLit = s.flame !== 'off';
    s.flame = next;
    if (next === 'off') {
      labSound.click();
      labSound.stopLoop();
    } else if (next === 'hot') {
      labSound.click();
      labSound.slide(0.85); // the roar stepping up
      if (!wasLit) labSound.startLoop('hum');
    } else {
      labSound.click();
      labSound.startLoop('hum');
      s.everLit = true;
    }
    if (next !== 'off') s.everLit = true;
  }, []);

  const setLid = useCallback((next: LidState, silent = false) => {
    const s = sim.current;
    if (s.lid.state === next) return;
    s.lid.state = next;
    s.lid.uTarget = LID_SNAPS.find((n) => n.state === next)!.u;
    if (!silent) {
      if (next === 'on') labSound.glassClink(true);
      else if (next === 'ajar') labSound.slide(0.4);
      else labSound.thunk(false);
    }
  }, []);

  const squeezeDrop = useCallback(() => {
    const s = sim.current;
    if (s.dropper.auto || s.dropper.held) return;
    // same gate as the button — the dropper waits for (nearly) white powder or a locked run
    if (5 - s.w4 - s.w1 >= 1.2 && !s.locked) {
      labSound.warn();
      pushToast('warn', '💧', 'Not yet — the dropper is for the white powder. Squeeze it once the dehydration is done (or the final mass is locked).');
      return;
    }
    s.dropper.auto = { phase: 0, t: 0, fromX: s.dropper.x, fromY: s.dropper.y };
  }, [pushToast]);

  const lockRun = useCallback(() => {
    const s = sim.current;
    if (s.locked && s.verdict === 'early') {
      // resume a run that was locked too early — heat on and lock again
      s.locked = false;
      s.verdict = '';
      labSound.click();
      pushToast('info', '↺', 'Run resumed — heat until the powder is truly white, then lock the mass again.');
      return;
    }
    if (s.locked) return;
    if (s.t < 3) return;
    const mRec = Math.round(s.m * 100) / 100;
    const dRec = Math.round((M0 - s.m) * 100) / 100;
    const x = dRec / M_WATER / (mRec / M_ANH);
    s.locked = true;
    s.lockM = mRec;
    s.lockW = 5 - s.w4 - s.w1;
    s.lockT = s.t;
    s.lockX = x;
    s.lockPct = (dRec / M0) * 100;
    setFlame('off');
    if (s.c > 0.02) {
      s.verdict = 'decomposed';
      labSound.warn();
      pushToast('warn', '⚠', `Locked at ${mRec.toFixed(2)} g — but the salt decomposed. Black CuO has stolen mass; reset and heat gently to redo.`);
    } else if (s.spit > 0.02) {
      s.verdict = 'spat';
      labSound.warn();
      pushToast('warn', '⚠', `Locked at ${mRec.toFixed(2)} g — crystals spat while the lid was fully off. Keep it ajar and redo.`);
    } else if (s.lockW > WHITE_W) {
      s.verdict = 'early';
      labSound.warn();
      pushToast('warn', '⚠', `Locked at ${mRec.toFixed(2)} g — the powder still holds water. Resume and heat to true white.`);
    } else {
      s.verdict = 'clean';
      labSound.milestone();
      pushToast('good', '✎', `Final mass locked: ${mRec.toFixed(2)} g — x = ${x.toFixed(2)}. Open Observations for the calculation.`);
      if (Math.abs(x - 5) <= 0.1) earn('sharp-x');
      if (s.Tpeak <= 300) earn('gentle-heater');
      if (s.lidAjarThroughSteam && s.spit <= 0.005) earn('steady-hands');
    }
  }, [earn, pushToast, setFlame]);

  const recordStage = useCallback(() => {
    const s = sim.current;
    if (s.t <= 2) return;
    const wD = 5 - s.w4 - s.w1;
    const row: StageRow = {
      id: rows.length + 1,
      stage: stageInfo(wD, s.wAdd, s.c),
      colour: colourAt(5 - s.w4 - s.w1 + s.wAdd, s.c),
      T: Math.round(s.T),
      m: Math.round(s.m * 100) / 100,
    };
    setRows((cur) => [...cur, row]);
    labSound.tick();
    pushToast('info', '✎', `Recorded: ${row.stage.toLowerCase()} at ${row.T} °C, ${row.m.toFixed(2)} g.`);
  }, [rows.length, pushToast]);

  const resetAll = useCallback(() => {
    const s = sim.current;
    const park = dropperPark();
    const lid = lidPos(1);
    s.t = 0; s.time = 0; s.T = AMBIENT; s.Tpeak = AMBIENT;
    s.w4 = 0; s.w1 = 0; s.wAdd = 0; s.addG = 0; s.c = 0; s.spit = 0; s.m = M0;
    s.flame = 'off'; s.everLit = false;
    s.lid = { state: 'off', uTarget: 1, x: lid.x, y: lid.y, tilt: lid.tilt, held: false, grabDX: 0, grabDY: 0 };
    s.dropper = { x: park.x, y: park.y, held: false, grabDX: 0, grabDY: 0, squeeze: 0, auto: null };
    s.valveHold = -1;
    s.valvePressLit = false;
    s.locked = false; s.lockM = 0; s.lockW = 5; s.lockT = 0; s.lockX = 0; s.lockPct = 0; s.verdict = '';
    s.lidAjarThroughSteam = true; s.steamOn = false; s.heatPulse = 0;
    s.samples = [{ t: 0, m: M0, w: 5, c: 0 }];
    s.sampleAcc = 0; s.acc = 0; s.uiAcc = 0; s.steamAcc = 0; s.fleckAcc = 0;
    s.dripBackAt = 0; s.sizzleAt = 0; s.warnAt = 0; s.dragSoundAt = 0; s.dropWarnAt = 0;
    s.steam = []; s.drops = []; s.flecks = []; s.condens = []; s.flashes = [];
    s.pending = [];
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setSawCalc(false);
    setBadges([]);
    labSound.stopLoop();
  }, [dropperPark, lidPos]);

  // initial placement of the two draggable props (lid parked, dropper on stand)
  useEffect(() => {
    const s = sim.current;
    const lid = lidPos(1);
    const park = dropperPark();
    s.lid.x = lid.x; s.lid.y = lid.y; s.lid.tilt = lid.tilt;
    s.dropper.x = park.x; s.dropper.y = park.y;
  }, [lidPos, dropperPark]);

  // ---- mentor completion flags ------------------------------------------------
  const white = ui.wD <= WHITE_W;
  const done = [
    mentorAcked,
    ui.flame !== 'off' || sim.current.everLit,
    white,
    ui.locked && ui.verdict === 'clean',
    sawCalc && ui.locked,
    ui.wAdd >= REHYD_W,
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

  // ---- nudge --------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'light': return { target: 'flame', gesture: 'press', title: 'Light the burner', body: 'Set the flame to Gentle — or tap the valve on the burner in the scene. A gentle roar first; the hotter flame can wait.' };
      case 'heat': return { target: 'lid', gesture: 'press', title: 'Lid slightly ajar', body: 'Set the lid to Ajar so steam escapes without spitting crystals — then keep heating until the powder is truly white.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Lock the final mass', body: 'The powder is white — press “Stop heating · lock final mass” before the reading drifts.' };
      case 'compute': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your locked masses have filled the x calculation card — open the Observations tab to read x.' };
      case 'rehydrate': return { target: 'dropper', gesture: 'press', title: 'Squeeze the dropper', body: 'Send a drop of water onto the white powder — or drag the glass dropper over the crucible and hold to squeeze.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics --------------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const g = geom();
    s.time += dt;

    // ----- fixed sub-steps: chemistry + heat -----
    s.acc += dt * speed;
    const h = 1 / 20;
    while (s.acc >= h) {
      s.acc -= h;
      s.t += h;
      const Ttar = s.flame === 'gentle' ? T_GENTLE : s.flame === 'hot' ? T_HOT : AMBIENT;
      const tau = s.flame === 'gentle' ? TAU_GENTLE : s.flame === 'hot' ? TAU_HOT : TAU_COOL;
      s.T += (Ttar - s.T) * (h / tau);
      if (s.heatPulse > 0) {
        const before = s.T;
        s.T += 95 * h * Math.min(1, s.heatPulse);
        s.heatPulse = Math.max(0, s.heatPulse - h * 1.35);
        if (before < 104 && s.T > 104) s.T = 104; // cap the exotherm — never cool a hotter crucible
      }
      s.Tpeak = Math.max(s.Tpeak, s.T);

      const escape = s.lid.state === 'on' ? ESCAPE_LID_ON : 1;
      const kA = kA_T(s.T);
      const kB = kB_T(s.T);
      const gate = smoothstep((s.w4 - 2.2) / 1.2);
      const vigorRaw = (kA * shapeA(4 - s.w4) + kB * shapeB(1 - s.w1) * gate) * W_PER_X; // g/s of water being driven off
      const dW4 = kA * shapeA(4 - s.w4) * escape * h;
      const dW1 = kB * shapeB(1 - s.w1) * gate * escape * h;
      s.w4 = Math.min(4, s.w4 + dW4);
      s.w1 = Math.min(1, s.w1 + dW1);

      const spitting = s.lid.state === 'off' && s.T > 150 && vigorRaw > 0.004;
      if (spitting) s.spit += Math.min(SPIT_CAP, vigorRaw * SPIT_GAIN) * h;

      // lid discipline tracking while the steam pours off
      if (vigorRaw > 0.006 && s.lid.state !== 'ajar') {
        s.lidAjarThroughSteam = false;
      }

      const wD = 5 - s.w4 - s.w1;
      if (wD <= 0.5 && s.T > 400) {
        s.c = Math.min(0.99, s.c + KC * Math.pow((s.T - 400) / 150, 2) * (1 - s.c) * h);
      }

      s.m = M0 - (s.w4 + s.w1) * W_PER_X - s.spit - s.c * DECOMP_LOSS * M_ANH_TOT + s.addG;

      // first steam latch (only counts once steam can actually escape)
      if (!s.steamOn && vigorRaw > 0.006 && s.lid.state !== 'on') {
        s.steamOn = true;
        s.pending.push('steam-start');
      }

      // condensation drips back with the lid fully on
      if (s.lid.state === 'on' && vigorRaw > 0.0008 && s.t - s.dripBackAt > 1.7) {
        s.dripBackAt = s.t;
        s.condens.push({ x: g.A + (Math.random() - 0.5) * 34, y: g.mouthY + 10, vy: 0, r: 2.4 });
        s.pending.push('drip-back');
      }

      s.sampleAcc += h;
      if (s.sampleAcc >= 1) {
        s.sampleAcc -= 1;
        s.samples.push({ t: s.t, m: s.m, w: 5 - s.w4 - s.w1 + s.wAdd, c: s.c });
        if (s.samples.length > 2400) s.samples.shift();
      }
    }

    // ----- valve hold → hotter flame -----
    if (s.valveHold >= 0) {
      s.valveHold += dt;
      if (s.valveHold >= 0.8) {
        s.valveHold = -1;
        if (s.flame === 'gentle') setFlame('hot');
      }
    }

    // ----- dropper: auto flight, easing home, hold-to-squeeze -----
    const park = dropperPark();
    const da = s.dropper.auto;
    if (da) {
      da.t += dt;
      const overX = g.A;
      const overY = g.mouthY - 74;
      if (da.phase === 0) {
        const k = Math.min(1, da.t / 0.5);
        const e = k * k * (3 - 2 * k);
        s.dropper.x = da.fromX + (overX - da.fromX) * e;
        s.dropper.y = da.fromY + (overY - da.fromY) * e;
        if (k >= 1) { da.phase = 1; da.t = 0; }
      } else if (da.phase === 1) {
        s.dropper.squeeze = Math.min(1, da.t / SQUEEZE_TIME);
        if (s.dropper.squeeze >= 1) {
          s.dropper.squeeze = 0;
          s.drops.push({ x: overX + (Math.random() - 0.5) * 8, y: overY + 40, vy: 40 });
          labSound.drip(false);
          da.phase = 2;
          da.t = 0;
          da.fromX = s.dropper.x;
          da.fromY = s.dropper.y;
        }
      } else {
        const k = Math.min(1, da.t / 0.5);
        const e = k * k * (3 - 2 * k);
        s.dropper.x = da.fromX + (park.x - da.fromX) * e;
        s.dropper.y = da.fromY + (park.y - da.fromY) * e;
        if (k >= 1) s.dropper.auto = null;
      }
    } else if (!s.dropper.held) {
      const k = Math.min(1, dt * 9);
      s.dropper.x += (park.x - s.dropper.x) * k;
      s.dropper.y += (park.y - s.dropper.y) * k;
    }

    if (s.dropper.held && !s.dropper.auto && dropperOverPowder(s)) {
      if (5 - s.w4 - s.w1 < 1.2 || s.locked) {
        s.dropper.squeeze += dt / SQUEEZE_TIME;
        if (s.dropper.squeeze >= 1) {
          s.dropper.squeeze = 0;
          s.drops.push({ x: s.dropper.x + (Math.random() - 0.5) * 8, y: s.dropper.y + 38, vy: 40 });
          labSound.drip(false);
        }
      } else {
        // the dropper is for the white powder — squeezing early just dribbles back
        s.dropper.squeeze = Math.max(0, s.dropper.squeeze - dt * 2.2);
        if (s.t - s.dropWarnAt > 6) {
          s.dropWarnAt = s.t;
          s.pending.push('drop-refused');
        }
      }
    } else if (!s.dropper.auto) {
      s.dropper.squeeze = Math.max(0, s.dropper.squeeze - dt * 2.2);
    }

    // ----- falling dropper drops → the exothermic flash-back -----
    const cruBot = g.ringY - 3;
    const surfY = cruBot - 3 - (9 + clamp(s.m / M0, 0, 1.05) * 24);
    for (let i = s.drops.length - 1; i >= 0; i -= 1) {
      const d = s.drops[i];
      d.vy += 1400 * dt;
      d.y += d.vy * dt;
      if (d.y >= surfY + 2) {
        s.drops.splice(i, 1);
        s.addG = Math.min(5 * DROP_G, s.addG + DROP_G); // saturated at the pentahydrate
        s.wAdd = Math.min(5, s.wAdd + DROP_WATERS);
        s.heatPulse = 1;
        s.flashes.push({ x: g.A, y: surfY + 4, age: 0 });
        s.pending.push('drop-land');
      }
    }

    // ----- steam wisps (rate follows the water leaving; motion is real-time) -----
    const vigorNow = (kA_T(s.T) * shapeA(4 - s.w4) + kB_T(s.T) * shapeB(1 - s.w1) * smoothstep((s.w4 - 2.2) / 1.2)) * W_PER_X;
    const lidOpen = s.lid.state !== 'on' ? 1 : 0;
    const rehydSteam = Math.max(0, (s.T - 70) / 40) * 0.02 * lidOpen;
    const steamVis = vigorNow * lidOpen + rehydSteam;
    s.steamAcc += dt * speed * clamp(steamVis * 90, 0, 26);
    while (s.steamAcc >= 1) {
      s.steamAcc -= 1;
      const gapX = s.lid.state === 'ajar' ? g.A - 14 : g.A + (Math.random() - 0.5) * 30;
      s.steam.push({ x: gapX + (Math.random() - 0.5) * 10, y: g.mouthY - 4, r: 2.5 + Math.random() * 2.5, age: 0, life: 1.3 + Math.random() * 1.1, wob: Math.random() * Math.PI * 2 });
    }
    for (const p of s.steam) {
      p.age += dt;
      p.y -= dt * 34;
      p.x += Math.sin(p.wob + p.age * 2.6) * 12 * dt;
      p.r += dt * 5;
    }
    s.steam = s.steam.filter((p) => p.age < p.life);

    // ----- spitting flecks with the lid fully off -----
    const spittingNow = s.lid.state === 'off' && s.T > 150 && vigorNow > 0.004;
    if (spittingNow) {
      s.fleckAcc += dt * speed * (2 + vigorNow * 140);
      while (s.fleckAcc >= 1) {
        s.fleckAcc -= 1;
        const dir = Math.random() < 0.5 ? -1 : 1;
        s.flecks.push({ x: g.A + dir * (10 + Math.random() * 12), y: g.mouthY - 2, vx: dir * (36 + Math.random() * 66), vy: -(120 + Math.random() * 110), age: 0 });
      }
      if (s.t - s.warnAt > 9) {
        s.warnAt = s.t;
        s.pending.push('spit-warn');
      }
    }
    for (const f of s.flecks) {
      f.age += dt;
      f.vy += 540 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    s.flecks = s.flecks.filter((f) => f.y < g.benchY - 2 && f.age < 3);

    // ----- condensation drips falling back into the crucible -----
    for (const cd of s.condens) {
      cd.vy += 900 * dt;
      cd.y += cd.vy * dt;
    }
    s.condens = s.condens.filter((cd) => cd.y < g.mouthY + 58);

    // ----- flash rings fade -----
    for (const fl of s.flashes) fl.age += dt;
    s.flashes = s.flashes.filter((fl) => fl.age < 0.9);

    // ----- steam sizzle (throttled) -----
    if (steamVis > 0.004 && s.time - s.sizzleAt > 0.85) {
      s.sizzleAt = s.time;
      labSound.slide(0.16 + Math.min(0.2, steamVis * 4));
    }

    // ----- decomposition warning (once, when the darkening starts) -----
    if (s.c > 0.02 && s.t - s.warnAt > 12 && !s.pending.includes('decomp-warn')) {
      s.warnAt = s.t;
      s.pending.push('decomp-warn');
    }

    // ----- deferred UI events (sounds + toasts from inside the loop) -----
    if (s.pending.length) {
      const evts = s.pending;
      s.pending = [];
      for (const ev of evts) {
        if (ev === 'steam-start') {
          labSound.step();
          earn('first-steam');
          pushToast('info', '♨', 'Steam — water is leaving the crystals. Keep the lid slightly ajar so it escapes.');
        } else if (ev === 'drip-back') {
          labSound.drip(true);
        } else if (ev === 'drop-refused') {
          labSound.warn();
          pushToast('warn', '💧', 'The dropper is for the white powder — heat the crystals to anhydrous first, or lock the final mass.');
        } else if (ev === 'drop-land') {
          // composed hiss-crackle: rolling slosh + liquid landing + metallic sparkle
          labSound.slosh(0.95);
          labSound.drip(false);
          labSound.ping(1450, 0.045);
          if (s.wAdd >= REHYD_W) s.pending.push('blue-back');
        } else if (ev === 'blue-back') {
          labSound.milestone();
          earn('blue-returned');
          pushToast('good', '💧', 'Vivid blue again — CuSO₄·5H₂O rebuilt, and the heat you felt leaving the crucible was the hydration enthalpy.');
        } else if (ev === 'spit-warn') {
          labSound.warn();
          pushToast('warn', '⚠', 'Crystals are spitting out of the open crucible — the balance reading is jumping. Slide the lid back to ajar.');
        } else if (ev === 'decomp-warn') {
          labSound.warn();
          pushToast('warn', '⚠', 'The powder is darkening — anhydrous copper(II) sulfate is decomposing to black copper(II) oxide. Your mass will drift low; reset for a clean run.');
        }
      }
    }

    // ease the released lid to its rest spot (also re-anchors after a resize)
    if (!s.lid.held) {
      const p = lidPos(s.lid.uTarget);
      const k = Math.min(1, dt * 10);
      s.lid.x += (p.x - s.lid.x) * k;
      s.lid.y += (p.y - s.lid.y) * k;
      s.lid.tilt += (p.tilt - s.lid.tilt) * k;
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      const wD = 5 - s.w4 - s.w1;
      const amp = (s.lid.state === 'off' && s.T > 150 && vigorNow > 0.004 ? 0.006 + Math.min(0.012, vigorNow * 0.15) : 0.0015);
      const jit = Math.sin(s.t * 17.3) * Math.sin(s.t * 9.1 + 1.2) * amp;
      setUi({
        t: s.t, T: s.T, Tpeak: s.Tpeak, mDisp: s.m + jit,
        wD, wVis: wD + s.wAdd, c: s.c, spit: s.spit,
        flame: s.flame, lid: s.lid.state,
        locked: s.locked, lockM: s.lockM, lockW: s.lockW, lockT: s.lockT, lockX: s.lockX, lockPct: s.lockPct, verdict: s.verdict,
        steaming: vigorNow > 0.004, spitting: s.lid.state === 'off' && s.T > 150 && vigorNow > 0.004,
        wAdd: s.wAdd,
      });
    }
  }, [speed, geom, dropperPark, dropperOverPowder, lidPos, setFlame, earn, pushToast]);

  // ---- drawing ---------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const powderColour = colourAt(5 - s.w4 - s.w1 + s.wAdd, s.c);
    const wD = 5 - s.w4 - s.w1;

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

    // ---------------- Bunsen burner ----------------
    const bx = g.A;
    // gas tube from the burner base to a bench tap at the left
    ctx.strokeStyle = '#8d99a6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx - 8, g.benchY - 14);
    ctx.bezierCurveTo(bx - 40, g.benchY - 8, 60, g.benchY - 6, 34, g.benchY - 34);
    ctx.stroke();
    ctx.fillStyle = '#5d6a79';
    roundRect(ctx, 22, g.benchY - 44, 12, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    roundRect(ctx, 34, g.benchY - 42, 5, 7, 2);
    ctx.fill();

    // base
    ctx.fillStyle = '#3a4450';
    ctx.beginPath();
    ctx.ellipse(bx, g.benchY - 5, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f3944';
    ctx.beginPath();
    ctx.ellipse(bx, g.benchY - 3, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // stem + barrel
    const barrelTop = g.benchY - 92;
    const stemG = ctx.createLinearGradient(bx - 6, 0, bx + 6, 0);
    stemG.addColorStop(0, '#6b7887');
    stemG.addColorStop(0.5, '#93a1af');
    stemG.addColorStop(1, '#5a6674');
    ctx.fillStyle = stemG;
    roundRect(ctx, bx - 5, g.benchY - 34, 10, 30, 3);
    ctx.fill();
    roundRect(ctx, bx - 10, barrelTop, 20, 62, 5);
    ctx.fill();
    // collar
    ctx.fillStyle = '#435062';
    roundRect(ctx, bx - 12, g.benchY - 52, 24, 10, 4);
    ctx.fill();
    ctx.strokeStyle = '#2b333d';
    ctx.lineWidth = 1.25;
    roundRect(ctx, bx - 10, barrelTop, 20, 62, 5);
    ctx.stroke();

    // valve lever (the click/hold target) — rotates with the flame level
    const valveX = bx - 22;
    const valveY = g.benchY - 44;
    const lit = s.flame !== 'off';
    const leverA = s.flame === 'hot' ? -0.85 : s.flame === 'gentle' ? -0.35 : 0.25;
    ctx.strokeStyle = '#8d99a6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(valveX, valveY);
    ctx.lineTo(valveX + Math.cos(leverA + Math.PI) * 15, valveY + Math.sin(leverA + Math.PI) * 15);
    ctx.stroke();
    ctx.fillStyle = lit ? '#f97316' : '#6d7a88';
    ctx.beginPath();
    ctx.arc(valveX, valveY, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b333d';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    if (s.valveHold >= 0) {
      ctx.strokeStyle = '#e8632a';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(valveX, valveY, 15 + s.valveHold * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---------------- flame ----------------
    if (lit) {
      const flick = Math.sin(s.time * 9.3) * 2 + Math.sin(s.time * 23.7) * 1.2;
      const F = (s.flame === 'hot' ? 64 : 44) + flick;
      const fw = s.flame === 'hot' ? 15 : 11;
      // outer glow
      const glow = ctx.createRadialGradient(bx, barrelTop - F * 0.45, 4, bx, barrelTop - F * 0.45, F * 0.95);
      glow.addColorStop(0, s.flame === 'hot' ? 'rgba(120,170,255,0.5)' : 'rgba(110,160,240,0.38)');
      glow.addColorStop(0.55, 'rgba(90,140,235,0.16)');
      glow.addColorStop(1, 'rgba(90,140,235,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(bx - 46, barrelTop - F - 20, 92, F + 26);
      // outer cone
      const outer = ctx.createLinearGradient(0, barrelTop, 0, barrelTop - F);
      outer.addColorStop(0, 'rgba(64,130,230,0.85)');
      outer.addColorStop(0.7, 'rgba(110,170,250,0.55)');
      outer.addColorStop(1, 'rgba(150,200,255,0.05)');
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.moveTo(bx - fw, barrelTop);
      ctx.quadraticCurveTo(bx - fw * 0.7, barrelTop - F * 0.55, bx, barrelTop - F);
      ctx.quadraticCurveTo(bx + fw * 0.7, barrelTop - F * 0.55, bx + fw, barrelTop);
      ctx.closePath();
      ctx.fill();
      // inner cone
      const inner = ctx.createLinearGradient(0, barrelTop, 0, barrelTop - F * 0.52);
      inner.addColorStop(0, 'rgba(140,205,255,0.95)');
      inner.addColorStop(1, 'rgba(190,230,255,0.25)');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.moveTo(bx - fw * 0.42, barrelTop);
      ctx.quadraticCurveTo(bx - fw * 0.3, barrelTop - F * 0.3, bx, barrelTop - F * 0.52);
      ctx.quadraticCurveTo(bx + fw * 0.3, barrelTop - F * 0.3, bx + fw * 0.42, barrelTop);
      ctx.closePath();
      ctx.fill();
      // heat shimmer lines beside the flame
      ctx.strokeStyle = s.flame === 'hot' ? 'rgba(232,99,42,0.22)' : 'rgba(232,99,42,0.14)';
      ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let yy = 0; yy <= 30; yy += 6) {
          const xx = bx + side * (fw + 10) + Math.sin(s.time * 4 + yy * 0.4) * 3;
          if (yy === 0) ctx.moveTo(xx, barrelTop - yy);
          else ctx.lineTo(xx, barrelTop - yy);
        }
        ctx.stroke();
      }
    }

    // ---------------- tripod + pipe-clay triangle ----------------
    ctx.strokeStyle = '#5d6a79';
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(bx + side * 44, g.benchY - 2);
      ctx.lineTo(bx + side * 26, g.ringY);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(bx, g.benchY - 2);
    ctx.lineTo(bx, g.ringY + 6);
    ctx.stroke();
    // wire gauze ring / triangle support
    ctx.strokeStyle = '#7c8998';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx - 40, g.ringY);
    ctx.lineTo(bx + 40, g.ringY);
    ctx.stroke();
    // pipe-clay triangle (three pale clay rods)
    ctx.strokeStyle = '#c9a173';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    const triY = g.ringY - 4;
    ctx.beginPath();
    ctx.moveTo(bx - 34, triY);
    ctx.lineTo(bx + 34, triY);
    ctx.moveTo(bx - 34, triY);
    ctx.lineTo(bx - 10, triY + 7);
    ctx.moveTo(bx + 34, triY);
    ctx.lineTo(bx + 10, triY + 7);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // ---------------- crucible ----------------
    const mouthW = 58;
    const botW = 44;
    const cruH = 46;
    const cruBot = g.ringY - 3;
    const cruTop = cruBot - cruH;
    // porcelain body
    const cruG = ctx.createLinearGradient(bx - mouthW / 2, 0, bx + mouthW / 2, 0);
    cruG.addColorStop(0, '#dfe5ea');
    cruG.addColorStop(0.45, '#f6f8fa');
    cruG.addColorStop(1, '#cfd7dd');
    ctx.fillStyle = cruG;
    ctx.beginPath();
    ctx.moveTo(bx - mouthW / 2, cruTop);
    ctx.lineTo(bx - botW / 2, cruBot);
    ctx.quadraticCurveTo(bx, cruBot + 5, bx + botW / 2, cruBot);
    ctx.lineTo(bx + mouthW / 2, cruTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#a9b6c1';
    ctx.lineWidth = 1.75;
    ctx.stroke();
    // rim
    ctx.strokeStyle = '#b9c4cf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx - mouthW / 2 - 2, cruTop);
    ctx.lineTo(bx + mouthW / 2 + 2, cruTop);
    ctx.stroke();
    // hot crucible glow when running past 300 °C
    if (s.T > 300) {
      const hg = clamp((s.T - 300) / 220, 0, 0.8);
      ctx.strokeStyle = `rgba(232,99,42,${hg * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx - botW / 2, cruBot);
      ctx.quadraticCurveTo(bx, cruBot + 5, bx + botW / 2, cruBot);
      ctx.stroke();
    }

    // ---------------- powder charge (clipped to the crucible mouth) ----------------
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx - mouthW / 2 + 3, cruTop);
    ctx.lineTo(bx - botW / 2 + 2, cruBot - 2);
    ctx.quadraticCurveTo(bx, cruBot + 2, bx + botW / 2 - 2, cruBot - 2);
    ctx.lineTo(bx + mouthW / 2 - 3, cruTop);
    ctx.closePath();
    ctx.clip();
    const depth = 9 + clamp(s.m / M0, 0, 1.05) * 24; // the pile shrinks as water leaves
    const surfY = cruBot - 3 - depth;
    const pG = ctx.createLinearGradient(0, surfY, 0, cruBot);
    pG.addColorStop(0, powderColour);
    pG.addColorStop(1, shadeColour(powderColour, -0.22));
    ctx.fillStyle = pG;
    ctx.fillRect(bx - mouthW / 2, surfY, mouthW, cruBot - surfY + 4);
    // heaped surface + crystal texture
    ctx.beginPath();
    ctx.moveTo(bx - mouthW / 2, surfY);
    ctx.quadraticCurveTo(bx, surfY - 7, bx + mouthW / 2, surfY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 16; i += 1) {
      const rx = bx - mouthW / 2 + 4 + ((i * 37) % (mouthW - 8));
      const ry = surfY + 2 + ((i * 23) % Math.max(4, cruBot - surfY - 4));
      ctx.fillRect(rx, ry, 2, 2);
    }
    // rehydration flash rings
    for (const fl of s.flashes) {
      const a = clamp(1 - fl.age / 0.9, 0, 1);
      ctx.strokeStyle = `rgba(60,140,220,${a * 0.8})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(fl.x, surfY + 4, 6 + fl.age * 46, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // ---------------- thermometer clipped to the crucible wall ----------------
    const thx = bx + mouthW / 2 + 22;
    ctx.strokeStyle = '#8d99a6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(thx, g.benchY - 2);
    ctx.lineTo(thx, cruTop - 26);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(thx, cruTop - 22);
    ctx.lineTo(bx + mouthW / 2 - 8, cruTop + 10);
    ctx.stroke();
    ctx.fillStyle = '#f4f7fa';
    roundRect(ctx, thx - 4, cruTop - 26, 8, 64, 4);
    ctx.fill();
    ctx.strokeStyle = '#9fb0bd';
    ctx.lineWidth = 1.25;
    roundRect(ctx, thx - 4, cruTop - 26, 8, 64, 4);
    ctx.stroke();
    ctx.strokeStyle = '#b9c4cf';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const ty = cruTop - 18 + (i / 5) * 50;
      ctx.beginPath();
      ctx.moveTo(thx - 4, ty);
      ctx.lineTo(thx - 1, ty);
      ctx.stroke();
    }
    const tFrac = clamp(s.T / 550, 0.02, 1);
    const colTop = cruTop + 34 - tFrac * 56;
    ctx.fillStyle = '#e8443a';
    roundRect(ctx, thx - 1.75, colTop, 3.5, cruTop + 34 - colTop, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(thx, cruTop + 38, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // ---------------- steam wisps ----------------
    for (const p of s.steam) {
      const a = clamp(0.42 * (1 - p.age / p.life), 0, 1);
      ctx.fillStyle = `rgba(213,226,235,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---------------- condensation under a fully-on lid ----------------
    if (s.lid.state === 'on') {
      ctx.fillStyle = 'rgba(170,205,225,0.9)';
      for (let i = -2; i <= 2; i += 1) {
        const grow = 1.4 + 1.1 * (0.5 + 0.5 * Math.sin(s.time * 2 + i * 1.7));
        ctx.beginPath();
        ctx.arc(bx + i * 11, cruTop + 9, grow, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const cd of s.condens) {
      ctx.fillStyle = 'rgba(150,195,220,0.95)';
      ctx.beginPath();
      ctx.arc(cd.x, cd.y, cd.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---------------- spitting flecks ----------------
    for (const f of s.flecks) {
      ctx.fillStyle = shadeColour(powderColour, -0.35);
      ctx.fillRect(f.x - 1.6, f.y - 1.6, 3.2, 3.2);
    }

    // ---------------- dropper drops in flight ----------------
    for (const d of s.drops) {
      ctx.fillStyle = 'rgba(120,180,225,0.95)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 4.2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ---------------- lid (on / ajar / off / dragging) ----------------
    ctx.save();
    ctx.translate(s.lid.x, s.lid.y);
    ctx.rotate(s.lid.tilt);
    const lidG = ctx.createLinearGradient(-30, -8, 30, 6);
    lidG.addColorStop(0, '#e8edf1');
    lidG.addColorStop(0.5, '#f8fafc');
    lidG.addColorStop(1, '#d3dbe1');
    ctx.fillStyle = lidG;
    ctx.beginPath();
    ctx.ellipse(0, 0, 33, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a9b6c1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // knob
    ctx.fillStyle = '#eef2f5';
    ctx.beginPath();
    ctx.ellipse(0, -6, 8, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b9c4cf';
    ctx.stroke();
    ctx.restore();

    // ---------------- analytical balance ----------------
    const balW = g.balW;
    const balH = 58;
    const balY = g.benchY - balH - 8;
    // body
    const balG = ctx.createLinearGradient(0, balY, 0, balY + balH);
    balG.addColorStop(0, '#f2f5f8');
    balG.addColorStop(1, '#ccd5dd');
    ctx.fillStyle = balG;
    roundRect(ctx, g.balX - balW / 2, balY, balW, balH, 9);
    ctx.fill();
    ctx.strokeStyle = '#9aa8b4';
    ctx.lineWidth = 1.5;
    roundRect(ctx, g.balX - balW / 2, balY, balW, balH, 9);
    ctx.stroke();
    // feet
    ctx.fillStyle = '#5d6a79';
    roundRect(ctx, g.balX - balW / 2 + 10, g.benchY - 9, 12, 9, 3);
    ctx.fill();
    roundRect(ctx, g.balX + balW / 2 - 22, g.benchY - 9, 12, 9, 3);
    ctx.fill();
    // pan + shield stub
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.balX, balY);
    ctx.lineTo(g.balX, balY - 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(g.balX, balY - 14, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a9bfc9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // segment display — the reading as a bar of ticks (numbers live in the sidebar)
    const segs = 14;
    const filled = clamp((s.m + (s.lid.state === 'off' && s.T > 150 ? Math.sin(s.t * 21) * 0.02 : 0) - 2.4) / 2.7, 0, 1) * segs;
    for (let i = 0; i < segs; i += 1) {
      const sx = g.balX - balW / 2 + 12 + i * ((balW - 24) / segs);
      const on = i < Math.round(filled) + (i === Math.round(filled) && Math.random() < 0.4 ? 1 : 0);
      ctx.fillStyle = on ? '#2f7fb8' : '#dde4ea';
      roundRect(ctx, sx, balY + 14, (balW - 24) / segs - 3, 10, 2);
      ctx.fill();
    }
    // live LED
    const led = 0.55 + 0.45 * Math.sin(s.time * 3.4);
    ctx.fillStyle = `rgba(52,199,89,${led})`;
    ctx.beginPath();
    ctx.arc(g.balX + balW / 2 - 12, balY + 19, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // ---------------- water dropper on its stand ----------------
    const dr = s.dropper;
    const sq = dr.squeeze;
    // stand
    ctx.strokeStyle = '#8d99a6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.dropParkX, g.benchY - 2);
    ctx.lineTo(g.dropParkX, g.benchY - 84);
    ctx.lineTo(g.dropParkX - 16, g.benchY - 84);
    ctx.stroke();
    // affordance halo when the white powder waits for water
    if (s.locked && s.wAdd < 0.4 && wD <= 0.5) {
      ctx.strokeStyle = `rgba(249,115,22,${0.35 + 0.25 * Math.sin(s.time * 4)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -s.time * 18;
      ctx.beginPath();
      ctx.arc(dr.x, dr.y + 6, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    // glass tube
    ctx.fillStyle = 'rgba(220,238,248,0.75)';
    roundRect(ctx, dr.x - 5, dr.y - 8, 10, 40, 4);
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 1.5;
    roundRect(ctx, dr.x - 5, dr.y - 8, 10, 40, 4);
    ctx.stroke();
    // water inside
    ctx.fillStyle = 'rgba(140,195,230,0.9)';
    roundRect(ctx, dr.x - 3, dr.y + 4, 6, 22, 2);
    ctx.fill();
    // tip
    ctx.fillStyle = 'rgba(220,238,248,0.9)';
    ctx.beginPath();
    ctx.moveTo(dr.x - 4, dr.y + 31);
    ctx.lineTo(dr.x + 4, dr.y + 31);
    ctx.lineTo(dr.x, dr.y + 40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    // swelling drop at the tip while squeezing
    if (sq > 0.05) {
      ctx.fillStyle = 'rgba(120,180,225,0.95)';
      ctx.beginPath();
      ctx.arc(dr.x, dr.y + 40 + sq * 5, 2 + sq * 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // rubber bulb (squashes as you squeeze)
    ctx.fillStyle = '#d97d62';
    ctx.beginPath();
    ctx.ellipse(dr.x, dr.y - 16 - (1 - sq) * 0 + 0, 8 - sq * 2.2, 11 - sq * 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a4573f';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // drag affordances
    if (s.lid.held || dr.held) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(232,99,42,0.5)';
      ctx.lineWidth = 1.5;
      if (s.lid.held) {
        ctx.beginPath();
        ctx.moveTo(g.A - 4, g.mouthY - 5);
        ctx.lineTo(g.lidParkX, g.benchY - 4);
        ctx.stroke();
      }
      if (dr.held && dropperOverPowder(s)) {
        ctx.beginPath();
        ctx.arc(g.A, g.mouthY + 6, 36, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [geom, dropperOverPowder]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction -----------------------------------------------------------
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
    const s = sim.current;
    const g = geom();

    // the Bunsen valve — press to light, keep holding for the hotter roar
    const valveX = g.A - 22;
    const valveY = g.benchY - 44;
    if (Math.hypot(p.x - valveX, p.y - valveY) < 26) {
      s.valveHold = 0;
      s.valvePressLit = s.flame !== 'off';
      if (s.flame === 'off') setFlame('gentle');
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      notePointer(true);
      return;
    }

    // the crucible lid — wherever it currently sits
    if (Math.hypot(p.x - s.lid.x, p.y - s.lid.y) < 30) {
      s.lid.held = true;
      s.lid.grabDX = p.x - s.lid.x;
      s.lid.grabDY = p.y - s.lid.y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.glassClink(true);
      notePointer(true);
      return;
    }

    // the glass dropper
    if (Math.hypot(p.x - s.dropper.x, p.y - (s.dropper.y - 6)) < 34) {
      s.dropper.held = true;
      s.dropper.auto = null;
      s.dropper.grabDX = p.x - s.dropper.x;
      s.dropper.grabDY = p.y - s.dropper.y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.3);
      notePointer(true);
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = sim.current;
    const g = geom();
    if (s.lid.held) {
      s.lid.x = p.x - s.lid.grabDX;
      s.lid.y = Math.min(g.benchY - 6, Math.max(g.mouthY - 60, p.y - s.lid.grabDY));
      s.lid.tilt = -0.18 + 0.66 * clamp((s.lid.x - g.A) / (g.lidParkX - g.A), 0, 1);
      if (s.time - s.dragSoundAt > 0.14) {
        labSound.slide(0.25);
        s.dragSoundAt = s.time;
      }
    } else if (s.dropper.held) {
      s.dropper.x = p.x - s.dropper.grabDX;
      s.dropper.y = Math.min(g.benchY - 60, Math.max(40, p.y - s.dropper.grabDY));
      if (s.time - s.dragSoundAt > 0.16) {
        labSound.creak(0.12);
        s.dragSoundAt = s.time;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const g = geom();
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }

    // valve release: a short tap on a lit burner closes it (a 0.8 s hold has
    // already stepped the flame up; a press from off keeps its gentle light)
    if (s.valveHold >= 0) {
      const pressLit = s.valvePressLit;
      s.valveHold = -1;
      s.valvePressLit = false;
      if (pressLit) setFlame('off');
      return;
    }

    if (s.lid.held) {
      s.lid.held = false;
      // the drop zone decides the rest: near the mouth → on or ajar; lower → the bench
      let best: LidState;
      if (s.lid.y < g.mouthY + 42) {
        best = Math.abs(s.lid.x - g.A) < 14 ? 'on' : 'ajar';
      } else {
        best = 'off';
      }
      setLid(best);
      return;
    }

    if (s.dropper.held) {
      s.dropper.held = false;
      s.dropper.squeeze = 0;
    }
  };

  // ---- keyboard alternative -----------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.repeat) return;
    const s = sim.current;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setFlame(s.flame === 'off' ? 'gentle' : 'off');
      notePointer(true);
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      setFlame(s.flame === 'hot' ? 'gentle' : 'hot');
      notePointer(true);
    } else if (e.key.toLowerCase() === 'l') {
      e.preventDefault();
      const order: LidState[] = ['on', 'ajar', 'off'];
      const idx = order.indexOf(s.lid.state);
      setLid(order[(idx + 1) % 3]);
      notePointer(true);
    } else if (e.key.toLowerCase() === 'd') {
      e.preventDefault();
      squeezeDrop();
      notePointer(true);
    }
  };

  // ---- derived view data ---------------------------------------------------------------
  const stage = stageInfo(ui.wD, ui.wAdd, ui.c);
  const powderCss = colourAt(ui.wVis, ui.c);
  const wAddG = ui.wAdd * W_PER_X; // grams of water added back by the dropper
  const spoilt = ui.locked && (ui.verdict === 'spat' || ui.verdict === 'decomposed');
  const lockRow = ui.locked ? { t: ui.lockT, m: ui.lockM } : null;
  const plotPoints = rows.map((r) => ({ x: r.T, y: r.m }));
  const plotLive = ui.t > 0 ? { x: Math.round(ui.T), y: Math.round(ui.mDisp * 100) / 100 } : null;
  const dropEnabled = ui.wD < 1.2 || ui.locked;

  // ---- coach ------------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.c > 0.03) {
      return { tone: 'warn', line: 'The powder is darkening to black copper(II) oxide — that is decomposition, not dehydration. The mass will keep drifting below 3.20 g; reset and redo with gentle heat.' };
    }
    if (ui.T > 320 && ui.flame === 'hot' && ui.wD > WHITE_W) {
      return { tone: 'warn', line: `The crucible is at ${ui.T.toFixed(0)} °C and climbing — past about 300 °C the white salt starts breaking down. Either ease back to gentle or stop the moment it turns white.` };
    }
    if (ui.spitting) {
      return { tone: 'warn', line: 'With the lid fully off, crystals are spitting and the balance jumps about. Slide the lid back to ajar — a small gap lets steam out but keeps the crystals in.' };
    }
    if (ui.lid === 'on' && ui.steaming) {
      return { tone: 'warn', line: 'See the condensation under the lid? Steam is condensing and dripping back — the water cannot leave, so the mass barely falls. Slide the lid slightly ajar.' };
    }
    if (ui.locked && ui.verdict === 'early') {
      return { tone: 'info', line: 'You locked while the powder still held water — x came out low. Resume the heating and lock again once it is truly white.' };
    }
    if (ui.wD <= WHITE_W && !ui.locked) {
      return { tone: 'good', line: 'White — that is anhydrous copper(II) sulfate. Stop heating now and lock the final mass; every extra second of hard flame risks darkening it.' };
    }
    if (ui.steaming && !ui.locked) {
      const lost = 5 - ui.wD;
      return { tone: 'info', line: `Steam is pouring off and the balance is sliding down (${(lost).toFixed(1)} waters gone, reading ${ui.mDisp.toFixed(2)} g). Pale blue means the first waters are leaving; white means the last one has gone too.` };
    }
    if (ui.flame !== 'off' && !ui.steaming && !ui.locked) {
      return { tone: 'info', line: `The crucible is climbing through ${ui.T.toFixed(0)} °C. The first waters let go slowly around 100 °C — patience here, the last one waits for about 250 °C.` };
    }
    if (ui.locked && ui.verdict === 'clean' && ui.wAdd < 0.4) {
      return { tone: 'good', line: `x = ${ui.lockX.toFixed(2)} — the blue crystals were CuSO₄·5H₂O all along. Now for the magic: drag the water dropper over the white powder and squeeze.` };
    }
    if (ui.wAdd >= 0.4 && ui.wAdd < REHYD_W) {
      return { tone: 'good', line: 'Feel that hiss — hydrating anhydrous copper(II) sulfate releases heat, and the blue is flooding back. Keep squeezing until the colour is vivid.' };
    }
    if (ui.wAdd >= REHYD_W) {
      return { tone: 'good', line: 'Vivid blue again — the water of crystallisation is back in the lattice, and the balance climbed as you added it. The cycle is complete.' };
    }
    if (!mentorAcked) {
      return { tone: 'info', line: 'The balance is tared with the empty crucible: 5.00 g of blue copper(II) sulfate crystals. Light the burner gently to drive the water out.' };
    }
    return { tone: 'info', line: 'Light the burner gently — tap the valve on the burner, or use the flame control. Blue to white is a story the balance will tell gram by gram.' };
  }, [ui, mentorAcked]);

  // ---- status ------------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusTone: 'ready' | 'active' | 'complete' | 'warn' = ui.c > 0.03 || ui.spitting
    ? 'warn'
    : complete
      ? 'complete'
      : ui.flame !== 'off'
        ? 'active'
        : 'ready';
  const statusText = complete
    ? 'Blue returned — cycle complete'
    : ui.c > 0.03
      ? 'Decomposing — redo recommended'
      : ui.locked && ui.verdict === 'clean'
        ? `Final mass locked · ${ui.lockM.toFixed(2)} g`
        : ui.wD <= WHITE_W
          ? 'White — stop heating now'
          : ui.steaming
            ? 'Steaming — mass falling'
            : ui.flame !== 'off'
              ? 'Heating the crucible'
              : ui.t > 0
                ? 'Burner off — paused'
                : 'Experiment ready';

  // ---- render --------------------------------------------------------------------------------
  const lockLabel = ui.locked
    ? ui.verdict === 'clean'
      ? `✓ Final mass locked — ${ui.lockM.toFixed(2)} g`
      : spoilt
        ? '⚠ Run spoilt — press Reset to redo'
        : '↺ Keep heating — resume the run'
    : ui.wAdd > 0.4
      ? '⚠ Water added — reset to weigh cleanly'
      : ui.t > 3
        ? `⏹ Stop heating · lock final mass (${ui.mDisp.toFixed(2)} g)`
        : 'Light the burner to begin the run';
  const massTrack = clamp(((ui.mDisp - 2.9) / 2.2) * 100, 0, 100);

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Quantitative chemistry"
      legend={[
        { color: '#2a76c8', label: 'Blue hydrate' },
        { color: '#f7f5f0', label: 'Anhydrous white' },
        { color: '#3a3a3e', label: 'CuO (overheated)' },
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
          aria-label="Dehydration bench — tap or hold the Bunsen valve to light the flame, drag the crucible lid on or off, and drag the water dropper over the white powder to rehydrate it"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="cry-layout">
            <div className="cry-actions">
              <div className="cry-seg" data-nudge="flame">
                <span>BURNER FLAME</span>
                <div className="cry-seg-row" role="group" aria-label="Burner flame level">
                  {(['off', 'gentle', 'hot'] as Flame[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={ui.flame === f ? 'active' : ''}
                      onClick={() => { setFlame(f); notePointer(true); }}
                    >
                      {f === 'off' ? 'Off' : f === 'gentle' ? 'Gentle' : 'Hot'}
                    </button>
                  ))}
                </div>
                <small>Tap the valve on the burner to light it; hold the valve for the hotter roar.</small>
              </div>
              <div className="cry-seg" data-nudge="lid">
                <span>CRUCIBLE LID</span>
                <div className="cry-seg-row" role="group" aria-label="Crucible lid position">
                  {(['on', 'ajar', 'off'] as LidState[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={ui.lid === l ? 'active' : ''}
                      onClick={() => { setLid(l); notePointer(true); }}
                    >
                      {l === 'on' ? 'On' : l === 'ajar' ? 'Ajar' : 'Off'}
                    </button>
                  ))}
                </div>
                <small>Ajar lets the steam escape without letting crystals spit — or drag the lid in the scene.</small>
              </div>
              <div className="cry-btn-row">
                <button
                  className="record-button"
                  type="button"
                  data-nudge="record"
                  onClick={() => { lockRun(); notePointer(true); }}
                  disabled={ui.t <= 3 || (ui.locked && ui.verdict === 'clean') || spoilt || ui.wAdd > 0.4}
                >
                  {lockLabel}
                </button>
                <button
                  className="action-button"
                  type="button"
                  data-nudge="stage"
                  onClick={() => { recordStage(); notePointer(true); }}
                  disabled={ui.t <= 2}
                >
                  <span className="dispense-icon" aria-hidden="true">✎</span>
                  <span>Record stage reading</span>
                  <small>stage · colour · temperature · mass</small>
                </button>
              </div>
              <button
                className="action-button cry-drop-btn"
                type="button"
                data-nudge="dropper"
                onClick={() => { squeezeDrop(); notePointer(true); }}
                disabled={!dropEnabled || ui.wAdd >= 5}
              >
                <span className="dispense-icon" aria-hidden="true">💧</span>
                <span>{ui.wAdd >= 5 ? 'Powder fully hydrated' : 'Squeeze a drop onto the powder'}</span>
                <small>{dropEnabled ? 'or drag the dropper over the crucible and hold' : 'unlocks as the powder whitens'}</small>
              </button>
            </div>
            <div className="cry-balance">
              <span>ANALYTICAL BALANCE · TARED WITH THE EMPTY CRUCIBLE</span>
              <div className="cry-balance-main">
                <strong className={ui.locked ? 'locked' : ''}>{ui.mDisp.toFixed(2)}</strong>
                <em>g</em>
              </div>
              <div className="cry-track"><span style={{ width: `${massTrack}%` }} /></div>
              <div className="cry-scale"><span>2.9 g</span><span>5.1 g</span></div>
              <div className="cry-sub">
                <span>{fmtClock(ui.t)} heated</span>
                <span>{ui.flame === 'off' ? 'burner off' : ui.flame === 'gentle' ? 'gentle flame' : 'hot flame'}</span>
                <span>lid {ui.lid}</span>
              </div>
              <div className="cry-stage-chip">
                <i style={{ background: powderCss }} />
                <span>{stage}</span>
              </div>
            </div>
          </div>
          <div className="hint-row">
            <span>✦</span>
            <p style={{ margin: 0 }}>Keyboard: Space lights or kills the flame, H toggles hot, L cycles the lid, D squeezes a drop. Steam should escape — lid ajar, never fully off, and never sealed on.</p>
          </div>
        </div>
      }
      sidebarTop={
        <>
          <section className="instrument-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Dehydration bench</h2></div><span className="instrument-live">LIVE</span></div>
            <div className="reading-main">
              <span>Balance reading (crucible tared)</span>
              <strong>{ui.mDisp.toFixed(2)} <small>g</small></strong>
              <div className="reading-track"><span style={{ width: `${massTrack}%` }} /></div>
              <div className="reading-scale"><span>2.9 g</span><span>5.1 g</span></div>
            </div>
            <div className="reading-grid">
              <div><span>Temperature</span><strong>{ui.T.toFixed(0)} <small>°C</small></strong></div>
              <div><span>Peak reached</span><strong>{ui.Tpeak.toFixed(0)} <small>°C</small></strong></div>
              <div><span>Waters left</span><strong>{Math.max(0, ui.wD).toFixed(2)} <small>of 5</small></strong></div>
              <div><span>Clock</span><strong>{fmtClock(ui.t)}</strong></div>
              <div><span>Flame</span><strong>{ui.flame === 'off' ? 'Off' : ui.flame === 'gentle' ? 'Gentle' : 'Hot'}</strong></div>
              <div><span>Lid</span><strong>{ui.lid === 'on' ? 'On' : ui.lid === 'ajar' ? 'Ajar' : 'Off'}</strong></div>
              <div><span>Spat crystals</span><strong>{ui.spit > 0.005 ? <>{ui.spit.toFixed(3)} <small>g</small></> : 'None'}</strong></div>
              <div><span>Water added back</span><strong>{ui.wAdd > 0.01 ? <>{wAddG.toFixed(2)} <small>g</small></> : '—'}</strong></div>
            </div>
            {ui.locked && (
              <div className="cry-x-readout">
                <span>YOUR RESULT</span>
                <strong>{ui.lockX.toFixed(2)} <small>→ CuSO₄·{ui.lockX.toFixed(1)}H₂O</small></strong>
                <p>{ui.lockPct.toFixed(1)}% of the charge was water · final mass {ui.lockM.toFixed(2)} g · full working in Observations.</p>
              </div>
            )}
          </section>
          <section className="instrument-card cry-chart-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE TRACE</span><h2>Hydration curve</h2></div><span className="instrument-live">LIVE</span></div>
            <HydrationChart samplesRef={sim} lock={lockRow} tick={ui.t} />
            <p className="cry-chart-note">Balance reading against time — the curve is painted in the powder&apos;s own colour as it marches blue → pale blue → white (and back). Dashed guides mark the 5.00 g charge and the 3.20 g anhydrous mass.</p>
          </section>
        </>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Check the tared balance: 5.00 g of blue copper(II) sulfate crystals in the crucible.</li>
              <li>Light the burner gently — tap the valve in the scene or use the flame control. Begin with Gentle.</li>
              <li>Set the lid slightly ajar so steam escapes without spitting, and heat until the powder is truly white.</li>
              <li>Press “Stop heating · lock final mass” the moment it is white — around 3.20 g should remain.</li>
              <li>Open Observations and read your x calculation, then drag the water dropper over the white powder and squeeze the blue back.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Speed playback to 2× or 4× to walk the whole curve quickly — the simulated clock, chemistry and balance all stay consistent. Record a stage reading at each colour change to build your table.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Stage readings</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Press “Record stage reading” whenever the colour changes — stage, colour, temperature and mass land here, and each row stamps a point on the mass–temperature plot below.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Stage</th><th>Colour</th><th>T (°C)</th><th>Mass (g)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td className="cry-stage-cell">{r.stage}</td>
                      <td><span className="cry-swatch" style={{ background: r.colour }} /></td>
                      <td>{r.T}</td>
                      <td>{r.m.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Mass against temperature</h3>
                <Plot points={plotPoints} livePoint={plotLive} xLabel="temperature (°C)" yLabel="mass (g)" height={200} />
                <p className="observation-note">Each stamp is one recorded stage. Unlike a pure substance melting, there is no flat plateau here — the mass simply falls as the temperature climbs, because water leaves continuously, not all at once.</p>
              </>
            )}
            <h3 style={{ marginTop: 16 }}>The x calculation</h3>
            {ui.locked ? (
              <div className="cry-calc">
                <div className="cry-calc-grid">
                  <div><span>Charge mass, m₁</span><strong>{M0.toFixed(2)} g</strong></div>
                  <div><span>Final mass, m₂</span><strong>{ui.lockM.toFixed(2)} g</strong></div>
                  <div><span>Mass lost, Δm = m₁ − m₂</span><strong>{(M0 - ui.lockM).toFixed(2)} g</strong></div>
                  <div><span>Water in the charge</span><strong>{ui.lockPct.toFixed(1)} %</strong></div>
                  <div><span>n(H₂O) = Δm / 18.0</span><strong>{((M0 - ui.lockM) / M_WATER).toFixed(4)} mol</strong></div>
                  <div><span>n(CuSO₄) = m₂ / 159.6</span><strong>{(ui.lockM / M_ANH).toFixed(4)} mol</strong></div>
                </div>
                <div className="cry-calc-x">
                  <span>x = n(H₂O) ÷ n(CuSO₄)</span>
                  <strong>{ui.lockX.toFixed(2)} → CuSO₄·{ui.lockX.toFixed(1)}H₂O</strong>
                </div>
                <p className={`cry-verdict ${ui.verdict === 'clean' ? 'good' : 'bad'}`}>
                  {ui.verdict === 'clean' && `Clean run — x = ${ui.lockX.toFixed(2)} sits within ±0.1 of 5.0, so the blue crystals were copper(II) sulfate pentahydrate, CuSO₄·5H₂O. The ${(M0 - ui.lockM).toFixed(2)} g you drove off was (about) five waters of crystallisation.`}
                  {ui.verdict === 'early' && `Stopped early — the powder still held about ${ui.lockW.toFixed(1)} of its 5 waters when you locked, so Δm is too small and x falls short of 5. Resume the heating, drive to true white, and lock again.`}
                  {ui.verdict === 'spat' && `Crystals spat while the lid was fully off, so the balance lost copper(II) sulfate as well as water — Δm is too big and x overshoots. Keep the lid ajar and redo.`}
                  {ui.verdict === 'decomposed' && `Overheated — black copper(II) oxide formed, and escaping sulfur trioxide carried mass away below the true anhydrous value. Reset the bench and heat gently to redo.`}
                </p>
              </div>
            ) : (
              <p className="observation-note">Lock the final mass first — the calculation card fills in from your own recorded readings: n(H₂O) = Δm/18.0, n(CuSO₄) = m₂/159.6, and x = their ratio.</p>
            )}
            <p className="observation-note">A 5.00 g charge of CuSO₄·5H₂O holds 5 × 18.0 g of water for every 249.7 g of hydrate — about 36% by mass. Your two balance readings are all the formula needs.</p>
          </>
        ),
        theory: (
          <>
            <h3>Water of crystallisation</h3>
            <p>Many salts trap a fixed number of water molecules inside their crystal lattice — not as puddles, but locked into positions that help hold the structure together. Copper(II) sulfate is the classic example: each formula unit carries five waters, written CuSO₄·5H₂O and called the pentahydrate. Those waters are why the crystals are blue; strip them out and the remaining CuSO₄ lattice is white.</p>
            <div className="equation">CuSO₄·5H₂O (blue) → CuSO₄ (white) + 5H₂O (steam)</div>
            <p>Because the count is fixed, the mass balance gives it away. Weigh the hydrate, drive off every water with heat, weigh again, and the lost mass is the water:</p>
            <div className="equation">x = (Δm / 18.0) ÷ (m₂ / 159.6)</div>
            <p>With m₁ = 5.00 g and m₂ = 3.20 g, Δm = 1.80 g: that is 0.100 mol of water against 0.0201 mol of copper(II) sulfate, so x = 5 and the salt was CuSO₄·5H₂O. The waters leave in stages — the first four drift off by around 100–150 °C (the pale-blue trihydrate forms on the way), while the last one clings until roughly 250 °C, which is why the whitening is the slow part.</p>
            <h3>Traps on a real bench</h3>
            <p>Three things corrupt the numbers. A fully-open crucible lets steam carry tiny crystals out with it — spitting — so the balance loses solid as well as water and x overshoots; keep the lid slightly ajar. A sealed lid recondenses the steam and drips it back, so the mass never falls. And pushing the flame too hard past white decomposes the anhydrous salt — CuSO₄ → CuO + SO₃ — turning the powder black, venting mass as sulfur trioxide, and dragging x far above 5. Gentle heat, lid ajar, stop at white: that is the whole craft.</p>
            <p>Add the water back afterwards and the reaction runs in reverse — the powder flashes blue and the crucible grows hot, because hydration of anhydrous copper(II) sulfate is strongly exothermic. The same white dust is used as a drying agent precisely because it grabs water so eagerly.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && ui.locked) setSawCalc(true); }}
    />
  );
}

// ---- sidebar chart: the hydration curve -------------------------------------------------
// Balance reading against time, stroked in the powder's own colour at each
// sample, with dashed guides at the 5.00 g charge and the 3.20 g anhydrous mass.
function HydrationChart(props: { samplesRef: React.RefObject<Sim>; lock: { t: number; m: number } | null; tick: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderRef = useRef<() => void>(() => {});

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
    const height = 185;

    const render = () => {
      const samples = props.samplesRef.current?.samples ?? [];
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, rect.width);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { l: 42, r: 14, t: 12, b: 30 };
      const iw = w - pad.l - pad.r;
      const ih = height - pad.t - pad.b;
      ctx.clearRect(0, 0, w, height);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const tMax = Math.max(60, Math.ceil(Math.max(60, samples.length ? samples[samples.length - 1].t : 0) / 30) * 30);
      const yMin = 1.2; // low enough to show a decomposition drift below the 3.20 g guide
      const yMax = 5.2;
      const sx = (t: number) => pad.l + (t / tMax) * iw;
      const sy = (m: number) => pad.t + ih - ((m - yMin) / (yMax - yMin)) * ih;

      // grid + labels
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
        ctx.fillText(`${Math.round((tMax * i) / 4)}s`, x, height - pad.b + 14);
        ctx.textAlign = 'right';
        ctx.fillText((yMin + ((yMax - yMin) * i) / 4).toFixed(1), pad.l - 6, y + 3);
      }
      // guides at 5.00 g and 3.20 g
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#c3ccd6';
      ctx.lineWidth = 1.5;
      for (const gv of [5.0, 3.2]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, sy(gv));
        ctx.lineTo(pad.l + iw, sy(gv));
        ctx.stroke();
      }
      ctx.setLineDash([]);

      ctx.strokeStyle = '#c5cdd6';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('time since the start (s)', pad.l + iw / 2, height - 4);
      ctx.save();
      ctx.translate(10, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('balance (g)', 0, 0);
      ctx.restore();

      // the colour-mapped curve
      if (samples.length > 1) {
        const stride = Math.max(1, Math.ceil(samples.length / 600));
        for (let i = stride; i < samples.length; i += stride) {
          const a = samples[i - stride];
          const b = samples[i];
          ctx.strokeStyle = colourAt(b.w, b.c);
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(sx(a.t), sy(a.m));
          ctx.lineTo(sx(b.t), sy(b.m));
          ctx.stroke();
        }
        const last = samples[samples.length - 1];
        ctx.fillStyle = colourAt(last.w, last.c);
        ctx.beginPath();
        ctx.arc(sx(last.t), sy(last.m), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // the locked final mass — a diamond stamp
      if (props.lock) {
        const x = sx(props.lock.t || (samples.length ? samples[samples.length - 1].t : 0));
        const y = sy(props.lock.m);
        ctx.fillStyle = '#e8632a';
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    renderRef.current = render;
    render();
  }, [props.samplesRef, props.lock, props.tick]);

  return (
    <canvas
      ref={canvasRef}
      className="lab-plot"
      style={{ width: '100%', height: 185 }}
      aria-label="Balance reading against time, coloured by the powder colour"
    />
  );
}

// ---- small canvas helper -------------------------------------------------------------
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadeColour(cssRgb: string, k: number): string {
  const m = cssRgb.match(/(\d+),(\d+),(\d+)/);
  if (!m) return cssRgb;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(Number(m[1]))},${f(Number(m[2]))},${f(Number(m[3]))})`;
}
