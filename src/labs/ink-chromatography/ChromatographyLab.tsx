import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp, fmtClock, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './ink-chromatography.css';

/**
 * Ink chromatography — paper chromatography bench with Rf measurement.
 *
 * The student drags pens from the tray onto the pencil baseline of a hanging
 * strip, lowers the strip into a beaker of solvent (water or ethanol) until
 * the baseline sits just above the liquid, and watches the solvent front
 * climb by capillary action — fast at first, slowing with height — while each
 * pigment rides up at its own fixed Rf fraction of the front. Lifting the
 * strip freezes the run; clicking the baseline, the front mark and each band
 * turns the run into millimetres and Rf values, and the unknown ink is
 * identified by comparing its Rf set with the reference pens.
 */

// ---- bench constants (all distances in millimetres of paper) ----------------

const BASELINE_MM = 20; // pencil baseline above the strip's bottom end
const STRIP_LEN = 120;
const STRIP_W = 26;
const BEAKER_IW = 64; // interior width
const BEAKER_IH = 105; // interior height
const LIQ_DEPTH = 50; // solvent depth in the beaker
const DIP_MIN = -16; // highest the strip can be retracted
const DIP_MAX = 24; // deepest drag allowed
const PARK_DIP = -12; // resting dip while spotting
const RUN_DIP = 3; // dipping this far starts the run
const LIFT_DIP = -6; // retracting this far lifts/freezes the run
const FLOOD_DIP = 17; // deeper than this submerges the spots → ruined
const OVERRUN_P = 115; // front reaching this paper height ruins the run (95 above baseline)
const FRONT_MAX_P = 118; // hard clamp of the front (top of strip)
const CAP_C = 14; // capillary constant (mm) — sets the initial rate
const CAP_K: Record<'water' | 'ethanol', number> = { water: 90, ethanol: 162 }; // ethanol ~1.8× faster
const MENTOR_TARGET = 80; // the recommended lift height above the baseline

const INK_ORDER = ['black', 'blue', 'green', 'unknown'] as const;
type InkId = (typeof INK_ORDER)[number];
type Solvent = 'water' | 'ethanol';
type Phase = 'setup' | 'running' | 'lifted' | 'ruined';

// ---- ink chemistry -----------------------------------------------------------

interface PigmentDef { id: string; name: string; hex: string; rf: number }
interface InkDef {
  id: InkId;
  label: string;
  penBody: string;
  penCap: string;
  spotHex: string;
  pigments: PigmentDef[];
}

/** The unknown is secretly one of the two reference inks; its pigments keep
 *  the reference's exact Rf values but slightly shifted shades, so colour
 *  alone is never quite enough — the numbers settle it. */
function buildInks(unknownIdentity: 'blue' | 'green'): InkDef[] {
  const black: InkDef = {
    id: 'black',
    label: 'Black ink',
    penBody: '#1f2937',
    penCap: '#111827',
    spotHex: '#151a22',
    pigments: [
      { id: 'violet', name: 'Violet', hex: '#8e44ad', rf: 0.15 },
      { id: 'royal', name: 'Royal blue', hex: '#2563eb', rf: 0.42 },
      { id: 'teal', name: 'Teal', hex: '#14b8a6', rf: 0.63 },
      { id: 'yellow', name: 'Yellow', hex: '#e8b923', rf: 0.9 },
    ],
  };
  const blue: InkDef = {
    id: 'blue',
    label: 'Blue pen',
    penBody: '#3b6bd6',
    penCap: '#274a9e',
    spotHex: '#1d3f8f',
    pigments: [
      { id: 'indigo', name: 'Indigo', hex: '#4338ca', rf: 0.38 },
      { id: 'sky', name: 'Sky blue', hex: '#5fa3f0', rf: 0.72 },
    ],
  };
  const green: InkDef = {
    id: 'green',
    label: 'Green pen',
    penBody: '#12a083',
    penCap: '#0b6e59',
    spotHex: '#0d6b57',
    pigments: [
      { id: 'tealg', name: 'Teal green', hex: '#0f9d8a', rf: 0.25 },
      { id: 'greenyellow', name: 'Yellow', hex: '#dfae1a', rf: 0.82 },
    ],
  };
  const unknown: InkDef =
    unknownIdentity === 'green'
      ? {
          id: 'unknown',
          label: 'Unknown ink',
          penBody: '#3a4450',
          penCap: '#2b333d',
          spotHex: '#20302a',
          pigments: [
            { id: 'u-teal', name: 'Deep teal', hex: '#12909e', rf: 0.25 },
            { id: 'u-gold', name: 'Gold', hex: '#e6bd2e', rf: 0.82 },
          ],
        }
      : {
          id: 'unknown',
          label: 'Unknown ink',
          penBody: '#3a4450',
          penCap: '#2b333d',
          spotHex: '#1a2340',
          pigments: [
            { id: 'u-indigo', name: 'Violet blue', hex: '#4a41c8', rf: 0.38 },
            { id: 'u-azure', name: 'Pale azure', hex: '#79b4f2', rf: 0.72 },
          ],
        };
  return [black, blue, green, unknown];
}

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'spot', title: 'Spot the inks', detail: 'Drag a pen from the tray down to the pencil baseline and release — a round spot appears. Put the unknown and both reference pens on the strip; black ink shows the full rainbow.', hint: 'On touch screens, drag the pen with a finger — or press Space to spot the ink chosen in the selector.' },
  { id: 'dip', title: 'Lower the paper into the solvent', detail: 'Drag the strip down into the beaker until its baseline sits just above the liquid — a few millimetres clear. Dip too deep and the spots flood into the solvent.', hint: 'The live dip reading in the side panel counts the millimetres for you.' },
  { id: 'rise', title: 'Let the front rise about 80 mm', detail: 'Capillary action drags solvent up the paper — fast at first, slowing with height — and each pigment rides at its own fraction of that front.', hint: 'Impatient? Switch playback to 2× or 4× in the toolbar.' },
  { id: 'lift', title: 'Lift before it overruns', detail: 'Drag the strip up — or press Lift — while the front is near 80 mm. Past 95 mm the bands cram against the top and the run is ruined.', hint: 'The front progress bar under the scene marks the 80 mm sweet spot.' },
  { id: 'measure', title: 'Measure the bands', detail: 'Click the pencil baseline, then the solvent-front mark, then each pigment band. The ruler panel turns your clicks into millimetres and Rf values.', hint: 'The ink selector picks which lane you are measuring.' },
  { id: 'identify', title: 'Identify the unknown ink', detail: 'Compare the unknown\u2019s Rf set with your reference rows and lock in your match. Identical pigments travel identical distances.', hint: 'Values within about ±0.05 of each other count as the same pigment.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-clean-run', title: 'First clean run', icon: '✓', detail: 'Lifted a strip cleanly — no flood, no overrun, front near 80 mm.' },
  { id: 'three-inks', title: 'Three inks run', icon: '⇄', detail: 'Cleanly developed three or more inks on one strip.' },
  { id: 'full-rf', title: 'Complete Rf table', icon: '📏', detail: 'Measured every pigment band of all four inks.' },
  { id: 'identified', title: 'Unknown identified', icon: '🎯', detail: 'Matched the unknown\u2019s Rf set to the right reference pen.' },
  { id: 'forensic', title: 'Forensic finish', icon: '🏆', detail: 'All four inks on one clean strip, every Rf measured, unknown named.' },
];

// ---- shared types -------------------------------------------------------------

interface BandPig { id: string; name: string; hex: string; rf: number; q: number }
interface BandEntry { inkId: InkId; pigments: BandPig[] }
interface BandRow {
  key: string;
  inkId: InkId;
  label: string;
  pigment: string;
  hex: string;
  dist: number;
  rf: number;
  run: number;
}
interface UiSnap {
  phase: Phase;
  ruinReason: '' | 'flood' | 'overrun';
  d: number;
  frontAB: number;
  runClock: number;
  rate: number;
  spots: InkId[];
  baseSet: boolean;
  frontSet: boolean;
  frontMeas: number;
  peakFront: number;
  everWet: boolean;
  dragStrip: boolean;
  penDrag: boolean;
}

interface SimState {
  phase: Phase;
  ruinReason: '' | 'flood' | 'overrun';
  d: number; // dip: depth of the strip's bottom below the liquid surface (mm)
  front_p: number; // solvent front, paper mm from the strip's bottom
  everWet: boolean;
  runClock: number; // simulated seconds
  rate: number; // live front speed, mm/s (paper coords)
  runId: number;
  peakFront: number;
  spots: InkId[];
  bands: BandEntry[];
  baseSet: boolean;
  frontSet: boolean;
  frontMeas: number;
  dryT: number;
  floodT: number;
  autoLift: boolean;
  dragPen: InkId | null;
  penX: number;
  penY: number;
  penHover: boolean;
  dragStrip: boolean;
  grabP: number;
  hover: { x: number; y: number } | null;
  pressT: number;
  pressInk: string;
  t: number;
  acc: number;
  uiAcc: number;
  slideAt: number;
  loopOn: boolean;
  pendingEvent: null | { type: 'ruin'; reason: 'flood' | 'overrun' } | { type: 'lift'; frontAB: number; spots: InkId[] };
}

const freshSim = (): SimState => ({
  phase: 'setup',
  ruinReason: '',
  d: PARK_DIP,
  front_p: BASELINE_MM,
  everWet: false,
  runClock: 0,
  rate: 0,
  runId: 0,
  peakFront: 0,
  spots: [],
  bands: [],
  baseSet: false,
  frontSet: false,
  frontMeas: 0,
  dryT: 0,
  floodT: -1,
  autoLift: false,
  dragPen: null,
  penX: 0,
  penY: 0,
  penHover: false,
  dragStrip: false,
  grabP: 0,
  hover: null,
  pressT: 0,
  pressInk: '',
  t: 0,
  acc: 0,
  uiAcc: 0,
  slideAt: 0,
  loopOn: false,
  pendingEvent: null,
});

const meta = getLabBySlug('ink-chromatography')!;

/** Ruler-reading jitter: ±0.8 mm on a 0.1 mm-graduated read, like a real eye. */
function jitter(mm: number): number {
  return Math.round((mm + (Math.random() * 2 - 1) * 0.8) * 10) / 10;
}

export default function ChromatographyLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ------------
  const sim = useRef<SimState>(freshSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls -------------------------------------------------------
  const [solvent, setSolvent] = useState<Solvent>('water');
  const [speed, setSpeed] = useState(1);
  const [selectedInk, setSelectedInk] = useState<InkId>('black');
  const [identifyPick, setIdentifyPick] = useState<'' | 'black' | 'blue' | 'green'>('');
  const [unknownIdentity, setUnknownIdentity] = useState<'blue' | 'green'>(() => (Math.random() < 0.5 ? 'blue' : 'green'));
  const [rows, setRows] = useState<BandRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [everSpotted, setEverSpotted] = useState(false);
  const [everRan, setEverRan] = useState(false);
  const [everLiftedClean, setEverLiftedClean] = useState(false);
  const [identifiedCorrect, setIdentifiedCorrect] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    phase: 'setup', ruinReason: '', d: PARK_DIP, frontAB: 0, runClock: 0, rate: 0,
    spots: [], baseSet: false, frontSet: false, frontMeas: 0, peakFront: 0, everWet: false,
    dragStrip: false, penDrag: false,
  });

  const allFourClean = useRef(false);
  const inks = useMemo(() => buildInks(unknownIdentity), [unknownIdentity]);
  const inkById = useCallback((id: InkId) => inks.find((i) => i.id === id)!, [inks]);

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
      phase: s.phase,
      ruinReason: s.ruinReason,
      d: s.d,
      frontAB: Math.max(0, s.front_p - BASELINE_MM),
      runClock: s.runClock,
      rate: s.rate,
      spots: [...s.spots],
      baseSet: s.baseSet,
      frontSet: s.frontSet,
      frontMeas: s.frontMeas,
      peakFront: s.peakFront,
      everWet: s.everWet,
      dragStrip: s.dragStrip,
      penDrag: s.dragPen !== null,
    });
  }, []);

  // ---- derived records ---------------------------------------------------------

  const measuredByInk = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.inkId] = (m[r.inkId] ?? 0) + 1; });
    return m;
  }, [rows]);
  const fullInksMeasured = inks.filter((ink) => (measuredByInk[ink.id] ?? 0) >= ink.pigments.length).length;
  const unknownMeasured = rows.filter((r) => r.inkId === 'unknown').length;
  const totalPigments = inks.reduce((n, i) => n + i.pigments.length, 0);
  const latestRun = rows.length ? Math.max(...rows.map((r) => r.run)) : 0;
  const latestRunRows = useMemo(() => rows.filter((r) => r.run === latestRun), [rows, latestRun]);
  const fit = useMemo(
    () => (latestRunRows.length >= 2 ? linearFit(latestRunRows.map((r) => ({ x: r.rf, y: r.dist }))) : null),
    [latestRunRows],
  );

  useEffect(() => {
    if (rows.length >= totalPigments && !badges.includes('full-rf')) earn('full-rf');
  }, [rows, totalPigments, badges, earn]);

  // ---- mentor completion flags ---------------------------------------------------

  const done = [
    everSpotted,
    everRan,
    ui.peakFront >= MENTOR_TARGET - 5,
    everLiftedClean,
    fullInksMeasured >= 2,
    identifiedCorrect,
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

  // ---- nudge -----------------------------------------------------------------------

  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'spot': return { target: 'scene', gesture: 'drag', title: 'Spot an ink', body: 'Drag any pen from the left-hand tray down to the pencil baseline on the paper, then release to leave its spot.' };
      case 'dip': return { target: 'scene', gesture: 'drag', title: 'Lower the strip', body: 'Grab the paper strip and drag it down into the beaker — stop when the baseline sits just above the liquid.' };
      case 'rise': return { target: 'scene', gesture: 'point', title: 'Watch the front climb', body: 'The solvent front rises fast, then slows. Let it reach about 80 mm — the pigments ride up at their own fractions of it.' };
      case 'lift': return { target: 'lift', gesture: 'press', title: 'Lift the strip', body: 'Press Lift (or drag the strip up) while the front is near 80 mm — past 95 mm the run overruns.' };
      case 'measure': return { target: 'scene', gesture: 'tap', title: 'Measure the bands', body: 'Click the baseline, then the front mark, then each band. The ruler panel turns your clicks into millimetres.' };
      case 'identify': return { target: 'identify', gesture: 'press', title: 'Identify the unknown', body: 'Compare the unknown\u2019s Rf values with your reference rows, choose a pen, and lock in your answer.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ----------------------------------------------------------------------

  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 860;
    const h = canvas?.clientHeight ?? 480;
    const benchY = h - 26;
    const s = (benchY - 42) / 208; // px per bench millimetre
    const trayW = Math.min(122, Math.max(86, w * 0.28));
    const trayX = 14;
    const trayTop = benchY - 162;
    const trayH = 150;
    const beakerCx = Math.max(w * 0.57, trayX + trayW + 36 * s + 10);
    const stripHalf = (STRIP_W / 2) * s;
    const stripWpx = STRIP_W * s;
    const surfaceY = benchY - LIQ_DEPTH * s;
    const floorY = benchY - 3;
    const mouthY = floorY - BEAKER_IH * s;
    const stripBottomY = surfaceY + sim.current.d * s;
    const clipY = stripBottomY - STRIP_LEN * s;
    const stripX0 = beakerCx - stripHalf;
    const lanes = INK_ORDER.map((_, i) => stripX0 + (stripWpx * (i + 0.5)) / 4);
    const pens = INK_ORDER.map((inkId, i) => ({ inkId, cx: trayX + trayW / 2, cy: trayTop + 22 + i * 31 }));
    return {
      w, h, benchY, s, trayX, trayW, trayTop, trayH, pens,
      beakerCx, beakerL: beakerCx - 36 * s, beakerR: beakerCx + 36 * s,
      interiorL: beakerCx - (BEAKER_IW / 2) * s, interiorR: beakerCx + (BEAKER_IW / 2) * s,
      mouthY, surfaceY, floorY,
      rodX: beakerCx + 46 * s, rodTopY: surfaceY - 150 * s,
      stripCx: beakerCx, stripHalf, stripWpx, stripX0, stripBottomY, clipY, lanes,
      laneWidth: stripWpx / 4,
    };
  }, []);

  // ---- run lifecycle helpers ------------------------------------------------------------

  const startRun = useCallback(() => {
    const s = sim.current;
    if (s.phase !== 'setup') return;
    s.phase = 'running';
    s.everWet = true;
    s.runId += 1;
    s.front_p = s.d; // the wet boundary starts at the liquid surface
    s.runClock = 0;
    s.dryT = 0;
    setEverRan(true);
    if (!s.loopOn) {
      labSound.startLoop('pour'); // soft drip ambience while developing
      s.loopOn = true;
    }
    labSound.slosh(0.4);
    syncUi();
  }, [syncUi]);

  const doRuin = useCallback((reason: 'flood' | 'overrun') => {
    const s = sim.current;
    if (s.phase === 'ruined') return;
    s.phase = 'ruined';
    s.ruinReason = reason;
    s.dragStrip = false;
    s.dragPen = null;
    s.autoLift = false;
    if (reason === 'flood') s.floodT = 0;
    s.pendingEvent = { type: 'ruin', reason };
  }, []);

  const doLift = useCallback(() => {
    const s = sim.current;
    if (s.phase !== 'running') return;
    s.phase = 'lifted';
    s.autoLift = false;
    s.dragStrip = false;
    s.rate = 0;
    s.pendingEvent = { type: 'lift', frontAB: s.front_p - BASELINE_MM, spots: [...s.spots] };
  }, []);

  const spot = useCallback((inkId: InkId) => {
    const s = sim.current;
    if (s.phase !== 'setup' || s.spots.includes(inkId)) return false;
    const ink = inks.find((i) => i.id === inkId);
    if (!ink) return false;
    s.spots.push(inkId);
    s.bands.push({ inkId, pigments: ink.pigments.map((p) => ({ ...p, q: BASELINE_MM })) });
    s.pressT = 0.35;
    s.pressInk = inkId;
    labSound.tick();
    pushToast('info', '●', `${ink.label} spotted on the baseline.`);
    setEverSpotted(true);
    syncUi();
    return true;
  }, [inks, pushToast, syncUi]);

  const liftStrip = useCallback(() => {
    const s = sim.current;
    if (s.phase !== 'running') return;
    s.autoLift = true;
    labSound.tick();
    syncUi();
  }, [syncUi]);

  const freshStrip = useCallback(() => {
    const s = sim.current;
    if (s.loopOn) {
      labSound.stopLoop();
      s.loopOn = false;
    }
    s.phase = 'setup';
    s.ruinReason = '';
    s.spots = [];
    s.bands = [];
    s.front_p = BASELINE_MM;
    s.everWet = false;
    s.d = PARK_DIP;
    s.runClock = 0;
    s.rate = 0;
    s.floodT = -1;
    s.dryT = 0;
    s.autoLift = false;
    s.dragStrip = false;
    s.dragPen = null;
    s.baseSet = false;
    s.frontSet = false;
    s.frontMeas = 0;
    s.pressT = 0;
    s.hover = null;
    labSound.click();
    pushToast('info', '📄', 'Fresh strip clipped in — spot your inks again.');
    syncUi();
  }, [pushToast, syncUi]);

  // ---- measurement (the clicking ruler) ---------------------------------------------------

  interface MeasCand { type: 'baseline' | 'front' | 'band'; x: number; y: number; entry?: BandEntry; pig?: BandPig }

  const measureCandidate = useCallback((px: number, py: number): MeasCand | null => {
    const s = sim.current;
    if (s.phase !== 'lifted') return null;
    const G = geom();
    if (Math.abs(px - G.stripCx) > G.stripHalf + 30) return null;
    const Y = (mm: number) => G.stripBottomY - mm * G.s;
    const guideX = clamp(px, G.stripX0 + 6, G.stripX0 + G.stripWpx - 6);
    let best: MeasCand | null = null;
    let bestDy = 20;
    const consider = (y: number, x: number, cand: Omit<MeasCand, 'x' | 'y'>) => {
      const dy = Math.abs(py - y);
      if (dy < bestDy) {
        bestDy = dy;
        best = { ...cand, x, y };
      }
    };
    consider(Y(BASELINE_MM), guideX, { type: 'baseline' });
    if (s.baseSet && s.everWet) consider(Y(s.front_p), guideX, { type: 'front' });
    if (s.frontSet) {
      const entry = s.bands.find((b) => b.inkId === selectedInk);
      if (entry) {
        const laneX = G.lanes[INK_ORDER.indexOf(selectedInk)];
        for (const pig of entry.pigments) consider(Y(pig.q), laneX, { type: 'band', entry, pig });
      }
    }
    return best;
  }, [geom, selectedInk]);

  const measureBaseline = useCallback(() => {
    const s = sim.current;
    s.baseSet = true;
    labSound.tick();
    syncUi();
  }, [syncUi]);

  const measureFront = useCallback(() => {
    const s = sim.current;
    s.frontSet = true;
    s.frontMeas = Math.max(2, jitter(s.front_p - BASELINE_MM));
    labSound.tick();
    pushToast('info', '📐', `Solvent front: ${s.frontMeas.toFixed(1)} mm above the baseline.`);
    syncUi();
  }, [pushToast, syncUi]);

  const measureBand = useCallback((entry: BandEntry, pig: BandPig) => {
    const s = sim.current;
    if (!s.frontSet || s.frontMeas < 2) return;
    const dist = Math.max(0, jitter(pig.q - BASELINE_MM));
    const rf = Math.round((dist / s.frontMeas) * 100) / 100;
    const ink = inks.find((i) => i.id === entry.inkId)!;
    const row: BandRow = {
      key: `${entry.inkId}:${pig.id}`,
      inkId: entry.inkId,
      label: ink.label,
      pigment: pig.name,
      hex: pig.hex,
      dist,
      rf,
      run: s.runId,
    };
    setRows((cur) => {
      const idx = cur.findIndex((r) => r.key === row.key);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = row;
        return next;
      }
      return [...cur, row];
    });
    labSound.ping(880, 0.07);
    syncUi();
  }, [inks, syncUi]);

  const handleMeasurePointer = useCallback((px: number, py: number) => {
    const cand = measureCandidate(px, py);
    if (!cand) {
      notePointer(false);
      return;
    }
    notePointer(true);
    if (cand.type === 'baseline') measureBaseline();
    else if (cand.type === 'front') measureFront();
    else if (cand.entry && cand.pig) measureBand(cand.entry, cand.pig);
  }, [measureCandidate, measureBaseline, measureFront, measureBand, notePointer]);

  // ---- physics + animation -----------------------------------------------------------------

  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.t += dt;
    if (s.pressT > 0) s.pressT = Math.max(0, s.pressT - dt);
    if (s.floodT >= 0 && s.floodT < 1.4) s.floodT += dt;

    // button-driven lift: the strip slides up in real time, physics stays live until clear
    if (s.autoLift && s.phase === 'running') {
      s.d -= 64 * dt;
      if (s.d <= LIFT_DIP) {
        s.d = LIFT_DIP;
        doLift();
      }
    }
    // cosmetic settle after a lift: park the strip just out of the beaker
    if (s.phase === 'lifted' && s.d < PARK_DIP) s.d = Math.min(PARK_DIP, s.d + 36 * dt);
    if (s.phase === 'lifted') s.dryT += dt;

    const scaled = dt * speed;
    s.acc += scaled;
    const h = 1 / 240;
    while (s.acc >= h) {
      s.acc -= h;
      if (s.phase === 'running') {
        // Capillary climb: d(front)/dt = K / (height above the surface + C).
        // The strip can be plunged deeper mid-run, which lifts the surface in
        // paper coordinates and honestly speeds the climb up again.
        let rate = 0;
        if (s.d > 0.5) {
          const fTrue = s.front_p - s.d;
          rate = Math.min(12, CAP_K[solvent] / Math.max(6, fTrue + CAP_C));
        }
        s.rate = rate;
        if (rate > 0) {
          s.front_p = Math.min(FRONT_MAX_P, s.front_p + rate * h);
          for (const entry of s.bands) {
            for (const b of entry.pigments) {
              if (s.front_p > b.q + 0.2) b.q = Math.min(s.front_p - 0.5, b.q + b.rf * rate * h);
            }
          }
        }
        s.runClock += h;
        const frontAB = s.front_p - BASELINE_MM;
        if (frontAB > s.peakFront) s.peakFront = frontAB;
        if (s.front_p >= OVERRUN_P) doRuin('overrun');
        else if (s.spots.length > 0 && s.d >= FLOOD_DIP) doRuin('flood');
      }
    }

    // event pump (ruin / lift) — sounds and toasts land once, on the main thread
    if (s.pendingEvent) {
      const ev = s.pendingEvent;
      s.pendingEvent = null;
      if (s.loopOn) {
        labSound.stopLoop();
        s.loopOn = false;
      }
      if (ev.type === 'ruin') {
        labSound.warn();
        if (ev.reason === 'flood') {
          labSound.slosh(0.85);
          pushToast('warn', '⚠', 'Too deep — the spots dissolved into the solvent. Take a fresh strip and keep the baseline above the liquid.');
        } else {
          pushToast('warn', '⚠', 'The front ran past the safety mark and the bands piled at the top. Fresh strip — lift near 80 mm.');
        }
      } else {
        labSound.slide(0.5);
        labSound.glassClink(true);
        if (ev.frontAB >= 1 && ev.frontAB <= 92) setEverLiftedClean(true);
        if (ev.frontAB >= 50 && ev.frontAB <= 92 && ev.spots.length >= 1) {
          earn('first-clean-run');
          if (ev.spots.length >= 3) earn('three-inks');
          if (ev.spots.length >= 4) allFourClean.current = true;
        }
        if (ev.frontAB >= 50 && ev.frontAB <= 92) {
          pushToast('good', '📐', `Strip lifted — the front froze at ${ev.frontAB.toFixed(0)} mm. Click the baseline, then the front mark, then the bands.`);
        } else if (ev.frontAB < 50) {
          pushToast('info', '📐', `Lifted at ${ev.frontAB.toFixed(0)} mm — usable, but a run to 80 mm separates the bands more cleanly.`);
        } else {
          pushToast('warn', '📐', 'Lifted just in time — the front was a whisker from overrunning the strip.');
        }
      }
      syncUi();
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, solvent, earn, pushToast, syncUi, doRuin, doLift]);

  // ---- drawing -------------------------------------------------------------------------------

  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const G = geom();
    const Y = (mm: number) => G.stripBottomY - mm * G.s;
    const baseY = Y(BASELINE_MM);

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
    ctx.moveTo(0, G.benchY);
    ctx.lineTo(w, G.benchY);
    ctx.stroke();
    ctx.strokeStyle = '#dde4ea';
    ctx.lineWidth = 1;
    for (let x = 8; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, G.benchY);
      ctx.lineTo(x - 10, G.benchY + 10);
      ctx.stroke();
    }

    // pen tray
    ctx.fillStyle = '#e8edf2';
    roundRect(ctx, G.trayX, G.trayTop, G.trayW, G.trayH, 10);
    ctx.fill();
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 1.5;
    roundRect(ctx, G.trayX, G.trayTop, G.trayW, G.trayH, 10);
    ctx.stroke();
    ctx.fillStyle = '#f6f3ea';
    roundRect(ctx, G.trayX + 6, G.trayTop + 6, G.trayW - 12, G.trayH - 12, 7);
    ctx.fill();
    for (const p of G.pens) {
      if (s.dragPen === p.inkId) continue; // the pen in hand is drawn last, at the pointer
      drawPen(ctx, p.cx, p.cy, inkById(p.inkId), s.phase === 'setup' && selectedInk === p.inkId && !s.dragPen);
    }

    // retort stand
    ctx.fillStyle = '#435062';
    ctx.fillRect(G.rodX - 3.5, G.rodTopY, 7, G.benchY - G.rodTopY - 8);
    ctx.fillStyle = '#313d4d';
    roundRect(ctx, G.rodX - 32, G.benchY - 9, 64, 9, 3);
    ctx.fill();

    // beaker + solvent
    const wob = Math.sin(s.t * 1.6) * 1.3;
    const surf = G.surfaceY + wob;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, G.beakerL, G.mouthY, G.beakerR - G.beakerL, G.floorY - G.mouthY, 5);
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    roundRect(ctx, G.beakerL, G.mouthY, G.beakerR - G.beakerL, G.floorY - G.mouthY, 5);
    ctx.stroke();
    ctx.strokeStyle = '#9db8c8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(G.beakerL - 3, G.mouthY);
    ctx.lineTo(G.beakerR + 3, G.mouthY);
    ctx.stroke();
    if (s.ruinReason === 'flood') {
      ctx.fillStyle = 'rgba(74,84,104,0.28)';
      ctx.fillRect(G.interiorL, surf, G.interiorR - G.interiorL, G.floorY - surf - 2);
    } else {
      ctx.fillStyle = solvent === 'ethanol' ? 'rgba(166,201,234,0.55)' : 'rgba(178,214,231,0.5)';
      ctx.fillRect(G.interiorL, surf, G.interiorR - G.interiorL, G.floorY - surf - 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(G.interiorL + 2, surf);
    ctx.lineTo(G.interiorR - 2, surf);
    ctx.stroke();
    // meniscus curls at the walls
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.2;
    for (const mx of [G.interiorL + 2, G.interiorR - 2]) {
      ctx.beginPath();
      ctx.moveTo(mx, surf + 3);
      ctx.quadraticCurveTo(mx + (mx < G.beakerCx ? 4 : -4), surf, mx, surf - 2.5);
      ctx.stroke();
    }
    // glass highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(G.interiorL + 4, G.mouthY + 9, 5, G.floorY - G.mouthY - 18);
    // ethanol evaporates — faint drifting wisps (and a quiet hint which solvent is in)
    if (solvent === 'ethanol') {
      ctx.strokeStyle = 'rgba(140,170,200,0.30)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 2; i += 1) {
        const a = 0.5 + 0.5 * Math.sin(s.t * 1.3 + i * 2.1);
        ctx.globalAlpha = a;
        ctx.beginPath();
        const wx = G.beakerCx - 14 + i * 28;
        ctx.moveTo(wx, surf - 6);
        ctx.quadraticCurveTo(wx + 7, surf - 16 - i * 6, wx - 3, surf - 26 - i * 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---- the chromatography paper ----
    const stripTop = G.clipY + 4;
    const stripH = STRIP_LEN * G.s - 4;
    ctx.fillStyle = '#fdfaf3';
    ctx.fillRect(G.stripX0, stripTop, G.stripWpx, stripH);
    ctx.strokeStyle = '#e2d9c6';
    ctx.lineWidth = 1;
    ctx.strokeRect(G.stripX0, stripTop, G.stripWpx, stripH);

    // wet paper below the solvent front (dries out after lifting)
    if (s.everWet) {
      const dryF = s.phase === 'lifted' ? Math.max(0, 1 - s.dryT / 4) : 1;
      const frontY = Y(Math.min(s.front_p, STRIP_LEN));
      ctx.fillStyle = `rgba(118,143,168,${(0.15 * dryF).toFixed(3)})`;
      ctx.fillRect(G.stripX0, frontY, G.stripWpx, G.stripBottomY - frontY);
      if (s.front_p > s.d + 0.5) {
        if (s.phase === 'running') {
          ctx.strokeStyle = 'rgba(88,112,138,0.7)';
          ctx.lineWidth = 1.6;
        } else {
          ctx.strokeStyle = '#71808e'; // the pencil mark you score across the front
          ctx.lineWidth = 1.2;
        }
        ctx.beginPath();
        ctx.moveTo(G.stripX0 + 1, frontY);
        ctx.lineTo(G.stripX0 + G.stripWpx - 1, frontY);
        ctx.stroke();
      }
    }

    // pencil baseline + lane ticks
    ctx.strokeStyle = '#8b96a3';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(G.stripX0 + 2, baseY);
    ctx.lineTo(G.stripX0 + G.stripWpx - 2, baseY);
    ctx.stroke();
    for (const lx of G.lanes) {
      ctx.beginPath();
      ctx.moveTo(lx, baseY);
      ctx.lineTo(lx, baseY + 2.4 * G.s);
      ctx.stroke();
    }
    // faint lane guides while spotting
    if (s.phase === 'setup') {
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = 'rgba(140,150,160,0.30)';
      ctx.lineWidth = 1;
      for (const lx of G.lanes) {
        ctx.beginPath();
        ctx.moveTo(lx, baseY - 5 * G.s);
        ctx.lineTo(lx, baseY - 33 * G.s);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // selected-lane highlight while measuring
    if (s.phase === 'lifted') {
      const laneX = G.lanes[INK_ORDER.indexOf(selectedInk)];
      ctx.fillStyle = 'rgba(249,115,22,0.07)';
      ctx.fillRect(laneX - G.laneWidth / 2, stripTop, G.laneWidth, stripH);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(232,99,42,0.30)';
      ctx.lineWidth = 1;
      for (const ex of [laneX - G.laneWidth / 2, laneX + G.laneWidth / 2]) {
        ctx.beginPath();
        ctx.moveTo(ex, stripTop + 2);
        ctx.lineTo(ex, G.stripBottomY - 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // spots + pigment bands
    const bw = G.laneWidth * 0.4;
    for (const entry of s.bands) {
      const laneX = G.lanes[INK_ORDER.indexOf(entry.inkId)];
      const ink = inkById(entry.inkId);
      const spotA = s.ruinReason === 'flood'
        ? Math.max(0, 1 - s.floodT / 1.2)
        : s.everWet ? 0.35 : 1;
      if (spotA > 0.01) {
        const pop = s.pressInk === entry.inkId && s.pressT > 0 ? 1 + s.pressT * 0.5 : 1;
        const r = 2.6 * G.s * pop;
        ctx.globalAlpha = spotA;
        ctx.fillStyle = ink.spotHex;
        ctx.beginPath();
        ctx.arc(laneX, baseY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(23,35,52,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (const pig of entry.pigments) {
        if (pig.q <= BASELINE_MM + 0.9) continue;
        const yC = Y(pig.q);
        const hh = (1.7 + 0.055 * (pig.q - BASELINE_MM)) * G.s;
        const grad = ctx.createLinearGradient(0, yC - hh, 0, yC + hh);
        grad.addColorStop(0, hexA(pig.hex, 0.95)); // sharp leading edge
        grad.addColorStop(0.45, hexA(pig.hex, 0.6));
        grad.addColorStop(1, hexA(pig.hex, 0.06)); // smeared tail
        ctx.fillStyle = grad;
        roundRect(ctx, laneX - bw, yC - hh, bw * 2, hh * 2, 2);
        ctx.fill();
      }
    }

    // flood smear
    if (s.ruinReason === 'flood') {
      const p = Math.min(1, Math.max(0, s.floodT) / 1.2);
      const g2 = ctx.createLinearGradient(0, baseY, 0, G.stripBottomY);
      g2.addColorStop(0, `rgba(52,60,78,${(0.5 * p).toFixed(3)})`);
      g2.addColorStop(1, 'rgba(52,60,78,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(G.stripX0, baseY, G.stripWpx, G.stripBottomY - baseY);
    }
    // overrun hatch over the crammed top
    if (s.ruinReason === 'overrun') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(G.stripX0, Y(STRIP_LEN), G.stripWpx, Y(97) - Y(STRIP_LEN));
      ctx.clip();
      ctx.strokeStyle = 'rgba(219,68,55,0.35)';
      ctx.lineWidth = 1.4;
      for (let x = G.stripX0 - 20; x < G.stripX0 + G.stripWpx + 20; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, Y(97));
        ctx.lineTo(x + 20, Y(STRIP_LEN));
        ctx.stroke();
      }
      ctx.restore();
    }

    // beaker glass in front of the strip (a whisper of depth)
    ctx.fillStyle = 'rgba(226,238,246,0.08)';
    ctx.fillRect(G.beakerL, G.mouthY, G.beakerR - G.beakerL, G.floorY - G.mouthY);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(G.interiorR - 9, G.mouthY + 9, 4, G.floorY - G.mouthY - 18);

    // clamp arm + clip holding the strip top
    const armY = G.clipY - 6;
    const brass = ctx.createLinearGradient(0, armY, 0, armY + 8);
    brass.addColorStop(0, '#e2b45c');
    brass.addColorStop(0.5, '#d9a441');
    brass.addColorStop(1, '#9a7226');
    ctx.fillStyle = brass;
    roundRect(ctx, G.stripCx - 6, armY, G.rodX - G.stripCx + 10, 8, 3);
    ctx.fill();
    ctx.strokeStyle = '#8a6420';
    ctx.lineWidth = 1;
    roundRect(ctx, G.stripCx - 6, armY, G.rodX - G.stripCx + 10, 8, 3);
    ctx.stroke();
    ctx.fillStyle = '#b08a35';
    roundRect(ctx, G.rodX - 9, G.clipY - 14, 18, 26, 4);
    ctx.fill();
    ctx.strokeStyle = '#8a6420';
    ctx.stroke();
    ctx.fillStyle = '#6e5019';
    ctx.beginPath();
    ctx.arc(G.rodX, G.clipY - 1, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#39424f';
    roundRect(ctx, G.stripCx - 9, G.clipY - 2, 18, 12, 3);
    ctx.fill();

    // drag guide: the liquid level line
    if (s.dragStrip) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(232,99,42,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(G.beakerL - 12, G.surfaceY);
      ctx.lineTo(G.beakerR + 12, G.surfaceY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ghost spot while a pen hovers the baseline
    if (s.dragPen && s.penHover) {
      const laneX = G.lanes[INK_ORDER.indexOf(s.dragPen)];
      ctx.strokeStyle = 'rgba(232,99,42,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(laneX - bw - 3, baseY);
      ctx.lineTo(laneX + bw + 3, baseY);
      ctx.stroke();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(232,99,42,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(laneX, baseY, 3.2 * G.s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // measurement crosshair ring
    if (s.phase === 'lifted' && s.hover) {
      const cand = measureCandidate(s.hover.x, s.hover.y);
      if (cand) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(232,99,42,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(G.stripX0 + 1, cand.y);
        ctx.lineTo(G.stripX0 + G.stripWpx - 1, cand.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = cand.pig ? hexA(cand.pig.hex, 0.95) : '#f97316';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cand.x, cand.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // the pen in hand
    if (s.dragPen) {
      drawPenAt(ctx, s.penX, s.penY, inkById(s.dragPen));
    }
  }, [geom, inkById, measureCandidate, selectedInk, solvent]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ----------------------------------------------------------------------

  const hitPen = (G: ReturnType<typeof geom>, px: number, py: number): InkId | null => {
    for (const p of G.pens) {
      if (px > p.cx - 42 && px < p.cx + 42 && Math.abs(py - p.cy) < 18) return p.inkId;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;
    const G = geom();

    if (s.phase === 'lifted') {
      handleMeasurePointer(px, py);
      return;
    }

    if (s.phase === 'setup') {
      const pen = hitPen(G, px, py);
      if (pen) {
        s.dragPen = pen;
        s.penX = px;
        s.penY = py;
        s.penHover = false;
        labSound.slide(0.35);
        notePointer(true);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        return;
      }
    }

    if (s.phase === 'setup' || s.phase === 'running') {
      const hitStrip = Math.abs(px - G.stripCx) <= G.stripHalf + 22 && py >= G.clipY - 16 && py <= G.stripBottomY + 12;
      if (hitStrip) {
        s.dragStrip = true;
        s.autoLift = false;
        s.grabP = (G.stripBottomY - py) / G.s;
        labSound.creak(0.25);
        notePointer(true);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        return;
      }
    }

    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;
    s.hover = { x: px, y: py };
    const nowT = performance.now();

    if (s.dragPen) {
      s.penX = px;
      s.penY = py;
      const G = geom();
      const baseY = G.stripBottomY - BASELINE_MM * G.s;
      s.penHover = Math.abs(px - G.stripCx) <= G.stripHalf + 46 && Math.abs(py - baseY) <= 22;
      if (nowT - s.slideAt > 110) {
        s.slideAt = nowT;
        labSound.slide(0.25);
      }
      syncUi();
      return;
    }

    if (s.dragStrip) {
      const G = geom();
      let d = (py + s.grabP * G.s - G.surfaceY) / G.s;
      d = clamp(d, DIP_MIN, DIP_MAX);
      if (s.phase === 'setup' && d >= RUN_DIP) startRun();
      if (d >= FLOOD_DIP && s.spots.length > 0) {
        s.d = d;
        doRuin('flood');
      } else {
        if (d >= FLOOD_DIP) d = FLOOD_DIP - 0.5; // a blank strip simply refuses to go deeper
        if (s.phase === 'running' && d <= LIFT_DIP) {
          s.d = LIFT_DIP;
          doLift();
        } else {
          s.d = d;
        }
      }
      if (nowT - s.slideAt > 90) {
        s.slideAt = nowT;
        labSound.slide(0.45);
      }
      syncUi();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (s.dragPen) {
      const pen = s.dragPen;
      s.dragPen = null;
      const wasHover = s.penHover;
      s.penHover = false;
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      // spot the ink if released over the baseline
      if (wasHover && s.phase === 'setup') {
        spot(pen);
        notePointer(true);
      } else {
        labSound.slide(0.4);
      }
      syncUi();
      return;
    }
    if (s.dragStrip) {
      s.dragStrip = false;
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      syncUi();
    }
  };

  // ---- controls -----------------------------------------------------------------------------------

  const assistAction = () => {
    const s = sim.current;
    if (s.phase === 'setup') {
      let target: InkId | null = selectedInk;
      if (s.spots.includes(target)) {
        const next = inks.find((i) => !s.spots.includes(i.id));
        target = next ? next.id : null;
      }
      if (target) {
        if (target !== selectedInk) setSelectedInk(target);
        spot(target);
        notePointer(true);
      }
      return;
    }
    if (s.phase === 'running') {
      liftStrip();
      notePointer(true);
      return;
    }
    if (s.phase === 'lifted') {
      if (!s.baseSet) {
        measureBaseline();
        notePointer(true);
      } else if (!s.frontSet) {
        measureFront();
        notePointer(true);
      } else {
        const entry = s.bands.find((b) => b.inkId === selectedInk);
        const pig = entry?.pigments.find((p) => !rows.some((r) => r.key === `${selectedInk}:${p.id}`));
        if (entry && pig) {
          measureBand(entry, pig);
          notePointer(true);
        }
      }
    }
  };

  const lockIdentification = () => {
    if (!identifyPick || identifiedCorrect) return;
    if (identifyPick === unknownIdentity) {
      labSound.milestone();
      setIdentifiedCorrect(true);
      earn('identified');
      if (allFourClean.current && rows.length >= totalPigments) earn('forensic');
      const refLabel = inkById(unknownIdentity).label;
      pushToast('good', '🎯', `Case closed — the unknown matches the ${refLabel}: same pigments, same Rf values.`);
    } else {
      labSound.warn();
      pushToast('warn', '⚠', 'Not a match — the Rf values disagree. Run and measure the other references, then try again.');
    }
  };

  const resetAll = () => {
    if (sim.current.loopOn) {
      labSound.stopLoop();
      sim.current.loopOn = false;
    }
    Object.assign(sim.current, freshSim());
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setEverSpotted(false);
    setEverRan(false);
    setEverLiftedClean(false);
    setIdentifiedCorrect(false);
    setIdentifyPick('');
    setSelectedInk('black');
    setUnknownIdentity(Math.random() < 0.5 ? 'blue' : 'green');
    allFourClean.current = false;
    syncUi();
  };

  // ---- coach ----------------------------------------------------------------------------------------

  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.phase === 'ruined') {
      return ui.ruinReason === 'flood'
        ? { tone: 'warn', line: 'The spots washed into the solvent — this strip is finished. Press “Fresh strip”, re-spot, and keep the baseline a few millimetres above the liquid.' }
        : { tone: 'warn', line: 'The front overran the paper and the bands crammed at the top. Take a fresh strip and lift while the front is near 80 mm.' };
    }
    if (ui.dragStrip && ui.phase === 'setup') {
      if (ui.d < RUN_DIP) return { tone: 'info', line: `Lower away — the strip\u2019s end is ${Math.max(0, -ui.d).toFixed(0)} mm above the solvent. Stop when the baseline sits just above the surface.` };
      if (ui.d >= 13) return { tone: 'warn', line: 'That is deep — the spots are closing on the liquid. Keep the baseline a few millimetres clear or the run floods.' };
      return { tone: 'good', line: 'Good depth — the baseline is clear of the liquid. Let go and the solvent starts climbing.' };
    }
    if (ui.dragStrip && ui.phase === 'running') {
      return { tone: 'info', line: 'Dragging up lifts and freezes the run; dragging deeper risks flooding the spots.' };
    }
    if (ui.phase === 'setup') {
      if (ui.spots.length === 0) return { tone: 'info', line: 'Drag a pen from the tray down to the pencil baseline and release — the spot appears where the felt tip lands. The unknown and both references belong on one strip.' };
      return { tone: 'info', line: `${ui.spots.length} of 4 inks spotted. Drag the paper strip down into the beaker until its baseline sits just above the liquid.` };
    }
    if (ui.phase === 'running') {
      if (ui.frontAB >= 92) return { tone: 'warn', line: 'Past 92 mm — lift now, the front is about to overrun the strip.' };
      if (ui.frontAB >= MENTOR_TARGET - 5) return { tone: 'good', line: `About ${ui.frontAB.toFixed(0)} mm — the sweet spot. Lift the strip now: drag it up or press “Lift the strip”.` };
      return { tone: 'info', line: `Solvent climbing — ${ui.frontAB.toFixed(0)} mm of the ~80 mm target, running at ${ui.rate.toFixed(2)} mm/s and slowing. Watch the pigments sort into bands.` };
    }
    if (ui.phase === 'lifted') {
      if (!ui.baseSet) return { tone: 'info', line: 'Run frozen. Click the pencil baseline on the strip to zero your ruler.' };
      if (!ui.frontSet) return { tone: 'info', line: 'Now click the solvent-front pencil mark — that sets the full distance your Rf values divide by.' };
      if (unknownMeasured >= 2 && !identifiedCorrect) return { tone: 'good', line: 'The unknown shows its two bands. Compare their Rf values with your reference rows and lock in your identification.' };
      return { tone: 'info', line: 'Click each pigment band on the strip — the ink selector picks the lane you are measuring. Rows land in Observations as you go.' };
    }
    if (identifiedCorrect) return { tone: 'good', line: 'Case closed. Want the full forensic finish? Run all four inks on one fresh strip and measure every band.' };
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [ui, unknownMeasured, identifiedCorrect]);

  // ---- status -------------------------------------------------------------------------------------------

  const complete = done[done.length - 1];
  const statusTone: 'ready' | 'active' | 'complete' | 'warn' =
    ui.phase === 'running' ? 'active' : ui.phase === 'ruined' ? 'warn' : complete ? 'complete' : 'ready';
  const statusText = complete
    ? 'Case closed — unknown identified'
    : ui.phase === 'ruined'
      ? 'Strip ruined — start a fresh one'
      : ui.phase === 'running'
        ? `Solvent rising — ${ui.frontAB.toFixed(0)} mm`
        : ui.phase === 'lifted'
          ? ui.frontSet ? 'Run frozen — measure the bands' : 'Run frozen — set the ruler'
          : ui.spots.length > 0 ? 'Inks spotted — lower the strip' : 'Bench ready — spot your inks';

  const activeInk = inkById(selectedInk);
  const frontPct = Math.min(100, ui.frontAB);

  // ---- render ---------------------------------------------------------------------------------------------

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Student-controlled chromatography bench"
      legend={[
        { color: '#1f2937', label: 'Black ink pen' },
        { color: '#3b6bd6', label: 'Blue pen (reference)' },
        { color: '#12a083', label: 'Green pen (reference)' },
        { color: '#f97316', label: 'Unknown ink' },
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
          aria-label="Chromatography bench — drag pens to the pencil baseline to spot inks, lower the paper into the beaker, lift the strip, and click bands to measure them"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              assistAction();
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => { sim.current.hover = null; }}
        />
      }
      controls={
        <div>
          <div className="chrom-layout">
            <div className="chrom-actions">
              <button
                className="action-button"
                type="button"
                onClick={() => { assistAction(); }}
                disabled={ui.phase !== 'setup' || ui.spots.includes(selectedInk)}
              >
                <span className="dispense-icon" aria-hidden="true">✎</span>
                <span>Spot the {activeInk.label}</span>
                <small>or drag the pen to the baseline</small>
              </button>
              <button
                className="action-button"
                type="button"
                data-nudge="lift"
                onClick={() => { liftStrip(); notePointer(true); }}
                disabled={ui.phase !== 'running'}
              >
                <span className="dispense-icon" aria-hidden="true">↑</span>
                <span>Lift the strip</span>
                <small>or drag the paper up</small>
              </button>
              <button
                className="action-button"
                type="button"
                data-nudge="fresh"
                onClick={() => { freshStrip(); notePointer(true); }}
                disabled={ui.phase === 'setup' && ui.spots.length === 0 && !ui.everWet}
              >
                <span className="dispense-icon" aria-hidden="true">📄</span>
                <span>Fresh strip</span>
                <small>blank paper, re-spot</small>
              </button>
              <div className="chrom-stopwatch">
                <span>RUN CLOCK · SIMULATED TIME</span>
                <strong className={ui.phase === 'running' ? 'running' : ''}>{fmtClock(ui.runClock)}</strong>
                <div className="count-line">
                  <span>{ui.everWet ? `${ui.frontAB.toFixed(0)}/80 mm` : 'front —'}</span>
                  <div><span style={{ width: `${frontPct}%` }} /></div>
                </div>
              </div>
            </div>
            <div className="chrom-selectors">
              <label>
                <span>Active ink</span>
                <select
                  value={selectedInk}
                  onChange={(e) => { setSelectedInk(e.target.value as InkId); labSound.tick(); }}
                  aria-label="Active ink for spotting and band measurement"
                >
                  {inks.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}{ui.spots.includes(i.id) ? ' — spotted' : ''}</option>
                  ))}
                </select>
                <small>Space spots this ink; after lifting, its lane is the one you measure.</small>
              </label>
              <label>
                <span>Solvent</span>
                <select
                  value={solvent}
                  disabled={ui.phase === 'running'}
                  onChange={(e) => { setSolvent(e.target.value as Solvent); labSound.slosh(0.5); labSound.drip(false); }}
                  aria-label="Solvent in the beaker"
                >
                  <option value="water">Water</option>
                  <option value="ethanol">Ethanol — front ~1.8× faster</option>
                </select>
                <small>The solvent stays put once a run is under way.</small>
              </label>
            </div>
          </div>

          <div className="chrom-identify" data-nudge="identify">
            <div className="chrom-identify-head">
              <span>IDENTIFY THE UNKNOWN INK</span>
              <b className={unknownMeasured >= 2 ? 'ready' : ''}>{unknownMeasured >= 2 ? 'Ready — lock it in' : `Measure its bands (${unknownMeasured}/2)`}</b>
            </div>
            <div className="chrom-identify-row">
              <select
                value={identifyPick}
                onChange={(e) => { setIdentifyPick(e.target.value as '' | 'black' | 'blue' | 'green'); labSound.tick(); }}
                aria-label="Which reference ink does the unknown match?"
              >
                <option value="">— choose a reference —</option>
                <option value="black">Black ink</option>
                <option value="blue">Blue pen</option>
                <option value="green">Green pen</option>
              </select>
              <button
                className="record-button"
                type="button"
                disabled={!identifyPick || unknownMeasured < 2 || identifiedCorrect}
                onClick={() => { lockIdentification(); notePointer(true); }}
              >
                {identifiedCorrect ? '✓ Identified' : 'Lock in identification'}
              </button>
            </div>
            <small>Match the unknown&rsquo;s Rf set against your reference rows — values within about ±0.05 count as the same pigment.</small>
          </div>

          <div className="chrom-hint-row"><span>✦</span><p style={{ margin: 0 }}>Spot the inks dry, dip with the baseline just above the liquid, lift near 80&nbsp;mm, then click baseline → front → each band. Rf = pigment distance ÷ solvent distance, both from the baseline.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Solvent front above baseline (live)</span>
            <strong>{ui.everWet ? <>{ui.frontAB.toFixed(1)} <small>mm</small></> : <small style={{ fontSize: 13 }}>dip the strip to start</small>}</strong>
            <div className="reading-track"><span style={{ width: `${frontPct}%` }} /></div>
            <div className="reading-scale"><span>0 mm</span><span>80 mm target</span><span>100 mm</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Solvent</span><strong>{solvent === 'ethanol' ? 'Ethanol' : 'Water'}</strong></div>
            <div><span>Dip depth</span><strong>{ui.d >= 0 ? `${ui.d.toFixed(0)} mm` : `${(-ui.d).toFixed(0)} mm above`}</strong></div>
            <div><span>Front speed</span><strong>{ui.everWet ? `${ui.rate.toFixed(2)} mm/s` : '—'}</strong></div>
            <div><span>Run clock</span><strong>{fmtClock(ui.runClock)}</strong></div>
            <div><span>Inks spotted</span><strong>{ui.spots.length}/4</strong></div>
            <div><span>Bands measured</span><strong>{rows.length}/{totalPigments}</strong></div>
          </div>
          <div className="chrom-ruler" aria-label="Rf ruler — band distances above the baseline">
            <div className="chrom-ruler-area">
              {[0, 20, 40, 60, 80, 100].map((mm) => (
                <div key={mm} className="chrom-ruler-tick" style={{ bottom: `${mm}%` }}><span>{mm}</span><i /></div>
              ))}
              {ui.frontSet && (
                <div className="chrom-ruler-front" style={{ bottom: `${Math.min(100, ui.frontMeas)}%` }}>
                  <em>{ui.frontMeas.toFixed(1)} mm front</em>
                </div>
              )}
              {latestRunRows.map((r, i) => (
                <i
                  key={r.key}
                  className="chrom-ruler-dot"
                  style={{ bottom: `${Math.min(100, r.dist)}%`, left: 46 + (i % 4) * 13, background: r.hex }}
                  title={`${r.label} — ${r.pigment}: Rf ${r.rf.toFixed(2)}`}
                />
              ))}
            </div>
            <div className="chrom-ruler-cap">distances above the pencil baseline · mm</div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag pens from the tray to the pencil baseline and release to spot them — the unknown, both reference pens, and black ink for the full four-colour split.</li>
              <li>Drag the strip down into the beaker until the baseline sits just above the solvent — a few millimetres clear, never touching.</li>
              <li>Let the solvent front climb to about 80 mm; use 2× or 4× playback if you are impatient.</li>
              <li>Lift — drag the strip up or press “Lift the strip” — before the front passes 95 mm.</li>
              <li>Click the baseline, the front mark, then each band; the ruler turns clicks into millimetres and Rf values.</li>
              <li>Compare the unknown&rsquo;s Rf pair with the references and lock in your identification.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Dip depth is the whole game: too shallow and the solvent never reaches the paper, too deep and the spots dissolve. Aim for the baseline hovering a few millimetres above the liquid, and lift while the front still has room to spare.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Lift a strip and click the baseline, the front mark and each band — every click lands here as a distance and an Rf value.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Ink</th><th>Pigment</th><th>Moved (mm)</th><th>Rf</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key}>
                      <td>{i + 1}</td>
                      <td>{r.label}</td>
                      <td><span className="chrom-dot" style={{ background: r.hex }} />{r.pigment}</td>
                      <td>{r.dist.toFixed(1)}</td>
                      <td>{r.rf.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {latestRunRows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Distance–Rf analysis</h3>
                <Plot
                  points={latestRunRows.map((r) => ({ x: r.rf, y: r.dist }))}
                  xLabel="Rf"
                  yLabel="Distance moved (mm)"
                  fitLine
                  height={220}
                />
                {fit && (
                  <p className="observation-note">
                    Every band from one strip lies on a single line — distance = Rf × solvent-front distance — so the fitted slope
                    ({fit.m.toFixed(1)} mm) is the front distance for that strip, and the intercept ({fit.b.toFixed(1)} mm) should hug zero.
                    The unknown&rsquo;s points sit on the references&rsquo; line precisely when the pigments match.
                  </p>
                )}
              </>
            )}
            <p className="observation-note">Each row is your own click on the paper: pigment distance ÷ solvent distance, both measured from the baseline. Readings carry a small human jitter, the way a real ruler does.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Chromatography separates a mixture because its components disagree about where they would rather be. The damp paper fibres are the stationary phase; the creeping solvent is the mobile phase. A pigment that clings strongly to the paper barely moves, while one that dissolves happily in the solvent chases the front. Black ink is a blend of four such pigments, so one run splays it into a violet-to-yellow ladder.</p>
            <div className="equation">Rf = distance moved by the pigment ÷ distance moved by the solvent front</div>
            <p>Both distances are measured from the baseline, so Rf always sits between 0 and 1. A clingy pigment such as the violet (Rf ≈ 0.15) hugs the start line; a solvent-friendly yellow (Rf ≈ 0.9) nearly keeps pace with the front. Because Rf is a ratio, it is also self-correcting: a slightly shorter run moves every band down proportionally and changes no Rf value at all.</p>
            <p>The front itself is powered by capillary action — surface tension dragging liquid into the narrow channels between paper fibres. That pull weakens as the wet column grows, so the front races at first and then crawls: its height climbs roughly with the square root of time. Ethanol&rsquo;s lower viscosity lets the same paper drink it about 1.8 times faster, which is why ethanol runs finish sooner even though every pigment here keeps its own Rf.</p>
            <p>Identification works because Rf is a fingerprint of the pigment–paper–solvent combination. That is why the reference pens run on the same strip, in the same solvent, beside the unknown: identical pigments travel identical distances, and two matching Rf values are strong evidence that two inks share a dye.</p>
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

// ---- drawing helpers --------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** A horizontal pen, felt tip on the right, centred on (cx, cy). */
function drawPen(ctx: CanvasRenderingContext2D, cx: number, cy: number, ink: InkDef, active: boolean) {
  ctx.save();
  ctx.translate(cx, cy);
  if (active) {
    ctx.strokeStyle = 'rgba(249,115,22,0.65)';
    ctx.lineWidth = 1.6;
    roundRect(ctx, -38, -11, 76, 22, 8);
    ctx.stroke();
  }
  // cap
  ctx.fillStyle = ink.penCap;
  roundRect(ctx, -35, -6.5, 20, 13, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(ctx, -33, -5, 16, 3.5, 2);
  ctx.fill();
  // body
  ctx.fillStyle = ink.penBody;
  roundRect(ctx, -15, -6, 44, 12, 5);
  ctx.fill();
  if (ink.id === 'unknown') {
    ctx.fillStyle = '#f97316';
    roundRect(ctx, -15, -6, 6, 12, 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(23,35,52,0.4)';
  ctx.lineWidth = 1;
  roundRect(ctx, -15, -6, 44, 12, 5);
  ctx.stroke();
  // grip rings
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(20 + i * 4, -5);
    ctx.lineTo(20 + i * 4, 5);
    ctx.stroke();
  }
  // tip cone + felt point
  ctx.fillStyle = '#d7dde3';
  ctx.beginPath();
  ctx.moveTo(29, -5);
  ctx.lineTo(38, -1.8);
  ctx.lineTo(38, 1.8);
  ctx.lineTo(29, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ink.spotHex;
  roundRect(ctx, 36, -1.8, 4.5, 3.6, 1.2);
  ctx.fill();
  ctx.restore();
}

/** The pen in hand, angled so its felt tip sits exactly at the pointer. */
function drawPenAt(ctx: CanvasRenderingContext2D, x: number, y: number, ink: InkDef) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.62);
  drawPen(ctx, -37, 0, ink, false);
  ctx.restore();
}
