import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { fmtClock } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './digestion-journey.css';

/**
 * Digestion journey — Biology, Builder, Experiment 038.
 *
 * A sandwich travels a diagrammatic human cutaway from mouth to rectum.
 * The student chews, switches salivary amylase on, swallows into peristalsis,
 * acidifies the stomach (HCl + pepsin at pH ≈ 2), emulsifies fat with bile and
 * finishes every nutrient with pancreatic juice in the small intestine —
 * watching end-products cross the villi into blood. Each enzyme only attacks
 * its own substrate; particle counts and per-region percentages are the data.
 */

type Region = 'mouth' | 'esophagus' | 'stomach' | 'si' | 'colon' | 'done';
type TokenId = 'saliva' | 'gastric' | 'bile' | 'pancreas';

const REGION_ORDER: Region[] = ['mouth', 'esophagus', 'stomach', 'si', 'colon', 'done'];
const REGION_NAME: Record<Region, string> = {
  mouth: 'Mouth',
  esophagus: 'Esophagus',
  stomach: 'Stomach',
  si: 'Small intestine',
  colon: 'Large intestine',
  done: 'Rectum',
};

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'mouth', title: 'Chew with saliva', detail: 'Drag the blue saliva token onto the mouth, then chew — salivary amylase starts splitting starch into sweet glucose fragments while the teeth grind the sandwich down.', hint: 'Tap the mouth itself to chew, or press the Chew button.' },
  { id: 'swallow', title: 'Swallow and ride peristalsis', detail: 'Once the bolus is soft, swallow it — rings of muscle squeeze behind the food and carry it down the esophagus. No enzymes act here; it is an honest conveyor.', hint: 'Press Swallow, or tap the canvas and hit Space.' },
  { id: 'stomach', title: 'Acid and pepsin in the stomach', detail: 'Drag gastric juice onto the stomach until the pH reads about 2 — pepsin switches on and carves protein into fragments while the wall churns the chyme.', hint: 'Two doses of gastric juice usually reach pH 2. Churn to mix.' },
  { id: 'si', title: 'Bile and pancreatic juice', detail: 'In the small intestine, drag bile from the gall bladder so the fat emulsifies into a fine mist, then add pancreatic juice — amylase, protease and lipase finish all three nutrients.', hint: 'Lipase crawls on big droplets — bile multiplies the surface it can attack.' },
  { id: 'villi', title: 'Watch the villi absorb', detail: 'Tap the intestine wall to open the villi magnifier — glucose, amino acids and fatty acids cross into the blood capillaries and disappear from the lumen.', hint: 'The magnified inset appears in the top-right corner.' },
  { id: 'colon', title: 'Water out, journey done', detail: 'The colon reclaims water and the leftover fibre firms up on the way to the rectum. Then open Observations and answer why enzymes are specific and why fat needs bile.', hint: 'The conclusion card unlocks the final milestone.' },
];

const BADGES: BadgeDef[] = [
  { id: 'thorough-chewer', title: 'Thorough chewer', icon: '✦', detail: 'Starch at least 40% broken down before swallowing.' },
  { id: 'acid-mixer', title: 'Acid mixer', icon: '⚗', detail: 'Stomach brought to pH ≈ 2 with pepsin active.' },
  { id: 'emulsifier', title: 'Emulsifier', icon: '◐', detail: 'Bile added and the fat droplets visibly misted.' },
  { id: 'absorb-watcher', title: 'Absorb watcher', icon: '⌖', detail: 'Watched glucose crossing the villi in the magnifier.' },
  { id: 'journey-complete', title: 'Journey complete', icon: '✔', detail: 'Mouth to rectum with all three nutrients ≥ 90% digested.' },
];

interface TokenDef { id: TokenId; name: string; color: string; target: string }
const TOKENS: TokenDef[] = [
  { id: 'saliva', name: 'Saliva · amylase', color: '#7fb2d9', target: 'drag onto the mouth' },
  { id: 'gastric', name: 'Gastric juice · HCl + pepsin', color: '#e07a5f', target: 'drag onto the stomach' },
  { id: 'bile', name: 'Bile · from the gall bladder', color: '#8aa84f', target: 'drag onto the small intestine' },
  { id: 'pancreas', name: 'Pancreatic juice · amylase + protease + lipase', color: '#d9b95e', target: 'drag onto the small intestine' },
];

const ENZYME_ROWS: { id: string; enzyme: string; source: string; substrate: string; product: string; opt: string; flag: 'saliva' | 'pepsin' | 'bile' | 'pancreas' }[] = [
  { id: 'amylase-s', enzyme: 'Salivary amylase', source: 'Salivary glands', substrate: 'Starch', product: 'Glucose fragments', opt: 'Neutral · pH ≈ 7', flag: 'saliva' },
  { id: 'pepsin', enzyme: 'Pepsin', source: 'Stomach lining', substrate: 'Protein', product: 'Peptide fragments', opt: 'Strongly acidic · pH ≈ 2', flag: 'pepsin' },
  { id: 'bile', enzyme: 'Bile salts (not an enzyme)', source: 'Gall bladder', substrate: 'Large fat droplets', product: 'Emulsified droplets', opt: 'Alkaline · pH ≈ 7–8', flag: 'bile' },
  { id: 'amylase-p', enzyme: 'Pancreatic amylase', source: 'Pancreas', substrate: 'Starch', product: 'Glucose', opt: 'Alkaline · pH ≈ 8', flag: 'pancreas' },
  { id: 'protease', enzyme: 'Protease (trypsin)', source: 'Pancreas', substrate: 'Peptides · protein', product: 'Amino acids', opt: 'Alkaline · pH ≈ 8', flag: 'pancreas' },
  { id: 'lipase', enzyme: 'Lipase', source: 'Pancreas', substrate: 'Emulsified fat', product: 'Fatty acids + glycerol', opt: 'Alkaline · pH ≈ 8 · races after bile', flag: 'pancreas' },
];

// ---------------------------------------------------------------------------
// Tract geometry — design units. Screen: X = cx + dx·s, Y = yOff + dy·s.
// Design space spans roughly x ∈ [-125, 125], y ∈ [26, 756].
// ---------------------------------------------------------------------------

interface Pt { x: number; y: number }

const SEG_MOUTH: Pt[] = [{ x: 44, y: 112 }, { x: 34, y: 120 }, { x: 26, y: 132 }];
const SEG_ESOPH: Pt[] = [{ x: 20, y: 150 }, { x: 15, y: 176 }, { x: 11, y: 204 }, { x: 7, y: 232 }, { x: 3, y: 262 }, { x: 0, y: 292 }, { x: -6, y: 320 }];
const SEG_STOM: Pt[] = [{ x: -18, y: 332 }, { x: -32, y: 348 }, { x: -37, y: 368 }, { x: -31, y: 390 }, { x: -14, y: 403 }, { x: 5, y: 406 }, { x: 21, y: 399 }];
const SEG_DUO: Pt[] = [{ x: 28, y: 386 }, { x: 33, y: 408 }, { x: 27, y: 428 }, { x: 13, y: 441 }, { x: -5, y: 447 }, { x: -25, y: 452 }, { x: -48, y: 462 }];
const SEG_COIL: Pt[] = [
  { x: -78, y: 478 }, { x: -80, y: 496 }, { x: -60, y: 504 }, { x: -20, y: 506 }, { x: 30, y: 506 }, { x: 66, y: 504 }, { x: 80, y: 494 },
  { x: 82, y: 514 }, { x: 70, y: 526 }, { x: 30, y: 530 }, { x: -20, y: 530 }, { x: -60, y: 528 }, { x: -78, y: 522 },
  { x: -82, y: 540 }, { x: -70, y: 554 }, { x: -20, y: 558 }, { x: 30, y: 558 }, { x: 66, y: 556 }, { x: 80, y: 548 },
  { x: 82, y: 566 }, { x: 70, y: 582 }, { x: 30, y: 586 }, { x: -20, y: 586 }, { x: -60, y: 584 }, { x: -78, y: 578 },
  { x: -82, y: 596 }, { x: -70, y: 610 }, { x: -20, y: 614 }, { x: 30, y: 614 }, { x: 70, y: 612 }, { x: 88, y: 618 }, { x: 96, y: 628 },
];
const SEG_COLON: Pt[] = [
  { x: 100, y: 604 }, { x: 101, y: 560 }, { x: 99, y: 516 }, { x: 96, y: 484 },
  { x: 60, y: 473 }, { x: 0, y: 471 }, { x: -60, y: 473 }, { x: -96, y: 484 },
  { x: -99, y: 516 }, { x: -101, y: 560 }, { x: -99, y: 604 }, { x: -95, y: 626 },
  { x: -68, y: 642 }, { x: -30, y: 651 }, { x: 0, y: 655 },
];
const SEG_RECT: Pt[] = [{ x: 0, y: 676 }, { x: 0, y: 700 }];

const TRACT: Pt[] = [
  ...SEG_MOUTH, ...SEG_ESOPH, ...SEG_STOM, ...SEG_DUO, ...SEG_COIL, ...SEG_COLON, ...SEG_RECT,
];
const IX = {
  esoph0: SEG_MOUTH.length,
  esoph1: SEG_MOUTH.length + SEG_ESOPH.length - 1,
  si0: SEG_MOUTH.length + SEG_ESOPH.length + SEG_STOM.length,
  si1: SEG_MOUTH.length + SEG_ESOPH.length + SEG_STOM.length + SEG_DUO.length + SEG_COIL.length - 1,
  colon0: SEG_MOUTH.length + SEG_ESOPH.length + SEG_STOM.length + SEG_DUO.length + SEG_COIL.length,
  colon1: TRACT.length - SEG_RECT.length - 1,
};

const MOUTH_C: Pt = { x: 46, y: 114 };
const STOMACH_C: Pt = { x: -6, y: 370 };
const GB_C: Pt = { x: 86, y: 386 };
const SI_RECT = { x0: -118, x1: 118, y0: 448, y1: 648 };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function geoOf(w: number, h: number) {
  const availH = h - 58;
  const s = Math.min(availH / 730, w / 640);
  const yOff = 6 + (availH - 730 * s) / 2 - 26 * s;
  return { s, cx: w / 2, yOff };
}

function pathPoint(i0: number, i1: number, t: number): { x: number; y: number; nx: number; ny: number } {
  const f = clamp(t, 0, 1) * (i1 - i0);
  const a = Math.max(0, Math.min(i1 - i0 - 1, Math.floor(f)));
  const u = f - a;
  const p0 = TRACT[i0 + a];
  const p1 = TRACT[i0 + a + 1];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p0.x + dx * u, y: p0.y + dy * u, nx: -dy / len, ny: dx / len };
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

function tracePath(ctx: CanvasRenderingContext2D, i0: number, i1: number, X: (d: number) => number, Y: (d: number) => number) {
  const p0 = TRACT[i0];
  ctx.moveTo(X(p0.x), Y(p0.y));
  for (let i = i0 + 1; i < i1; i += 1) {
    const cur = TRACT[i];
    const nxt = TRACT[i + 1];
    ctx.quadraticCurveTo(X(cur.x), Y(cur.y), X((cur.x + nxt.x) / 2), Y((cur.y + nxt.y) / 2));
  }
  const pl = TRACT[i1];
  ctx.lineTo(X(pl.x), Y(pl.y));
}

function strokeSeg(ctx: CanvasRenderingContext2D, i0: number, i1: number, lw: number, style: string, X: (d: number) => number, Y: (d: number) => number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = style;
  tracePath(ctx, i0, i1, X, Y);
  ctx.stroke();
}

function drawVarTube(
  ctx: CanvasRenderingContext2D, i0: number, i1: number, baseHW: number, color: string,
  profile: (q: number) => number, X: (d: number) => number, Y: (d: number) => number,
) {
  const n = i1 - i0;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i += 1) {
    const a = TRACT[i0 + i];
    const b = TRACT[i0 + i + 1];
    const c = i + 1 < n ? TRACT[i0 + i + 2] : b;
    const q = (i + 0.5) / n;
    ctx.lineWidth = Math.max(1.5, 2 * baseHW * profile(q));
    ctx.beginPath();
    ctx.moveTo(X((a.x + b.x) / 2), Y((a.y + b.y) / 2));
    ctx.lineTo(X((b.x + c.x) / 2), Y((b.y + c.y) / 2));
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Simulation model
// ---------------------------------------------------------------------------

interface Chunk {
  kind: 'starch' | 'protein' | 'fat' | 'fibre';
  thr: number;          // global digested fraction at which this chunk morphs
  off: number;          // path-param offset inside the current tube region
  lat: number;          // lateral offset factor across the tube (-1..1)
  phase: number;        // wobble phase for idle drift
  x0: number;           // cavity-local spread (mouth / stomach)
  y0: number;
  product: boolean;     // morphed into its end-product
  mist: boolean;        // emulsified micro-droplet
  absorbed: boolean;
  absorbT: number;      // 0..1 absorption animation
  delay: number;        // seconds after morph before absorption starts
  sx: number;           // last drawn screen position
  sy: number;
}

interface SimState {
  region: Region;
  progress: number;
  time: number;
  dwell: number;
  starchDig: number;
  proteinDig: number;
  fatDig: number;
  chew: number;
  chewAnim: number;
  chewCount: number;
  churn: number;
  pH: number;           // stomach pH
  gastricAdds: number;
  salivaOn: boolean;
  bileOn: boolean;
  pancreasOn: boolean;
  pepsinWasActive: boolean;
  acidReached: boolean;
  pepsinStoppedNoted: boolean;
  lipaseNoBileNoted: boolean;
  villiOpen: boolean;
  villiSeenAbsorbing: boolean;
  absorbedGlucose: number;
  journeyDone: boolean;
  chunks: Chunk[];
  flashes: { x: number; y: number; life: number }[];
  insetParts: { u: number; y: number; kind: Chunk['kind'] }[];
  drag: { id: TokenId; x: number; y: number } | null;
  breathPhase: number;
  sloshPhase: number;
  sloshAt: number;
  peristAt: number;
  uiAcc: number;
}

interface RowData { region: string; enzymes: string; pH: number; starch: number; protein: number; fat: number }

interface UiSnap {
  region: Region; pH: number; starch: number; protein: number; fat: number;
  chew: number; churn: number; time: number; progress: number;
  salivaOn: boolean; gastric: number; bileOn: boolean; pancreasOn: boolean;
  pepsinActive: boolean; acidReached: boolean; pepsinWasActive: boolean;
  villiOpen: boolean; villiSeen: boolean; absorbedGlucose: number; journeyDone: boolean;
}

const meta = getLabBySlug('digestion-journey')!;

function shuffled(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n).sort(() => Math.random() - 0.5);
}

function makeChunks(): Chunk[] {
  const chunks: Chunk[] = [];
  const base = (): Omit<Chunk, 'kind' | 'thr'> => ({
    off: -Math.random() * 0.03,
    lat: Math.random() * 2 - 1,
    phase: Math.random() * Math.PI * 2,
    x0: (Math.random() - 0.5) * 22,
    y0: (Math.random() - 0.5) * 12,
    product: false,
    mist: false,
    absorbed: false,
    absorbT: 0,
    delay: 1 + Math.random() * 1.6,
    sx: 0,
    sy: 0,
  });
  shuffled(9).forEach((t) => chunks.push({ ...base(), kind: 'starch', thr: 0.08 + t * 0.82 }));
  shuffled(9).forEach((t) => chunks.push({ ...base(), kind: 'protein', thr: 0.12 + t * 0.8 }));
  [0.15, 0.25, 0.35, 0.45, 0.55, 0.7].forEach((t) => chunks.push({ ...base(), kind: 'fat', thr: t }));
  [0, 1, 2].forEach(() => chunks.push({ ...base(), kind: 'fibre', thr: 9 }));
  return chunks;
}

function makeSim(): SimState {
  return {
    region: 'mouth', progress: 0, time: 0, dwell: 0,
    starchDig: 0, proteinDig: 0, fatDig: 0,
    chew: 0, chewAnim: 0, chewCount: 0, churn: 0.4,
    pH: 6.5, gastricAdds: 0,
    salivaOn: false, bileOn: false, pancreasOn: false,
    pepsinWasActive: false, acidReached: false,
    pepsinStoppedNoted: false, lipaseNoBileNoted: false,
    villiOpen: false, villiSeenAbsorbing: false, absorbedGlucose: 0,
    journeyDone: false,
    chunks: makeChunks(),
    flashes: [], insetParts: [],
    drag: null,
    breathPhase: 0, sloshPhase: 0, sloshAt: 0, peristAt: 0, uiAcc: 0,
  };
}

function currentPh(s: SimState): number {
  switch (s.region) {
    case 'mouth': return 7.0;
    case 'esophagus': return 7.0;
    case 'stomach': return s.pH;
    case 'si': return s.pancreasOn ? 8.0 : 6.4;
    default: return 7.2;
  }
}

function bolusPoint(s: SimState): Pt | null {
  switch (s.region) {
    case 'mouth': return { x: MOUTH_C.x, y: MOUTH_C.y };
    case 'esophagus': { const p = pathPoint(IX.esoph0, IX.esoph1, s.progress); return { x: p.x, y: p.y }; }
    case 'stomach': return { x: STOMACH_C.x + Math.sin(s.sloshPhase) * 6, y: STOMACH_C.y + Math.cos(s.sloshPhase * 0.7) * 4 };
    case 'si': { const p = pathPoint(IX.si0, IX.si1, clamp(s.progress, 0, 1)); return { x: p.x, y: p.y }; }
    case 'colon': { const p = pathPoint(IX.colon0, IX.colon1, s.progress); return { x: p.x, y: p.y }; }
    case 'done': return { x: 0, y: 690 };
    default: return null;
  }
}

function drawChunk(ctx: CanvasRenderingContext2D, c: Chunk, x: number, y: number, sc: number, shrink: number, fibreFirm: number) {
  if (c.kind === 'starch') {
    if (c.product) {
      const r = 2.5 * sc * shrink;
      ctx.fillStyle = '#f97316';
      roundRect(ctx, x - r, y - r, 2 * r, 2 * r, Math.max(0.5, 1 * sc));
      ctx.fill();
    } else {
      const r = 5.2 * sc * shrink;
      ctx.fillStyle = '#d9a441';
      roundRect(ctx, x - r, y - r, 2 * r, 2 * r, 1.6 * sc);
      ctx.fill();
      ctx.strokeStyle = '#a87a24';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (c.kind === 'protein') {
    if (c.product) {
      const r = 2.9 * sc * shrink;
      ctx.fillStyle = '#5d8aa8';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      ctx.fill();
    } else {
      const r = 4.8 * sc * shrink;
      ctx.fillStyle = '#c05a5a';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.82, c.phase, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8f3f3f';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (c.kind === 'fat') {
    const r = (c.mist ? 2.2 : 6.2) * sc * shrink * (c.product ? 0.75 : 1);
    ctx.fillStyle = c.product ? '#d4b23c' : '#e8c84a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (!c.mist && !c.product) {
      ctx.strokeStyle = '#b89a20';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // fibre: firms and darkens as the colon reclaims water
    const len = 6 * sc * shrink;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.phase + (1 - fibreFirm) * Math.sin(c.phase * 3) * 0.6);
    const k = fibreFirm;
    ctx.fillStyle = `rgba(${Math.round(125 + 40 * k)},${Math.round(106 + 32 * k)},${Math.round(70 + 25 * k)},1)`;
    roundRect(ctx, -len, -1.8 * sc, 2 * len, 3.6 * sc, 1.6 * sc);
    ctx.fill();
    ctx.restore();
  }
}

function drawToken(ctx: CanvasRenderingContext2D, tok: TokenDef, x: number, y: number, r: number, done: boolean) {
  ctx.globalAlpha = done ? 0.45 : 1;
  const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.4, tok.color);
  gr.addColorStop(1, tok.color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.strokeStyle = '#172334';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // glyph (shapes only — no text on the scene canvas)
  ctx.strokeStyle = '#172334';
  ctx.fillStyle = '#172334';
  ctx.lineWidth = 1.6;
  if (tok.id === 'saliva') {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.45);
    ctx.quadraticCurveTo(x + r * 0.38, y + 0.1 * r, x, y + r * 0.45);
    ctx.quadraticCurveTo(x - r * 0.38, y + 0.1 * r, x, y - r * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (tok.id === 'gastric') {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y + r * 0.45);
    ctx.lineTo(x + r * 0.4, y + r * 0.45);
    ctx.lineTo(x + r * 0.12, y - r * 0.1);
    ctx.lineTo(x + r * 0.12, y - r * 0.5);
    ctx.lineTo(x - r * 0.12, y - r * 0.5);
    ctx.lineTo(x - r * 0.12, y - r * 0.1);
    ctx.closePath();
    ctx.stroke();
  } else if (tok.id === 'bile') {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.5);
    ctx.lineTo(x + r * 0.45, y);
    ctx.lineTo(x, y + r * 0.5);
    ctx.lineTo(x - r * 0.45, y);
    ctx.closePath();
    ctx.stroke();
  } else {
    for (let d = 0; d < 3; d += 1) {
      ctx.beginPath();
      ctx.arc(x - r * 0.3 + d * r * 0.3, y - r * 0.22 + (d % 2) * r * 0.44, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (done) {
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.45, y - r * 0.6);
    ctx.lineTo(x + r * 0.62, y - r * 0.38);
    ctx.lineTo(x + r * 0.95, y - r * 0.85);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export default function DigestionLab() {
  const sim = useRef<SimState>(makeSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- React state (UI snapshot + controls only) ---------------------------
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<RowData[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawObservations, setSawObservations] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [conclusionOk, setConclusionOk] = useState(false);
  const [ui, setUi] = useState<UiSnap>({
    region: 'mouth', pH: 7, starch: 100, protein: 100, fat: 100,
    chew: 0, churn: 0.4, time: 0, progress: 0,
    salivaOn: false, gastric: 0, bileOn: false, pancreasOn: false,
    pepsinActive: false, acidReached: false, pepsinWasActive: false,
    villiOpen: false, villiSeen: false, absorbedGlucose: 0, journeyDone: false,
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
      region: s.region, pH: currentPh(s),
      starch: 100 - Math.round(s.starchDig * 100),
      protein: 100 - Math.round(s.proteinDig * 100),
      fat: 100 - Math.round(s.fatDig * 100),
      chew: s.chew, churn: s.churn, time: s.time, progress: s.progress,
      salivaOn: s.salivaOn, gastric: s.gastricAdds, bileOn: s.bileOn, pancreasOn: s.pancreasOn,
      pepsinActive: s.gastricAdds > 0 && s.pH <= 3 && s.region === 'stomach',
      acidReached: s.acidReached, pepsinWasActive: s.pepsinWasActive,
      villiOpen: s.villiOpen, villiSeen: s.villiSeenAbsorbing,
      absorbedGlucose: s.absorbedGlucose, journeyDone: s.journeyDone,
    });
  }, []);

  // ---- region bookkeeping --------------------------------------------------
  const regionAtLeast = useCallback((r: Region) =>
    REGION_ORDER.indexOf(ui.region) >= REGION_ORDER.indexOf(r), [ui.region]);

  const recordRow = useCallback((label: string) => {
    const s = sim.current;
    let enzymes = 'None';
    if (label === 'Mouth') enzymes = s.salivaOn ? 'Salivary amylase' : 'None';
    else if (label === 'Esophagus') enzymes = 'None (peristalsis)';
    else if (label === 'Stomach') enzymes = s.gastricAdds > 0 ? 'HCl + pepsin' : 'None';
    else if (label === 'Small intestine') {
      const parts: string[] = [];
      if (s.bileOn) parts.push('bile');
      if (s.pancreasOn) parts.push('pancreatic juice');
      enzymes = parts.length ? parts.join(' + ') : 'None';
    } else if (label === 'Large intestine') enzymes = 'None (water absorbed)';
    const row: RowData = {
      region: label, enzymes, pH: currentPh(s),
      starch: 100 - Math.round(s.starchDig * 100),
      protein: 100 - Math.round(s.proteinDig * 100),
      fat: 100 - Math.round(s.fatDig * 100),
    };
    setRows((cur) => [...cur, row]);
  }, []);

  const spreadForRegion = useCallback((r: Region) => {
    const s = sim.current;
    for (const c of s.chunks) {
      c.absorbT = 0;
      if (r === 'esophagus') { c.off = -Math.random() * 0.05; c.lat = Math.random() * 1.4 - 0.7; }
      else if (r === 'si') { c.off = -0.12 + Math.random() * 0.14; c.lat = Math.random() * 1.6 - 0.8; }
      else if (r === 'colon' || r === 'done') { c.off = -0.06 + Math.random() * 0.08; c.lat = Math.random() * 1.2 - 0.6; }
      else if (r === 'stomach') { c.x0 = (Math.random() - 0.5) * 44; c.y0 = (Math.random() - 0.5) * 28; }
    }
  }, []);

  // ---- student actions -------------------------------------------------------
  const chew = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'mouth') return;
    s.chew = Math.min(1, s.chew + 0.18);
    s.chewCount += 1;
    s.chewAnim = 0.5;
    labSound.thunk(true);
    if (s.chewCount % 3 === 0) labSound.tick();
    syncUi();
  }, [syncUi]);

  const swallow = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'mouth' || s.chew < 0.5) return;
    recordRow('Mouth');
    if (s.starchDig >= 0.4) earn('thorough-chewer');
    s.region = 'esophagus';
    s.progress = 0;
    spreadForRegion('esophagus');
    labSound.slide(0.6);
    labSound.thunk(false);
    pushToast('good', '↓', 'Swallowed — peristalsis takes over. No enzymes ride the esophagus.');
    syncUi();
  }, [recordRow, earn, spreadForRegion, pushToast, syncUi]);

  const enterStomach = useCallback(() => {
    const s = sim.current;
    recordRow('Esophagus');
    s.region = 'stomach';
    s.progress = 0;
    s.dwell = 0;
    spreadForRegion('stomach');
    labSound.slosh(0.8);
    labSound.thunk(false);
    pushToast('info', '◑', 'The stomach receives the bolus. Drag gastric juice in — pepsin needs pH ≈ 2.');
    syncUi();
  }, [recordRow, spreadForRegion, pushToast, syncUi]);

  const addSaliva = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'mouth') {
      pushToast('warn', '◇', 'Saliva can only act in the mouth — the sandwich has moved on. Reset to try again.');
      labSound.warn();
      return;
    }
    if (s.salivaOn) return;
    s.salivaOn = true;
    labSound.drip(true);
    labSound.drip(true);
    pushToast('good', '◦', 'Salivary amylase is flowing — starch starts splitting the moment you chew.');
    syncUi();
  }, [pushToast, syncUi]);

  const addGastric = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'stomach') {
      pushToast('warn', '⚗', 'Gastric juice acts in the stomach — travel there first.');
      labSound.warn();
      return;
    }
    s.gastricAdds += 1;
    s.pH = Math.max(1.8, s.pH - 2.4);
    labSound.drip(false);
    labSound.slosh(0.6);
    labSound.startLoop('pour');
    window.setTimeout(() => labSound.stopLoop(), 1100);
    pushToast('info', '⚗', `Gastric juice in — pH ${s.pH.toFixed(1)}. ${s.pH <= 3 ? 'Pepsin is switching on.' : 'Pepsin sleeps above pH 3 — add another dose.'}`);
    syncUi();
  }, [pushToast, syncUi]);

  const churn = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'stomach') return;
    s.churn = Math.min(1.2, s.churn + 0.28);
    labSound.slosh(0.4 + s.churn * 0.4);
    syncUi();
  }, [syncUi]);

  const releaseChyme = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'stomach' || s.proteinDig < 0.35) return;
    recordRow('Stomach');
    s.region = 'si';
    s.progress = 0;
    spreadForRegion('si');
    labSound.slosh(0.9);
    labSound.slide(0.5);
    pushToast('good', '→', 'Chyme enters the small intestine. Bile first, then pancreatic juice.');
    if (s.pepsinWasActive && !s.pepsinStoppedNoted) {
      s.pepsinStoppedNoted = true;
      window.setTimeout(() => pushToast('info', '⚗', 'Pepsin has stopped — the small intestine turns alkaline, and a new protease takes over.'), 1400);
    }
    syncUi();
  }, [recordRow, spreadForRegion, pushToast, syncUi]);

  const addBile = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'si') {
      pushToast('warn', '◐', 'Bile releases into the small intestine — travel there first.');
      labSound.warn();
      return;
    }
    if (s.bileOn) return;
    s.bileOn = true;
    // Emulsify: every fat chunk splits into a mist of micro-droplets.
    const next: Chunk[] = [];
    for (const c of s.chunks) {
      if (c.kind === 'fat' && !c.product) {
        for (let j = 0; j < 5; j += 1) {
          next.push({
            ...c, mist: true, thr: Math.min(0.97, c.thr + 0.04 + j * 0.055),
            lat: clamp(c.lat + (Math.random() - 0.5) * 0.9, -1, 1),
            off: c.off + (Math.random() - 0.5) * 0.05,
          });
        }
      } else next.push(c);
    }
    s.chunks = next;
    labSound.glassClink(true);
    labSound.drip(true);
    earn('emulsifier');
    pushToast('good', '◐', 'Bile in — the big droplets shattered into a fine mist. Lipase now has surface to attack.');
    syncUi();
  }, [earn, pushToast, syncUi]);

  const addPancreas = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'si') {
      pushToast('warn', '◇', 'Pancreatic juice pours into the small intestine — travel there first.');
      labSound.warn();
      return;
    }
    if (s.pancreasOn) return;
    s.pancreasOn = true;
    labSound.drip(false);
    labSound.click();
    pushToast('good', '◇', 'Pancreatic juice in — amylase, protease and lipase at pH 8.');
    if (!s.bileOn && !s.lipaseNoBileNoted) {
      s.lipaseNoBileNoted = true;
      window.setTimeout(() => pushToast('warn', '◐', 'Lipase is working, but those big droplets give it little surface — bile would let it race.'), 1600);
    }
    syncUi();
  }, [pushToast, syncUi]);

  const toggleVilli = useCallback(() => {
    const s = sim.current;
    if (s.region !== 'si') {
      pushToast('info', '⌖', 'The villi magnifier opens on the small intestine — travel there first.');
      return;
    }
    s.villiOpen = !s.villiOpen;
    labSound.ping(520, 0.08);
    syncUi();
  }, [pushToast, syncUi]);

  // ---- physics / digestion tick ----------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const sdt = dt * speed;
    s.time += sdt;
    s.breathPhase += dt * 0.9;
    s.sloshPhase += sdt * (s.region === 'stomach' ? 0.9 + s.churn * 2.4 : 0.5);
    if (s.chewAnim > 0) s.chewAnim = Math.max(0, s.chewAnim - dt * 1.3);
    const chewBonus = 0.75 + 0.45 * s.chew;

    // --- digestion chemistry (enzyme + pH honesty) ---
    if (s.region === 'mouth' && s.salivaOn) {
      s.starchDig = Math.min(1, s.starchDig + 0.03 * (0.35 + 0.65 * s.chew) * sdt);
    }
    if (s.region === 'stomach') {
      const pepsinOn = s.gastricAdds > 0 && s.pH <= 3;
      if (pepsinOn) {
        s.pepsinWasActive = true;
        if (s.pH <= 2.2) s.acidReached = true;
        s.proteinDig = Math.min(1, s.proteinDig + 0.045 * (0.5 + 0.5 * s.churn) * chewBonus * sdt);
      }
      s.fatDig = Math.min(1, s.fatDig + 0.004 * sdt);   // an honest trace — fat survives the stomach
      s.churn = Math.max(0.4, s.churn - 0.12 * sdt);
      s.dwell += sdt;
      if (s.pepsinWasActive && s.acidReached) earn('acid-mixer');
      if (s.churn > 0.8 && s.time - s.sloshAt > 2.2) {
        s.sloshAt = s.time;
        labSound.slosh(0.3 + s.churn * 0.35);
      }
      if (s.proteinDig >= 0.85 && s.dwell >= 20) releaseChyme();
    }
    if (s.region === 'si' && s.pancreasOn) {
      s.starchDig = Math.min(1, s.starchDig + 0.045 * chewBonus * sdt);
      s.proteinDig = Math.min(1, s.proteinDig + 0.05 * chewBonus * sdt);
      s.fatDig = Math.min(1, s.fatDig + (s.bileOn ? 0.065 : 0.012) * chewBonus * sdt);
    }

    // --- travel ---
    if (s.region === 'esophagus') {
      s.progress += sdt / 5.2;
      if (s.time - s.peristAt > 1.3) { s.peristAt = s.time; labSound.creak(0.25); }
      if (s.progress >= 1) { s.progress = 1; enterStomach(); }
    } else if (s.region === 'si') {
      s.progress += sdt / 26;
      if (s.progress >= 1) {
        s.progress = 1;
        recordRow('Small intestine');
        s.region = 'colon';
        s.progress = 0;
        spreadForRegion('colon');
        pushToast('info', '◑', 'Into the colon — water is reclaimed and the leftover fibre firms up.');
      }
    } else if (s.region === 'colon') {
      s.progress += sdt / 13;
      if (s.progress >= 1 && !s.journeyDone) {
        s.progress = 1;
        s.journeyDone = true;
        s.region = 'done';
        recordRow('Large intestine');
        labSound.milestone();
        const all90 = s.starchDig >= 0.9 && s.proteinDig >= 0.9 && s.fatDig >= 0.9;
        if (all90) earn('journey-complete');
        pushToast(all90 ? 'good' : 'warn', '✔',
          all90
            ? 'Journey complete — every nutrient ≥ 90% digested. Answer the conclusion in Observations.'
            : 'Journey complete, but some nutrients survived. Check the table — which enzyme did you skip?');
      }
    }

    // --- particle morphing + villi absorption ---
    for (const c of s.chunks) {
      if (c.kind === 'fibre' || c.absorbed) continue;
      const g = c.kind === 'starch' ? s.starchDig : c.kind === 'protein' ? s.proteinDig : s.fatDig;
      if (!c.product && g >= c.thr) c.product = true;
      if (s.region === 'si' && c.product) {
        c.delay -= sdt;
        if (c.delay < 0) c.absorbT = Math.min(1, c.absorbT + sdt / 1.4);
        if (c.absorbT >= 1) {
          c.absorbed = true;
          if (c.sx > 0) s.flashes.push({ x: c.sx, y: c.sy, life: 0.5 });
          if (s.insetParts.length < 26) s.insetParts.push({ u: Math.random(), y: 0, kind: c.kind });
          if (c.kind === 'starch') {
            s.absorbedGlucose += 1;
            if (s.absorbedGlucose % 3 === 0) labSound.ping(680, 0.05);
          }
        }
      }
    }
    if (s.villiOpen && s.region === 'si' && s.absorbedGlucose >= 2) s.villiSeenAbsorbing = true;
    if (s.villiOpen && s.absorbedGlucose >= 3 && s.region === 'si') earn('absorb-watcher');

    // --- visual bookkeeping ---
    for (const f of s.flashes) f.life -= dt;
    if (s.flashes.length) s.flashes = s.flashes.filter((f) => f.life > 0);
    for (const p of s.insetParts) p.y += dt / 2.4;
    if (s.insetParts.length) s.insetParts = s.insetParts.filter((p) => p.y < 1);

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) { s.uiAcc = 0; syncUi(); }
  }, [speed, enterStomach, releaseChyme, recordRow, spreadForRegion, pushToast, earn, syncUi]);

  // ---------------------------------------------------------------------------
  // Drawing — pure shapes, no text on the scene canvas
  // ---------------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geoOf(w, h);
    const X = (dx: number) => g.cx + dx * g.s;
    const Y = (dy: number) => g.yOff + dy * g.s;
    const breath = Math.sin(s.breathPhase);
    const bob = breath * 1.5;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(199,210,221,0.5)';
    ctx.lineWidth = 1;
    for (let gx = 14; gx < w; gx += 34) {
      ctx.beginPath();
      ctx.moveTo(gx, 6);
      ctx.lineTo(gx - 10, h - 8);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(0, bob);

    // ---- body silhouette (breathing) ----
    const SIL: [number, number][] = [
      [26, 196], [88, 206], [116, 254], [120, 320], [110, 392], [100, 452], [108, 516], [122, 562],
      [110, 632], [84, 692], [40, 726], [0, 738],
      [-40, 726], [-84, 692], [-110, 632], [-122, 562], [-108, 516], [-100, 452], [-110, 392],
      [-120, 320], [-116, 254], [-88, 206], [-26, 196],
    ];
    ctx.save();
    ctx.translate(g.cx, Y(300));
    ctx.scale(1 + 0.012 * breath, 1);
    ctx.translate(-g.cx, -Y(300));
    ctx.beginPath();
    ctx.moveTo(X(SIL[0][0]), Y(SIL[0][1]));
    for (let i = 1; i < SIL.length; i += 1) ctx.lineTo(X(SIL[i][0]), Y(SIL[i][1]));
    ctx.closePath();
    ctx.fillStyle = '#f7efe6';
    ctx.fill();
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // head + neck + ear + nose
    ctx.beginPath();
    ctx.arc(X(0), Y(92), 62 * g.s, 0, Math.PI * 2);
    ctx.fillStyle = '#f7efe6';
    ctx.fill();
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(57), Y(86));
    ctx.lineTo(X(70), Y(95));
    ctx.lineTo(X(56), Y(102));
    ctx.closePath();
    ctx.fillStyle = '#f2e5d8';
    ctx.fill();
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(-12), Y(92), 10 * g.s, 0, Math.PI * 2);
    ctx.strokeStyle = '#c9b8a4';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#f7efe6';
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 1.6;
    roundRect(ctx, X(-24), Y(148), 48 * g.s, 50 * g.s, 10 * g.s);
    ctx.fill();
    ctx.stroke();

    // ---- colon frame (behind the coil, haustra bumps + bolus bulge) ----
    const colonProfile = (q: number) => {
      let m = 1 + 0.22 * Math.sin(q * 46);
      if (s.region === 'colon') {
        const d = Math.abs(q - s.progress);
        if (d < 0.12) m += 1.1 * (1 - d / 0.12);
      }
      return m;
    };
    drawVarTube(ctx, IX.colon0, IX.colon1, 12.5 * g.s, '#b98d62', colonProfile, X, Y);
    drawVarTube(ctx, IX.colon0, IX.colon1, 10.5 * g.s, '#e8d4b8', colonProfile, X, Y);
    // rectum + appendix stub at the caecum
    strokeSeg(ctx, TRACT.length - 2, TRACT.length - 1, 13 * g.s, '#b98d62', X, Y);
    strokeSeg(ctx, TRACT.length - 2, TRACT.length - 1, 11 * g.s, '#e8d4b8', X, Y);
    strokeSeg(ctx, IX.si1 - 1, IX.si1, 5 * g.s, '#c8a97e', X, Y);

    // ---- pancreas (peeks from behind the stomach) ----
    strokeSeg(ctx, IX.si0 + 3, IX.si0 + 4, 13 * g.s, '#a8893c', X, Y);
    strokeSeg(ctx, IX.si0 + 3, IX.si0 + 4, 11 * g.s, '#d9c05e', X, Y);

    // ---- small intestine (duodenum C + coiled jejunum/ileum) ----
    strokeSeg(ctx, IX.si0, IX.si1, 20 * g.s, '#b98a5e', X, Y);
    strokeSeg(ctx, IX.si0, IX.si1, 16 * g.s, '#f2dcc0', X, Y);
    ctx.save();
    ctx.setLineDash([3 * g.s, 9 * g.s]);
    ctx.lineDashOffset = -s.time * 14 * g.s;
    ctx.strokeStyle = 'rgba(185,141,98,0.55)';
    ctx.lineWidth = 1.4;
    tracePath(ctx, IX.si0, IX.si1, X, Y);
    ctx.stroke();
    ctx.restore();

    // ---- stomach pouch (J-shape, rugae folds, acid pool) ----
    strokeSeg(ctx, IX.esoph1, IX.si0, 56 * g.s, '#c76e63', X, Y);
    strokeSeg(ctx, IX.esoph1, IX.si0, 52 * g.s, '#eec3bb', X, Y);
    ctx.strokeStyle = 'rgba(199,110,99,0.55)';
    ctx.lineWidth = 1.4;
    for (let r = 0; r < 3; r += 1) {
      ctx.beginPath();
      ctx.moveTo(X(-26 + r * 12), Y(348 + r * 6));
      ctx.quadraticCurveTo(X(-14 + r * 10), Y(366 + r * 5), X(-24 + r * 13), Y(388 + r * 2));
      ctx.stroke();
    }
    if (s.gastricAdds > 0) {
      const wob = Math.sin(s.sloshPhase) * 3;
      ctx.beginPath();
      ctx.ellipse(X(-7), Y(380), (19 + wob * 0.4) * g.s, 11 * g.s, 0, 0, Math.PI * 2);
      ctx.fillStyle = s.pH <= 3 ? 'rgba(205,217,143,0.65)' : 'rgba(214,224,160,0.5)';
      ctx.fill();
    }

    // ---- liver + gall bladder ----
    ctx.beginPath();
    ctx.moveTo(X(28), Y(308));
    ctx.quadraticCurveTo(X(84), Y(300), X(106), Y(322));
    ctx.quadraticCurveTo(X(124), Y(348), X(98), Y(380));
    ctx.quadraticCurveTo(X(64), Y(392), X(38), Y(378));
    ctx.quadraticCurveTo(X(24), Y(344), X(28), Y(308));
    ctx.closePath();
    ctx.fillStyle = '#b5725e';
    ctx.fill();
    ctx.strokeStyle = '#8a4a3a';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const gbGlow = s.drag?.id === 'bile' || (s.region === 'si' && !s.bileOn);
    ctx.beginPath();
    ctx.moveTo(X(GB_C.x), Y(GB_C.y - 12));
    ctx.quadraticCurveTo(X(GB_C.x + 10), Y(GB_C.y - 2), X(GB_C.x), Y(GB_C.y + 8));
    ctx.quadraticCurveTo(X(GB_C.x - 10), Y(GB_C.y - 2), X(GB_C.x), Y(GB_C.y - 12));
    ctx.closePath();
    ctx.fillStyle = '#9cb35b';
    ctx.fill();
    ctx.strokeStyle = gbGlow ? '#f97316' : '#6f8a3c';
    ctx.lineWidth = gbGlow ? 2.2 : 1.5;
    ctx.stroke();
    ctx.strokeStyle = s.bileOn ? '#8aa84f' : '#6f8a3c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(84), Y(388));
    ctx.quadraticCurveTo(X(64), Y(404), X(34), Y(400));
    ctx.stroke();
    if (s.bileOn) {
      const bq = (s.time * 0.8) % 1;
      const bp = pathPoint(IX.si0, IX.si0 + 1, bq);
      ctx.beginPath();
      ctx.arc(X(bp.x), Y(bp.y), 2.4 * g.s, 0, Math.PI * 2);
      ctx.fillStyle = '#8aa84f';
      ctx.fill();
    }

    // ---- esophagus with peristaltic bulge / squeeze ----
    const esophProfile = (q: number) => {
      let m = 1 + 0.1 * Math.sin(q * 10 - s.time * 3);
      if (s.region === 'esophagus') {
        const d = Math.abs(q - s.progress);
        if (d < 0.09) m += 1.5 * (1 - d / 0.09);
        if (q < s.progress - 0.04) m *= 0.6 + 0.4 * clamp((s.progress - 0.04 - q) / 0.2, 0, 1);
      }
      return m;
    };
    drawVarTube(ctx, IX.esoph0, IX.esoph1, 8 * g.s, '#c76e63', esophProfile, X, Y);
    drawVarTube(ctx, IX.esoph0, IX.esoph1, 6.6 * g.s, '#f3d9c9', esophProfile, X, Y);

    // ---- mouth: lips, animated jaw, teeth, salivary glands ----
    const open = s.region === 'mouth' ? (0.5 + 0.5 * Math.sin(s.time * 16)) * s.chewAnim * 0.5 : 0;
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(X(38), Y(102));
    ctx.quadraticCurveTo(X(52), Y(100 - open * 14), X(62), Y(104));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(38), Y(124));
    ctx.quadraticCurveTo(X(52), Y(126 + open * 20), X(62), Y(122));
    ctx.stroke();
    ctx.fillStyle = '#fdfdf8';
    for (let t = 0; t < 3; t += 1) {
      roundRect(ctx, X(44 + t * 6), Y(103 - open * 10), 4.6 * g.s, 5.5 * g.s, 1.4 * g.s);
      ctx.fill();
      roundRect(ctx, X(44 + t * 6), Y(117 + open * 14), 4.6 * g.s, 5.5 * g.s, 1.4 * g.s);
      ctx.fill();
    }
    for (const gd of [{ x: 16, y: 146, r: 7 }, { x: -2, y: 138, r: 6 }]) {
      ctx.beginPath();
      ctx.ellipse(X(gd.x), Y(gd.y), gd.r * g.s, gd.r * 0.7 * g.s, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = s.salivaOn ? '#a9cfe8' : '#c9d7e0';
      ctx.fill();
      ctx.strokeStyle = s.salivaOn ? '#4d88ad' : '#8a96a4';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.strokeStyle = s.salivaOn ? '#4d88ad' : '#aeb9c4';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(X(20), Y(143));
    ctx.quadraticCurveTo(X(34), Y(132), X(44), Y(116));
    ctx.moveTo(X(0), Y(136));
    ctx.quadraticCurveTo(X(22), Y(128), X(42), Y(114));
    ctx.stroke();
    if (s.salivaOn) {
      for (let d = 0; d < 3; d += 1) {
        const dq = (s.time * 0.7 + d / 3) % 1;
        ctx.beginPath();
        ctx.arc(X(20 + 26 * dq), Y(142 - 28 * dq), 1.8 * g.s, 0, Math.PI * 2);
        ctx.fillStyle = '#7fb2d9';
        ctx.fill();
      }
    }

    // ---- idle peristaltic shimmer along the active tube ----
    const range = s.region === 'esophagus' ? [IX.esoph0, IX.esoph1]
      : s.region === 'si' ? [IX.si0, IX.si1]
        : s.region === 'colon' ? [IX.colon0, IX.colon1] : null;
    if (range) {
      const q = (s.time * 0.22) % 1;
      const sp = pathPoint(range[0], range[1], q);
      const gr = ctx.createRadialGradient(X(sp.x), Y(sp.y), 0, X(sp.x), Y(sp.y), 9 * g.s);
      gr.addColorStop(0, 'rgba(249,115,22,0.22)');
      gr.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(X(sp.x), Y(sp.y), 9 * g.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- bolus glow (where the food is) ----
    const bolus = bolusPoint(s);
    if (bolus) {
      const gr2 = ctx.createRadialGradient(X(bolus.x), Y(bolus.y), 0, X(bolus.x), Y(bolus.y), 26 * g.s);
      gr2.addColorStop(0, 'rgba(249,115,22,0.2)');
      gr2.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = gr2;
      ctx.beginPath();
      ctx.arc(X(bolus.x), Y(bolus.y), 26 * g.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- nutrient chunks (the travelling food) ----
    for (const c of s.chunks) {
      if (c.absorbed) continue;
      let px = 0;
      let py = 0;
      if (s.region === 'mouth') {
        const wob = s.chewAnim * Math.sin(s.time * 16 + c.phase) * 3;
        px = X(MOUTH_C.x + c.x0 * 0.7) + wob;
        py = Y(MOUTH_C.y + c.y0 * 0.7 + 2);
      } else if (s.region === 'stomach') {
        const sq = Math.sin(s.sloshPhase + c.phase);
        px = X(STOMACH_C.x + c.x0 * (1 + 0.07 * sq));
        py = Y(STOMACH_C.y + c.y0 + 2.5 * sq);
      } else {
        const rr = s.region === 'esophagus' ? [IX.esoph0, IX.esoph1]
          : s.region === 'si' ? [IX.si0, IX.si1]
            : [IX.colon0, TRACT.length - 1];
        const p = clamp(s.progress + c.off, 0, 1);
        const pp = pathPoint(rr[0], rr[1], p);
        const latAbsorb = c.product && s.region === 'si' ? c.lat * (1 + 0.45 * c.absorbT) : c.lat;
        px = X(pp.x + pp.nx * latAbsorb * 7);
        py = Y(pp.y + pp.ny * latAbsorb * 7);
      }
      c.sx = px;
      c.sy = py;
      px += Math.sin(s.time * 2 + c.phase) * 1.4;
      py += Math.cos(s.time * 1.7 + c.phase) * 1.2;
      const shrink = c.product && s.region === 'si' ? 1 - 0.7 * c.absorbT : 1;
      if (c.product && s.region === 'si') ctx.globalAlpha = 1 - 0.5 * c.absorbT;
      const firm = s.region === 'colon' || s.region === 'done' ? clamp(0.55 + 0.45 * s.progress, 0.55, 1) : 0.55;
      drawChunk(ctx, c, px, py, g.s, shrink, firm);
      ctx.globalAlpha = 1;
    }

    // ---- absorption flashes at the villi wall ----
    for (const f of s.flashes) {
      const k = 1 - f.life / 0.5;
      ctx.strokeStyle = `rgba(249,115,22,${0.7 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y - bob, 4 + k * 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore(); // end breathing bob

    // ---- villi magnifier inset (top-right) ----
    if (s.villiOpen && s.region === 'si') {
      const small = w < 560;
      const iw = small ? 150 : 196;
      const ih = small ? 116 : 150;
      const ix = w - iw - 12;
      const iy = 12;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(23,35,52,0.4)';
      ctx.lineWidth = 1.2;
      const bp = bolusPoint(s);
      if (bp) {
        ctx.beginPath();
        ctx.moveTo(X(bp.x), Y(bp.y));
        ctx.lineTo(ix + 4, iy + ih);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      roundRect(ctx, ix, iy, iw, ih, 8);
      ctx.fillStyle = '#f7f9fb';
      ctx.fill();
      ctx.strokeStyle = '#172334';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#f2dcc0';
      ctx.fillRect(ix + 6, iy + ih - 22, iw - 12, 16);
      const nF = small ? 4 : 5;
      for (let k = 0; k < nF; k += 1) {
        const fx = ix + 16 + (k * (iw - 32)) / (nF - 1);
        const fh = (small ? 34 : 44) + ((k * 37) % 3) * (small ? 5 : 7);
        const fw = small ? 8 : 10;
        ctx.beginPath();
        ctx.moveTo(fx - fw / 2, iy + ih - 22);
        ctx.quadraticCurveTo(fx - fw * 0.7, iy + ih - 22 - fh * 0.55, fx, iy + ih - 22 - fh);
        ctx.quadraticCurveTo(fx + fw * 0.7, iy + ih - 22 - fh * 0.55, fx + fw / 2, iy + ih - 22);
        ctx.closePath();
        ctx.fillStyle = '#f2d9c9';
        ctx.fill();
        ctx.strokeStyle = '#c76e63';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(192,90,90,0.8)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx, iy + ih - 24);
        ctx.lineTo(fx, iy + ih - 22 - fh * 0.8);
        ctx.stroke();
      }
      ctx.strokeStyle = '#c05a5a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ix + 10, iy + ih - 44);
      ctx.quadraticCurveTo(ix + iw / 2, iy + ih - 52, ix + iw - 10, iy + ih - 44);
      ctx.stroke();
      for (const p of s.insetParts) {
        const pxx = ix + 12 + p.u * (iw - 24);
        const pyy = iy + ih - 12 - p.y * (ih - 40);
        ctx.globalAlpha = 1 - p.y * 0.85;
        if (p.kind === 'starch') {
          ctx.fillStyle = '#f97316';
          ctx.fillRect(pxx - 2.2, pyy - 2.2, 4.4, 4.4);
        } else if (p.kind === 'protein') {
          ctx.fillStyle = '#5d8aa8';
          ctx.beginPath();
          ctx.moveTo(pxx, pyy - 2.8);
          ctx.lineTo(pxx + 2.6, pyy + 2);
          ctx.lineTo(pxx - 2.6, pyy + 2);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = '#d4b23c';
          ctx.beginPath();
          ctx.arc(pxx, pyy, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // ---- enzyme token tray + active drag ----
    const applied: Record<TokenId, boolean> = {
      saliva: s.salivaOn, gastric: s.gastricAdds > 0, bile: s.bileOn, pancreas: s.pancreasOn,
    };
    TOKENS.forEach((tok, i) => {
      if (s.drag?.id === tok.id) return;
      const tx = (w * (i + 1)) / 5;
      const ty = h - 24;
      drawToken(ctx, tok, tx, ty, 15, applied[tok.id]);
    });
    const dr = s.drag;
    if (dr) {
      const tok = TOKENS.find((t) => t.id === dr.id)!;
      const pulse = 0.5 + 0.5 * Math.sin(s.time * 6);
      ctx.save();
      ctx.strokeStyle = tok.color;
      ctx.lineWidth = 2 + pulse * 1.5;
      ctx.setLineDash([6, 5]);
      if (tok.id === 'saliva') {
        ctx.beginPath();
        ctx.arc(X(MOUTH_C.x), Y(MOUTH_C.y), (40 + pulse * 5) * g.s, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tok.id === 'gastric') {
        ctx.beginPath();
        ctx.arc(X(STOMACH_C.x), Y(STOMACH_C.y), (56 + pulse * 6) * g.s, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        roundRect(ctx, X(SI_RECT.x0), Y(SI_RECT.y0), (SI_RECT.x1 - SI_RECT.x0) * g.s, (SI_RECT.y1 - SI_RECT.y0) * g.s, 14);
        ctx.stroke();
      }
      ctx.restore();
      drawToken(ctx, tok, dr.x, dr.y, 17, applied[tok.id]);
    }
  }, []);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------
  const localXY = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const loc = localXY(e);
    const canvas = canvasRef.current;
    if (!loc || !canvas) return;
    const s = sim.current;
    const g = geoOf(loc.w, loc.h);
    const dx = (loc.x - g.cx) / g.s;
    const dy = (loc.y - g.yOff) / g.s;

    // 1. tray token grab (CSS-px hit circle, generous slop for fingers)
    for (let i = 0; i < TOKENS.length; i += 1) {
      const tx = (loc.w * (i + 1)) / 5;
      const ty = loc.h - 24;
      if (Math.hypot(loc.x - tx, loc.y - ty) < 15 + 23) {
        s.drag = { id: TOKENS[i].id, x: loc.x, y: loc.y };
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.slide(0.4);
        notePointer(true);
        return;
      }
    }
    // 2. drag bile straight from the gall bladder
    if (Math.hypot(dx - GB_C.x, dy - GB_C.y) < 16 + 26 / g.s) {
      s.drag = { id: 'bile', x: loc.x, y: loc.y };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.3);
      notePointer(true);
      return;
    }
    // 3. tap the mouth to chew
    if (s.region === 'mouth' && Math.hypot(dx - MOUTH_C.x, dy - MOUTH_C.y) < 44) {
      chew();
      notePointer(true);
      return;
    }
    // 4. tap the small intestine wall to toggle the villi magnifier
    if (dx > SI_RECT.x0 - 8 && dx < SI_RECT.x1 + 8 && dy > SI_RECT.y0 && dy < SI_RECT.y1 + 8) {
      toggleVilli();
      notePointer(true);
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const dr = s.drag;
    if (!dr) return;
    const loc = localXY(e);
    if (!loc) return;
    dr.x = loc.x;
    dr.y = loc.y;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const dr = s.drag;
    if (!dr) return;
    const id = dr.id;
    const loc = localXY(e);
    s.drag = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!loc) return;
    const g = geoOf(loc.w, loc.h);
    const dx = (loc.x - g.cx) / g.s;
    const dy = (loc.y - g.yOff) / g.s;
    const inMouth = Math.hypot(dx - MOUTH_C.x, dy - MOUTH_C.y) < 52;
    const inStomach = Math.hypot(dx - STOMACH_C.x, dy - STOMACH_C.y) < 66;
    const inSI = dx > SI_RECT.x0 && dx < SI_RECT.x1 && dy > SI_RECT.y0 && dy < SI_RECT.y1;
    switch (id) {
      case 'saliva': if (inMouth) addSaliva(); else labSound.tick(); break;
      case 'gastric': if (inStomach) addGastric(); else labSound.tick(); break;
      case 'bile': if (inSI) addBile(); else labSound.tick(); break;
      case 'pancreas': if (inSI) addPancreas(); else labSound.tick(); break;
      default: break;
    }
  };

  // ---- next sensible action (keyboard + primary button) -----------------------
  const nextAction: { label: string; small: string; run: (() => void) | null } = useMemo(() => {
    if (ui.region === 'mouth') {
      if (!ui.salivaOn) return { label: 'Add saliva (amylase)', small: 'drag the blue token onto the mouth', run: addSaliva };
      if (ui.chew < 0.95) return { label: 'Chew the sandwich', small: 'or tap the mouth on the canvas', run: chew };
      return { label: 'Swallow the bolus', small: 'peristalsis carries it down', run: swallow };
    }
    if (ui.region === 'esophagus') return { label: 'Riding the peristaltic wave…', small: 'muscle rings squeeze the bolus down', run: null };
    if (ui.region === 'stomach') {
      if (ui.gastric < 2) return { label: 'Add gastric juice', small: 'HCl + pepsin — aim for pH ≈ 2', run: addGastric };
      if (ui.protein > 60) return { label: 'Churn the stomach', small: 'mixing speeds the attack', run: churn };
      return { label: 'Release chyme', small: 'into the small intestine', run: releaseChyme };
    }
    if (ui.region === 'si') {
      if (!ui.bileOn) return { label: 'Release bile', small: 'drag from the gall bladder to emulsify fat', run: addBile };
      if (!ui.pancreasOn) return { label: 'Add pancreatic juice', small: 'amylase + protease + lipase at pH 8', run: addPancreas };
      if (!ui.villiOpen) return { label: 'Open the villi magnifier', small: 'tap the intestine wall', run: toggleVilli };
      return { label: 'Absorbing end-products…', small: 'glucose, amino acids, fatty acids cross to blood', run: null };
    }
    if (ui.region === 'colon') return { label: 'Water being reclaimed…', small: 'the fibre firms up on the way to the rectum', run: null };
    return { label: 'Journey complete', small: 'open Observations for the table, chart and conclusion', run: null };
  }, [ui, addSaliva, chew, swallow, addGastric, churn, releaseChyme, addBile, addPancreas, toggleVilli]);

  // ---- nudge ---------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'mouth':
        if (ui.region !== 'mouth') {
          return { target: 'reset', gesture: 'press', title: 'Restart for amylase', body: 'The sandwich left the mouth without salivary amylase — press Reset to run the journey again and add saliva first.' };
        }
        return !ui.salivaOn
          ? { target: 'saliva', gesture: 'drag', title: 'Saliva first', body: 'Drag the blue token from the tray onto the mouth — amylase must be there before starch can break down.' }
          : { target: 'chew', gesture: 'press', title: 'Chew it well', body: 'Press Chew (or tap the mouth) until the teeth have ground the sandwich into a soft bolus.' };
      case 'swallow':
        return { target: 'swallow', gesture: 'press', title: 'Swallow', body: 'The bolus is soft — press Swallow and watch peristalsis squeeze it down the esophagus.' };
      case 'stomach':
        if (ui.region !== 'stomach' && REGION_ORDER.indexOf(ui.region) > REGION_ORDER.indexOf('stomach')) {
          return { target: 'reset', gesture: 'press', title: 'Restart with acid', body: 'The chyme moved on without gastric juice — press Reset and acidify the stomach to pH 2 next time.' };
        }
        return ui.gastric < 2
          ? { target: 'juice', gesture: 'drag', title: 'Acidify the stomach', body: 'Drag the gastric juice token onto the stomach — twice usually reaches pH 2, where pepsin works.' }
          : { target: 'chyme', gesture: 'press', title: 'Release the chyme', body: 'Protein is carved up — press Release chyme to send it into the small intestine.' };
      case 'si':
        if (ui.region !== 'si' && REGION_ORDER.indexOf(ui.region) > REGION_ORDER.indexOf('si')) {
          return { target: 'reset', gesture: 'press', title: 'Restart with bile', body: 'The food passed the small intestine without its juices — press Reset to give bile and pancreatic juice a chance.' };
        }
        return !ui.bileOn
          ? { target: 'bile', gesture: 'drag', title: 'Bile from the gall bladder', body: 'Drag the green token (or the gall bladder itself) onto the coiled intestine — watch fat become a mist.' }
          : { target: 'pancreas', gesture: 'drag', title: 'Pancreatic juice', body: 'Drag the pancreatic token onto the intestine — amylase, protease and lipase finish the job.' };
      case 'villi':
        return { target: 'villi', gesture: 'tap', title: 'Zoom the villi', body: 'Tap the intestine wall (or press the magnifier button) and watch nutrients cross into the capillaries.' };
      case 'colon':
        return { target: 'observations', gesture: 'tap', title: 'Finish the story', body: 'The journey ends at the rectum — open Observations, read your table and answer the conclusion.' };
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex, ui]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- mentor completion -----------------------------------------------------
  const done = [
    regionAtLeast('esophagus') && ui.salivaOn,
    regionAtLeast('stomach'),
    regionAtLeast('si') && ui.pepsinWasActive,
    regionAtLeast('si') && ui.bileOn && ui.pancreasOn && ui.fat <= 60,
    ui.villiSeen,
    ui.journeyDone && conclusionOk && sawObservations,
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

  // ---- conclusion card ---------------------------------------------------------
  const checkConclusion = () => {
    if (!q1 || !q2) {
      pushToast('warn', '✎', 'Pick an answer for both questions first.');
      labSound.warn();
      return;
    }
    if (q1 === 'a' && q2 === 'b') {
      setConclusionOk(true);
      labSound.milestone();
      pushToast('good', '✔', 'Exactly right — enzymes are shape-specific, and bile multiplies the surface lipase can attack.');
    } else {
      labSound.warn();
      pushToast('warn', '✎', 'Not quite — reread the enzyme table in Observations and try again.');
    }
  };

  // ---- coach ---------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.region === 'mouth') {
      if (!ui.salivaOn) return { tone: 'info', line: 'Start in the mouth: drag the blue saliva token onto the lips — salivary amylase is the enzyme that begins on starch.' };
      if (ui.chew < 0.6) return { tone: 'info', line: 'Chew! Tap the mouth or press Chew — the teeth grind the sandwich into smaller pieces so enzymes reach more surface.' };
      if (ui.starch > 60) return { tone: 'info', line: `Amylase is nibbling the starch — ${ui.starch}% still intact. Longer chewing breaks more down before you swallow.` };
      return { tone: 'good', line: 'A thorough chew — the bolus is soft and sweet. Swallow when ready.' };
    }
    if (ui.region === 'esophagus') return { tone: 'info', line: 'Peristalsis: rings of muscle squeeze behind the bolus and ripple it downward. No enzymes act in this conveyor tube.' };
    if (ui.region === 'stomach') {
      if (ui.gastric === 0) return { tone: 'info', line: 'Now the stomach: drag the gastric juice token in — hydrochloric acid plus pepsin, the protein enzyme.' };
      if (ui.pH > 3) return { tone: 'warn', line: `pH ${ui.pH.toFixed(1)} — pepsin sleeps above pH 3. Add another dose of gastric juice.` };
      if (ui.protein > 60) return { tone: 'info', line: `Pepsin is carving protein at pH ${ui.pH.toFixed(1)} — ${ui.protein}% remains. Churn to mix the chyme.` };
      if (ui.protein > 25) return { tone: 'good', line: 'Protein is well carved up. Release the chyme into the small intestine when you are ready.' };
      return { tone: 'info', line: 'Stomach acid has switched amylase off — starch must wait for the pancreas further along.' };
    }
    if (ui.region === 'si') {
      if (!ui.bileOn && !ui.pancreasOn) return { tone: 'warn', line: 'Fat droplets are still big. Drag bile from the gall bladder onto the intestine — emulsification is not digestion, it is surface area.' };
      if (ui.bileOn && !ui.pancreasOn) return { tone: 'info', line: 'The fat is a fine mist now. Add pancreatic juice — its amylase, protease and lipase finish every nutrient.' };
      if (!ui.bileOn && ui.pancreasOn) return { tone: 'warn', line: 'Lipase is crawling on those big droplets — without bile it barely finds the fat. Add bile to see it race.' };
      if (!ui.villiOpen) return { tone: 'info', line: 'End-products are forming. Tap the intestine wall to open the villi magnifier and watch absorption.' };
      if (ui.absorbedGlucose > 0) return { tone: 'good', line: `Nutrients are crossing into the villi — ${ui.absorbedGlucose} glucose particles absorbed so far.` };
      return { tone: 'info', line: 'Everything is flowing — glucose squares, amino-acid triangles and fatty-acid droplets heading for the blood.' };
    }
    if (ui.region === 'colon') return { tone: 'info', line: 'The colon reclaims water — the leftover fibre firms up on its slow way to the rectum.' };
    if (ui.journeyDone && !conclusionOk) return { tone: 'good', line: 'Journey complete. Open Observations: your table, the nutrient curves and the two conclusion questions are waiting.' };
    if (conclusionOk) return { tone: 'good', line: 'Digestion understood — enzymes specific by shape, fat sped by bile. Beautiful work.' };
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [ui, conclusionOk]);

  // ---- status ----------------------------------------------------------------------
  const complete = ui.journeyDone && conclusionOk;
  const statusText = ui.journeyDone
    ? 'Journey complete'
    : ui.region === 'mouth' ? 'Ready in the mouth'
      : ui.region === 'esophagus' ? 'Peristalsis in progress'
        : ui.region === 'stomach' ? 'Churning in the stomach'
          : ui.region === 'si' ? 'Digesting + absorbing'
            : 'Water reclaim in the colon';

  const resetAll = () => {
    sim.current = makeSim();
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setQ1('');
    setQ2('');
    setConclusionOk(false);
    setSawObservations(false);
    syncUi();
  };

  const totalDigested = Math.round(((100 - ui.starch) + (100 - ui.protein) + (100 - ui.fat)) / 3);
  const phPct = clamp((ui.pH / 14) * 100, 2, 100);
  const regionActions = (() => {
    if (ui.region === 'mouth') {
      return (
        <>
          <button className="dig-mini" type="button" data-nudge="chew" onClick={() => { chew(); notePointer(true); }}>Chew</button>
          <button className="dig-mini" type="button" data-nudge="swallow" disabled={ui.chew < 0.5} onClick={() => { swallow(); notePointer(true); }}>
            {ui.chew < 0.5 ? 'Swallow (chew first)' : 'Swallow'}
          </button>
        </>
      );
    }
    if (ui.region === 'stomach') {
      return (
        <>
          <button className="dig-mini" type="button" onClick={() => { churn(); notePointer(true); }}>Churn</button>
          <button className="dig-mini" type="button" data-nudge="chyme" disabled={ui.protein > 65} onClick={() => { releaseChyme(); notePointer(true); }}>
            {ui.protein > 65 ? 'Release chyme (digest more)' : 'Release chyme'}
          </button>
        </>
      );
    }
    if (ui.region === 'si') {
      return (
        <button className="dig-mini" type="button" data-nudge="villi" onClick={() => { toggleVilli(); notePointer(true); }}>
          {ui.villiOpen ? 'Close villi view' : 'Villi magnifier'}
        </button>
      );
    }
    return null;
  })();

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'active'}
      captionChip="A sandwich, mouth to rectum"
      legend={[
        { color: '#d9a441', label: 'Starch (bread)' },
        { color: '#c05a5a', label: 'Protein' },
        { color: '#e8c84a', label: 'Fat droplets' },
        { color: '#f97316', label: 'Glucose (absorbed)' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start the journey', onClick: () => setMentorAcked(true) }
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
          aria-label="Digestive system cutaway — drag enzyme tokens onto organs, tap the mouth to chew, tap the intestine for the villi magnifier"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              if (nextAction.run) { nextAction.run(); notePointer(true); }
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div className="dig-controls">
          <div className="dig-now-row">
            <span className="dig-now-chip">Now in: <strong>{REGION_NAME[ui.region]}</strong></span>
            <span className={`dig-ph-chip ${ui.pH <= 3 && ui.region === 'stomach' ? 'acid' : ''}`}>
              pH <strong>{ui.pH.toFixed(1)}</strong>
            </span>
            <span className="dig-clock">⏱ {fmtClock(ui.time)}</span>
          </div>

          <button
            className="action-button"
            type="button"
            disabled={!nextAction.run}
            onClick={() => { if (nextAction.run) { nextAction.run(); notePointer(true); } }}
          >
            <span className="dispense-icon" aria-hidden="true">◇</span>
            <span>{nextAction.label}</span>
            <small>{nextAction.small}</small>
          </button>

          <div className="dig-meters">
            <Meter label="Starch left" value={ui.starch} color="#d9a441" />
            <Meter label="Protein left" value={ui.protein} color="#c05a5a" />
            <Meter label="Fat left" value={ui.fat} color="#e8c84a" />
          </div>

          <div className="dig-tokens">
            {TOKENS.map((tok) => {
              const on = tok.id === 'saliva' ? ui.salivaOn
                : tok.id === 'gastric' ? ui.gastric > 0
                  : tok.id === 'bile' ? ui.bileOn : ui.pancreasOn;
              const apply = tok.id === 'saliva' ? addSaliva
                : tok.id === 'gastric' ? addGastric
                  : tok.id === 'bile' ? addBile : addPancreas;
              const nudgeId = tok.id === 'saliva' ? 'saliva' : tok.id === 'gastric' ? 'juice' : tok.id === 'bile' ? 'bile' : 'pancreas';
              return (
                <div key={tok.id} className={`dig-token ${on ? 'on' : ''}`} data-nudge={nudgeId}>
                  <span className="dig-token-dot" style={{ background: tok.color }} aria-hidden="true" />
                  <div className="dig-token-text">
                    <strong>{tok.name}</strong>
                    <small>{tok.target}</small>
                  </div>
                  <button type="button" onClick={() => { apply(); notePointer(true); }} aria-label={`Add ${tok.name}`}>
                    {on ? '✓ added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>

          {regionActions && <div className="dig-region-actions">{regionActions}</div>}

          <div className="dig-enzyme-chips">
            <span className={ui.salivaOn ? 'on' : ''}>Amylase · saliva</span>
            <span className={ui.pepsinActive ? 'on' : ''}>Pepsin · pH {ui.region === 'stomach' ? ui.pH.toFixed(1) : '—'}</span>
            <span className={ui.bileOn ? 'on' : ''}>Bile · emulsifier</span>
            <span className={ui.pancreasOn ? 'on' : ''}>Pancreatic trio</span>
          </div>

          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Each enzyme attacks only its own substrate: amylase→starch, pepsin→protein (only near pH 2), lipase→fat — and lipase races once bile has misted the droplets. Everything you add is recorded per region in Observations.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Gut readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Total digested (all three nutrients)</span>
            <strong>{totalDigested}<small>%</small></strong>
            <div className="reading-track"><span style={{ width: `${totalDigested}%` }} /></div>
            <div className="reading-scale"><span>start</span><span>fully digested</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Region</span><strong>{REGION_NAME[ui.region]}</strong></div>
            <div><span>pH here</span><strong>{ui.pH.toFixed(1)}</strong></div>
            <div><span>Starch left</span><strong>{ui.starch}%</strong></div>
            <div><span>Protein left</span><strong>{ui.protein}%</strong></div>
            <div><span>Fat left</span><strong>{ui.fat}%</strong></div>
            <div><span>Glucose absorbed</span><strong>{ui.absorbedGlucose}</strong></div>
            <div><span>Chew thoroughness</span><strong>{Math.round(ui.chew * 100)}%</strong></div>
            <div><span>Journey clock</span><strong>{fmtClock(ui.time)}</strong></div>
          </div>
          <div className="dig-ph-strip" aria-hidden="true">
            <div className="dig-ph-scale">
              <span style={{ left: `${phPct}%` }} className="dig-ph-marker" />
            </div>
            <div className="dig-ph-labels"><span>0 acid</span><span>7 neutral</span><span>14 alkaline</span></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>The journey, step by step</h3>
            <ol>
              <li><strong>Mouth</strong> — drag the saliva token onto the mouth, then chew (tap the mouth or press Chew) until the starch is well broken down.</li>
              <li><strong>Swallow</strong> — peristaltic waves ripple the bolus down the esophagus. Watch the tube squeeze behind it.</li>
              <li><strong>Stomach</strong> — drag gastric juice in twice, until the pH reads about 2. Pepsin carves protein; churn to mix. Release the chyme.</li>
              <li><strong>Small intestine</strong> — drag bile from the gall bladder: fat mists into micro-droplets. Add pancreatic juice: every nutrient races to its end-product.</li>
              <li><strong>Villi</strong> — tap the intestine wall and watch glucose, amino acids and fatty acids cross into the capillaries.</li>
              <li><strong>Colon</strong> — water is reclaimed, fibre firms, and the journey ends at the rectum. Then answer the conclusion in Observations.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Each addition is your independent action — skip one and its nutrient survives the whole journey. The percentage table tells the truth about what you did.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Breakdown by region</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Each region records a row the moment the food leaves it — percentages of each nutrient still undigested.</p>
            ) : (
              <table className="trial-table dig-table">
                <thead><tr><th>Region</th><th>Enzymes added</th><th>pH</th><th>Starch %</th><th>Protein %</th><th>Fat %</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.region}</td>
                      <td>{r.enzymes}</td>
                      <td>{r.pH.toFixed(1)}</td>
                      <td>{r.starch}</td>
                      <td>{r.protein}</td>
                      <td>{r.fat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 style={{ marginTop: 16 }}>Nutrient curves along the journey</h3>
            <NutrientChart rows={rows} />

            <h3 style={{ marginTop: 16 }}>Enzyme reference</h3>
            <table className="trial-table dig-table dig-enzymes">
              <thead><tr><th>Enzyme</th><th>Source</th><th>Substrate</th><th>End-product</th><th>Optimum</th></tr></thead>
              <tbody>
                {ENZYME_ROWS.map((r) => {
                  const on = r.flag === 'saliva' ? ui.salivaOn
                    : r.flag === 'pepsin' ? ui.pepsinWasActive || ui.gastric > 0
                      : r.flag === 'bile' ? ui.bileOn : ui.pancreasOn;
                  return (
                    <tr key={r.id} className={on ? 'used' : ''}>
                      <td>{r.enzyme}</td><td>{r.source}</td><td>{r.substrate}</td><td>{r.product}</td><td>{r.opt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="observation-note">Rows light up as you actually use each secretion. Bile is marked “not an enzyme” — it never digests, it only emulsifies.</p>

            <h3 style={{ marginTop: 16 }}>Conclusion</h3>
            <div className="dig-conclusion" data-nudge="conclusion">
              <label>
                <span>Why is each digestive enzyme specific to one substrate?</span>
                <select value={q1} onChange={(e) => setQ1(e.target.value)} aria-label="Answer for enzyme specificity">
                  <option value="">Choose an answer…</option>
                  <option value="a">Each enzyme&apos;s active site is a shape that fits only its substrate — amylase grips starch, pepsin grips protein.</option>
                  <option value="b">Enzymes digest every food equally, just at different speeds.</option>
                  <option value="c">Stomach acid activates all enzymes in the same way.</option>
                </select>
              </label>
              <label>
                <span>Why does fat need bile before lipase can work quickly?</span>
                <select value={q2} onChange={(e) => setQ2(e.target.value)} aria-label="Answer for bile and fat">
                  <option value="">Choose an answer…</option>
                  <option value="a">Bile chemically splits fat into fatty acids and glycerol itself.</option>
                  <option value="b">Bile shatters big droplets into a mist, multiplying the surface area lipase can attack.</option>
                  <option value="c">Bile raises the pH so that lipase can survive.</option>
                </select>
              </label>
              <button type="button" className="record-button" onClick={() => { checkConclusion(); notePointer(true); }}>
                {conclusionOk ? '✔ Conclusion correct' : 'Check my answers'}
              </button>
              {conclusionOk && <p className="dig-conclusion-ok">Lock and key + surface area — the two ideas that explain this whole journey.</p>}
            </div>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Digestion is chemistry arranged as a journey. Each station adds one set of conditions, and each enzyme is a protein whose <strong>active site</strong> is shaped to grip exactly one kind of molecule — the lock-and-key idea. Amylase only ever meets starch, pepsin only protein, lipase only fat. That is why a missing secretion is never partially forgiven: skip bile and fat largely survives the whole tract.</p>
            <p>Conditions matter as much as shapes. Pepsin is built for the stomach&apos;s acid (optimum pH ≈ 2) and stops working in the alkaline small intestine, where pancreatic enzymes prefer pH ≈ 8. The pancreas also floods in bicarbonate, which is why the environment — and the enzyme cast — changes as the food moves on.</p>
            <p>Fat is the awkward nutrient: it separates into big droplets, and lipase can only attack the surface. Bile salts break those droplets into a fine mist — emulsification, a physical change, not digestion — multiplying the surface area many times over so lipase races through the same amount of work.</p>
            <p>The final act is absorption. The intestinal wall is folded into villi, and those into microvilli, giving a huge surface where glucose, amino acids and fatty acids cross into capillaries. What remains — mostly fibre and water — is compacted in the colon: water is reclaimed, the residue firms, and the journey ends.</p>
            <ul>
              <li>Peristalsis: circular muscle waves that squeeze food onward — the esophagus can push a bolus even upside down.</li>
              <li>Chewing and churning are mechanical digestion: smaller pieces mean more surface for the same enzymes.</li>
              <li>The percentages in your table are the experiment: they move only when the right enzyme meets the right substrate in the right pH.</li>
            </ul>
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

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="dig-meter">
      <span>{label}</span>
      <div className="dig-meter-track"><span style={{ width: `${value}%`, background: color }} /></div>
      <strong>{value}%</strong>
    </div>
  );
}

function NutrientChart({ rows }: { rows: RowData[] }) {
  if (rows.length < 2) {
    return <p className="observation-note">Two or more recorded regions draw the curves — keep travelling.</p>;
  }
  const W = 340;
  const H = 190;
  const L = 40;
  const R = 12;
  const T = 14;
  const B = 30;
  const xs = rows.map((_, i) => L + (i * (W - L - R)) / Math.max(1, rows.length - 1));
  const yv = (v: number) => T + (1 - v / 100) * (H - T - B);
  const series: { key: 'starch' | 'protein' | 'fat'; color: string; label: string }[] = [
    { key: 'starch', color: '#d9a441', label: 'Starch' },
    { key: 'protein', color: '#c05a5a', label: 'Protein' },
    { key: 'fat', color: '#c9a520', label: 'Fat' },
  ];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="dig-chart" role="img" aria-label="Percentage of each nutrient remaining along the digestive journey">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yv(v)} y2={yv(v)} stroke="#d7dee6" strokeWidth={1} />
            <text x={L - 6} y={yv(v) + 3} textAnchor="end" fontSize={9} fill="#8a96a4">{v}</text>
          </g>
        ))}
        <text x={6} y={T + 4} fontSize={9} fill="#8a96a4">%</text>
        {series.map((sr) => (
          <g key={sr.key}>
            <polyline
              fill="none"
              stroke={sr.color}
              strokeWidth={2.2}
              strokeLinejoin="round"
              points={rows.map((r, i) => `${xs[i]},${yv(r[sr.key])}`).join(' ')}
            />
            {rows.map((r, i) => (
              <circle key={i} cx={xs[i]} cy={yv(r[sr.key])} r={3} fill={sr.color} />
            ))}
          </g>
        ))}
        {rows.map((r, i) => (
          <text key={r.region} x={xs[i]} y={H - 10} textAnchor="middle" fontSize={8.5} fill="#5d6a79">
            {r.region === 'Esophagus' ? 'Gullet' : r.region === 'Small intestine' ? 'Sm. intestine' : r.region}
          </text>
        ))}
      </svg>
      <div className="dig-chart-legend">
        {series.map((sr) => (
          <span key={sr.key}><i style={{ background: sr.color }} />{sr.label} % remaining</span>
        ))}
      </div>
    </div>
  );
}
