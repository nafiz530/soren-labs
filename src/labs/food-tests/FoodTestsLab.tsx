import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './food-tests.css';

/**
 * Food test kitchen — Benedict's, iodine, biuret and the ethanol emulsion test
 * on a bench of real food samples plus one masked mystery sample per session.
 *
 * The student drags food jars into a test tube, pours reagents by dragging the
 * bottles over the tube mouth, gives Benedict's its honest hot-water-bath trip
 * (about thirty simulated seconds, colour graded blue → green → yellow →
 * brick-red by sugar concentration), shakes the ethanol charge and pours it
 * into the water beaker for the emulsion test. Every verdict in the results
 * table comes from the colour the student actually saw — including the
 * inconclusive rows earned by lifting Benedict's out of the bath too early.
 */

// ---------------------------------------------------------------- constants

type SampleId = 'potato' | 'glucose' | 'eggwhite' | 'oil' | 'milk' | 'bread' | 'mystery';
type ReagentId = 'iodine' | 'benedicts' | 'biuret' | 'ethanol';
type Nutrient = 'starch' | 'sugar' | 'protein' | 'fat';
type Verdict = 'pos' | 'neg' | 'trace' | 'unclear';
type Cell = 'yes' | 'trace' | 'no' | '';

interface Nutrients { starch: number; sugar: number; protein: number; fat: number }

const BEN_TIME = 30;          // simulated seconds of bath heat for full colour
const SHAKE_NEED = 6;         // direction reversals to dissolve the fat
const IODINE_DEV = 2.2;       // s of simulated time for the iodine colour
const BIURET_DEV = 4;         // s of simulated time for the biuret colour
const POUR_TIME = 1.4;        // s of real time for a reagent pour
const BEAKER_POUR_TIME = 1.6; // s of real time to pour into the water beaker
const EMULSION_SETTLE = 2.4;  // s of simulated time for the emulsion to settle

const NUTRIENTS: Nutrient[] = ['starch', 'sugar', 'protein', 'fat'];

const MYSTERY_KINDS = [
  { id: 'honey', label: 'Honey', chip: 'heavy reducing sugar', nutrients: { starch: 0, sugar: 1, protein: 0, fat: 0 } },
  { id: 'ricewater', label: 'Rice water', chip: 'starchy', nutrients: { starch: 1, sugar: 0, protein: 0, fat: 0 } },
  { id: 'seedextract', label: 'Sunflower-seed extract', chip: 'oily', nutrients: { starch: 0, sugar: 0, protein: 0, fat: 1 } },
  { id: 'meatbroth', label: 'Lean-meat broth', chip: 'protein-rich', nutrients: { starch: 0, sugar: 0, protein: 1, fat: 0 } },
] as const;

const SAMPLES: { id: SampleId; label: string; jar: string; lid: string; liquid: string; note: string }[] = [
  { id: 'potato', label: 'Potato', jar: '#e8dfc8', lid: '#b08050', liquid: '#efeadb', note: 'the classic starch positive' },
  { id: 'glucose', label: 'Glucose solution', jar: '#dff0f7', lid: '#3f8fb0', liquid: '#e9f4f9', note: 'pure reducing sugar' },
  { id: 'eggwhite', label: 'Egg white', jar: '#f6f3ea', lid: '#c9b98a', liquid: '#f4f1e6', note: 'the classic protein positive' },
  { id: 'oil', label: 'Cooking oil', jar: '#ecd9a0', lid: '#a8853c', liquid: '#e6c86e', note: 'the classic fat positive' },
  { id: 'milk', label: 'Milk', jar: '#f7f5ef', lid: '#9aa7b3', liquid: '#f5f3ec', note: 'protein plus a trace of sugar' },
  { id: 'bread', label: 'Bread', jar: '#dfc491', lid: '#96703c', liquid: '#e3caa0', note: 'starch with a little sugar' },
  { id: 'mystery', label: 'Mystery sample', jar: '#cfd4d9', lid: '#5d6570', liquid: '#d9dde1', note: 'masked — you name it from your colours' },
];

const REAGENTS: { id: ReagentId; label: string; short: string; testLabel: string; body: string; cap: string }[] = [
  { id: 'iodine', label: 'Iodine solution', short: 'Iodine', testLabel: 'Starch test', body: '#c07a2a', cap: '#7a4a1e' },
  { id: 'benedicts', label: "Benedict's reagent", short: "Benedict's", testLabel: 'Reducing-sugar test', body: '#2b62cf', cap: '#1d3f8f' },
  { id: 'biuret', label: 'Biuret reagent', short: 'Biuret', testLabel: 'Protein test', body: '#a9c7e2', cap: '#5d7f9c' },
  { id: 'ethanol', label: 'Ethanol + water', short: 'Ethanol', testLabel: 'Emulsion test for fat', body: '#e6eef4', cap: '#8fa2ae' },
];

const BEN_COLOURS = ['#2b62cf', '#4f9d5c', '#d3c23e', '#dd8a33', '#b23a2b'];
const BEN_LABELS = ['stays blue', 'green', 'yellow', 'orange', 'brick-red'];
const IODINE_POS = '#232b45';
const IODINE_NEG = '#c07a2a';
const BIURET_POS = '#8f68b5';
const BIURET_NEG = '#a9c7e2';

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'load', title: 'Load a sample', detail: 'Drag a food jar from the shelf into the test tube. Start with the potato — it is the friendliest starch positive — and keep the masked jar for when your technique is sharp.', hint: 'Or pick a sample in the panel below and press “Load into tube”.' },
  { id: 'iodine', title: 'Run the iodine test', detail: 'Drag the amber iodine bottle over the tube mouth and pour. Starch turns it blue-black; anything else leaves it orange-brown.', hint: 'The colour settles within a couple of seconds — the row banks itself.' },
  { id: 'benedicts', title: "Benedict's, with the bath trip", detail: "Rinse, load a fresh sample, pour Benedict's, then drag the tube into the hot water bath and hold — roughly thirty simulated seconds takes blue through green and yellow to brick-red.", hint: 'No heat, no colour: at bench temperature Benedict’s stays stubbornly blue.' },
  { id: 'biuret', title: 'Biuret for protein', detail: 'Pour biuret onto a fresh sample. Protein turns it violet; anything else leaves it pale blue. Egg white is the classic control.', hint: 'One reagent per charge — rinse the tube between tests.' },
  { id: 'ethanol', title: 'Ethanol emulsion for fat', detail: 'Add ethanol, shake the tube hard — drag it side-to-side — then pour it into the water beaker. Dissolved fat makes a cloudy white emulsion; no fat stays clear.', hint: 'An unshaken pour gives only a faint wisp: honest, but inconclusive.' },
  { id: 'deduce', title: 'Deduce the mystery food', detail: 'Run the full panel on the masked sample, read your nutrient matrix, then name the food from the four chips in Observations.', hint: 'Your own colour rows are the only evidence that counts.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-positive', title: 'First positive', icon: '✦', detail: 'Any food turned a reagent its positive colour.' },
  { id: 'patient-heater', title: 'Patient heater', icon: '🔥', detail: "Held Benedict's in the bath all the way to brick-red." },
  { id: 'full-panel', title: 'Full panel', icon: '⚗', detail: 'Ran all four reagents at least once.' },
  { id: 'full-matrix', title: 'Full matrix', icon: '▦', detail: 'Resolved every nutrient cell for all seven samples.' },
  { id: 'mystery-solved', title: 'Mystery solved', icon: '🔍', detail: 'Named the masked food from your own colour rows.' },
];

const meta = getLabBySlug('food-tests')!;

// ---------------------------------------------------------------- types

interface ResultRow {
  id: number;
  sample: SampleId;
  sampleLabel: string;
  test: ReagentId;
  testLabel: string;
  reagentLabel: string;
  colourHex: string;
  colourLabel: string;
  verdict: Verdict;
  verdictText: string;
  heatFrac: number;
  stage: number;
}

interface UiSnap {
  holding: string;
  hasSample: boolean;
  sampleId: SampleId | null;
  sample: string;
  hasReagent: boolean;
  reagentId: ReagentId | null;
  reagent: string;
  colourLabel: string;
  colourHex: string;
  inBath: boolean;
  bathTemp: number;
  benHeat: number;
  shake: number;
  dissolved: boolean;
  flame: boolean;
  pouring: boolean;
  beakerPour: boolean;
  devT: number;
  banked: boolean;
}

interface DragState {
  kind: 'sample' | 'reagent' | 'tube';
  id: SampleId | ReagentId | null;
  x: number;
  y: number;
  dir: number;
  lastX: number;
  lastSlide: number;
}

interface Sim {
  t: number;
  sample: SampleId | null;
  reagent: ReagentId | null;
  colourT: number;
  settleT: number;
  banked: boolean;
  benHeat: number;
  benStageF: number;
  benLifted: boolean;
  benLiftSettle: number;
  shake: number;
  dissolved: boolean;
  wobble: number;
  pourT: number;
  pourReagent: ReagentId | null;
  pourFrom: { x: number; y: number };
  pourBeakerT: number;
  emulT: number;
  emulKind: 'pos' | 'faint' | 'neg' | null;
  pendingRow: ResultRow | null;
  pendingSettle: number;
  tubeInBath: boolean;
  tubeX: number;
  tubeY: number;
  needsSnap: boolean;
  bathHeat: number;
  flame: boolean;
  drag: DragState | null;
  lastSlosh: number;
  uiAcc: number;
  motes: { fx: number; fy: number; r: number; ph: number; sp: number }[];
}

function freshSim(): Sim {
  return {
    t: 0,
    sample: null,
    reagent: null,
    colourT: 0,
    settleT: 0,
    banked: false,
    benHeat: 0,
    benStageF: 0,
    benLifted: false,
    benLiftSettle: 0,
    shake: 0,
    dissolved: false,
    wobble: 0,
    pourT: -1,
    pourReagent: null,
    pourFrom: { x: 0, y: 0 },
    pourBeakerT: -1,
    emulT: 0,
    emulKind: null,
    pendingRow: null,
    pendingSettle: 0,
    tubeInBath: false,
    tubeX: -9999,
    tubeY: -9999,
    needsSnap: true,
    bathHeat: 0,
    flame: true,
    drag: null,
    lastSlosh: 0,
    uiAcc: 0,
    motes: Array.from({ length: 16 }, () => ({
      fx: Math.random(),
      fy: 0.12 + Math.random() * 0.8,
      r: 0.9 + Math.random() * 1.6,
      ph: Math.random() * 6.28,
      sp: 0.4 + Math.random() * 1.2,
    })),
  };
}

// ---------------------------------------------------------------- helpers

function nutrientsOf(id: SampleId, mk: number): Nutrients {
  switch (id) {
    case 'potato': return { starch: 1, sugar: 0, protein: 0, fat: 0 };
    case 'glucose': return { starch: 0, sugar: 1, protein: 0, fat: 0 };
    case 'eggwhite': return { starch: 0, sugar: 0, protein: 1, fat: 0 };
    case 'oil': return { starch: 0, sugar: 0, protein: 0, fat: 1 };
    case 'milk': return { starch: 0, sugar: 0.22, protein: 1, fat: 0 };
    case 'bread': return { starch: 1, sugar: 0.35, protein: 0, fat: 0 };
    case 'mystery': return MYSTERY_KINDS[mk].nutrients;
  }
}

/** Benedict's colour stage (0 = blue … 4 = brick-red) at full heating. */
function benStage(sugar: number): number {
  if (sugar >= 0.9) return 4;
  if (sugar >= 0.5) return 3;
  if (sugar >= 0.28) return 2;
  if (sugar >= 0.12) return 1;
  return 0;
}

function sampleLabelOf(id: SampleId): string {
  return SAMPLES.find((s) => s.id === id)?.label ?? id;
}

function reagentDef(id: ReagentId) {
  return REAGENTS.find((r) => r.id === id)!;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const k = clamp(t, 0, 1);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
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

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// ---------------------------------------------------------------- layout

interface BenchLayout {
  narrow: boolean;
  k: number;
  benchY: number;
  shelfY: number;
  jarW: number;
  jarH: number;
  jars: { x: number; y: number }[];
  shelfW: number;
  rackX: number;
  rackW: number;
  botW: number;
  botH: number;
  bottles: { x: number; y: number }[];
  standX: number;
  tubeH: number;
  tubeW: number;
  tubeHome: { x: number; y: number };
  bathCx: number;
  bathW: number;
  bathH: number;
  bathBase: number;
  bathTop: number;
  waterY: number;
  bathTubeY: number;
  beakerX: number;
  beakerW: number;
  beakerH: number;
  beakerBase: number;
  beakerTop: number;
}

function layout(w: number, h: number): BenchLayout {
  const narrow = w < 660;
  const k = narrow ? Math.max(0.66, w / 660) : 1;
  const benchY = h * (narrow ? 0.9 : 0.86);
  const shelfY = Math.max(76, h * (narrow ? 0.27 : 0.25));
  const jarW = Math.round(36 * k);
  const jarH = Math.round(44 * k);
  const shelfW = narrow ? Math.min(w * 0.56, jarW * 7 + 48) : Math.min(w * 0.46, jarW * 7 + 48);
  const perRow = Math.max(4, Math.floor((shelfW - 6) / (jarW + 8)));
  const jars = SAMPLES.map((_, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    return { x: 10 + jarW / 2 + col * (jarW + 8), y: shelfY - jarH / 2 - row * (jarH + 10) };
  });
  const rackW = Math.round(4 * 30 * k + 3 * 14 + 24);
  const rackX = w - rackW - 10;
  const botW = Math.round(30 * k);
  const botH = Math.round(58 * k);
  const bottles = REAGENTS.map((_, i) => ({
    x: rackX + 12 + botW / 2 + i * (botW + 14),
    y: shelfY - botH / 2,
  }));
  const tubeH = Math.round(112 * (narrow ? Math.max(0.7, k + 0.06) : 1));
  const tubeW = Math.max(18, Math.round(tubeH * 0.24));
  const standX = narrow ? w * 0.22 : w * 0.3;
  const beakerX = narrow ? w * 0.58 : w * 0.52;
  const bathCx = narrow ? w * 0.84 : w * 0.78;
  const bathW = Math.round(94 * k + 12);
  const bathH = Math.round(92 * k + 6);
  const bathBase = benchY - Math.round(58 * k);
  const bathTop = bathBase - bathH;
  const waterY = bathTop + Math.round(13 * k);
  const beakerW = Math.round(66 * k + 8);
  const beakerH = Math.round(62 * k + 8);
  const beakerBase = benchY;
  return {
    narrow, k, benchY, shelfY, jarW, jarH, jars, shelfW, rackX, rackW, botW, botH, bottles,
    standX, tubeH, tubeW,
    tubeHome: { x: standX, y: benchY - tubeH - Math.round(36 * k) },
    bathCx, bathW, bathH, bathBase, bathTop, waterY,
    bathTubeY: waterY - tubeH + Math.round(34 * k),
    beakerX, beakerW, beakerH, beakerBase,
    beakerTop: beakerBase - beakerH,
  };
}

// ---------------------------------------------------------------- drawing

function drawJar(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, id: SampleId, lid: string, liquid: string, t: number) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, 6);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = liquid;
  ctx.fillRect(x, y + h * 0.42, w, h * 0.58);
  ctx.restore();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.fillStyle = lid;
  roundRect(ctx, x + 1, y - 7, w - 2, 9, 3);
  ctx.fill();
  const gx = x + w * 0.24 + Math.sin(t * 0.7 + cx * 0.05) * 1.6;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  roundRect(ctx, gx, y + 5, 3, h * 0.52, 2);
  ctx.fill();
  // the masked mystery sample wears a cloth cover
  if (id === 'mystery') {
    ctx.fillStyle = '#5f6874';
    roundRect(ctx, x - 3, y - 10, w + 6, h * 0.62, 7);
    ctx.fill();
    ctx.strokeStyle = '#464e58';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + h * 0.16);
    ctx.lineTo(x + w + 3, y + h * 0.16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, x + 2, y - 7, w * 0.3, h * 0.5, 4);
    ctx.fill();
  }
}

function drawBottle(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, body: string, cap: string, t: number, angle: number, glintSeed: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fill();
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.clip();
  ctx.fillStyle = body;
  ctx.fillRect(-w / 2, -h / 2 + h * 0.4, w, h * 0.6);
  ctx.restore();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.stroke();
  ctx.fillStyle = cap;
  roundRect(ctx, -w / 2 + 3, -h / 2 - 8, w - 6, 10, 3);
  ctx.fill();
  // moving glint
  const gxo = -w * 0.16 + Math.sin(t * 0.9 + glintSeed) * w * 0.12;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  roundRect(ctx, gxo, -h / 2 + 8, 3, h * 0.5, 2);
  ctx.fill();
  ctx.restore();
}

/** Test tube. (cx, topY) is the top-centre of the mouth. */
function drawTube(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  tw: number,
  th: number,
  liquid: string | null,
  fillFrac: number,
  precip: number,
  wobble: number,
  t: number,
) {
  ctx.save();
  ctx.translate(cx, topY + th / 2);
  ctx.rotate(Math.sin(t * 26) * 0.09 * wobble);
  const y0 = -th / 2;
  const botCy = y0 + th - tw / 2;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-tw / 2, y0);
    ctx.lineTo(-tw / 2, botCy);
    ctx.arc(0, botCy, tw / 2, Math.PI, 0, true);
    ctx.lineTo(tw / 2, y0);
    ctx.closePath();
  };
  if (liquid) {
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = liquid;
    const lvl = y0 + th * (1 - fillFrac);
    ctx.fillRect(-tw / 2 - 1, lvl, tw + 2, th + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, lvl, tw / 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (precip > 0) {
      const n = Math.round(precip * 9);
      ctx.fillStyle = 'rgba(120,32,24,0.85)';
      for (let i = 0; i < n; i += 1) {
        const a = (i * 2.399 + t * 0.15) % (Math.PI * 2);
        const rr = (tw / 2 - 4) * ((i % 3) / 2.4 + 0.15);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, botCy - 2 - ((i % 3) * 3.5), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.6;
  path();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, y0, tw / 2, 3.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-tw / 2 + 4, y0 + 9);
  ctx.lineTo(-tw / 2 + 4, botCy - 8);
  ctx.stroke();
  ctx.restore();
}

function drawBeakerGlass(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  w: number,
  h: number,
  water: string,
  waterLevel: number,
) {
  const x = cx - w / 2;
  const topY = baseY - h;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 2, topY + 4);
  ctx.lineTo(x + 2, baseY - 8);
  ctx.quadraticCurveTo(x + 2, baseY, x + 12, baseY);
  ctx.lineTo(x + w - 12, baseY);
  ctx.quadraticCurveTo(x + w - 2, baseY, x + w - 2, baseY - 8);
  ctx.lineTo(x + w - 2, topY + 4);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = water;
  ctx.fillRect(x, baseY - h * waterLevel, w, h * waterLevel + 4);
  ctx.restore();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 2, topY + 4);
  ctx.lineTo(x + 2, baseY - 8);
  ctx.quadraticCurveTo(x + 2, baseY, x + 12, baseY);
  ctx.lineTo(x + w - 12, baseY);
  ctx.quadraticCurveTo(x + w - 2, baseY, x + w - 2, baseY - 8);
  ctx.lineTo(x + w - 2, topY + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 2, topY + 6);
  ctx.lineTo(x - 3, topY + 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(cx, baseY - h * waterLevel, w / 2 - 4, 3, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function flameShape(ctx: CanvasRenderingContext2D, cx: number, baseY: number, hgt: number, halfW: number, fill: string, sway: number) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, baseY);
  ctx.quadraticCurveTo(cx - halfW * 0.9, baseY - hgt * 0.55, cx + sway, baseY - hgt);
  ctx.quadraticCurveTo(cx + halfW * 0.9, baseY - hgt * 0.55, cx + halfW, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawBunsen(ctx: CanvasRenderingContext2D, cx: number, benchY: number, k: number, t: number, on: boolean) {
  ctx.fillStyle = '#39485c';
  roundRect(ctx, cx - 7 * k - 3, benchY - 34 * k, 14 * k + 6, 34 * k, 4);
  ctx.fill();
  ctx.fillStyle = '#2c3949';
  roundRect(ctx, cx - 16 * k, benchY - 7, 32 * k, 7, 3);
  ctx.fill();
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.arc(cx, benchY - 26 * k, 2.6 * k + 1, 0, Math.PI * 2);
  ctx.fill();
  if (!on) return;
  const flick = Math.sin(t * 11) * 0.5 + Math.sin(t * 17 + 1.7) * 0.3 + Math.sin(t * 29) * 0.2;
  const hgt = (34 + flick * 5) * k;
  const sway = flick * 3;
  flameShape(ctx, cx, benchY - 33 * k, hgt, 11 * k, 'rgba(249,115,22,0.5)', sway);
  flameShape(ctx, cx, benchY - 33 * k, hgt * 0.62, 7 * k, 'rgba(251,211,107,0.8)', sway * 0.6);
  flameShape(ctx, cx, benchY - 33 * k, hgt * 0.3, 4.5 * k, 'rgba(122,179,224,0.9)', sway * 0.3);
}

function drawTripod(ctx: CanvasRenderingContext2D, cx: number, baseY: number, topY: number, w: number) {
  ctx.strokeStyle = '#4a5a6c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + 4, topY + 2);
  ctx.lineTo(cx - w / 2 + 12, baseY);
  ctx.moveTo(cx + w / 2 - 4, topY + 2);
  ctx.lineTo(cx + w / 2 - 12, baseY);
  ctx.moveTo(cx - w / 2 + 4, topY + 2);
  ctx.lineTo(cx + w / 2 - 4, topY + 2);
  ctx.stroke();
  ctx.fillStyle = '#c3ccd6';
  roundRect(ctx, cx - w / 2 - 4, topY - 3, w + 8, 5, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,104,120,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = -w / 2; gx <= w / 2; gx += 7) {
    ctx.moveTo(cx + gx, topY - 2);
    ctx.lineTo(cx + gx, topY + 1);
  }
  ctx.stroke();
}

function drawSteam(ctx: CanvasRenderingContext2D, x: number, yTop: number, heat: number, t: number) {
  if (heat <= 0.15) return;
  for (let i = 0; i < 3; i += 1) {
    const ph = (t * 0.22 + i * 0.37) % 1;
    const a = heat * 0.4 * (1 - ph) * (ph > 0.08 ? 1 : ph / 0.08);
    const bx = x + (i - 1) * 11;
    ctx.strokeStyle = `rgba(174,190,203,${a.toFixed(3)})`;
    ctx.lineWidth = 5 - i;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const yy = yTop - ph * 52;
    ctx.moveTo(bx + Math.sin(t * 1.1 + i * 2.1) * 5, yy);
    ctx.quadraticCurveTo(bx + Math.sin(t * 1.1 + i * 2.1 + 1) * 9, yy - 12, bx + Math.sin(t * 1.1 + i * 2.1 + 2) * 7, yy - 24);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawStand(ctx: CanvasRenderingContext2D, L: BenchLayout) {
  const rodX = L.standX - L.tubeW - 16;
  ctx.fillStyle = '#3a4656';
  roundRect(ctx, rodX - 22, L.benchY - 7, 44, 8, 3);
  ctx.fill();
  ctx.fillStyle = '#4a5a6c';
  roundRect(ctx, rodX - 3, L.tubeHome.y + 14, 6, L.benchY - L.tubeHome.y - 15, 3);
  ctx.fill();
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, rodX + 2, L.tubeHome.y + 26, L.tubeW + 16, 7, 3);
  ctx.fill();
  ctx.strokeStyle = '#8a96a4';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(L.standX, L.tubeHome.y + 44, L.tubeW * 0.72, -1.9, 1.9);
  ctx.stroke();
}

function dashedRing(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string) {
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- component

export default function FoodTestsLab() {
  const sim = useRef<Sim>(freshSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rowsRef = useRef<ResultRow[]>([]);

  // ---- student-facing state ------------------------------------------------
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [selectedSample, setSelectedSample] = useState<SampleId>('potato');
  const [speed, setSpeed] = useState(1);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [solved, setSolved] = useState(false);
  const [wrongPick, setWrongPick] = useState<number | null>(null);
  const [mysteryKind, setMysteryKind] = useState(() => Math.floor(Math.random() * MYSTERY_KINDS.length));
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({
    holding: '', hasSample: false, sampleId: null, sample: '', hasReagent: false, reagentId: null, reagent: '',
    colourLabel: '', colourHex: '#ffffff', inBath: false, bathTemp: 21, benHeat: 0, shake: 0, dissolved: false,
    flame: true, pouring: false, beakerPour: false, devT: 0, banked: false,
  });

  const mysteryRef = useRef(mysteryKind);
  mysteryRef.current = mysteryKind;

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

  // ---- UI snapshot -----------------------------------------------------------
  const syncUi = useCallback(() => {
    const s = sim.current;
    let holding = '';
    if (s.drag) {
      if (s.drag.kind === 'sample') holding = sampleLabelOf(s.drag.id as SampleId);
      else if (s.drag.kind === 'reagent') holding = reagentDef(s.drag.id as ReagentId).label;
      else holding = 'the test tube';
    }
    const sample = s.sample ? sampleLabelOf(s.sample) : '';
    const reagent = s.reagent ? reagentDef(s.reagent).short : '';
    let colourLabel = '';
    let colourHex = '#ffffff';
    if (s.sample && s.reagent === 'iodine') {
      const pos = nutrientsOf(s.sample, mysteryRef.current).starch > 0.5;
      colourHex = pos ? IODINE_POS : IODINE_NEG;
      colourLabel = s.colourT < 1 ? 'developing…' : pos ? 'blue-black' : 'orange-brown';
    } else if (s.sample && s.reagent === 'biuret') {
      const pos = nutrientsOf(s.sample, mysteryRef.current).protein > 0.5;
      colourHex = pos ? BIURET_POS : BIURET_NEG;
      colourLabel = s.colourT < 1 ? 'developing…' : pos ? 'violet' : 'pale blue';
    } else if (s.sample && s.reagent === 'benedicts') {
      const stage = Math.min(4, Math.floor(s.benStageF));
      colourHex = BEN_COLOURS[stage];
      colourLabel = s.benStageF <= 0.01 ? 'stays blue (unheated)' : BEN_LABELS[stage];
    } else if (s.sample && s.reagent === 'ethanol') {
      colourHex = s.dissolved ? '#dfe6ea' : '#e8eef2';
      colourLabel = s.dissolved ? 'opalescent' : 'clear';
    } else if (s.sample) {
      colourHex = SAMPLES.find((x) => x.id === s.sample)?.liquid ?? '#eef2f6';
      colourLabel = 'sample only';
    }
    setUi({
      holding,
      hasSample: !!s.sample,
      sampleId: s.sample,
      sample,
      hasReagent: !!s.reagent,
      reagentId: s.reagent,
      reagent,
      colourLabel,
      colourHex,
      inBath: s.tubeInBath,
      bathTemp: 21 + 74 * s.bathHeat,
      benHeat: s.benHeat,
      shake: s.shake,
      dissolved: s.dissolved,
      flame: s.flame,
      pouring: s.pourT >= 0,
      beakerPour: s.pourBeakerT >= 0,
      devT: s.colourT,
      banked: s.banked,
    });
  }, []);

  // ---- row banking -------------------------------------------------------------
  const commitRow = useCallback((row: ResultRow) => {
    row.id = rowsRef.current.length + 1;
    rowsRef.current = [...rowsRef.current, row];
    setRows(rowsRef.current);
    labSound.ping();
    if (row.verdict === 'pos') {
      pushToast('good', '◉', `Positive: ${row.sampleLabel} — ${row.verdictText}.`);
      earn('first-positive');
    } else if (row.verdict === 'neg') {
      pushToast('info', '○', `Negative: ${row.sampleLabel} — ${row.verdictText}.`);
    } else if (row.verdict === 'trace') {
      pushToast('info', '◔', `Trace: ${row.sampleLabel} — ${row.verdictText}.`);
    } else {
      pushToast('warn', '⚠', `Inconclusive: ${row.sampleLabel} — ${row.verdictText}.`);
      labSound.warn();
    }
    if (row.test === 'benedicts' && row.heatFrac >= 0.999 && row.stage >= 4) earn('patient-heater');
    if (new Set(rowsRef.current.map((r) => r.test)).size >= 4) earn('full-panel');
  }, [earn, pushToast]);

  /** Build the honest row for whatever is currently in the tube. */
  const chargeRow = useCallback((): ResultRow | null => {
    const s = sim.current;
    if (!s.sample || !s.reagent) return null;
    const sample = s.sample;
    const nut = nutrientsOf(sample, mysteryRef.current);
    const base = {
      id: 0,
      sample,
      sampleLabel: sampleLabelOf(sample),
      test: s.reagent,
      testLabel: reagentDef(s.reagent).testLabel,
      reagentLabel: reagentDef(s.reagent).label,
      heatFrac: 0,
      stage: 0,
    };
    if (s.reagent === 'iodine') {
      const pos = nut.starch > 0.5;
      const settled = s.colourT >= 0.95;
      return {
        ...base,
        colourHex: pos ? IODINE_POS : IODINE_NEG,
        colourLabel: pos ? 'blue-black' : 'orange-brown',
        verdict: !settled ? 'unclear' : pos ? 'pos' : 'neg',
        verdictText: !settled
          ? 'colour was still developing — read settled colours only'
          : pos
            ? 'starch present'
            : 'no starch detected',
        heatFrac: 1,
      };
    }
    if (s.reagent === 'biuret') {
      const pos = nut.protein > 0.5;
      const settled = s.colourT >= 0.95;
      return {
        ...base,
        colourHex: pos ? BIURET_POS : BIURET_NEG,
        colourLabel: pos ? 'violet / lilac' : 'pale blue',
        verdict: !settled ? 'unclear' : pos ? 'pos' : 'neg',
        verdictText: !settled
          ? 'colour was still developing — read settled colours only'
          : pos
            ? 'protein present'
            : 'no protein detected',
        heatFrac: 1,
      };
    }
    if (s.reagent === 'benedicts') {
      const stage = Math.min(4, Math.floor(s.benStageF + 0.0001));
      const heat = s.benHeat;
      let verdict: Verdict;
      let verdictText: string;
      if (stage >= 3) {
        verdict = 'pos';
        verdictText = stage >= 4 ? 'reducing sugar — concentrated (brick-red)' : 'reducing sugar — moderate (orange)';
      } else if (stage >= 1) {
        verdict = 'trace';
        verdictText = stage === 2 ? 'reducing sugar — weak (yellow)' : 'reducing sugar — trace (green)';
      } else if (heat >= 0.85) {
        verdict = 'neg';
        verdictText = 'no reducing sugar (stayed blue, fully heated)';
      } else {
        verdict = 'unclear';
        verdictText = 'stayed blue — never got a full hot-bath trip';
      }
      return {
        ...base,
        colourHex: BEN_COLOURS[stage],
        colourLabel: BEN_LABELS[stage],
        verdict,
        verdictText,
        heatFrac: heat,
        stage,
      };
    }
    // ethanol charge that was rinsed away instead of poured
    return {
      ...base,
      colourHex: '#e8eef2',
      colourLabel: 'clear ethanol mixture',
      verdict: 'unclear',
      verdictText: 'discarded before pouring into water — emulsion never formed',
    };
  }, []);

  const bankCharge = useCallback(() => {
    const s = sim.current;
    if (s.banked || !s.sample || !s.reagent) return;
    s.banked = true;
    s.benLifted = false;
    const row = chargeRow();
    if (row) commitRow(row);
  }, [chargeRow, commitRow]);

  // ---- gestures / bench actions ----------------------------------------------

  const loadSample = useCallback((id: SampleId) => {
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    if (s.sample === id && !s.reagent && !s.banked) {
      pushToast('info', '⌾', `${sampleLabelOf(id)} is already in the tube.`);
      return;
    }
    if (!s.banked) bankCharge();
    s.sample = id;
    s.reagent = null;
    s.colourT = 0;
    s.settleT = 0;
    s.banked = false;
    s.benHeat = 0;
    s.benStageF = 0;
    s.benLifted = false;
    s.benLiftSettle = 0;
    s.shake = 0;
    s.dissolved = false;
    s.tubeInBath = false;
    s.wobble = 0.5;
    labSound.slosh(0.5);
    labSound.drip(false);
    setLoadedOnce(true);
    pushToast('good', '⌾', `Loaded ${sampleLabelOf(id)} — the tube was rinsed fresh.`);
    syncUi();
  }, [bankCharge, pushToast, syncUi]);

  const bottlePos = useCallback((id: ReagentId): { x: number; y: number } => {
    const canvas = canvasRef.current;
    const L = layout(canvas?.clientWidth ?? 800, canvas?.clientHeight ?? 500);
    return L.bottles[REAGENTS.findIndex((r) => r.id === id)] ?? { x: 0, y: 0 };
  }, []);

  const startPour = useCallback((id: ReagentId, fromX?: number, fromY?: number) => {
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    if (!s.sample) {
      labSound.warn();
      pushToast('warn', '⚠', 'The tube is empty — load a food sample first.');
      return;
    }
    if (s.reagent) {
      labSound.warn();
      pushToast('warn', '⚠', 'One reagent per charge — rinse the tube first.');
      return;
    }
    const from = fromX !== undefined && fromY !== undefined ? { x: fromX, y: fromY } : bottlePos(id);
    s.pourT = 0;
    s.pourReagent = id;
    s.pourFrom = from;
    labSound.startLoop('pour');
    labSound.glassClink(true);
    syncUi();
  }, [bottlePos, pushToast, syncUi]);

  const finishReagentPour = useCallback(() => {
    const s = sim.current;
    const id = s.pourReagent;
    s.pourReagent = null;
    s.pourT = -1;
    labSound.stopLoop();
    labSound.glassClink(true);
    if (!id || !s.sample) return;
    s.reagent = id;
    s.colourT = 0;
    s.settleT = 0;
    s.banked = false;
    s.benHeat = 0;
    s.benStageF = 0;
    s.benLifted = false;
    s.benLiftSettle = 0;
    s.shake = 0;
    s.dissolved = false;
    if (id === 'benedicts') {
      pushToast('info', '🔥', "Benedict's poured — it needs the hot-water-bath trip before any colour appears.");
    } else if (id === 'ethanol') {
      pushToast('info', '⌁', 'Ethanol poured — shake the tube hard, then pour it into the water beaker.');
    } else if (id === 'iodine') {
      pushToast('info', '◉', 'Iodine poured — watch the colour settle over a couple of seconds.');
    } else {
      pushToast('info', '◉', 'Biuret poured — violet means protein, pale blue means none.');
    }
    syncUi();
  }, [pushToast, syncUi]);

  const dockBath = useCallback(() => {
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    s.tubeInBath = true;
    s.benLifted = false;
    s.benLiftSettle = 0;
    labSound.glassClink(true);
    if (s.reagent && s.reagent !== 'benedicts') {
      labSound.warn();
      pushToast('warn', '🔥', 'The bath is for Benedict’s only — the other tests read at bench temperature.');
    } else if (s.reagent === 'benedicts') {
      pushToast('info', '🔥', 'Holding in the bath — roughly thirty simulated seconds to full colour.');
    }
    syncUi();
  }, [pushToast, syncUi]);

  const liftFromBath = useCallback(() => {
    const s = sim.current;
    s.tubeInBath = false;
    labSound.glassClink(false);
    syncUi();
  }, [syncUi]);

  const shakeTube = useCallback((bursts: number) => {
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    s.wobble = Math.min(1, s.wobble + 0.8);
    const now = performance.now();
    if (now - s.lastSlosh > 160) {
      s.lastSlosh = now;
      labSound.slosh(0.35 + Math.random() * 0.4);
    }
    if (s.reagent === 'ethanol' && s.sample && !s.dissolved) {
      s.shake = Math.min(SHAKE_NEED, s.shake + bursts);
      if (s.shake >= SHAKE_NEED) {
        const hasFat = nutrientsOf(s.sample, mysteryRef.current).fat > 0.5;
        if (hasFat) {
          s.dissolved = true;
          labSound.drip(true);
          pushToast('good', '⌁', 'Opalescent — the fat has dissolved into the ethanol. Pour it into the water beaker.');
        }
      }
    }
    syncUi();
  }, [pushToast, syncUi]);

  const startBeakerPour = useCallback(() => {
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    if (s.reagent !== 'ethanol' || !s.sample) {
      labSound.warn();
      pushToast('warn', '⚠', 'The water beaker finishes the ethanol test — load a sample and add ethanol first.');
      return;
    }
    s.pourBeakerT = 0;
    s.emulKind = null;
    s.emulT = 0;
    labSound.startLoop('pour');
    labSound.glassClink(false);
    syncUi();
  }, [pushToast, syncUi]);

  const finishBeakerPour = useCallback(() => {
    const s = sim.current;
    s.pourBeakerT = -1;
    labSound.stopLoop();
    labSound.drip(false);
    const sample = s.sample;
    if (!sample) return;
    const nut = nutrientsOf(sample, mysteryRef.current);
    const kind: 'pos' | 'faint' | 'neg' = nut.fat > 0.5 ? (s.dissolved ? 'pos' : 'faint') : 'neg';
    s.emulKind = kind;
    s.emulT = 0;
    const row: ResultRow = {
      id: 0,
      sample,
      sampleLabel: sampleLabelOf(sample),
      test: 'ethanol',
      testLabel: reagentDef('ethanol').testLabel,
      reagentLabel: reagentDef('ethanol').label,
      colourHex: kind === 'pos' ? '#eef2f4' : kind === 'faint' ? '#dde7ee' : '#d7e5ee',
      colourLabel: kind === 'pos' ? 'cloudy white emulsion' : kind === 'faint' ? 'faint wisp only' : 'stays clear',
      verdict: kind === 'pos' ? 'pos' : kind === 'faint' ? 'unclear' : 'neg',
      verdictText:
        kind === 'pos'
          ? 'fat present — white emulsion formed'
          : kind === 'faint'
            ? 'only a faint cloud — the ethanol was never shaken properly'
            : 'no fat detected (water stayed clear)',
      heatFrac: 0,
      stage: 0,
    };
    s.pendingRow = row;
    s.pendingSettle = 0;
    // the tube empties into the beaker
    s.sample = null;
    s.reagent = null;
    s.shake = 0;
    s.dissolved = false;
    s.banked = true;
    s.tubeInBath = false;
    syncUi();
  }, [syncUi]);

  const rinseTube = useCallback(() => {
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    if (!s.banked) bankCharge();
    s.sample = null;
    s.reagent = null;
    s.colourT = 0;
    s.settleT = 0;
    s.banked = false;
    s.benHeat = 0;
    s.benStageF = 0;
    s.benLifted = false;
    s.benLiftSettle = 0;
    s.shake = 0;
    s.dissolved = false;
    s.tubeInBath = false;
    s.wobble = 0.4;
    labSound.slosh(0.85);
    labSound.drip(true);
    syncUi();
  }, [bankCharge, syncUi]);

  const toggleFlame = useCallback(() => {
    const s = sim.current;
    s.flame = !s.flame;
    labSound.click();
    pushToast(s.flame ? 'info' : 'warn', '🔥', s.flame ? 'Bunsen lit — the water bath will climb toward 95 °C.' : 'Bunsen off — the bath is cooling.');
    syncUi();
  }, [pushToast, syncUi]);

  const nextReagentFor = useCallback((sample: SampleId): ReagentId => {
    const tried = new Set(rowsRef.current.filter((r) => r.sample === sample).map((r) => r.test));
    return REAGENTS.find((r) => !tried.has(r.id))?.id ?? 'iodine';
  }, []);

  const advance = useCallback(() => {
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    if (!s.sample) {
      loadSample(selectedSample);
      return;
    }
    if (!s.reagent) {
      startPour(nextReagentFor(s.sample));
      return;
    }
    if (s.reagent === 'benedicts') {
      if (!s.tubeInBath) {
        dockBath();
        return;
      }
      if (s.benHeat >= 1 && s.banked) rinseTube();
      return;
    }
    if (s.reagent === 'ethanol') {
      if (!s.dissolved && s.shake < SHAKE_NEED) {
        shakeTube(3);
        return;
      }
      startBeakerPour();
      return;
    }
    if (s.banked) rinseTube();
  }, [selectedSample, loadSample, startPour, nextReagentFor, dockBath, rinseTube, shakeTube, startBeakerPour]);

  const pickMystery = useCallback((idx: number) => {
    if (solved) return;
    if (idx === mysteryKind) {
      setSolved(true);
      setWrongPick(null);
      labSound.milestone();
      earn('mystery-solved');
      pushToast('good', '🔍', `Mystery solved — it was ${MYSTERY_KINDS[idx].label}.`);
    } else {
      setWrongPick(idx);
      labSound.warn();
    }
  }, [solved, mysteryKind, earn, pushToast]);

  // ---- mentor completion flags ---------------------------------------------
  const iodineRow = rows.some((r) => r.test === 'iodine');
  const benRow = rows.some((r) => r.test === 'benedicts' && r.heatFrac >= 0.5);
  const biuretRow = rows.some((r) => r.test === 'biuret');
  const ethanolRow = rows.some((r) => r.test === 'ethanol');
  const done = [loadedOnce, iodineRow, benRow, biuretRow, ethanolRow, solved];

  useEffect(() => {
    const next = done.findIndex((d, i) => !d && i <= mentorIndex);
    if (next > mentorIndex) {
      setMentorIndex(next);
      labSound.step();
    } else if (done[done.length - 1] && mentorIndex < MENTOR_STEPS.length - 1) {
      setMentorIndex(MENTOR_STEPS.length - 1);
    }
  }, [done, mentorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge -------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'load': return { target: 'scene', gesture: 'drag', title: 'Drag a food jar', body: 'Grab any jar from the shelf and drop it over the test tube’s mouth — the potato is a friendly start.' };
      case 'iodine': return { target: 'scene', gesture: 'drag', title: 'Pour the iodine', body: 'Drag the amber iodine bottle onto the loaded tube and let the colour settle.' };
      case 'benedicts': return { target: 'bath', gesture: 'drag', title: 'Into the hot bath', body: 'Benedict’s needs heat — press “Send to hot bath” (or drag the tube) and hold about thirty simulated seconds.' };
      case 'biuret': return { target: 'reagents', gesture: 'press', title: 'Pour the biuret', body: 'Rinse the tube, load a fresh sample, then pour the pale-blue biuret bottle over it.' };
      case 'ethanol': return { target: 'shake', gesture: 'drag', title: 'Shake, then pour', body: 'Add ethanol, drag the tube side-to-side to shake it, then drop it over the water beaker.' };
      case 'deduce': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your nutrient matrix and the mystery chips live in the Observations tab.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- simulation step ----------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.t += dt;
    const sdt = dt * speed;

    const canvas = canvasRef.current;
    if (canvas) {
      const L = layout(canvas.clientWidth, canvas.clientHeight);
      // tube target follows the hand, the bath or the stand
      let tx = L.tubeHome.x;
      let ty = L.tubeHome.y;
      if (s.drag && s.drag.kind === 'tube') {
        tx = s.drag.x;
        ty = s.drag.y - L.tubeH * 0.4;
      } else if (s.tubeInBath) {
        tx = L.bathCx;
        ty = L.bathTubeY;
      }
      if (s.needsSnap) {
        s.tubeX = tx;
        s.tubeY = ty;
        s.needsSnap = false;
      }
      const e = Math.min(1, dt * 11);
      s.tubeX += (tx - s.tubeX) * e;
      s.tubeY += (ty - s.tubeY) * e;
    }

    s.wobble = Math.max(0, s.wobble - dt * 1.7);
    s.bathHeat = clamp(s.bathHeat + (s.flame ? sdt / 45 : -sdt / 150), 0, 1);

    if (s.pourT >= 0) {
      s.pourT += dt;
      if (s.pourT >= POUR_TIME) finishReagentPour();
    }
    if (s.pourBeakerT >= 0) {
      s.pourBeakerT += dt / BEAKER_POUR_TIME;
      if (s.pourBeakerT >= 1) finishBeakerPour();
    }

    // iodine / biuret colour development (a touch faster if warm)
    if (s.sample && (s.reagent === 'iodine' || s.reagent === 'biuret') && !s.banked) {
      const dev = s.reagent === 'iodine' ? IODINE_DEV : BIURET_DEV;
      const warm = s.tubeInBath && s.flame ? 2 : 1;
      if (s.colourT < 1) {
        s.colourT = Math.min(1, s.colourT + (sdt * warm) / dev);
      } else {
        s.settleT += sdt;
        if (s.settleT >= 0.8) bankCharge();
      }
    }

    // Benedict's — heat only accrues inside the bath with the flame lit
    if (s.sample && s.reagent === 'benedicts' && !s.banked) {
      const full = benStage(nutrientsOf(s.sample, mysteryRef.current).sugar);
      if (s.tubeInBath && s.flame) s.benHeat = Math.min(1, s.benHeat + sdt / BEN_TIME);
      s.benStageF = full * s.benHeat;
      if (s.benHeat >= 1) {
        s.settleT += sdt;
        if (s.settleT >= 1) bankCharge();
      } else if (s.benLifted) {
        s.benLiftSettle += sdt;
        if (s.benLiftSettle >= 1.2) bankCharge();
      }
    }

    // emulsion settling in the water beaker
    if (s.pendingRow) {
      s.emulT = Math.min(1, s.emulT + sdt / EMULSION_SETTLE);
      s.pendingSettle += sdt;
      if (s.pendingSettle >= EMULSION_SETTLE) {
        const row = s.pendingRow;
        s.pendingRow = null;
        if (row) commitRow(row);
      }
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, finishReagentPour, finishBeakerPour, bankCharge, commitRow, syncUi]);

  // ---- drawing --------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const L = layout(w, h);
    const t = s.t;

    // backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // dust motes
    for (const m of s.motes) {
      const mx = ((m.fx + t * 0.006 * m.sp) % 1) * w;
      const my = (m.fy + Math.sin(t * 0.3 + m.ph) * 0.02) * h;
      ctx.fillStyle = 'rgba(120,134,148,0.13)';
      ctx.beginPath();
      ctx.arc(mx, my, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // shelf (samples)
    ctx.fillStyle = '#d8c39a';
    roundRect(ctx, 6, L.shelfY, L.shelfW + 8, 9, 3);
    ctx.fill();
    ctx.strokeStyle = '#b89a6a';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 6, L.shelfY, L.shelfW + 8, 9, 3);
    ctx.stroke();
    ctx.fillStyle = '#c2ab7e';
    roundRect(ctx, 22, L.shelfY + 9, 8, 14, 2);
    ctx.fill();
    roundRect(ctx, L.shelfW - 6, L.shelfY + 9, 8, 14, 2);
    ctx.fill();

    // reagent rack
    ctx.fillStyle = '#4a5a6c';
    roundRect(ctx, L.rackX, L.shelfY, L.rackW, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#3a4656';
    roundRect(ctx, L.rackX + 4, L.shelfY + 9, 10, 12, 2);
    ctx.fill();
    roundRect(ctx, L.rackX + L.rackW - 14, L.shelfY + 9, 10, 12, 2);
    ctx.fill();

    // jars (skip the one in hand)
    SAMPLES.forEach((def, i) => {
      if (s.drag && s.drag.kind === 'sample' && s.drag.id === def.id) return;
      const p = L.jars[i];
      ctx.fillStyle = 'rgba(23,35,52,0.10)';
      ctx.beginPath();
      ctx.ellipse(p.x, L.shelfY + 2, L.jarW * 0.42, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      drawJar(ctx, p.x, p.y, L.jarW, L.jarH, def.id, def.lid, def.liquid, t);
    });

    // bottles (skip the one in hand or pouring)
    REAGENTS.forEach((def, i) => {
      if (s.drag && s.drag.kind === 'reagent' && s.drag.id === def.id) return;
      if (s.pourReagent === def.id) return;
      const p = L.bottles[i];
      ctx.fillStyle = 'rgba(23,35,52,0.10)';
      ctx.beginPath();
      ctx.ellipse(p.x, L.shelfY + 2, L.botW * 0.42, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBottle(ctx, p.x, p.y, L.botW, L.botH, def.body, def.cap, t, 0, i * 1.7);
    });

    // bench surface
    ctx.fillStyle = '#e7dfcb';
    ctx.fillRect(0, L.benchY, w, h - L.benchY);
    ctx.strokeStyle = '#c6b795';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, L.benchY);
    ctx.lineTo(w, L.benchY);
    ctx.stroke();
    ctx.strokeStyle = '#ddd2b6';
    ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, L.benchY + 3);
      ctx.lineTo(x - 12, h - 6);
      ctx.stroke();
    }

    // bunsen + tripod + bath
    drawBunsen(ctx, L.bathCx, L.benchY, L.k, t, s.flame);
    drawTripod(ctx, L.bathCx, L.benchY, L.bathBase, L.bathW);
    const bathWater = mixHex('#cfe0ea', '#bcd6e4', s.bathHeat * 0.5);
    drawBeakerGlass(ctx, L.bathCx, L.bathBase, L.bathW, L.bathH, bathWater, 0.86);
    if (s.bathHeat > 0.25) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 5; i += 1) {
        const bx = L.bathCx - L.bathW * 0.3 + ((i * 37 + t * 18) % (L.bathW * 0.6));
        const by = L.waterY + L.bathH * 0.62 - ((t * 26 + i * 31) % (L.bathH * 0.45));
        ctx.beginPath();
        ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawSteam(ctx, L.bathCx, L.waterY, s.bathHeat, t);

    // water beaker (emulsion test)
    drawBeakerGlass(ctx, L.beakerX, L.beakerBase, L.beakerW, L.beakerH, '#d7e5ee', 0.66);
    const emulAlpha = s.emulKind === 'pos' ? 0.75 * s.emulT : s.emulKind === 'faint' ? 0.22 * s.emulT : 0;
    if (emulAlpha > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.beakerX - L.beakerW / 2 + 3, L.beakerTop + L.beakerH * 0.42, L.beakerW - 6, L.beakerH * 0.5);
      ctx.clip();
      ctx.fillStyle = `rgba(238,242,244,${emulAlpha.toFixed(3)})`;
      for (let i = 0; i < 6; i += 1) {
        const ex = L.beakerX + Math.sin(i * 2.4 + t * 0.2) * (L.beakerW * 0.22);
        const ey = L.beakerBase - L.beakerH * (0.22 + ((i * 0.13 + t * 0.02) % 0.4));
        ctx.beginPath();
        ctx.arc(ex, ey, L.beakerW * (0.14 + (i % 3) * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // tube stand
    drawStand(ctx, L);

    // progress arc while a Benedict's charge heats in the bath
    if (s.reagent === 'benedicts' && s.tubeInBath && !s.banked && s.benHeat > 0.01) {
      ctx.strokeStyle = 'rgba(249,115,22,0.9)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(L.bathCx, L.bathTop + L.bathH * 0.5, L.bathW * 0.62, -Math.PI / 2, -Math.PI / 2 + s.benHeat * Math.PI * 2);
      ctx.stroke();
    }

    // ---- the tube itself ----
    const sampleDef = s.sample ? SAMPLES.find((x) => x.id === s.sample) : null;
    let liquid: string | null = sampleDef ? sampleDef.liquid : null;
    let fillFrac = 0.42;
    let precip = 0;
    if (s.sample && s.reagent === 'iodine') {
      const pos = nutrientsOf(s.sample, mysteryRef.current).starch > 0.5;
      liquid = mixHex(sampleDef?.liquid ?? '#eef2f6', pos ? IODINE_POS : IODINE_NEG, easeOut(clamp(s.colourT, 0, 1)) * 0.92);
      fillFrac = 0.6;
    } else if (s.sample && s.reagent === 'biuret') {
      const pos = nutrientsOf(s.sample, mysteryRef.current).protein > 0.5;
      liquid = mixHex(sampleDef?.liquid ?? '#eef2f6', pos ? BIURET_POS : BIURET_NEG, easeOut(clamp(s.colourT, 0, 1)) * 0.92);
      fillFrac = 0.6;
    } else if (s.sample && s.reagent === 'benedicts') {
      const stageF = s.benStageF;
      const lo = Math.min(4, Math.floor(stageF));
      const hi = Math.min(4, lo + 1);
      liquid = stageF <= 0.02 ? BEN_COLOURS[0] : mixHex(BEN_COLOURS[lo], BEN_COLOURS[hi], stageF - lo);
      fillFrac = 0.6;
      precip = clamp((stageF - 3.4) / 0.6, 0, 1);
    } else if (s.sample && s.reagent === 'ethanol') {
      liquid = s.dissolved ? mixHex(sampleDef?.liquid ?? '#eef2f6', '#c9d4da', 0.7) : '#e8eef2';
      fillFrac = 0.58;
    }
    if (s.pourT >= 0) fillFrac = 0.42 + 0.18 * clamp(s.pourT / POUR_TIME, 0, 1);

    if (s.tubeInBath) {
      // submerged: clipped to the bath interior, then a water tint over it
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.bathCx - L.bathW / 2 + 3, L.waterY - 2, L.bathW - 6, L.bathH - 8);
      ctx.clip();
      drawTube(ctx, s.tubeX, s.tubeY, L.tubeW, L.tubeH, liquid, fillFrac, precip, s.wobble, t);
      ctx.fillStyle = `rgba(190,215,229,${(0.35 * clamp((L.waterY + 6 - s.tubeY) / L.tubeH, 0, 1)).toFixed(3)})`;
      ctx.fillRect(L.bathCx - L.bathW / 2 + 3, L.waterY, L.bathW - 6, L.bathH - 10);
      ctx.restore();
    } else if (s.pourBeakerT >= 0) {
      // tube tipped over the water beaker
      const p = clamp(s.pourBeakerT, 0, 1);
      const swing = p < 0.3 ? p / 0.3 : p > 0.85 ? (1 - p) / 0.15 : 1;
      const ang = -1.35 * swing;
      const bx = L.beakerX + Math.sin(-ang) * (L.tubeH / 2) - 6;
      const by = L.beakerTop - 14 + (1 - swing) * 30;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ang);
      drawTube(ctx, 0, -L.tubeH / 2, L.tubeW, L.tubeH, liquid, fillFrac * (1 - p * 0.9), 0, 0, t);
      ctx.restore();
      if (p > 0.28 && p < 0.9) {
        ctx.strokeStyle = 'rgba(122,147,163,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx - 6, by + 16, L.beakerX - 4, L.beakerTop + L.beakerH * 0.34);
        ctx.stroke();
        ctx.fillStyle = 'rgba(214,229,238,0.9)';
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(L.beakerX - 4 + Math.sin(t * 9 + i * 2) * 3, L.beakerTop + L.beakerH * 0.34 + 6 + i * 9, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = 'rgba(23,35,52,0.12)';
      ctx.beginPath();
      ctx.ellipse(s.tubeX, L.benchY + 2, L.tubeW * 0.9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      drawTube(ctx, s.tubeX, s.tubeY, L.tubeW, L.tubeH, liquid, fillFrac, precip, s.wobble, t);
    }

    // reagent pour animation: bottle tips over the tube mouth, stream, returns
    if (s.pourT >= 0 && s.pourReagent) {
      const def = reagentDef(s.pourReagent);
      const p = clamp(s.pourT / POUR_TIME, 0, 1);
      const mouthX = s.tubeX;
      const mouthY = s.tubeY + 2;
      const poseX = mouthX - Math.sin(2.05) * (L.botH / 2) - 2;
      const poseY = mouthY - Math.cos(2.05) * (L.botH / 2) - 4;
      let bx: number;
      let by: number;
      let ang: number;
      if (p < 0.25) {
        const q = easeOut(p / 0.25);
        bx = s.pourFrom.x + (poseX - s.pourFrom.x) * q;
        by = s.pourFrom.y + (poseY - s.pourFrom.y) * q;
        ang = 2.05 * q;
      } else if (p < 0.82) {
        bx = poseX;
        by = poseY;
        ang = 2.05;
      } else {
        const q = easeOut((p - 0.82) / 0.18);
        const home = L.bottles[REAGENTS.findIndex((r) => r.id === s.pourReagent)] ?? { x: poseX, y: poseY };
        bx = poseX + (home.x - poseX) * q;
        by = poseY + (home.y - poseY) * q;
        ang = 2.05 * (1 - q);
      }
      drawBottle(ctx, bx, by, L.botW, L.botH, def.body, def.cap, t, ang, 2);
      if (p > 0.27 && p < 0.84) {
        const lipX = bx + Math.sin(ang) * (L.botH / 2);
        const lipY = by - Math.cos(ang) * (L.botH / 2);
        ctx.strokeStyle = def.body === '#e6eef4' ? 'rgba(180,205,218,0.95)' : def.body;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(lipX, lipY);
        ctx.quadraticCurveTo((lipX + mouthX) / 2 + 3, (lipY + mouthY) / 2, mouthX, mouthY);
        ctx.stroke();
        ctx.fillStyle = def.body === '#e6eef4' ? 'rgba(180,205,218,0.9)' : def.body;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(mouthX + Math.sin(t * 10 + i * 2.1) * 2.4, mouthY + 8 + i * 10, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // drop-target hints
    if (s.drag && (s.drag.kind === 'sample' || s.drag.kind === 'reagent')) {
      const near = Math.hypot(s.drag.x - s.tubeX, s.drag.y - (s.tubeY + 8)) < 110;
      if (near) dashedRing(ctx, s.tubeX, s.tubeY + 6, L.tubeW * 1.7, 16, '#e8632a');
    }
    if (s.drag && s.drag.kind === 'tube') {
      const overBath = Math.abs(s.drag.x - L.bathCx) < L.bathW / 2 + 18 && s.drag.y > L.bathTop - 26;
      if (overBath) dashedRing(ctx, L.bathCx, L.bathTop + L.bathH * 0.4, L.bathW * 0.62, L.bathH * 0.42, '#e8632a');
      const overBeaker = Math.abs(s.drag.x - L.beakerX) < L.beakerW / 2 + 16 && s.drag.y > L.beakerTop - 22;
      if (overBeaker && s.reagent === 'ethanol' && s.sample) {
        dashedRing(ctx, L.beakerX, L.beakerTop + L.beakerH * 0.45, L.beakerW * 0.66, L.beakerH * 0.42, '#e8632a');
      }
    }

    // the item in hand, drawn last with a soft shadow
    if (s.drag) {
      if (s.drag.kind === 'sample') {
        const def = SAMPLES.find((x) => x.id === s.drag!.id);
        if (def) {
          ctx.fillStyle = 'rgba(23,35,52,0.14)';
          ctx.beginPath();
          ctx.ellipse(s.drag.x, s.drag.y + L.jarH * 0.62, L.jarW * 0.44, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          drawJar(ctx, s.drag.x, s.drag.y - 6, L.jarW, L.jarH, def.id, def.lid, def.liquid, t);
        }
      } else if (s.drag.kind === 'reagent') {
        const def = REAGENTS.find((x) => x.id === s.drag!.id);
        if (def) {
          ctx.fillStyle = 'rgba(23,35,52,0.14)';
          ctx.beginPath();
          ctx.ellipse(s.drag.x, s.drag.y + L.botH * 0.6, L.botW * 0.5, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          drawBottle(ctx, s.drag.x, s.drag.y - 8, L.botW, L.botH, def.body, def.cap, t, -0.12, 5);
        }
      }
    }
  }, []);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction -------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (s.pourT >= 0 || s.pourBeakerT >= 0) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const L = layout(canvas.clientWidth, canvas.clientHeight);

    // the tube (wherever it currently is)
    if (Math.abs(px - s.tubeX) < L.tubeW + 22 && py > s.tubeY - 24 && py < s.tubeY + L.tubeH + 24) {
      s.drag = { kind: 'tube', id: null, x: px, y: py, dir: 0, lastX: px, lastSlide: 0 };
      if (s.tubeInBath) s.tubeInBath = false;
      labSound.glassClink(false);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      notePointer(true);
      syncUi();
      return;
    }
    // food jars
    for (let i = 0; i < SAMPLES.length; i += 1) {
      const p = L.jars[i];
      if (Math.hypot(px - p.x, py - p.y) < L.jarW * 0.7 + 14) {
        s.drag = { kind: 'sample', id: SAMPLES[i].id, x: px, y: py, dir: 0, lastX: px, lastSlide: 0 };
        labSound.slide(0.5);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        notePointer(true);
        syncUi();
        return;
      }
    }
    // reagent bottles
    for (let i = 0; i < REAGENTS.length; i += 1) {
      const p = L.bottles[i];
      if (Math.hypot(px - p.x, py - p.y) < L.botW * 0.7 + 14) {
        s.drag = { kind: 'reagent', id: REAGENTS[i].id, x: px, y: py, dir: 0, lastX: px, lastSlide: 0 };
        labSound.glassClink(true);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        notePointer(true);
        syncUi();
        return;
      }
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const d = s.drag;
    if (!d) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    d.x = px;
    d.y = py;
    const now = performance.now();
    if (d.kind === 'tube') {
      // shake gesture: count horizontal direction reversals with real speed
      const dx = px - d.lastX;
      if (Math.abs(dx) > 6) {
        const dir = Math.sign(dx);
        if (d.dir !== 0 && dir !== d.dir) shakeTube(1);
        d.dir = dir;
      }
      d.lastX = px;
    } else if (d.kind === 'sample' && now - d.lastSlide > 240) {
      d.lastSlide = now;
      labSound.slide(0.18);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const d = s.drag;
    if (!d) return;
    s.drag = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const canvas = canvasRef.current;
    const L = layout(canvas?.clientWidth ?? 800, canvas?.clientHeight ?? 500);

    if (d.kind === 'sample') {
      const onTube = Math.hypot(d.x - s.tubeX, d.y - (s.tubeY + 6)) < 62
        || (Math.abs(d.x - s.tubeX) < L.tubeW + 24 && d.y > s.tubeY - 26 && d.y < s.tubeY + L.tubeH);
      if (onTube) {
        loadSample(d.id as SampleId);
      } else {
        labSound.thunk(false);
      }
      return;
    }
    if (d.kind === 'reagent') {
      const onTube = Math.hypot(d.x - s.tubeX, d.y - (s.tubeY + 6)) < 62
        || (Math.abs(d.x - s.tubeX) < L.tubeW + 24 && d.y > s.tubeY - 26 && d.y < s.tubeY + L.tubeH);
      if (onTube) {
        if (!s.sample || s.reagent) {
          labSound.warn();
          pushToast('warn', '⚠', !s.sample ? 'The tube is empty — load a food sample first.' : 'One reagent per charge — rinse the tube first.');
          notePointer(false);
        } else {
          startPour(d.id as ReagentId, d.x, d.y);
        }
      } else {
        labSound.thunk(false);
      }
      return;
    }
    // the tube
    const overBath = Math.abs(d.x - L.bathCx) < L.bathW / 2 + 18 && d.y > L.bathTop - 26 && d.y < L.bathBase + 10;
    const overBeaker = Math.abs(d.x - L.beakerX) < L.beakerW / 2 + 16 && d.y > L.beakerTop - 22 && d.y < L.beakerBase + 8;
    if (overBath) {
      dockBath();
      return;
    }
    if (overBeaker) {
      if (s.reagent === 'ethanol' && s.sample) {
        startBeakerPour();
        return;
      }
      labSound.thunk(false);
      pushToast('info', '⌾', 'The water beaker finishes the ethanol test — that charge needs ethanol in the tube.');
      return;
    }
    // back to the stand: an early Benedict's lift banks its honest partial colour
    if (s.reagent === 'benedicts' && !s.banked && s.benHeat > 0.02) {
      s.benLifted = true;
      s.benLiftSettle = 0;
      pushToast('warn', '🔥', `Lifted at ${Math.round(s.benHeat * 100)}% of the full bath trip — the colour will bank as you saw it.`);
    }
    labSound.thunk(false);
    syncUi();
  };

  // ---- nutrient matrix ---------------------------------------------------------
  const matrix = useMemo(() => {
    const m = {} as Record<SampleId, Record<Nutrient, Cell>>;
    for (const smp of SAMPLES) m[smp.id] = { starch: '', sugar: '', protein: '', fat: '' };
    for (const r of rows) {
      if (r.verdict === 'unclear') continue;
      if (r.test === 'iodine') m[r.sample].starch = r.verdict === 'pos' ? 'yes' : 'no';
      if (r.test === 'biuret') m[r.sample].protein = r.verdict === 'pos' ? 'yes' : 'no';
      if (r.test === 'ethanol') m[r.sample].fat = r.verdict === 'pos' ? 'yes' : 'no';
      if (r.test === 'benedicts') {
        if (r.verdict === 'pos') m[r.sample].sugar = 'yes';
        else if (r.verdict === 'trace') m[r.sample].sugar = 'trace';
        else if (r.heatFrac >= 0.85) m[r.sample].sugar = 'no';
      }
    }
    return m;
  }, [rows]);

  const matrixFull = SAMPLES.every((smp) => NUTRIENTS.every((n) => matrix[smp.id][n] !== ''));
  useEffect(() => {
    if (matrixFull && rows.length > 0) earn('full-matrix');
  }, [matrixFull, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- mystery coaching (never the answer) ---------------------------------------
  const mysteryCoaching = useMemo(() => {
    const mrows = rows.filter((r) => r.sample === 'mystery');
    if (mrows.length === 0) return 'The masked sample has met none of your reagents yet — every deduction needs colours first.';
    if (!mrows.some((r) => r.test === 'iodine')) return 'Starch is still an open question — iodine has never touched the masked sample.';
    const ben = mrows.filter((r) => r.test === 'benedicts');
    if (ben.length === 0) return 'Sugar is unresolved — Benedict’s has not met the masked sample yet.';
    if (ben.every((r) => r.heatFrac < 0.85)) return 'Your Benedict’s rows for the masked sample were lifted out of the bath early — the colour keeps deepening with a full thirty-second trip.';
    if (!mrows.some((r) => r.test === 'biuret')) return 'Protein is unresolved — run the biuret test on the masked sample.';
    const eth = mrows.filter((r) => r.test === 'ethanol');
    if (eth.length === 0) return 'Fat is unresolved — the emulsion test has not met the masked sample.';
    if (eth.every((r) => r.verdict === 'unclear')) return 'The emulsion pours were only faintly cloudy — shake the ethanol properly and pour again.';
    return 'Every test has spoken — reread your masked row in the matrix and ask which positive colour stood out.';
  }, [rows]);

  // ---- coach ---------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    const s = sim.current;
    if (ui.holding && s.drag?.kind === 'sample') return { tone: 'info', line: `Carrying the ${ui.holding} jar — drop it over the test tube’s mouth to load it.` };
    if (ui.holding && s.drag?.kind === 'reagent') return { tone: 'info', line: `Carrying ${ui.holding} — hold it over the tube mouth to pour.` };
    if (ui.holding && s.drag?.kind === 'tube') return { tone: 'info', line: 'Carrying the tube — drop it into the bath to heat, over the water beaker to pour, or back on the stand.' };
    if (ui.beakerPour) return { tone: 'info', line: 'Pouring the ethanol mixture into the water — watch for cloudiness as it settles.' };
    if (ui.pouring) return { tone: 'info', line: 'Pouring — a couple of seconds of stream, then the colour story begins.' };
    if (ui.hasReagent && ui.reagentId === 'benedicts' && !ui.inBath && !ui.banked) {
      return { tone: 'warn', line: "Benedict's is stubborn at bench temperature — send the tube into the hot water bath for its thirty-second trip." };
    }
    if (ui.inBath && ui.hasReagent && ui.reagentId === 'benedicts' && ui.benHeat < 1 && !ui.banked) {
      return { tone: 'info', line: `Heating — ${Math.round(ui.benHeat * 100)}% of the full trip. Blue climbs to green, yellow, then brick-red as the sugar reduces the copper.` };
    }
    if (ui.hasReagent && ui.reagentId === 'ethanol' && !ui.dissolved && ui.shake < SHAKE_NEED) {
      return { tone: 'info', line: 'Seal it with a good shake — drag the tube side-to-side, or press “Shake the tube”.' };
    }
    if (ui.hasReagent && ui.reagentId === 'ethanol' && ui.dissolved) {
      return { tone: 'good', line: 'Opalescent — the fat has left the sample into the ethanol. Pour it into the water beaker for the emulsion.' };
    }
    if (s.pendingRow) return { tone: 'info', line: 'The beaker is settling — a cloudy white emulsion means fat, clear water means none.' };
    const last = rows[rows.length - 1];
    if (last && last.verdict === 'unclear') {
      return { tone: 'warn', line: `That last row was inconclusive: ${last.verdictText}. Re-run it properly — the matrix only ticks on a definitive colour.` };
    }
    if (solved) return { tone: 'good', line: `Solved — the masked food was ${MYSTERY_KINDS[mysteryKind].label}. Your own colour rows were the whole argument.` };
    if (!ui.hasSample && rows.length === 0) return { tone: 'info', line: 'Drag a food jar from the shelf into the test tube — the potato is the friendliest first positive.' };
    if (!ui.hasSample) return { tone: 'info', line: 'Tube rinsed. Load the next sample — the masked jar is waiting for a confident panel.' };
    if (!ui.hasReagent) return { tone: 'info', line: 'Sample loaded — drag a reagent bottle over the tube mouth to pour it.' };
    return { tone: 'info', line: 'Colour at work — the row banks itself when the shade settles. Keep going.' };
  }, [ui, rows, solved, mysteryKind]);

  // ---- next-action label -----------------------------------------------------------
  const nextAction = useMemo(() => {
    if (ui.pouring || ui.beakerPour) return { label: 'Pouring…', disabled: true };
    if (!ui.hasSample) return { label: `Load ${sampleLabelOf(selectedSample)} into the tube`, disabled: false };
    if (!ui.hasReagent) {
      let id: ReagentId = 'iodine';
      if (ui.sampleId) {
        const tried = new Set(rows.filter((rr) => rr.sample === ui.sampleId).map((rr) => rr.test));
        id = REAGENTS.find((r) => !tried.has(r.id))?.id ?? 'iodine';
      }
      return { label: `Add ${reagentDef(id).short}`, disabled: false };
    }
    if (ui.reagentId === 'benedicts') {
      if (!ui.inBath) return { label: 'Send tube to the hot bath', disabled: false };
      if (ui.benHeat < 1) return { label: `Heating — ${Math.round(ui.benHeat * 100)}%`, disabled: true };
      if (!ui.banked) return { label: 'Colour settling…', disabled: true };
      return { label: 'Rinse for the next test', disabled: false };
    }
    if (ui.reagentId === 'ethanol') {
      if (!ui.dissolved && ui.shake < SHAKE_NEED) return { label: 'Shake the tube', disabled: false };
      return { label: 'Pour into the water beaker', disabled: false };
    }
    if (ui.devT < 1 && !ui.banked) return { label: 'Colour developing…', disabled: true };
    if (!ui.banked) return { label: 'Colour settling…', disabled: true };
    return { label: 'Rinse for the next test', disabled: false };
  }, [ui, rows, selectedSample]);

  // ---- status --------------------------------------------------------------------
  const statusText = solved
    ? 'Mystery solved'
    : ui.pouring || ui.beakerPour
      ? 'Pouring…'
      : ui.inBath && ui.hasReagent && ui.reagentId === 'benedicts' && ui.benHeat < 1
        ? 'Heating in the bath'
        : rows.length > 0 && !ui.hasSample
          ? 'Result banked — next sample'
          : rows.length > 0
            ? 'Result banked'
            : 'Bench ready';

  const benRows = rows.filter((r) => r.test === 'benedicts');

  // ---- reset -----------------------------------------------------------------------
  const resetAll = () => {
    const s = sim.current;
    const motes = s.motes;
    Object.assign(s, freshSim(), { motes, t: s.t });
    s.needsSnap = true;
    rowsRef.current = [];
    setRows([]);
    setBadges([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setLoadedOnce(false);
    setSolved(false);
    setWrongPick(null);
    setSelectedSample('potato');
    setMysteryKind(Math.floor(Math.random() * MYSTERY_KINDS.length));
    syncUi();
  };

  // ---- render -----------------------------------------------------------------------
  const canPour = ui.hasSample && !ui.hasReagent && !ui.pouring && !ui.beakerPour;
  const canShake = ui.hasReagent && ui.reagentId === 'ethanol' && !ui.pouring && !ui.beakerPour;
  const canBeakerPour = canShake;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={solved ? 'complete' : 'ready'}
      captionChip="Student-run qualitative bench"
      legend={[
        { color: '#c07a2a', label: 'Iodine' },
        { color: '#2b62cf', label: "Benedict's" },
        { color: '#a9c7e2', label: 'Biuret' },
        { color: '#e6eef4', label: 'Ethanol' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start the food tests', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <label>Speed
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Simulation speed">
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
          aria-label="Food test bench — drag food jars into the test tube, pour reagents, heat Benedict's in the water bath and pour ethanol into the water beaker"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); advance(); notePointer(true); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="food-grid">
            <div className="food-block" data-nudge="load-sample">
              <span className="food-label">Food sample</span>
              <div className="food-row-select">
                <select
                  className="food-select"
                  value={selectedSample}
                  aria-label="Choose a food sample"
                  onChange={(e) => { setSelectedSample(e.target.value as SampleId); labSound.tick(); }}
                >
                  {SAMPLES.map((smp) => (
                    <option key={smp.id} value={smp.id}>{smp.label}</option>
                  ))}
                </select>
                <button
                  className="food-mini"
                  type="button"
                  onClick={() => { loadSample(selectedSample); notePointer(true); }}
                >
                  Load into tube
                </button>
              </div>
              <p className="food-note">{SAMPLES.find((x) => x.id === selectedSample)?.note}</p>
            </div>
            <div className="food-block" data-nudge="reagents">
              <span className="food-label">Reagents — or drag a bottle onto the tube</span>
              <div className="food-reagents">
                {REAGENTS.map((r) => (
                  <button
                    key={r.id}
                    className="food-mini"
                    type="button"
                    disabled={!canPour}
                    title={r.label}
                    onClick={() => { startPour(r.id); notePointer(true); }}
                  >
                    <i style={{ background: r.body }} aria-hidden="true" />
                    {r.short}
                  </button>
                ))}
              </div>
            </div>
            <div className="food-block">
              <span className="food-label">Bench actions</span>
              <div className="food-reagents">
                <button
                  className="food-mini"
                  type="button"
                  data-nudge="bath"
                  disabled={ui.pouring || ui.beakerPour}
                  onClick={() => { if (ui.inBath) liftFromBath(); else dockBath(); notePointer(true); }}
                >
                  {ui.inBath ? 'Lift from bath' : 'Send to hot bath'}
                </button>
                <button
                  className="food-mini"
                  type="button"
                  data-nudge="shake"
                  disabled={!canShake}
                  onClick={() => { shakeTube(3); notePointer(true); }}
                >
                  Shake the tube
                </button>
                <button
                  className="food-mini"
                  type="button"
                  data-nudge="pour"
                  disabled={!canBeakerPour}
                  onClick={() => { startBeakerPour(); notePointer(true); }}
                >
                  Pour into water
                </button>
                <button
                  className="food-mini"
                  type="button"
                  data-nudge="rinse"
                  disabled={ui.pouring || ui.beakerPour}
                  onClick={() => { rinseTube(); notePointer(true); }}
                >
                  Rinse the tube
                </button>
              </div>
            </div>
          </div>
          <div className="food-flame-row">
            <button
              className={`food-mini${ui.flame ? ' on' : ''}`}
              type="button"
              onClick={toggleFlame}
              aria-pressed={ui.flame}
            >
              <span aria-hidden="true">🔥</span> Bunsen {ui.flame ? 'lit' : 'off'}
            </button>
            <span className="food-temp">Water bath {Math.round(ui.bathTemp)} °C{ui.flame ? ' · climbing' : ' · cooling'}</span>
          </div>
          <div className="food-hint"><span>✦</span><p style={{ margin: 0 }}>Every verdict comes from the colour you actually saw: Benedict’s grades blue → green → yellow → brick-red with sugar concentration, and lifting it out of the bath early banks the weaker colour you earned. Rinse between reagents — one charge, one test.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="next"
            onClick={() => { advance(); notePointer(true); }}
            disabled={nextAction.disabled}
          >
            {nextAction.disabled ? nextAction.label : `→ ${nextAction.label}`}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE BENCH READINGS</span><h2>Food test bench</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Tube contents</span>
            <strong>{ui.sample || <small style={{ fontSize: 13 }}>empty — load a food sample</small>}</strong>
            <div className="reading-track"><span style={{ width: `${Math.round(ui.benHeat * 100)}%` }} /></div>
            <div className="reading-scale"><span>cold bench</span><span>full 30 s bath trip</span></div>
          </div>
          <div className="reading-grid">
            <div><span>In hand</span><strong>{ui.holding || '—'}</strong></div>
            <div><span>Reagent in tube</span><strong>{ui.reagent || '—'}</strong></div>
            <div><span>Colour now</span><strong>{ui.colourLabel ? <><i className="food-dot" style={{ background: ui.colourHex }} aria-hidden="true" />{ui.colourLabel}</> : '—'}</strong></div>
            <div><span>Bath temperature</span><strong>{Math.round(ui.bathTemp)} <small>°C</small></strong></div>
            <div><span>Benedict&apos;s heat</span><strong>{ui.benHeat > 0.005 ? `${Math.round(ui.benHeat * 100)}%` : '—'}</strong></div>
            <div><span>Ethanol shake</span><strong>{ui.hasReagent && ui.reagentId === 'ethanol' ? `${Math.min(SHAKE_NEED, Math.round(ui.shake))}/${SHAKE_NEED} arcs` : '—'}</strong></div>
            <div><span>Rows banked</span><strong>{rows.length}</strong></div>
            <div><span>Mystery food</span><strong>{solved ? MYSTERY_KINDS[mysteryKind].label : 'unsolved'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag a food jar from the shelf into the test tube — or pick one in the panel and press “Load into tube”.</li>
              <li>Drag the iodine bottle over the tube mouth and pour: blue-black means starch, orange-brown means none. The row banks when the colour settles.</li>
              <li>Rinse, load a fresh sample, pour Benedict&apos;s, then drag the tube into the hot water bath and hold about thirty simulated seconds — the colour climbs blue → green → yellow → brick-red with how much reducing sugar is present.</li>
              <li>Biuret needs no heat: violet means protein, pale blue means none.</li>
              <li>For fats, add ethanol, shake the tube hard (drag it side-to-side or press “Shake the tube”), then pour it into the water beaker — a cloudy white emulsion means fat.</li>
              <li>Run the whole panel on the masked sample, read your nutrient matrix, then name the mystery food in Observations.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Bench tip</strong>One charge, one test: rinse the tube between reagents, and give Benedict&apos;s its full bath trip — an early lift banks the weaker colour you actually saw, and the nutrient matrix refuses to tick on an inconclusive row.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Result rows</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Load a sample and pour a reagent — each settled colour banks itself here, exactly as you saw it.</p>
            ) : (
              <table className="trial-table food-table">
                <thead><tr><th>Sample</th><th>Test</th><th>Reagent</th><th>Colour observed</th><th>Verdict</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.sampleLabel}</td>
                      <td>{r.testLabel}</td>
                      <td>{r.reagentLabel}</td>
                      <td><span className="food-swatch" style={{ background: r.colourHex }} aria-hidden="true" />{r.colourLabel}</td>
                      <td className={`food-verdict v-${r.verdict}`}>{r.verdictText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3 style={{ marginTop: 16 }}>Nutrient matrix</h3>
            <table className="food-matrix">
              <thead><tr><th>Sample</th><th>Starch</th><th>Sugar</th><th>Protein</th><th>Fat</th></tr></thead>
              <tbody>
                {SAMPLES.map((smp) => (
                  <tr key={smp.id} className={smp.id === 'mystery' ? 'food-mystery-row' : ''}>
                    <td>
                      <i className="food-dot" style={{ background: smp.jar }} aria-hidden="true" />
                      {smp.id === 'mystery' && solved ? `${smp.label} — ${MYSTERY_KINDS[mysteryKind].label}` : smp.label}
                    </td>
                    {NUTRIENTS.map((n) => {
                      const c = matrix[smp.id][n];
                      return (
                        <td key={n} className={`food-cell c-${c || 'blank'}`}>
                          {c === 'yes' ? '✓' : c === 'no' ? '✗' : c === 'trace' ? '~' : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="observation-note">✓ present · ✗ absent · ~ trace · · not yet tested. The masked sample&apos;s row starts blank — it only fills from colours you actually produced. A trace (~) is real: milk&apos;s faint green and bread&apos;s weak yellow are honest weak positives.</p>
            <h3 style={{ marginTop: 16 }}>What is the mystery food?</h3>
            <div className="food-conclusion">
              <p className="observation-note">Deduce it from your own rows above — each chip is a real food with a different nutrient profile.</p>
              <div className="food-chips">
                {MYSTERY_KINDS.map((mk, i) => (
                  <button key={mk.id} type="button" className="food-chip" disabled={solved} onClick={() => pickMystery(i)}>
                    <strong>{mk.label}</strong>
                    <span>{mk.chip}</span>
                  </button>
                ))}
              </div>
              {solved ? (
                <div className="food-solved">
                  <span aria-hidden="true">🔍</span>
                  <p><strong>{MYSTERY_KINDS[mysteryKind].label}</strong> — confirmed by your own colour rows. A fresh masked sample is drawn each time you reset the bench.</p>
                </div>
              ) : (
                wrongPick !== null && <p className="food-coach-warn">✦ {mysteryCoaching}</p>
              )}
            </div>
            {benRows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Benedict&apos;s colour grade vs heating</h3>
                <Plot
                  points={benRows.map((r) => ({ x: r.heatFrac * BEN_TIME, y: r.stage }))}
                  xLabel="seconds in the bath"
                  yLabel="colour grade (0–4)"
                  fitLine
                  height={200}
                />
                <p className="observation-note">Grade 0 is blue, 4 is brick-red. Your points show how colour deepens with heating time and sugar concentration — a weak sugar held to the full thirty seconds plateaus low; concentrated glucose climbs all the way to 4.</p>
              </>
            )}
          </>
        ),
        theory: (
          <>
            <h3>Why these colours happen</h3>
            <p><strong>Iodine</strong> slips into the spiral chains of starch, forming a deep blue-black complex. No starch, and the iodine simply stays its own orange-brown — which is why a negative tube looks like the reagent itself.</p>
            <p><strong>Benedict&apos;s reagent</strong> contains blue copper(II), which reducing sugars convert to insoluble copper(I) oxide — but only with heat. That is the whole point of the water-bath trip: at bench temperature nothing happens, and as the reaction proceeds the colour steps blue → green → yellow → orange → brick-red while a red precipitate settles. More sugar, faster and deeper colour.</p>
            <p><strong>Biuret</strong> hunts for peptide bonds: copper(II) in alkaline solution binds them and shifts to violet. A pale-blue result is just the reagent — free sugars and starch never answer it.</p>
            <p><strong>The emulsion test</strong> is solubility, not colour chemistry. Fats dissolve in ethanol but not in water: shake the sample with ethanol, pour it into water, and the fat comes out of solution as microscopic droplets that scatter light — a cloudy white emulsion. No fat, and the water stays clear.</p>
            <div className="equation">fat (dissolved in ethanol) + water → cloudy white emulsion</div>
            <p>Honesty notes built into this bench: milk shows a genuine trace (green) with Benedict&apos;s, because it carries a little lactose alongside its protein. Bread gives a weak yellow — mostly starch with a little sugar. Lifting Benedict&apos;s out of the bath early banks the paler colour you actually earned, and the nutrient matrix refuses to tick a cell on an inconclusive row.</p>
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
