import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp, fmtClock } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './separation-methods.css';

/**
 * Separation bench — one muddy mixture, five physical techniques.
 *
 * The work beaker holds sand, iron filings and salt in water; a second bowl
 * holds ammonium chloride mixed with salt. The student picks a separation
 * goal, then DRAGS apparatus from the tray onto the right sample: the magnet
 * comets the filings out, the funnel filters the sand, the evaporating dish
 * boils the filtrate dry and grows salt crystals, the distillation rig drips
 * pure condensate into a receiver while a thermometer pins near 100 °C, and
 * the hot plate + cold dome sublimes the ammonium chloride. Every technique
 * exploits exactly one property difference — that is the whole lesson.
 */

// ---------------------------------------------------------------- constants

const IRON_START = 12; // g of iron filings in the work beaker
const SAND_START = 14; // g of sand
const SALT_START = 9; // g of dissolved salt
const WATER_START = 210; // mL of water
const NH4CL_START = 8; // g of ammonium chloride in the bowl
const BOWL_SALT_START = 6; // g of salt mixed into the bowl
const MIN_POUR = 40; // mL needed before a boiling technique can start
const COLLECT_GOAL = 25; // mL of distillate that completes the water goal
const BITS = 16; // iron filing particles that fly to the magnet

type ToolId = 'magnet' | 'funnel' | 'dish' | 'distil' | 'hotplate';
type GoalId = 'iron' | 'sand' | 'salt' | 'water' | 'nh4cl';
type Station = 'work' | 'bowl';

interface ToolDef { id: ToolId; name: string; glyph: string; blurb: string; home: Station }
interface GoalDef { id: GoalId; label: string; property: string; hint: string; icon: string }

const TOOLS: ToolDef[] = [
  { id: 'magnet', name: 'Bar magnet', glyph: '🧲', blurb: 'pulls magnetic solids', home: 'work' },
  { id: 'funnel', name: 'Funnel + filter paper', glyph: '▽', blurb: 'traps what cannot dissolve', home: 'work' },
  { id: 'dish', name: 'Evaporating dish + burner', glyph: '♨', blurb: 'boils the solvent away', home: 'work' },
  { id: 'distil', name: 'Distillation flask + condenser', glyph: '≋', blurb: 'boils, then condenses', home: 'work' },
  { id: 'hotplate', name: 'Hot plate + cold dome', glyph: '◉', blurb: 'for sublimation', home: 'bowl' },
];

const GOALS: GoalDef[] = [
  { id: 'iron', label: 'Remove the iron filings', property: 'Magnetism', icon: '🧲', hint: 'Iron is the only magnetic substance in the beaker — the bar magnet will pull the filings straight out.' },
  { id: 'sand', label: 'Remove the sand', property: 'Insolubility', icon: '▽', hint: 'Sand will not dissolve. Filter paper lets liquid through and traps every insoluble grain.' },
  { id: 'salt', label: 'Recover the salt', property: 'Boiling point of the solvent', icon: '♨', hint: 'Dissolved salt cannot evaporate — boil the water away in the evaporating dish and the salt stays behind.' },
  { id: 'water', label: 'Collect pure water', property: 'Boiling point', icon: '≋', hint: 'Water boils at about 100 °C and leaves the salt behind; the condenser turns the vapour back to liquid.' },
  { id: 'nh4cl', label: 'Separate the ammonium chloride', property: 'Sublimation', icon: '◉', hint: 'Ammonium chloride skips the liquid stage — warm the bowl under a cold dome and it recrystallises on the glass.' },
];

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'goal', title: 'Choose a goal', detail: 'Pick one separation goal from the selector — iron, sand, salt, water or the ammonium chloride. Each hides a different property difference.', hint: 'The goal selector sits in the control panel, just under the scene.' },
  { id: 'iron', title: 'Magnet out the iron', detail: 'Drag the bar magnet onto the work beaker. Iron is the only magnetic thing in there — the filings leap to it in a comet trail.', hint: 'The magnet lives on the apparatus tray at the bottom — drag it up onto the beaker.' },
  { id: 'sand', title: 'Filter out the sand', detail: 'Drag the funnel and filter paper onto the beaker. The liquid threads through the paper; the sand stays behind as residue.', hint: 'Insolubility is the property doing the work — sand will not dissolve.' },
  { id: 'salt', title: 'Evaporate to recover salt', detail: 'Half of your clear filtrate pours into the evaporating dish. Boil it dry and white cubic salt crystals grow.', hint: 'The salt cannot evaporate — only the water leaves.' },
  { id: 'water', title: 'Distil to collect pure water', detail: 'The distillation flask takes half of the remaining filtrate and boils it — the condenser drips pure water into the receiver while the salt stays behind.', hint: 'Watch the thermometer at the still head — water boils at about 100 °C.' },
  { id: 'nh4cl', title: 'Sublime the ammonium chloride', detail: 'Take the hot plate and cold dome to the little bowl on the right. The ammonium chloride vaporises and re-crystallises on the dome; the salt stays put.', hint: 'Sublimation: solid straight to gas, skipping the liquid entirely.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-clean', title: 'First clean separation', icon: '✦', detail: 'Completed your first separation goal.' },
  { id: 'full-bench', title: 'Whole bench', icon: '🧰', detail: 'Used all five techniques effectively in one session.' },
  { id: 'sure-handed', title: 'Sure-handed', icon: '🎯', detail: 'Three techniques in without ever picking a useless one twice in a row.' },
  { id: 'splitter', title: 'Sample splitter', icon: '⚗', detail: 'Recovered the salt and collected pure water — both products from one filtrate.' },
  { id: 'checklist', title: 'Checklist champion', icon: '🏆', detail: 'Completed all five separation goals.' },
];

const WARNINGS: Record<string, string> = {
  'magnet-empty': 'Nothing magnetic left in the beaker — the iron filings are already out.',
  'filter-empty': 'The filter paper caught nothing — there is no insoluble solid left to trap.',
  dry: 'Not enough liquid left in the beaker for that.',
  'hotplate-work': 'Sublimation needs a solid that vaporises when warmed — nothing in this beaker does. Try the little bowl on the right.',
  'hotplate-done': 'The ammonium chloride has already sublimed onto the dome.',
  'wrong-bowl': 'That apparatus works on the liquid in the beaker — the bowl holds a dry powder mix.',
};

// phase boundaries, in simulated seconds
const PM = { dip: 1, gather: 2.8, lift: 4.3, park: 5.5, fly: 1.3, end: 7.7 };
const PF = { rig: 0.9, go: 1.6, pour: 5.6, seep: 7.2, back: 8.6, fade: 10 };
const PE = { rig: 0.9, go: 1.6, pour: 3.4, drain: 4.2, heat: 6.5, boil: 13, cryst: 14.6, fade: 16 };
const PD = { rig: 0.9, go: 1.6, pour: 3.6, drain: 4.4, heat: 7.4, boil: 15, rest: 16.5, fade: 19 };
const PS = { rig: 0.9, heat: 2.6, subl: 9.8, lift: 11.4, fade: 13 };

// ---------------------------------------------------------------- types

interface Row { id: number; technique: string; property: string; separated: string; remained: string }

interface Job {
  kind: ToolId;
  t: number;
  dur: number;
  iron0: number;
  nh4cl0: number;
  srcWater0: number;
  take: number;
  saltTake: number;
  pourSand: number;
  pourIron: number;
  filtrate: number;
  residueSand: number;
  residueIron: number;
  dishWater: number;
  dishSalt: number;
  dirty: boolean;
  flaskWater: number;
  collected: number;
  temp: number;
  heat: number;
  crystal: number;
  crust: number;
  domeLift: number;
  rigA: number;
  boilOn: boolean;
  sndPour: boolean;
  humOn: boolean;
  sloshAt: number;
  dripAt: number;
}

interface Bit { mode: number; x: number; y: number; vx: number; vy: number; trail: number[] }
interface Bubble { x: number; y: number; r: number; vy: number; age: number }
interface Steam { x: number; y: number; r: number; age: number; life: number; wob: number }
interface Ripple { x: number; y: number; r: number; age: number }

interface UiSnap {
  job: ToolId | null;
  temp: number;
  collected: number;
  clock: number;
  beaker: { iron: number; sand: number; salt: number; water: number };
  bowlNh4cl: number;
  goals: Record<GoalId, boolean>;
}

interface Geom {
  w: number;
  h: number;
  S: number;
  trayH: number;
  benchY: number;
  workX: number;
  rigX: number;
  bowlX: number;
  bw: number;
  bh: number;
  slots: { x: number; y: number }[];
  socks: { x: number; y: number }[];
}

// ------------------------------------------------------- deterministic noise

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const SAND_SPECKS = Array.from({ length: 44 }, (_, i) => ({ fx: hash(i) * 0.84 - 0.42, fy: hash(i + 90) }));
const IRON_SPECKS = Array.from({ length: 24 }, (_, i) => ({ fx: hash(i + 40) * 0.7 - 0.35, fy: hash(i + 130) }));
const BOWL_SPECKS = Array.from({ length: 34 }, (_, i) => ({ fx: hash(i + 200) * 0.78 - 0.39, fy: hash(i + 300) }));
const CRUST_SPECKS = Array.from({ length: 42 }, (_, i) => ({ a: -1.25 + hash(i + 500) * 2.5, rr: 0.86 + hash(i + 600) * 0.12, sz: 1.4 + hash(i + 700) * 1.6 }));
const CRYSTALS = Array.from({ length: 9 }, (_, i) => ({ fx: -0.55 + hash(i + 800) * 1.1, sz: 3 + hash(i + 900) * 3.4, rot: hash(i + 950) * 1.2 }));
const BITJ = Array.from({ length: BITS }, (_, i) => ({ jx: hash(i + 1100) - 0.5, jy: hash(i + 1200), sp: hash(i + 1300) }));
const PILE_POS = Array.from({ length: 18 }, (_, i) => ({ fx: hash(i + 1400) * 0.8 - 0.4, fy: hash(i + 1500) }));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease01 = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

const meta = getLabBySlug('separation-methods')!;

// ==================================================================== lab

export default function SeparationLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    t: 0,
    idle: 0,
    acc: 0,
    uiAcc: 0,
    beaker: { iron: IRON_START, sand: SAND_START, salt: SALT_START, water: WATER_START },
    bowl: { nh4cl: NH4CL_START, salt: BOWL_SALT_START },
    goals: { iron: false, sand: false, salt: false, water: false, nh4cl: false } as Record<GoalId, boolean>,
    products: { sand: false, salt: false, water: false, nh4cl: false },
    ironPile: 0,
    job: null as Job | null,
    drag: { tool: null as ToolId | null, x: 0, y: 0, slideAt: 0, lx: 0, ly: 0 },
    bits: [] as Bit[],
    bubbles: [] as Bubble[],
    steam: [] as Steam[],
    ripples: [] as Ripple[],
    bubbleAcc: 0,
    steamAcc: 0,
    rippleAcc: 0,
    effective: [] as ToolId[],
    uselessStreak: 0,
    maxUseless: 0,
    lastCollected: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ----------------------------------------------------
  const [speed, setSpeed] = useState(1);
  const [goal, setGoal] = useState<GoalId | ''>('');
  const [tool, setTool] = useState<ToolId>('magnet');
  const [rows, setRows] = useState<Row[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [warnKey, setWarnKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    job: null, temp: 22, collected: 0, clock: 0,
    beaker: { iron: IRON_START, sand: SAND_START, salt: SALT_START, water: WATER_START },
    bowlNh4cl: NH4CL_START,
    goals: { iron: false, sand: false, salt: false, water: false, nh4cl: false },
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

  useEffect(() => {
    if (!warnKey) return;
    const t = window.setTimeout(() => setWarnKey(null), 6000);
    return () => window.clearTimeout(t);
  }, [warnKey]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    setUi({
      job: s.job ? s.job.kind : null,
      temp: s.job ? s.job.temp : 22,
      collected: s.job ? s.job.collected : s.lastCollected,
      clock: s.t,
      beaker: { ...s.beaker },
      bowlNh4cl: s.bowl.nh4cl,
      goals: { ...s.goals },
    });
  }, []);

  // ---- mentor completion flags ---------------------------------------------
  const done = [
    goal !== '',
    ui.goals.iron,
    ui.goals.sand,
    ui.goals.salt,
    ui.goals.water,
    ui.goals.nh4cl,
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
      case 'goal': return { target: 'goal', gesture: 'tap', title: 'Pick a goal', body: 'Choose one separation goal from the selector — each one needs a different property difference to exploit.' };
      case 'iron': return { target: 'scene', gesture: 'drag', title: 'Drag the magnet', body: 'Pick the red-and-silver bar magnet up from the tray and drop it on the work beaker — the filings stream to it.' };
      case 'sand': return { target: 'scene', gesture: 'drag', title: 'Drag the funnel', body: 'Carry the funnel and filter paper onto the beaker — the liquid passes, the sand stays on the paper.' };
      case 'salt': return { target: 'scene', gesture: 'drag', title: 'Drag the evaporating dish', body: 'Drop the dish and burner on the beaker — half the liquid boils away and leaves white salt crystals.' };
      case 'water': return { target: 'scene', gesture: 'drag', title: 'Drag the distillation rig', body: 'Drop the flask and condenser on the beaker — pure water drips into the receiver at about 100 °C.' };
      case 'nh4cl': return { target: 'scene', gesture: 'drag', title: 'Warm the little bowl', body: 'Drag the hot plate and cold dome onto the bowl on the right — the ammonium chloride sublimes onto the dome.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry -----------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 860;
    const h = canvas?.clientHeight ?? 520;
    const S = clamp(h / 520, 0.6, 1.08);
    const trayH = clamp(h * 0.15, 46, 72);
    const benchY = h - trayH - 46;
    const workX = w * 0.24;
    const rigX = w * 0.52;
    const bowlX = w * 0.8;
    const bw = Math.round(80 * S);
    const bh = Math.round(100 * S);
    const slots = Array.from({ length: 5 }, (_, i) => ({ x: ((i + 0.5) * w) / 5, y: h - trayH / 2 - 2 }));
    const sockGap = Math.min(58 * S, (w * 0.62) / 4);
    const socks = Array.from({ length: 4 }, (_, i) => ({ x: w * 0.16 + i * sockGap, y: clamp(h * 0.15, 36, 84) }));
    return { w, h, S, trayH, benchY, workX, rigX, bowlX, bw, bh, slots, socks };
  }, []);

  // ---- starting a technique --------------------------------------------------------
  const attempt = useCallback((which: ToolId, station: Station) => {
    const s = sim.current;
    if (s.job) {
      labSound.click();
      pushToast('info', '⏳', 'One technique at a time — let this one finish its run.');
      notePointer(false);
      return;
    }
    const b = s.beaker;
    let useless: string | null = null;
    if (station === 'work') {
      if (which === 'magnet') {
        if (b.iron <= 0) useless = 'magnet-empty';
      } else if (which === 'funnel') {
        if (b.sand + b.iron <= 0) useless = 'filter-empty';
      } else if (which === 'dish' || which === 'distil') {
        if (b.water < MIN_POUR) useless = 'dry';
      } else {
        useless = 'hotplate-work';
      }
    } else if (which === 'hotplate') {
      if (s.bowl.nh4cl <= 0) useless = 'hotplate-done';
    } else {
      useless = 'wrong-bowl';
    }
    if (useless) {
      labSound.warn();
      setWarnKey(useless);
      s.uselessStreak += 1;
      if (s.uselessStreak >= 2) s.maxUseless = 2;
      notePointer(false);
      return;
    }

    const j: Job = {
      kind: which, t: 0, dur: 0,
      iron0: b.iron, nh4cl0: s.bowl.nh4cl,
      srcWater0: b.water, take: 0, saltTake: 0,
      pourSand: b.sand, pourIron: b.iron,
      filtrate: 0, residueSand: 0, residueIron: 0,
      dishWater: 0, dishSalt: 0, dirty: false,
      flaskWater: 0, collected: 0, temp: 22,
      heat: 0, crystal: 0, crust: 0, domeLift: 0, rigA: 0,
      boilOn: false, sndPour: false, humOn: false, sloshAt: 0, dripAt: 0,
    };
    if (which === 'magnet') {
      j.dur = PM.end;
      labSound.creak(0.3);
    } else if (which === 'funnel') {
      j.dur = PF.fade;
      labSound.glassClink(true);
    } else if (which === 'dish') {
      j.dur = PE.fade;
      j.take = b.water * 0.5;
      j.saltTake = b.salt * 0.5;
      j.dishSalt = j.saltTake;
      j.dirty = b.sand + b.iron > 0;
      b.salt -= j.saltTake;
      labSound.glassClink(true);
    } else if (which === 'distil') {
      j.dur = PD.fade;
      j.take = b.water * 0.5;
      j.saltTake = b.salt * 0.5;
      b.salt -= j.saltTake;
      labSound.glassClink(true);
    } else {
      j.dur = PS.fade;
      labSound.thunk(false);
    }
    s.job = j;
    s.uselessStreak = 0;
    if (!s.effective.includes(which)) s.effective.push(which);
    labSound.thunk(true);
    notePointer(true);
    syncUi();
  }, [notePointer, pushToast, syncUi]);

  // ---- physics loop -----------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const g = geom();
    s.idle += dt;
    s.t += dt * speed;
    const j = s.job;

    const addRow = (technique: string, property: string, separated: string, remained: string) => {
      setRows((cur) => [...cur, { id: cur.length + 1, technique, property, separated, remained }]);
      labSound.click();
    };
    const completeGoal = (id: GoalId, icon: string, msg: string) => {
      if (s.goals[id]) return;
      s.goals[id] = true;
      labSound.tick();
      pushToast('good', icon, msg);
      earn('first-clean');
    };

    if (j) {
      s.acc += dt * speed;
      const h = 1 / 30;
      while (s.acc >= h && s.job) {
        s.acc -= h;
        j.t += h;
        const t = j.t;
        switch (j.kind) {
          case 'magnet': {
            if (t >= PM.dip && t < PM.gather) {
              s.beaker.iron = Math.max(0, j.iron0 * (1 - (t - PM.dip) / (PM.gather - PM.dip)));
            }
            break;
          }
          case 'funnel': {
            if (t >= PF.go && t < PF.seep) {
              if (!j.sndPour) { j.sndPour = true; labSound.slosh(0.5); labSound.startLoop('pour'); }
              const p = clamp((t - PF.go) / (PF.pour - PF.go), 0, 1);
              s.beaker.water = j.srcWater0 * (1 - p * 0.997);
              const rs = clamp((t - PF.go) / (PF.seep - PF.go), 0, 1);
              j.residueSand = j.pourSand * rs;
              j.residueIron = j.pourIron * rs;
              s.beaker.sand = j.pourSand - j.residueSand;
              s.beaker.iron = j.pourIron - j.residueIron;
              j.filtrate = j.srcWater0 * clamp((t - PF.go - 0.45) / (PF.seep - PF.go - 0.45), 0, 1);
            } else if (t >= PF.seep && j.sndPour) {
              j.sndPour = false;
              labSound.stopLoop();
              s.beaker.water = 0;
              s.beaker.sand = 0;
              s.beaker.iron = 0;
              j.filtrate = j.srcWater0;
              j.residueSand = j.pourSand;
              j.residueIron = j.pourIron;
            }
            break;
          }
          case 'dish': {
            if (t >= PE.go && t < PE.drain) {
              if (!j.sndPour) { j.sndPour = true; labSound.slosh(0.5); labSound.startLoop('pour'); }
              const p = clamp((t - PE.go) / (PE.pour - PE.go), 0, 1);
              s.beaker.water = j.srcWater0 - j.take * p;
              j.dishWater = j.take * p;
            } else if (t >= PE.drain) {
              if (j.sndPour) { j.sndPour = false; labSound.stopLoop(); }
              s.beaker.water = j.srcWater0 - j.take;
              j.dishWater = j.take;
              j.heat = clamp((t - PE.drain) / (PE.heat - PE.drain), 0, 1);
              if (j.heat > 0 && !j.humOn) { j.humOn = true; labSound.click(); labSound.startLoop('hum'); }
              if (t >= PE.heat && t < PE.boil) {
                j.boilOn = true;
                const bf = clamp((t - PE.heat) / (PE.boil - PE.heat), 0, 1);
                j.dishWater = j.take * (1 - bf);
                if (j.dishSalt > 0.4) j.crystal = clamp((bf - 0.6) / 0.4, 0, 0.85);
                if (t - j.sloshAt > 0.85) { j.sloshAt = t; labSound.slosh(0.13 + Math.random() * 0.1); }
                if (t - j.dripAt > 0.62) { j.dripAt = t; labSound.drip(true); }
              } else if (t >= PE.boil) {
                j.boilOn = false;
                j.dishWater = 0;
                if (j.dishSalt > 0.4) j.crystal = 0.85 + 0.15 * clamp((t - PE.boil) / (PE.cryst - PE.boil), 0, 1);
                if (j.humOn && t >= PE.cryst) { j.humOn = false; labSound.stopLoop(); }
              }
            }
            break;
          }
          case 'distil': {
            if (t >= PD.go && t < PD.drain) {
              if (!j.sndPour) { j.sndPour = true; labSound.slosh(0.5); labSound.startLoop('pour'); }
              const p = clamp((t - PD.go) / (PD.pour - PD.go), 0, 1);
              s.beaker.water = j.srcWater0 - j.take * p;
              j.flaskWater = j.take * p;
            } else if (t >= PD.drain) {
              if (j.sndPour) { j.sndPour = false; labSound.stopLoop(); }
              s.beaker.water = j.srcWater0 - j.take;
              j.flaskWater = j.take;
              j.heat = clamp((t - PD.drain) / (PD.heat - PD.drain), 0, 1);
              if (j.heat > 0 && !j.humOn) { j.humOn = true; labSound.click(); labSound.startLoop('hum'); }
              const rate = (j.take * 0.98) / (PD.rest - PD.boil - 1.4);
              if (t < PD.boil) {
                j.temp = 22 + 78 * j.heat;
              } else if (t < PD.rest) {
                j.boilOn = true;
                j.temp = 100 + Math.sin(t * 3) * 0.25;
                j.collected = clamp((t - PD.boil - 0.9) * rate, 0, j.take * 0.98);
                j.flaskWater = j.take - j.collected;
                if (t - j.dripAt > 0.55) { j.dripAt = t; labSound.drip(true); }
                if (t - j.sloshAt > 0.95) { j.sloshAt = t; labSound.slosh(0.12 + Math.random() * 0.08); }
              } else {
                j.boilOn = false;
                j.temp = Math.max(45, 100 - (t - PD.rest) * 45);
                if (j.humOn && t > PD.rest + 0.4) { j.humOn = false; labSound.stopLoop(); }
              }
            }
            break;
          }
          case 'hotplate': {
            j.heat = clamp((t - PS.rig) / (PS.heat - PS.rig), 0, 1);
            if (j.heat > 0.12 && !j.humOn) { j.humOn = true; labSound.click(); labSound.startLoop('hum'); }
            if (t >= PS.heat && t < PS.subl) {
              const f = clamp((t - PS.heat) / (PS.subl - PS.heat), 0, 1);
              s.bowl.nh4cl = j.nh4cl0 * (1 - f);
              j.crust = f;
              if (t - j.dripAt > 1.15) { j.dripAt = t; labSound.ping(700 + Math.random() * 500, 0.025); }
            } else if (t >= PS.subl) {
              s.bowl.nh4cl = 0;
              j.crust = 1;
              if (t >= PS.lift) {
                j.domeLift = ease01((t - PS.lift) / (PS.fade - PS.lift)) * 30;
                j.heat = Math.max(0, 1 - (t - PS.lift) * 1.4);
                if (j.humOn) { j.humOn = false; labSound.stopLoop(); }
              }
            }
            break;
          }
        }
        if (j.t >= j.dur) {
          // -------- completion: bank products, rows, goals, badges --------
          s.job = null;
          s.acc = 0;
          labSound.stopLoop();
          const kind = j.kind;
          if (kind === 'magnet') {
            s.beaker.iron = 0;
            s.ironPile = j.iron0;
            s.bits = [];
            addRow('Magnetic separation', 'Magnetism', `Iron filings → watch glass (${j.iron0.toFixed(0)} g)`, 'Sand + salt solution in the beaker');
            completeGoal('iron', '🧲', 'Iron filings collected on the watch glass — goal complete.');
          } else if (kind === 'funnel') {
            s.beaker.water = j.srcWater0;
            addRow('Filtration', 'Insolubility — particle size', `Sand${j.pourIron > 0.5 ? ' + iron filings' : ''} → residue on the paper`, 'Salt solution (the filtrate) in the beaker');
            completeGoal('sand', '▽', 'Sand trapped as residue — the clear filtrate carries the dissolved salt.');
            if (j.pourIron > 0.5) {
              completeGoal('iron', '🧲', 'The iron came off with the sand — the magnet first would have kept them apart.');
            }
            s.products.sand = true;
          } else if (kind === 'dish') {
            if (j.dishSalt > 0.4) {
              addRow('Evaporation', 'Boiling point — the solvent leaves, the solute cannot', 'Water → steam', j.dirty ? 'Grey crystals — insoluble dirt baked in; filter first next time' : 'White cubic salt crystals in the dish');
              if (!j.dirty) {
                completeGoal('salt', '♨', 'White salt crystals grown in the dish — goal complete.');
                s.products.salt = true;
              } else {
                pushToast('warn', '⚠', 'The crystals came out grey — insoluble solids were still in the liquid. Filter first, then evaporate.');
              }
            } else {
              addRow('Evaporation', 'Boiling point', 'Water → steam', 'No dissolved solid came along — nothing to recover');
              pushToast('info', '♨', 'The dish boiled dry with nothing in it — no dissolved salt was carried over.');
            }
          } else if (kind === 'distil') {
            addRow('Distillation', 'Boiling point difference', `Pure water → receiver (${j.collected.toFixed(0)} mL)`, 'Salt and any solids stay behind in the flask');
            s.lastCollected = j.collected;
            if (j.collected >= COLLECT_GOAL) {
              completeGoal('water', '≋', `Pure water collected (${j.collected.toFixed(0)} mL) — goal complete.`);
              s.products.water = true;
            }
          } else {
            addRow('Sublimation', 'Solid → gas without melting', 'Ammonium chloride → white crust on the cold dome', 'Salt left behind in the dish');
            completeGoal('nh4cl', '◉', 'Ammonium chloride recrystallised on the cold dome — goal complete.');
            s.products.nh4cl = true;
          }
          const effSet = new Set(s.effective);
          if (effSet.size >= 5) earn('full-bench');
          if (effSet.size >= 3 && s.maxUseless < 2) earn('sure-handed');
          if (s.goals.salt && s.goals.water) earn('splitter');
          if (Object.values(s.goals).every(Boolean)) {
            earn('checklist');
            labSound.milestone();
            pushToast('good', '🏆', 'All five separations complete — open Observations for your full table.');
          }
          syncUi();
          break;
        }
      }
    }

    // ---- particles: spawn on sim time, move on real time -------------------------
    if (j) {
      if (j.boilOn) {
        const vessel = j.kind === 'dish'
          ? { cx: g.rigX, bottom: g.benchY - 52 * g.S, top: g.benchY - 62 * g.S }
          : { cx: g.rigX, bottom: g.benchY - 40 * g.S, top: g.benchY - 74 * g.S };
        s.bubbleAcc += dt * speed * 9;
        while (s.bubbleAcc >= 1) {
          s.bubbleAcc -= 1;
          s.bubbles.push({
            x: vessel.cx + (Math.random() - 0.5) * (j.kind === 'dish' ? 46 * g.S : 30 * g.S),
            y: vessel.bottom - Math.random() * 6,
            r: 1.4 + Math.random() * 2.2,
            vy: 26 + Math.random() * 34,
            age: 0,
          });
        }
        s.steamAcc += dt * speed * 2.2;
        while (s.steamAcc >= 1) {
          s.steamAcc -= 1;
          s.steam.push({
            x: vessel.cx + (Math.random() - 0.5) * 30 * g.S,
            y: vessel.top,
            r: 3 + Math.random() * 3,
            age: 0,
            life: 1.3 + Math.random() * 1.1,
            wob: Math.random() * Math.PI * 2,
          });
        }
      }
      if (j.kind === 'hotplate' && j.heat > 0.5 && s.bowl.nh4cl > 0) {
        s.steamAcc += dt * speed * 3.4;
        while (s.steamAcc >= 1) {
          s.steamAcc -= 1;
          s.steam.push({
            x: g.bowlX + (Math.random() - 0.5) * 30 * g.S,
            y: g.benchY - 18 * g.S,
            r: 2.5 + Math.random() * 2.5,
            age: 0,
            life: 1 + Math.random() * 0.8,
            wob: Math.random() * Math.PI * 2,
          });
        }
      }
      const pouring = (j.kind === 'funnel' && j.t > PF.go + 0.4 && j.t < PF.pour)
        || ((j.kind === 'dish' || j.kind === 'distil') && j.t > (j.kind === 'dish' ? PE : PD).go + 0.4 && j.t < (j.kind === 'dish' ? PE : PD).pour);
      if (pouring) {
        s.rippleAcc += dt * speed;
        while (s.rippleAcc >= 1) {
          s.rippleAcc -= 1;
          const tx = j.kind === 'funnel' ? g.rigX - 4 * g.S : g.rigX;
          const ty = j.kind === 'funnel' ? g.benchY - 112 * g.S : j.kind === 'dish' ? g.benchY - 58 * g.S : g.benchY - 108 * g.S;
          s.ripples.push({ x: tx, y: ty, r: 2, age: 0 });
        }
      }
    }
    for (const b of s.bubbles) { b.age += dt; b.y -= (b.vy * dt) / 8; b.r += dt * 1.1; }
    s.bubbles = s.bubbles.filter((b) => b.age < 2.6);
    for (const p of s.steam) { p.age += dt; p.y -= dt * 26; p.r += dt * 5; }
    s.steam = s.steam.filter((p) => p.age < p.life);
    for (const r of s.ripples) { r.age += dt; r.r += dt * 26; }
    s.ripples = s.ripples.filter((r) => r.age < 0.6);

    // ---- iron bits: spring toward the magnet, comet trails -------------------------
    if (j && j.kind === 'magnet') {
      const inY = g.benchY - g.bh * 0.45;
      const upY = g.benchY - g.bh - 58 * g.S;
      const glassX = g.workX - 64 * g.S;
      const glassY = g.benchY - 8;
      let mx = g.workX;
      let my = upY;
      if (j.t < PM.dip) {
        my = lerp(upY, inY, ease01(j.t / PM.dip));
      } else if (j.t < PM.lift) {
        my = inY + Math.sin(s.idle * 2) * 1.5;
      } else if (j.t < PM.park) {
        my = lerp(inY, upY, ease01((j.t - PM.lift) / (PM.park - PM.lift)));
      } else {
        // carry the gathered filings over to the watch glass, then let them rain down
        const f = ease01((j.t - PM.park) / PM.fly);
        mx = lerp(g.workX, glassX, f);
        my = lerp(upY, glassY - 30 * g.S, f);
      }
      const gathered = Math.floor(clamp((j.t - PM.dip) / (PM.gather - PM.dip), 0, 1) * BITS);
      while (s.bits.length < gathered) {
        const sp = IRON_SPECKS[s.bits.length % IRON_SPECKS.length];
        s.bits.push({ mode: 1, x: g.workX + sp.fx * g.bw * 2, y: g.benchY - 5 - sp.fy * 9, vx: 0, vy: 0, trail: [] });
      }
      // release the filings only once the magnet has parked above the watch glass
      const park = j.t >= PM.park + PM.fly + 0.12;
      s.bits.forEach((b, i) => {
        const jit = BITJ[i] ?? BITJ[0];
        const tx = park ? glassX + jit.jx * 26 * g.S : mx;
        const ty = park ? glassY - 3 - jit.jy * 4 : my + 9 * g.S;
        if (park && b.mode === 1) {
          b.vy += 640 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.y >= ty) { b.mode = 2; b.y = ty; b.vx = 0; b.vy = 0; }
        } else if (b.mode === 1) {
          b.vx += ((tx - b.x) * 30 - b.vx * 6) * dt;
          b.vy += ((ty - b.y) * 30 - b.vy * 6) * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
        if (b.mode === 1) {
          b.trail.push(b.x, b.y);
          if (b.trail.length > 20) b.trail.splice(0, 2);
        } else {
          b.trail.length = 0;
        }
      });
    } else if (s.bits.length) {
      s.bits.length = 0;
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, geom, earn, pushToast, syncUi]);

  // ---- drawing ---------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const { benchY, S, rigX, workX, bw, bh } = g;
    const j = s.job;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench slab + hatching
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, benchY);
    ctx.lineTo(w, benchY);
    ctx.stroke();
    ctx.fillStyle = '#e7ebf0';
    ctx.fillRect(0, benchY, w, 12);
    ctx.strokeStyle = '#dde4ea';
    ctx.lineWidth = 1;
    for (let x = 8; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, benchY + 12);
      ctx.lineTo(x - 10, benchY + 22);
      ctx.stroke();
    }

    // ---------------- apparatus tray ----------------
    drawTray(ctx, g, s.drag.tool, tool, s.idle);

    // ---------------- right station: the ammonium chloride bowl ----------------
    drawBowlStation(ctx, g, s.bowl, s.idle, j);

    // ---------------- centre: the active rig ----------------
    if (j && (j.kind === 'funnel' || j.kind === 'dish' || j.kind === 'distil')) {
      if (j.kind === 'funnel') drawFunnelRig(ctx, g, j, s.idle);
      else if (j.kind === 'dish') drawEvapRig(ctx, g, j);
      else drawDistilRig(ctx, g, j);
    }

    // ---------------- work beaker (+ displacement while pouring) ----------------
    let bkX = workX;
    let bkLift = 0;
    let bkTilt = 0;
    let bkAlpha = 1;
    if (j && (j.kind === 'funnel' || j.kind === 'dish' || j.kind === 'distil')) {
      const P = j.kind === 'funnel' ? PF : j.kind === 'dish' ? PE : PD;
      const appX = rigX - 84 * S;
      const liftMax = j.kind === 'dish' ? 34 * S : 46 * S;
      if (j.t < P.rig) {
        bkX = workX;
      } else if (j.t < P.go) {
        const f = ease01((j.t - P.rig) / (P.go - P.rig));
        bkX = lerp(workX, appX, f);
        bkLift = f * liftMax;
      } else if (j.t < P.pour) {
        bkX = appX;
        const up = clamp((j.t - P.go) / 0.5, 0, 1);
        const down = clamp((P.pour + 0.35 - j.t) / 0.35, 0, 1);
        const m = Math.min(up, down);
        bkTilt = m * 1.45;
        bkLift = m * liftMax;
      } else if (j.t < P.pour + 1.4) {
        const f = ease01((j.t - P.pour - 0.4) / 1);
        bkX = lerp(appX, workX, f);
        bkLift = (1 - f) * liftMax;
      }
      if (j.kind === 'funnel' && j.t > PF.seep) {
        bkAlpha = 1 - clamp((j.t - PF.seep) / 1.2, 0, 1);
      }
    }
    drawGlassBeaker(ctx, bkX, benchY - bkLift, bw, bh, {
      water: s.beaker.water, sand: s.beaker.sand, iron: s.beaker.iron,
      alpha: bkAlpha, tilt: bkTilt, idle: s.idle,
    });

    // pour stream from the tilted beaker into the rig mouth
    if (j && bkTilt > 0.25) {
      const lipX = bkX + bw / 2 - Math.sin(bkTilt) * 6;
      const lipY = benchY - bkLift - bh + 6 - Math.cos(bkTilt) * 6;
      const murky = s.beaker.sand > 0.4;
      const tgt = j.kind === 'funnel'
        ? { x: rigX - 4 * S, y: benchY - 112 * S }
        : j.kind === 'dish'
          ? { x: rigX, y: benchY - 58 * S }
          : { x: rigX, y: benchY - 108 * S };
      drawStream(ctx, lipX, lipY, tgt.x, tgt.y, 4.5 * S, murky ? 'rgba(196,178,138,0.85)' : 'rgba(160,203,232,0.85)', clamp(bkTilt / 1.45, 0, 1));
    }

    // ---------------- magnet + iron bits ----------------
    if (j && j.kind === 'magnet') {
      const inY = benchY - bh * 0.45;
      const upY = benchY - bh - 58 * S;
      const glassX = workX - 64 * S;
      const glassY = benchY - 8;
      let mx = workX;
      let my = upY;
      let tiltM = 0;
      if (j.t < PM.dip) {
        my = lerp(upY, inY, ease01(j.t / PM.dip));
        tiltM = 0.2;
      } else if (j.t < PM.lift) {
        my = inY + Math.sin(s.idle * 2) * 1.5;
      } else if (j.t < PM.park) {
        my = lerp(inY, upY, ease01((j.t - PM.lift) / (PM.park - PM.lift)));
      } else {
        // carry the gathered filings over to the watch glass, then let them rain down
        const f = ease01((j.t - PM.park) / PM.fly);
        mx = lerp(workX, glassX, f);
        my = lerp(upY, glassY - 30 * S, f);
        tiltM = 0.5;
      }
      // the magnet itself fades home to the tray once the filings have landed
      ctx.save();
      ctx.globalAlpha = clamp((PM.end - j.t) / 0.45, 0, 1);
      drawMagnetBar(ctx, mx, my, S, tiltM);
      ctx.restore();
    }

    // iron watch glass with the collected pile
    if (s.ironPile > 0 || (j && j.kind === 'magnet')) {
      drawWatchGlass(ctx, workX - 64 * S, benchY - 6, S, s.ironPile / IRON_START, s.bits);
    }
    // comet-trail iron bits
    for (const b of s.bits) {
      const n = b.trail.length / 2;
      for (let i = 0; i < n; i++) {
        const a = (i + 1) / n;
        ctx.fillStyle = `rgba(249,115,22,${0.16 * a})`;
        ctx.beginPath();
        ctx.arc(b.trail[i * 2], b.trail[i * 2 + 1], 1.2 + a * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.mode === 1) {
        ctx.fillStyle = '#2c3138';
        ctx.fillRect(b.x - 1.6, b.y - 1.6, 3.2, 3.2);
      }
    }

    // ---------------- shared particles ----------------
    for (const r of s.ripples) {
      const a = clamp(1 - r.age / 0.6, 0, 1);
      ctx.strokeStyle = `rgba(120,160,190,${0.5 * a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of s.bubbles) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
    for (const p of s.steam) {
      const a = clamp(0.38 * (1 - p.age / p.life), 0, 1);
      ctx.fillStyle = `rgba(216,229,238,${a})`;
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(p.wob + p.age * 3) * 6, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---------------- products shelf (+ a product flying home) ----------------
    drawShelf(ctx, g, s.products, j);

    // ---------------- carried apparatus + drop-zone rings ----------------
    if (s.drag.tool) {
      const home = TOOLS.find((tt) => tt.id === s.drag.tool)!.home;
      const hover: Station | null = s.drag.x < w * 0.46 ? 'work' : s.drag.x > w * 0.56 ? 'bowl' : null;
      drawStationRing(ctx, g, 'work', home === 'work', hover === 'work', s.idle);
      drawStationRing(ctx, g, 'bowl', home === 'bowl', hover === 'bowl', s.idle);
      drawTool(ctx, s.drag.tool, s.drag.x, s.drag.y - 8, S * 1.06, 1, s.idle, true);
    }
  }, [geom, tool]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction: drag apparatus from the tray -----------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;
    const trayTop = canvas.clientHeight - clamp(canvas.clientHeight * 0.15, 46, 72) - 10;
    if (py > trayTop) {
      const slotW = canvas.clientWidth / 5;
      const idx = Math.floor(px / slotW);
      if (idx >= 0 && idx < 5) {
        const id = TOOLS[idx].id;
        s.drag = { tool: id, x: px, y: py, slideAt: performance.now(), lx: px, ly: py };
        if (id === 'magnet') labSound.creak(0.35);
        else if (id === 'hotplate') labSound.thunk(false);
        else labSound.glassClink(true);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        notePointer(true);
        return;
      }
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag.tool) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const now = performance.now();
    if (now - s.drag.slideAt > 120) {
      const d = Math.hypot(px - s.drag.lx, py - s.drag.ly);
      s.drag.slideAt = now;
      s.drag.lx = px;
      s.drag.ly = py;
      if (d > 4) labSound.slide(clamp(0.25 + d / 90, 0.25, 0.8));
    }
    s.drag.x = px;
    s.drag.y = py;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag.tool) return;
    const which = s.drag.tool;
    const px = s.drag.x;
    const py = s.drag.y;
    s.drag.tool = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const canvas = canvasRef.current;
    const trayTop = canvas ? canvas.clientHeight - clamp(canvas.clientHeight * 0.15, 46, 72) - 10 : 0;
    const station: Station | null = canvas && py < trayTop
      ? px < canvas.clientWidth * 0.46 ? 'work' : px > canvas.clientWidth * 0.56 ? 'bowl' : null
      : null;
    if (station) {
      attempt(which, station);
    } else {
      labSound.slide(0.4);
      labSound.thunk(true);
    }
  };

  // ---- controls -----------------------------------------------------------------------
  const chooseGoal = (v: string) => {
    setGoal(v as GoalId | '');
    labSound.tick();
    notePointer(true);
    syncUi();
  };

  const selectTool = (id: ToolId) => {
    setTool(id);
    labSound.tick();
    notePointer(true);
  };

  const applySelected = () => {
    const home = TOOLS.find((t) => t.id === tool)!.home;
    attempt(tool, home);
  };

  const resetAll = () => {
    const s = sim.current;
    s.t = 0;
    s.acc = 0;
    s.beaker = { iron: IRON_START, sand: SAND_START, salt: SALT_START, water: WATER_START };
    s.bowl = { nh4cl: NH4CL_START, salt: BOWL_SALT_START };
    s.goals = { iron: false, sand: false, salt: false, water: false, nh4cl: false };
    s.products = { sand: false, salt: false, water: false, nh4cl: false };
    s.ironPile = 0;
    s.job = null;
    s.drag.tool = null;
    s.bits = [];
    s.bubbles = [];
    s.steam = [];
    s.ripples = [];
    s.effective = [];
    s.uselessStreak = 0;
    s.maxUseless = 0;
    s.lastCollected = 0;
    labSound.stopLoop();
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setGoal('');
    setWarnKey(null);
    syncUi();
  };

  // ---- coach -----------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (warnKey) return { tone: 'warn', line: WARNINGS[warnKey] ?? 'That did not help — think about which property difference this goal needs.' };
    if (ui.job === 'magnet') return { tone: 'info', line: 'The filings stream to the pole in a comet trail — magnetism is doing all the work here.' };
    if (ui.job === 'funnel') return { tone: 'info', line: 'The liquid threads through the paper while the sand mound grows — that mound is your residue.' };
    if (ui.job === 'dish') {
      if (ui.beaker.sand > 0.4 && sim.current.job && sim.current.job.dirty) return { tone: 'warn', line: 'Those crystals will come out grey — insoluble solids are still in the liquid. Filtering first keeps the salt clean.' };
      return { tone: 'info', line: 'Boiling away the water — steam rises, and only the dissolved salt can stay behind.' };
    }
    if (ui.job === 'distil') return { tone: 'info', line: `The still head reads ${ui.temp.toFixed(0)} °C — water's boiling point. Pure condensate drips into the receiver; the salt cannot follow.` };
    if (ui.job === 'hotplate') return { tone: 'info', line: 'White vapour curls straight off the solid and re-crystallises on the cold dome — sublimation skips the liquid stage.' };
    if (!goal) return { tone: 'info', line: 'Pick a separation goal first — then drag the apparatus that exploits its property difference onto the right sample.' };
    const gd = GOALS.find((x) => x.id === goal)!;
    if (ui.goals[goal]) {
      const left = GOALS.filter((x) => !ui.goals[x.id]);
      if (left.length === 0) return { tone: 'good', line: 'All five separations complete — your observations table tells the whole story, one property difference per row.' };
      return { tone: 'good', line: `${gd.label.split(' ').slice(-2).join(' ')} done. ${left.length} goal${left.length > 1 ? 's' : ''} left — try ${left[0].label.toLowerCase()}.` };
    }
    const where = goal === 'nh4cl' ? 'the little bowl on the right' : 'the work beaker';
    return { tone: 'info', line: `${gd.hint} Carry the right apparatus to ${where}.` };
  }, [warnKey, ui, goal]);

  // ---- status ---------------------------------------------------------------------
  const goalsN = GOALS.filter((x) => ui.goals[x.id]).length;
  const allDone = goalsN === 5;
  const statusText = allDone
    ? 'All five separated — complete'
    : ui.job
      ? `Running — ${TOOLS.find((t) => t.id === ui.job)?.name ?? ''}`
      : goalsN > 0
        ? `${goalsN}/5 goals separated`
        : goal
          ? 'Goal chosen — bench ready'
          : 'Choose a goal to begin';

  // ---- render -----------------------------------------------------------------------
  const toolDef = TOOLS.find((t) => t.id === tool)!;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={allDone ? 'complete' : ui.job ? 'active' : 'ready'}
      captionChip="One mixture, five property differences"
      legend={[
        { color: '#d8b26a', label: 'Sand' },
        { color: '#2c3138', label: 'Iron filings' },
        { color: '#f6f8fa', label: 'Salt crystals' },
        { color: '#9fd0ea', label: 'Pure water' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start separating', onClick: () => setMentorAcked(true) }
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
          aria-label="Separation bench — drag apparatus from the tray onto the work beaker or the ammonium chloride bowl"
          onKeyDown={(e) => {
            if ((e.key >= '1' && e.key <= '5') && !e.repeat) {
              const idx = Number(e.key) - 1;
              if (TOOLS[idx]) { selectTool(TOOLS[idx].id); }
            } else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              applySelected();
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
          <div className="sep-layout">
            <div className="sep-goal" data-nudge="goal">
              <span>SEPARATION GOAL</span>
              <select value={goal} onChange={(e) => chooseGoal(e.target.value)} aria-label="Separation goal">
                <option value="">— pick a goal —</option>
                {GOALS.map((gd) => (
                  <option key={gd.id} value={gd.id}>{gd.label}</option>
                ))}
              </select>
              <small>{goal ? GOALS.find((gd) => gd.id === goal)!.hint : 'Five goals, five property differences — pick one and drag the matching apparatus.'}</small>
            </div>
            <button
              className="action-button"
              type="button"
              data-nudge="apply"
              onClick={() => { applySelected(); }}
              disabled={!!ui.job}
            >
              <span className="dispense-icon" aria-hidden="true">{toolDef.glyph}</span>
              <span>{toolDef.home === 'bowl' ? `Warm the bowl with the ${toolDef.name.toLowerCase()}` : `Use the ${toolDef.name.toLowerCase()} on the mixture`}</span>
              <small>or drag it from the tray yourself · keys 1–5 then Space</small>
            </button>
          </div>
          <div className="sep-tools">
            {TOOLS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className={`sep-tool-chip${tool === t.id ? ' on' : ''}`}
                onClick={() => selectTool(t.id)}
                aria-pressed={tool === t.id}
              >
                <span aria-hidden="true">{t.glyph}</span>
                <strong>{t.name}</strong>
                <small>{i + 1} · {t.blurb}</small>
              </button>
            ))}
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Every separation works because ONE property differs: magnetism, insolubility, boiling point or the ability to sublime. Watch the tray, pick the tool that matches the property.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Separation bench</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Goals complete</span><strong>{goalsN}<small> / 5</small></strong>
            <div className="reading-track"><span style={{ width: `${(goalsN / 5) * 100}%` }} /></div>
            <div className="reading-scale"><span>Bench ready</span><span>All separated</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Water in beaker</span><strong>{ui.beaker.water.toFixed(0)}<small> mL</small></strong></div>
            <div><span>Dissolved salt</span><strong>{ui.beaker.salt.toFixed(1)}<small> g</small></strong></div>
            <div><span>Sand left</span><strong>{ui.beaker.sand.toFixed(0)}<small> g</small></strong></div>
            <div><span>Iron left</span><strong>{ui.beaker.iron.toFixed(0)}<small> g</small></strong></div>
            <div><span>Still head</span><strong>{ui.temp.toFixed(0)}<small> °C</small></strong></div>
            <div><span>Pure water collected</span><strong>{ui.collected.toFixed(0)}<small> mL</small></strong></div>
            <div><span>NH₄Cl in bowl</span><strong>{ui.bowlNh4cl.toFixed(0)}<small> g</small></strong></div>
            <div><span>Clock</span><strong>{fmtClock(ui.clock)}</strong></div>
          </div>
          <div className="sep-checklist">
            <span>SEPARATION CHECKLIST</span>
            {GOALS.map((gd, i) => (
              <div key={gd.id} className={`sep-check-row${ui.goals[gd.id] ? ' done' : ''}`}>
                <span className="sep-check" aria-hidden="true">{ui.goals[gd.id] ? '✓' : i + 1}</span>
                <div>
                  <strong>{gd.label}</strong>
                  <small>{ui.goals[gd.id] ? `done — ${gd.property.toLowerCase()}` : gd.property}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Pick a separation goal — each one exploits a different property difference.</li>
              <li>Drag the bar magnet onto the work beaker: the iron filings comet out onto a watch glass.</li>
              <li>Drag the funnel and filter paper onto the beaker: the sand stays on the paper as residue, the salt water passes through.</li>
              <li>Drag the evaporating dish across: half the filtrate boils dry and white salt crystals grow.</li>
              <li>Drag the distillation rig across: half of the remaining filtrate boils at about 100 °C and pure water drips into the receiver.</li>
              <li>Drag the hot plate and cold dome onto the little bowl: the ammonium chloride sublimes onto the dome, leaving the salt behind.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Splitting the filtrate is real bench practice — share it between the dish and the still so both products survive. Each boiling technique takes half of what is in the beaker. Speed up playback (2× or 4×) for the slow boils; the simulated clock stays consistent.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Observations table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Each technique you complete banks a row here: what it exploited, what it separated, and what remained. Try the magnet first.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th style={{ textAlign: 'left' }}>Technique</th><th style={{ textAlign: 'left' }}>Property exploited</th><th style={{ textAlign: 'left' }}>Separated</th><th style={{ textAlign: 'left' }}>Remained</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td style={{ textAlign: 'left' }}>{r.technique}</td>
                      <td style={{ textAlign: 'left' }}>{r.property}</td>
                      <td style={{ textAlign: 'left' }}>{r.separated}</td>
                      <td style={{ textAlign: 'left' }}>{r.remained}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="observation-note">Read the table sideways: every row is the same idea — find the ONE property the two substances disagree on, then choose the apparatus that measures it.</p>
          </>
        ),
        theory: (
          <>
            <h3>One property difference per technique</h3>
            <p>A mixture is not a compound: nothing is chemically bonded, so you can take it apart purely by giving the components a reason to go different ways. Each classic technique targets exactly one property:</p>
            <div className="equation">Magnetism → iron · Insolubility → sand · Boiling point → water vs salt · Sublimation → NH₄Cl</div>
            <p><strong>Magnetism.</strong> Iron is ferromagnetic; sand and salt are not. A bar magnet pulls the filings clean out of the liquid without touching anything else — which is why it pays to do it first, while the solids are still separate.</p>
            <p><strong>Insolubility.</strong> Sand will not dissolve, so it rides on the paper; the dissolved salt rides through with the water. The trapped solid is the residue, the liquid that passed is the filtrate.</p>
            <p><strong>Boiling point.</strong> Water boils at about 100 °C; salt does not boil at any everyday temperature. Evaporation lets the water leave as steam and keeps the salt; distillation goes one step further and condenses that steam back into pure liquid, leaving every dissolved and insoluble impurity behind.</p>
            <p><strong>Sublimation.</strong> Ammonium chloride passes straight from solid to gas when warmed, then re-crystallises the instant it meets the cold dome. Salt has no such shortcut, so it never leaves the dish — two white powders that look identical, parted by a property you cannot see.</p>
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

// ================================================================== drawing helpers

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStream(ctx: CanvasRenderingContext2D, sx: number, sy: number, tx: number, ty: number, width: number, color: string, a: number) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo((sx + tx) / 2 + 3, (sy + ty) / 2 + 8, tx, ty);
  ctx.stroke();
  ctx.restore();
}

/** The work beaker: glass body, liquid, suspended murk, sand + iron sediment. */
function drawGlassBeaker(
  ctx: CanvasRenderingContext2D, cx: number, yBottom: number, bw: number, bh: number,
  o: { water: number; sand: number; iron: number; alpha?: number; tilt?: number; idle: number },
) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0.01) return;
  const tilt = o.tilt ?? 0;
  const yTop = yBottom - bh;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (tilt > 0.001) {
    const px = cx + bw / 2;
    ctx.translate(px, yTop);
    ctx.rotate(tilt);
    ctx.translate(-px, -yTop);
  }
  const half = bw / 2;
  // glass body
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(cx - half, yTop);
  ctx.lineTo(cx - half, yBottom - 4);
  ctx.quadraticCurveTo(cx - half, yBottom, cx - half + 6, yBottom);
  ctx.lineTo(cx + half - 6, yBottom);
  ctx.quadraticCurveTo(cx + half, yBottom, cx + half, yBottom - 4);
  ctx.lineTo(cx + half, yTop);
  ctx.closePath();
  ctx.fill();
  // liquid
  const frac = clamp(o.water / WATER_START, 0, 1);
  if (frac > 0.01) {
    const innerL = cx - half + 5;
    const innerR = cx + half - 5;
    const level = yBottom - 6 - frac * (bh - 18);
    const murk = clamp(o.sand / SAND_START, 0, 1);
    const grad = ctx.createLinearGradient(0, level, 0, yBottom);
    if (murk > 0.05) {
      grad.addColorStop(0, `rgba(214,196,158,${0.55 + murk * 0.35})`);
      grad.addColorStop(1, `rgba(176,158,116,${0.75 + murk * 0.2})`);
    } else {
      grad.addColorStop(0, 'rgba(207,228,242,0.9)');
      grad.addColorStop(1, 'rgba(154,193,222,0.9)');
    }
    ctx.fillStyle = grad;
    const wob = Math.sin(o.idle * 1.8) * 0.7;
    roundRect(ctx, innerL, level + wob, innerR - innerL, yBottom - level - 4, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(innerL + 2, level + wob);
    ctx.quadraticCurveTo(cx, level - 1.5 + wob, innerR - 2, level + wob);
    ctx.stroke();
  }
  // sediment: iron below (denser), sand above
  const sandH = (o.sand / SAND_START) * 15;
  const ironH = (o.iron / IRON_START) * 7;
  if (ironH > 0.4) {
    ctx.fillStyle = '#2c3138';
    roundRect(ctx, cx - half + 6, yBottom - 6 - ironH, bw - 12, ironH, 2);
    ctx.fill();
  }
  if (sandH > 0.4) {
    ctx.fillStyle = '#d8b26a';
    roundRect(ctx, cx - half + 6, yBottom - 6 - ironH - sandH, bw - 12, sandH, 2);
    ctx.fill();
  }
  const nSand = Math.round((o.sand / SAND_START) * SAND_SPECKS.length);
  for (let i = 0; i < nSand; i++) {
    const sp = SAND_SPECKS[i];
    ctx.fillStyle = i % 3 === 0 ? '#c19a55' : '#e3c283';
    ctx.fillRect(cx + sp.fx * (bw - 14) - 1, yBottom - 7 - ironH - sp.fy * sandH, 2, 2);
  }
  const nIron = Math.round((o.iron / IRON_START) * IRON_SPECKS.length);
  for (let i = 0; i < nIron; i++) {
    const sp = IRON_SPECKS[i];
    ctx.fillStyle = '#1f242b';
    ctx.fillRect(cx + sp.fx * (bw - 16) - 1.2, yBottom - 6 - sp.fy * ironH, 2.4, 2.4);
  }
  // outline + spout
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - half, yTop);
  ctx.lineTo(cx - half, yBottom - 4);
  ctx.quadraticCurveTo(cx - half, yBottom, cx - half + 6, yBottom);
  ctx.lineTo(cx + half - 6, yBottom);
  ctx.quadraticCurveTo(cx + half, yBottom, cx + half, yBottom - 4);
  ctx.lineTo(cx + half, yTop);
  ctx.stroke();
  ctx.strokeStyle = '#a9bfc9';
  ctx.beginPath();
  ctx.moveTo(cx + half + 4, yTop - 3);
  ctx.lineTo(cx + half - 3, yTop + 3);
  ctx.moveTo(cx - half - 4, yTop - 3);
  ctx.lineTo(cx - half + 3, yTop + 3);
  ctx.stroke();
  ctx.restore();
}

/** A classic red-and-silver bar magnet. */
function drawMagnetBar(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, tilt: number) {
  const w = 52 * S;
  const hh = 15 * S;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = 'rgba(23,35,52,0.12)';
  ctx.beginPath();
  ctx.ellipse(4, hh / 2 + 10, w * 0.42, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const g1 = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
  g1.addColorStop(0, '#e06a5f');
  g1.addColorStop(1, '#b23a31');
  ctx.fillStyle = g1;
  roundRect(ctx, -w / 2, -hh / 2, w / 2, hh, 3);
  ctx.fill();
  const g2 = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
  g2.addColorStop(0, '#eef2f6');
  g2.addColorStop(1, '#a9b6c2');
  ctx.fillStyle = g2;
  roundRect(ctx, 0, -hh / 2, w / 2, hh, 3);
  ctx.fill();
  ctx.strokeStyle = '#5d6a79';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -w / 2, -hh / 2, w, hh, 3);
  ctx.stroke();
  ctx.strokeStyle = '#8b96a3';
  ctx.beginPath();
  ctx.moveTo(0, -hh / 2);
  ctx.lineTo(0, hh / 2);
  ctx.stroke();
  ctx.restore();
}

/** Watch glass holding the collected iron filings. */
function drawWatchGlass(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, pileFrac: number, bits: Bit[]) {
  const rx = 22 * S;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a9bfc9';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const n = Math.round(pileFrac * PILE_POS.length);
  for (let i = 0; i < n; i++) {
    const p = PILE_POS[i];
    ctx.fillStyle = i % 3 === 0 ? '#454d57' : '#22282f';
    ctx.fillRect(x + p.fx * rx * 1.5 - 1.4, y - 2 - p.fy * 6 * S, 2.8, 2.8);
  }
  for (const b of bits) {
    if (b.mode === 2) {
      ctx.fillStyle = '#22282f';
      ctx.fillRect(b.x - 1.4, b.y - 1.4, 2.8, 2.8);
    }
  }
}

/** Tray icons + carried apparatus. */
function drawTool(ctx: CanvasRenderingContext2D, kind: ToolId, x: number, y: number, sc: number, alpha: number, idle: number, carried: boolean) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (carried) ctx.rotate(Math.sin(idle * 3) * 0.05);
  if (carried) {
    ctx.fillStyle = 'rgba(23,35,52,0.15)';
    ctx.beginPath();
    ctx.ellipse(6, 30 * sc, 26 * sc, 6 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  switch (kind) {
    case 'magnet': {
      ctx.save();
      ctx.scale(sc, sc);
      ctx.translate(0, 8);
      drawMagnetBar(ctx, 0, 0, 1.1, 0);
      ctx.restore();
      break;
    }
    case 'funnel': {
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 2 * sc;
      ctx.beginPath();
      ctx.moveTo(-17 * sc, -14 * sc);
      ctx.lineTo(0, 6 * sc);
      ctx.lineTo(17 * sc, -14 * sc);
      ctx.stroke();
      ctx.fillStyle = '#efe8d6';
      ctx.beginPath();
      ctx.moveTo(-14 * sc, -12 * sc);
      ctx.lineTo(0, 4 * sc);
      ctx.lineTo(14 * sc, -12 * sc);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8da8b9';
      ctx.beginPath();
      ctx.moveTo(-4 * sc, 2 * sc);
      ctx.lineTo(-4 * sc, 10 * sc);
      ctx.moveTo(4 * sc, 2 * sc);
      ctx.lineTo(4 * sc, 10 * sc);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-17 * sc, -14 * sc);
      ctx.lineTo(17 * sc, -14 * sc);
      ctx.stroke();
      break;
    }
    case 'dish': {
      ctx.strokeStyle = '#5d6a79';
      ctx.lineWidth = 2 * sc;
      ctx.beginPath();
      ctx.moveTo(-9 * sc, 16 * sc);
      ctx.lineTo(-14 * sc, 26 * sc);
      ctx.moveTo(9 * sc, 16 * sc);
      ctx.lineTo(14 * sc, 26 * sc);
      ctx.moveTo(0, 14 * sc);
      ctx.lineTo(0, 26 * sc);
      ctx.stroke();
      const flame = ctx.createLinearGradient(0, 12 * sc, 0, 26 * sc);
      flame.addColorStop(0, 'rgba(120,190,240,0.95)');
      flame.addColorStop(1, 'rgba(60,120,200,0.25)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(0, 12 * sc);
      ctx.quadraticCurveTo(5 * sc, 19 * sc, 0, 26 * sc);
      ctx.quadraticCurveTo(-5 * sc, 19 * sc, 0, 12 * sc);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 1.8 * sc;
      ctx.beginPath();
      ctx.ellipse(0, 6 * sc, 16 * sc, 5 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-16 * sc, 6 * sc);
      ctx.quadraticCurveTo(0, 16 * sc, 16 * sc, 6 * sc);
      ctx.stroke();
      break;
    }
    case 'distil': {
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 2 * sc;
      ctx.beginPath();
      ctx.arc(0, 10 * sc, 8 * sc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,203,232,0.65)';
      ctx.beginPath();
      ctx.arc(0, 10 * sc, 6 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-3 * sc, 3 * sc);
      ctx.lineTo(-3 * sc, -8 * sc);
      ctx.lineTo(3 * sc, -8 * sc);
      ctx.lineTo(3 * sc, 3 * sc);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3 * sc, -7 * sc);
      ctx.lineTo(16 * sc, -1 * sc);
      ctx.stroke();
      ctx.strokeStyle = '#7fb3d5';
      ctx.lineWidth = 3.5 * sc;
      ctx.beginPath();
      ctx.moveTo(9 * sc, -4.4 * sc);
      ctx.lineTo(20 * sc, 2 * sc);
      ctx.stroke();
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 1.6 * sc;
      ctx.beginPath();
      ctx.arc(23 * sc, 8 * sc, 5 * sc, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'hotplate': {
      ctx.fillStyle = '#3a4450';
      roundRect(ctx, -17 * sc, 12 * sc, 34 * sc, 8 * sc, 3 * sc);
      ctx.fill();
      ctx.strokeStyle = '#e8443a';
      ctx.lineWidth = 1.6 * sc;
      ctx.beginPath();
      ctx.moveTo(-12 * sc, 12 * sc);
      ctx.lineTo(12 * sc, 12 * sc);
      ctx.stroke();
      ctx.fillStyle = '#5d6a79';
      ctx.beginPath();
      ctx.arc(21 * sc, 16 * sc, 3.5 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,200,225,0.3)';
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 1.8 * sc;
      ctx.beginPath();
      ctx.arc(0, 12 * sc, 13 * sc, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawTray(ctx: CanvasRenderingContext2D, g: Geom, dragging: ToolId | null, selected: ToolId, idle: number) {
  const y0 = g.h - g.trayH;
  ctx.fillStyle = '#f7f9fb';
  roundRect(ctx, 6, y0, g.w - 12, g.trayH - 4, 10);
  ctx.fill();
  ctx.strokeStyle = '#e4e9ef';
  ctx.lineWidth = 1;
  roundRect(ctx, 6, y0, g.w - 12, g.trayH - 4, 10);
  ctx.stroke();
  TOOLS.forEach((t, i) => {
    const slot = g.slots[i];
    if (i > 0) {
      ctx.strokeStyle = '#e8edf2';
      ctx.beginPath();
      ctx.moveTo(slot.x - g.w / 10, y0 + 8);
      ctx.lineTo(slot.x - g.w / 10, g.h - 10);
      ctx.stroke();
    }
    const isSel = selected === t.id;
    if (isSel) {
      const pulse = 0.5 + 0.5 * Math.sin(idle * 2.4);
      ctx.fillStyle = `rgba(249,115,22,${0.06 + 0.05 * pulse})`;
      roundRect(ctx, slot.x - g.w / 10 + 4, y0 + 5, g.w / 5 - 8, g.trayH - 13, 8);
      ctx.fill();
      ctx.strokeStyle = `rgba(249,115,22,${0.45 + 0.3 * pulse})`;
      ctx.lineWidth = 1.5;
      roundRect(ctx, slot.x - g.w / 10 + 4, y0 + 5, g.w / 5 - 8, g.trayH - 13, 8);
      ctx.stroke();
    }
    drawTool(ctx, t.id, slot.x, slot.y - 2, g.S * 0.62 + 0.18, dragging === t.id ? 0.25 : 1, idle, false);
  });
}

function drawStationRing(ctx: CanvasRenderingContext2D, g: Geom, station: Station, home: boolean, hovered: boolean, idle: number) {
  const cx = station === 'work' ? g.workX : g.bowlX;
  const rx = station === 'work' ? g.bw * 0.72 : 42 * g.S;
  const ry = station === 'work' ? g.bh * 0.62 : 34 * g.S;
  const cy = g.benchY - ry * 0.55;
  const pulse = 0.5 + 0.5 * Math.sin(idle * 3.2);
  const a = hovered ? 0.85 : home ? 0.35 + 0.2 * pulse : 0.12;
  ctx.save();
  ctx.setLineDash(home || hovered ? [] : [5, 5]);
  ctx.strokeStyle = `rgba(249,115,22,${a})`;
  ctx.lineWidth = hovered ? 3 : 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 14, ry + 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (hovered) {
    ctx.fillStyle = `rgba(249,115,22,${0.05 + 0.04 * pulse})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 14, ry + 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------- rigs

function drawFunnelRig(ctx: CanvasRenderingContext2D, g: Geom, j: Job, idle: number) {
  const { rigX: fx, benchY, S } = g;
  const rimY = benchY - 112 * S;
  const tipY = benchY - 78 * S;
  const stemTip = benchY - 64 * S;
  const fade = clamp((j.t - PF.back) / (PF.fade - PF.back), 0, 1);
  const rigA = 1 - fade;
  if (rigA <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = rigA;

  // iron stand
  ctx.fillStyle = '#435062';
  roundRect(ctx, fx - 66 * S, benchY - 7, 54 * S, 7, 2);
  ctx.fill();
  ctx.fillStyle = '#5d6a79';
  ctx.fillRect(fx - 58 * S, rimY - 10, 4, benchY - rimY + 3);
  ctx.fillRect(fx - 58 * S, tipY - 8 * S, 46 * S, 4);

  // filtrate beaker (slides to the work station near the end)
  const slideT = clamp((j.t - PF.seep - 0.2) / (PF.back - PF.seep - 0.2), 0, 1);
  const fbX = lerp(fx, g.workX, ease01(slideT));
  drawGlassBeaker(ctx, fbX, benchY, 58 * S, 70 * S, { water: j.filtrate, sand: 0, iron: 0, idle });

  // funnel glass + paper cone
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fx - 34 * S, rimY);
  ctx.lineTo(fx, tipY);
  ctx.lineTo(fx + 34 * S, rimY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fx - 34 * S, rimY);
  ctx.lineTo(fx + 34 * S, rimY);
  ctx.stroke();
  ctx.fillStyle = '#efe8d6';
  ctx.beginPath();
  ctx.moveTo(fx - 30 * S, rimY - 2);
  ctx.lineTo(fx, tipY - 2);
  ctx.lineTo(fx + 30 * S, rimY - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,178,150,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx - 30 * S, rimY - 2);
  ctx.lineTo(fx, tipY - 2);
  ctx.lineTo(fx + 30 * S, rimY - 2);
  ctx.stroke();

  // residue mound (sand + any iron caught with it)
  const rf = clamp(j.residueSand / SAND_START, 0, 1.2);
  const moundH = 3 + rf * 15;
  ctx.fillStyle = '#d8b26a';
  ctx.beginPath();
  ctx.moveTo(fx - 24 * S, tipY - 2);
  ctx.quadraticCurveTo(fx, tipY - 2 - moundH, fx + 24 * S, tipY - 2);
  ctx.closePath();
  ctx.fill();
  const nSp = Math.round(rf * 22);
  for (let i = 0; i < nSp; i++) {
    const sp = SAND_SPECKS[i % SAND_SPECKS.length];
    ctx.fillStyle = i % 3 === 0 ? '#c19a55' : '#e3c283';
    ctx.fillRect(fx + sp.fx * 44 * S - 1, tipY - 3 - Math.abs(sp.fy) * moundH, 2, 2);
  }
  const nFe = Math.round(clamp(j.residueIron / IRON_START, 0, 1) * 14);
  for (let i = 0; i < nFe; i++) {
    const sp = IRON_SPECKS[i % IRON_SPECKS.length];
    ctx.fillStyle = '#1f242b';
    ctx.fillRect(fx + sp.fx * 36 * S - 1.2, tipY - 3 - Math.abs(sp.fy) * moundH * 0.8, 2.4, 2.4);
  }

  // stem + seep drip
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fx - 3.5 * S, tipY);
  ctx.lineTo(fx - 3.5 * S, stemTip);
  ctx.moveTo(fx + 3.5 * S, tipY);
  ctx.lineTo(fx + 3.5 * S, stemTip);
  ctx.stroke();
  const seeping = j.t > PF.go + 0.6 && j.t < PF.seep + 0.4;
  if (seeping) {
    const surf = benchY - 6 - clamp(j.filtrate / WATER_START, 0, 1) * (70 * S - 18);
    drawStream(ctx, fx, stemTip, fx, surf, 3 * S, 'rgba(160,203,232,0.8)', 0.9);
  }
  ctx.restore();
}

function drawBurner(ctx: CanvasRenderingContext2D, x: number, yBottom: number, S: number, heat: number) {
  ctx.fillStyle = '#2f3a46';
  roundRect(ctx, x - 17 * S, yBottom - 9 * S, 34 * S, 9 * S, 3);
  ctx.fill();
  ctx.fillStyle = '#3a4450';
  roundRect(ctx, x - 6 * S, yBottom - 17 * S, 12 * S, 9 * S, 2);
  ctx.fill();
  if (heat > 0.02) {
    const flick = 0.8 + Math.random() * 0.2;
    const fh = 26 * S * heat * flick;
    const grad = ctx.createLinearGradient(0, yBottom - 17 * S - fh, 0, yBottom - 17 * S);
    grad.addColorStop(0, 'rgba(140,200,245,0.95)');
    grad.addColorStop(0.55, 'rgba(90,160,235,0.8)');
    grad.addColorStop(1, 'rgba(60,110,190,0.35)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, yBottom - 17 * S - fh);
    ctx.quadraticCurveTo(x + 6.5 * S, yBottom - 17 * S - fh * 0.45, x, yBottom - 17 * S);
    ctx.quadraticCurveTo(x - 6.5 * S, yBottom - 17 * S - fh * 0.45, x, yBottom - 17 * S - fh);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(x, yBottom - 17 * S - fh * 0.3, 2.4 * S, fh * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEvapRig(ctx: CanvasRenderingContext2D, g: Geom, j: Job) {
  const { rigX: x, benchY, S } = g;
  const fade = clamp((j.t - PE.cryst) / (PE.fade - PE.cryst), 0, 1);
  const rigA = 1 - fade;
  if (rigA <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = rigA;

  drawBurner(ctx, x, benchY, S, j.heat);
  // tripod legs + gauze
  ctx.strokeStyle = '#5d6a79';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 30 * S, benchY - 2);
  ctx.lineTo(x - 22 * S, benchY - 46 * S);
  ctx.moveTo(x + 30 * S, benchY - 2);
  ctx.lineTo(x + 22 * S, benchY - 46 * S);
  ctx.moveTo(x, benchY - 2);
  ctx.lineTo(x, benchY - 46 * S);
  ctx.stroke();
  ctx.strokeStyle = '#8d99a6';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 30 * S, benchY - 48 * S, 60 * S, 4 * S);
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 30 * S + i * 10 * S, benchY - 48 * S);
    ctx.lineTo(x - 30 * S + (i - 1) * 10 * S, benchY - 44 * S);
    ctx.stroke();
  }
  // evaporating dish
  const rimY = benchY - 58 * S;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(x, rimY, 34 * S, 9 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, rimY, 34 * S, 9 * S, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 34 * S, rimY);
  ctx.quadraticCurveTo(x, rimY + 11 * S, x + 34 * S, rimY);
  ctx.stroke();
  // water level
  const wf = clamp(j.dishWater / Math.max(1, j.take), 0, 1);
  if (wf > 0.02) {
    ctx.fillStyle = 'rgba(160,203,232,0.8)';
    ctx.beginPath();
    ctx.ellipse(x, rimY + 2 * S, 30 * S * (0.6 + 0.4 * wf), 5 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, rimY + 2 * S, 30 * S * (0.6 + 0.4 * wf), 5 * S, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // salt crystals (white cubes; grey if contaminated)
  if (j.crystal > 0.02) {
    const n = Math.ceil(j.crystal * CRYSTALS.length);
    for (let i = 0; i < n; i++) {
      const c = CRYSTALS[i];
      ctx.save();
      ctx.translate(x + c.fx * 44 * S, rimY + 2 * S + (hash(i + 20) - 0.5) * 4);
      ctx.rotate(c.rot);
      const sz = c.sz * S * (0.5 + 0.5 * j.crystal);
      ctx.fillStyle = j.dirty ? '#b9bec6' : '#fbfdfe';
      ctx.strokeStyle = j.dirty ? '#8b929c' : '#cfd9e2';
      ctx.lineWidth = 1;
      ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    }
    if (j.dirty) {
      for (let i = 0; i < n * 2; i++) {
        ctx.fillStyle = 'rgba(90,80,60,0.5)';
        ctx.fillRect(x + (hash(i + 30) - 0.5) * 56 * S, rimY + (hash(i + 40) - 0.5) * 7, 1.6, 1.6);
      }
    }
  }
  ctx.restore();
}

function drawDistilRig(ctx: CanvasRenderingContext2D, g: Geom, j: Job) {
  const { rigX: x, benchY, S } = g;
  const fade = clamp((j.t - PD.rest) / (PD.fade - PD.rest), 0, 1);
  const rigA = 1 - fade;
  if (rigA <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = rigA;

  drawBurner(ctx, x, benchY, S, j.heat);
  // round-bottom flask
  const bulbY = benchY - 52 * S;
  const br = 23 * S;
  const wf = clamp(j.flaskWater / Math.max(1, j.take), 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(x, bulbY, br, 0, Math.PI * 2);
  ctx.fill();
  if (wf > 0.03) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, bulbY, br - 2, 0, Math.PI * 2);
    ctx.clip();
    const surf = bulbY + br - 2 - wf * (br * 1.6);
    const grad = ctx.createLinearGradient(0, surf, 0, bulbY + br);
    grad.addColorStop(0, 'rgba(190,222,242,0.95)');
    grad.addColorStop(1, 'rgba(140,185,220,0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - br, surf, br * 2, br * 2);
    ctx.restore();
  }
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, bulbY, br, 0, Math.PI * 2);
  ctx.stroke();
  // neck + side arm
  const neckTop = benchY - 108 * S;
  ctx.beginPath();
  ctx.moveTo(x - 5 * S, bulbY - br + 2 * S);
  ctx.lineTo(x - 5 * S, neckTop);
  ctx.moveTo(x + 5 * S, bulbY - br + 2 * S);
  ctx.lineTo(x + 5 * S, neckTop);
  ctx.stroke();
  // thermometer at the still head
  const tf = clamp((j.temp - 20) / 85, 0, 1);
  ctx.fillStyle = '#f4f7fa';
  roundRect(ctx, x - 2.2 * S, neckTop - 30 * S, 4.4 * S, 32 * S, 2);
  ctx.fill();
  ctx.strokeStyle = '#9fb0bd';
  ctx.lineWidth = 1;
  roundRect(ctx, x - 2.2 * S, neckTop - 30 * S, 4.4 * S, 32 * S, 2);
  ctx.stroke();
  const colH = tf * 26 * S;
  ctx.fillStyle = '#e8443a';
  roundRect(ctx, x - 1 * S, neckTop - 2 * S - colH, 2 * S, colH + 2 * S, 1);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, neckTop + 1 * S, 2.6 * S, 0, Math.PI * 2);
  ctx.fill();

  // condenser (sloped jacket) from side arm down to the receiver
  const ax = x + 5 * S;
  const ay = neckTop + 3 * S;
  const rOff = Math.min(126 * S, g.w * 0.165);
  const bx = x + rOff;
  const by = ay + (bx - ax) * 0.34;
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.save();
  ctx.translate((ax + bx) / 2, (ay + by) / 2);
  ctx.rotate(Math.atan2(by - ay, bx - ax));
  const jl = Math.hypot(bx - ax, by - ay) - 14 * S;
  ctx.fillStyle = 'rgba(170,210,235,0.3)';
  roundRect(ctx, -jl / 2, -8 * S, jl, 16 * S, 7 * S);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.8;
  roundRect(ctx, -jl / 2, -8 * S, jl, 16 * S, 7 * S);
  ctx.stroke();
  ctx.strokeStyle = '#cde4f2';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-jl / 2 - 2, 0);
  ctx.lineTo(jl / 2 + 2, 0);
  ctx.stroke();
  // cooling water stubs
  ctx.strokeStyle = '#7fb3d5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-jl * 0.28, -8 * S);
  ctx.lineTo(-jl * 0.28, -16 * S);
  ctx.moveTo(jl * 0.28, 8 * S);
  ctx.lineTo(jl * 0.28, 16 * S);
  ctx.stroke();
  ctx.restore();

  // receiver flask under the condenser tip
  const rcx = bx + 6 * S;
  const rby = benchY - 4;
  ctx.fillStyle = '#5d6a79';
  roundRect(ctx, rcx - 14 * S, rby - 4, 28 * S, 4, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(rcx, rby - 16 * S, 12 * S, 0, Math.PI * 2);
  ctx.fill();
  const cf = clamp(j.collected / Math.max(1, j.take * 0.98), 0, 1);
  if (cf > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(rcx, rby - 16 * S, 10 * S, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(160,203,232,0.9)';
    ctx.fillRect(rcx - 10 * S, rby - 16 * S + 10 * S - cf * 19 * S, 20 * S, 20 * S);
    ctx.restore();
  }
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rcx, rby - 16 * S, 12 * S, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rcx - 4 * S, rby - 16 * S - 11 * S);
  ctx.lineTo(rcx - 4 * S, rby - 26 * S);
  ctx.lineTo(rcx + 4 * S, rby - 26 * S);
  ctx.lineTo(rcx + 4 * S, rby - 16 * S - 11 * S);
  ctx.stroke();

  // condensate drip at the outlet
  if (j.boilOn && j.collected > 0.5 && j.collected < j.take * 0.97) {
    const cyc = ((j.t - PD.boil - 0.9) % 0.55) / 0.55;
    const dropY = cyc < 0.55
      ? by + 4 * S + cyc * 4
      : lerp(by + 8 * S, rby - 26 * S, (cyc - 0.55) / 0.45);
    const r = cyc < 0.55 ? 1.6 + cyc * 4.5 : 3.4;
    ctx.fillStyle = 'rgba(120,175,215,0.95)';
    ctx.beginPath();
    ctx.arc(bx + 6 * S, dropY, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBowlStation(
  ctx: CanvasRenderingContext2D,
  g: Geom,
  bowl: { nh4cl: number; salt: number },
  idle: number,
  j: Job | null,
) {
  const { bowlX: x, benchY, S } = g;
  const subl = j && j.kind === 'hotplate' ? j : null;
  const lift = subl ? subl.domeLift : 0;
  const crust = subl ? subl.crust : 0;
  const fade = subl ? clamp((subl.t - PS.lift - 0.4) / (PS.fade - PS.lift - 0.4), 0, 1) : 0;

  // hot plate (visible while subliming, fades after)
  if (subl && fade < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - fade;
    ctx.fillStyle = '#3a4450';
    roundRect(ctx, x - 36 * S, benchY - 12 * S, 72 * S, 12 * S, 4);
    ctx.fill();
    const glow = subl.heat;
    if (glow > 0.03) {
      const pulse = 0.7 + 0.3 * Math.sin(idle * 5);
      ctx.strokeStyle = `rgba(232,68,58,${glow * pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 26 * S, benchY - 12 * S);
      ctx.lineTo(x + 26 * S, benchY - 12 * S);
      ctx.stroke();
    }
    ctx.fillStyle = '#5d6a79';
    ctx.beginPath();
    ctx.arc(x + 42 * S, benchY - 6 * S, 4.5 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // the bowl: shallow glass dish with the mixed white powders
  const bowlY = subl ? benchY - 15 * S : benchY - 4;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(x, bowlY, 31 * S, 8 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, bowlY, 31 * S, 8 * S, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 31 * S, bowlY);
  ctx.quadraticCurveTo(x, bowlY + 10 * S, x + 31 * S, bowlY);
  ctx.stroke();
  // powders — two whites you cannot tell apart by eye
  const nhF = clamp(bowl.nh4cl / NH4CL_START, 0, 1);
  const saF = clamp(bowl.salt / BOWL_SALT_START, 0, 1);
  const nNh = Math.round(nhF * BOWL_SPECKS.length);
  for (let i = 0; i < nNh; i++) {
    const sp = BOWL_SPECKS[i];
    ctx.fillStyle = i % 3 === 0 ? '#e7edf2' : '#f8fafc';
    ctx.fillRect(x + sp.fx * 52 * S - 1, bowlY - 2 - sp.fy * 5 * S - nhF * 2, 2, 2);
  }
  const nSa = Math.round(saF * 22);
  for (let i = 0; i < nSa; i++) {
    const sp = BOWL_SPECKS[(i + 11) % BOWL_SPECKS.length];
    ctx.fillStyle = '#eef0e9';
    ctx.strokeStyle = 'rgba(160,165,160,0.6)';
    ctx.lineWidth = 0.6;
    ctx.fillRect(x + sp.fx * 48 * S - 1.4, bowlY - 2 - sp.fy * 5 * S, 2.8, 2.8);
    ctx.strokeRect(x + sp.fx * 48 * S - 1.4, bowlY - 2 - sp.fy * 5 * S, 2.8, 2.8);
  }

  // watch-glass dome (cold) over the bowl while subliming
  if (subl && fade < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - fade;
    const domeY = bowlY - 2 - lift;
    ctx.fillStyle = 'rgba(178,215,238,0.28)';
    ctx.beginPath();
    ctx.arc(x, domeY, 36 * S, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, domeY, 36 * S, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, domeY, 30 * S, -Math.PI * 0.78, -Math.PI * 0.62);
    ctx.stroke();
    // frosty crust on the inner face
    const n = Math.round(crust * CRUST_SPECKS.length);
    for (let i = 0; i < n; i++) {
      const sp = CRUST_SPECKS[i];
      const px = x + Math.sin(sp.a) * 36 * S * sp.rr;
      const py = domeY - Math.cos(sp.a) * 26 * S * sp.rr;
      ctx.fillStyle = 'rgba(250,252,254,0.95)';
      ctx.fillRect(px - sp.sz / 2, py - sp.sz / 2, sp.sz, sp.sz);
    }
    // vapour curls inside the dome
    if (subl.heat > 0.4 && crust > 0.02 && crust < 0.99) {
      const amp = 6 * S;
      ctx.strokeStyle = `rgba(240,246,250,${0.4 + 0.2 * Math.sin(idle * 2)})`;
      ctx.lineWidth = 2;
      for (let c = 0; c < 3; c++) {
        ctx.beginPath();
        for (let yy = 0; yy <= 20 * S; yy += 3) {
          const cxx = x + (c - 1) * 14 * S + Math.sin(idle * 2.2 + c * 2 + yy * 0.22) * amp * (yy / (20 * S));
          if (yy === 0) ctx.moveTo(cxx, domeY - yy - 1);
          else ctx.lineTo(cxx, domeY - yy - 1);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawShelf(
  ctx: CanvasRenderingContext2D,
  g: Geom,
  products: { sand: boolean; salt: boolean; water: boolean; nh4cl: boolean },
  j: Job | null,
) {
  const socks = g.socks;
  const railY = socks[0].y + 22;
  ctx.fillStyle = '#d8c9a9';
  roundRect(ctx, socks[0].x - 30 * g.S, railY, socks[3].x - socks[0].x + 60 * g.S, 5, 2);
  ctx.fill();
  ctx.strokeStyle = '#c4b28c';
  ctx.lineWidth = 1;
  roundRect(ctx, socks[0].x - 30 * g.S, railY, socks[3].x - socks[0].x + 60 * g.S, 5, 2);
  ctx.stroke();
  if (g.h > 380) {
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(socks[0].x - 26 * g.S, railY + 5);
    ctx.lineTo(socks[0].x - 26 * g.S, g.benchY);
    ctx.moveTo(socks[3].x + 26 * g.S, railY + 5);
    ctx.lineTo(socks[3].x + 26 * g.S, g.benchY);
    ctx.stroke();
  }
  const states = [products.sand, products.salt, products.water, products.nh4cl];
  const kinds: ('sand' | 'salt' | 'water' | 'nh4cl')[] = ['sand', 'salt', 'water', 'nh4cl'];
  socks.forEach((sock, i) => {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = states[i] ? 'rgba(249,115,22,0.55)' : '#c3ccd6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sock.x, sock.y, 17 * g.S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (states[i]) drawToken(ctx, kinds[i], sock.x, sock.y, g.S, 1);
  });

  // a product flying home to its socket during the fade phase
  let fly: { fromX: number; fromY: number; kind: 'sand' | 'salt' | 'water' | 'nh4cl'; sock: number; f: number } | null = null;
  if (j) {
    const f = (t0: number, t1: number) => ease01((j.t - t0) / (t1 - t0));
    if (j.kind === 'funnel' && j.t > PF.back) {
      fly = { fromX: g.rigX, fromY: g.benchY - 78 * g.S, kind: 'sand', sock: 0, f: f(PF.back, PF.fade) };
    } else if (j.kind === 'dish' && !j.dirty && j.dishSalt > 0.4 && j.t > PE.cryst) {
      fly = { fromX: g.rigX, fromY: g.benchY - 58 * g.S, kind: 'salt', sock: 1, f: f(PE.cryst, PE.fade) };
    } else if (j.kind === 'distil' && j.t > PD.rest) {
      const rx = g.rigX + Math.min(126 * g.S, g.w * 0.165) + 6 * g.S;
      fly = { fromX: rx, fromY: g.benchY - 16 * g.S, kind: 'water', sock: 2, f: f(PD.rest, PD.fade) };
    } else if (j.kind === 'hotplate' && j.t > PS.lift + 0.4) {
      fly = { fromX: g.bowlX, fromY: g.benchY - 44 * g.S, kind: 'nh4cl', sock: 3, f: f(PS.lift + 0.4, PS.fade) };
    }
  }
  if (fly && fly.f > 0.01 && fly.f < 0.99) {
    const sock = socks[fly.sock];
    const mx = (fly.fromX + sock.x) / 2;
    const my = Math.min(fly.fromY, sock.y) - 60 * g.S;
    const px = lerp(lerp(fly.fromX, mx, fly.f), lerp(mx, sock.x, fly.f), fly.f);
    const py = lerp(lerp(fly.fromY, my, fly.f), lerp(my, sock.y, fly.f), fly.f);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(249,115,22,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(fly.fromX, fly.fromY);
    ctx.quadraticCurveTo(mx, my, px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    drawToken(ctx, fly.kind, px, py, g.S, 1);
  }
}

function drawToken(ctx: CanvasRenderingContext2D, kind: 'sand' | 'salt' | 'water' | 'nh4cl', x: number, y: number, S: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (kind) {
    case 'sand': {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x - 12 * S, y + 7 * S);
      ctx.lineTo(x, y - 9 * S);
      ctx.lineTo(x + 12 * S, y + 7 * S);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c9d2db';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#d8b26a';
      ctx.beginPath();
      ctx.moveTo(x - 8 * S, y + 6 * S);
      ctx.quadraticCurveTo(x, y - 6 * S, x + 8 * S, y + 6 * S);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'salt': {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y + 5 * S, 13 * S, 4 * S, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(x - 5 * S + i * 5 * S, y + 1 * S);
        ctx.rotate(i * 0.5);
        ctx.fillStyle = '#fbfdfe';
        ctx.strokeStyle = '#cfd9e2';
        ctx.fillRect(-2.6 * S, -2.6 * S, 5.2 * S, 5.2 * S);
        ctx.strokeRect(-2.6 * S, -2.6 * S, 5.2 * S, 5.2 * S);
        ctx.restore();
      }
      break;
    }
    case 'water': {
      ctx.fillStyle = 'rgba(160,203,232,0.9)';
      ctx.beginPath();
      ctx.moveTo(x - 9 * S, y + 8 * S);
      ctx.lineTo(x - 3 * S, y - 2 * S);
      ctx.lineTo(x + 3 * S, y - 2 * S);
      ctx.lineTo(x + 9 * S, y + 8 * S);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 2 * S, y - 2 * S);
      ctx.lineTo(x - 2 * S, y - 8 * S);
      ctx.lineTo(x + 2 * S, y - 8 * S);
      ctx.lineTo(x + 2 * S, y - 2 * S);
      ctx.stroke();
      break;
    }
    case 'nh4cl': {
      ctx.fillStyle = 'rgba(178,215,238,0.35)';
      ctx.beginPath();
      ctx.arc(x, y + 6 * S, 12 * S, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (hash(i + 60) - 0.5) * 1.9;
        ctx.fillStyle = 'rgba(250,252,254,0.95)';
        ctx.fillRect(x + Math.sin(a) * 11 * S - 1, y + 6 * S - Math.cos(a) * 8 * S - 1, 2, 2);
      }
      break;
    }
  }
  ctx.restore();
}
