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
import './exothermic-endothermic.css';

/**
 * Exothermic vs endothermic — styrofoam-cup calorimetry bench.
 *
 * A fresh 100 mL cup of water at 22 °C waits under a thermometer. The student
 * drags a reagent from the shelf and holds it over the cup to pour: sodium
 * hydroxide climbs about +18 °C, potassium nitrate falls about −15 °C (and the
 * cup fogs on the outside), the citric-acid + hydrogencarbonate pair fizzes
 * while it cools, and the acid–alkali pair neutralises at about +11 °C. Newton
 * cooling always drifts the trace back toward room temperature, stirring with
 * small circles over the cup speeds the dissolving, and every run is recorded
 * with its peak ΔT and classified by the student. A live temperature–time
 * chart keeps the last few runs faded behind the current one.
 *
 * Nominal dose heats (totalDT) are calibrated so a WELL-STIRRED run measures
 * the textbook ΔT (+18, +5, −15, −10, −12, +11 °C). Newton cooling and the
 * thermometer’s response lag shave a few percent off an unstirred run — that
 * shortfall is the technique lesson the observations tab teaches.
 */

const AMBIENT = 22;      // room / starting temperature, °C
const K_COOL = 0.012;    // Newton cooling constant, s⁻¹ (half-time ≈ 58 s)
const K_DISS = 0.16;     // dissolution rate at zero agitation, s⁻¹
const TAU_TH = 5;        // thermometer lag scale, s

type Form = 'solid' | 'liquid';
type Shape = 'jar-squat' | 'jar-tall' | 'tin' | 'bottle' | 'pot' | 'pair' | 'wash';

interface ReagentDef {
  id: string;
  name: string;    // full name for selects and toasts
  short: string;   // short name for chips and the table
  shape: Shape;
  form: Form;
  color: string;   // collar / chip colour — matches the lid on the shelf jar
  totalDT: number; // loss-free heat of a full dose, °C — calibrated so a stirred run measures the textbook ΔT
  split?: [number, number]; // acid–alkali pair: heat split across the two vials
  pourDur: number; // sim seconds of holding to pour a full dose
  hw: number; hh: number;   // shelf hit-box half sizes, px
}

const REAGENTS: ReagentDef[] = [
  { id: 'naoh', name: 'Sodium hydroxide pellets', short: 'NaOH pellets', shape: 'jar-squat', form: 'solid', color: '#b3431f', totalDT: 20.6, pourDur: 2.2, hw: 22, hh: 20 },
  { id: 'h2so4', name: 'Dilute sulfuric acid', short: 'Dilute H₂SO₄', shape: 'bottle', form: 'liquid', color: '#8a6420', totalDT: 5.7, pourDur: 1.7, hw: 15, hh: 28 },
  { id: 'kno3', name: 'Potassium nitrate', short: 'KNO₃', shape: 'jar-tall', form: 'solid', color: '#4f8fc4', totalDT: -17.2, pourDur: 2.2, hw: 18, hh: 25 },
  { id: 'nh4cl', name: 'Ammonium chloride', short: 'NH₄Cl', shape: 'tin', form: 'solid', color: '#2e9d8f', totalDT: -11.5, pourDur: 2.2, hw: 18, hh: 21 },
  { id: 'citric', name: 'Citric acid + sodium hydrogencarbonate', short: 'Citric acid + NaHCO₃', shape: 'pot', form: 'solid', color: '#8a7bc4', totalDT: -13.75, pourDur: 2.0, hw: 24, hh: 15 },
  { id: 'neutral', name: 'Hydrochloric acid + sodium hydroxide (equal volumes)', short: 'HCl + NaOH (1:1)', shape: 'pair', form: 'liquid', color: '#5d8a3c', totalDT: 12.6, split: [1.72, 10.88], pourDur: 3.6, hw: 29, hh: 23 },
  { id: 'water', name: 'Wash bottle (water)', short: 'Wash water', shape: 'wash', form: 'liquid', color: '#6b7f95', totalDT: 0, pourDur: 1.4, hw: 18, hh: 22 },
];

const BY_ID: Record<string, ReagentDef> = Object.fromEntries(REAGENTS.map((r) => [r.id, r]));

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'start', title: 'Read the starting temperature', detail: 'The cup holds 100 mL of fresh water and the thermometer reads room temperature. Note that starting value — every ΔT is measured from here.', hint: 'The sidebar thermometer and the live trace both start at 22.0 °C.' },
  { id: 'naoh', title: 'Dissolve sodium hydroxide', detail: 'Drag the sodium hydroxide jar over the cup and hold it there to pour the pellets. Keep holding until the jar empties, then watch the thermometer climb.', hint: 'Stir with small circles over the cup — stirring speeds the dissolving.' },
  { id: 'kno3', title: 'Try potassium nitrate', detail: 'Record the sodium hydroxide run, then drag potassium nitrate into the fresh cup. This trace runs the other way — watch it fall.', hint: 'When the cup goes colder than the room, the outside of the cup fogs up.' },
  { id: 'record', title: 'Record both runs', detail: 'Bank both runs in the observations table — reagent, direction and the peak ΔT you measured.', hint: 'Recording pours you a fresh cup of water at 22.0 °C.' },
  { id: 'classify', title: 'Classify each run', detail: 'Use the dropdown on each table row: exothermic if heat left the reaction, endothermic if heat went in. Correct picks earn a tick.', hint: 'The sign of ΔT is the whole clue — which way did the thermometer move?' },
  { id: 'neutral', title: 'Try the neutralisation', detail: 'Drag the acid–alkali pair into a fresh cup — equal volumes of hydrochloric acid and sodium hydroxide, poured one after the other.', hint: 'Neutralisation is one of the most reliably exothermic reactions there is.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-exo', title: 'First exothermic', icon: '▲', detail: 'Watched a run climb — the reaction gave heat out to the water.' },
  { id: 'first-endo', title: 'First endothermic', icon: '▼', detail: 'Watched a run fall — the reaction took heat in from the water.' },
  { id: 'both-directions', title: 'Both directions', icon: '↕', detail: 'Witnessed both chart directions — one run climbing, another falling.' },
  { id: 'acid-safety', title: 'Acid safety', icon: '⚠', detail: 'Met the golden rule — always add acid to water, never water to acid.' },
  { id: 'full-table', title: 'Full table', icon: '▦', detail: 'Classified five runs correctly in the observations table.' },
];

interface Pt { t: number; T: number }
interface PrevTrace { samples: Pt[] }
interface TrialRow { id: number; reagentId: string; short: string; dT: number; choice: '' | 'exo' | 'endo' }

interface UiSnap {
  thT: number;
  t: number;
  dT: number;
  recordable: boolean;
  contents: string;
  direction: 'up' | 'down' | 'flat';
  dissolved: number;
  agit: number;
  pouring: boolean;
  live: Pt[];
  prev: PrevTrace[];
  peak: { t: number; T: number } | null;
}

interface Sim {
  cupT: number;
  thT: number;
  t: number;      // simulated seconds since the run started
  rt: number;     // real seconds (sound throttles + idle animations)
  acc: number;
  uiAcc: number;
  sampleAcc: number;
  runReagent: string | null;
  added: number;       // reagent dose poured in, 0..1
  waterAdded: number;  // cosmetic wash-bottle top-ups, 0..1
  dissolved: number;   // dissolved fraction of the dose, 0..added
  peakT: number; peakAt: number;
  minT: number; minAt: number;
  recordable: boolean;
  peakNoted: boolean;
  badgePeaked: number; // bit 1 exo seen, bit 2 endo seen, bit 4 both-directions awarded
  sawWhich: '' | 'naoh' | 'kno3' | 'neutral';
  pendingSaw: '' | 'naoh' | 'kno3' | 'neutral';
  samples: Pt[];
  prevRuns: PrevTrace[];
  drag: { id: string; x: number; y: number } | null;
  dragTilt: number;
  auto: { id: string; t: number; done: boolean; doneAt: number } | null;
  pourActive: boolean;
  pourReagent: string | null;
  stirringNow: boolean;
  stirAngle: number;
  stirTravel: number;
  stirRevAt: number;
  handEnergy: number;
  agitDisp: number;
  stirPhase: number;
  swirl: number;
  idle: number;
  bubbles: { x: number; y: number; r: number; wob: number }[];
  ripples: { x: number; y: number; r: number; a: number }[];
  grains: { x: number; y: number; vx: number; vy: number; r: number }[];
  fog: number;
  foam: number;
  fizzing: boolean;
  bubbleAcc: number;
  sloshAt: number;
  popAt: number;
  slideAt: number;
  rippleAt: number;
  grainAt: number;
  loopOn: boolean;
  acidNoteCount: number;
  refuseNoted: boolean;
}

const meta = getLabBySlug('exothermic-endothermic')!;

// ---------------------------------------------------------------- helpers

/** Heat (°C of cup water) released as the dissolved fraction moves from → to. */
function heatFor(def: ReagentDef, from: number, to: number): number {
  if (!def.split) return def.totalDT * (to - from);
  let q = 0;
  if (from < 0.5) q += (def.split[0] / 0.5) * (Math.min(to, 0.5) - from);
  if (to > 0.5) q += (def.split[1] / 0.5) * (to - Math.max(from, 0.5));
  return q;
}

function decimate(src: Pt[], max: number): Pt[] {
  if (src.length <= max) return src.slice();
  const stride = Math.ceil(src.length / max);
  const out: Pt[] = [];
  for (let i = 0; i < src.length; i += stride) out.push(src[i]);
  out.push(src[src.length - 1]);
  return out;
}

function shortestAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function cupHasAcid(s: Sim): boolean {
  return s.runReagent === 'h2so4' || (s.runReagent === 'neutral' && s.added < 0.6);
}

function recordableNow(s: Sim): boolean {
  if (!s.runReagent || s.added < 0.999 || s.dissolved < s.added - 0.006) return false;
  const def = BY_ID[s.runReagent];
  const at = def.totalDT >= 0 ? s.peakAt : s.minAt;
  return s.t - at > 5;
}

function extremeOf(s: Sim): { T: number; at: number } {
  if (!s.runReagent) return { T: AMBIENT, at: 0 };
  const def = BY_ID[s.runReagent];
  return def.totalDT >= 0 ? { T: s.peakT, at: s.peakAt } : { T: s.minT, at: s.minAt };
}

function contentsLabel(s: Sim): string {
  if (!s.runReagent) return s.waterAdded > 0 ? 'Water (topped up)' : 'Fresh water · 100 mL';
  switch (s.runReagent) {
    case 'naoh': return 'Sodium hydroxide solution';
    case 'h2so4': return 'Dilute sulfuric acid';
    case 'kno3': return 'Potassium nitrate solution';
    case 'nh4cl': return 'Ammonium chloride solution';
    case 'citric': return 'Citric acid + NaHCO₃ (fizzing)';
    default: return s.added < 0.6 ? 'Dilute hydrochloric acid' : 'Neutralised salt solution';
  }
}

function freshCup(s: Sim) {
  s.cupT = AMBIENT;
  s.thT = AMBIENT;
  s.t = 0;
  s.acc = 0;
  s.sampleAcc = 0;
  s.runReagent = null;
  s.added = 0;
  s.waterAdded = 0;
  s.dissolved = 0;
  s.peakT = AMBIENT;
  s.peakAt = 0;
  s.minT = AMBIENT;
  s.minAt = 0;
  s.recordable = false;
  s.peakNoted = false;
  s.sawWhich = '';
  s.samples = [{ t: 0, T: AMBIENT }];
  s.pourActive = false;
  s.pourReagent = null;
  s.auto = null;
  s.bubbles = [];
  s.ripples = [];
  s.grains = [];
  s.fog = 0;
  s.foam = 0;
  s.fizzing = false;
  s.refuseNoted = false;
}

const fmtDT = (dT: number) => `${dT > 0 ? '+' : ''}${dT.toFixed(1)}`;

// ---------------------------------------------------------------- component

export default function ThermoLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef<Sim>({
    cupT: AMBIENT, thT: AMBIENT,
    t: 0, rt: 0, acc: 0, uiAcc: 0, sampleAcc: 0,
    runReagent: null, added: 0, waterAdded: 0, dissolved: 0,
    peakT: AMBIENT, peakAt: 0, minT: AMBIENT, minAt: 0,
    recordable: false, peakNoted: false, badgePeaked: 0,
    sawWhich: '', pendingSaw: '',
    samples: [{ t: 0, T: AMBIENT }],
    prevRuns: [],
    drag: null, dragTilt: 0, auto: null,
    pourActive: false, pourReagent: null,
    stirringNow: false, stirAngle: 0, stirTravel: 0, stirRevAt: 0,
    handEnergy: 0, agitDisp: 0, stirPhase: 0, swirl: 0, idle: 0,
    bubbles: [], ripples: [], grains: [],
    fog: 0, foam: 0, fizzing: false, bubbleAcc: 0,
    sloshAt: 0, popAt: 0, slideAt: 0, rippleAt: 0, grainAt: 0,
    loopOn: false, acidNoteCount: 0, refuseNoted: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const archives = useRef<Map<number, { samples: Pt[]; peakAt: number }>>(new Map());

  // ---- student controls ---------------------------------------------------
  const [autoStir, setAutoStir] = useState(0); // 0 off, 0.45 gentle, 0.9 vigorous
  const [assistId, setAssistId] = useState('naoh');
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawNaOH, setSawNaOH] = useState(false);
  const [sawKNO3, setSawKNO3] = useState(false);
  const [sawNeutral, setSawNeutral] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [acidNote, setAcidNote] = useState<'right' | 'wrong' | null>(null);
  const [classNote, setClassNote] = useState(false);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    thT: AMBIENT, t: 0, dT: 0, recordable: false, contents: 'Fresh water · 100 mL',
    direction: 'flat', dissolved: 0, agit: 0, pouring: false,
    live: [{ t: 0, T: AMBIENT }], prev: [], peak: null,
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
    if (!acidNote) return;
    const t = window.setTimeout(() => setAcidNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [acidNote]);

  useEffect(() => {
    if (!classNote) return;
    const t = window.setTimeout(() => setClassNote(false), 6000);
    return () => window.clearTimeout(t);
  }, [classNote]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    const ext = extremeOf(s);
    const dT = s.runReagent ? ext.T - AMBIENT : 0;
    setUi({
      thT: s.thT,
      t: s.t,
      dT,
      recordable: recordableNow(s),
      contents: contentsLabel(s),
      direction: dT > 0.5 ? 'up' : dT < -0.5 ? 'down' : 'flat',
      dissolved: s.runReagent && s.added > 0 ? s.dissolved / s.added : 0,
      agit: s.agitDisp,
      pouring: s.pourActive,
      live: decimate(s.samples, 420),
      prev: s.prevRuns.map((p) => ({ samples: p.samples })),
      peak: s.runReagent && Math.abs(dT) > 0.5 ? { t: ext.at, T: ext.T } : null,
    });
  }, []);

  // ---- mentor completion flags ---------------------------------------------
  const correctCount = rows.filter((r) => r.choice !== '' && (r.dT > 0) === (r.choice === 'exo')).length;
  const done = [
    mentorAcked,
    sawNaOH,
    sawKNO3,
    rows.length >= 2,
    correctCount >= 2 && rows.length >= 2,
    sawNeutral,
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
    if (correctCount >= 5) earn('full-table');
  }, [correctCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ----------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'naoh': return { target: 'scene', gesture: 'drag', title: 'Pour the sodium hydroxide', body: 'Drag the squat jar with the brick-red cap down over the cup and hold it there — the pellets stream in while you hold.' };
      case 'kno3': return { target: 'scene', gesture: 'drag', title: 'Pour potassium nitrate', body: 'Record the last run first, then drag the tall jar with the blue cap over the fresh cup and hold to pour.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the run', body: 'The peak has passed — press Record to bank the reagent, its direction and the ΔT you measured.' };
      case 'classify': return { target: 'observations', gesture: 'tap', title: 'Classify your runs', body: 'Open Observations and pick exothermic or endothermic on each row — the sign of ΔT is the clue.' };
      case 'neutral': return { target: 'scene', gesture: 'drag', title: 'Try the neutralisation', body: 'Drag the little rack of two vials over a fresh cup and hold — the acid pours first, then the alkali.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ---------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const benchY = h - 44;
    const shelfY = 92;                       // top surface of the shelf board
    const slotW = Math.min(86, (w - 26) / REAGENTS.length);
    const shelfX0 = (w - slotW * REAGENTS.length) / 2;
    const cupW = clamp(w * 0.235, 96, 134);
    const cupH = clamp(h * 0.235, 84, 104);
    const cupX = w * 0.5;
    const rimY = benchY - cupH;
    const innerR = cupW / 2 - 7;
    const surfaceY = rimY + 4;
    return {
      w, h, benchY, shelfY, slotW, shelfX0,
      cupX, cupW, cupH, rimY, innerR, surfaceY,
      drop: { x0: cupX - cupW * 0.85, x1: cupX + cupW * 0.85, y0: rimY - 84, y1: rimY + 46 },
    };
  }, []);

  const hitShelf = useCallback((px: number, py: number, g: ReturnType<typeof geom>): string | null => {
    for (let i = 0; i < REAGENTS.length; i += 1) {
      const r = REAGENTS[i];
      const cx = g.shelfX0 + g.slotW * (i + 0.5);
      const cy = g.shelfY - r.hh - 2;
      if (Math.abs(px - cx) < r.hw + 11 && Math.abs(py - cy) < r.hh + 11) return r.id;
    }
    return null;
  }, []);

  const inDrop = (x: number, y: number, g: ReturnType<typeof geom>) =>
    x > g.drop.x0 && x < g.drop.x1 && y > g.drop.y0 && y < g.drop.y1;

  // ---- physics + loop step ------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const g = geom();
    s.rt += dt;
    s.idle += dt;

    const agit = clamp(autoStir + s.handEnergy, 0, 1.15);
    s.agitDisp = agit;
    s.handEnergy = Math.max(0, s.handEnergy - s.handEnergy * 1.05 * dt);
    const stirVis = Math.max(agit, s.stirringNow ? 0.5 : 0);
    s.stirPhase += (0.7 + 5.4 * stirVis) * dt;
    s.swirl += (0.5 + 4.6 * stirVis) * dt;

    // ---- pour arbitration (drag over cup, or the keyboard-assist ghost) ----
    let wantPour = false;
    let pourId: string | null = null;
    if (s.drag) {
      const doseLeft = (s.drag.id === 'water' ? s.waterAdded < 1 : s.added < 1);
      if (inDrop(s.drag.x, s.drag.y, g) && doseLeft) {
        pourId = s.drag.id;
        wantPour = true;
      }
    } else if (s.auto) {
      const doseLeft = (s.auto.id === 'water' ? s.waterAdded < 1 : s.added < 1);
      if (s.auto.t > 0.45 && (!s.auto.done || doseLeft)) {
        pourId = s.auto.id;
        wantPour = true;
      }
    }
    // one reagent per cup — refuse a second, different chemistry
    if (wantPour && pourId && s.runReagent && s.runReagent !== pourId && pourId !== 'water') {
      wantPour = false;
      if (!s.refuseNoted) {
        s.refuseNoted = true;
        labSound.warn();
        pushToast('info', '⤓', 'One reagent per cup — record this run (or pour a fresh cup) before starting another chemistry.');
      }
    }
    if (wantPour !== s.pourActive) {
      s.pourActive = wantPour;
      if (wantPour && pourId) {
        s.pourReagent = pourId;
        s.refuseNoted = false;
        notePointer(true);
        labSound.slosh(0.3);
        const hadAcid = cupHasAcid(s); // captured before the pour changes the cup
        if (!s.runReagent && pourId !== 'water') s.runReagent = pourId;
        // the add-acid-to-water rule, both directions
        if ((pourId === 'h2so4' || pourId === 'neutral') && !hadAcid) {
          if (s.acidNoteCount === 0) {
            pushToast('good', '⬇', 'Good order — acid into water. Always add the acid to the water, never the reverse.');
          }
          setAcidNote('right');
          s.acidNoteCount += 1;
          earn('acid-safety');
        } else if (pourId === 'water' && hadAcid) {
          labSound.warn();
          pushToast('warn', '⚠', 'Water into acid! Here the acid is already dilute so nothing dramatic happens — but with concentrated acid, water on top can flash to steam and spit. Always add acid to water.');
          setAcidNote('wrong');
          earn('acid-safety');
        }
      } else if (!wantPour) {
        s.pourReagent = null;
      }
    }

    // ---- sub-stepped chemistry -------------------------------------------
    s.acc += dt * speed;
    const h = 1 / 120;
    while (s.acc >= h) {
      s.acc -= h;
      s.t += h;
      if (s.pourActive && s.pourReagent) {
        const def = BY_ID[s.pourReagent];
        if (s.pourReagent === 'water') s.waterAdded = Math.min(1, s.waterAdded + h / def.pourDur);
        else s.added = Math.min(1, s.added + h / def.pourDur);
      }
      if (s.runReagent) {
        const avail = s.added - s.dissolved;
        if (avail > 1e-6) {
          const kd = K_DISS * (1 + 1.8 * agit);
          let dD = kd * avail * h;
          if (s.dissolved + dD > s.added) dD = s.added - s.dissolved;
          s.cupT += heatFor(BY_ID[s.runReagent], s.dissolved, s.dissolved + dD);
          s.dissolved += dD;
        }
      }
      // Newton cooling toward the room, always running
      s.cupT -= K_COOL * (s.cupT - AMBIENT) * h;
      // thermometer lag — stirring keeps the reading honest
      s.thT += ((s.cupT - s.thT) / (TAU_TH / (0.6 + 1.4 * agit))) * h;
      if (s.thT > s.peakT) { s.peakT = s.thT; s.peakAt = s.t; }
      if (s.thT < s.minT) { s.minT = s.thT; s.minAt = s.t; }
      s.sampleAcc += h;
      if (s.sampleAcc >= 0.5) {
        s.sampleAcc -= 0.5;
        s.samples.push({ t: s.t, T: s.thT });
        if (s.samples.length > 1600) s.samples.shift();
      }
    }

    // ---- run milestones -----------------------------------------------------
    const ext = extremeOf(s);
    const dT = s.runReagent ? ext.T - AMBIENT : 0;
    if (s.runReagent && Math.abs(dT) >= 4.5 && s.added >= 0.6) {
      if (dT > 0 && (s.badgePeaked & 1) === 0) { s.badgePeaked |= 1; earn('first-exo'); }
      if (dT < 0 && (s.badgePeaked & 2) === 0) { s.badgePeaked |= 2; earn('first-endo'); }
      // both chart directions witnessed — the fifth spec badge
      if (s.badgePeaked === 3) { s.badgePeaked |= 4; earn('both-directions'); }
      if (s.sawWhich !== s.runReagent && (s.runReagent === 'naoh' || s.runReagent === 'kno3' || s.runReagent === 'neutral')) {
        s.sawWhich = s.runReagent;
        s.pendingSaw = s.runReagent;
      }
    }
    const rec = recordableNow(s);
    if (rec && !s.recordable && !s.peakNoted) {
      s.recordable = true;
      s.peakNoted = true;
      labSound.ping(880, 0.07);
      pushToast('info', dT >= 0 ? '▲' : '▼', `Peak reached — ΔT = ${fmtDT(dT)} °C. Record the run whenever you are ready.`);
    } else {
      s.recordable = rec;
    }
    if (s.pendingSaw) {
      const which = s.pendingSaw;
      s.pendingSaw = '';
      if (which === 'naoh') setSawNaOH(true);
      else if (which === 'kno3') setSawKNO3(true);
      else if (which === 'neutral') setSawNeutral(true);
    }

    // ---- auto-pour ghost lifecycle ------------------------------------------
    if (s.auto) {
      s.auto.t += dt;
      if (!s.auto.done && ((s.auto.id === 'water' && s.waterAdded >= 1) || (s.auto.id !== 'water' && s.added >= 1))) {
        s.auto.done = true;
        s.auto.doneAt = s.auto.t;
      }
      if (s.auto.done && s.auto.t > s.auto.doneAt + 0.45) {
        s.auto = null;
      }
    }

    // ---- fizz, fog and pour visuals -----------------------------------------
    s.fizzing = s.runReagent === 'citric' && s.added - s.dissolved > 0.012;
    if (s.fizzing) {
      s.bubbleAcc += dt * speed * (14 + 26 * clamp(agit, 0, 1));
      while (s.bubbleAcc >= 1) {
        s.bubbleAcc -= 1;
        s.bubbles.push({
          x: g.cupX + (Math.random() * 2 - 1) * g.innerR * 0.55,
          y: g.surfaceY + 9 + Math.random() * 7,
          r: 1.2 + Math.random() * 2.3,
          wob: Math.random() * Math.PI * 2,
        });
        if (s.bubbles.length > 16) s.bubbles.shift();
      }
    }
    const foamTarget = s.fizzing ? 1 : 0;
    s.foam += (foamTarget - s.foam) * Math.min(1, dt * 1.4);
    for (const b of s.bubbles) {
      b.y -= (20 + b.r * 6) * dt;
      b.wob += dt * 6;
    }
    s.bubbles = s.bubbles.filter((b) => {
      if (b.y <= g.surfaceY - 1) {
        s.ripples.push({ x: b.x, y: g.surfaceY - 1, r: b.r + 1, a: 0.5 });
        if (s.rt - s.popAt > 0.09) { s.popAt = s.rt; labSound.drip(true); }
        return false;
      }
      return true;
    });
    const fogTarget = s.runReagent && s.cupT < AMBIENT - 0.8 ? clamp((AMBIENT - s.cupT) / 11, 0, 1) : 0;
    s.fog += (fogTarget - s.fog) * Math.min(1, dt * 0.5);

    // grains of solid falling from a tipped jar
    let origin: { x: number; y: number } | null = null;
    if (s.pourActive && s.pourReagent) {
      const def = BY_ID[s.pourReagent];
      const vialDx = def.shape === 'pair' ? (s.added < 0.5 ? -14 : 14) : 0;
      if (s.drag) origin = { x: s.drag.x - def.hh * 0.9 + vialDx, y: s.drag.y - 18 + def.hh * 0.42 };
      else if (s.auto) origin = { x: g.cupX - def.hh * 0.9 + vialDx, y: g.rimY - 78 + def.hh * 0.42 };
    }
    if (origin && s.pourReagent && BY_ID[s.pourReagent].form === 'solid') {
      if (s.rt - s.grainAt > 0.09) {
        s.grainAt = s.rt;
        for (let k = 0; k < 2; k += 1) {
          s.grains.push({
            x: origin.x + (Math.random() * 2 - 1) * 7,
            y: origin.y + Math.random() * 4,
            vx: (Math.random() * 2 - 1) * 16,
            vy: 40 + Math.random() * 30,
            r: 1.6 + Math.random() * 1.8,
          });
        }
      }
    }
    for (const gr of s.grains) {
      gr.vy += 540 * dt;
      gr.x += gr.vx * dt;
      gr.y += gr.vy * dt;
    }
    s.grains = s.grains.filter((gr) => {
      if (gr.y >= g.surfaceY) {
        s.ripples.push({ x: gr.x, y: g.surfaceY, r: 3, a: 0.55 });
        if (s.rt - s.popAt > 0.12) { s.popAt = s.rt; labSound.drip(true); }
        return false;
      }
      return true;
    });
    if (s.pourActive && s.pourReagent && BY_ID[s.pourReagent].form === 'liquid' && s.rt - s.rippleAt > 0.3) {
      s.rippleAt = s.rt;
      s.ripples.push({ x: g.cupX + (Math.random() * 2 - 1) * 10, y: g.surfaceY, r: 4, a: 0.6 });
    }
    for (const rp of s.ripples) {
      rp.r += 46 * dt;
      rp.a -= 1.6 * dt;
    }
    s.ripples = s.ripples.filter((rp) => rp.a > 0);

    // ---- continuous sound management ----------------------------------------
    const wantLoop = s.pourActive || s.fizzing;
    if (wantLoop !== s.loopOn) {
      s.loopOn = wantLoop;
      if (wantLoop) labSound.startLoop('pour');
      else labSound.stopLoop();
    }
    if (agit > 0.35 && s.rt - s.sloshAt > 2.6) {
      s.sloshAt = s.rt;
      labSound.slosh(clamp(0.18 + agit * 0.5, 0.15, 0.8));
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, autoStir, geom, earn, pushToast, syncUi, notePointer]);

  // ---- drawing -------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();

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
    for (let x = 8; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, g.benchY);
      ctx.lineTo(x - 10, g.benchY + 10);
      ctx.stroke();
    }

    // ---------------- shelf ----------------
    const boardG = ctx.createLinearGradient(0, g.shelfY, 0, g.shelfY + 12);
    boardG.addColorStop(0, '#cda570');
    boardG.addColorStop(1, '#a87f4e');
    ctx.fillStyle = boardG;
    roundRect(ctx, g.shelfX0 - 12, g.shelfY, g.slotW * REAGENTS.length + 24, 12, 4);
    ctx.fill();
    ctx.strokeStyle = '#8a6420';
    ctx.lineWidth = 1;
    roundRect(ctx, g.shelfX0 - 12, g.shelfY, g.slotW * REAGENTS.length + 24, 12, 4);
    ctx.stroke();
    ctx.fillStyle = '#9a7442';
    for (let i = 0; i <= REAGENTS.length; i += 2) {
      const bx = g.shelfX0 + g.slotW * i;
      if (bx > g.shelfX0 - 6 && bx < g.shelfX0 + g.slotW * REAGENTS.length + 6) {
        roundRect(ctx, bx - 3, g.shelfY + 10, 6, 7, 2);
        ctx.fill();
      }
    }

    // hover / chip highlight halo
    if (hovered && (!s.drag || s.drag.id === hovered)) {
      const idx = REAGENTS.findIndex((r) => r.id === hovered);
      const def = REAGENTS[idx];
      const cx = g.shelfX0 + g.slotW * (idx + 0.5);
      const cy = g.shelfY - def.hh - 2;
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, def.hw + 26);
      glow.addColorStop(0, 'rgba(249,115,22,0.22)');
      glow.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - def.hw - 26, cy - def.hh - 26, (def.hw + 26) * 2, (def.hh + 26) * 2);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      roundRect(ctx, cx - def.hw - 7, cy - def.hh - 7, def.hw * 2 + 14, def.hh * 2 + 14, 9);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // items on the shelf (the dragged one is drawn at the pointer instead)
    for (let i = 0; i < REAGENTS.length; i += 1) {
      const def = REAGENTS[i];
      if (s.drag && s.drag.id === def.id) continue;
      const cx = g.shelfX0 + g.slotW * (i + 0.5);
      const cy = g.shelfY - def.hh - 2;
      drawReagentItem(ctx, def, cx, cy, 0, 1, hovered === def.id ? 1.08 : 1);
    }

    // dashed affordance from shelf to cup before the first pour (marching ants
    // keep the scene alive and point at the drag gesture)
    if (!s.runReagent && !s.drag && !s.auto && w > 520) {
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -((s.idle * 16) % 11);
      ctx.strokeStyle = 'rgba(232,99,42,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(g.cupX, g.shelfY + 14);
      ctx.quadraticCurveTo(g.cupX + 6, (g.shelfY + g.rimY) / 2, g.cupX, g.rimY - 26);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---------------- styrofoam cup ----------------
    const topR = g.cupW / 2;
    const botR = topR * 0.76;
    // body (tapered, soft cylindrical shading)
    const bodyG = ctx.createLinearGradient(g.cupX - topR, 0, g.cupX + topR, 0);
    bodyG.addColorStop(0, '#dfe3e8');
    bodyG.addColorStop(0.28, '#ffffff');
    bodyG.addColorStop(0.62, '#f4f6f8');
    bodyG.addColorStop(1, '#d7dce2');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(g.cupX - topR, g.rimY);
    ctx.lineTo(g.cupX - botR, g.rimY + g.cupH - 8);
    ctx.quadraticCurveTo(g.cupX - botR, g.rimY + g.cupH, g.cupX - botR + 8, g.rimY + g.cupH);
    ctx.lineTo(g.cupX + botR - 8, g.rimY + g.cupH);
    ctx.quadraticCurveTo(g.cupX + botR, g.rimY + g.cupH, g.cupX + botR, g.rimY + g.cupH - 8);
    ctx.lineTo(g.cupX + topR, g.rimY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c3ccd5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // seam + lower band (styrofoam texture)
    ctx.strokeStyle = 'rgba(195,204,213,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.cupX - topR * 0.9, g.rimY + g.cupH * 0.55);
    ctx.lineTo(g.cupX + topR * 0.9, g.rimY + g.cupH * 0.55);
    ctx.stroke();
    // soft shadow on the bench
    ctx.fillStyle = 'rgba(23,35,52,0.10)';
    ctx.beginPath();
    ctx.ellipse(g.cupX, g.rimY + g.cupH + 3, botR * 1.12, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // condensation bloom on the outside (endothermic runs)
    if (s.fog > 0.02) {
      for (const side of [-1, 1]) {
        const fx = g.cupX + side * topR * 0.55;
        const fy = g.rimY + g.cupH * 0.55;
        const bloom = ctx.createRadialGradient(fx, fy, 3, fx, fy, topR * 0.75);
        bloom.addColorStop(0, `rgba(255,255,255,${0.4 * s.fog})`);
        bloom.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(fx - topR * 0.75, fy - topR * 0.75, topR * 1.5, topR * 1.5);
      }
      ctx.fillStyle = `rgba(255,255,255,${0.75 * s.fog})`;
      const drops: [number, number][] = [[-0.42, 0.3], [-0.3, 0.52], [-0.12, 0.68], [0.2, 0.35], [0.38, 0.58], [0.3, 0.78]];
      for (const [dx, dy] of drops) {
        ctx.beginPath();
        ctx.arc(g.cupX + dx * topR, g.rimY + dy * g.cupH + s.fog * 5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(79,143,196,${0.3 * s.fog})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(g.cupX, g.rimY + g.cupH * 0.5, topR + 9, g.cupH * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // rim + interior
    ctx.fillStyle = '#fbfcfd';
    ctx.beginPath();
    ctx.ellipse(g.cupX, g.rimY, topR, topR * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c3ccd5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#2c3947';
    ctx.beginPath();
    ctx.ellipse(g.cupX, g.rimY + 1, topR - 4, (topR - 4) * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // liquid surface (clipped region for bubbles + foam)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(g.cupX, g.surfaceY, g.innerR, g.innerR * 0.3, 0, 0, Math.PI * 2);
    ctx.clip();
    const liqG = ctx.createLinearGradient(0, g.surfaceY - g.innerR * 0.3, 0, g.surfaceY + g.innerR * 0.3);
    liqG.addColorStop(0, '#c4dcee');
    liqG.addColorStop(1, '#a7cde6');
    ctx.fillStyle = liqG;
    ctx.fillRect(g.cupX - g.innerR, g.surfaceY - g.innerR * 0.3, g.innerR * 2, g.innerR * 0.62);
    // swirl streaks
    const swirlAmt = clamp(s.agitDisp * 0.8 + (s.runReagent && s.added - s.dissolved > 0.01 ? 0.35 : 0), 0, 1);
    if (swirlAmt > 0.05) {
      ctx.lineWidth = 2;
      for (let k = 0; k < 3; k += 1) {
        const a0 = s.swirl * 1.35 + k * 2.1;
        ctx.strokeStyle = `rgba(255,255,255,${0.28 + 0.3 * swirlAmt})`;
        ctx.beginPath();
        ctx.ellipse(g.cupX, g.surfaceY, g.innerR * 0.72, g.innerR * 0.22, 0, a0, a0 + 1.05);
        ctx.stroke();
      }
      if (s.agitDisp > 0.4) {
        ctx.fillStyle = 'rgba(23,35,52,0.16)';
        ctx.beginPath();
        ctx.ellipse(g.cupX, g.surfaceY, g.innerR * 0.3, g.innerR * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // rising bubbles
    for (const b of s.bubbles) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(b.x + Math.sin(b.wob) * 1.6, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // foam collar while fizzing
    if (s.foam > 0.03) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * s.foam})`;
      for (let k = 0; k < 9; k += 1) {
        const a = (k / 9) * Math.PI * 2 + s.idle * 0.4;
        const rr = g.innerR * 0.86;
        ctx.beginPath();
        ctx.arc(g.cupX + Math.cos(a) * rr, g.surfaceY + Math.sin(a) * rr * 0.3, 2 + (k % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // surface highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(g.cupX, g.surfaceY, g.innerR - 3, (g.innerR - 3) * 0.3, 0, Math.PI * 1.05, Math.PI * 1.75);
    ctx.stroke();
    // idle glints drifting across the surface — the scene never fully sleeps
    for (let k = 0; k < 2; k += 1) {
      const gx = g.cupX + Math.sin(s.idle * (0.42 + k * 0.19) + k * 2.6) * g.innerR * 0.52;
      const ga = 0.14 + 0.18 * (0.5 + 0.5 * Math.sin(s.idle * 1.3 + k * 2.1));
      ctx.strokeStyle = `rgba(255,255,255,${ga.toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(gx, g.surfaceY + 1, 8 - k * 3, 2.6, 0, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
    // ripples
    for (const rp of s.ripples) {
      ctx.strokeStyle = `rgba(214,235,248,${clamp(rp.a, 0, 1)})`;
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // heat shimmer above a hot cup
    if (s.thT > AMBIENT + 6) {
      const amt = clamp((s.thT - 28) / 16, 0, 0.55);
      ctx.strokeStyle = `rgba(232,99,42,${amt})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath();
        for (let px = -16; px <= 16; px += 6) {
          const yy = g.rimY - 12 - i * 12 + Math.sin(s.idle * 3 + px * 0.4 + i * 2) * 3;
          if (px === -16) ctx.moveTo(g.cupX + px, yy);
          else ctx.lineTo(g.cupX + px, yy);
        }
        ctx.stroke();
      }
    }

    // ---------------- thermometer ----------------
    const thx = g.cupX + g.cupW * 0.27;
    const thTop = g.rimY - 52;
    const bulbY = g.surfaceY + 12;
    ctx.fillStyle = '#f4f7fa';
    roundRect(ctx, thx - 4, thTop, 8, bulbY - thTop + 6, 4);
    ctx.fill();
    ctx.strokeStyle = '#9fb0bd';
    ctx.lineWidth = 1.25;
    roundRect(ctx, thx - 4, thTop, 8, bulbY - thTop + 6, 4);
    ctx.stroke();
    ctx.strokeStyle = '#b9c4cf';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const ty = thTop + 6 + (i / 5) * (bulbY - thTop - 12);
      ctx.beginPath();
      ctx.moveTo(thx - 4, ty);
      ctx.lineTo(thx - 1, ty);
      ctx.stroke();
    }
    const frac = clamp((s.thT - 0) / 45, 0.02, 1);
    const colTop = bulbY - 4 - frac * (bulbY - thTop - 16);
    ctx.fillStyle = '#e8443a';
    roundRect(ctx, thx - 1.75, colTop, 3.5, bulbY - 4 - colTop + 4, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(thx, bulbY + 2, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (s.recordable) {
      ctx.strokeStyle = 'rgba(232,68,58,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(thx, bulbY + 2, 8 + Math.sin(s.idle * 4) * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---------------- glass stirring rod ----------------
    const rodPivotX = g.cupX - g.cupW * 0.26;
    const rodPivotY = g.rimY - 48;
    const orbit = 0.24 + 0.5 * clamp(s.agitDisp, 0, 1);
    const rodBX = g.cupX - g.cupW * 0.14 + Math.cos(s.stirPhase) * g.innerR * orbit;
    const rodBY = g.surfaceY + 4 + Math.sin(s.stirPhase) * g.innerR * 0.22;
    if (s.agitDisp > 0.15) {
      ctx.strokeStyle = 'rgba(170,182,194,0.22)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(rodPivotX, rodPivotY);
      ctx.lineTo(g.cupX - g.cupW * 0.14 + Math.cos(s.stirPhase - 0.5) * g.innerR * orbit, g.surfaceY + 4 + Math.sin(s.stirPhase - 0.5) * g.innerR * 0.22);
      ctx.stroke();
    }
    ctx.strokeStyle = '#aab6c2';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(rodPivotX, rodPivotY);
    ctx.lineTo(rodBX, rodBY);
    ctx.stroke();
    ctx.fillStyle = '#5d6a79';
    ctx.beginPath();
    ctx.arc(rodPivotX, rodPivotY - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // ---------------- pouring item + stream ----------------
    if (s.drag) {
      const def = BY_ID[s.drag.id];
      const tiltTarget = s.pourActive ? -2.0 : 0.1;
      s.dragTilt += (tiltTarget - s.dragTilt) * 0.22;
      drawReagentItem(ctx, def, s.drag.x, s.drag.y - 18, s.dragTilt, 1, 1.05);
      if (s.pourActive && def.form === 'liquid' && (s.drag.id === 'water' ? s.waterAdded < 1 : s.added < 1)) {
        const mx = s.drag.x - def.hh * 0.9 + (def.shape === 'pair' ? (s.added < 0.5 ? -14 : 14) : 0);
        const my = s.drag.y - 18 + def.hh * 0.42;
        drawStream(ctx, mx, my, g.cupX + Math.sin(s.idle * 7) * 2, g.surfaceY);
      }
    } else if (s.auto) {
      const def = BY_ID[s.auto.id];
      const alpha = s.auto.t < 0.3 ? s.auto.t / 0.3 : s.auto.done ? clamp(1 - (s.auto.t - s.auto.doneAt) / 0.4, 0, 1) : 1;
      const bobY = g.rimY - 78 + Math.sin(s.idle * 2.2) * 2;
      drawReagentItem(ctx, def, g.cupX, bobY, s.pourActive ? -2.0 : -0.12, alpha, 1);
      if (s.pourActive && def.form === 'liquid' && (s.auto.id === 'water' ? s.waterAdded < 1 : s.added < 1)) {
        drawStream(ctx, g.cupX - def.hh * 0.9 + (def.shape === 'pair' ? (s.added < 0.5 ? -14 : 14) : 0), bobY + def.hh * 0.42, g.cupX + Math.sin(s.idle * 7) * 2, g.surfaceY);
      }
    }
    for (const gr of s.grains) {
      ctx.fillStyle = '#f7fafc';
      roundRect(ctx, gr.x - gr.r, gr.y - gr.r, gr.r * 2, gr.r * 2, 1.4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(155,176,189,0.8)';
      ctx.lineWidth = 0.8;
      roundRect(ctx, gr.x - gr.r, gr.y - gr.r, gr.r * 2, gr.r * 2, 1.4);
      ctx.stroke();
    }
  }, [geom, hovered]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (s.auto) { notePointer(false); return; }
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    const shelfId = hitShelf(px, py, g);
    if (shelfId) {
      s.drag = { id: shelfId, x: px, y: py };
      s.dragTilt = 0.1;
      s.refuseNoted = false;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.4);
      notePointer(true);
    } else if (inDrop(px, py, g)) {
      // grab the glass rod and stir by circling
      s.stirringNow = true;
      s.stirAngle = Math.atan2(py - g.surfaceY, px - g.cupX);
      s.stirTravel = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.glassClink(true);
      notePointer(true);
    } else {
      notePointer(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    const rect = canvas.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 8, (canvas.clientWidth || 800) - 8);
    const py = clamp(e.clientY - rect.top, 8, (canvas.clientHeight || 500) - 8);
    const g = geom();
    if (s.drag) {
      s.drag.x = px;
      s.drag.y = py;
      if (s.rt - s.slideAt > 0.16) {
        s.slideAt = s.rt;
        labSound.slide(0.35);
      }
      return;
    }
    if (s.stirringNow) {
      const ang = Math.atan2(py - g.surfaceY, px - g.cupX);
      const dA = shortestAngle(ang - s.stirAngle);
      s.stirAngle = ang;
      s.stirTravel += Math.abs(dA);
      s.handEnergy = clamp(s.handEnergy + Math.abs(dA) * 0.55, 0, 1);
      if (s.stirTravel >= Math.PI * 2) {
        s.stirTravel -= Math.PI * 2;
        if (s.rt - s.stirRevAt > 0.4) {
          s.stirRevAt = s.rt;
          labSound.glassClink(true);
        }
      }
      return;
    }
    const hoverId = hitShelf(px, py, g);
    if (hoverId !== hovered) setHovered(hoverId);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (s.drag) {
      const def = BY_ID[s.drag.id];
      const poured = s.drag.id === 'water' ? s.waterAdded : s.added;
      s.drag = null;
      s.dragTilt = 0;
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      if (poured > 0.02 && poured < 0.98) {
        // released mid-dose — the pour can be finished by dragging the same jar back
        pushToast('info', '⤓', `You let go early — only part of the ${def.short.toLowerCase()} dose is in. Drag the same jar back over the cup to finish the pour.`);
      }
      if (poured <= 0.02) notePointer(false);
      return;
    }
    if (s.stirringNow) {
      s.stirringNow = false;
      try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    }
  };

  // ---- controls -------------------------------------------------------------------
  const autoPour = () => {
    const s = sim.current;
    if (s.auto || s.drag) return;
    if (s.runReagent && s.runReagent !== assistId && assistId !== 'water') {
      labSound.warn();
      pushToast('info', '⤓', 'One reagent per cup — record this run (or pour a fresh cup) before starting another chemistry.');
      notePointer(false);
      return;
    }
    // the dose from this jar is already fully in the cup — nothing left to pour
    const doseAlreadyIn = assistId === 'water'
      ? s.waterAdded >= 0.999
      : s.runReagent === assistId && s.added >= 0.999;
    if (doseAlreadyIn) {
      labSound.tick();
      pushToast('info', '⤓', 'That dose is already in the cup — record the run, or pour a fresh cup first.');
      notePointer(false);
      return;
    }
    s.auto = { id: assistId, t: 0, done: false, doneAt: 0 };
    notePointer(true);
  };

  const freshCupNow = () => {
    const s = sim.current;
    freshCup(s);
    labSound.reset();
    syncUi();
    notePointer(true);
  };

  const recordRun = () => {
    const s = sim.current;
    if (!recordableNow(s) || !s.runReagent) return;
    const def = BY_ID[s.runReagent];
    const ext = extremeOf(s);
    const dT = ext.T - AMBIENT;
    const row: TrialRow = { id: rows.length + 1, reagentId: def.id, short: def.short, dT, choice: '' };
    archives.current.set(row.id, { samples: decimate(s.samples, 240), peakAt: ext.at });
    s.prevRuns.push({ samples: decimate(s.samples, 220) });
    if (s.prevRuns.length > 3) s.prevRuns.shift();
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded ${def.short}: ΔT = ${fmtDT(dT)} °C — fresh water poured for the next run.`);
    freshCup(s);
    syncUi();
    notePointer(true);
  };

  const classify = (rowId: number, choice: 'exo' | 'endo') => {
    const row = rows.find((r) => r.id === rowId);
    if (!row || row.choice === choice) return;
    setRows((cur) => cur.map((r) => (r.id === rowId ? { ...r, choice } : r)));
    const ok = (row.dT > 0) === (choice === 'exo');
    if (ok) {
      labSound.milestone();
      pushToast('good', '✓', choice === 'exo'
        ? 'Exothermic — correct. The thermometer rose, so the reaction gave heat out to the water.'
        : 'Endothermic — correct. The thermometer fell, so the reaction took heat in from the water.');
    } else {
      labSound.warn();
      setClassNote(true);
      pushToast('warn', '✗', 'Not this time — look at the sign of ΔT on that row. Which way did the thermometer move?');
    }
    notePointer(true);
  };

  const resetAll = () => {
    const s = sim.current;
    freshCup(s);
    s.prevRuns = [];
    s.acidNoteCount = 0;
    s.badgePeaked = 0;
    archives.current.clear();
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setBadges([]);
    setSawNaOH(false);
    setSawKNO3(false);
    setSawNeutral(false);
    setHovered(null);
    setAcidNote(null);
    setClassNote(false);
    syncUi();
  };

  // ---- Newton-cooling analysis (observations tab) ------------------------------------
  const cooling = useMemo(() => {
    const exoRows = [...rows].reverse().filter((r) => r.dT > 0);
    const last = exoRows[0];
    if (!last) return null;
    const arc = archives.current.get(last.id);
    if (!arc) return null;
    const tail = arc.samples.filter((p) => p.t > arc.peakAt + 1.5 && p.T > AMBIENT + 0.9).slice(0, 70);
    if (tail.length < 6) return { points: [], k: null, name: last.short };
    const stride = Math.ceil(tail.length / 24);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < tail.length; i += stride) {
      const p = tail[i];
      pts.push({ x: p.t, y: Math.log(p.T - AMBIENT) });
    }
    const fit = linearFit(pts);
    return { points: pts, k: fit.m < 0 ? -fit.m : null, name: last.short };
  }, [rows]);

  // ---- coach -------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (acidNote === 'wrong') {
      return { tone: 'warn', line: 'That was water into acid — the risky order. Nothing dramatic happens with this dilute cup, but concentrated acid can spit boiling droplets when water lands on it. The safe habit: always add acid to water.' };
    }
    if (acidNote === 'right') {
      return { tone: 'good', line: 'Good order — acid into water. With lots of water to absorb it, the dilution heat spreads safely. Keep that habit for every dilution you ever pour.' };
    }
    if (classNote) {
      return { tone: 'warn', line: 'Read the row again: ΔT is signed. A rise means heat left the reaction (exothermic); a fall means heat went in (endothermic).' };
    }
    if (ui.pouring) {
      return { tone: 'info', line: 'Keep holding — the pour continues while you hold over the cup. Let the jar empty fully, then release.' };
    }
    if (ui.dT !== 0 && !ui.recordable) {
      const dir = ui.direction === 'up' ? 'climbing' : ui.direction === 'down' ? 'falling' : 'settling';
      return { tone: 'info', line: `${ui.contents} is dissolving — the thermometer reads ${ui.thT.toFixed(1)} °C and ${dir}. Small circles over the cup stir it along.` };
    }
    if (ui.recordable) {
      return { tone: 'good', line: `Peak reached: ΔT = ${fmtDT(ui.dT)} °C. Record the run — the bench pours a fresh cup of water at 22.0 °C ready for the next one.` };
    }
    if (rows.length >= 5 && correctCount >= 5) {
      return { tone: 'good', line: 'Five runs classified — rising and falling traces on one chart. Try the acid–alkali pair if you have not, or watch a peak drift back toward 22 °C.' };
    }
    if (!sawNaOH) {
      return { tone: 'info', line: 'Fresh 100 mL of water at 22.0 °C. Drag the sodium hydroxide jar down from the shelf and hold it over the cup to pour.' };
    }
    return { tone: 'info', line: 'Fresh 100 mL at 22.0 °C. Drag any jar from the shelf and hold it over the cup — or make small circles over the cup to stir.' };
  }, [acidNote, classNote, ui, rows.length, correctCount, sawNaOH]);

  // ---- status ----------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : ui.pouring
      ? 'Pouring…'
      : ui.dT !== 0 && !ui.recordable
        ? ui.direction === 'up' ? 'Temperature rising' : 'Temperature falling'
        : ui.recordable
          ? 'Peak reached — record it'
          : 'Experiment ready';

  const cupClean = !ui.contents.startsWith('Fresh water') || ui.dissolved > 0 || ui.pouring;

  // ---- render -------------------------------------------------------------------------------
  const chartPrev: PrevTrace[] = ui.prev;
  const assistDef = BY_ID[assistId];

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.dT !== 0 ? 'active' : 'ready'}
      captionChip="Styrofoam-cup calorimetry"
      legend={[
        { color: '#e8443a', label: 'Thermometer' },
        { color: '#e8632a', label: 'Live trace' },
        { color: '#9aa4b1', label: 'Previous runs (faded)' },
        { color: '#ffffff', label: 'Styrofoam cup' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — 22.0 °C on the thermometer', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <label>Playback
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Playback speed">
            <option value={1}>1× real time</option>
            <option value={2}>2× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Calorimetry bench — drag a jar from the shelf and hold it over the cup to pour, or make small circles over the cup to stir"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); autoPour(); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="thermo-layout">
            <div className="thermo-shelf" data-nudge="shelf">
              <span className="thermo-shelf-kicker">REAGENT SHELF · DRAG ONE OVER THE CUP AND HOLD</span>
              <div className="thermo-chips">
                {REAGENTS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`thermo-chip${hovered === r.id ? ' hot' : ''}`}
                    onMouseEnter={() => setHovered(r.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(r.id)}
                    onBlur={() => setHovered(null)}
                    aria-label={`Highlight the ${r.name} on the shelf`}
                  >
                    <i style={{ background: r.color }} />
                    <span>{r.short}</span>
                  </button>
                ))}
              </div>
              <small>Cap colours match the jars on the shelf — hover a chip to find its jar. One chemistry per cup.</small>
            </div>
            <div className="thermo-actions">
              <div className="thermo-assist" data-nudge="pour">
                <label>POUR ASSIST
                  <select value={assistId} onChange={(e) => { setAssistId(e.target.value); labSound.tick(); }} aria-label="Reagent for the pour assist">
                    {REAGENTS.map((r) => (
                      <option key={r.id} value={r.id}>{r.short}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="action-button"
                  type="button"
                  onClick={() => autoPour()}
                  disabled={ui.pouring}
                >
                  <span className="dispense-icon" aria-hidden="true">⤓</span>
                  <span>{ui.pouring ? 'Pouring…' : `Pour ${assistDef.short}`}</span>
                  <small>or drag the jar over the cup yourself</small>
                </button>
              </div>
              <div className="thermo-stir" data-nudge="stir">
                <label>GLASS-ROD STIRRER
                  <select value={autoStir} onChange={(e) => { setAutoStir(Number(e.target.value)); labSound.tick(); }} aria-label="Stirring speed">
                    <option value={0}>Off — stir by hand</option>
                    <option value={0.45}>Gentle</option>
                    <option value={0.9}>Vigorous</option>
                  </select>
                </label>
                <small>Or make small circles with your pointer over the cup — stirring speeds the dissolving.</small>
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Heat given out warms the water (exothermic); heat taken in cools it (endothermic). One chemistry per cup, always add acid to water, and stir to speed the dissolving — the peak ΔT is what the table records.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRun(); }}
            disabled={!ui.recordable}
          >
            {ui.recordable ? `✎ Record ΔT = ${fmtDT(ui.dT)} °C — ${ui.contents}` : 'Record unlocks once the peak has passed'}
          </button>
          <button className="text-button thermo-fresh" type="button" data-nudge="fresh" onClick={freshCupNow} disabled={!cupClean}>
            Discard this run — pour a fresh cup ↺
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Cup thermometer</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Thermometer reading (in the cup)</span><strong>{ui.thT.toFixed(2)} <small>°C</small></strong>
            <div className="reading-track"><span style={{ width: `${clamp((ui.thT / 45) * 100, 0, 100)}%` }} /></div>
            <div className="reading-scale"><span>0 °C</span><span>45 °C</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Cup contents</span><strong>{ui.contents}</strong></div>
            <div><span>Run clock</span><strong>{fmtClock(ui.t)}</strong></div>
            <div><span>Peak ΔT this run</span><strong>{ui.dT !== 0 ? `${fmtDT(ui.dT)} °C` : '—'}</strong></div>
            <div><span>Direction</span><strong>{ui.direction === 'up' ? '▲ rising' : ui.direction === 'down' ? '▼ falling' : '— steady'}</strong></div>
            <div><span>Dissolved</span><strong>{ui.dissolved > 0 ? `${Math.round(ui.dissolved * 100)}%` : '—'}</strong></div>
            <div><span>Stirring</span><strong>{ui.agit > 0.65 ? 'Vigorous' : ui.agit > 0.15 ? 'Gentle' : 'Still'}</strong></div>
          </div>
          <TempChart live={ui.live} prev={chartPrev} peak={ui.peak} ambient={AMBIENT} />
          <div className="thermo-chart-cap">
            <span>LIVE TRACE · TEMPERATURE VS TIME</span>
            <span>{ui.prev.length} previous run{ui.prev.length === 1 ? '' : 's'} faded</span>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Check the starting temperature — a fresh cup of 100 mL water sits at 22.0 °C.</li>
              <li>Drag the sodium hydroxide jar over the cup and hold to pour the pellets; watch the thermometer climb.</li>
              <li>Record the run, then try potassium nitrate in the fresh cup — the trace falls and the cup fogs outside.</li>
              <li>Classify every row in the observations table: exothermic or endothermic, judged from the sign of ΔT.</li>
              <li>Try the acid–alkali pair (equal volumes, 1:1) and the fizzing citric-acid + hydrogencarbonate mix.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Stirring speeds the dissolving and keeps the thermometer honest — an unstirred cup stratifies and reads slowly. Wait for the peak before recording: Newton cooling starts dragging the temperature back toward 22 °C the moment the reagent finishes dissolving.</p></div>
            <div className="hint-box"><span>⚠</span><p><strong>Safety habit</strong>When diluting acid, always add the acid to the water — never water onto acid. This bench praises the safe order and gently warns on the risky one, so the habit sticks before anything is ever concentrated enough to bite.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Pour a reagent, wait for the peak, then record your first run. Each row asks you to classify it — the sign of ΔT is the clue.</p>
            ) : (
              <table className="trial-table thermo-table">
                <thead><tr><th>#</th><th>Reagent</th><th>Direction</th><th>ΔT (°C)</th><th>Classification</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const correct = r.choice !== '' && (r.dT > 0) === (r.choice === 'exo');
                    return (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td><i className="thermo-dot" style={{ background: BY_ID[r.reagentId].color }} />{r.short}</td>
                        <td className={r.dT > 0 ? 'thermo-up' : 'thermo-down'}>{r.dT > 0 ? '▲ rise' : '▼ fall'}</td>
                        <td>{fmtDT(r.dT)}</td>
                        <td>
                          <select
                            value={r.choice}
                            onChange={(e) => classify(r.id, e.target.value as 'exo' | 'endo')}
                            aria-label={`Classify the ${r.short} run`}
                          >
                            <option value="">— choose —</option>
                            <option value="exo">Exothermic</option>
                            <option value="endo">Endothermic</option>
                          </select>
                          {correct && <span className="thermo-ok" title="Correct"> ✓</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="observation-note">Each ΔT is the peak of the thermometer trace measured from the 22.0 °C starting line, one chemistry per cup. Correct classifications earn a tick — the sign of ΔT is the whole clue.</p>
            <h3 style={{ marginTop: 16 }}>Newton cooling check</h3>
            {cooling && cooling.points.length >= 6 ? (
              <>
                <Plot points={cooling.points} xLabel="t since run start (s)" yLabel="ln(T − 22 °C)" fitLine height={200} />
                <p className="observation-note">Cooling tail of your last exothermic run ({cooling.name}): after the peak, T − 22 °C decays exponentially, so its natural log falls on a straight line. Slope = −k → cooling constant k = {cooling.k ? cooling.k.toFixed(4) : '—'} s⁻¹, half-time ≈ {cooling.k ? (Math.LN2 / cooling.k).toFixed(0) : '—'} s. This bench runs k = {K_COOL} s⁻¹ — the same drift you can see live on the chart.</p>
              </>
            ) : (
              <p className="observation-note">Record an exothermic run and let it cool a little before recording — the tail of its trace turns into this ln(T − 22) straight-line check on Newton&apos;s law of cooling.</p>
            )}
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Every dissolving or reacting either releases energy to the surroundings or borrows it. In a styrofoam cup the only “surroundings” that matter are the 100 mL of water, so the thermometer reading is a direct vote on the reaction&apos;s enthalpy change:</p>
            <div className="equation">q = m · c · ΔT = 100 g × 4.18 J/g·K × ΔT</div>
            <p>A rise means heat left the chemicals — <strong>exothermic</strong>, ΔH negative. A fall means heat went the other way, into breaking the solid apart — <strong>endothermic</strong>, ΔH positive. Sodium hydroxide dissolving (about −44.5 kJ/mol) is strongly exothermic; potassium nitrate (+34.9 kJ/mol) and ammonium chloride (+14.8 kJ/mol) pull heat out of the water as they dissolve.</p>
            <p>Neutralisation of a strong acid with a strong alkali gives out about −57 kJ per mole of water formed, which is why the equal-volume HCl + NaOH mix climbs by roughly +11 °C here. The citric-acid + sodium hydrogencarbonate pairing is the memorable one: it fizzes CO₂ while absorbing heat, so bubbles and cooling arrive together.</p>
            <p>No cup is a perfect insulator. The trace always drifts back toward room temperature by Newton&apos;s law of cooling, T(t) = T<sub>room</sub> + (T<sub>0</sub> − T<sub>room</sub>)e<sup>−kt</sup>, which is why you record the <em>peak</em> ΔT and why an unstirred, slow-dissolving run loses more heat along the way than a well-stirred one.</p>
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

// ---------------------------------------------------------------- sidebar chart

/** Live temperature–time chart: current run strong, previous runs faded. */
function TempChart({ live, prev, peak, ambient, height = 168 }: {
  live: Pt[];
  prev: PrevTrace[];
  peak: { t: number; T: number } | null;
  ambient: number;
  height?: number;
}) {
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

      const pad = { l: 40, r: 30, t: 12, b: 26 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      let yMin = Math.min(ambient, ...live.map((p) => p.T));
      let yMax = Math.max(ambient, ...live.map((p) => p.T));
      for (const p of prev) {
        for (const q of p.samples) {
          yMin = Math.min(yMin, q.T);
          yMax = Math.max(yMax, q.T);
        }
      }
      if (peak) yMax = Math.max(yMax, peak.T);
      if (yMax - yMin < 8) { const mid = (yMax + yMin) / 2; yMin = mid - 4; yMax = mid + 4; }
      yMin -= 1.4;
      yMax += 1.4;
      const lastT = live.length ? live[live.length - 1].t : 0;
      const maxT = Math.max(60, lastT * 1.08);
      const tx = (t: number) => pad.l + (t / maxT) * iw;
      const ty = (T: number) => pad.t + ih - ((T - yMin) / (yMax - yMin)) * ih;

      // grid + ticks
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
        ctx.fillText((yMin + ((yMax - yMin) * i) / 4).toFixed(0), pad.l - 5, gy + 3);
      }

      // axes
      ctx.strokeStyle = '#c5cdd6';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();

      // ambient guide
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#b6c1cc';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, ty(ambient));
      ctx.lineTo(pad.l + iw, ty(ambient));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8b97a5';
      ctx.textAlign = 'left';
      ctx.fillText(`${ambient} °C`, pad.l + iw + 4, ty(ambient) + 3);

      // faded previous runs
      ctx.strokeStyle = 'rgba(154,164,177,0.5)';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      for (const p of prev) {
        if (p.samples.length < 2) continue;
        ctx.beginPath();
        p.samples.forEach((q, idx) => {
          const px = tx(q.t);
          const py = ty(q.T);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      // live trace
      if (live.length > 1) {
        ctx.strokeStyle = '#e8632a';
        ctx.lineWidth = 2.25;
        ctx.beginPath();
        live.forEach((q, idx) => {
          const px = tx(q.t);
          const py = ty(q.T);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        const last = live[live.length - 1];
        // peak marker
        if (peak) {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(tx(peak.t), ty(peak.T), 4.2, 0, Math.PI * 2);
          ctx.stroke();
        }
        // live dot
        ctx.fillStyle = '#e8632a';
        ctx.beginPath();
        ctx.arc(tx(last.t), ty(last.T), 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // axis labels
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('time (s)', pad.l + iw / 2, h - 3);
      ctx.save();
      ctx.translate(10, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('temperature (°C)', 0, 0);
      ctx.restore();
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [live, prev, peak, ambient, height]);

  return (
    <canvas
      ref={ref}
      className="lab-plot"
      style={{ width: '100%', height, marginTop: 12 }}
      aria-label="Live temperature versus time chart, previous runs faded"
    />
  );
}

// ---------------------------------------------------------------- scene drawing

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A falling pour stream from a tipped bottle mouth to the cup surface. */
function drawStream(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const mx = (x0 + x1) / 2 + 6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(169,207,232,0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, (y0 + y1) / 2, x1, y1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,243,250,0.95)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, (y0 + y1) / 2, x1, y1);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** One shelf item, centred on (x, y), rotated by tilt, at the given alpha/scale. */
function drawReagentItem(ctx: CanvasRenderingContext2D, def: ReagentDef, x: number, y: number, tilt: number, alpha: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  switch (def.shape) {
    case 'jar-squat': {
      // squat glass jar with white pellets
      ctx.fillStyle = 'rgba(233,241,246,0.95)';
      roundRect(ctx, -20, -18, 40, 36, 6);
      ctx.fill();
      ctx.strokeStyle = '#9fb0bd';
      ctx.lineWidth = 1.5;
      roundRect(ctx, -20, -18, 40, 36, 6);
      ctx.stroke();
      ctx.fillStyle = '#f7fafc';
      for (const [px, py] of [[-11, 8], [0, 11], [11, 8], [-5, 3]] as [number, number][]) {
        roundRect(ctx, px - 4, py - 3.5, 8, 7, 3);
        ctx.fill();
      }
      drawCap(ctx, def.color, 0, -22, 36, 9);
      break;
    }
    case 'jar-tall': {
      // tall jar with white crystals
      ctx.fillStyle = 'rgba(233,241,246,0.95)';
      roundRect(ctx, -16, -23, 32, 47, 6);
      ctx.fill();
      ctx.strokeStyle = '#9fb0bd';
      ctx.lineWidth = 1.5;
      roundRect(ctx, -16, -23, 32, 47, 6);
      ctx.stroke();
      ctx.fillStyle = '#f7fafc';
      for (const [px, py] of [[-8, 15], [2, 17], [9, 12], [-3, 9], [-10, 8]] as [number, number][]) {
        ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
      }
      drawCap(ctx, def.color, 0, -27, 28, 8);
      break;
    }
    case 'tin': {
      // squat tin with a mid band and fine powder
      const tinG = ctx.createLinearGradient(-18, 0, 18, 0);
      tinG.addColorStop(0, '#cfd6dd');
      tinG.addColorStop(0.3, '#f0f3f6');
      tinG.addColorStop(1, '#c2cad2');
      ctx.fillStyle = tinG;
      roundRect(ctx, -18, -19, 36, 40, 7);
      ctx.fill();
      ctx.strokeStyle = '#9aa7b2';
      ctx.lineWidth = 1.5;
      roundRect(ctx, -18, -19, 36, 40, 7);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(154,167,178,0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-17, 2);
      ctx.lineTo(17, 2);
      ctx.stroke();
      ctx.fillStyle = '#f7fafc';
      for (const [px, py] of [[-9, 13], [0, 15], [8, 12], [-3, 8]] as [number, number][]) {
        ctx.beginPath();
        ctx.arc(px, py, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      drawCap(ctx, def.color, 0, -23, 32, 8);
      break;
    }
    case 'bottle': {
      // slim amber acid bottle
      ctx.fillStyle = '#a8742a';
      roundRect(ctx, -12, -12, 24, 40, 6);
      ctx.fill();
      const amb = ctx.createLinearGradient(-12, 0, 12, 0);
      amb.addColorStop(0, 'rgba(66,44,12,0.55)');
      amb.addColorStop(0.35, 'rgba(255,255,255,0)');
      amb.addColorStop(1, 'rgba(66,44,12,0.4)');
      ctx.fillStyle = amb;
      roundRect(ctx, -12, -12, 24, 40, 6);
      ctx.fill();
      ctx.strokeStyle = '#6e4c17';
      ctx.lineWidth = 1.5;
      roundRect(ctx, -12, -12, 24, 40, 6);
      ctx.stroke();
      ctx.fillStyle = '#c8913b';
      roundRect(ctx, -5, -22, 10, 11, 3);
      ctx.fill();
      ctx.strokeStyle = '#6e4c17';
      roundRect(ctx, -5, -22, 10, 11, 3);
      ctx.stroke();
      ctx.fillStyle = def.color;
      roundRect(ctx, -7, -28, 14, 8, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110,76,23,0.7)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-9, -4 + i * 5);
        ctx.lineTo(9, -4 + i * 5);
        ctx.stroke();
      }
      break;
    }
    case 'pot': {
      // dual-chamber pot: citric acid + hydrogencarbonate
      ctx.fillStyle = 'rgba(238,243,248,0.95)';
      roundRect(ctx, -23, -10, 46, 25, 7);
      ctx.fill();
      ctx.strokeStyle = '#9fb0bd';
      ctx.lineWidth = 1.5;
      roundRect(ctx, -23, -10, 46, 25, 7);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(159,176,189,0.8)';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 13);
      ctx.stroke();
      ctx.fillStyle = '#f7fafc';
      ctx.beginPath();
      ctx.ellipse(-11.5, 5, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(11.5, 5, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e9edf1';
      ctx.beginPath();
      ctx.ellipse(11.5, 5, 6, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      drawCap(ctx, def.color, 0, -13.5, 44, 7);
      break;
    }
    case 'pair': {
      // small rack holding two vials — acid (straw) and alkali (pale blue)
      ctx.fillStyle = '#b08d5c';
      roundRect(ctx, -27, 12, 54, 9, 3);
      ctx.fill();
      ctx.strokeStyle = '#8a6420';
      ctx.lineWidth = 1.2;
      roundRect(ctx, -27, 12, 54, 9, 3);
      ctx.stroke();
      ctx.fillStyle = '#c9a570';
      roundRect(ctx, -27, -20, 54, 7, 3);
      ctx.fill();
      ctx.strokeStyle = '#8a6420';
      roundRect(ctx, -27, -20, 54, 7, 3);
      ctx.stroke();
      drawVial(ctx, -14, def.color, '#e9edc8');
      drawVial(ctx, 14, def.color, '#cfe4ee');
      break;
    }
    default: {
      // wash bottle: rounded body + angled spout
      ctx.fillStyle = 'rgba(214,233,244,0.95)';
      roundRect(ctx, -14, -14, 28, 36, 9);
      ctx.fill();
      ctx.strokeStyle = '#9fb0bd';
      ctx.lineWidth = 1.5;
      roundRect(ctx, -14, -14, 28, 36, 9);
      ctx.stroke();
      ctx.fillStyle = 'rgba(169,207,232,0.8)';
      roundRect(ctx, -9, -6, 18, 24, 6);
      ctx.fill();
      ctx.strokeStyle = '#aab6c2';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-6, -14);
      ctx.quadraticCurveTo(-14, -24, -19, -26);
      ctx.stroke();
      ctx.fillStyle = def.color;
      roundRect(ctx, -5, -20, 10, 8, 3);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawCap(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, w: number, h: number) {
  // a lid sitting on top of a jar / tin / pot, centred at cx with a top highlight
  const capG = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  capG.addColorStop(0, '#ffffff');
  capG.addColorStop(0.35, color);
  capG.addColorStop(1, color);
  ctx.fillStyle = capG;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,35,52,0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 3);
  ctx.stroke();
}

function drawVial(ctx: CanvasRenderingContext2D, x: number, capColor: string, liquid: string) {
  ctx.fillStyle = 'rgba(240,246,250,0.95)';
  roundRect(ctx, x - 7, -19, 14, 30, 4);
  ctx.fill();
  ctx.strokeStyle = '#9fb0bd';
  ctx.lineWidth = 1.25;
  roundRect(ctx, x - 7, -19, 14, 30, 4);
  ctx.stroke();
  ctx.fillStyle = liquid;
  roundRect(ctx, x - 5, -6, 10, 15, 3);
  ctx.fill();
  ctx.fillStyle = capColor;
  roundRect(ctx, x - 5, -23, 10, 6, 2.5);
  ctx.fill();
}
