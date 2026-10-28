import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './rusting-conditions.css';

/**
 * Rusting conditions — the classic four-tube "what does iron need to rust?"
 * bench, rebuilt around real preparation gestures and simulated time.
 *
 * The student prepares each tube by hand — calcium chloride granules for the
 * dry-air tube, a held kettle boil plus an oil seal for the no-air tube, a
 * half-dip of tap water, and a salty half-dip — then lets a day/night clock
 * run (1 day ≈ 15 s at 1×, with 1×/4×/16× playback) while rust creeps along
 * each nail with per-tube rate constants. Rust is worst at the waterline,
 * salt water runs ~2.5× ahead, and a recorded table plus per-tube graphs
 * turn the days into the conclusion: iron needs BOTH air and water.
 */

const DAY_SECONDS = 15; // 1 simulated day = 15 s of real time at 1×
const SPEEDS = [1, 4, 16];
const BOIL_SECONDS = 3.5; // real-time hold that stands for several minutes of boiling

// Per-tube kinetics. Each nail is 9 segments; every segment follows
// d(seg)/dt = k · f(pos) · (1 − seg/Rmax) — an honest saturating crust: fresh
// iron rusts fastest, the growing crust slows the attack down.
const SEGS = 9;
const K_TAP = 0.95; // half-dipped in tap water, open to the air
const K_SALT = 2.375; // salt water ≈ 2.5× the tap-water rate
const K_T2_UNBOILED = 0.12; // fully under unboiled water (dissolved air only)
const K_T2_BOILED = 0.035; // boiled but not yet sealed — a whisper of redissolved air
const K_T1_UNDRIED = 0.03; // humid air alone hazes the nail very slowly
const RMAX = [8, 38, 88, 93]; // segment ceilings: t1, t2, t3, t4
const RMAX_T2_BOILED = 15;

// Position factors for a half-dipped nail (waterline at nail fraction 0.5):
// rust is WORST exactly at the waterline, thin above (little water), and
// diffusion-starved deep below (little oxygen).
const F_HALF = [0.16, 0.19, 0.25, 0.34, 1.15, 0.62, 0.5, 0.42, 0.36];
const F_SUBMERGED = [0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78];
const F_AIR = [1, 1, 1, 1, 1, 1, 1, 1, 1];

const RUST_SHADES = ['#b45309', '#9a3412', '#c2610e', '#7c3a0d'];

const TUBES = [
  { name: 'Dry air', detail: 'nail + drying agent', color: '#64748b' },
  { name: 'No air', detail: 'boiled water + oil seal', color: '#3b6fd4' },
  { name: 'Air + water', detail: 'nail half-dipped', color: '#2f9e77' },
  { name: 'Salt water', detail: 'salty half-dip', color: '#f97316' },
] as const;

type ToolId = 'kettle' | 'jug' | 'oil' | 'cacl2' | 'salt';
const TOOL_IDS: ToolId[] = ['kettle', 'jug', 'oil', 'cacl2', 'salt'];
const TOOL_NAMES: Record<ToolId, string> = {
  kettle: 'kettle', jug: 'water jug', oil: 'oil bottle', cacl2: 'calcium chloride jar', salt: 'salt cellar',
};

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'dry', title: 'Set up the dry-air tube', detail: 'Drag the calcium chloride jar from the shelf onto tube 1 (far left) and drop. The granules drink up every trace of moisture, so that nail sits in dry air alone.', hint: 'On touch screens, drag with a finger — or press the “Next preparation” button.' },
  { id: 'seal', title: 'Boil and seal the no-air tube', detail: 'Hold the kettle over tube 2 until the water boils clear (a few minutes on the kettle’s clock), then drag the oil bottle over it to pour the sealing layer.', hint: 'Boiling expels the dissolved air; the oil stops fresh air from creeping back in.' },
  { id: 'water', title: 'Half-dip the air + water nail', detail: 'Drag the water jug over tube 3 and drop — it fills until the nail sits half under water and half in open air.', hint: 'Watch that waterline: something interesting will grow there.' },
  { id: 'salt', title: 'Salt the last tube', detail: 'Fill tube 4 from the water jug as well, then sprinkle in salt from the cellar — same water, same air, extra salt.', hint: 'Keep everything else the same so the salt is the only difference.' },
  { id: 'days', title: 'Run the days and record', detail: 'Let the day/night clock run and record each day. Three different days of readings make the comparison honest.', hint: 'Speed up playback to 4× or 16× — the simulated clock stays consistent.' },
  { id: 'conclude', title: 'Conclude what iron needs', detail: 'From your table: which tubes rusted, which stayed clean? Answer the conclusion in the control panel.', hint: 'Compare tubes 1 and 2 with tubes 3 and 4 — what do the rusty ones share?' },
];

const BADGES: BadgeDef[] = [
  { id: 'bench-ready', title: 'Bench prepared', icon: '⚗', detail: 'Prepared all four tubes correctly: drying agent, boiled-and-sealed water, tap water, salt water.' },
  { id: 'three-days', title: 'Three days logged', icon: '🗓', detail: 'Recorded rust readings on three different days.' },
  { id: 'conclusion', title: 'Condition concluded', icon: '💡', detail: 'Answered the conclusion correctly: iron needs both air and water to rust.' },
  { id: 'waterline', title: 'Waterline watcher', icon: '🌊', detail: 'Inspected a rusting half-dipped nail up close and spotted the worst-at-the-waterline band.' },
  { id: 'salt', title: 'Salt accelerator', icon: '🧂', detail: 'Watched salt water pull clearly ahead of plain water — the electrolyte effect.' },
];

interface TrialRow { id: number; day: number; r1: number; r2: number; r3: number; r4: number }

interface UiSnap {
  days: number;
  rust: number[];
  prepped: boolean[];
  temp: number;
  boiling: boolean;
  paused: boolean;
  dragTool: ToolId | null;
  hover: number | null;
  autoBoil: boolean;
  sealed: boolean;
  boiled: boolean;
}

interface Mote { x: number; y: number; vx: number; vy: number; r: number; ph: number }
interface Bubble { y: number; r: number; vy: number; wob: number }
interface Steam { x: number; y: number; vy: number; r: number; age: number; life: number; wob: number }
interface StreamP { kind: ToolId; x: number; y: number; vy: number; age: number; wob: number }
interface Patch { fy: number; fx: number; r: number; sh: number }

interface Tube {
  cacl2: boolean;
  filled: boolean;
  boiled: number; // 0..1 boil progress of tube 2's water
  sealed: boolean;
  salt: boolean;
  level: number; // animated water level (fraction of inner height)
  oil: number; // animated oil layer thickness
  gran: number; // animated drying-agent bed
  saltCloud: number; // fading dissolving cloud
  segs: number[];
  rust: number;
  bubbles: Bubble[];
}

interface Tool { id: ToolId; x: number; y: number; held: boolean; busy: boolean; grabDX: number; grabDY: number; homeX: number; homeY: number }
interface Job { tool: ToolId; tube: number; t: number; dur: number; fromX: number; fromY: number }

// Deterministic rust-patch layout: which blotches exist on each segment of
// each nail, so the rust always grows in the same places for a given tube.
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATCHES: Patch[][][] = TUBES.map((_, ti) => {
  const rnd = mulberry(101 + ti * 37);
  return Array.from({ length: SEGS }, () =>
    Array.from({ length: 6 }, () => ({
      fy: rnd() * 1.5 - 0.75,
      fx: rnd() * 1.7 - 0.85,
      r: 1.4 + rnd() * 1.8,
      sh: Math.floor(rnd() * RUST_SHADES.length),
    })),
  );
});

const MOTES0: Mote[] = Array.from({ length: 16 }, (_, i) => {
  const rnd = mulberry(55 + i * 13);
  return { x: rnd(), y: rnd() * 0.72, vx: (rnd() - 0.5) * 0.012, vy: (rnd() - 0.5) * 0.008, r: 0.9 + rnd() * 1.6, ph: rnd() * Math.PI * 2 };
});

const meta = getLabBySlug('rusting-conditions')!;

function makeTubes(): Tube[] {
  return [
    { cacl2: false, filled: false, boiled: 0, sealed: false, salt: false, level: 0, oil: 0, gran: 0, saltCloud: 0, segs: new Array(SEGS).fill(0), rust: 0, bubbles: [] },
    { cacl2: false, filled: true, boiled: 0, sealed: false, salt: false, level: 0.78, oil: 0, gran: 0, saltCloud: 0, segs: new Array(SEGS).fill(0), rust: 0, bubbles: [] },
    { cacl2: false, filled: false, boiled: 0, sealed: false, salt: false, level: 0, oil: 0, gran: 0, saltCloud: 0, segs: new Array(SEGS).fill(0), rust: 0, bubbles: [] },
    { cacl2: false, filled: false, boiled: 0, sealed: false, salt: false, level: 0, oil: 0, gran: 0, saltCloud: 0, segs: new Array(SEGS).fill(0), rust: 0, bubbles: [] },
  ];
}

function fmtDayTime(dayFrac: number): string {
  const h = (6 + dayFrac * 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Rust-rate constants for a tube in its current condition. */
function kinetics(t: Tube, idx: number): { k: number; rmax: number; f: number[] } {
  if (idx === 0) return t.cacl2 ? { k: 0, rmax: 1, f: F_AIR } : { k: K_T1_UNDRIED, rmax: RMAX[0], f: F_AIR };
  if (idx === 1) {
    if (t.sealed) return { k: 0, rmax: 1, f: F_SUBMERGED };
    if (t.boiled >= 1) return { k: K_T2_BOILED, rmax: RMAX_T2_BOILED, f: F_SUBMERGED };
    return { k: K_T2_UNBOILED, rmax: RMAX[1], f: F_SUBMERGED };
  }
  if (!t.filled) return { k: 0, rmax: 1, f: F_HALF };
  return t.salt ? { k: K_SALT, rmax: RMAX[3], f: F_HALF } : { k: K_TAP, rmax: RMAX[2], f: F_HALF };
}

/** Can this tool be used on this tube right now? Neutral about hints; the
 *  returned line is only shown when something is actually wrong. */
function compat(tool: ToolId, idx: number, tubes: Tube[]): { ok: boolean; done?: boolean; msg?: string } {
  const t = tubes[idx];
  switch (tool) {
    case 'cacl2':
      if (idx === 0) return t.cacl2 ? { ok: false, done: true, msg: 'Tube 1 already holds its drying agent — the air in there is bone-dry.' } : { ok: true };
      return { ok: false, msg: 'The drying agent belongs in tube 1 — sprinkled anywhere else it just wastes itself.' };
    case 'jug':
      if (idx === 2 || idx === 3) return t.filled ? { ok: false, done: true, msg: `Tube ${idx + 1} is already filled to the half-dip mark.` } : { ok: true };
      if (idx === 1) return { ok: false, msg: 'Tube 2 is already full of water — what it needs is boiling, then an oil seal.' };
      return { ok: false, msg: 'Keep tube 1 dry — water in there would ruin the dry-air condition.' };
    case 'kettle':
      if (idx === 1) return t.boiled >= 1 ? { ok: false, done: true, msg: 'That water is boiled and ready for its oil seal.' } : { ok: true };
      return { ok: false, msg: 'The kettle is only for tube 2 — its water is the one that must be boiled.' };
    case 'oil':
      if (idx === 1) {
        if (t.sealed) return { ok: false, done: true, msg: 'The oil seal is already poured — tube 2 is shut off from the air.' };
        if (t.boiled < 1) return { ok: false, msg: 'Boil the water first — the seal only works once the dissolved air is driven out.' };
        return { ok: true };
      }
      return { ok: false, msg: 'The oil seal belongs on tube 2’s boiled water, nowhere else.' };
    case 'salt':
      if (idx === 3) {
        if (!t.filled) return { ok: false, msg: 'Fill tube 4 with water first — salt needs water to dissolve into.' };
        return t.salt ? { ok: false, done: true, msg: 'Tube 4 is already salty.' } : { ok: true };
      }
      return { ok: false, msg: 'The salt cellar is for tube 4 — it is the only tube that should differ by salt.' };
  }
}

export default function RustingLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    idle: 0,
    days: 0,
    dayInt: 0,
    paused: false,
    acc: 0,
    uiAcc: 0,
    bubbleAcc: 0,
    steamAcc: 0,
    slideAt: 0,
    bubbleSoundAt: 0,
    loopKind: '' as '' | 'pour' | 'hum',
    autoBoil: false,
    autoT: 0,
    dragTool: -1,
    hoverTube: -1,
    inspect: -1,
    saltNotified: false,
    jobs: [] as Job[],
    streams: [] as StreamP[],
    steam: [] as Steam[],
    motes: MOTES0.map((m) => ({ ...m })),
    tubes: makeTubes(),
    tools: [] as Tool[],
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ------------------------------------------------------
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [selTube, setSelTube] = useState(2);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [flash, setFlash] = useState<{ tone: CoachTone; line: string } | null>(null);
  const [conclusion, setConclusion] = useState<'none' | 'wrong' | 'correct'>('none');
  const [ui, setUi] = useState<UiSnap>({ days: 0, rust: [0, 0, 0, 0], prepped: [false, false, false, false], temp: 20, boiling: false, paused: false, dragTool: null, hover: null, autoBoil: false, sealed: false, boiled: false });

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
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 5200);
    return () => window.clearTimeout(t);
  }, [flash]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    setUi({
      days: s.days,
      rust: s.tubes.map((t) => t.rust),
      prepped: [s.tubes[0].cacl2, s.tubes[1].boiled >= 1 && s.tubes[1].sealed, s.tubes[2].filled, s.tubes[3].filled && s.tubes[3].salt],
      temp: 20 + s.tubes[1].boiled * 80,
      boiling: s.loopKind === 'hum',
      paused: s.paused,
      dragTool: s.dragTool >= 0 ? s.tools[s.dragTool]?.id ?? null : null,
      hover: s.hoverTube >= 0 ? s.hoverTube : null,
      autoBoil: s.autoBoil,
      sealed: s.tubes[1].sealed,
      boiled: s.tubes[1].boiled >= 1,
    });
  }, []);

  // ---- mentor completion flags ------------------------------------------------
  const distinctDays = useMemo(() => new Set(rows.map((r) => r.day)).size, [rows]);
  const done = [
    ui.prepped[0],
    ui.prepped[1],
    ui.prepped[2],
    ui.prepped[3],
    distinctDays >= 3,
    conclusion === 'correct',
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

  useEffect(() => {
    if (distinctDays >= 3) earn('three-days');
  }, [distinctDays]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ui.prepped.every(Boolean)) earn('bench-ready');
  }, [ui.prepped]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge --------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'dry': return { target: 'scene', gesture: 'drag', title: 'Dry out tube 1', body: 'Drag the calcium chloride jar from the shelf onto the leftmost tube and drop — the granules keep that air bone-dry.' };
      case 'seal': return { target: 'scene', gesture: 'drag', title: 'Boil and seal tube 2', body: 'Hold the kettle over the second tube until the water boils clear, then drag the oil bottle over to pour the sealing layer.' };
      case 'water': return { target: 'scene', gesture: 'drag', title: 'Half-dip tube 3', body: 'Drag the water jug over the third tube and release — the nail ends up half in water, half in air.' };
      case 'salt': return { target: 'scene', gesture: 'drag', title: 'Salt tube 4', body: 'Fill the last tube from the jug, then sprinkle the salt cellar over it.' };
      case 'days': return { target: 'record', gesture: 'press', title: 'Record the days', body: 'Let the clock run and press “Record this day” — three different days make the comparison honest.' };
      case 'conclude': return { target: 'conclude', gesture: 'press', title: 'Answer the conclusion', body: 'Your table has the pattern: tubes 1 and 2 stayed clean, 3 and 4 rusted. Say what iron really needs.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ---------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const benchY = h - 54;
    const tubeH = clamp(h * 0.5, 148, 250);
    const tubeW = clamp(w * 0.062, 38, 56);
    const rackW = clamp(tubeW * 4 + 36, Math.min(w * 0.8, 420), 420);
    const gap = rackW / 4;
    const cx0 = w / 2;
    const tubeXs = [0, 1, 2, 3].map((i) => cx0 - 1.5 * gap + i * gap);
    const tubeTop = benchY - 16 - tubeH;
    const narrow = w < 700;
    const win = narrow ? { x: 10, y: 12, w: 64, h: 54 } : { x: 24, y: 20, w: 150, h: 116 };
    const toolY = narrow ? 52 : 66;
    const startX = narrow ? win.x + win.w + 16 : Math.max(win.x + win.w + 26, w - 22 - 5 * 66);
    const spacing = narrow ? (w - startX - 14) / 5 : 66;
    const toolPos = TOOL_IDS.map((_, i) => ({ x: startX + spacing * (i + 0.5), y: toolY }));
    // tool homes are refreshed every frame (cheap) so resizes re-flow them
    const s = sim.current;
    s.tools.forEach((tl, i) => {
      if (!tl.held && !tl.busy) { tl.homeX = toolPos[i].x; tl.homeY = toolPos[i].y; tl.x = toolPos[i].x; tl.y = toolPos[i].y; }
      else { tl.homeX = toolPos[i].x; tl.homeY = toolPos[i].y; }
    });
    if (s.tools.length === 0) {
      s.tools = TOOL_IDS.map((id, i) => ({ id, x: toolPos[i].x, y: toolPos[i].y, homeX: toolPos[i].x, homeY: toolPos[i].y, held: false, busy: false, grabDX: 0, grabDY: 0 }));
    }
    return { w, h, benchY, tubeH, tubeW, tubeXs, tubeTop, rackW, cx0, win, narrow, toolPos };
  }, []);

  // ---- physics + loop step -------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.idle += dt;

    // ----- simulated clock -----
    if (!s.paused) {
      const dDays = (dt * speed) / DAY_SECONDS;
      s.days += dDays;
      const di = Math.floor(s.days);
      if (di > s.dayInt) {
        s.dayInt = di;
        labSound.tick();
      }

      // ----- rust kinetics (smooth, sub-stepped for stability at 16×) -----
      s.acc += dDays;
      const h = 1 / 720; // of a day
      while (s.acc >= h) {
        s.acc -= h;
        for (let i = 0; i < 4; i += 1) {
          const t = s.tubes[i];
          const kin = kinetics(t, i);
          if (kin.k <= 0) continue;
          for (let j = 0; j < SEGS; j += 1) {
            const f = kin.f[j];
            t.segs[j] = Math.min(kin.rmax, t.segs[j] + kin.k * f * (1 - t.segs[j] / kin.rmax) * h);
          }
        }
      }
      for (let i = 0; i < 4; i += 1) {
        const t = s.tubes[i];
        t.rust = t.segs.reduce((a, b) => a + b, 0) / SEGS;
      }
    }

    // ----- kettle boiling (a real-time hold, standing for several minutes) -----
    const t2 = s.tubes[1];
    const kettleHeldOver = s.dragTool >= 0 && s.tools[s.dragTool]?.id === 'kettle' && s.hoverTube === 1;
    const boiling = (kettleHeldOver || (s.autoBoil && s.autoT > 0.8)) && t2.boiled < 1;
    if (boiling) {
      t2.boiled = Math.min(1, t2.boiled + dt / BOIL_SECONDS);
      s.bubbleAcc += dt * (2 + t2.boiled * 16);
      while (s.bubbleAcc >= 1) {
        s.bubbleAcc -= 1;
        t2.bubbles.push({ y: 0, r: 1.2 + Math.random() * 2.2, vy: 0.5 + Math.random() * 0.5, wob: Math.random() * Math.PI * 2 });
        if (t2.bubbles.length > 46) t2.bubbles.shift();
      }
      const now = performance.now();
      if (now - s.bubbleSoundAt > 340) {
        s.bubbleSoundAt = now;
        labSound.drip(true);
      }
      if (s.loopKind !== 'hum') { labSound.startLoop('hum'); s.loopKind = 'hum'; }
      if (t2.boiled >= 1) {
        if (s.loopKind === 'hum') { labSound.stopLoop(); s.loopKind = ''; }
        labSound.ping(880, 0.1);
        labSound.glassClink(false);
        pushToast('info', '♨', 'Boiled clear — several minutes of rolling has driven the dissolved air out of tube 2’s water. Now seal it with oil.');
        if (s.autoBoil) s.autoBoil = false;
      }
    } else if (s.loopKind === 'hum') {
      labSound.stopLoop();
      s.loopKind = '';
    }
    // auto-boil fly-in / fly-out animation
    const autoTarget = s.autoBoil ? 1 : 0;
    s.autoT += (autoTarget - s.autoT) * Math.min(1, dt * 4);

    // ----- pour jobs -----
    for (const job of s.jobs) {
      job.t += dt;
      const tool = s.tools.find((tl) => tl.id === job.tool);
      const gx = geom();
      const tubeX = gx.tubeXs[job.tube];
      const mouthY = gx.tubeTop - 6;
      if (tool) {
        if (job.t < 0.22) { // slide to the tube mouth
          const p = job.t / 0.22;
          tool.x = job.fromX + (tubeX - job.fromX) * p;
          tool.y = job.fromY + (mouthY - 26 - job.fromY) * p;
        } else if (job.t < job.dur - 0.35) { // hover + pour
          tool.x = tubeX;
          tool.y = mouthY - 26;
        } else { // fly home
          const p = clamp((job.t - (job.dur - 0.35)) / 0.35, 0, 1);
          tool.x = tubeX + (tool.homeX - tubeX) * p;
          tool.y = mouthY - 26 + (tool.homeY - mouthY + 26) * p;
        }
      }
      // stream particles during the pour
      if (job.t > 0.24 && job.t < job.dur - 0.42) {
        s.streams.push({ kind: job.tool, x: tubeX + (Math.random() - 0.5) * 5, y: mouthY, vy: 150 + Math.random() * 90, age: 0, wob: Math.random() * Math.PI * 2 });
      }
      if (job.t >= job.dur) {
        if (tool) { tool.busy = false; tool.x = tool.homeX; tool.y = tool.homeY; }
        if (s.loopKind === 'pour') { labSound.stopLoop(); s.loopKind = ''; }
        if (job.tool === 'jug') labSound.drip(true);
        if (job.tool === 'oil') labSound.drip(false);
      }
    }
    s.jobs = s.jobs.filter((j) => j.t < j.dur);
    for (const p of s.streams) {
      p.age += dt;
      p.y += p.vy * dt;
    }
    s.streams = s.streams.filter((p) => p.age < 0.5);

    // ----- liquid level animations -----
    for (let i = 0; i < 4; i += 1) {
      const t = s.tubes[i];
      const target = i === 1 ? 0.78 : 0.35;
      t.level += ((t.filled || i === 1 ? target : 0) - t.level) * Math.min(1, dt * 2.4);
      t.oil += ((t.sealed ? 0.1 : 0) - t.oil) * Math.min(1, dt * 2.4);
      t.gran += ((t.cacl2 ? 1 : 0) - t.gran) * Math.min(1, dt * 2.6);
      t.saltCloud = Math.max(0, t.saltCloud - dt * 0.4);
      for (const b of t.bubbles) {
        b.y += b.vy * dt;
        b.r += dt * 1.1;
      }
      t.bubbles = t.bubbles.filter((b) => b.y < 1);
    }

    // ----- steam wisps while boiling -----
    if (boiling) {
      s.steamAcc += dt * 5;
      while (s.steamAcc >= 1) {
        s.steamAcc -= 1;
        s.steam.push({ x: (Math.random() - 0.5) * 16, y: 0, vy: 0.45 + Math.random() * 0.3, r: 2.5 + Math.random() * 2.5, age: 0, life: 1.1 + Math.random() * 0.9, wob: Math.random() * Math.PI * 2 });
      }
    }
    for (const p of s.steam) {
      p.age += dt;
      p.y += p.vy * dt;
      p.r += dt * 3.4;
    }
    s.steam = s.steam.filter((p) => p.age < p.life);

    // ----- dust motes drift -----
    for (const m of s.motes) {
      m.x += (m.vx + Math.sin(s.idle * 0.4 + m.ph) * 0.004) * dt;
      m.y += m.vy * dt;
      if (m.x < -0.02) m.x = 1.02;
      if (m.x > 1.02) m.x = -0.02;
      if (m.y < 0) m.y = 0.72;
      if (m.y > 0.74) m.y = 0.02;
    }

    // ----- salt-accelerator badge: salt water clearly ahead of plain water -----
    if (!s.saltNotified) {
      const r3 = s.tubes[2].rust;
      const r4 = s.tubes[3].rust;
      if (r4 >= 25 && r3 >= 10 && r4 >= 2 * r3) {
        s.saltNotified = true;
        earn('salt');
        pushToast('good', '🧂', 'Salt water has pulled far ahead of plain water — dissolved salt acts as an electrolyte, roughly 2.5× faster here.');
      }
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, earn, pushToast, syncUi, geom]);

  // ---- drawing -----------------------------------------------------------------
  const drawNail = useCallback((ctx: CanvasRenderingContext2D, cx: number, top: number, len: number, width: number, tubeIdx: number, segs: number[], opts: { scale?: number; waterFrac?: number | null; oilFrac?: number | null }) => {
    const scale = opts.scale ?? 1;
    const shankW = width * scale;
    const segH = len / SEGS;
    // head
    ctx.fillStyle = '#4a5568';
    ctx.beginPath();
    ctx.ellipse(cx, top + 3 * scale, shankW * 1.5, 3.2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    // shank
    const grad = ctx.createLinearGradient(cx - shankW / 2, 0, cx + shankW / 2, 0);
    grad.addColorStop(0, '#3f4a5c');
    grad.addColorStop(0.35, '#6b7889');
    grad.addColorStop(1, '#39434f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - shankW / 2, top + 5 * scale);
    ctx.lineTo(cx + shankW / 2, top + 5 * scale);
    ctx.lineTo(cx + shankW * 0.28, top + len - 7 * scale);
    ctx.lineTo(cx - shankW * 0.28, top + len - 7 * scale);
    ctx.closePath();
    ctx.fill();
    // tip
    ctx.beginPath();
    ctx.moveTo(cx - shankW * 0.28, top + len - 7 * scale);
    ctx.lineTo(cx, top + len);
    ctx.lineTo(cx + shankW * 0.28, top + len - 7 * scale);
    ctx.closePath();
    ctx.fill();
    // sheen
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, 1 * scale);
    ctx.beginPath();
    ctx.moveTo(cx - shankW * 0.16, top + 7 * scale);
    ctx.lineTo(cx - shankW * 0.16, top + len - 10 * scale);
    ctx.stroke();

    // rust patches grow along the segments
    const patches = PATCHES[tubeIdx];
    for (let j = 0; j < SEGS; j += 1) {
      const v = segs[j];
      if (v < 1.2) continue;
      const a = clamp(v / 70, 0.08, 0.92);
      const y0 = top + j * segH;
      // broad tint
      ctx.fillStyle = `rgba(154,52,18,${a * 0.3})`;
      ctx.fillRect(cx - shankW * 0.62, y0 + 1, shankW * 1.24, segH - 2);
      // blotches
      const count = Math.max(1, Math.ceil(a * patches[j].length));
      for (let p = 0; p < count; p += 1) {
        const pa = patches[j][p];
        const px = cx + pa.fx * shankW * 1.05;
        const py = y0 + segH * (0.5 + pa.fy * 0.42);
        ctx.fillStyle = RUST_SHADES[pa.sh];
        ctx.globalAlpha = clamp(a * 1.15, 0, 0.95);
        ctx.beginPath();
        ctx.ellipse(px, py, pa.r * scale * 1.6, pa.r * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // waterline marker (magnifier only)
    if (opts.waterFrac != null) {
      const wy = top + opts.waterFrac * len;
      ctx.setLineDash([4 * scale, 3 * scale]);
      ctx.strokeStyle = 'rgba(59,111,212,0.75)';
      ctx.lineWidth = 1.4 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - shankW * 2.6, wy);
      ctx.lineTo(cx + shankW * 2.6, wy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (opts.oilFrac != null) {
      const oy = top + opts.oilFrac * len;
      ctx.setLineDash([2 * scale, 3 * scale]);
      ctx.strokeStyle = 'rgba(196,138,42,0.8)';
      ctx.lineWidth = 1.4 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - shankW * 2.6, oy);
      ctx.lineTo(cx + shankW * 2.6, oy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, []);

  const drawTool = useCallback((ctx: CanvasRenderingContext2D, id: ToolId, x: number, y: number, tilt: number, lift: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(1 + lift * 0.18, 1 + lift * 0.18);
    if (lift > 0.05) {
      ctx.shadowColor = 'rgba(23,35,52,0.25)';
      ctx.shadowBlur = 12 * lift;
      ctx.shadowOffsetY = 8 * lift;
    }
    switch (id) {
      case 'kettle': {
        ctx.fillStyle = '#5d6a79';
        roundRect(ctx, -15, -10, 30, 20, 6); ctx.fill();
        ctx.strokeStyle = '#3a4450'; ctx.lineWidth = 1.5;
        roundRect(ctx, -15, -10, 30, 20, 6); ctx.stroke();
        // spout
        ctx.fillStyle = '#5d6a79';
        ctx.beginPath();
        ctx.moveTo(-14, -6);
        ctx.lineTo(-26, -16);
        ctx.lineTo(-20, -4);
        ctx.closePath();
        ctx.fill();
        // lid + knob
        ctx.fillStyle = '#495563';
        roundRect(ctx, -9, -14, 18, 5, 2); ctx.fill();
        ctx.fillStyle = '#d9a441';
        ctx.beginPath(); ctx.arc(0, -16, 2.6, 0, Math.PI * 2); ctx.fill();
        // handle
        ctx.strokeStyle = '#39434f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(4, -8, 13, Math.PI * 1.05, Math.PI * 1.85); ctx.stroke();
        // shine
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(-9, 5); ctx.stroke();
        break;
      }
      case 'jug': {
        ctx.fillStyle = 'rgba(214,234,248,0.65)';
        roundRect(ctx, -12, -12, 24, 26, 4); ctx.fill();
        ctx.strokeStyle = '#8da8b9'; ctx.lineWidth = 1.75;
        roundRect(ctx, -12, -12, 24, 26, 4); ctx.stroke();
        // water inside
        ctx.fillStyle = 'rgba(120,180,220,0.55)';
        ctx.fillRect(-10, 0, 20, 12);
        // lip + handle
        ctx.strokeStyle = '#8da8b9'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-15, -17); ctx.stroke();
        ctx.beginPath(); ctx.arc(11, 0, 8, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        break;
      }
      case 'oil': {
        ctx.fillStyle = 'rgba(226,170,72,0.6)';
        roundRect(ctx, -7, -6, 14, 22, 4); ctx.fill();
        ctx.fillStyle = 'rgba(226,170,72,0.85)';
        roundRect(ctx, -7, 4, 14, 12, 3); ctx.fill();
        ctx.strokeStyle = '#a97b2e'; ctx.lineWidth = 1.5;
        roundRect(ctx, -7, -6, 14, 22, 4); ctx.stroke();
        // neck + cork
        ctx.fillStyle = 'rgba(226,170,72,0.6)';
        ctx.fillRect(-3.4, -14, 6.8, 9);
        ctx.strokeStyle = '#a97b2e';
        ctx.strokeRect(-3.4, -14, 6.8, 9);
        ctx.fillStyle = '#b98d55';
        roundRect(ctx, -4.4, -18, 8.8, 5, 2); ctx.fill();
        break;
      }
      case 'cacl2': {
        ctx.fillStyle = 'rgba(233,229,219,0.9)';
        roundRect(ctx, -14, -8, 28, 20, 4); ctx.fill();
        // granules inside
        ctx.fillStyle = '#cfc9bc';
        for (let i = 0; i < 7; i += 1) {
          const rnd = mulberry(7 + i);
          ctx.beginPath();
          ctx.ellipse(-10 + i * 3.4, 3 + (rnd() - 0.5) * 4, 2.4, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#a29a8a'; ctx.lineWidth = 1.75;
        roundRect(ctx, -14, -8, 28, 20, 4); ctx.stroke();
        // lid
        ctx.fillStyle = '#8a96a4';
        roundRect(ctx, -15, -12, 30, 6, 2); ctx.fill();
        break;
      }
      case 'salt': {
        ctx.fillStyle = '#f2f4f7';
        roundRect(ctx, -9, -4, 18, 18, 4); ctx.fill();
        ctx.strokeStyle = '#b6c1cc'; ctx.lineWidth = 1.5;
        roundRect(ctx, -9, -4, 18, 18, 4); ctx.stroke();
        // domed cap with holes
        ctx.fillStyle = '#e4e9ef';
        ctx.beginPath(); ctx.arc(0, -5, 9.5, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#b6c1cc';
        ctx.beginPath(); ctx.arc(0, -5, 9.5, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#7c8998';
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath(); ctx.arc(i * 4.4, -8.5, 1.1, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }, []);

  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const dayFrac = s.days % 1;
    const hour = (6 + dayFrac * 24) % 24;
    const daylight = clamp(Math.sin(((hour - 6) / 12) * Math.PI), 0, 1);
    const dusk = clamp(1 - Math.abs(daylight - 0.35) * 3.2, 0, 1);

    // background wall
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // night tint over the room
    if (daylight < 0.9) {
      ctx.fillStyle = `rgba(23,35,52,${(1 - daylight) * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }

    // ---- window with a day/night sky ----
    const win = g.win;
    ctx.fillStyle = '#5d6a79';
    roundRect(ctx, win.x - 5, win.y - 5, win.w + 10, win.h + 10, 7); ctx.fill();
    const sky = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
    const nightTop = [27, 39, 64]; const dayTop = [191, 224, 245];
    const nightBot = [44, 58, 88]; const dayBot = [234, 245, 253];
    const mix = (a: number[], b: number[], t: number) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
    sky.addColorStop(0, mix(nightTop, dayTop, daylight));
    sky.addColorStop(1, mix(nightBot, dayBot, daylight));
    if (dusk > 0.02) {
      sky.addColorStop(clamp(0.5 - daylight, 0.02, 0.45), `rgba(245,177,110,${dusk * 0.75})`);
    }
    ctx.fillStyle = sky;
    ctx.fillRect(win.x, win.y, win.w, win.h);
    // stars at night
    if (daylight < 0.5) {
      const rnd = mulberry(9);
      ctx.fillStyle = `rgba(240,244,250,${(1 - daylight * 2) * 0.9})`;
      for (let i = 0; i < 14; i += 1) {
        const sx = win.x + rnd() * win.w;
        const sy = win.y + rnd() * win.h * 0.72;
        const tw = 0.6 + Math.sin(s.idle * 1.6 + i * 2.1) * 0.4;
        ctx.globalAlpha = tw;
        ctx.beginPath(); ctx.arc(sx, sy, 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // sun / moon arc
    if (hour >= 6 && hour <= 18) {
      const p = (hour - 6) / 12;
      const sx = win.x + 10 + p * (win.w - 20);
      const sy = win.y + win.h - 10 - Math.sin(p * Math.PI) * (win.h - 26);
      ctx.fillStyle = '#f5b642';
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(5, win.w * 0.05), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(245,182,66,0.25)';
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(9, win.w * 0.09), 0, Math.PI * 2); ctx.fill();
    } else {
      const mp = ((hour + 24 - 18) % 24) / 12;
      const mx = win.x + 10 + mp * (win.w - 20);
      const my = win.y + win.h - 10 - Math.sin(mp * Math.PI) * (win.h - 26);
      ctx.fillStyle = '#e8ecf2';
      ctx.beginPath(); ctx.arc(mx, my, Math.max(4.5, win.w * 0.045), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mix(nightTop, dayTop, daylight);
      ctx.beginPath(); ctx.arc(mx + Math.max(2, win.w * 0.02), my - Math.max(1, win.w * 0.01), Math.max(3.6, win.w * 0.036), 0, Math.PI * 2); ctx.fill();
    }
    // window cross bars
    ctx.strokeStyle = '#5d6a79'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(win.x + win.w / 2, win.y); ctx.lineTo(win.x + win.w / 2, win.y + win.h);
    ctx.moveTo(win.x, win.y + win.h / 2); ctx.lineTo(win.x + win.w, win.y + win.h / 2);
    ctx.stroke();
    // moonlight pool on the bench at night
    if (daylight < 0.45) {
      const pool = ctx.createRadialGradient(g.cx0, g.benchY - 30, 10, g.cx0, g.benchY - 30, g.rackW * 0.8);
      pool.addColorStop(0, `rgba(214,226,244,${(0.45 - daylight) * 0.3})`);
      pool.addColorStop(1, 'rgba(214,226,244,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(0, g.benchY - 120, w, 140);
    }

    // ---- dust motes ----
    for (const m of s.motes) {
      const a = (0.05 + 0.06 * (0.5 + 0.5 * Math.sin(s.idle * 0.8 + m.ph))) * (0.45 + 0.55 * daylight);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- bench ----
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, g.benchY); ctx.lineTo(w, g.benchY); ctx.stroke();
    ctx.strokeStyle = '#dde4ea'; ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 26) {
      ctx.beginPath(); ctx.moveTo(x, g.benchY); ctx.lineTo(x - 10, g.benchY + 10); ctx.stroke();
    }
    ctx.fillStyle = '#d3dae1';
    ctx.fillRect(0, g.benchY + 12, w, 3);

    // ---- tool shelf (a plank on the wall) ----
    const shelfL = Math.min(...g.toolPos.map((p) => p.x)) - 26;
    const shelfR = Math.max(...g.toolPos.map((p) => p.x)) + 26;
    ctx.fillStyle = '#c8a065';
    roundRect(ctx, shelfL, g.toolPos[0].y + 16, shelfR - shelfL, 7, 3); ctx.fill();
    ctx.fillStyle = '#a97e46';
    ctx.fillRect(shelfL + 6, g.toolPos[0].y + 23, 6, 10);
    ctx.fillRect(shelfR - 12, g.toolPos[0].y + 23, 6, 10);

    // ---- rack ----
    const rackL = g.cx0 - g.rackW / 2;
    const rackR = g.cx0 + g.rackW / 2;
    // soft shadow
    ctx.fillStyle = 'rgba(23,35,52,0.08)';
    ctx.beginPath();
    ctx.ellipse(g.cx0, g.benchY + 2, g.rackW * 0.56, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // base
    const wood = ctx.createLinearGradient(0, g.benchY - 16, 0, g.benchY);
    wood.addColorStop(0, '#d9b177');
    wood.addColorStop(1, '#a97e46');
    ctx.fillStyle = wood;
    roundRect(ctx, rackL, g.benchY - 16, g.rackW, 16, 4); ctx.fill();
    // uprights
    ctx.fillStyle = '#c8a065';
    roundRect(ctx, rackL + 4, g.tubeTop + 10, 9, g.benchY - 16 - g.tubeTop - 10, 3); ctx.fill();
    roundRect(ctx, rackR - 13, g.tubeTop + 10, 9, g.benchY - 16 - g.tubeTop - 10, 3); ctx.fill();
    // top plate with tube holes
    const plateY = g.tubeTop + g.tubeH * 0.22;
    ctx.fillStyle = '#c8a065';
    roundRect(ctx, rackL, plateY, g.rackW, 10, 4); ctx.fill();
    ctx.fillStyle = '#e8dcc8';
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(g.tubeXs[i], plateY + 5, g.tubeW * 0.42, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // colour identity dots on the base front
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = TUBES[i].color;
      ctx.beginPath();
      ctx.arc(g.tubeXs[i], g.benchY - 8, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ---- tubes ----
    for (let i = 0; i < 4; i += 1) {
      const t = s.tubes[i];
      const cx = g.tubeXs[i];
      const top = g.tubeTop;
      const bottom = g.benchY - 16;
      const tw = g.tubeW;
      const l = cx - tw / 2;
      const r = cx + tw / 2;
      const innerTop = top + 5;
      const innerBottom = bottom - 5;
      const innerH = innerBottom - innerTop;

      // hover highlight ring while a tool is dragged over this tube (neutral)
      if (s.dragTool >= 0 && s.hoverTube === i) {
        const pulse = 0.55 + 0.45 * Math.sin(s.idle * 6);
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = `rgba(249,115,22,${0.35 + pulse * 0.4})`;
        ctx.lineWidth = 2.5;
        roundRect(ctx, l - 9, top - 12, tw + 18, bottom - top + 18, 10);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // inspect ring
      if (s.inspect === i) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(59,111,212,0.85)';
        ctx.lineWidth = 2.5;
        roundRect(ctx, l - 11, top - 14, tw + 22, bottom - top + 22, 11);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // glass body fill
      const glassPath = () => {
        ctx.beginPath();
        ctx.moveTo(l, top);
        ctx.lineTo(l, bottom - tw * 0.5);
        ctx.quadraticCurveTo(l, bottom, cx, bottom);
        ctx.quadraticCurveTo(r, bottom, r, bottom - tw * 0.5);
        ctx.lineTo(r, top);
        ctx.closePath();
      };
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      glassPath(); ctx.fill();

      // contents (clipped)
      ctx.save();
      glassPath(); ctx.clip();
      const levelY = innerBottom - t.level * innerH;
      if (t.gran > 0.02) {
        // calcium chloride bed
        const bedH = 16 * t.gran;
        ctx.fillStyle = '#e8e4da';
        ctx.fillRect(l, innerBottom - bedH, tw, bedH);
        ctx.fillStyle = '#cfc9bc';
        const rnd = mulberry(31 + i);
        for (let p = 0; p < 10; p += 1) {
          ctx.beginPath();
          ctx.ellipse(l + 3 + rnd() * (tw - 6), innerBottom - rnd() * bedH, 2.6, 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (t.level > 0.01) {
        // water body — shimmering surface
        const shimmer = Math.sin(s.idle * 2.2 + i * 1.7) * 1.4;
        const wg = ctx.createLinearGradient(0, levelY, 0, innerBottom);
        const cloudy = t.saltCloud > 0.05;
        if (i === 1) { // boiled water clears as the boil completes
          const clear = t.boiled;
          wg.addColorStop(0, `rgba(${196 - clear * 30},${224 - clear * 24},${240 - clear * 16},0.62)`);
          wg.addColorStop(1, `rgba(${150 - clear * 24},${196 - clear * 30},${222 - clear * 30},0.66)`);
        } else if (i === 3 && t.salt) { // salt water — a touch milky-teal once the salt is in
          wg.addColorStop(0, cloudy ? 'rgba(206,224,222,0.66)' : 'rgba(196,222,220,0.6)');
          wg.addColorStop(1, cloudy ? 'rgba(148,186,186,0.68)' : 'rgba(146,186,188,0.62)');
        } else {
          wg.addColorStop(0, 'rgba(199,224,242,0.6)');
          wg.addColorStop(1, 'rgba(152,193,222,0.64)');
        }
        ctx.fillStyle = wg;
        ctx.fillRect(l, levelY + shimmer, tw, innerBottom - levelY);
        // surface line
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(l + 2, levelY + shimmer);
        ctx.quadraticCurveTo(cx, levelY - 1.5 + shimmer, r - 2, levelY + shimmer);
        ctx.stroke();
        // oil layer on boiled water
        if (t.oil > 0.005) {
          const oilY = levelY - t.oil * innerH;
          const og = ctx.createLinearGradient(0, oilY, 0, levelY);
          og.addColorStop(0, 'rgba(222,168,74,0.72)');
          og.addColorStop(1, 'rgba(196,138,42,0.6)');
          ctx.fillStyle = og;
          ctx.fillRect(l, oilY + shimmer, tw, levelY - oilY);
          ctx.strokeStyle = 'rgba(255,226,160,0.9)';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(l + 2, oilY + shimmer + 1);
          ctx.quadraticCurveTo(cx, oilY - 1 + shimmer, r - 2, oilY + shimmer + 1);
          ctx.stroke();
        }
        // dissolving salt cloud
        if (cloudy) {
          ctx.fillStyle = `rgba(255,255,255,${t.saltCloud * 0.4})`;
          ctx.beginPath();
          ctx.ellipse(cx, levelY + (innerBottom - levelY) * 0.4, tw * 0.4 * t.saltCloud + 4, (innerBottom - levelY) * 0.3 * t.saltCloud, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // boiling bubbles in tube 2
      if (t.bubbles.length) {
        for (const b of t.bubbles) {
          const by = innerBottom - b.y * (innerBottom - levelY - 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.1;
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          const bx = cx + Math.sin(b.wob + b.y * 9) * (tw * 0.28);
          ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      // the nail
      const nailLen = innerH * 0.68;
      const nailBottom = innerBottom - (i === 0 ? 16 * t.gran : 0) - 2;
      const nailTop = nailBottom - nailLen;
      drawNail(ctx, cx, nailTop, nailLen, 4.6, i, t.segs, { waterFrac: null });
      ctx.restore();

      // glass stroke + rim on top of everything
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 2;
      glassPath(); ctx.stroke();
      ctx.strokeStyle = '#a9bfc9';
      ctx.lineWidth = 1.75;
      ctx.beginPath(); ctx.ellipse(cx, top, tw / 2, 3.4, 0, 0, Math.PI * 2); ctx.stroke();
      // glass highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(l + tw * 0.22, top + 10); ctx.lineTo(l + tw * 0.22, bottom - tw * 0.6); ctx.stroke();

      // boil progress ring at tube 2's mouth
      if (i === 1 && t.boiled > 0 && t.boiled < 1) {
        const pr = 13;
        ctx.strokeStyle = '#dbe2ea'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(cx, top - 13, pr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#f97316';
        ctx.beginPath(); ctx.arc(cx, top - 13, pr, -Math.PI / 2, -Math.PI / 2 + t.boiled * Math.PI * 2); ctx.stroke();
      }
    }

    // ---- steam wisps over tube 2 while boiling ----
    const t2 = s.tubes[1];
    for (const p of s.steam) {
      const sx = g.tubeXs[1] + p.x;
      const sy = g.tubeTop - 22 - p.y * 54;
      const a = clamp(0.38 * (1 - p.age / p.life), 0, 1);
      ctx.fillStyle = `rgba(215,228,236,${a})`;
      ctx.beginPath();
      ctx.arc(sx + Math.sin(p.wob + p.age * 3) * 5, sy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (t2.boiled >= 1 && !t2.sealed && s.loopKind !== 'hum') {
      // faint idle steam: the water is still hot
      const a = 0.1 + 0.05 * Math.sin(s.idle * 3);
      ctx.fillStyle = `rgba(215,228,236,${a})`;
      ctx.beginPath();
      ctx.ellipse(g.tubeXs[1], g.tubeTop - 26, 7, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- stream particles (pours) ----
    for (const p of s.streams) {
      const life = clamp(1 - p.age / 0.5, 0, 1);
      if (p.kind === 'jug') {
        ctx.strokeStyle = `rgba(140,190,228,${0.85 * life})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.sin(p.wob) * 1.5, p.y - 8);
        ctx.stroke();
      } else if (p.kind === 'oil') {
        ctx.fillStyle = `rgba(214,158,60,${0.9 * life})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 2.2, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // granules: salt white / cacl2 off-white
        ctx.fillStyle = p.kind === 'salt' ? `rgba(250,251,252,${0.95 * life})` : `rgba(226,221,209,${0.95 * life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- tools ----
    for (const tl of s.tools) {
      if (tl.held || tl.busy) continue;
      drawTool(ctx, tl.id, tl.x, tl.y, 0, 0);
    }
    // kettle flying in for the auto boil
    const kettle = s.tools.find((tl) => tl.id === 'kettle');
    if (kettle && s.autoT > 0.02 && !kettle.held && !kettle.busy) {
      const tx = g.tubeXs[1];
      const ty = g.tubeTop - 32;
      const kx = kettle.homeX + (tx - kettle.homeX) * s.autoT;
      const ky = kettle.homeY + (ty - kettle.homeY) * s.autoT;
      drawTool(ctx, 'kettle', kx, ky, s.autoT * 0.45, s.autoT);
    }
    // the dragged tool (or the pouring tool) drawn last, lifted
    if (s.dragTool >= 0) {
      const tl = s.tools[s.dragTool];
      drawTool(ctx, tl.id, tl.x, tl.y, tl.held ? 0.28 : 0, 1);
      // kettle steam while it boils tube 2
      if (tl.id === 'kettle' && s.hoverTube === 1 && s.tubes[1].boiled < 1) {
        ctx.fillStyle = 'rgba(215,228,236,0.5)';
        for (let k = 0; k < 3; k += 1) {
          const off = (s.idle * 26 + k * 18) % 46;
          ctx.globalAlpha = clamp(1 - off / 46, 0, 1) * 0.5;
          ctx.beginPath();
          ctx.arc(tl.x - 22 - off * 0.3, tl.y - 14 - off * 0.8, 2.5 + off * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const job of s.jobs) {
      const tl = s.tools.find((x) => x.id === job.tool);
      if (!tl) continue;
      const tiltPhase = job.t < 0.22 ? job.t / 0.22 : job.t > job.dur - 0.35 ? clamp((job.dur - job.t) / 0.35, 0, 1) : 1;
      drawTool(ctx, tl.id, tl.x, tl.y, tiltPhase * 0.55, 0.6);
    }

    // ---- magnifier inset ----
    if (s.inspect >= 0) {
      const i = s.inspect;
      const t = s.tubes[i];
      const lensR = g.narrow ? 62 : 84;
      const lx = g.narrow ? w / 2 : w - lensR - 26;
      const ly = g.tubeTop + g.tubeH * 0.45;
      // dashed guide from the tube to the lens
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(59,111,212,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(g.tubeXs[i] + g.tubeW / 2, g.tubeTop + g.tubeH * 0.3);
      ctx.lineTo(lx - lensR * 0.6, ly - lensR * 0.4);
      ctx.stroke();
      ctx.setLineDash([]);
      // lens
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath(); ctx.arc(lx, ly, lensR, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, lensR - 2, 0, Math.PI * 2); ctx.clip();
      // the magnified nail
      const nailLen = lensR * 1.62;
      const nailTop = ly - nailLen / 2;
      const waterFrac = i === 2 || i === 3 ? 0.485 : null;
      const oilFrac = i === 1 ? 0.03 : null;
      drawNail(ctx, lx, nailTop, nailLen, 10.5, i, t.segs, { scale: 2.4, waterFrac, oilFrac });
      ctx.restore();
      // rim + handle
      ctx.strokeStyle = '#3b6fd4';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(lx, ly, lensR, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#5d6a79';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(lx + lensR * 0.72, ly + lensR * 0.72);
      ctx.lineTo(lx + lensR * 1.02, ly + lensR * 1.02);
      ctx.stroke();
    }
  }, [geom, drawNail, drawTool]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction -------------------------------------------------------
  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const tubeAt = (g: ReturnType<typeof geom>, x: number, y: number): number => {
    for (let i = 0; i < 4; i += 1) {
      if (Math.abs(x - g.tubeXs[i]) < g.tubeW / 2 + 12 && y > g.tubeTop - 14 && y < g.benchY - 12) return i;
    }
    return -1;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = sim.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = geom();
    // grab a tool from the shelf
    for (let i = 0; i < s.tools.length; i += 1) {
      const tl = s.tools[i];
      if (tl.held || tl.busy) continue;
      if (tl.id === 'kettle' && s.autoT > 0.2) continue;
      if (Math.abs(p.x - tl.x) < 26 && Math.abs(p.y - tl.y) < 26) {
        tl.held = true;
        tl.grabDX = p.x - tl.x;
        tl.grabDY = p.y - tl.y;
        s.dragTool = i;
        s.hoverTube = tubeAt(g, tl.x, tl.y);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        if (tl.id === 'kettle') labSound.thunk(false);
        else if (tl.id === 'jug') labSound.slosh(0.25);
        else if (tl.id === 'oil') labSound.glassClink(true);
        else if (tl.id === 'cacl2') labSound.thunk(true);
        else labSound.click();
        notePointer(true);
        syncUi();
        return;
      }
    }
    // click a tube: inspect it up close
    const tb = tubeAt(g, p.x, p.y);
    if (tb >= 0) {
      s.inspect = s.inspect === tb ? -1 : tb;
      labSound.glassClink(true);
      notePointer(true);
      if (s.inspect >= 2) {
        const t = s.tubes[s.inspect];
        if (t.segs[4] >= 18 && !badges.includes('waterline')) {
          earn('waterline');
          pushToast('good', '🌊', 'Look closely: the thickest rust sits exactly at the waterline — where oxygen-rich air meets the water on the nail.');
        }
      }
      syncUi();
      return;
    }
    s.inspect = -1;
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = sim.current;
    const g = geom();
    const nowT = performance.now();
    if (s.dragTool >= 0) {
      const tl = s.tools[s.dragTool];
      tl.x = clamp(p.x - tl.grabDX, 16, g.w - 16);
      tl.y = clamp(p.y - tl.grabDY, 18, g.h - 30);
      s.hoverTube = tubeAt(g, tl.x, tl.y + 14);
      if (nowT - s.slideAt > 160) {
        s.slideAt = nowT;
        labSound.slide(0.2);
      }
    }
    const canvas = canvasRef.current;
    if (canvas) {
      let cursor = 'default';
      if (s.dragTool >= 0) cursor = 'grabbing';
      else {
        for (const tl of s.tools) {
          if (!tl.held && !tl.busy && Math.abs(p.x - tl.x) < 26 && Math.abs(p.y - tl.y) < 26) { cursor = 'grab'; break; }
        }
        if (cursor === 'default' && tubeAt(g, p.x, p.y) >= 0) cursor = 'zoom-in';
      }
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (s.dragTool < 0) return;
    const tl = s.tools[s.dragTool];
    const idx = s.hoverTube;
    s.dragTool = -1;
    s.hoverTube = -1;
    tl.held = false;

    if (idx < 0) {
      // dropped nowhere — back to the shelf
      tl.x = tl.homeX; tl.y = tl.homeY;
      labSound.slide(0.35);
      notePointer(false);
      syncUi();
      return;
    }
    const c = compat(tl.id, idx, s.tubes);
    if (tl.id === 'kettle') {
      // the kettle works by HOLDING, not dropping — nothing to apply
      tl.x = tl.homeX; tl.y = tl.homeY;
      if (!c.ok) {
        setFlash({ tone: 'warn', line: c.msg ?? '' });
        labSound.warn();
      } else {
        setFlash({ tone: 'info', line: 'The kettle works by holding: keep it steady over tube 2 until the ring at its mouth fills and the water boils clear.' });
      }
      notePointer(c.ok);
      syncUi();
      return;
    }
    if (!c.ok) {
      tl.x = tl.homeX; tl.y = tl.homeY;
      setFlash({ tone: c.done ? 'info' : 'warn', line: c.msg ?? '' });
      if (!c.done) labSound.warn();
      notePointer(false);
      syncUi();
      return;
    }
    // apply the preparation
    applyTool(tl.id, idx);
    notePointer(true);
    syncUi();
  };

  const applyTool = useCallback((id: ToolId, idx: number) => {
    const s = sim.current;
    const t = s.tubes[idx];
    const tool = s.tools.find((tl) => tl.id === id);
    if (!tool) return;
    // begin the pour job
    tool.busy = true;
    s.jobs.push({ tool: id, tube: idx, t: 0, dur: 1.7, fromX: tool.x, fromY: tool.y });

    switch (id) {
      case 'cacl2': {
        t.cacl2 = true;
        labSound.thunk(true);
        window.setTimeout(() => labSound.slide(0.45), 260);
        window.setTimeout(() => labSound.tick(), 620);
        pushToast('info', '⚗', 'Drying agent added — tube 1’s air will stay bone-dry however many days pass.');
        break;
      }
      case 'jug': {
        t.filled = true;
        labSound.slosh(0.6);
        if (s.loopKind === '') {
          labSound.startLoop('pour');
          s.loopKind = 'pour';
        }
        pushToast('info', '💧', `Tube ${idx + 1} filled — the nail now sits half in water, half in air.`);
        break;
      }
      case 'oil': {
        t.sealed = true;
        // oil gloops: low drops landing one after another
        labSound.drip(false);
        window.setTimeout(() => labSound.drip(false), 190);
        window.setTimeout(() => labSound.slosh(0.35), 420);
        pushToast('good', '🛢', 'Oil layer poured — tube 2 is sealed from the air. Only water, and no oxygen, can reach that nail.');
        break;
      }
      case 'salt': {
        t.salt = true;
        t.saltCloud = 1;
        labSound.slide(0.4);
        for (let k = 0; k < 4; k += 1) window.setTimeout(() => labSound.tick(), 120 + k * 110);
        pushToast('info', '🧂', 'Salt sprinkled and dissolving — tube 4 is now salty water with the same half-dipped nail.');
        break;
      }
      case 'kettle':
        break;
    }
  }, [pushToast]);

  // ---- controls --------------------------------------------------------------------
  const togglePause = () => {
    const s = sim.current;
    s.paused = !s.paused;
    labSound.click();
    notePointer(true);
    syncUi();
  };

  const recordDay = () => {
    const s = sim.current;
    const day = Math.floor(s.days) + 1;
    const row: TrialRow = {
      id: day,
      day,
      r1: s.tubes[0].rust,
      r2: s.tubes[1].rust,
      r3: s.tubes[2].rust,
      r4: s.tubes[3].rust,
    };
    setRows((cur) => [...cur.filter((r) => r.day !== day), row].sort((a, b) => a.day - b.day));
    labSound.click();
    pushToast('good', '✎', `Day ${day} logged — air + water ${row.r3.toFixed(1)}%, salt water ${row.r4.toFixed(1)}%.`);
    notePointer(true);
  };

  const answerConclusion = (answer: string) => {
    if (conclusion === 'correct') return;
    if (answer === 'both') {
      setConclusion('correct');
      labSound.milestone();
      earn('conclusion');
      pushToast('good', '💡', 'Exactly right: iron needs BOTH air and water. Tube 1 had air but no water; tube 2 had water but no air — and neither nail rusted.');
    } else {
      setConclusion('wrong');
      labSound.warn();
      setFlash({ tone: 'warn', line: 'Not quite — look again at tubes 1 and 2 in your table. One had air without water, the other water without air, and both stayed clean.' });
      notePointer(false);
    }
  };

  /** Keyboard / button alternative: performs the next preparation action. */
  const nextPrepAction = useCallback((): { label: string; small: string } | null => {
    const s = sim.current;
    if (s.jobs.length > 0 || s.autoBoil) return { label: 'Working…', small: 'the bench is mid-pour' };
    const t1 = s.tubes[0]; const t2 = s.tubes[1]; const t3 = s.tubes[2]; const t4 = s.tubes[3];
    if (!t1.cacl2) { applyTool('cacl2', 0); return { label: 'Added the drying agent', small: 'tube 1 is now dry air' }; }
    if (t2.boiled < 1) { s.autoBoil = true; labSound.click(); return { label: 'Boiling tube 2…', small: 'the kettle holds itself over the water' }; }
    if (!t2.sealed) { applyTool('oil', 1); return { label: 'Poured the oil seal', small: 'tube 2 is shut off from air' }; }
    if (!t3.filled) { applyTool('jug', 2); return { label: 'Filled tube 3', small: 'half water, half air' }; }
    if (!t4.filled) { applyTool('jug', 3); return { label: 'Filled tube 4', small: 'ready for salt' }; }
    if (!t4.salt) { applyTool('salt', 3); return { label: 'Salted tube 4', small: 'the electrolyte is in' }; }
    return null;
  }, [applyTool]);

  const nextActionInfo = useMemo(() => {
    const s = sim.current;
    if (s.jobs.length > 0 || s.autoBoil) return { label: 'Working…', small: 'the bench is mid-pour' };
    if (!s.tubes[0].cacl2) return { label: 'Add drying agent', small: 'drop the jar over tube 1' };
    if (s.tubes[1].boiled < 1) return { label: 'Boil tube 2', small: 'hold the kettle over the water' };
    if (!s.tubes[1].sealed) return { label: 'Pour the oil seal', small: 'lock the air out of tube 2' };
    if (!s.tubes[2].filled) return { label: 'Fill tube 3', small: 'half water, half air' };
    if (!s.tubes[3].filled) return { label: 'Fill tube 4', small: 'same water, next tube' };
    if (!s.tubes[3].salt) return { label: 'Salt tube 4', small: 'sprinkle the cellar over it' };
    return null;
  }, [ui.prepped, ui.boiled, ui.sealed, ui.autoBoil, ui.boiling]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    const s = sim.current;
    s.days = 0; s.dayInt = 0; s.paused = false; s.acc = 0;
    s.autoBoil = false; s.autoT = 0;
    s.dragTool = -1; s.hoverTube = -1; s.inspect = -1; s.saltNotified = false;
    s.jobs = []; s.streams = []; s.steam = [];
    s.motes = MOTES0.map((m) => ({ ...m }));
    if (s.loopKind) { labSound.stopLoop(); s.loopKind = ''; }
    s.tubes = makeTubes();
    // tools re-home on the next geom pass
    s.tools.forEach((tl) => { tl.held = false; tl.busy = false; });
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setBadges([]);
    setConclusion('none');
    setFlash(null);
    syncUi();
  };

  // ---- coach -------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (flash) return { tone: flash.tone, line: flash.line };
    if (conclusion === 'wrong') return { tone: 'warn', line: 'Look again at tubes 1 and 2 — dry air alone kept one nail clean, and water without air kept the other clean. What do the rusty tubes share?' };
    if (ui.dragTool && ui.hover != null) {
      const c = compat(ui.dragTool, ui.hover, sim.current.tubes);
      if (!c.ok && !c.done) return { tone: 'warn', line: c.msg ?? '' };
      if (c.done) return { tone: 'info', line: c.msg ?? '' };
      if (ui.dragTool === 'kettle') return { tone: 'info', line: 'Hold it there — steady. The water needs several minutes of rolling boil to give up its dissolved air.' };
      return { tone: 'info', line: `Release to use the ${TOOL_NAMES[ui.dragTool]} on tube ${ui.hover + 1}.` };
    }
    if (ui.boiling) return { tone: 'info', line: `Boiling — the water is at ${Math.round(ui.temp)} °C and the dissolved air is streaming out. Keep holding (or let the auto-kettle finish).` };
    if (ui.autoBoil) return { tone: 'info', line: 'The kettle is doing the holding for you — bubble by bubble, tube 2’s water is giving up its air.' };
    if (!ui.prepped[0]) return { tone: 'info', line: 'Start with tube 1: drag the calcium chloride jar over the leftmost tube and drop — dry air is condition one.' };
    if (!ui.prepped[1]) {
      if (!ui.boiled) return { tone: 'info', line: 'Now tube 2: hold the kettle over its water until it boils clear, then pour the oil seal with the bottle.' };
      return { tone: 'info', line: 'Tube 2’s water is boiled — drag the oil bottle over it to lock the fresh air out.' };
    }
    if (!ui.prepped[2]) return { tone: 'info', line: 'Tube 3 next: drag the water jug over it and release — the nail should end up half-dipped, the waterline crossing its middle.' };
    if (!ui.prepped[3]) return { tone: 'info', line: 'Last setup: fill tube 4 from the jug, then sprinkle the salt cellar over it — same everything, plus salt.' };
    if (distinctDays < 3) {
      const day = Math.floor(ui.days) + 1;
      const todayLogged = rows.some((r) => r.day === day);
      if (todayLogged) return { tone: 'info', line: `Day ${day} is already in your table — the next honest row comes tomorrow. Nudge the clock on with the speed control.` };
      return { tone: 'good', line: `Day ${day} of the experiment — press “Record this day” to bank all four rust readings, then let the clock run on.` };
    }
    if (conclusion === 'none') return { tone: 'good', line: 'Three days on the table: tubes 1 and 2 stayed clean, 3 crept upward and 4 raced. Answer the conclusion to finish.' };
    const hour = (6 + (ui.days % 1) * 24) % 24;
    if (hour < 6.5 || hour > 21) return { tone: 'info', line: 'Night falls on the bench and the nails keep their slow appointment with the oxygen. Let the days run and watch the gap grow.' };
    return { tone: 'good', line: `Experiment complete — air and water together rust iron; salt only speeds the meeting. Keep recording days if you want the long view.` };
  }, [flash, conclusion, ui, distinctDays, rows]);

  // ---- status ---------------------------------------------------------------------
  const complete = done[done.length - 1];
  const dayNum = Math.floor(ui.days) + 1;
  const statusText = ui.boiling || ui.autoBoil
    ? 'Boiling tube 2'
    : complete
      ? 'Experiment complete'
      : !ui.prepped.every(Boolean)
        ? 'Setting up the bench'
        : ui.paused
          ? `Paused — day ${dayNum}`
          : `Day ${dayNum} — rusting under way`;

  const selVal = (r: TrialRow) => (selTube === 0 ? r.r1 : selTube === 1 ? r.r2 : selTube === 2 ? r.r3 : r.r4);
  const fit = useMemo(
    () => (rows.length >= 2 ? linearFit(rows.map((r) => ({ x: r.day, y: selVal(r) }))) : null),
    [rows, selTube], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- render ------------------------------------------------------------------------
  const runAssist = () => {
    const info = nextPrepAction();
    if (info) {
      pushToast('info', '✦', `${info.label} — ${info.small}.`);
      notePointer(true);
    } else {
      notePointer(false);
    }
  };

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.boiling || !ui.paused ? 'active' : 'ready'}
      captionChip="Conditions for rusting"
      legend={[
        { color: TUBES[0].color, label: 'Tube 1 · dry air' },
        { color: TUBES[1].color, label: 'Tube 2 · no air' },
        { color: TUBES[2].color, label: 'Tube 3 · air + water' },
        { color: TUBES[3].color, label: 'Tube 4 · salt water' },
        { color: '#b45309', label: 'Rust' },
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
            {SPEEDS.map((sp) => (
              <option key={sp} value={sp}>{sp === 1 ? '1× · day = 15 s' : sp === 4 ? '4× faster' : '16× · days fly by'}</option>
            ))}
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Rusting conditions bench — drag the preparation tools from the shelf onto the test tubes, click a tube to inspect its nail up close"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              runAssist();
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
          <div className="rust-layout">
            <div className="rust-clockbox">
              <div className="rust-clock">
                <span>SIMULATED CLOCK</span>
                <div className="rust-clock-main">
                  <strong>{`Day ${dayNum}`}</strong>
                  <em>{fmtDayTime(ui.days % 1)}</em>
                </div>
                <div className="rust-clock-sub">
                  <span>{ui.paused ? 'paused' : `${speed}× playback`}</span>
                  <span>{rows.length} day{rows.length === 1 ? '' : 's'} logged</span>
                </div>
                <div className="rust-clock-track"><span style={{ width: `${(ui.days % 1) * 100}%` }} /></div>
              </div>
              <div className="rust-actions">
                <button
                  className="action-button"
                  type="button"
                  data-nudge="pause"
                  onClick={togglePause}
                >
                  <span className="dispense-icon" aria-hidden="true">{ui.paused ? '▶' : '⏸'}</span>
                  <span>{ui.paused ? 'Resume the days' : 'Pause the days'}</span>
                  <small>the nails wait while paused</small>
                </button>
                <button
                  className="action-button"
                  type="button"
                  data-nudge="assist"
                  onClick={runAssist}
                  disabled={!nextActionInfo}
                >
                  <span className="dispense-icon" aria-hidden="true">✦</span>
                  <span>{nextActionInfo ? nextActionInfo.label : 'Bench is ready'}</span>
                  <small>{nextActionInfo ? nextActionInfo.small : 'time is the reagent now'}</small>
                </button>
              </div>
            </div>
            <div className="rust-prep-grid">
              {TUBES.map((tb, i) => (
                <div key={tb.name} className={`rust-prep${ui.prepped[i] ? ' done' : ''}`}>
                  <i style={{ background: tb.color }} />
                  <div>
                    <strong>{`Tube ${i + 1} · ${tb.name}`}</strong>
                    <span>{ui.prepped[i] ? 'prepared ✓' : tb.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Prepare each tube with real gestures — drag tools from the shelf, hold the kettle to boil. Then let days pass and record: tube 3 is the halfway house, tube 4 adds salt, tubes 1 and 2 remove water and air one at a time. Click any tube to inspect its nail through the magnifier.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordDay(); notePointer(true); }}
          >
            {`✎ Record this day — day ${dayNum} · air+water ${ui.rust[2].toFixed(1)}% · salt ${ui.rust[3].toFixed(1)}%`}
          </button>
          <div className="rust-conclude" data-nudge="conclude">
            <span>CONCLUSION · WHAT DOES IRON NEED TO RUST?</span>
            <div className="rust-opts">
              {[
                { id: 'air', label: 'Air (oxygen) only' },
                { id: 'water', label: 'Water only' },
                { id: 'both', label: 'Both air and water' },
                { id: 'neither', label: 'Neither — it rusts anyway' },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`rust-opt${conclusion === 'correct' && o.id === 'both' ? ' correct' : ''}`}
                  disabled={distinctDays < 3 || conclusion === 'correct'}
                  onClick={() => { answerConclusion(o.id); notePointer(o.id === 'both'); }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <small>{distinctDays < 3 ? 'unlocks after three recorded days — gather your evidence first' : conclusion === 'correct' ? 'concluded: iron needs both air and water — tube 1 and tube 2 are your proof' : conclusion === 'wrong' ? 'not quite — re-read your table before trying again' : 'pick the answer your table supports'}</small>
          </div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Rust monitor</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Rustiest nail right now</span><strong>{Math.max(...ui.rust).toFixed(1)} <small>%</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.max(...ui.rust)}%` }} /></div>
            <div className="reading-scale"><span>0% — bright iron</span><span>100% — fully rusted</span></div>
          </div>
          <div className="rust-monitor">
            {TUBES.map((tb, i) => (
              <div key={tb.name} className="rust-tube-row">
                <i style={{ background: tb.color }} />
                <div>
                  <strong>{`Tube ${i + 1} · ${tb.name}`}</strong>
                  <div className="rust-bar"><span style={{ width: `${ui.rust[i]}%`, background: `linear-gradient(90deg, #d9a441, ${tb.color})` }} /></div>
                </div>
                <em>{ui.rust[i].toFixed(1)}%</em>
              </div>
            ))}
          </div>
          <div className="reading-grid">
            <div><span>Day</span><strong>{dayNum}</strong></div>
            <div><span>Time of day</span><strong>{fmtDayTime(ui.days % 1)}</strong></div>
            <div><span>Tube 2 water</span><strong>{ui.sealed ? 'boiled · oil-sealed' : ui.boiled ? 'boiled · ready to seal' : ui.temp > 21 ? `${Math.round(ui.temp)} °C` : 'tap water'}</strong></div>
            <div><span>Days logged</span><strong>{rows.length}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the calcium chloride jar onto tube 1 — the granules keep its air bone-dry.</li>
              <li>Hold the kettle over tube 2 until the water boils clear, then drag the oil bottle over it to pour the sealing layer.</li>
              <li>Drag the water jug over tube 3 — the nail ends up half in water, half in air.</li>
              <li>Fill tube 4 the same way, then sprinkle in the salt cellar.</li>
              <li>Let the days run (speed up playback if you like) and press “Record this day” — three different days at least.</li>
              <li>Answer the conclusion in the control panel, and click tubes to inspect the nails up close.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Only one thing differs per tube: water, air, or salt. That is what makes the comparison fair — and what lets you name the conditions iron needs.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Rust table — % of nail rusted</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Record your first day once the bench is prepared. The table fills with all four tubes at once, one row per day.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>Day</th><th>Dry air</th><th>No air</th><th>Air + water</th><th>Salt water</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}><td>{r.day}</td><td>{r.r1.toFixed(1)}</td><td>{r.r2.toFixed(1)}</td><td>{r.r3.toFixed(1)}</td><td>{r.r4.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3 style={{ marginTop: 16 }}>All four tubes, day by day</h3>
            <div className="rust-chart-legend">
              {TUBES.map((tb, i) => (
                <span key={tb.name}><i style={{ background: tb.color }} />{`T${i + 1} ${tb.name}`}</span>
              ))}
            </div>
            <RustChart rows={rows} liveDay={ui.days} live={ui.rust} />
            <h3 style={{ marginTop: 16 }}>Single-tube rate fit</h3>
            <div className="rust-tube-select">
              {TUBES.map((tb, i) => (
                <button key={tb.name} type="button" className={selTube === i ? 'active' : ''} onClick={() => { setSelTube(i); labSound.tick(); }}>
                  <i style={{ background: tb.color }} />{`Tube ${i + 1}`}
                </button>
              ))}
            </div>
            {rows.length >= 1 ? (
              <Plot
                points={rows.map((r) => ({ x: r.day, y: selVal(r) }))}
                xLabel="days"
                yLabel="rust (%)"
                fitLine
                livePoint={{ x: Math.max(1, Math.floor(ui.days) + 1), y: ui.rust[selTube] }}
                height={210}
              />
            ) : (
              <p className="observation-note">Record a day to start this graph.</p>
            )}
            {fit && fit.m > 0.001 && (
              <p className="observation-note">Tube {selTube + 1} fitted slope ≈ {fit.m.toFixed(1)}% per day (R² = {fit.r2.toFixed(3)}). Early days are the honest rate — the growing crust slows the attack later, so the line flattens.</p>
            )}
            {fit && fit.m <= 0.001 && (
              <p className="observation-note">Tube {selTube + 1} is flat: whatever condition it holds, it is missing something iron needs.</p>
            )}
            <p className="observation-note">Compare slopes: salt water runs close to 2.5× the tap-water rate, while the dry-air and no-air tubes hug the zero line. The waterline effect lives in the scene — inspect tube 3 close up.</p>
          </>
        ),
        theory: (
          <>
            <h3>What rust actually is</h3>
            <p>Rust is not iron “burning” or rotting — it is an electrochemical reaction in which iron atoms give up electrons, oxygen takes them, and water carries the ions between. Both players must be present:</p>
            <div className="equation">4Fe + 3O₂ + 2xH₂O → 2Fe₂O₃·xH₂O</div>
            <p>The product is hydrated iron(III) oxide — the orange-brown flakes. That is why tube 1 (air, but no water) and tube 2 (water, but no oxygen after boiling and sealing) both stay bright: remove either player and the reaction stops before it starts.</p>
            <h3>Why the waterline rusts worst</h3>
            <p>Below the surface, water is plentiful but oxygen must slowly dissolve and diffuse down. Above it, oxygen is plentiful but there is almost no water. Exactly at the waterline both are abundant — so the band of rust is thickest where the nail crosses the surface. In tube 4 the dissolved salt acts as an electrolyte, letting the electron handover happen far more easily, which is why the salty nail races ahead of the fresh-water one.</p>
            <h3>Why the preparations matter</h3>
            <p>Boiling tube 2’s water expels the dissolved air; the oil layer stops fresh air dissolving back in — together they leave water without oxygen. The calcium chloride in tube 1 is a drying agent that pulls moisture out of the trapped air — air without water. Those two tubes are the controls that prove the conclusion.</p>
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

// ---- four-series analysis chart (observations tab) ----------------------------------

function RustChart(props: { rows: TrialRow[]; liveDay: number; live: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colors = TUBES.map((t) => t.color);

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

      const pad = { l: 40, r: 14, t: 12, b: 30 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const maxDay = Math.max(3, ...props.rows.map((r) => r.day), Math.floor(props.liveDay) + 1);
      const sx = (d: number) => pad.l + (d / maxDay) * iw;
      const sy = (v: number) => pad.t + ih - (clamp(v, 0, 100) / 100) * ih;

      // grid + ticks (y fixed 0..100 so tubes stay comparable)
      ctx.strokeStyle = '#e8edf2';
      ctx.lineWidth = 1;
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.fillStyle = '#9aa4b1';
      for (let i = 0; i <= 4; i += 1) {
        const x = pad.l + (iw * i) / 4;
        const y = pad.t + (ih * (4 - i)) / 4;
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ih); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round((maxDay * i) / 4)}`, x, h - pad.b + 13);
        ctx.textAlign = 'right';
        ctx.fillText(`${25 * i}`, pad.l - 6, y + 3);
      }
      // axes
      ctx.strokeStyle = '#c5cdd6';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ih); ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('days', pad.l + iw / 2, h - 3);
      ctx.save();
      ctx.translate(10, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('rust (%)', 0, 0);
      ctx.restore();

      const val = (r: TrialRow, i: number) => (i === 0 ? r.r1 : i === 1 ? r.r2 : i === 2 ? r.r3 : r.r4);
      for (let i = 0; i < 4; i += 1) {
        const pts = props.rows.map((r) => ({ x: r.day, y: val(r, i) }));
        const liveVal = props.live[i];
        if (pts.length === 0 && liveVal <= 0) continue;
        ctx.strokeStyle = colors[i];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(0));
        for (const p of pts) ctx.lineTo(sx(p.x), sy(p.y));
        if (liveVal > 0) ctx.lineTo(sx(Math.max(1, Math.floor(props.liveDay) + 1)), sy(liveVal));
        ctx.stroke();
        for (const p of pts) {
          ctx.fillStyle = colors[i];
          ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 3.2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
        }
        if (liveVal > 0) {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(sx(Math.max(1, Math.floor(props.liveDay) + 1)), sy(liveVal), 4.2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = colors[i]; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rows, props.liveDay, props.live]);

  return <canvas ref={canvasRef} className="lab-plot" style={{ width: '100%', height: 220 }} aria-label="Rust percentage versus days for all four tubes" />;
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
