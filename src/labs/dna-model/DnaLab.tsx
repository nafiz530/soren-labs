import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp, lerp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './dna-model.css';

/**
 * DNA double helix — Soren Labs Biology, Experiment 036 (Master tier).
 *
 * A rotating 3D-illusion double helix on the 2D canvas: two sugar-phosphate
 * backbones as gently twisting brass ribbons, base-pair rungs between them.
 *
 * BUILD: the student drags colour-coded nucleotides (A green, T red, G orange,
 * C blue) from the bench tray to extend the ladder. One side of each rung is
 * fixed with a random base; the student must carry the complementary partner
 * to the opposite side. Wrong pairs (A–G, T–C, A–A…) are refused honestly,
 * with the base-pairing rule spelled out — and the honest hydrogen-bond count
 * is drawn as 2 or 3 little dashes between every paired couple.
 *
 * UNZIP: a helicase blob travels down the finished helix, popping the
 * hydrogen-bond dashes apart rung by rung while the two old strands peel away
 * intact.
 *
 * REPLICATE: complementary nucleotides are added to BOTH templates (by hand or
 * with the auto-demo). New strands are drawn in teal so the semi-conservative
 * result is visible: each daughter molecule = one old strand + one new strand.
 *
 * The Observations tab computes Chargaff percentages from the student's own
 * built sequence, and a multi-part conclusion unlocks the final milestone.
 */

// ---------------------------------------------------------------- constants

const RUNGS = 12;
/** One full helix turn every 10 rungs — 12 rungs ≈ 1.2 turns. */
const TWIST = (Math.PI * 2) / 10;
/** Idle auto-rotation, rad/s — the helix never stands still. */
const AUTO_ROT = 0.22;
/** Helicase travel time at 1× speed. */
const UNZIP_SECONDS = 10;
/** Auto-demo places one nucleotide every this many seconds at 1×. */
const AUTOFILL_SECONDS = 0.85;

type Base = 'A' | 'T' | 'G' | 'C';
type Phase = 'build' | 'unzipping' | 'open' | 'done';
type StrandKind = 'oldL' | 'oldR' | 'newA' | 'newB';
type DragKind = 'none' | 'rotate' | 'nuc';

const BASES: Base[] = ['A', 'T', 'G', 'C'];

const BASE_COLORS: Record<Base, string> = {
  A: '#3fae6a',
  T: '#e05555',
  G: '#f0932b',
  C: '#4a7fd6',
};

/** Lighter tints for newly synthesised strands (teal ring marks them new). */
const BASE_LIGHT: Record<Base, string> = {
  A: '#a4dcb9',
  T: '#f4b3b3',
  G: '#f8caa0',
  C: '#b3cbef',
};

const COMPLEMENT: Record<Base, Base> = { A: 'T', T: 'A', G: 'C', C: 'G' };
const BONDS: Record<Base, number> = { A: 2, T: 2, G: 3, C: 3 };

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'tray',
    title: 'Meet the tray and the ladder',
    detail: 'The tray below the bench holds free nucleotides — A, T, G and C, each with its own colour and shape. Drag one up to the empty slot beside the fixed base on the ladder.',
    hint: 'Purines (A, G) are the larger shapes; pyrimidines (T, C) are smaller. Colour is the fastest key.',
  },
  {
    id: 'first-pair',
    title: 'Pair your first bases',
    detail: 'A pairs only with T through two hydrogen bonds; G pairs only with C through three. Carry the matching partner to the pulsing slot — mismatched pairs are refused, honestly.',
    hint: 'Count the little dashes between a finished pair: two for A–T, three for G–C.',
  },
  {
    id: 'full-helix',
    title: 'Complete the twelve-rung helix',
    detail: 'Keep pairing until all twelve rungs click in. The backbone ribbons twist into a double helix as it grows — drag the helix sideways any time to rotate it.',
    hint: 'The fixed side alternates rung by rung, so read the given base carefully each time.',
  },
  {
    id: 'unzip',
    title: 'Unzip with helicase',
    detail: 'Helicase is the molecular motor that wedges the rungs apart. Send it down your helix and watch every hydrogen-bond dash pop, one rung at a time.',
  },
  {
    id: 'replicate',
    title: 'Fill both templates',
    detail: 'Each old strand now stands alone as a template. Feed complementary nucleotides to both — new strands are drawn in teal so you can tell old from new at a glance.',
    hint: 'Auto-fill demonstrates the process; your own drags count exactly the same.',
  },
  {
    id: 'data',
    title: 'Read your Chargaff data',
    detail: 'Open Observations: the percentages from your own molecule show A matching T and G matching C exactly. Then answer the conclusion to finish the experiment.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'first-pair', title: 'First correct pair', icon: '✦', detail: 'Snapped in a correct A–T or G–C partnership.' },
  { id: 'full-helix', title: 'Twelve honest rungs', icon: '🧬', detail: 'Completed the whole helix with every pair obeying the rules.' },
  { id: 'unzip-witnessed', title: 'Unzip witnessed', icon: '⇅', detail: 'Watched helicase break every hydrogen bond in the model.' },
  { id: 'replicated', title: 'Semi-conservative', icon: '❖', detail: 'Filled both daughter molecules — one old strand plus one new each.' },
  { id: 'chargaff-checker', title: 'Chargaff checker', icon: '✓', detail: 'Answered the base-pairing and semi-conservation conclusion correctly.' },
];

// ----------------------------------------------------------------- helpers

const meta = getLabBySlug('dna-model')!;

const fract = (v: number) => v - Math.floor(v);

/** The side that receives the given (fixed) base for rung i — it alternates. */
function givenSide(i: number): 'left' | 'right' {
  return i % 2 === 0 ? 'left' : 'right';
}

/** Left-strand base of rung i for the molecule built from sequence `seq`. */
function leftBase(seq: Base[], i: number): Base {
  return givenSide(i) === 'left' ? seq[i] : COMPLEMENT[seq[i]];
}

/** Right-strand base of rung i (always the complement of the left base). */
function rightBase(seq: Base[], i: number): Base {
  return givenSide(i) === 'left' ? COMPLEMENT[seq[i]] : seq[i];
}

/** Random sequence of n bases, patched so every base appears at least twice. */
function makeSequence(n: number): Base[] {
  const seq: Base[] = Array.from({ length: n }, () => BASES[(Math.random() * 4) | 0]);
  for (let guard = 0; guard < 40; guard += 1) {
    const counts = BASES.map((b) => seq.filter((x) => x === b).length);
    const poor = counts.findIndex((c) => c < 2);
    if (poor < 0) break;
    const rich = counts.findIndex((c) => c > 3);
    if (rich < 0) break;
    const idx = seq.findIndex((x) => x === BASES[rich]);
    if (idx >= 0) seq[idx] = BASES[poor];
  }
  return seq;
}

/** Total hydrogen bonds across the completed rungs. */
function totalBonds(seq: Base[], rungs: number): number {
  let sum = 0;
  for (let i = 0; i < rungs; i += 1) sum += BONDS[leftBase(seq, i)];
  return sum;
}

interface Geom {
  w: number;
  h: number;
  trayH: number;
  areaTop: number;
  areaBottom: number;
  areaH: number;
  spacing: number;
  topY: number;
  amp: number;
  ampOpen: number;
  cx0: number;
  cx1: number;
  cx2: number;
  trayY: number;
  stations: { base: Base; x: number; y: number }[];
  zx: number;
  zy: number;
}

interface Pt {
  x: number;
  y: number;
  z: number;
  u: number;
}

interface BaseItem {
  x: number;
  y: number;
  z: number;
  base: Base;
  isNew: boolean;
}

interface Target {
  x: number;
  y: number;
  mol: 'pending' | 'A' | 'B';
  idx: number;
}

/** Separation of rung u, interpolated between integer rung positions. */
function sepAt(sep: number[], u: number): number {
  if (u <= 0) return sep[0];
  if (u >= RUNGS - 1) return sep[RUNGS - 1];
  const i = Math.floor(u);
  const f = u - i;
  return sep[i] * (1 - f) + sep[Math.min(RUNGS - 1, i + 1)] * f;
}

/**
 * Position of a strand node at fractional rung index u. Depth z (cos of the
 * twist angle) drives the 3D illusion: z > 0 is toward the viewer. As a rung
 * unzips (sep → 1) the two old strands drift apart toward their own daughter
 * centres, which is exactly how the single molecule becomes two.
 */
function strandPoint(g: Geom, sep: number[], rot: number, kind: StrandKind, u: number): Pt {
  const phi = rot + u * TWIST;
  const sp = sepAt(sep, u);
  const ampI = lerp(g.amp, g.ampOpen, sp);
  const sinP = Math.sin(phi);
  const cosP = Math.cos(phi);
  const y = g.topY + u * g.spacing;
  switch (kind) {
    case 'oldL':
      return { x: lerp(g.cx0, g.cx1, sp) - sinP * ampI, y, z: -cosP, u };
    case 'oldR':
      return { x: lerp(g.cx0, g.cx2, sp) + sinP * ampI, y, z: cosP, u };
    case 'newA':
      return { x: lerp(g.cx0, g.cx1, sp) + sinP * ampI, y, z: cosP, u };
    case 'newB':
    default:
      return { x: lerp(g.cx0, g.cx2, sp) - sinP * ampI, y, z: -cosP, u };
  }
}

/** Sample a strand ribbon between two fractional rung indices. */
function sampleStrand(g: Geom, sep: number[], rot: number, kind: StrandKind, u0: number, u1: number): Pt[] {
  const pts: Pt[] = [];
  const step = 0.12;
  for (let u = u0; u < u1; u += step) pts.push(strandPoint(g, sep, rot, kind, u));
  pts.push(strandPoint(g, sep, rot, kind, u1));
  return pts;
}

/** Contiguous [start, end] index ranges where a new strand is filled. */
function filledRanges(fill: (Base | null)[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < fill.length; i += 1) {
    const v = fill[i];
    if (v && start < 0) start = i;
    if ((!v || i === fill.length - 1) && start >= 0) {
      const end = v ? i : i - 1;
      ranges.push([Math.max(-0.3, start - 0.28), Math.min(RUNGS - 1 + 0.3, end + 0.28)]);
      start = -1;
    }
  }
  return ranges;
}

/** Where a dragged nucleotide may be dropped right now. */
function findTargets(g: Geom, phase: Phase, rungs: number, sep: number[], fillA: (Base | null)[], fillB: (Base | null)[], rot: number): Target[] {
  const out: Target[] = [];
  if (phase === 'build' && rungs < RUNGS) {
    const side = givenSide(rungs);
    const p = strandPoint(g, sep, rot, side === 'left' ? 'oldR' : 'oldL', rungs);
    out.push({ x: p.x, y: p.y, mol: 'pending', idx: rungs });
  } else if (phase === 'open' || phase === 'done') {
    for (let i = 0; i < RUNGS; i += 1) {
      if (sep[i] > 0.75) {
        if (!fillA[i]) {
          const p = strandPoint(g, sep, rot, 'newA', i);
          out.push({ x: p.x, y: p.y, mol: 'A', idx: i });
        }
        if (!fillB[i]) {
          const p = strandPoint(g, sep, rot, 'newB', i);
          out.push({ x: p.x, y: p.y, mol: 'B', idx: i });
        }
      }
    }
  }
  return out;
}

/** Pointer screen point → helix logical coordinates (undo the zoom transform). */
function toHelix(g: Geom, zoom: number, px: number, py: number): { x: number; y: number } {
  return { x: g.zx + (px - g.zx) / zoom, y: g.zy + (py - g.zy) / zoom };
}

/** Helix logical coordinates → pointer screen coordinates. */
function fromHelix(g: Geom, zoom: number, x: number, y: number): { x: number; y: number } {
  return { x: g.zx + (x - g.zx) * zoom, y: g.zy + (y - g.zy) * zoom };
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k += 1) {
    const a = (Math.PI / 3) * k - Math.PI / 6;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Draw one nucleotide as a colour-coded shape. Purines (A, G) are larger
 * double-marked shapes; pyrimidines (T, C) are smaller. New-strand bases get
 * the pale tint plus a teal ring. No text — identity is colour + shape.
 */
function drawBaseShape(ctx: CanvasRenderingContext2D, x: number, y: number, base: Base, scale: number, isNew: boolean, alpha: number) {
  const purine = base === 'A' || base === 'G';
  const r = (purine ? 9.5 : 7.4) * scale;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = isNew ? BASE_LIGHT[base] : BASE_COLORS[base];
  ctx.strokeStyle = isNew ? '#2f8f87' : 'rgba(23,35,52,0.5)';
  ctx.lineWidth = 1.6;
  if (base === 'A' || base === 'T') {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (purine) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    hexPath(ctx, x, y, r);
    ctx.fill();
    ctx.stroke();
    if (purine) {
      hexPath(ctx, x, y, r * 0.5);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.36, Math.max(1, r * 0.2), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------- state

interface UiSnap {
  phase: Phase;
  rungs: number;
  left: string;
  right: string;
  hasPending: boolean;
  pendingBase: Base;
  pendingSide: 'left' | 'right';
  unzip: number;
  fillA: string;
  fillB: string;
  hover: string | null;
  bonds: number;
  zoom: number;
}

interface SimState {
  phase: Phase;
  seq: Base[];
  rungs: number;
  rot: number;
  rotVel: number;
  zoom: number;
  time: number;
  helicaseActive: boolean;
  helicaseT: number;
  helicaseFade: number;
  broken: number;
  sep: number[];
  sepTarget: number[];
  popFlash: number[];
  fillA: (Base | null)[];
  fillB: (Base | null)[];
  autoFill: boolean;
  autoTimer: number;
  autoSide: 'A' | 'B';
  aPingDone: boolean;
  bPingDone: boolean;
  drag: { kind: DragKind; base: Base | null; x: number; y: number; lastX: number; creakAt: number };
  hover: string | null;
  hoverPos: { x: number; y: number } | null;
  wrongFlash: number;
  wrongAt: { x: number; y: number };
  uiAcc: number;
}

// ---------------------------------------------------------------- component

export default function DnaLab() {
  // ---- simulation state (refs — the canvas loop owns the animation) -------
  const sim = useRef<SimState>({
    phase: 'build',
    seq: makeSequence(RUNGS),
    rungs: 0,
    rot: 0.7,
    rotVel: 0,
    zoom: 1,
    time: 0,
    helicaseActive: false,
    helicaseT: 0,
    helicaseFade: 0,
    broken: 0,
    sep: new Array<number>(RUNGS).fill(0),
    sepTarget: new Array<number>(RUNGS).fill(0),
    popFlash: new Array<number>(RUNGS).fill(0),
    fillA: new Array<Base | null>(RUNGS).fill(null),
    fillB: new Array<Base | null>(RUNGS).fill(null),
    autoFill: false,
    autoTimer: 0,
    autoSide: 'A',
    aPingDone: false,
    bPingDone: false,
    drag: { kind: 'none', base: null, x: 0, y: 0, lastX: 0, creakAt: 0 },
    hover: null,
    hoverPos: null,
    wrongFlash: 0,
    wrongAt: { x: 0, y: 0 },
    uiAcc: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const earnedRef = useRef<string[]>([]);

  // ---- student controls ----------------------------------------------------
  const [speed, setSpeed] = useState(1);
  const [autoFill, setAutoFill] = useState(false);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [conclusion, setConclusion] = useState({ q1: '', q2: '', text: '' });
  const [conclusionOk, setConclusionOk] = useState(false);
  const [conclusionFeedback, setConclusionFeedback] = useState<string | null>(null);
  const [sawObservations, setSawObservations] = useState(false);
  const [ui, setUi] = useState<UiSnap>({
    phase: 'build',
    rungs: 0,
    left: '',
    right: '',
    hasPending: true,
    pendingBase: 'A',
    pendingSide: 'left',
    unzip: 0,
    fillA: '.'.repeat(RUNGS),
    fillB: '.'.repeat(RUNGS),
    hover: null,
    bonds: 0,
    zoom: 1,
  });

  const earn = useCallback((id: string) => {
    if (earnedRef.current.includes(id)) return;
    earnedRef.current = [...earnedRef.current, id];
    const b = BADGES.find((x) => x.id === id);
    if (b) setToast({ tone: 'good', icon: b.icon, msg: `Badge earned — ${b.title}` });
    labSound.badge();
    setBadges(earnedRef.current);
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
    let left = '';
    let right = '';
    for (let i = 0; i < s.rungs; i += 1) {
      left += leftBase(s.seq, i);
      right += rightBase(s.seq, i);
    }
    const hasPending = s.phase === 'build' && s.rungs < RUNGS;
    setUi({
      phase: s.phase,
      rungs: s.rungs,
      left,
      right,
      hasPending,
      pendingBase: hasPending ? s.seq[s.rungs] : 'A',
      pendingSide: hasPending ? givenSide(s.rungs) : 'left',
      unzip: s.helicaseT,
      fillA: s.fillA.map((v) => v ?? '.').join(''),
      fillB: s.fillB.map((v) => v ?? '.').join(''),
      hover: s.hover,
      bonds: totalBonds(s.seq, s.rungs),
      zoom: s.zoom,
    });
  }, []);

  // ---- mentor completion flags ----------------------------------------------
  const done = [
    mentorAcked || ui.rungs > 0,
    ui.rungs >= 1,
    ui.rungs >= RUNGS,
    badges.includes('unzip-witnessed'),
    ui.phase === 'done',
    conclusionOk,
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
      case 'tray':
        return { target: 'scene', gesture: 'drag', title: 'Drag a nucleotide', body: 'Pick up a nucleotide from the tray below and carry it to the empty slot beside the fixed base.' };
      case 'first-pair':
        return { target: 'scene', gesture: 'drag', title: 'Pair your first bases', body: 'A pairs with T, G pairs with C — carry the matching partner to the pulsing slot.' };
      case 'full-helix':
        return { target: 'scene', gesture: 'drag', title: 'Keep pairing', body: 'More rungs to go — the helix twists as it grows. Drag the helix sideways to rotate it.' };
      case 'unzip':
        return { target: 'unzip', gesture: 'press', title: 'Unzip with helicase', body: 'Press Unzip — the helicase blob travels down the helix and pops the hydrogen bonds apart.' };
      case 'replicate':
        return { target: 'scene', gesture: 'drag', title: 'Feed the templates', body: 'Drag complementary nucleotides to the dashed slots on both templates — or switch on Auto-fill.' };
      case 'data':
        return { target: 'observations', gesture: 'tap', title: 'Read your Chargaff data', body: 'Open Observations — your own percentages and the conclusion card are waiting.' };
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- actions ------------------------------------------------------------------
  const refusePair = useCallback((note: string) => {
    const s = sim.current;
    s.wrongFlash = 0.55;
    if (s.drag.kind === 'nuc') s.wrongAt = { x: s.drag.x, y: s.drag.y };
    labSound.warn();
    setRefusal(note);
    window.setTimeout(() => setRefusal(null), 5200);
    notePointer(false);
  }, [notePointer]);

  const placePartner = useCallback((base: Base): boolean => {
    const s = sim.current;
    if (s.phase !== 'build' || s.rungs >= RUNGS) return false;
    const given = s.seq[s.rungs];
    const need = COMPLEMENT[given];
    if (base !== need) {
      refusePair(`${base}–${given} is not a base pair: ${given} bonds only with ${need}, through ${BONDS[need]} hydrogen bonds.`);
      return false;
    }
    s.rungs += 1;
    s.rotVel += 1.1; // the helix gives a satisfying twist kick as it grows
    labSound.thunk(true);
    labSound.ping(BONDS[need] === 2 ? 520 : 660, 0.08);
    if (s.rungs === 1) earn('first-pair');
    if (s.rungs >= RUNGS) {
      labSound.milestone();
      earn('full-helix');
      pushToast('good', '🧬', 'Twelve rungs — your double helix is complete. Now unzip it.');
    }
    syncUi();
    return true;
  }, [refusePair, earn, pushToast, syncUi]);

  const fillNext = useCallback((side: 'A' | 'B'): boolean => {
    const s = sim.current;
    if (s.phase !== 'open') return false;
    const arr = side === 'A' ? s.fillA : s.fillB;
    const idx = arr.findIndex((v) => v === null);
    if (idx < 0) return false;
    // The new strand copies the ORIGINAL partner of this template rung —
    // semi-conservative replication duplicates exactly the built bases.
    arr[idx] = side === 'A' ? rightBase(s.seq, idx) : leftBase(s.seq, idx);
    return true;
  }, []);

  const checkReplication = useCallback(() => {
    const s = sim.current;
    if (s.phase !== 'open') return;
    const aDone = s.fillA.every((v) => v !== null);
    const bDone = s.fillB.every((v) => v !== null);
    if (aDone && !s.aPingDone) {
      s.aPingDone = true;
      labSound.ping(660, 0.09);
    }
    if (bDone && !s.bPingDone) {
      s.bPingDone = true;
      labSound.ping(760, 0.09);
    }
    if (aDone && bDone) {
      s.phase = 'done';
      s.autoFill = false;
      setAutoFill(false);
      labSound.milestone();
      earn('replicated');
      pushToast('good', '❖', 'Replication complete — each daughter molecule is one old strand plus one new.');
      syncUi();
    }
  }, [earn, pushToast, syncUi]);

  const startUnzip = useCallback(() => {
    const s = sim.current;
    if (s.phase !== 'build' || s.rungs < RUNGS || s.helicaseActive) return;
    s.phase = 'unzipping';
    s.helicaseActive = true;
    s.helicaseT = 0;
    s.helicaseFade = 0;
    s.broken = 0;
    s.autoTimer = 0;
    labSound.click();
    labSound.startLoop('hum');
    syncUi();
  }, [syncUi]);

  const toggleAutoFill = useCallback(() => {
    const s = sim.current;
    if (s.phase !== 'open') return;
    const next = !s.autoFill;
    s.autoFill = next;
    s.autoTimer = 0;
    setAutoFill(next);
    labSound.click();
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const s = sim.current;
    s.zoom = clamp(s.zoom * factor, 0.6, 1.8);
    labSound.tick();
    syncUi();
  }, [syncUi]);

  /** Keyboard / button duplicate of the main gesture. */
  const primaryAction = useCallback(() => {
    const s = sim.current;
    if (s.phase === 'build') {
      if (s.rungs >= RUNGS) {
        startUnzip();
        notePointer(true);
        return;
      }
      const need = COMPLEMENT[s.seq[s.rungs]];
      if (placePartner(need)) notePointer(true);
      return;
    }
    if (s.phase === 'open') {
      if (!fillNext(s.autoSide)) fillNext(s.autoSide === 'A' ? 'B' : 'A');
      s.autoSide = s.autoSide === 'A' ? 'B' : 'A';
      labSound.click();
      checkReplication();
      syncUi();
      notePointer(true);
      return;
    }
    if (s.phase === 'done') {
      labSound.ping(880, 0.07);
      pushToast('info', '✦', 'Model complete — open Observations to read your Chargaff data and answer the conclusion.');
      return;
    }
    labSound.tick();
  }, [startUnzip, placePartner, fillNext, checkReplication, syncUi, notePointer, pushToast]);

  // ---- animation step -----------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.time += dt;

    // Idle auto-rotation (paused while a hand is on the model so drop targets
    // stay still), plus the twist-kick impulse decay.
    if (s.drag.kind === 'none') s.rot += AUTO_ROT * dt;
    s.rotVel *= Math.exp(-2.5 * dt);
    s.rot += s.rotVel * dt;

    // Helicase travel: rungs break as the fork reaches them.
    if (s.helicaseActive) {
      s.helicaseT = Math.min(1, s.helicaseT + (dt * speed) / UNZIP_SECONDS);
      const forkU = s.helicaseT * (RUNGS - 1) + 0.3;
      while (s.broken < RUNGS && s.broken <= forkU) {
        const i = s.broken;
        s.broken += 1;
        s.sepTarget[i] = 1;
        s.popFlash[i] = 1;
        labSound.drip(true); // the little pop of a hydrogen bond breaking
        if (i % 3 === 2) labSound.ping(540 + i * 34, 0.05);
      }
      if (s.helicaseT >= 1) {
        s.helicaseActive = false;
        s.helicaseFade = 1;
        s.phase = 'open';
        labSound.stopLoop();
        labSound.thunk(false);
        earn('unzip-witnessed');
        pushToast('good', '⇅', 'Unzipped — two template strands. Feed each one complementary nucleotides.');
        syncUi();
      }
    } else if (s.helicaseFade > 0) {
      s.helicaseFade = Math.max(0, s.helicaseFade - dt * 0.8);
    }

    // Strand separation easing + bond-pop flash decay.
    for (let i = 0; i < RUNGS; i += 1) {
      if (s.sep[i] < s.sepTarget[i]) s.sep[i] = Math.min(s.sepTarget[i], s.sep[i] + dt * 1.5);
      if (s.popFlash[i] > 0) s.popFlash[i] = Math.max(0, s.popFlash[i] - dt * 1.7);
    }

    // Auto-demo replication fill.
    if (s.phase === 'open' && s.autoFill) {
      s.autoTimer += dt * speed;
      if (s.autoTimer >= AUTOFILL_SECONDS) {
        s.autoTimer = 0;
        if (!fillNext(s.autoSide)) fillNext(s.autoSide === 'A' ? 'B' : 'A');
        s.autoSide = s.autoSide === 'A' ? 'B' : 'A';
        labSound.click();
        checkReplication();
      }
    }

    if (s.wrongFlash > 0) s.wrongFlash = Math.max(0, s.wrongFlash - dt);

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, fillNext, checkReplication, earn, pushToast, syncUi]);

  // ---- geometry ---------------------------------------------------------------
  const geom = useCallback((): Geom => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const trayH = clamp(h * 0.21, 88, 132);
    const areaTop = 16;
    const areaBottom = h - trayH - 30;
    const areaH = Math.max(160, areaBottom - areaTop);
    const spacing = clamp(areaH / (RUNGS + 1.6), 16, 44);
    const topY = areaTop + (areaH - spacing * (RUNGS - 1)) / 2;
    const wide = w > 620;
    const amp = clamp(w * 0.11, 34, 84);
    const ampOpen = wide ? amp * 0.8 : amp * 0.52;
    const cx0 = w / 2;
    const cx1 = wide ? w * 0.27 : w * 0.25;
    const cx2 = wide ? w * 0.73 : w * 0.75;
    const trayY = h - trayH / 2 - 4;
    const stations = BASES.map((b, i) => ({ base: b, x: w * (0.2 + 0.2 * i), y: trayY - 4 }));
    return { w, h, trayH, areaTop, areaBottom, areaH, spacing, topY, amp, ampOpen, cx0, cx1, cx2, trayY, stations, zx: w / 2, zy: (areaTop + areaBottom) / 2 };
  }, []);

  // ---- drawing -------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();

    // Warm neutral bench background.
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // A few pale free nucleotides drifting high above the tray — idle life.
    for (let m = 0; m < 4; m += 1) {
      const seed = m * 7.31 + 2.17;
      const mx = g.w * (0.1 + 0.8 * fract(seed * 0.137 + s.time * 0.008 * (m + 1)));
      const my = g.areaTop + 18 + (g.areaH - 40) * fract(seed * 0.911 + s.time * 0.006 * (m + 1));
      drawBaseShape(ctx, mx, my, BASES[m], 0.55, false, 0.14);
    }

    // ---- the nucleotide tray (bench, always reachable, never zoomed) ------
    ctx.fillStyle = '#f7f9fb';
    rrect(ctx, 10, h - g.trayH + 6, w - 20, g.trayH - 16, 12);
    ctx.fill();
    ctx.strokeStyle = '#d7dee6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    g.stations.forEach((st, i) => {
      const bob = Math.sin(s.time * 1.7 + i * 1.3) * 3.5;
      const active = s.drag.kind === 'nuc' && s.drag.base === st.base;
      ctx.fillStyle = 'rgba(23,35,52,0.08)';
      ctx.beginPath();
      ctx.ellipse(st.x, st.y + 20, 13, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBaseShape(ctx, st.x, st.y + bob - 4, st.base, 1.5, false, active ? 0.3 : 1);
      ctx.strokeStyle = active ? 'rgba(249,115,22,0.85)' : 'rgba(141,168,185,0.4)';
      ctx.lineWidth = active ? 2 : 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(st.x, st.y + bob - 4, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ---- the molecule (clipped above the tray, zoom transform applied) ----
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, Math.max(10, h - g.trayH - 2));
    ctx.clip();
    ctx.translate(g.zx, g.zy);
    ctx.scale(s.zoom, s.zoom);
    ctx.translate(-g.zx, -g.zy);

    const sp = (kind: StrandKind, u: number) => strandPoint(g, s.sep, s.rot, kind, u);
    const openish = s.sep.some((v) => v > 0.15);
    const uTop = -0.85;
    const uEndFull = s.phase === 'build' || s.phase === 'unzipping'
      ? Math.max(s.rungs + 0.85, 1.2)
      : RUNGS - 1 + 0.85;

    // Collect strand ribbons: the two old backbones (which grow during the
    // build), plus the two new teal backbones over their filled ranges.
    const strandsAll: { kind: StrandKind; pts: Pt[] }[] = [
      { kind: 'oldL', pts: sampleStrand(g, s.sep, s.rot, 'oldL', uTop, uEndFull) },
      { kind: 'oldR', pts: sampleStrand(g, s.sep, s.rot, 'oldR', uTop, uEndFull) },
    ];
    if (openish) {
      for (const [a, b] of filledRanges(s.fillA)) strandsAll.push({ kind: 'newA', pts: sampleStrand(g, s.sep, s.rot, 'newA', a, b) });
      for (const [a, b] of filledRanges(s.fillB)) strandsAll.push({ kind: 'newB', pts: sampleStrand(g, s.sep, s.rot, 'newB', a, b) });
    }

    const drawStrandSegments = (back: boolean) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const st of strandsAll) {
        const isNew = st.kind === 'newA' || st.kind === 'newB';
        for (let i = 0; i + 1 < st.pts.length; i += 1) {
          const p1 = st.pts[i];
          const p2 = st.pts[i + 1];
          const zm = (p1.z + p2.z) / 2;
          if ((zm < 0) !== back) continue;
          const zz = (zm + 1) / 2;
          const shimmer = Math.sin(s.time * 2.4 + p1.u * 2.7) * 0.4;
          ctx.lineWidth = Math.max(1.4, 3 + 2.8 * zz + shimmer);
          ctx.strokeStyle = isNew
            ? `rgba(47,163,154,${(0.45 + 0.55 * zz).toFixed(3)})`
            : `rgba(201,155,63,${(0.45 + 0.55 * zz).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    };

    // Base circles to draw, tagged with their depth.
    const baseItems: BaseItem[] = [];
    for (let i = 0; i < s.rungs; i += 1) {
      const pl = sp('oldL', i);
      baseItems.push({ x: pl.x, y: pl.y, z: pl.z, base: leftBase(s.seq, i), isNew: false });
      const pr = sp('oldR', i);
      baseItems.push({ x: pr.x, y: pr.y, z: pr.z, base: rightBase(s.seq, i), isNew: false });
    }
    if (s.phase === 'build' && s.rungs < RUNGS) {
      const side = givenSide(s.rungs);
      const pg = sp(side === 'left' ? 'oldL' : 'oldR', s.rungs);
      baseItems.push({ x: pg.x, y: pg.y, z: pg.z, base: s.seq[s.rungs], isNew: false });
    }
    if (openish) {
      for (let i = 0; i < RUNGS; i += 1) {
        const fa = s.fillA[i];
        const fb = s.fillB[i];
        if (fa) {
          const p = sp('newA', i);
          baseItems.push({ x: p.x, y: p.y, z: p.z, base: fa, isNew: true });
        }
        if (fb) {
          const p = sp('newB', i);
          baseItems.push({ x: p.x, y: p.y, z: p.z, base: fb, isNew: true });
        }
      }
    }
    const drawBaseItems = (front: boolean) => {
      for (const it of baseItems) {
        if ((it.z >= 0) !== front) continue;
        const zz = (it.z + 1) / 2;
        drawBaseShape(ctx, it.x, it.y, it.base, 0.72 + 0.34 * zz, it.isNew, 0.55 + 0.45 * zz);
      }
    };

    const targets = findTargets(g, s.phase, s.rungs, s.sep, s.fillA, s.fillB, s.rot);
    const nextA = s.fillA.findIndex((v) => v === null);
    const nextB = s.fillB.findIndex((v) => v === null);

    // Painter's passes: back ribbons → back bases → rungs → front ribbons → front bases.
    drawStrandSegments(true);
    drawBaseItems(false);

    // Hydrogen-bond dashes on every intact rung (2 for A–T, 3 for G–C — the
    // honest count), bursting outward while a bond pop fades.
    for (let i = 0; i < s.rungs; i += 1) {
      const sepAlpha = clamp(1 - s.sep[i] * 2, 0, 1);
      if (sepAlpha <= 0.02) continue;
      const pl = sp('oldL', i);
      const pr = sp('oldR', i);
      const bonds = BONDS[leftBase(s.seq, i)];
      const mx = (pl.x + pr.x) / 2;
      const my = (pl.y + pr.y) / 2;
      const dx = pr.x - pl.x;
      const dy = pr.y - pl.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const vx = -uy;
      const vy = ux;
      const burst = s.popFlash[i];
      for (let k = 0; k < bonds; k += 1) {
        const off = (k - (bonds - 1) / 2) * 7;
        const fly = burst > 0 ? (1 - burst) * 16 * (k % 2 === 0 ? 1 : -1) : 0;
        const alpha = sepAlpha * (burst > 0 ? burst : 1);
        const cx2 = mx + ux * off + vx * fly;
        const cy2 = my + uy * off + vy * fly;
        ctx.strokeStyle = `rgba(141,168,185,${(0.85 * alpha).toFixed(3)})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(cx2 - vx * 5, cy2 - vy * 5);
        ctx.lineTo(cx2 + vx * 5, cy2 + vy * 5);
        ctx.stroke();
      }
    }

    // Fixed-base ring + dashed half-rung to the pulsing drop slot (build phase).
    if (s.phase === 'build' && s.rungs < RUNGS && targets.length > 0) {
      const side = givenSide(s.rungs);
      const pg = sp(side === 'left' ? 'oldL' : 'oldR', s.rungs);
      const tp = targets[0];
      ctx.strokeStyle = 'rgba(201,155,63,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pg.x, pg.y, 13.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(141,168,185,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(pg.x, pg.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ghost drop slots (dashed circles) with the accent pulse on the next ones.
    const pulse = 0.5 + 0.5 * Math.sin(s.time * 4);
    for (const t of targets) {
      const isNext = t.mol === 'pending' || (t.mol === 'A' && t.idx === nextA) || (t.mol === 'B' && t.idx === nextB);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isNext ? `rgba(249,115,22,${(0.45 + 0.4 * pulse).toFixed(3)})` : 'rgba(141,168,185,0.5)';
      ctx.lineWidth = isNext ? 2.2 : 1.4;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 11 + (isNext ? pulse * 2.5 : 0), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Hover ring (desktop exploration).
    if (s.hoverPos) {
      ctx.strokeStyle = 'rgba(249,115,22,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(s.hoverPos.x, s.hoverPos.y, 17, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawStrandSegments(false);
    drawBaseItems(true);

    // ---- helicase motor blob (drawn on top while it travels) --------------
    if (s.helicaseActive || s.helicaseFade > 0) {
      const u = s.helicaseT * (RUNGS - 1);
      const pl = sp('oldL', u);
      const pr = sp('oldR', u);
      const x = (pl.x + pr.x) / 2;
      const y = (pl.y + pr.y) / 2;
      const fade = s.helicaseActive ? 1 : s.helicaseFade;
      const squash = 1 + Math.sin(s.time * 9) * 0.07;
      ctx.globalAlpha = fade;
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 30);
      glow.addColorStop(0, 'rgba(142,108,201,0.32)');
      glow.addColorStop(1, 'rgba(142,108,201,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b4fa8';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 4);
      ctx.lineTo(pl.x, pl.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 4);
      ctx.lineTo(pr.x, pr.y);
      ctx.stroke();
      const body = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, 16);
      body.addColorStop(0, '#b79ae0');
      body.addColorStop(1, '#7c5cbf');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 12 * squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4c3577';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.arc(x - 4, y - 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 4, y + 2, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore(); // end clip + zoom

    // ---- the nucleotide in the student's hand (screen coordinates) --------
    if (s.drag.kind === 'nuc' && s.drag.base) {
      const b = s.drag.base;
      const wob = Math.sin(s.time * 6) * 1.5;
      const hp = toHelix(g, s.zoom, s.drag.x, s.drag.y);
      let nearest: Target | null = null;
      let nearestD = Infinity;
      for (const t of targets) {
        const d = Math.hypot(hp.x - t.x, hp.y - t.y);
        if (d < 160 && d < nearestD) {
          nearestD = d;
          nearest = t;
        }
      }
      if (nearest) {
        const sc = fromHelix(g, s.zoom, nearest.x, nearest.y);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(249,115,22,0.5)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.drag.x, s.drag.y);
        ctx.lineTo(sc.x, sc.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.save();
      ctx.shadowColor = 'rgba(249,115,22,0.5)';
      ctx.shadowBlur = 14;
      drawBaseShape(ctx, s.drag.x, s.drag.y + wob, b, 1.9, false, 1);
      ctx.restore();
    }

    // Refused-pair shake marker (honest refusal feedback).
    if (s.wrongFlash > 0) {
      const shake = Math.sin(s.time * 42) * 3 * s.wrongFlash;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = `rgba(224,85,85,${(0.8 * s.wrongFlash).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.wrongAt.x + shake, s.wrongAt.y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = sim.current;
      s.zoom = clamp(s.zoom * (1 - e.deltaY * 0.0012), 0.6, 1.8);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ---- pointer interaction --------------------------------------------------------
  const hoverUpdate = (px: number, py: number) => {
    const s = sim.current;
    const g = geom();
    const hp = toHelix(g, s.zoom, px, py);
    const cands: { d: number; text: string; x: number; y: number }[] = [];
    if (s.phase === 'build' || s.phase === 'unzipping') {
      for (let i = 0; i < s.rungs; i += 1) {
        const l = leftBase(s.seq, i);
        const txt = `Pair ${i + 1} · ${l}–${rightBase(s.seq, i)} · ${BONDS[l]} hydrogen bonds`;
        const pl = strandPoint(g, s.sep, s.rot, 'oldL', i);
        const pr = strandPoint(g, s.sep, s.rot, 'oldR', i);
        cands.push({ d: Math.hypot(hp.x - pl.x, hp.y - pl.y), text: txt, x: (pl.x + pr.x) / 2, y: pl.y });
        cands.push({ d: Math.hypot(hp.x - pr.x, hp.y - pr.y), text: txt, x: (pl.x + pr.x) / 2, y: pr.y });
      }
    } else {
      for (let i = 0; i < RUNGS; i += 1) {
        const l = leftBase(s.seq, i);
        const r = rightBase(s.seq, i);
        const fa = s.fillA[i];
        const fb = s.fillB[i];
        if (fa) {
          const p = strandPoint(g, s.sep, s.rot, 'newA', i);
          cands.push({ d: Math.hypot(hp.x - p.x, hp.y - p.y), text: `Daughter 1 · pair ${i + 1} · old ${l} + new ${fa} · ${BONDS[l]} hydrogen bonds`, x: p.x, y: p.y });
        }
        if (fb) {
          const p = strandPoint(g, s.sep, s.rot, 'newB', i);
          cands.push({ d: Math.hypot(hp.x - p.x, hp.y - p.y), text: `Daughter 2 · pair ${i + 1} · old ${r} + new ${fb} · ${BONDS[r]} hydrogen bonds`, x: p.x, y: p.y });
        }
      }
    }
    let best: { d: number; text: string; x: number; y: number } | null = null;
    for (const c of cands) {
      if (c.d < 26 && (!best || c.d < best.d)) best = c;
    }
    s.hover = best ? best.text : null;
    s.hoverPos = best ? { x: best.x, y: best.y } : null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;
    // 1) nucleotide pickup from the tray (generous slop for fingers)
    let picked: Base | null = null;
    for (const st of geom().stations) {
      if (Math.hypot(px - st.x, py - (st.y - 4)) < 30) picked = st.base;
    }
    if (picked) {
      s.drag = { kind: 'nuc', base: picked, x: px, y: py, lastX: px, creakAt: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.slide(0.4);
      return;
    }
    // 2) otherwise: drag-rotate the helix
    s.drag = { kind: 'rotate', base: null, x: px, y: py, lastX: px, creakAt: performance.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    labSound.creak(0.25);
    notePointer(false);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (s.drag.kind === 'none') {
      hoverUpdate(px, py);
      return;
    }
    if (s.drag.kind === 'nuc') {
      s.drag.x = px;
      s.drag.y = py;
      return;
    }
    const dx = px - s.drag.lastX;
    s.drag.lastX = px;
    s.rot += dx * 0.012;
    const nowT = performance.now();
    if (nowT - s.drag.creakAt > 110) {
      s.drag.creakAt = nowT;
      labSound.creak(0.2 + Math.min(0.5, Math.abs(dx) * 0.02));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (s.drag.kind === 'none') return;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (s.drag.kind === 'nuc' && s.drag.base) {
      dropNucleotide(s.drag.base, s.drag.x, s.drag.y);
    }
    s.drag = { kind: 'none', base: null, x: 0, y: 0, lastX: 0, creakAt: 0 };
  };

  /** Commit (or honestly refuse) a nucleotide dropped at screen point (px, py). */
  const dropNucleotide = (base: Base, px: number, py: number) => {
    const s = sim.current;
    const g = geom();
    const hp = toHelix(g, s.zoom, px, py);
    const targets = findTargets(g, s.phase, s.rungs, s.sep, s.fillA, s.fillB, s.rot);
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of targets) {
      const d = Math.hypot(hp.x - t.x, hp.y - t.y);
      if (d < 44 && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) {
      labSound.slide(0.3); // carried nowhere useful — back to the tray
      notePointer(false);
      return;
    }
    if (best.mol === 'pending') {
      if (placePartner(base)) notePointer(true);
      return;
    }
    const templBase = best.mol === 'A' ? leftBase(s.seq, best.idx) : rightBase(s.seq, best.idx);
    if (base === COMPLEMENT[templBase]) {
      if (best.mol === 'A') s.fillA[best.idx] = base;
      else s.fillB[best.idx] = base;
      labSound.thunk(true);
      labSound.ping(BONDS[base] === 2 ? 520 : 660, 0.06);
      notePointer(true);
      checkReplication();
      syncUi();
    } else {
      refusePair(`${base} cannot pair with the template base ${templBase} — this slot needs ${COMPLEMENT[templBase]} (${BONDS[COMPLEMENT[templBase]]} hydrogen bonds).`);
    }
  };

  // ---- reset -----------------------------------------------------------------------
  const resetAll = () => {
    const s = sim.current;
    labSound.stopLoop();
    s.phase = 'build';
    s.seq = makeSequence(RUNGS);
    s.rungs = 0;
    s.rot = 0.7;
    s.rotVel = 0;
    s.zoom = 1;
    s.helicaseActive = false;
    s.helicaseT = 0;
    s.helicaseFade = 0;
    s.broken = 0;
    s.sep.fill(0);
    s.sepTarget.fill(0);
    s.popFlash.fill(0);
    s.fillA.fill(null);
    s.fillB.fill(null);
    s.autoFill = false;
    s.autoTimer = 0;
    s.autoSide = 'A';
    s.aPingDone = false;
    s.bPingDone = false;
    s.drag = { kind: 'none', base: null, x: 0, y: 0, lastX: 0, creakAt: 0 };
    s.hover = null;
    s.hoverPos = null;
    s.wrongFlash = 0;
    earnedRef.current = [];
    setBadges([]);
    setMentorIndex(0);
    setAutoFill(false);
    setRefusal(null);
    setConclusion({ q1: '', q2: '', text: '' });
    setConclusionOk(false);
    setConclusionFeedback(null);
    syncUi();
  };

  // ---- analysis --------------------------------------------------------------------
  const chargaff = useMemo(() => {
    const counts: Record<Base, number> = { A: 0, T: 0, G: 0, C: 0 };
    const all = ui.left + ui.right;
    if (!all) return null;
    for (const ch of all) {
      if (ch === 'A' || ch === 'T' || ch === 'G' || ch === 'C') counts[ch] += 1;
    }
    const pct: Record<Base, number> = {
      A: (counts.A / all.length) * 100,
      T: (counts.T / all.length) * 100,
      G: (counts.G / all.length) * 100,
      C: (counts.C / all.length) * 100,
    };
    return { counts, pct, total: all.length };
  }, [ui.left, ui.right]);

  const filledCount = useMemo(() => {
    const a = ui.fillA.split('').filter((c) => c !== '.').length;
    const b = ui.fillB.split('').filter((c) => c !== '.').length;
    return a + b;
  }, [ui.fillA, ui.fillB]);

  const submitConclusion = () => {
    if (conclusionOk) return;
    const parts: string[] = [];
    if (conclusion.q1 !== 'T') parts.push('look again at which base A pairs with');
    if (conclusion.q2 !== '3') parts.push('look again at how many hydrogen bonds hold G–C');
    const text = conclusion.text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean).length;
    const hasOld = text.includes('old') || text.includes('original') || text.includes('parent');
    const hasNew = text.includes('new') || text.includes('fresh') || text.includes('synthes');
    const hasTemplate = text.includes('template') || text.includes('complement') || text.includes('copied') || text.includes('conserv') || text.includes('half');
    if (!hasOld || !hasNew || !hasTemplate || words < 10) {
      parts.push('write a sentence or two naming the old strand, the new strand and the template idea');
    }
    if (parts.length === 0) {
      setConclusionOk(true);
      setConclusionFeedback('All three parts correct — A–T with 2 hydrogen bonds, G–C with 3, and semi-conservative replication: each daughter molecule keeps one old strand as the template for one new strand.');
      labSound.milestone();
      earn('chargaff-checker');
      pushToast('good', '✓', 'Conclusion correct — that is the whole model in three answers.');
    } else {
      labSound.warn();
      setConclusionFeedback(`Nearly there — ${parts.join('; ')}.`);
    }
  };

  // ---- coach --------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (refusal) return { tone: 'warn', line: refusal };
    if (!mentorAcked) return { tone: 'info', line: 'Welcome to the helix bench. Acknowledge the mentor, then drag a nucleotide from the tray up to the ladder.' };
    if (ui.phase === 'build') {
      if (ui.rungs === 0) return { tone: 'info', line: 'The circled base is fixed. Its partner is missing — carry the right nucleotide from the tray to the pulsing slot. A goes with T, G with C.' };
      if (ui.rungs < RUNGS) {
        const given = ui.pendingBase;
        const need = COMPLEMENT[given];
        return { tone: 'info', line: `${ui.rungs}/${RUNGS} rungs · fixed base ${given} needs ${need} (${BONDS[need]} hydrogen bonds). The helix twists as it grows.` };
      }
      return { tone: 'good', line: 'Twelve honest rungs — the model is complete. Send helicase down to unzip it.' };
    }
    if (ui.phase === 'unzipping') return { tone: 'info', line: 'Helicase is wedging the rungs apart — every pop is a hydrogen bond breaking. The old strands stay whole.' };
    if (ui.phase === 'open') {
      if (filledCount === 0) return { tone: 'info', line: 'Two templates, both hungry. Drag complementary nucleotides to the dashed slots — teal ribbons mark the new strands.' };
      if (filledCount < RUNGS * 2) return { tone: 'info', line: `Replicating · ${filledCount}/${RUNGS * 2} new nucleotides placed. Each daughter keeps its old strand as the template.` };
      return { tone: 'good', line: 'Both daughters filled — one old strand and one new in each. Semi-conservative, and you watched it happen.' };
    }
    if (!sawObservations) return { tone: 'good', line: 'Replication complete. Open Observations — your Chargaff percentages and the conclusion card are waiting.' };
    if (!conclusionOk) return { tone: 'info', line: 'Read your A–T and G–C counts, then answer the conclusion to finish the experiment.' };
    return { tone: 'good', line: 'Complete: built, unzipped, replicated and explained. Reset any time to build a brand-new random sequence.' };
  }, [refusal, mentorAcked, ui, filledCount, sawObservations, conclusionOk]);

  // ---- status ----------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : ui.phase === 'unzipping'
      ? 'Helicase unzipping…'
      : ui.phase === 'open'
        ? `Replicating · ${filledCount}/${RUNGS * 2} nucleotides`
        : ui.phase === 'done'
          ? 'Replication complete — read your data'
          : ui.rungs >= RUNGS
            ? 'Helix complete — ready to unzip'
            : `Build phase · ${ui.rungs}/${RUNGS} rungs`;

  // ---- render ------------------------------------------------------------------------------
  const canUnzip = ui.phase === 'build' && ui.rungs >= RUNGS;
  const primaryLabel = ui.phase === 'build'
    ? (ui.rungs >= RUNGS ? 'Unzip with helicase' : 'Snap the matching partner')
    : ui.phase === 'open'
      ? 'Add the next nucleotide'
      : ui.phase === 'done'
        ? 'Open your data'
        : 'Unzipping…';
  const rungPct = Math.min(100, (ui.rungs / RUNGS) * 100);
  const fillPct = Math.min(100, (filledCount / (RUNGS * 2)) * 100);
  const turns = ((ui.rungs * TWIST) / (Math.PI * 2)).toFixed(2);
  const phaseLabel = ui.phase === 'build' ? 'Building' : ui.phase === 'unzipping' ? 'Unzipping' : ui.phase === 'open' ? 'Templates open' : 'Complete';

  const leftStrip = ui.left + (ui.hasPending ? (ui.pendingSide === 'left' ? ui.pendingBase : '·') : '');
  const rightStrip = ui.right + (ui.hasPending ? (ui.pendingSide === 'right' ? ui.pendingBase : '·') : '');

  const stripRow = (label: string, letters: string) => (
    <div className="dna-strip-row" key={label}>
      <span className="dna-strip-label">{label}</span>
      <div className="dna-strip-letters">
        {letters.split('').map((ch, i) => (
          <span key={i} className={ch === 'A' || ch === 'T' || ch === 'G' || ch === 'C' ? `dna-b dna-b-${ch}` : 'dna-b dna-b-empty'}>{ch}</span>
        ))}
      </div>
    </div>
  );

  const pairRows = ui.left.split('').map((ch, i) => ({
    n: i + 1,
    l: ch,
    r: ui.right[i] ?? '·',
    b: BONDS[ch as Base],
  }));

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.phase === 'unzipping' || ui.phase === 'open' ? 'active' : 'ready'}
      captionChip="Interactive model — drag to build"
      legend={[
        { color: BASE_COLORS.A, label: 'A adenine' },
        { color: BASE_COLORS.T, label: 'T thymine' },
        { color: BASE_COLORS.G, label: 'G guanine' },
        { color: BASE_COLORS.C, label: 'C cytosine' },
        { color: '#c99b3f', label: 'Old strand' },
        { color: '#2fa39a', label: 'New strand' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start building', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <>
          <div className="dna-zoom" role="group" aria-label="Helix zoom controls">
            <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
          </div>
          <label>Speed
            <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Simulation speed">
              <option value={1}>1× real time</option>
              <option value={2}>2× faster</option>
              <option value={4}>4× faster</option>
            </select>
          </label>
        </>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="DNA model bench — drag nucleotides from the tray onto the ladder to pair them, drag the helix sideways to rotate, scroll to zoom"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              primaryAction();
            } else if (e.key === 'ArrowLeft' && !e.repeat) {
              e.preventDefault();
              sim.current.rot -= 0.16;
              labSound.tick();
            } else if (e.key === 'ArrowRight' && !e.repeat) {
              e.preventDefault();
              sim.current.rot += 0.16;
              labSound.tick();
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            const s = sim.current;
            if (s.drag.kind === 'none') {
              s.hover = null;
              s.hoverPos = null;
            }
          }}
        />
      }
      controls={
        <div>
          <div className="dna-layout">
            <div className="dna-actions">
              <button
                className="action-button"
                type="button"
                data-nudge="unzip"
                onClick={() => { startUnzip(); notePointer(true); }}
                disabled={!canUnzip}
              >
                <span className="dispense-icon" aria-hidden="true">⇅</span>
                <span>{canUnzip ? 'Unzip with helicase' : `Complete the helix · ${ui.rungs}/${RUNGS}`}</span>
                <small>breaks the hydrogen bonds</small>
              </button>
              <button
                className="action-button"
                type="button"
                data-nudge="autofill"
                onClick={toggleAutoFill}
                disabled={ui.phase !== 'open'}
              >
                <span className="dispense-icon" aria-hidden="true">{autoFill ? '⏸' : '▶'}</span>
                <span>{autoFill ? 'Pause auto-fill' : 'Auto-fill demo'}</span>
                <small>or drag nucleotides yourself</small>
              </button>
              <button
                className="action-button"
                type="button"
                onClick={() => primaryAction()}
                disabled={ui.phase === 'unzipping'}
              >
                <span className="dispense-icon" aria-hidden="true">✥</span>
                <span>{primaryLabel}</span>
                <small>same as Space on the canvas</small>
              </button>
            </div>
            <div className="dna-progress">
              <div className="dna-prog-row">
                <span>Base pairs</span>
                <div><span style={{ width: `${rungPct}%` }} /></div>
                <strong>{ui.rungs}/{RUNGS}</strong>
              </div>
              <div className="dna-prog-row">
                <span>New nucleotides</span>
                <div><span style={{ width: `${fillPct}%` }} /></div>
                <strong>{filledCount}/{RUNGS * 2}</strong>
              </div>
              <div className="dna-prog-row tight">
                <span>Hydrogen bonds</span>
                <strong>{ui.bonds} in model</strong>
              </div>
              <div className="dna-prog-row tight">
                <span>Unzip progress</span>
                <strong>{Math.round(ui.unzip * 100)}%</strong>
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>A pairs with T through 2 hydrogen bonds, G with C through 3 — count the little dashes. Drag the helix sideways to rotate it, scroll or use the ± buttons to zoom, and hover a base pair for its identity.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Helix readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Base pairs built</span>
            <strong>{ui.rungs} <small>/{RUNGS}</small></strong>
            <div className="reading-track"><span style={{ width: `${rungPct}%` }} /></div>
            <div className="reading-scale"><span>0</span><span>{RUNGS}</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Phase</span><strong>{phaseLabel}</strong></div>
            <div><span>Hydrogen bonds</span><strong>{ui.bonds}</strong></div>
            <div><span>Helix turns</span><strong>{turns}</strong></div>
            <div><span>New nucleotides</span><strong>{filledCount}/{RUNGS * 2}</strong></div>
            <div><span>Zoom</span><strong>{Math.round(ui.zoom * 100)}%</strong></div>
            <div><span>Daughters filled</span><strong>{ui.phase === 'done' ? '2 / 2' : ui.phase === 'open' ? 'in progress' : '—'}</strong></div>
          </div>
          <div className="dna-pairchip" aria-live="polite">{ui.hover ?? 'Hover a base pair to read its identity and bond count'}</div>
          <div className="dna-strip">
            <div className="dna-strip-title">YOUR SEQUENCE</div>
            {stripRow('Strand L', leftStrip)}
            {stripRow('Strand R', rightStrip)}
            {(ui.phase === 'open' || ui.phase === 'done') && stripRow('New on L', ui.fillA)}
            {(ui.phase === 'open' || ui.phase === 'done') && stripRow('New on R', ui.fillB)}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Read the circled fixed base on the ladder, then drag the matching nucleotide from the tray to the pulsing slot — A with T, G with C. Mismatches are refused, with the reason.</li>
              <li>Complete all twelve rungs. The helix twists as it grows; drag it sideways to rotate, scroll or press ± to zoom.</li>
              <li>Press “Unzip with helicase” and watch every hydrogen-bond dash pop as the motor travels down.</li>
              <li>Feed complementary nucleotides to both template strands — by hand, with the Auto-fill demo, or both at once.</li>
              <li>Open Observations: read your own Chargaff percentages, then answer the three-part conclusion.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Count the dashes on a finished rung before you trust it: two means A–T, three means G–C. On touch screens a slow drag works better than a fast flick — the drop radius is generous.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your sequence table</h3>
            {pairRows.length === 0 ? (
              <p className="observation-note">Pair your first bases and the table fills in — every row is a rung you built with your own hands.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Left base</th><th>Right base</th><th>H-bonds</th></tr></thead>
                <tbody>
                  {pairRows.map((r) => (
                    <tr key={r.n}><td>{r.n}</td><td className={`dna-td dna-b-${r.l}`}>{r.l}</td><td className={`dna-td dna-b-${r.r}`}>{r.r}</td><td>{r.b}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {chargaff && (
              <>
                <h3 style={{ marginTop: 16 }}>Chargaff check — your own molecule</h3>
                <div className="dna-bars">
                  {BASES.map((b) => (
                    <div className="dna-bar-row" key={b}>
                      <span className={`dna-b dna-b-${b}`}>{b}</span>
                      <div className="dna-bar-track"><span className={`dna-bar-fill dna-b-${b}`} style={{ width: `${chargaff.pct[b]}%` }} /></div>
                      <strong>{chargaff.pct[b].toFixed(1)}% · {chargaff.counts[b]}</strong>
                    </div>
                  ))}
                </div>
                <p className="observation-note">
                  Counting every base on both strands of your molecule: A = {chargaff.counts.A} and T = {chargaff.counts.T}; G = {chargaff.counts.G} and C = {chargaff.counts.C}.
                  {chargaff.counts.A === chargaff.counts.T && chargaff.counts.G === chargaff.counts.C
                    ? ' Exactly equal — base pairing forces it, whatever random sequence you built.'
                    : ' Pairing keeps these equal in a real molecule.'}
                </p>
              </>
            )}
            <h3 style={{ marginTop: 16 }}>Conclusion</h3>
            <div className="dna-conclusion">
              <label>
                <span>1 · Which base does A pair with?</span>
                <select value={conclusion.q1} onChange={(e) => { setConclusion((c) => ({ ...c, q1: e.target.value })); labSound.tick(); }} aria-label="Partner base for adenine">
                  <option value="">Choose…</option>
                  <option value="A">A</option>
                  <option value="T">T</option>
                  <option value="G">G</option>
                  <option value="C">C</option>
                </select>
              </label>
              <label>
                <span>2 · How many hydrogen bonds hold a G–C pair?</span>
                <select value={conclusion.q2} onChange={(e) => { setConclusion((c) => ({ ...c, q2: e.target.value })); labSound.tick(); }} aria-label="Hydrogen bonds in a G-C pair">
                  <option value="">Choose…</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
              <label>
                <span>3 · Why does each daughter molecule keep one old strand?</span>
                <textarea
                  rows={3}
                  value={conclusion.text}
                  onChange={(e) => setConclusion((c) => ({ ...c, text: e.target.value }))}
                  aria-label="Explain semi-conservative replication in your own words"
                  placeholder="Name the old strand, the new strand and the template idea…"
                  disabled={conclusionOk}
                />
              </label>
              <button className="record-button" type="button" onClick={submitConclusion} disabled={conclusionOk || ui.rungs === 0}>
                {conclusionOk ? '✓ Conclusion accepted' : 'Check my conclusion'}
              </button>
              {conclusionFeedback && <p className={`dna-feedback${conclusionOk ? ' ok' : ''}`}>{conclusionFeedback}</p>}
            </div>
            <p className="observation-note">A teaching model, honestly drawn: the percentages above come from the exact sequence you built, and the replication copied those same bases onto the complementary strands.</p>
          </>
        ),
        theory: (
          <>
            <h3>The shape of the code</h3>
            <p>DNA stores information in two long sugar-phosphate backbones that twist around each other like a spiral ladder — the famous double helix. The side rails are identical chemistry; the information lives in the rungs. Each rung is a pair of bases joined by weak hydrogen bonds, and only certain pairs fit.</p>
            <p>Adenine (A) pairs with thymine (T) through two hydrogen bonds; guanine (G) pairs with cytosine (C) through three. A purine always meets a pyrimidine, so every rung has the same width and the ladder stays straight. In this lab the bond count is drawn honestly — two little dashes for A–T, three for G–C.</p>
            <div className="equation">A = T and G = C — Chargaff&apos;s rule</div>
            <h3>Why replication is semi-conservative</h3>
            <p>Before a cell divides, the whole helix is copied. Helicase unzips the molecule by breaking the hydrogen bonds, and each old strand stays intact as a template. Free nucleotides then snap in, obeying the same pairing rules, building one new strand against each old one.</p>
            <p>The result is two daughter molecules, and each of them keeps one original strand plus one freshly built strand — semi-conservative replication. That is why the new strands in this lab are drawn in teal: at the end you can see, rung by rung, that half of every daughter is the molecule you built with your own hands.</p>
            <p>Because A always pairs with T and G with C, each template can only specify one possible partner at every position — which is exactly how a copy can be faithful enough to carry inheritance across generations.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations') setSawObservations(true); }}
    />
  );
}
