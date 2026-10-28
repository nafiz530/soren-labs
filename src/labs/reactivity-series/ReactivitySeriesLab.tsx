import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp, fmtClock, lerp, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './reactivity-series.css';

/**
 * Reactivity series — metals versus dilute acid, then a displacement
 * confirmation.
 *
 * The student drags magnesium, zinc, iron and copper samples from a supply
 * tray into tubes of dilute hydrochloric acid. Hydrogen bubbles rise with
 * per-metal vigour, thermometers climb, the metals visibly thin away — and
 * every pop is counted into a live bubbles-per-10-s rate. A fifth tube of
 * blue copper(II) sulfate closes the loop: metals above copper displace it,
 * fading the blue while a red-brown deposit grows.
 */

type MetalId = 'mg' | 'zn' | 'fe' | 'cu';

interface MetalDef {
  id: MetalId;
  name: string;
  symbol: string;
  /** Chart / data colour (distinct per metal). */
  color: string;
  /** Hydrogen bubbles per simulated second at full sample size. */
  bubbleRate: number;
  /** Peak temperature rise in dilute HCl (°C). */
  dTMax: number;
  /** Simulated seconds for the sample to dissolve in acid. */
  life: number;
  /** Simulated seconds to finish displacing copper(II) sulfate. */
  dispTime: number;
  /** Small temperature rise while displacing copper (°C). */
  dispDT: number;
  observation: string;
}

const METALS: MetalDef[] = [
  {
    id: 'mg', name: 'Magnesium', symbol: 'Mg', color: '#f97316',
    bubbleRate: 4.2, dTMax: 18, life: 60, dispTime: 30, dispDT: 4,
    observation: 'Vigorous fizzing — hydrogen streams off, the ribbon thins and disappears, the tube heats sharply.',
  },
  {
    id: 'zn', name: 'Zinc', symbol: 'Zn', color: '#d9a441',
    bubbleRate: 1.9, dTMax: 8, life: 130, dispTime: 50, dispDT: 2,
    observation: 'Steady stream of bubbles; the granules wear away slowly; gentle warming.',
  },
  {
    id: 'fe', name: 'Iron', symbol: 'Fe', color: '#5b6a7d',
    bubbleRate: 0.55, dTMax: 3, life: 260, dispTime: 90, dispDT: 1,
    observation: 'Slow, sparse bubbles; the nail stays bright and solid; barely warmer.',
  },
  {
    id: 'cu', name: 'Copper', symbol: 'Cu', color: '#b87333',
    bubbleRate: 0, dTMax: 0, life: Infinity, dispTime: Infinity, dispDT: 0,
    observation: 'No bubbles, no warming, no change — no reaction with dilute hydrochloric acid.',
  },
];

const METAL_IDS: readonly MetalId[] = ['mg', 'zn', 'fe', 'cu'];

const METAL_BY_ID = METALS.reduce((acc, m) => {
  acc[m.id] = m;
  return acc;
}, {} as Record<MetalId, MetalDef>);

const ROOM_TEMP = 21;
const TEMP_MIN = 18;
const TEMP_MAX = 45;
const ACID_FILL = 0.62;
const BLUE_TUBE = 4;
const RECORD_AFTER = 10; // simulated seconds watched before recording unlocks
const RANK_ORDER: MetalId[] = ['mg', 'zn', 'fe', 'cu'];

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'pour', title: 'Pour the acid',
    detail: 'Press the amber bottle — or the “Pour dilute HCl” button — and watch dilute hydrochloric acid fill the four tubes. The fifth tube already holds blue copper(II) sulfate.',
    hint: 'Everything on this bench is drag-and-drop; the pour is the one button.',
  },
  {
    id: 'magnesium', title: 'Drop the magnesium in',
    detail: 'Drag the bright ribbon from the tray into any acid tube. Hydrogen fizzes off hard, the metal visibly thins and the thermometer climbs.',
    hint: 'On touch screens, drag with a finger — or use the drop button in the control panel.',
  },
  {
    id: 'all-four', title: 'Test all four metals',
    detail: 'One metal per tube: zinc granules, the iron nail and copper turnings each get a fresh tube of acid. The differences are the whole story.',
    hint: 'Copper doing nothing is a result — treat it like any other data.',
  },
  {
    id: 'record', title: 'Record the fizzing',
    detail: 'Tap a tube to select it, then press Record while it works: bubbles per 10 s, the peak temperature rise and an observation line land in your table.',
    hint: 'Record at least two metals before you rank them.',
  },
  {
    id: 'rank', title: 'Rank the series',
    detail: 'Order the metals most reactive first using your evidence — bubble rate, temperature rise, how fast each sample thins away — then lock the order in.',
    hint: 'Compare your numbers, not your memory.',
  },
  {
    id: 'displace', title: 'Try the displacement tube',
    detail: 'Drop a metal you ranked above copper into the blue copper(II) sulfate tube: the blue fades and red-brown copper plates onto the metal.',
    hint: 'Any metal above copper works; copper itself does nothing.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'first-fizz', title: 'First fizz', icon: '✦', detail: 'Started a metal reacting in dilute acid.' },
  { id: 'all-four', title: 'Full tray', icon: '▤', detail: 'Tested all four metals in the acid tubes.' },
  { id: 'data-logger', title: 'Data logger', icon: '✎', detail: 'Recorded readings for all four metals.' },
  { id: 'series-mastered', title: 'Series mastered', icon: '♛', detail: 'Ranked the four metals correctly from your own evidence.' },
  { id: 'copper-catcher', title: 'Copper catcher', icon: '◉', detail: 'Watched red-brown copper deposit in the displacement tube.' },
  { id: 'cool-headed', title: 'Cool headed', icon: '❄', detail: 'Checked every thermometer on the bench.' },
];

interface Bubble { x: number; y: number; r: number; vy: number; ph: number }
interface FallState { tube: number; metal: MetalId; f: number; v: number }

interface TubeState {
  liquid: number;
  metal: MetalId | null;
  frac: number;
  temp: number;
  peakT: number;
  obsT: number;
  pops: number;
  popTimes: number[];
  peakRate: number;
  bubbles: Bubble[];
  spawnAcc: number;
  disp: number;
  gone: boolean;
  wobble: number;
}

interface ChartPt { t: number; n: number }
type ChartSeries = Record<MetalId, ChartPt[]>;

interface SimState {
  simT: number;
  tubes: TubeState[];
  pour: { active: boolean; t: number };
  poured: boolean;
  drag: { metal: MetalId; x: number; y: number; hover: number } | null;
  falling: FallState[];
  sel: number;
  read: Set<number>;
  testedAcid: Set<MetalId>;
  recorded: Set<MetalId>;
  series: ChartSeries;
  chartAcc: number;
  uiAcc: number;
  loopOn: boolean;
  pingAt: number;
  dispSeen: boolean;
  slideAt: number;
}

interface TubeSnap {
  metal: MetalId | null;
  liquid: number;
  temp: number;
  peakT: number;
  rate: number;
  peakRate: number;
  pops: number;
  frac: number;
  disp: number;
  obsT: number;
  gone: boolean;
  reacting: boolean;
}

interface UiSnap {
  sel: number;
  poured: boolean;
  pouring: boolean;
  simT: number;
  read: number;
  tested: number;
  hasMg: boolean;
  dragging: boolean;
  tubes: TubeSnap[];
}

interface TrialRow { id: number; metal: MetalId; rate: number; dT: number; obs: string }

interface Geom {
  cw: number;
  ch: number;
  narrow: boolean;
  benchY: number;
  rackL: number;
  rackR: number;
  tubeW: number;
  tubeXs: number[];
  tubeTop: number;
  tubeBottom: number;
  tubeH: number;
  trayX: number;
  trayY: number;
  trayW: number;
  trayH: number;
  cells: { metal: MetalId; x: number; y: number }[];
  bottleX: number;
  bottleY: number;
  bottleW: number;
  bottleH: number;
}

function freshTube(isBlue: boolean): TubeState {
  return {
    liquid: isBlue ? ACID_FILL : 0,
    metal: null,
    frac: 0,
    temp: ROOM_TEMP,
    peakT: ROOM_TEMP,
    obsT: 0,
    pops: 0,
    popTimes: [],
    peakRate: 0,
    bubbles: [],
    spawnAcc: 0,
    disp: 0,
    gone: false,
    wobble: 0,
  };
}

const emptySeries = (): ChartSeries => ({ mg: [], zn: [], fe: [], cu: [] });

const defaultUi = (): UiSnap => ({
  sel: 0,
  poured: false,
  pouring: false,
  simT: 0,
  read: 0,
  tested: 0,
  hasMg: false,
  dragging: false,
  tubes: [0, 1, 2, 3, 4].map((i) => ({
    metal: null, liquid: i === BLUE_TUBE ? ACID_FILL : 0, temp: ROOM_TEMP, peakT: ROOM_TEMP, rate: 0, peakRate: 0, pops: 0, frac: 0,
    disp: 0, obsT: 0, gone: false, reacting: false,
  })),
});

const meta = getLabBySlug('reactivity-series')!;

export default function ReactivitySeriesLab() {
  // ---- simulation state (refs — the canvas loop owns the chemistry) --------
  const sim = useRef<SimState>({
    simT: 0,
    tubes: [freshTube(false), freshTube(false), freshTube(false), freshTube(false), freshTube(true)],
    pour: { active: false, t: 0 },
    poured: false,
    drag: null,
    falling: [],
    sel: 0,
    read: new Set<number>(),
    testedAcid: new Set<MetalId>(),
    recorded: new Set<MetalId>(),
    series: emptySeries(),
    chartAcc: 0,
    uiAcc: 0,
    loopOn: false,
    pingAt: 0,
    dispSeen: false,
    slideAt: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [speed, setSpeed] = useState(1);
  const [assistMetal, setAssistMetal] = useState<MetalId>('mg');
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [rank, setRank] = useState<(MetalId | null)[]>([null, null, null, null]);
  const [rankLocked, setRankLocked] = useState(false);
  const [rankTally, setRankTally] = useState<number | null>(null);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [note, setNote] = useState<{ tone: CoachTone; line: string } | null>(null);
  const [chart, setChart] = useState<ChartSeries>(emptySeries());
  const [ui, setUi] = useState<UiSnap>(defaultUi());

  const noteTimer = useRef(0);

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

  const flashNote = useCallback((tone: CoachTone, line: string) => {
    setNote({ tone, line });
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 5200);
  }, []);

  const syncUi = useCallback(() => {
    const s = sim.current;
    setUi({
      sel: s.sel,
      poured: s.poured,
      pouring: s.pour.active,
      simT: s.simT,
      read: s.read.size,
      tested: s.testedAcid.size,
      hasMg: s.testedAcid.has('mg'),
      dragging: !!s.drag,
      tubes: s.tubes.map((t) => ({
        metal: t.metal,
        liquid: t.liquid,
        temp: t.temp,
        peakT: t.peakT,
        rate: t.popTimes.length,
        peakRate: t.peakRate,
        pops: t.pops,
        frac: t.frac,
        disp: t.disp,
        obsT: t.obsT,
        gone: t.gone,
        reacting: !!t.metal && !t.gone && (t.popTimes.length > 0 || (t.liquid > 0 && METAL_BY_ID[t.metal].bubbleRate > 0)),
      })),
    });
  }, []);

  // ---- mentor completion flags -------------------------------------------
  const done = [
    ui.poured,
    ui.hasMg,
    ui.tested >= 4,
    rows.length >= 2,
    rankLocked,
    ui.tubes[BLUE_TUBE].disp >= 0.5,
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
    if (ui.read >= 5) earn('cool-headed');
  }, [ui.read]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ui.tested >= 4) earn('all-four');
  }, [ui.tested]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ---------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'pour': return { target: 'pour', gesture: 'press', title: 'Pour the acid', body: 'Press “Pour dilute HCl” — the amber bottle tips over the tubes and fills all four.' };
      case 'magnesium': return { target: 'scene', gesture: 'drag', title: 'Drag the magnesium', body: 'Grab the bright ribbon from the tray and drop it into any acid tube.' };
      case 'all-four': return { target: 'scene', gesture: 'drag', title: 'Test the rest', body: 'Zinc, iron and copper each go into their own fresh tube — one metal per tube.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Bank the fizz', body: 'Tap a reacting tube to select it, then press Record to log bubbles and temperature.' };
      case 'rank': return { target: 'rank', gesture: 'tap', title: 'Rank the series', body: 'Order the four metals most reactive first with the dropdowns, then lock it in.' };
      case 'displace': return { target: 'scene', gesture: 'drag', title: 'The blue tube', body: 'Drag any metal you ranked above copper into the copper(II) sulfate tube.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- bench actions ---------------------------------------------------------
  const startPour = useCallback(() => {
    const s = sim.current;
    if (s.poured || s.pour.active) return;
    s.pour = { active: true, t: 0 };
    labSound.slide(0.5);
    syncUi();
  }, [syncUi]);

  const dropMetal = useCallback((metal: MetalId, tube: number) => {
    const s = sim.current;
    if (tube < 0 || tube > BLUE_TUBE) return;
    s.falling.push({ tube, metal, f: 0, v: 0 });
    labSound.glassClink(true);
    syncUi();
  }, [syncUi]);

  const selectTube = useCallback((i: number) => {
    const s = sim.current;
    if (i < 0 || i > BLUE_TUBE) return;
    s.sel = i;
    if (s.tubes[i].liquid > 0) s.read.add(i);
    labSound.tick();
    syncUi();
  }, [syncUi]);

  const assistDrop = () => {
    const s = sim.current;
    let target = -1;
    for (let i = 0; i < BLUE_TUBE; i += 1) {
      if (s.tubes[i].liquid > 0 && !s.tubes[i].metal) { target = i; break; }
    }
    if (target < 0 && s.tubes[BLUE_TUBE].liquid > 0 && !s.tubes[BLUE_TUBE].metal) target = BLUE_TUBE;
    if (target < 0) return;
    dropMetal(assistMetal, target);
  };

  const recordSelected = () => {
    const s = sim.current;
    if (ui.sel >= BLUE_TUBE) return;
    const t = s.tubes[ui.sel];
    const m = t.metal ? METAL_BY_ID[t.metal] : null;
    if (!m || t.obsT < RECORD_AFTER || s.recorded.has(m.id)) return;
    const row: TrialRow = {
      id: rows.length + 1,
      metal: m.id,
      rate: t.peakRate,
      dT: Math.max(0, t.peakT - ROOM_TEMP),
      obs: m.observation,
    };
    s.recorded.add(m.id);
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded ${m.name.toLowerCase()} — ${row.rate} bubbles per 10 s, +${row.dT.toFixed(1)} °C.`);
    if (s.recorded.size >= 4) earn('data-logger');
    syncUi();
  };

  const submitRank = () => {
    if (rankLocked || rank.some((v) => !v)) return;
    const chosen = rank as MetalId[];
    const tally = chosen.filter((m, i) => m === RANK_ORDER[i]).length;
    if (tally === 4) {
      setRankLocked(true);
      labSound.milestone();
      earn('series-mastered');
      pushToast('good', '♛', 'Textbook order — Mg > Zn > Fe > Cu, built from your own data.');
    } else {
      labSound.warn();
      setRankTally(tally);
      pushToast('warn', '⇅', `${tally} of 4 positions match your evidence — adjust and lock it in again.`);
    }
  };

  const resetAll = () => {
    const s = sim.current;
    s.simT = 0;
    s.tubes = [freshTube(false), freshTube(false), freshTube(false), freshTube(false), freshTube(true)];
    s.pour = { active: false, t: 0 };
    s.poured = false;
    s.drag = null;
    s.falling = [];
    s.sel = 0;
    s.read = new Set<number>();
    s.testedAcid = new Set<MetalId>();
    s.recorded = new Set<MetalId>();
    s.series = emptySeries();
    s.chartAcc = 0;
    s.uiAcc = 0;
    s.dispSeen = false;
    if (s.loopOn) {
      labSound.stopLoop();
      s.loopOn = false;
    }
    setRows([]);
    setRank([null, null, null, null]);
    setRankLocked(false);
    setRankTally(null);
    setMentorIndex(0);
    setBadges([]);
    setNote(null);
    setSawGraph(false);
    setChart(emptySeries());
    syncUi();
  };

  // ---- chemistry ---------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const sdt = dt * speed;
    s.simT += sdt;

    // pouring animation (real time — it is a gesture, not chemistry)
    if (s.pour.active) {
      s.pour.t += dt;
      for (let i = 0; i < BLUE_TUBE; i += 1) {
        const liq = clamp((s.pour.t - i * 0.8) / 0.62, 0, 1);
        s.tubes[i].liquid = ACID_FILL * liq;
        if (liq > 0 && liq < 1) s.tubes[i].wobble = Math.max(s.tubes[i].wobble, 0.45);
      }
      if (s.pour.t >= BLUE_TUBE * 0.8 + 0.18) {
        s.pour.active = false;
        s.poured = true;
        labSound.slosh(0.7);
      }
    }

    // falling metal samples
    for (let fi = s.falling.length - 1; fi >= 0; fi -= 1) {
      const f = s.falling[fi];
      f.v += 3.4 * dt;
      f.f += f.v * dt;
      if (f.f >= 1) {
        s.falling.splice(fi, 1);
        const t = s.tubes[f.tube];
        t.metal = f.metal;
        t.frac = 1;
        t.obsT = 0;
        t.pops = 0;
        t.popTimes = [];
        t.peakRate = 0;
        t.bubbles = [];
        t.spawnAcc = 0;
        t.disp = 0;
        t.gone = false;
        t.wobble = 0.9;
        t.peakT = t.temp;
        if (f.tube < BLUE_TUBE) s.testedAcid.add(f.metal);
        s.sel = f.tube;
        if (t.liquid > 0) s.read.add(f.tube);
        labSound.thunk(false);
        labSound.drip(true);
        if (f.metal === 'cu' && f.tube < BLUE_TUBE) {
          flashNote('info', 'No reaction — copper sits below hydrogen in the reactivity series: no bubbles, no warming.');
        }
        if (f.metal === 'cu' && f.tube === BLUE_TUBE) {
          flashNote('info', 'Copper cannot displace itself — the blue stays blue and nothing plates.');
        }
        if (f.metal !== 'cu' && f.tube < BLUE_TUBE) earn('first-fizz');
      }
    }

    // per-tube chemistry
    let activity = 0;
    for (let i = 0; i < 5; i += 1) {
      const t = s.tubes[i];
      const m = t.metal ? METAL_BY_ID[t.metal] : null;
      let rate = 0;

      if (m && t.liquid > 0 && !t.gone) {
        t.obsT += sdt;
        if (i === BLUE_TUBE) {
          // displacement: blue fades, copper deposits, metal slowly consumed
          t.disp = Math.min(1, t.disp + sdt / m.dispTime);
          t.frac = Math.max(0.08, 1 - 0.75 * t.disp);
          rate = m.id === 'mg' ? 0.85 : 0; // magnesium also argues with the water
          if (t.disp >= 1) t.gone = true;
          if (t.disp > 0.35 && !s.dispSeen) {
            s.dispSeen = true;
            earn('copper-catcher');
            pushToast('good', '◉', 'The blue is fading — red-brown copper is depositing on the metal.');
          }
        } else {
          // acid reaction: hydrogen stream that slows as the sample thins
          t.frac = Math.max(0, 1 - t.obsT / m.life);
          rate = m.bubbleRate * (0.3 + 0.7 * t.frac);
          if (t.frac <= 0.02) {
            t.gone = true;
            t.frac = 0;
            rate = 0;
          }
        }
      }

      // thermometer: warm toward the reaction target, cool slowly back to room
      const heat = m && !t.gone && t.liquid > 0 ? (i === BLUE_TUBE ? m.dispDT : m.dTMax) : 0;
      const target = ROOM_TEMP + heat;
      const tau = heat > 0 ? 9 : 42;
      t.temp += (target - t.temp) * clamp(sdt / tau, 0, 0.5);
      t.peakT = Math.max(t.peakT, t.temp);

      // spawn bubbles at the metal surface
      if (rate > 0) {
        t.spawnAcc += rate * sdt;
        while (t.spawnAcc >= 1 && t.bubbles.length < 34) {
          t.spawnAcc -= 1;
          t.bubbles.push({
            x: Math.random() * 1.4 - 0.7,
            y: 0.97,
            r: 1.3 + Math.random() * 1.5,
            vy: 0.38 + Math.random() * 0.26,
            ph: Math.random() * Math.PI * 2,
          });
        }
        if (t.spawnAcc > 40) t.spawnAcc = 40;
      }

      // rise and pop
      for (let bi = t.bubbles.length - 1; bi >= 0; bi -= 1) {
        const b = t.bubbles[bi];
        b.y -= b.vy * sdt;
        b.ph += sdt * 5.5;
        b.r += sdt * 0.8;
        if (b.y <= 0.02) {
          t.bubbles.splice(bi, 1);
          t.pops += 1;
          t.popTimes.push(s.simT);
          t.wobble = Math.min(1, t.wobble + 0.05);
          const nowMs = performance.now();
          if (nowMs - s.pingAt > 135) {
            s.pingAt = nowMs;
            labSound.ping(1500 + Math.random() * 1700, 0.014 + Math.random() * 0.018);
          }
        }
      }

      // rolling 10-second window (bubbles per 10 s, live)
      if (t.popTimes.length && t.popTimes[0] < s.simT - 10.4) {
        t.popTimes = t.popTimes.filter((ts) => ts > s.simT - 10.4);
      }
      if (t.popTimes.length > t.peakRate) t.peakRate = t.popTimes.length;

      t.wobble *= Math.exp(-dt * 2.4);
      activity += rate;
    }

    // fizz / pour sound loop (with hysteresis so it never stutters)
    const wantLoop = s.pour.active || (s.loopOn ? activity > 0.45 : activity > 1.0);
    if (wantLoop !== s.loopOn) {
      if (wantLoop) labSound.startLoop('pour');
      else labSound.stopLoop();
      s.loopOn = wantLoop;
    }

    // chart sampling: once per simulated second
    s.chartAcc += sdt;
    if (s.chartAcc >= 1) {
      s.chartAcc = 0;
      const totals: Record<MetalId, number> = { mg: 0, zn: 0, fe: 0, cu: 0 };
      for (let i = 0; i < 5; i += 1) {
        const t = s.tubes[i];
        if (t.metal) totals[t.metal] += t.pops;
      }
      let changed = false;
      for (const id of METAL_IDS) {
        const arr = s.series[id];
        const last = arr[arr.length - 1];
        // a metal's line only begins once it has actually fizzed — no flat
        // zero lines for samples still sitting in the tray
        const started = arr.length > 0 || totals[id] > 0;
        if (started && (!last || last.t < s.simT - 0.75)) {
          arr.push({ t: s.simT, n: totals[id] });
          changed = true;
        }
      }
      if (changed) {
        setChart({ mg: [...s.series.mg], zn: [...s.series.zn], fe: [...s.series.fe], cu: [...s.series.cu] });
      }
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, earn, pushToast, flashNote, syncUi]);

  // ---- geometry --------------------------------------------------------------
  const geom = useCallback((): Geom => {
    const cw = canvasRef.current?.clientWidth ?? 800;
    const ch = canvasRef.current?.clientHeight ?? 500;
    const narrow = cw < 620;
    const benchY = ch - Math.max(46, ch * 0.13);
    const rackL = narrow ? 58 : Math.max(cw * 0.46, 300);
    const rackR = cw - (narrow ? 8 : 24);
    const gapDiv = narrow ? 10 : 14;
    const slot = (rackR - rackL - gapDiv) / 5;
    const tubeW = Math.min(narrow ? 26 : 40, slot * 0.58);
    const tubeXs: number[] = [];
    for (let i = 0; i < 5; i += 1) tubeXs.push(rackL + slot * (i + 0.5) + (i === 4 ? gapDiv : 0));
    const tubeBottom = benchY - 6;
    const tubeH = Math.min(ch * 0.68, 320, tubeBottom - (narrow ? 92 : 96));
    const tubeTop = tubeBottom - tubeH;
    const trayW = narrow ? cw - 20 : Math.min(cw * 0.4, 270);
    const trayX = narrow ? 10 : 22;
    const trayY = narrow ? 14 : Math.max(30, ch * 0.32);
    const trayH = narrow ? 54 : 118;
    const cells = METALS.map((m, i) => ({
      metal: m.id,
      x: trayX + (trayW / 4) * (i + 0.5),
      y: trayY + trayH / 2,
    }));
    const bottleW = 46;
    const bottleH = 84;
    const bottleX = narrow ? 8 : Math.max(20, cw * 0.025);
    const bottleY = narrow ? trayY + trayH + 10 : Math.max(20, ch * 0.06);
    return {
      cw, ch, narrow, benchY, rackL, rackR, tubeW, tubeXs, tubeTop, tubeBottom, tubeH,
      trayX, trayY, trayW, trayH, cells, bottleX, bottleY, bottleW, bottleH,
    };
  }, []);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const G = geom();
    const tNow = s.simT;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench
    const bench = ctx.createLinearGradient(0, G.benchY, 0, h);
    bench.addColorStop(0, '#dde4eb');
    bench.addColorStop(1, '#c6d1dc');
    ctx.fillStyle = bench;
    ctx.fillRect(0, G.benchY, w, h - G.benchY);
    ctx.strokeStyle = '#b6c1cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, G.benchY);
    ctx.lineTo(w, G.benchY);
    ctx.stroke();

    // soft shadows under the apparatus
    ctx.fillStyle = 'rgba(23,35,52,0.10)';
    ctx.beginPath();
    ctx.ellipse((G.rackL + G.rackR) / 2, G.benchY + 10, (G.rackR - G.rackL) * 0.52, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!G.narrow) {
      ctx.beginPath();
      ctx.ellipse(G.trayX + G.trayW / 2, G.trayY + G.trayH + 8, G.trayW * 0.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // metal tray
    drawTray(ctx, G, s.drag?.metal ?? null);

    // test tubes (liquid, bubbles, metals, falling samples)
    for (let i = 0; i < 5; i += 1) drawTube(ctx, s, G, i, tNow);

    // rack front lip (tubes stand in it)
    drawRack(ctx, G);

    // one small thermometer per tube, standing behind the rack
    for (let i = 0; i < 5; i += 1) {
      const t = s.tubes[i];
      const thH = clamp(G.tubeH * 0.55, 48, 118);
      const x = Math.max(10, G.tubeXs[i] - G.tubeW / 2 - 13);
      const top = G.tubeBottom - 34 - thH;
      drawThermo(ctx, x, top, thH, t.temp, s.sel === i, tNow);
    }

    // reagent bottle (animates over the tubes while pouring)
    drawBottleScene(ctx, s, G);

    // dragged metal sample + drop-target highlight
    if (s.drag) {
      const d = s.drag;
      if (d.hover >= 0) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#e8632a';
        ctx.lineWidth = 2;
        roundRect(ctx, G.tubeXs[d.hover] - G.tubeW / 2 - 7, G.tubeTop - 10, G.tubeW + 14, G.tubeBottom - G.tubeTop + 14, 10);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.shadowColor = 'rgba(23,35,52,0.35)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 8;
      drawMetal(ctx, d.metal, d.x, d.y, 1.05);
      ctx.restore();
    }

    // gentle guidance rings (no text — just a pulsing hint)
    if (!s.poured && !s.pour.active) {
      guideRing(ctx, G.bottleX + G.bottleW / 2, G.bottleY + G.bottleH / 2, 42, tNow);
    } else if (s.poured && s.testedAcid.size === 0 && !s.drag && !s.falling.length) {
      const c = G.cells[0];
      guideRing(ctx, c.x, c.y, 36, tNow);
    }
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction -----------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const G = geom();
    const s = sim.current;

    // grab a metal sample from the tray
    for (const c of G.cells) {
      if (Math.hypot(px - c.x, py - c.y) < 32) {
        s.drag = { metal: c.metal, x: px, y: py, hover: -1 };
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.tick();
        notePointer(true);
        syncUi();
        return;
      }
    }

    // the acid bottle pours
    if (
      !s.poured && !s.pour.active &&
      px > G.bottleX - 8 && px < G.bottleX + G.bottleW + 8 &&
      py > G.bottleY - 10 && py < G.bottleY + G.bottleH + 10
    ) {
      startPour();
      notePointer(true);
      return;
    }

    // tap a tube to read its thermometer
    const ti = tubeAt(px, py, G);
    if (ti >= 0) {
      selectTube(ti);
      notePointer(true);
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const G = geom();
    const s = sim.current;

    if (s.drag) {
      s.drag.x = px;
      s.drag.y = py;
      s.drag.hover = tubeAt(px, py, G);
      const nowMs = performance.now();
      if (nowMs - s.slideAt > 150) {
        s.slideAt = nowMs;
        labSound.slide(0.25);
      }
    } else {
      let hot = false;
      for (const c of G.cells) {
        if (Math.hypot(px - c.x, py - c.y) < 32) hot = true;
      }
      if (
        !s.poured && !s.pour.active &&
        px > G.bottleX - 8 && px < G.bottleX + G.bottleW + 8 &&
        py > G.bottleY - 10 && py < G.bottleY + G.bottleH + 10
      ) hot = true;
      canvas.style.cursor = hot ? 'grab' : 'default';
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag) return;
    const d = s.drag;
    s.drag = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const ti = d.hover;
    if (ti >= 0) {
      const t = s.tubes[ti];
      if (t.liquid < 0.2) {
        labSound.warn();
        flashNote('warn', 'Pour the acid first — dry tubes cannot fizz.');
        notePointer(false);
      } else if (t.metal) {
        labSound.warn();
        flashNote('warn', 'One metal per tube — pick a fresh tube so each comparison stays fair.');
        notePointer(false);
      } else {
        dropMetal(d.metal, ti);
        notePointer(true);
      }
    } else {
      notePointer(false);
    }
    syncUi();
  };

  // ---- analysis ---------------------------------------------------------------
  const fit = useMemo(
    () => (rows.length >= 2 ? linearFit(rows.map((r) => ({ x: r.rate, y: r.dT }))) : null),
    [rows],
  );

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (note) return note;
    if (ui.pouring) return { tone: 'info', line: 'Dilute hydrochloric acid rising — four tubes filled and ready for metal samples.' };
    if (!ui.poured) return { tone: 'info', line: 'Start by pouring the acid: press the amber bottle, or the “Pour dilute HCl” button.' };

    const sel = ui.tubes[ui.sel];
    const selName = sel?.metal ? METAL_BY_ID[sel.metal].name.toLowerCase() : null;

    if (rankLocked) {
      const d = ui.tubes[BLUE_TUBE];
      if (d.metal && d.disp > 0 && d.disp < 1) return { tone: 'good', line: 'Displacement under way — the blue fades as copper ions take electrons from the metal. Watch the red-brown deposit build.' };
      if (d.metal && d.disp >= 1) return { tone: 'good', line: 'Series confirmed twice over: order by fizzing in acid, order again by displacement in copper(II) sulfate. Mg > Zn > Fe > Cu.' };
      if (!d.metal) return { tone: 'good', line: 'Ranking locked. One confirmation left: drag any metal you placed above copper into the blue copper(II) sulfate tube.' };
    }
    if (rankTally !== null) {
      return { tone: 'warn', line: `${rankTally} of 4 positions match your evidence. Stronger fizz, bigger temperature climb, faster dissolve — re-order and lock it in.` };
    }
    const reacting = ui.tubes.filter((t) => t.metal && t.reacting);
    if (reacting.length) {
      const names = reacting.map((t) => METAL_BY_ID[t.metal as MetalId].name.toLowerCase());
      const subject = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are` : `${names[0]} is`;
      return { tone: 'info', line: `${subject} at work — bubbles carry hydrogen away and the thermometers answer. Tap a tube to read it.` };
    }
    if (ui.tested >= 4 && rows.length < 4) {
      return { tone: 'good', line: 'All four metals tested. Tap each tube and press Record — bubbles per 10 s and the peak temperature rise. Copper’s row of zeros is real data too.' };
    }
    if (rows.length >= 4 && !sawGraph) {
      return { tone: 'info', line: 'Open the Observations tab — your bubbles-vs-time lines and the temperature plot are waiting.' };
    }
    if (rows.length >= 4 && !rankLocked) {
      return { tone: 'good', line: 'Table complete — rank the metals most reactive first from your own numbers, then lock the order in.' };
    }
    if (selName && sel && sel.obsT >= RECORD_AFTER && ui.sel < BLUE_TUBE && !rows.some((r) => r.metal === sel.metal)) {
      const rise = Math.max(0, sel.temp - ROOM_TEMP).toFixed(1);
      return { tone: 'good', line: `${selName} is ready to record — ${sel.rate} bubbles per 10 s and +${rise} °C on the thermometer. Bank it.` };
    }
    if (selName === 'copper' && sel && ui.sel < BLUE_TUBE) {
      return { tone: 'info', line: 'No reaction — copper sits below hydrogen in the reactivity series, so it cannot push hydrogen out of the acid. That silence is evidence.' };
    }
    if (!ui.tested) return { tone: 'info', line: 'Acid is in. Drag the bright magnesium ribbon from the tray into any tube — the headline act.' };
    return { tone: 'info', line: 'Keep going — one metal per tube, and watch how differently each one fizzes.' };
  }, [note, ui, rankLocked, rankTally, rows, sawGraph]);

  // ---- status ------------------------------------------------------------------
  const complete = done[done.length - 1];
  const fizzCount = ui.tubes.filter((t) => t.reacting).length;
  const statusText = complete ? 'Experiment complete'
    : ui.pouring ? 'Pouring acid'
    : fizzCount > 0 ? 'Fizzing in progress'
    : rankLocked ? 'Series ranked'
    : ui.poured ? 'Acid ready'
    : 'Experiment ready';
  const statusTone: 'ready' | 'active' | 'complete' = complete ? 'complete' : fizzCount > 0 || ui.pouring ? 'active' : 'ready';

  // ---- render helpers -------------------------------------------------------------
  const sel = ui.tubes[ui.sel];
  const selMetal = sel?.metal ? METAL_BY_ID[sel.metal] : null;
  const tubeLabel = `Tube ${ui.sel + 1} · ${ui.sel === BLUE_TUBE ? 'CuSO₄' : 'dilute HCl'}${selMetal ? ` · ${selMetal.name.toLowerCase()}` : ''}`;
  const fizzWord = !sel || !sel.metal
    ? '—'
    : sel.gone
      ? (ui.sel === BLUE_TUBE ? 'displaced' : 'dissolved')
      : ui.sel === BLUE_TUBE && sel.disp > 0
        ? 'displacing'
        : sel.rate > 30 ? 'vigorous'
        : sel.rate > 12 ? 'brisk'
        : sel.rate > 3 ? 'steady'
        : sel.rate > 0 ? 'sparse'
        : 'none';

  const freeAcid = ui.tubes.findIndex((t, i) => i < BLUE_TUBE && t.liquid > 0 && !t.metal);
  const blueFree = !!ui.tubes[BLUE_TUBE] && !ui.tubes[BLUE_TUBE].metal;
  const assistOk = ui.poured && !ui.dragging && (freeAcid >= 0 || blueFree);
  const assistName = METAL_BY_ID[assistMetal].name.toLowerCase();
  const assistLabel = !ui.poured
    ? 'Pour the acid first'
    : freeAcid >= 0
      ? `Drop ${assistName} into tube ${freeAcid + 1}`
      : blueFree
        ? `Drop ${assistName} into the blue tube`
        : 'All tubes occupied';

  const alreadyRecorded = !!(sel?.metal && rows.some((r) => r.metal === sel.metal));
  const canRecord = !!sel?.metal && ui.sel < BLUE_TUBE && sel.obsT >= RECORD_AFTER && !alreadyRecorded;
  const recordLabel = ui.sel === BLUE_TUBE && sel?.metal
    ? 'Recording is for the acid tubes — the blue tube is the confirmation'
    : !sel?.metal
      ? 'Select a tube with a metal in it'
      : alreadyRecorded
        ? `${METAL_BY_ID[sel.metal].name} already banked`
        : sel.obsT < RECORD_AFTER
          ? `Watch ${METAL_BY_ID[sel.metal].name.toLowerCase()} for ${RECORD_AFTER} s of simulated time…`
          : `✎ Record ${METAL_BY_ID[sel.metal].name.toLowerCase()} — ${sel.peakRate} bubbles/10 s · +${Math.max(0, sel.peakT - ROOM_TEMP).toFixed(1)} °C`;

  const allTested = ui.tested >= 4;
  const chartHasData = METAL_IDS.some((id) => chart[id].length > 1);
  const fizzPct = Math.min(100, (fizzCount / 4) * 100);

  // ---- render -------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Drag metals in — the bench answers"
      legend={[
        { color: '#dde5ec', label: 'Magnesium ribbon' },
        { color: '#c3ced9', label: 'Zinc granules' },
        { color: '#5f6d80', label: 'Iron nail' },
        { color: '#b87333', label: 'Copper turnings' },
        { color: '#4084c4', label: 'Copper(II) sulfate' },
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
          tabIndex={0}
          role="application"
          aria-label="Reactivity bench — drag a metal sample from the tray into a test tube; press 1 to 5 to select tubes, Space to drop the chosen metal, P to pour"
          onKeyDown={(e) => {
            if (e.key >= '1' && e.key <= '5') {
              e.preventDefault();
              selectTube(Number(e.key) - 1);
              notePointer(true);
            } else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              assistDrop();
              notePointer(true);
            } else if (e.key === 'p' || e.key === 'P') {
              startPour();
              notePointer(true);
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
          <div className="react-layout">
            <div className="react-actions">
              <button
                className="action-button"
                type="button"
                data-nudge="pour"
                onClick={() => { startPour(); notePointer(true); }}
                disabled={ui.poured || ui.pouring}
              >
                <span className="dispense-icon" aria-hidden="true">⌁</span>
                <span>{ui.poured ? 'Acid poured ✓' : ui.pouring ? 'Pouring…' : 'Pour dilute HCl'}</span>
                <small>fills the four test tubes</small>
              </button>
              <div className="assist-drop">
                <select
                  value={assistMetal}
                  aria-label="Metal to drop"
                  onChange={(e) => { setAssistMetal(e.target.value as MetalId); labSound.tick(); }}
                >
                  {METALS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.symbol})</option>
                  ))}
                </select>
                <button
                  className="action-button"
                  type="button"
                  onClick={() => { assistDrop(); notePointer(true); }}
                  disabled={!assistOk}
                >
                  <span className="dispense-icon" aria-hidden="true">⤓</span>
                  <span>{assistLabel}</span>
                  <small>or drag a metal yourself</small>
                </button>
              </div>
            </div>
            <div className="react-clock">
              <span>SIMULATED TIME</span>
              <strong>{fmtClock(ui.simT)}</strong>
              <div className="count-line">
                <span>{fizzCount} tube{fizzCount === 1 ? '' : 's'} fizzing</span>
                <div><span style={{ width: `${fizzPct}%` }} /></div>
              </div>
            </div>
          </div>

          <div className="hint-row">
            <span>✦</span>
            <p style={{ margin: 0 }}>
              Iron is slow — use Playback 4× or 8× to see the full story in seconds. Everything is measured in simulated
              time, so your bubbles-per-10-s stay honest at any speed.
            </p>
          </div>

          <div className="rank-card" data-nudge="rank">
            <div className="rank-head">
              <div>
                <span className="panel-kicker">FROM YOUR EVIDENCE</span>
                <h3>Rank the metals — most reactive first</h3>
              </div>
              {rankLocked && <span className="rank-sealed">Sealed ✓</span>}
            </div>
            <div className="rank-row">
              {rank.map((slotVal, i) => {
                const ord = ['1st · most reactive', '2nd', '3rd', '4th · least reactive'][i];
                return (
                  <label key={i} className="rank-slot">
                    <span>{ord}</span>
                    <select
                      value={slotVal ?? ''}
                      disabled={rankLocked}
                      aria-label={`Rank position ${i + 1}`}
                      onChange={(e) => {
                        const v = (e.target.value || null) as MetalId | null;
                        setRank((cur) => {
                          const next = [...cur];
                          next[i] = v;
                          return next;
                        });
                        setRankTally(null);
                        labSound.tick();
                      }}
                    >
                      <option value="">— choose —</option>
                      {METALS.map((m) => (
                        <option key={m.id} value={m.id} disabled={rank.some((v, j) => j !== i && v === m.id)}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <button
              className="rank-submit"
              type="button"
              onClick={() => { submitRank(); notePointer(true); }}
              disabled={rankLocked || rank.some((v) => !v) || !allTested}
            >
              {rankLocked
                ? 'Ranking locked — Mg > Zn > Fe > Cu'
                : !allTested
                  ? 'Test all four metals first'
                  : 'Lock in this ranking'}
            </button>
            {rankTally !== null && !rankLocked && (
              <p className="rank-note">
                {rankTally} of 4 positions match the evidence — compare bubbles per 10 s and temperature rises, then adjust.
              </p>
            )}
          </div>

          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordSelected(); notePointer(true); }}
            disabled={!canRecord}
          >
            {recordLabel}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header">
            <div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div>
            <span className="instrument-live">LIVE</span>
          </div>
          <div className="reading-main">
            <span>{tubeLabel}</span>
            <strong>{(sel?.temp ?? ROOM_TEMP).toFixed(1)} <small>°C</small></strong>
            <div className="reading-track">
              <span style={{ width: `${Math.min(100, (Math.max(0, (sel?.temp ?? ROOM_TEMP) - ROOM_TEMP) / 20) * 100)}%` }} />
            </div>
            <div className="reading-scale"><span>{ROOM_TEMP} °C start</span><span>+20 °C rise</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Bubbles / 10 s</span><strong>{sel?.rate ?? 0}</strong></div>
            <div><span>Total bubbles</span><strong>{sel?.pops ?? 0}</strong></div>
            <div><span>Metal remaining</span><strong>{sel?.metal ? (sel.frac > 0 ? `${Math.round(sel.frac * 100)} %` : 'gone') : '—'}</strong></div>
            <div><span>Peak ΔT</span><strong>+{Math.max(0, (sel?.peakT ?? ROOM_TEMP) - ROOM_TEMP).toFixed(1)} <small>°C</small></strong></div>
            <div><span>Watch time</span><strong>{(sel?.obsT ?? 0).toFixed(0)} <small>s</small></strong></div>
            <div><span>Fizz</span><strong>{fizzWord}</strong></div>
          </div>
          <div className="bench-board" aria-label="Live fizz rate per metal">
            {METALS.map((m) => {
              const t = ui.tubes.find((x) => x.metal === m.id);
              return (
                <span key={m.id} className="bench-chip">
                  <i style={{ background: m.color }} />
                  {m.symbol}
                  <strong>{t ? `${t.rate}/10 s` : '—'}</strong>
                </span>
              );
            })}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Pour dilute hydrochloric acid into the four tubes — press the amber bottle or the “Pour dilute HCl” button.</li>
              <li>Drag the magnesium ribbon into a tube and watch the hydrogen stream.</li>
              <li>Test zinc, iron and copper too — one metal per tube, so each comparison stays fair.</li>
              <li>Tap a tube to select it, then press Record while it reacts: bubbles per 10 s and the peak temperature rise go into your table.</li>
              <li>Rank the four metals most reactive first and lock the order in.</li>
              <li>Confirm with displacement: drop a metal above copper into the blue copper(II) sulfate tube and watch copper plate on.</li>
            </ol>
            <div className="hint-box">
              <span>✦</span>
              <p>
                <strong>Lab tip</strong>
                Fair comparisons beat quick ones: same acid, same starting temperature, one metal per tube. A metal that does
                nothing is telling you something — copper’s silence is exactly what places it below hydrogen.
              </p>
            </div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">
                Drop a metal, tap its tube and press Record — the bench fills this table from your own readings.
              </p>
            ) : (
              <table className="trial-table">
                <thead>
                  <tr>
                    <th>#</th><th>Metal</th><th>Bubbles / 10 s</th><th>Peak ΔT (°C)</th>
                    <th style={{ textAlign: 'left' }}>Observation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td style={{ color: METAL_BY_ID[r.metal].color }}>{METAL_BY_ID[r.metal].symbol}</td>
                      <td>{r.rate}</td>
                      <td>+{r.dT.toFixed(1)}</td>
                      <td className="obs-cell">{r.obs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {chartHasData && (
              <>
                <h3 style={{ marginTop: 16 }}>Bubbles vs time</h3>
                <RateChart series={chart} height={185} />
                <p className="observation-note">
                  Cumulative hydrogen bubbles, one line per metal — the slope of each line is its fizz rate.
                </p>
              </>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Temperature rise vs fizz rate</h3>
                <Plot
                  points={rows.map((r) => ({ x: r.rate, y: r.dT }))}
                  xLabel="Peak bubbles / 10 s"
                  yLabel="ΔT (°C)"
                  fitLine
                  height={185}
                />
                {fit && (
                  <p className="observation-note">
                    Slope ≈ {fit.m.toFixed(2)} °C per bubble-per-10 s (R² = {fit.r2.toFixed(3)}). The brisker the fizz,
                    the bigger the climb — reaction rate and heat released travel together.
                  </p>
                )}
              </>
            )}
            <p className="observation-note">
              The metal that fizzes hardest, heats most and disappears fastest sits highest in your series. Copper’s row
              of zeros seats it below hydrogen.
            </p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>
              Acids hold hydrogen ions that are waiting to be displaced. A metal above hydrogen in the reactivity series
              pushes hydrogen out of the acid, making the metal’s chloride and hydrogen gas:
            </p>
            <div className="equation">Mg + 2 HCl → MgCl₂ + H₂↑</div>
            <p>
              The same pattern holds for zinc and iron, weaker each time. Copper sits below hydrogen: it cannot displace
              it, so there are no bubbles, no warming, no change at all.
            </p>
            <div className="equation">K &gt; Na &gt; Ca &gt; Mg &gt; Al &gt; Zn &gt; Fe &gt; Pb &gt; (H) &gt; Cu &gt; Ag &gt; Au</div>
            <p>
              The displacement tube confirms the order independently. Copper(II) sulfate contains Cu²⁺ ions, and any metal
              above copper hands electrons straight to them — the blue fades and red-brown copper plates onto the surface:
            </p>
            <div className="equation">Zn + CuSO₄ → ZnSO₄ + Cu</div>
            <p>
              Two independent tests, one order. The fizzing in acid and the plating in copper sulfate must agree, because
              both are the same electron handover seen from different ends.
            </p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations') setSawGraph(true); }}
    />
  );
}

// ---- local drawing helpers --------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tubePath(ctx: CanvasRenderingContext2D, x: number, top: number, bot: number, w: number) {
  const r = w / 2 - 1;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, top);
  ctx.lineTo(x - w / 2, bot - r);
  ctx.arc(x, bot - r, r, Math.PI, 0, true);
  ctx.lineTo(x + w / 2, top);
  ctx.closePath();
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function tubeAt(px: number, py: number, G: Geom): number {
  const half = Math.max(G.tubeW / 2 + 8, 20);
  for (let i = 0; i < 5; i += 1) {
    if (Math.abs(px - G.tubeXs[i]) < half && py > G.tubeTop - 30 && py < G.tubeBottom + 6) return i;
  }
  return -1;
}

function guideRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  const p = 0.5 + 0.5 * Math.sin(t * 3.2);
  ctx.strokeStyle = `rgba(249,115,22,${0.3 + 0.45 * p})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r + p * 5, 0, Math.PI * 2);
  ctx.stroke();
}

function ribbonPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(-21, -5);
  ctx.quadraticCurveTo(-9, 7, 1, -2);
  ctx.quadraticCurveTo(11, -10, 21, 3);
}

function curlPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(-19, -2);
  ctx.arc(-10, -4, 7, Math.PI * 0.9, Math.PI * 2.2);
  ctx.moveTo(-4, 4);
  ctx.arc(3, 1, 8, Math.PI * 1.15, Math.PI * 2.5);
  ctx.moveTo(12, -2);
  ctx.arc(17, -4, 6, Math.PI * 0.8, Math.PI * 2.1);
}

/** One metal sample, drawn at (x, y) at scale k — used by tray, tubes and drags. */
function drawMetal(ctx: CanvasRenderingContext2D, id: MetalId, x: number, y: number, k: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (id === 'mg') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#96a5b4';
    ctx.lineWidth = 8;
    ribbonPath(ctx);
    ctx.stroke();
    ctx.strokeStyle = '#dde5ec';
    ctx.lineWidth = 5.5;
    ribbonPath(ctx);
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.8;
    ribbonPath(ctx);
    ctx.stroke();
    ctx.restore();
  } else if (id === 'zn') {
    const grains: [number, number, number][] = [[-13, 3, 6.5], [-3, -5, 5.2], [7, 3, 6.8], [15, -3, 4.6]];
    grains.forEach(([gx, gy, gr], g) => {
      ctx.beginPath();
      for (let v = 0; v < 6; v += 1) {
        const a = (v / 6) * Math.PI * 2 + g;
        const rr = gr * (0.78 + 0.24 * ((v + g) % 3));
        const px = gx + Math.cos(a) * rr;
        const py = gy + Math.sin(a) * rr;
        if (v === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#c3ced9';
      ctx.fill();
      ctx.strokeStyle = '#7d8b99';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx - gr * 0.3, gy - gr * 0.35, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    });
  } else if (id === 'fe') {
    ctx.rotate(-0.35);
    ctx.fillStyle = '#4a586a';
    roundRect(ctx, -5.5, -21, 11, 7, 2);
    ctx.fill();
    ctx.fillStyle = '#5f6d80';
    roundRect(ctx, -2.6, -15, 5.2, 30, 2.4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2.6, 15);
    ctx.lineTo(0, 21);
    ctx.lineTo(2.6, 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3c4757';
    ctx.lineWidth = 1.2;
    roundRect(ctx, -2.6, -15, 5.2, 30, 2.4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-1, -13);
    ctx.lineTo(-1, 12);
    ctx.stroke();
  } else {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8f5a2b';
    ctx.lineWidth = 5.5;
    curlPath(ctx);
    ctx.stroke();
    ctx.strokeStyle = '#b87333';
    ctx.lineWidth = 3.2;
    curlPath(ctx);
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -1);
    ctx.strokeStyle = 'rgba(240,190,150,0.8)';
    ctx.lineWidth = 1.2;
    curlPath(ctx);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawThermo(ctx: CanvasRenderingContext2D, x: number, top: number, stemH: number, temp: number, on: boolean, tNow: number) {
  const w = 7;
  ctx.fillStyle = '#fdfefe';
  roundRect(ctx, x - w / 2, top, w, stemH, 3);
  ctx.fill();
  ctx.strokeStyle = on ? '#f97316' : '#9fb0bf';
  ctx.lineWidth = on ? 1.8 : 1.2;
  ctx.stroke();
  const f = clamp((temp - TEMP_MIN) / (TEMP_MAX - TEMP_MIN), 0.05, 1);
  const colTop = top + stemH - 5 - f * (stemH - 10);
  ctx.fillStyle = '#e4483c';
  roundRect(ctx, x - 1.8, colTop, 3.6, top + stemH - colTop, 1.8);
  ctx.fill();
  const br = 5.2;
  const bulbY = top + stemH + 3;
  const grad = ctx.createRadialGradient(x - 1.6, bulbY - 1.5, 1, x, bulbY, br);
  grad.addColorStop(0, '#f0836f');
  grad.addColorStop(1, '#d13a2c');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, bulbY, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a72a20';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (on) {
    const p = 0.5 + 0.5 * Math.sin(tNow * 3.4);
    ctx.strokeStyle = `rgba(249,115,22,${0.35 + 0.35 * p})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, bulbY, br + 3.5 + p * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawTray(ctx: CanvasRenderingContext2D, G: Geom, hide: MetalId | null) {
  const grad = ctx.createLinearGradient(0, G.trayY, 0, G.trayY + G.trayH);
  grad.addColorStop(0, '#f0f4f8');
  grad.addColorStop(1, '#dde5ec');
  ctx.fillStyle = grad;
  roundRect(ctx, G.trayX, G.trayY, G.trayW, G.trayH, 10);
  ctx.fill();
  ctx.strokeStyle = '#b6c1cc';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#cfd8e0';
  ctx.beginPath();
  for (let i = 1; i < 4; i += 1) {
    const dx = G.trayX + (G.trayW / 4) * i;
    ctx.moveTo(dx, G.trayY + 6);
    ctx.lineTo(dx, G.trayY + G.trayH - 6);
  }
  ctx.stroke();
  const k = G.narrow ? 0.78 : 1;
  for (const c of G.cells) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 11, 27 * k, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (c.metal !== hide) drawMetal(ctx, c.metal, c.x, c.y, k);
  }
}

function drawRack(ctx: CanvasRenderingContext2D, G: Geom) {
  const lipTop = G.tubeBottom - 20;
  const lipH = G.benchY - lipTop + 2;
  const grad = ctx.createLinearGradient(0, lipTop, 0, lipTop + lipH);
  grad.addColorStop(0, '#4a586a');
  grad.addColorStop(1, '#374353');
  ctx.fillStyle = grad;
  roundRect(ctx, G.rackL - 12, lipTop, G.rackR - G.rackL + 24, lipH, 7);
  ctx.fill();
  ctx.strokeStyle = '#2c3644';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#2c3644';
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.ellipse(G.tubeXs[i], lipTop + 3, G.tubeW / 2 + 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const divX = (G.tubeXs[3] + G.tubeXs[4]) / 2;
  ctx.fillStyle = '#374353';
  roundRect(ctx, divX - 2.5, lipTop - 8, 5, 14, 2);
  ctx.fill();
}

function drawDeposit(ctx: CanvasRenderingContext2D, x: number, y: number, disp: number, w: number, gone: boolean) {
  const n = 6;
  ctx.fillStyle = '#b06a35';
  for (let j = 0; j < n; j += 1) {
    const a = (j / n) * Math.PI * 2 + 0.5;
    const rr = (1.5 + 4.5 * disp) * (w / 40);
    const off = w * 0.26 * disp;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * off, y - 2 - Math.abs(Math.sin(a)) * 3, Math.max(1, rr), 0, Math.PI * 2);
    ctx.fill();
  }
  if (gone) {
    const grad = ctx.createLinearGradient(0, y - 10, 0, y);
    grad.addColorStop(0, '#c97f47');
    grad.addColorStop(1, '#8f5227');
    ctx.fillStyle = grad;
    roundRect(ctx, x - w * 0.3, y - 7 - 3 * disp, w * 0.6, 7, 3);
    ctx.fill();
  }
}

function drawTube(ctx: CanvasRenderingContext2D, s: SimState, G: Geom, i: number, tNow: number) {
  const t = s.tubes[i];
  const x = G.tubeXs[i];
  const top = G.tubeTop;
  const bot = G.tubeBottom;
  const w = G.tubeW;

  if (s.sel === i) {
    ctx.strokeStyle = 'rgba(249,115,22,0.85)';
    ctx.lineWidth = 2.2;
    roundRect(ctx, x - w / 2 - 7, top - 10, w + 14, bot - top + 14, 10);
    ctx.stroke();
  }

  ctx.save();
  tubePath(ctx, x, top, bot, w);
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.fill();
  ctx.clip();

  if (t.liquid > 0) {
    const innerTop = top + 8;
    const innerBot = bot - 9;
    const depth = innerBot - innerTop;
    const sy = innerBot - t.liquid * depth + Math.sin(tNow * 8 + i * 1.7) * t.wobble * 2;

    ctx.fillStyle = i === BLUE_TUBE ? mix([64, 132, 196], [214, 230, 240], t.disp) : 'rgba(199,222,236,0.92)';
    ctx.fillRect(x - w / 2, sy, w, bot - sy);
    ctx.fillStyle = i === BLUE_TUBE ? mix([150, 200, 235], [232, 240, 246], t.disp) : 'rgba(226,240,249,0.95)';
    ctx.beginPath();
    ctx.ellipse(x, sy, w / 2 - 1.5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const b of t.bubbles) {
      const by = sy + b.y * (innerBot - 6 - sy);
      const bx = x + b.x * (w / 2 - 5);
      const r = Math.max(1, b.r);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx - r * 0.35, by - r * 0.35, Math.max(0.4, r * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    }

    if (t.metal) {
      const k = (w / 74) * (0.5 + 0.5 * t.frac);
      if (i === BLUE_TUBE && t.disp > 0) {
        drawDeposit(ctx, x, bot - 10, t.disp, w, t.gone);
      }
      if (!t.gone || i === BLUE_TUBE) {
        drawMetal(ctx, t.metal, x, bot - 10, Math.max(0.12, k));
      }
    }
  }

  for (const f of s.falling) {
    if (f.tube !== i) continue;
    const fy = top + 6 + f.f * (bot - top - 20);
    ctx.save();
    ctx.translate(x, fy);
    ctx.rotate(f.f * 0.8);
    drawMetal(ctx, f.metal, 0, 0, 0.5);
    ctx.restore();
  }

  ctx.restore();

  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  tubePath(ctx, x, top, bot, w);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 3, top);
  ctx.lineTo(x - w / 2 + 1, top);
  ctx.moveTo(x + w / 2 - 1, top);
  ctx.lineTo(x + w / 2 + 3, top);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 3.5, top + 7);
  ctx.lineTo(x - w / 2 + 3.5, bot - 16);
  ctx.stroke();
}

function drawBottle(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const grad = ctx.createLinearGradient(-22, 0, 22, 0);
  grad.addColorStop(0, 'rgba(202,151,58,0.88)');
  grad.addColorStop(0.5, 'rgba(233,190,110,0.92)');
  grad.addColorStop(1, 'rgba(178,124,42,0.88)');
  ctx.fillStyle = grad;
  roundRect(ctx, -22, -30, 44, 58, 9);
  ctx.fill();
  ctx.strokeStyle = '#a9741f';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = 'rgba(240,226,200,0.55)';
  roundRect(ctx, -19, -6, 38, 32, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(233,190,110,0.92)';
  roundRect(ctx, -7, -44, 14, 16, 3);
  ctx.fill();
  ctx.strokeStyle = '#a9741f';
  ctx.stroke();
  ctx.fillStyle = '#435062';
  roundRect(ctx, -9, -50, 18, 9, 3);
  ctx.fill();
  ctx.fillStyle = '#fbf7ef';
  roundRect(ctx, -15, -12, 30, 22, 3);
  ctx.fill();
  ctx.strokeStyle = '#d9c9a8';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#e8c98e';
  ctx.fillRect(-11, 2, 22, 3);
  ctx.restore();
}

function drawBottleScene(ctx: CanvasRenderingContext2D, s: SimState, G: Geom) {
  const homeX = G.bottleX + G.bottleW / 2;
  const homeY = G.bottleY + G.bottleH / 2;
  let bx = homeX;
  let by = homeY;
  let ang = 0;
  let stream = false;
  let targetX = 0;

  if (s.pour.active) {
    const seg = Math.min(3, Math.floor(s.pour.t / 0.8));
    const segT = s.pour.t - seg * 0.8;
    const fillT = clamp(segT / 0.62, 0, 1);
    let tx = G.tubeXs[seg] - 18;
    if (segT > 0.62 && seg < 3) tx = lerp(G.tubeXs[seg] - 18, G.tubeXs[seg + 1] - 18, (segT - 0.62) / 0.18);
    const ty = G.tubeTop - 62;
    if (s.pour.t < 0.35) {
      const m = s.pour.t / 0.35;
      bx = lerp(homeX, G.tubeXs[0] - 18, m);
      by = lerp(homeY, ty, m);
      ang = 0.3 * m;
    } else {
      bx = tx;
      by = ty;
      ang = fillT < 1 ? 2.05 : 1.45;
      stream = fillT > 0.02 && fillT < 0.99;
    }
    targetX = G.tubeXs[seg];
  }

  if (stream) {
    const mx = bx + Math.sin(ang) * 46;
    const my = by - Math.cos(ang) * 46;
    const cpx = (mx + targetX) / 2 + 4;
    const cpy = (my + G.tubeTop) / 2 + 6;
    ctx.strokeStyle = 'rgba(154,196,226,0.65)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(cpx, cpy, targetX - 1, G.tubeTop + 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(234,244,251,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(cpx, cpy, targetX - 1, G.tubeTop + 4);
    ctx.stroke();
  }

  drawBottle(ctx, bx, by, ang);
}

// ---- sidebar chart: cumulative bubbles vs time, one line per metal ----------

function RateChart({ series, height = 190 }: { series: ChartSeries; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, rect.width);
      const h = height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { l: 40, r: 12, t: 14, b: 28 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const active = METAL_IDS.filter((id) => series[id].length > 0);
      let maxT = 20;
      let maxN = 10;
      for (const id of active) {
        const arr = series[id];
        const last = arr[arr.length - 1];
        maxT = Math.max(maxT, last.t);
        maxN = Math.max(maxN, last.n);
      }
      const spanX = (v: number) => pad.l + (v / maxT) * iw;
      const spanY = (v: number) => pad.t + ih - (v / maxN) * ih;

      ctx.strokeStyle = '#e8edf2';
      ctx.lineWidth = 1;
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.fillStyle = '#9aa4b1';
      for (let i = 0; i <= 4; i += 1) {
        const gx = pad.l + (iw * i) / 4;
        const gy = pad.t + (ih * (4 - i)) / 4;
        ctx.beginPath();
        ctx.moveTo(gx, pad.t);
        ctx.lineTo(gx, pad.t + ih);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pad.l, gy);
        ctx.lineTo(pad.l + iw, gy);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.round((maxT * i) / 4)), gx, h - pad.b + 13);
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.round((maxN * i) / 4)), pad.l - 5, gy + 3);
      }

      ctx.strokeStyle = '#c5cdd6';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();

      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('time (s)', pad.l + iw / 2, h - 3);
      ctx.save();
      ctx.translate(10, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('bubbles', 0, 0);
      ctx.restore();

      for (const id of active) {
        const m = METAL_BY_ID[id];
        const arr = series[id];
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        arr.forEach((p, idx) => {
          const px = spanX(p.t);
          const py = spanY(p.n);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        const last = arr[arr.length - 1];
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(spanX(last.t), spanY(last.n), 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      let lx = pad.l + iw - 6;
      const ly = pad.t + 10;
      ctx.font = 'bold 9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      for (let a = active.length - 1; a >= 0; a -= 1) {
        const m = METAL_BY_ID[active[a]];
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(lx - 30, ly);
        ctx.lineTo(lx - 16, ly);
        ctx.stroke();
        ctx.fillStyle = '#4a5769';
        ctx.fillText(m.symbol, lx - 12, ly + 3);
        lx -= 52;
      }
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [series, height]);

  return (
    <canvas
      ref={ref}
      className="lab-plot"
      style={{ width: '100%', height }}
      aria-label="Cumulative bubbles versus time, one line per metal"
    />
  );
}
