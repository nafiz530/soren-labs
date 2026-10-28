import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { linearFit, clamp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './ph-spectrum.css';

/**
 * pH spectrum — a household-solution bench for the Soren Lab Engine.
 *
 * The student drags a universal-indicator dropper over any of nine test
 * tubes and HOLDS to squeeze (a drop swells, falls and the liquid swirls
 * to its indicator colour), drags a digital probe in for the exact pH,
 * then drags each tube down onto a continuous 0–14 rainbow strip whose
 * colour bands are the placement slots. Correct bands clink and record a
 * row; a mismatch sways gently and never reveals the answer — the tube
 * colour and the probe are the student's evidence.
 */

const MIX_TIME = 1.15; // seconds of swirl after a drop lands
const SQUEEZE_TIME = 0.55; // hold time before the drop releases
const MEASURE_TIME = 0.7; // hold time for the probe to lock a reading

// ---------------------------------------------------------------- data ----

interface SolutionDef { name: string; short: string; ph: number; natural: string }

const SOLUTIONS: SolutionDef[] = [
  { name: 'Lemon juice', short: 'Lemon', ph: 2.4, natural: '#f6efc4' },
  { name: 'Vinegar', short: 'Vinegar', ph: 2.9, natural: '#f2f6ee' },
  { name: 'Apple juice', short: 'Apple', ph: 3.5, natural: '#f2e2ae' },
  { name: 'Black coffee', short: 'Coffee', ph: 5.0, natural: '#3f2a1d' },
  { name: 'Rainwater', short: 'Rain', ph: 5.6, natural: '#eef4f8' },
  { name: 'Distilled water', short: 'Water', ph: 7.0, natural: '#f2f7fa' },
  { name: 'Baking soda solution', short: 'Baking soda', ph: 8.3, natural: '#edf0e7' },
  { name: 'Soap solution', short: 'Soap', ph: 9.5, natural: '#f5f1e4' },
  { name: 'Milk of magnesia', short: 'Magnesia', ph: 10.5, natural: '#efeee8' },
];

interface SlotDef { label: string; range: string; colour: string; centre: number }

/** The seven universal-indicator colour bands of the 0–14 strip. */
const SLOTS: SlotDef[] = [
  { label: 'Red', range: '1–2', colour: '#d92d1b', centre: 1.5 },
  { label: 'Orange', range: '3–4', colour: '#ef7215', centre: 3.5 },
  { label: 'Yellow', range: '5–6', colour: '#e9c832', centre: 5.5 },
  { label: 'Green', range: '7', colour: '#2f9e44', centre: 7 },
  { label: 'Blue', range: '8–9', colour: '#1f6fd6', centre: 8.5 },
  { label: 'Indigo', range: '10–11', colour: '#3a44a8', centre: 10.5 },
  { label: 'Violet', range: '12–14', colour: '#7a2a9e', centre: 13 },
];

const SLOT_BOUNDS = [0, 2.5, 4.5, 6.5, 7.5, 9.5, 11.5, 14];

/** Which colour band a pH value belongs to (acceptance ranges). */
function slotIndexForPh(ph: number): number {
  if (ph <= 2.5) return 0;
  if (ph <= 4.5) return 1;
  if (ph <= 6.5) return 2;
  if (ph <= 7.5) return 3;
  if (ph <= 9.5) return 4;
  if (ph <= 11.5) return 5;
  return 6;
}

// ------------------------------------------------------- colour helpers ---

type Rgb = [number, number, number];

function hex2rgb(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbStr(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function shade(c: Rgb, f: number): Rgb {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
}

/** Universal-indicator colour anchors across the 0–14 scale. */
const INDICATOR_ANCHORS: { ph: number; c: Rgb }[] = [
  { ph: 0, c: hex2rgb('#9c0d16') },
  { ph: 1, c: hex2rgb('#c0151c') },
  { ph: 2, c: hex2rgb('#d92d1b') },
  { ph: 3, c: hex2rgb('#ec6a13') },
  { ph: 4, c: hex2rgb('#f6990b') },
  { ph: 5, c: hex2rgb('#f0c418') },
  { ph: 6, c: hex2rgb('#e3cf1c') },
  { ph: 7, c: hex2rgb('#2f9e44') },
  { ph: 8, c: hex2rgb('#1f86b0') },
  { ph: 9, c: hex2rgb('#1e6fd6') },
  { ph: 10, c: hex2rgb('#3a44a8') },
  { ph: 11, c: hex2rgb('#5b34a8') },
  { ph: 12, c: hex2rgb('#7a2a9e') },
  { ph: 13, c: hex2rgb('#8d2b9c') },
  { ph: 14, c: hex2rgb('#9a2791') },
];

/** Continuous universal-indicator colour at any pH (interpolated). */
function indicatorRgb(ph: number): Rgb {
  const p = clamp(ph, 0, 14);
  for (let i = 1; i < INDICATOR_ANCHORS.length; i += 1) {
    const a = INDICATOR_ANCHORS[i - 1];
    const b = INDICATOR_ANCHORS[i];
    if (p <= b.ph) {
      const t = (p - a.ph) / (b.ph - a.ph);
      return mixRgb(a.c, b.c, t);
    }
  }
  return INDICATOR_ANCHORS[INDICATOR_ANCHORS.length - 1].c;
}

function classifyWord(ph: number): string {
  if (ph < 6.5) return 'acidic';
  if (ph <= 7.5) return 'neutral';
  return 'alkaline';
}

function classifySlot(slot: number): 'Acid' | 'Neutral' | 'Alkali' {
  const c = SLOTS[slot].centre;
  if (c < 6.5) return 'Acid';
  if (c <= 7.5) return 'Neutral';
  return 'Alkali';
}

// ------------------------------------------------------------ UI texts ----

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'pickup',
    title: 'Pick up the dropper',
    detail: 'Drag the glass dropper off its rest by the left wall — you will carry it over the tubes yourself.',
    hint: 'On touch screens, drag with a finger — or press “Squeeze indicator” and the dropper flies there for you.',
  },
  {
    id: 'first',
    title: 'Add indicator to your first solution',
    detail: 'Hold the dropper still over a tube — a drop swells at the tip, falls in, and the liquid swirls to its colour.',
    hint: 'Lemon juice makes a dramatic first colour.',
  },
  {
    id: 'several',
    title: 'Test several across the rack',
    detail: 'Carry the dropper tube to tube. Five tested solutions is a good spread — the whole rack is even better.',
  },
  {
    id: 'probe',
    title: 'Check one with the pH probe',
    detail: 'Drag the digital probe into a tube and hold it still — the exact pH locks into the side panel. Numbers sharpen what colour suggests.',
  },
  {
    id: 'place',
    title: 'Place every tube on the 0–14 strip',
    detail: 'Drag each coloured tube down and match its liquid to the strip’s colour band. A true band clinks into place; a mismatch sways gently until you re-place it.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'first-drop', title: 'First drop', icon: '💧', detail: 'Squeezed the first drop of universal indicator into a solution.' },
  { id: 'full-rack', title: 'Whole rack tested', icon: '⚗', detail: 'Added indicator to all nine household solutions.' },
  { id: 'probe-used', title: 'Probe used', icon: '🔬', detail: 'Locked an exact digital pH reading with the probe.' },
  { id: 'scale-placed', title: 'Scale fully placed', icon: '🌈', detail: 'Stood all nine tubes on the 0–14 strip.' },
  { id: 'all-correct', title: 'All placements correct', icon: '★', detail: 'Every tube sits in its true colour band at once.' },
];

// -------------------------------------------------------------- types -----

interface Tube {
  id: number;
  x: number; y: number; // current centre
  hx: number; hy: number; // rack home
  tx: number; ty: number; // assigned slot target
  mode: 'rack' | 'drag' | 'strip' | 'return';
  slot: number;
  locked: boolean;
  sway: number;
  drops: number;
  mixT: number;
  coloured: boolean;
  probed: boolean;
  wobble: number;
}

interface FallingDrop { x: number; y: number; vy: number; tube: number }
interface Ripple { x: number; y: number; r: number; a: number }
interface AutoAnim { tube: number; phase: 0 | 1 | 2; t: number; fromX: number; fromY: number }

interface Layout {
  w: number; h: number;
  tubeW: number; tubeH: number;
  rackY: number; rackBottom: number;
  stripX0: number; stripY: number; stripW: number; stripH: number;
  bounds: number[];
  slotCentres: number[];
  stripBaseY: number;
  dropperPark: { x: number; y: number };
  probePark: { x: number; y: number };
}

interface Sim {
  tubes: Tube[];
  layout: Layout;
  layoutW: number; layoutH: number;
  time: number;
  uiAcc: number;
  dragTube: number;
  tubeGrabDX: number; tubeGrabDY: number;
  dropCount: number;
  pendingProbe: number;
  slideAt: number;
  dropperOver: number;
  probeOver: number;
  dropper: { x: number; y: number; held: boolean; grabDX: number; grabDY: number; squeeze: number; auto: AutoAnim | null };
  probe: { x: number; y: number; held: boolean; grabDX: number; grabDY: number; measure: number; auto: AutoAnim | null };
  drops: FallingDrop[];
  ripples: Ripple[];
}

interface UiSnap {
  tested: number; placed: number; correct: number; drops: number;
  slotCounts: number[];
  held: null | 'dropper' | 'probe' | 'tube';
  squeeze: number;
  measuring: boolean;
  mixing: boolean;
  nextUntested: number;
  nextUnprobed: number;
}

interface TableRow {
  tube: number; name: string; colourName: string; colourHex: string;
  matched: string; slotIdx: number; probe: number | null;
  type: 'Acid' | 'Neutral' | 'Alkali';
}

interface ProbeRow { tube: number; ph: number }

const meta = getLabBySlug('ph-spectrum')!;

// ------------------------------------------------------------- layout -----

function makeLayout(w: number, h: number): Layout {
  const tubeW = clamp((w - 30) / 9 - 13, 17, 26);
  const tubeH = clamp(h * 0.185, 52, 86);
  const rackY = 34;
  const rackBottom = rackY + 8 + tubeH + 10;
  const stripH = clamp(h * 0.062, 22, 32);
  const stripY = h - stripH - 26;
  const stripX0 = 14;
  const stripW = Math.max(140, w - 28);
  const bounds = SLOT_BOUNDS.map((ph) => stripX0 + (ph / 14) * stripW);
  const slotCentres = SLOTS.map((s) => stripX0 + (s.centre / 14) * stripW);
  const stripBaseY = stripY + stripH + 4;
  const midY = (rackBottom + stripY) / 2;
  return {
    w, h, tubeW, tubeH, rackY, rackBottom,
    stripX0, stripY, stripW, stripH, bounds, slotCentres, stripBaseY,
    dropperPark: { x: 38, y: Math.max(rackBottom + 22, Math.min(midY - 42, stripY - 96)) },
    probePark: { x: w - 40, y: Math.max(rackBottom + 18, Math.min(midY - 40, stripY - 92)) },
  };
}

function homeX(L: Layout, id: number): number {
  const x0 = 24;
  const x1 = L.w - 24;
  return x0 + ((x1 - x0) * (id + 0.5)) / 9;
}

function slotAtX(L: Layout, x: number): number {
  for (let i = 0; i < 7; i += 1) {
    if (x >= L.bounds[i] && x < L.bounds[i + 1]) return i;
  }
  return -1;
}

function relayout(s: Sim): void {
  s.layout = makeLayout(s.layoutW, s.layoutH);
  const L = s.layout;
  for (const tb of s.tubes) {
    tb.hx = homeX(L, tb.id);
    tb.hy = L.rackY + 8 + L.tubeH / 2;
    if (tb.mode === 'rack') { tb.x = tb.hx; tb.y = tb.hy; }
  }
  if (!s.dropper.held && !s.dropper.auto) { s.dropper.x = L.dropperPark.x; s.dropper.y = L.dropperPark.y; }
  if (!s.probe.held && !s.probe.auto) { s.probe.x = L.probePark.x; s.probe.y = L.probePark.y; }
  assignSlotTargets(s);
}

/** Where each strip-standing tube should stand inside its slot. */
function assignSlotTargets(s: Sim): void {
  const L = s.layout;
  const ty = L.stripBaseY - L.tubeH / 2;
  for (let i = 0; i < 7; i += 1) {
    const inSlot = s.tubes.filter((tb) => tb.mode === 'strip' && tb.slot === i);
    const cx = L.slotCentres[i];
    const width = L.bounds[i + 1] - L.bounds[i];
    const off = Math.min(14, Math.max(10, width * 0.18));
    inSlot.forEach((tb, k) => {
      tb.tx = inSlot.length === 1 ? cx : cx + (k === 0 ? -off : off);
      tb.ty = ty;
    });
  }
}

function dropperOverTube(s: Sim): number {
  const L = s.layout;
  const tipX = s.dropper.x;
  const tipY = s.dropper.y + 34;
  for (const tb of s.tubes) {
    if (tb.mode === 'drag') continue;
    const top = tb.y - L.tubeH / 2;
    if (Math.abs(tipX - tb.x) < L.tubeW / 2 + 7 && tipY > top - 36 && tipY < top + L.tubeH * 0.5) {
      return tb.id;
    }
  }
  return -1;
}

function probeInTube(s: Sim): number {
  const L = s.layout;
  const tipX = s.probe.x;
  const tipY = s.probe.y + 44;
  for (const tb of s.tubes) {
    if (tb.mode === 'drag') continue;
    const top = tb.y - L.tubeH / 2;
    const surf = top + L.tubeH * 0.36;
    const bottom = tb.y + L.tubeH / 2;
    if (Math.abs(tipX - tb.x) < L.tubeW / 2 - 1 && tipY > surf + 3 && tipY < bottom - 4) {
      return tb.id;
    }
  }
  return -1;
}

function tubeAt(s: Sim, x: number, y: number): Tube | null {
  const L = s.layout;
  let best: Tube | null = null;
  let bestD = Infinity;
  for (const tb of s.tubes) {
    if (tb.mode === 'strip' && tb.locked) continue;
    const dx = Math.abs(x - tb.x);
    const dy = Math.abs(y - tb.y);
    if (dx < L.tubeW / 2 + 16 && dy < L.tubeH / 2 + 12 && dx + dy < bestD) {
      bestD = dx + dy;
      best = tb;
    }
  }
  return best;
}

function nextUntested(s: Sim): number {
  return s.tubes.findIndex((tb) => !tb.coloured && tb.mixT <= 0);
}

function freshSim(): Sim {
  const tubes: Tube[] = SOLUTIONS.map((_, i) => ({
    id: i, x: 0, y: 0, hx: 0, hy: 0, tx: 0, ty: 0,
    mode: 'rack', slot: -1, locked: false, sway: 0,
    drops: 0, mixT: 0, coloured: false, probed: false, wobble: 0,
  }));
  return {
    tubes,
    layout: makeLayout(800, 500),
    layoutW: 0, layoutH: 0,
    time: 0, uiAcc: 0,
    dragTube: -1, tubeGrabDX: 0, tubeGrabDY: 0,
    dropCount: 0, pendingProbe: -1, slideAt: 0,
    dropperOver: -1, probeOver: -1,
    dropper: { x: 0, y: 0, held: false, grabDX: 0, grabDY: 0, squeeze: 0, auto: null },
    probe: { x: 0, y: 0, held: false, grabDX: 0, grabDY: 0, measure: 0, auto: null },
    drops: [], ripples: [],
  };
}

// ------------------------------------------------------ canvas helpers ----

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function easeOutCubic(t: number): number {
  const k = clamp(t, 0, 1);
  return 1 - (1 - k) * (1 - k) * (1 - k);
}

function tubeBodyPath(ctx: CanvasRenderingContext2D, tw: number, th: number): void {
  const top = -th / 2;
  const bot = th / 2;
  const r = tw / 2;
  ctx.beginPath();
  ctx.moveTo(-tw / 2, top + 6);
  ctx.lineTo(-tw / 2, bot - r);
  ctx.arc(0, bot - r, r, Math.PI, 0, true);
  ctx.lineTo(tw / 2, top + 6);
}

function drawTube(
  ctx: CanvasRenderingContext2D,
  tb: Tube,
  L: Layout,
  t: number,
): void {
  const tw = L.tubeW;
  const th = L.tubeH;
  const sol = SOLUTIONS[tb.id];
  ctx.save();
  ctx.translate(tb.x, tb.y);
  if (tb.mode === 'strip' && !tb.locked && tb.sway > 0) {
    ctx.rotate(Math.sin(t * 2.1 + tb.id * 1.7) * 0.055 * tb.sway);
  }
  if (tb.wobble > 0) {
    ctx.rotate(Math.sin((0.25 - tb.wobble) * 42) * tb.wobble * 0.6);
  }
  if (tb.mode === 'drag') {
    ctx.fillStyle = 'rgba(23,35,52,0.14)';
    ctx.beginPath();
    ctx.ellipse(6, th / 2 + 12, tw * 0.75, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const surf = -th / 2 + th * 0.36;

  // liquid
  const ind = indicatorRgb(sol.ph);
  const natural = hex2rgb(sol.natural);
  let liquid: Rgb;
  if (tb.coloured) {
    liquid = mixRgb(natural, ind, 0.92);
  } else if (tb.mixT > 0) {
    liquid = mixRgb(natural, ind, 0.92 * easeOutCubic(1 - tb.mixT / MIX_TIME));
  } else {
    liquid = natural;
  }
  tubeBodyPath(ctx, tw, th);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, surf, 0, th / 2);
  g.addColorStop(0, rgbStr(mixRgb(liquid, [255, 255, 255], 0.22)));
  g.addColorStop(1, rgbStr(shade(liquid, 0.82)));
  ctx.fillStyle = g;
  ctx.fillRect(-tw / 2, surf, tw, th);
  // swirling dye arcs while mixing
  if (tb.mixT > 0) {
    const cy = (surf + th / 2) / 2;
    ctx.strokeStyle = rgbStr(ind);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, cy, tw * 0.27, t * 5, t * 5 + 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, cy, tw * 0.38, -t * 4.2, -t * 4.2 + 1.6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // meniscus + shimmer
  ctx.strokeStyle = 'rgba(23,35,52,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, surf, tw / 2 - 1.5, 3, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.6;
  const mx = Math.sin(t * 1.6 + tb.id * 2.1) * (tw * 0.16);
  ctx.beginPath();
  ctx.ellipse(mx, surf + 1, tw * 0.2, 2.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // glass outline + shine + rim
  tubeBodyPath(ctx, tw, th);
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-tw / 2 + 3.5, -th / 2 + 10);
  ctx.lineTo(-tw / 2 + 3.5, th / 2 - tw / 2 - 6);
  ctx.stroke();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -th / 2 + 4, tw / 2 + 2, 3.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // brass collar marks a locked (correctly placed) tube
  if (tb.mode === 'strip' && tb.locked) {
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(-tw / 2, th / 2 - 16, tw, 4);
    ctx.strokeStyle = '#a97e22';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-tw / 2, th / 2 - 16, tw, 4);
  }
  // gentle amber halo for a swaying (mis-placed) tube
  if (tb.mode === 'strip' && !tb.locked && tb.sway > 0) {
    ctx.strokeStyle = `rgba(245,182,66,${0.35 + 0.25 * Math.sin(t * 3)})`;
    ctx.lineWidth = 2;
    tubeBodyPath(ctx, tw, th);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRackBase(ctx: CanvasRenderingContext2D, L: Layout): void {
  const woodG = (y0: number, hh: number) => {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + hh);
    g.addColorStop(0, '#dccda9');
    g.addColorStop(1, '#c3ad83');
    return g;
  };
  // side posts
  for (const px of [12, L.w - 20]) {
    ctx.fillStyle = woodG(L.rackY - 2, L.rackBottom - L.rackY + 4);
    roundRect(ctx, px, L.rackY - 2, 8, L.rackBottom - L.rackY + 4, 3);
    ctx.fill();
    ctx.strokeStyle = '#a98f66';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // base tray with dimples
  ctx.fillStyle = woodG(L.rackBottom - 14, 14);
  roundRect(ctx, 16, L.rackBottom - 14, L.w - 32, 14, 5);
  ctx.fill();
  ctx.strokeStyle = '#a98f66';
  ctx.stroke();
  ctx.fillStyle = '#6b5233';
  for (let i = 0; i < 9; i += 1) {
    const x = homeX(L, i);
    ctx.beginPath();
    ctx.ellipse(x, L.rackBottom - 7, L.tubeW * 0.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRackRail(ctx: CanvasRenderingContext2D, L: Layout): void {
  const y = L.rackY + 12;
  const g = ctx.createLinearGradient(0, y, 0, y + 13);
  g.addColorStop(0, '#e2d4b2');
  g.addColorStop(1, '#c9b48c');
  ctx.fillStyle = g;
  roundRect(ctx, 12, y, L.w - 24, 13, 4);
  ctx.fill();
  ctx.strokeStyle = '#a98f66';
  ctx.lineWidth = 1;
  ctx.stroke();
  // holes the tubes pass through
  for (let i = 0; i < 9; i += 1) {
    const x = homeX(L, i);
    ctx.fillStyle = '#4a3a26';
    ctx.beginPath();
    ctx.ellipse(x, y + 7, L.tubeW * 0.62, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e2417';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, L.tubeW * 0.5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // brass screws
  ctx.fillStyle = '#d9a441';
  for (const sx of [20, L.w - 20]) {
    ctx.beginPath();
    ctx.arc(sx, y + 6.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStrip(ctx: CanvasRenderingContext2D, L: Layout, s: Sim): void {
  const { stripX0: x0, stripY: y, stripW: w, stripH: hh } = L;
  // tray back
  ctx.fillStyle = '#fcfdfe';
  roundRect(ctx, x0 - 8, y - 5, w + 16, hh + 12, 8);
  ctx.fill();
  ctx.strokeStyle = '#d5dde5';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // the continuous 0–14 universal-indicator rainbow
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  for (const a of INDICATOR_ANCHORS) g.addColorStop(a.ph / 14, rgbStr(a.c));
  ctx.fillStyle = g;
  roundRect(ctx, x0, y, w, hh, 5);
  ctx.fill();
  // gloss
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0 + 2, y + 2, w - 4, hh * 0.38);
  ctx.globalAlpha = 1;
  // band separators
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  for (let i = 1; i < 7; i += 1) {
    const bx = L.bounds[i];
    ctx.beginPath();
    ctx.moveTo(bx, y + 2);
    ctx.lineTo(bx, y + hh - 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // integer pH ticks beneath the strip
  ctx.strokeStyle = '#b6c1cc';
  ctx.lineWidth = 1;
  for (let ph = 0; ph <= 14; ph += 1) {
    const tx = x0 + (ph / 14) * w;
    const tall = ph % 7 === 0 ? 6 : 3.5;
    ctx.beginPath();
    ctx.moveTo(tx, y + hh + 1.5);
    ctx.lineTo(tx, y + hh + 1.5 + tall);
    ctx.stroke();
  }
  // neutral hover glow for the slot under a dragged tube (never hints correct)
  if (s.dragTube >= 0) {
    const tb = s.tubes[s.dragTube];
    const slot = slotAtX(L, tb.x);
    if (slot >= 0 && tb.y + L.tubeH / 2 > L.stripY - 30) {
      const sx = L.bounds[slot];
      const sw = L.bounds[slot + 1] - L.bounds[slot];
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(sx + 1, y + 1, sw - 2, hh - 2);
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, y + 1, sw - 2, hh - 2);
    }
  }
}

function drawTrayFront(ctx: CanvasRenderingContext2D, L: Layout): void {
  ctx.fillStyle = '#f2f5f8';
  roundRect(ctx, L.stripX0 - 8, L.stripY + L.stripH - 2, L.stripW + 16, 13, 6);
  ctx.fill();
  ctx.strokeStyle = '#d5dde5';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawDropper(ctx: CanvasRenderingContext2D, s: Sim, t: number): void {
  const d = s.dropper;
  const bob = d.held || d.auto ? 0 : Math.sin(t * 1.7) * 3.5;
  // rest pad + shadow
  if (!d.held && !d.auto) {
    ctx.fillStyle = 'rgba(23,35,52,0.10)';
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 52, 15 - bob * 0.6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8a76a';
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 54, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a98f66';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(d.x, d.y + bob);
  // rubber bulb (squashes as you squeeze)
  const sq = d.squeeze;
  ctx.save();
  ctx.translate(0, -30);
  ctx.scale(1 + sq * 0.28, 1 - sq * 0.38);
  const bg = ctx.createRadialGradient(-3, -3, 2, 0, 0, 11);
  bg.addColorStop(0, '#ef6a3a');
  bg.addColorStop(1, '#b23a1c');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8f2f16';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-3, -3.5, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // glass barrel with olive indicator stock
  ctx.fillStyle = 'rgba(226,238,245,0.55)';
  roundRect(ctx, -5.5, -22, 11, 36, 4);
  ctx.fill();
  const level = 2 + sq * 5;
  ctx.fillStyle = 'rgba(74,93,38,0.9)';
  ctx.fillRect(-4, -20 + level, 8, 34 - level);
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -5.5, -22, 11, 36, 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2.5, -18);
  ctx.lineTo(-2.5, 10);
  ctx.stroke();
  // tapered tip
  ctx.fillStyle = 'rgba(226,238,245,0.75)';
  ctx.beginPath();
  ctx.moveTo(-3.5, 14);
  ctx.lineTo(0, 34);
  ctx.lineTo(3.5, 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // the drop swelling at the tip while you hold
  if (sq > 0.08) {
    const r = 1.5 + sq * 4.2;
    const dy = 35 + sq * 5;
    const dg = ctx.createRadialGradient(-1, dy - 1, 0.5, 0, dy, r);
    dg.addColorStop(0, '#7d9440');
    dg.addColorStop(1, '#46571f');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(0, dy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(-r * 0.3, dy - r * 0.35, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawProbe(ctx: CanvasRenderingContext2D, s: Sim, t: number): void {
  const p = s.probe;
  const L = s.layout;
  // wall holder
  if (!p.held && !p.auto) {
    ctx.fillStyle = '#c9d2db';
    roundRect(ctx, L.probePark.x - 14, L.probePark.y - 64, 28, 10, 4);
    ctx.fill();
    ctx.strokeStyle = '#9aa7b4';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(23,35,52,0.08)';
    ctx.beginPath();
    ctx.ellipse(L.probePark.x, L.probePark.y + 56, 16, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  // body
  const bg = ctx.createLinearGradient(0, -48, 0, -10);
  bg.addColorStop(0, '#4b586b');
  bg.addColorStop(1, '#39455a');
  ctx.fillStyle = bg;
  roundRect(ctx, -10, -48, 20, 38, 6);
  ctx.fill();
  ctx.strokeStyle = '#2c3648';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // brass band
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(-10, -18, 20, 7);
  ctx.strokeStyle = '#a97e22';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-10, -18, 20, 7);
  // LED
  const measuring = p.measure > 0 || (p.auto?.phase === 1);
  const blink = measuring
    ? 0.5 + 0.5 * Math.sin(t * 18)
    : 0.45 + 0.55 * Math.sin(t * 2.4);
  ctx.fillStyle = measuring ? `rgba(52,199,89,${0.35 + blink * 0.65})` : `rgba(245,182,66,${0.3 + blink * 0.5})`;
  ctx.beginPath();
  ctx.arc(5, -41, 2.8, 0, Math.PI * 2);
  ctx.fill();
  // grip lines
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -30);
  ctx.lineTo(6, -30);
  ctx.moveTo(-6, -26);
  ctx.lineTo(6, -26);
  ctx.stroke();
  // stem
  ctx.fillStyle = '#cfd8e0';
  ctx.fillRect(-2.5, -11, 5, 48);
  ctx.strokeStyle = '#9aa7b4';
  ctx.lineWidth = 1;
  ctx.strokeRect(-2.5, -11, 5, 48);
  // sensing bulb with measurement glow
  const glow = p.measure;
  if (glow > 0) {
    ctx.shadowColor = '#7fd4ff';
    ctx.shadowBlur = 3 + 12 * glow;
  }
  ctx.fillStyle = '#dfeaf2';
  ctx.beginPath();
  ctx.arc(0, 41, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#9aa7b4';
  ctx.stroke();
  if (glow > 0) {
    ctx.fillStyle = `rgba(127,212,255,${0.3 + glow * 0.6})`;
    ctx.beginPath();
    ctx.arc(0, 41, 2.2 + glow * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------- component -----

export default function PhSpectrumLab() {
  // ---- simulation state (refs — the canvas loop owns the motion) ----------
  const sim = useRef<Sim>(freshSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student-facing state ------------------------------------------------
  const [ui, setUi] = useState<UiSnap>({
    tested: 0, placed: 0, correct: 0, drops: 0,
    slotCounts: [0, 0, 0, 0, 0, 0, 0],
    held: null, squeeze: 0, measuring: false, mixing: false,
    nextUntested: 0, nextUnprobed: 0,
  });
  const [rows, setRows] = useState<TableRow[]>([]);
  const probeLogRef = useRef<ProbeRow[]>([]);
  const [probeRead, setProbeRead] = useState<{ tube: number; ph: number } | null>(null);
  const [pickedDropper, setPickedDropper] = useState(false);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [flash, setFlash] = useState<{ tone: CoachTone; line: string } | null>(null);
  const celebrated = useRef({ rack: false, placed: false, correct: false });

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
    const placedTubes = s.tubes.filter((tb) => tb.mode === 'strip');
    const slotCounts = [0, 0, 0, 0, 0, 0, 0];
    placedTubes.forEach((tb) => { slotCounts[tb.slot] += 1; });
    setUi({
      tested: s.tubes.filter((tb) => tb.coloured).length,
      placed: placedTubes.length,
      correct: placedTubes.filter((tb) => tb.locked).length,
      drops: s.dropCount,
      slotCounts,
      held: s.dragTube >= 0 ? 'tube' : s.dropper.held || s.dropper.auto ? 'dropper' : s.probe.held || s.probe.auto ? 'probe' : null,
      squeeze: s.dropperOver >= 0 ? s.dropper.squeeze : 0,
      measuring: s.probe.measure > 0 || s.probe.auto?.phase === 1,
      mixing: s.tubes.some((tb) => tb.mixT > 0),
      nextUntested: nextUntested(s),
      nextUnprobed: s.tubes.findIndex((tb) => !tb.probed),
    });
  }, []);

  // ---- probe reading lock ---------------------------------------------------
  const lockProbe = useCallback((id: number) => {
    const s = sim.current;
    const tb = s.tubes[id];
    tb.probed = true;
    const sol = SOLUTIONS[id];
    labSound.ping(880, 0.11);
    setProbeRead({ tube: id, ph: sol.ph });
    probeLogRef.current = [...probeLogRef.current.filter((r) => r.tube !== id), { tube: id, ph: sol.ph }];
    earn('probe-used');
    pushToast('info', '🔬', `Probe locked — pH ${sol.ph.toFixed(1)} · ${sol.name}.`);
    setFlash({
      tone: 'good',
      line: `pH ${sol.ph.toFixed(1)} — ${sol.name} reads ${classifyWord(sol.ph)}. Now let the colour and the number guide where the tube belongs.`,
    });
  }, [earn, pushToast]);

  // ---- mentor completion flags ---------------------------------------------
  const done = [
    pickedDropper,
    ui.tested >= 1,
    ui.tested >= 5,
    badges.includes('probe-used'),
    ui.correct === 9,
  ];

  useEffect(() => {
    const next = done.findIndex((d) => !d);
    if (next > mentorIndex) {
      setMentorIndex(next);
      labSound.step();
    } else if (done[done.length - 1] && mentorIndex < MENTOR_STEPS.length - 1) {
      setMentorIndex(MENTOR_STEPS.length - 1);
    }
  }, [done, mentorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ---------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'pickup': return { target: 'scene', gesture: 'drag', title: 'Pick up the dropper', body: 'Drag the glass dropper up from its rest — carry it over any tube in the rack.' };
      case 'first': return { target: 'scene', gesture: 'press', title: 'Hold to squeeze', body: 'Keep the dropper still over a tube — a drop swells at the tip and falls in by itself.' };
      case 'several': return { target: 'scene', gesture: 'drag', title: 'Work along the rack', body: 'Carry the dropper tube to tube — the whole spectrum of colours is up there.' };
      case 'probe': return { target: 'scene', gesture: 'drag', title: 'Fetch the probe', body: 'Drag the digital probe into a coloured tube and hold still — the exact pH locks in the side panel.' };
      case 'place': return { target: 'scene', gesture: 'drag', title: 'Build the scale', body: 'Drag each tube down onto the strip and match its liquid colour to the band beneath.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- simulation step -------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const cv = canvasRef.current;
    if (cv && (cv.clientWidth !== s.layoutW || cv.clientHeight !== s.layoutH)) {
      s.layoutW = cv.clientWidth;
      s.layoutH = cv.clientHeight;
      relayout(s);
    }
    const L = s.layout;
    s.time += dt;

    s.dropperOver = s.dropper.held || s.dropper.auto ? dropperOverTube(s) : -1;
    s.probeOver = s.probe.held || s.probe.auto ? probeInTube(s) : -1;

    // dropper: auto-flight, or easing back to its rest
    const da = s.dropper.auto;
    if (da) {
      da.t += dt;
      if (da.phase === 0) {
        const tb = s.tubes[da.tube];
        const k = Math.min(1, da.t / 0.45);
        const e = k * k * (3 - 2 * k);
        const targetY = tb.y - L.tubeH / 2 - 62;
        s.dropper.x = da.fromX + (tb.x - da.fromX) * e;
        s.dropper.y = da.fromY + (targetY - da.fromY) * e;
        if (k >= 1) { da.phase = 1; da.t = 0; }
      } else if (da.phase === 1) {
        s.dropper.squeeze = Math.min(1, da.t / SQUEEZE_TIME);
        if (s.dropper.squeeze >= 1) {
          s.drops.push({ x: s.dropper.x, y: s.dropper.y + 38, vy: 30, tube: da.tube });
          s.dropper.squeeze = 0;
          da.phase = 2;
          da.t = 0;
          da.fromX = s.dropper.x;
          da.fromY = s.dropper.y;
        }
      } else {
        const k = Math.min(1, da.t / 0.5);
        const e = k * k * (3 - 2 * k);
        s.dropper.x = da.fromX + (L.dropperPark.x - da.fromX) * e;
        s.dropper.y = da.fromY + (L.dropperPark.y - da.fromY) * e;
        if (k >= 1) { s.dropper.auto = null; }
      }
    } else if (!s.dropper.held) {
      const k = Math.min(1, dt * 10);
      s.dropper.x += (L.dropperPark.x - s.dropper.x) * k;
      s.dropper.y += (L.dropperPark.y - s.dropper.y) * k;
    }

    // hold-to-squeeze when the dropper rides above a tube
    if (s.dropper.held && !s.dropper.auto && s.dropperOver >= 0) {
      s.dropper.squeeze += dt / SQUEEZE_TIME;
      if (s.dropper.squeeze >= 1) {
        s.drops.push({ x: s.dropper.x, y: s.dropper.y + 38, vy: 30, tube: s.dropperOver });
        s.dropper.squeeze = 0;
      }
    } else if (!s.dropper.auto) {
      s.dropper.squeeze = Math.max(0, s.dropper.squeeze - dt * 2.2);
    }

    // probe: auto-flight, or easing back to its holder
    const pa = s.probe.auto;
    if (pa) {
      pa.t += dt;
      if (pa.phase === 0) {
        const tb = s.tubes[pa.tube];
        const k = Math.min(1, pa.t / 0.45);
        const e = k * k * (3 - 2 * k);
        const targetY = tb.y - L.tubeH / 2 + L.tubeH * 0.36 + 8 - 44;
        s.probe.x = pa.fromX + (tb.x - pa.fromX) * e;
        s.probe.y = pa.fromY + (targetY - pa.fromY) * e;
        if (k >= 1) { pa.phase = 1; pa.t = 0; }
      } else if (pa.phase === 1) {
        s.probe.measure = Math.min(1, pa.t / MEASURE_TIME);
        if (s.probe.measure >= 1) {
          s.pendingProbe = pa.tube;
          s.probe.measure = 0;
          pa.phase = 2;
          pa.t = 0;
          pa.fromX = s.probe.x;
          pa.fromY = s.probe.y;
        }
      } else {
        const k = Math.min(1, pa.t / 0.5);
        const e = k * k * (3 - 2 * k);
        s.probe.x = pa.fromX + (L.probePark.x - pa.fromX) * e;
        s.probe.y = pa.fromY + (L.probePark.y - pa.fromY) * e;
        if (k >= 1) { s.probe.auto = null; }
      }
    } else if (!s.probe.held) {
      const k = Math.min(1, dt * 10);
      s.probe.x += (L.probePark.x - s.probe.x) * k;
      s.probe.y += (L.probePark.y - s.probe.y) * k;
    }

    // hold-to-measure while the probe bulb sits in a liquid
    if (s.probe.held && !s.probe.auto && s.probeOver >= 0) {
      s.probe.measure = Math.min(1, s.probe.measure + dt / MEASURE_TIME);
      if (s.probe.measure >= 1) {
        s.pendingProbe = s.probeOver;
        s.probe.measure = 0;
      }
    } else if (!s.probe.auto) {
      s.probe.measure = Math.max(0, s.probe.measure - dt * 2.5);
    }

    if (s.pendingProbe >= 0) {
      const id = s.pendingProbe;
      s.pendingProbe = -1;
      lockProbe(id);
    }

    // falling drops
    for (let i = s.drops.length - 1; i >= 0; i -= 1) {
      const dr = s.drops[i];
      const tb = s.tubes[dr.tube];
      dr.vy += 1500 * dt;
      dr.y += dr.vy * dt;
      dr.x += (tb.x - dr.x) * Math.min(1, dt * 6);
      const surf = tb.y - L.tubeH / 2 + L.tubeH * 0.36;
      if (dr.y >= surf) {
        s.drops.splice(i, 1);
        s.ripples.push({ x: tb.x, y: surf, r: 3, a: 0.85 });
        labSound.drip(false);
        tb.drops += 1;
        tb.mixT = tb.coloured ? 0.7 : MIX_TIME;
        labSound.slosh(0.45);
        if (s.dropCount === 0) earn('first-drop');
        s.dropCount += 1;
      }
    }

    // mixing + tube motion
    for (const tb of s.tubes) {
      if (tb.mixT > 0) {
        tb.mixT -= dt;
        if (tb.mixT <= 0) {
          tb.mixT = 0;
          tb.coloured = true;
        }
      }
      if (tb.wobble > 0) tb.wobble = Math.max(0, tb.wobble - dt);
      if (tb.mode === 'strip') {
        const k = Math.min(1, dt * 9);
        tb.x += (tb.tx - tb.x) * k;
        tb.y += (tb.ty - tb.y) * k;
      } else if (tb.mode === 'return') {
        const k = Math.min(1, dt * 8);
        tb.x += (tb.hx - tb.x) * k;
        tb.y += (tb.hy - tb.y) * k;
        if (Math.hypot(tb.hx - tb.x, tb.hy - tb.y) < 2) {
          tb.mode = 'rack';
          tb.x = tb.hx;
          tb.y = tb.hy;
          tb.wobble = 0.22;
        }
      }
    }

    // ripples decay
    for (let i = s.ripples.length - 1; i >= 0; i -= 1) {
      const rp = s.ripples[i];
      rp.r += dt * 26;
      rp.a -= dt * 1.7;
      if (rp.a <= 0) s.ripples.splice(i, 1);
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [earn, syncUi, lockProbe]);

  // ---- drawing -----------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const L = s.layout;
    const t = s.time;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench band under the strip
    const benchY = L.stripY + L.stripH + 8;
    const bench = ctx.createLinearGradient(0, benchY, 0, h);
    bench.addColorStop(0, '#e9e1cf');
    bench.addColorStop(1, '#d7c9ad');
    ctx.fillStyle = bench;
    ctx.fillRect(0, benchY, w, h - benchY);
    ctx.strokeStyle = '#c6b592';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, benchY + 0.5);
    ctx.lineTo(w, benchY + 0.5);
    ctx.stroke();

    // rack shelf shadow
    ctx.fillStyle = 'rgba(23,35,52,0.07)';
    ctx.beginPath();
    ctx.ellipse(w / 2, L.rackBottom + 6, w * 0.42, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // the 0–14 strip (drawn before tubes so tubes stand inside the trough)
    drawStrip(ctx, L, s);

    // rack + tubes in the rack
    drawRackBase(ctx, L);
    for (const tb of s.tubes) {
      if (tb.mode === 'rack' || tb.mode === 'return') drawTube(ctx, tb, L, t);
    }
    drawRackRail(ctx, L);

    // tubes standing on the strip, then the trough's front lip
    for (const tb of s.tubes) {
      if (tb.mode === 'strip') drawTube(ctx, tb, L, t);
    }
    drawTrayFront(ctx, L);

    // the tube in hand, on top of everything on the bench
    if (s.dragTube >= 0) drawTube(ctx, s.tubes[s.dragTube], L, t);

    // highlight ring on the tube the dropper (or probe) is working over
    const activeTube = s.dropperOver >= 0 ? s.tubes[s.dropperOver] : s.probeOver >= 0 ? s.tubes[s.probeOver] : null;
    if (activeTube) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(249,115,22,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(activeTube.x, activeTube.y - L.tubeH / 2 + 2, L.tubeW / 2 + 6, 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ripples on liquid surfaces
    for (const rp of s.ripples) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, rp.a)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // falling indicator drops
    for (const dr of s.drops) {
      const stretch = 1 + Math.min(1.2, dr.vy * 0.0012);
      const dg = ctx.createRadialGradient(dr.x - 1.5, dr.y - 1.5, 0.5, dr.x, dr.y, 5);
      dg.addColorStop(0, '#7d9440');
      dg.addColorStop(1, '#46571f');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.ellipse(dr.x, dr.y, 3.4, 3.4 * stretch, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(dr.x - 1.2, dr.y - 1.4, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // instruments on top
    drawProbe(ctx, s, t);
    drawDropper(ctx, s, t);
  }, []);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ------------------------------------------------------
  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = sim.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!s.dropper.held && !s.dropper.auto && Math.abs(p.x - s.dropper.x) < 30 && Math.abs(p.y - (s.dropper.y + 2)) < 46) {
      s.dropper.held = true;
      s.dropper.grabDX = p.x - s.dropper.x;
      s.dropper.grabDY = p.y - s.dropper.y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.35);
      setPickedDropper(true);
      notePointer(true);
      return;
    }
    if (!s.probe.held && !s.probe.auto && Math.abs(p.x - s.probe.x) < 26 && Math.abs(p.y - (s.probe.y - 8)) < 56) {
      s.probe.held = true;
      s.probe.grabDX = p.x - s.probe.x;
      s.probe.grabDY = p.y - s.probe.y;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.3);
      notePointer(true);
      return;
    }
    const tb = tubeAt(s, p.x, p.y);
    if (tb) {
      if (tb.locked) {
        tb.wobble = 0.3;
        labSound.glassClink(true);
        notePointer(false);
        return;
      }
      s.dragTube = tb.id;
      s.tubeGrabDX = p.x - tb.x;
      s.tubeGrabDY = p.y - tb.y;
      tb.mode = 'drag';
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.slide(0.45);
      notePointer(true);
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = sim.current;
    const L = s.layout;
    const now = performance.now();
    if (s.dropper.held) {
      s.dropper.x = clamp(p.x - s.dropper.grabDX, 22, L.w - 22);
      s.dropper.y = clamp(p.y - s.dropper.grabDY, 26, L.h - 48);
    } else if (s.probe.held) {
      s.probe.x = clamp(p.x - s.probe.grabDX, 18, L.w - 18);
      s.probe.y = clamp(p.y - s.probe.grabDY, 20, L.h - 40);
    } else if (s.dragTube >= 0) {
      const tb = s.tubes[s.dragTube];
      tb.x = clamp(p.x - s.tubeGrabDX, 14, L.w - 14);
      tb.y = clamp(p.y - s.tubeGrabDY, 10, L.h - 30);
      if (now - s.slideAt > 150) {
        s.slideAt = now;
        labSound.slide(0.25);
      }
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const busy = s.dropper.held || s.probe.held || s.dragTube >= 0;
      let cursor = 'default';
      if (busy) cursor = 'grabbing';
      else if (
        (Math.abs(p.x - s.dropper.x) < 30 && Math.abs(p.y - (s.dropper.y + 2)) < 46) ||
        (Math.abs(p.x - s.probe.x) < 26 && Math.abs(p.y - (s.probe.y - 8)) < 56) ||
        tubeAt(s, p.x, p.y)
      ) cursor = 'grab';
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (s.dropper.held) s.dropper.held = false;
    if (s.probe.held) s.probe.held = false;
    if (s.dragTube >= 0) {
      const id = s.dragTube;
      s.dragTube = -1;
      commitTube(id);
    }
  };

  // ---- placement commit ----------------------------------------------------------
  const returnTube = useCallback((tb: Tube) => {
    tb.mode = 'return';
    tb.slot = -1;
    tb.locked = false;
    tb.sway = 0;
    labSound.thunk(true);
  }, []);

  const recordRow = useCallback((id: number, slot: number) => {
    const sol = SOLUTIONS[id];
    const probe = probeLogRef.current.find((r) => r.tube === id)?.ph ?? null;
    const row: TableRow = {
      tube: id + 1,
      name: sol.short,
      colourName: SLOTS[slot].label,
      colourHex: rgbStr(indicatorRgb(sol.ph)),
      matched: SLOTS[slot].range,
      slotIdx: slot,
      probe,
      type: classifySlot(slot),
    };
    setRows((cur) => [...cur.filter((r) => r.tube !== row.tube), row].sort((a, b) => a.tube - b.tube));
    pushToast('good', '✎', `${sol.name} placed — ${SLOTS[slot].label} band, pH ${SLOTS[slot].range}.`);
  }, [pushToast]);

  const commitTube = useCallback((id: number) => {
    const s = sim.current;
    const L = s.layout;
    const tb = s.tubes[id];
    const nearStrip =
      tb.y + L.tubeH / 2 > L.stripY - 26 &&
      tb.y < L.stripY + L.stripH + 44 &&
      tb.x > L.stripX0 - 10 &&
      tb.x < L.stripX0 + L.stripW + 10;
    if (!nearStrip) {
      returnTube(tb);
      return;
    }
    const slot = slotAtX(L, tb.x);
    if (slot < 0) {
      returnTube(tb);
      return;
    }
    if (!tb.coloured) {
      setFlash({ tone: 'info', line: 'Add universal indicator first — a colourless liquid gives you no evidence to place yet.' });
      returnTube(tb);
      return;
    }
    const occupants = s.tubes.filter((o) => o.mode === 'strip' && o.slot === slot).length;
    if (occupants >= 2) {
      pushToast('info', '⤺', 'That band already holds two tubes — compare the liquid with the next band along.');
      returnTube(tb);
      return;
    }
    const correct = slotIndexForPh(SOLUTIONS[id].ph) === slot;
    if (correct) {
      tb.mode = 'strip';
      tb.slot = slot;
      tb.locked = true;
      tb.sway = 0;
      tb.wobble = 0.25;
      assignSlotTargets(s);
      labSound.glassClink(true);
      recordRow(id, slot);
    } else {
      tb.mode = 'strip';
      tb.slot = slot;
      tb.locked = false;
      tb.sway = 1;
      assignSlotTargets(s);
      labSound.warn();
      setFlash({
        tone: 'warn',
        line: 'The strip under that tube does not agree with its colour — compare the liquid with the band beneath it, then lift and try again.',
      });
    }
  }, [returnTube, recordRow, pushToast]);

  // ---- accessibility: the same gestures, automated -------------------------------
  const squeezeNext = useCallback(() => {
    const s = sim.current;
    if (s.dropper.held || s.dropper.auto) return;
    const id = nextUntested(s);
    if (id < 0) return;
    s.dropper.auto = { tube: id, phase: 0, t: 0, fromX: s.dropper.x, fromY: s.dropper.y };
    setPickedDropper(true);
    labSound.click();
  }, []);

  const probeNext = useCallback(() => {
    const s = sim.current;
    if (s.probe.held || s.probe.auto) return;
    const id = s.tubes.findIndex((tb) => !tb.probed);
    if (id < 0) return;
    s.probe.auto = { tube: id, phase: 0, t: 0, fromX: s.probe.x, fromY: s.probe.y };
    labSound.click();
  }, []);

  // ---- milestones ------------------------------------------------------------------
  useEffect(() => {
    if (ui.tested === 9 && !celebrated.current.rack) {
      celebrated.current.rack = true;
      earn('full-rack');
      labSound.milestone();
      pushToast('good', '⚗', 'All nine solutions tested — the whole rack is in colour.');
    }
    if (ui.placed === 9 && !celebrated.current.placed) {
      celebrated.current.placed = true;
      earn('scale-placed');
      labSound.milestone();
      pushToast('good', '🌈', 'Every tube stands on the strip — a complete 0–14 scale.');
    }
    if (ui.correct === 9 && !celebrated.current.correct) {
      celebrated.current.correct = true;
      earn('all-correct');
      labSound.milestone();
      pushToast('good', '★', 'Perfect scale — every tube sits in its true colour band.');
    }
  }, [ui.tested, ui.placed, ui.correct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- reset -----------------------------------------------------------------------
  const resetAll = () => {
    const s = sim.current;
    const L = s.layout;
    for (const tb of s.tubes) {
      tb.mode = 'rack';
      tb.slot = -1;
      tb.locked = false;
      tb.sway = 0;
      tb.drops = 0;
      tb.mixT = 0;
      tb.coloured = false;
      tb.probed = false;
      tb.wobble = 0;
      tb.x = tb.hx;
      tb.y = tb.hy;
      tb.tx = tb.x;
      tb.ty = tb.y;
    }
    s.drops = [];
    s.ripples = [];
    s.dragTube = -1;
    s.dropCount = 0;
    s.pendingProbe = -1;
    s.dropper.held = false;
    s.dropper.auto = null;
    s.dropper.squeeze = 0;
    s.dropper.x = L.dropperPark.x;
    s.dropper.y = L.dropperPark.y;
    s.probe.held = false;
    s.probe.auto = null;
    s.probe.measure = 0;
    s.probe.x = L.probePark.x;
    s.probe.y = L.probePark.y;
    probeLogRef.current = [];
    celebrated.current = { rack: false, placed: false, correct: false };
    setRows([]);
    setProbeRead(null);
    setBadges([]);
    setMentorIndex(0);
    setPickedDropper(false);
    setFlash(null);
    syncUi();
  };

  // ---- analysis ---------------------------------------------------------------------
  const plotRows = rows.filter((r) => r.probe !== null);
  const plotFit = useMemo(
    () => (plotRows.length >= 2
      ? linearFit(plotRows.map((r) => ({ x: SLOTS[r.slotIdx].centre, y: r.probe as number })))
      : null),
    [rows], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- coach -----------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (flash) return flash;
    if (ui.measuring) return { tone: 'info', line: 'Probe settling — hold it still in the liquid while the reading locks.' };
    if (ui.mixing) return { tone: 'info', line: 'The drop is in — give the swirl a moment and watch the colour settle.' };
    if (ui.held === 'dropper' && ui.squeeze > 0.03) return { tone: 'info', line: 'Hold steady — the drop is swelling at the tip. It falls when it is ready.' };
    if (ui.correct === 9) return { tone: 'good', line: 'The full 0–14 scale, built by your own hands. Open Observations for the data table and the band-versus-probe graph.' };
    if (ui.placed === 9) return { tone: 'warn', line: 'The strip is full, but a tube or two still sways — compare each swayer with the band beneath it and re-place what disagrees.' };
    if (!pickedDropper) return { tone: 'info', line: 'Pick up the dropper — drag it over a tube and hold to squeeze a drop of universal indicator.' };
    if (ui.tested === 0) return { tone: 'info', line: 'Hold the dropper over any tube — lemon juice makes a dramatic first colour.' };
    if (ui.tested < 5) return { tone: 'info', line: `${ui.tested} of 9 tested — keep going. The colours are the evidence you will place by.` };
    if (!badges.includes('probe-used')) return { tone: 'info', line: 'Colour gives the band; the probe gives the number. Drag the digital probe into a tube to lock an exact pH.' };
    if (ui.placed < 9) return { tone: 'info', line: 'Now build the scale — drag each coloured tube onto the strip where its colour belongs. A true band clinks into place.' };
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [flash, ui, pickedDropper, badges]);

  // ---- status -----------------------------------------------------------------------
  const complete = ui.correct === 9;
  const statusText = complete ? 'Experiment complete'
    : ui.measuring ? 'Probe reading…'
    : ui.mixing ? 'Indicator mixing…'
    : ui.placed > 0 ? 'Building the scale'
    : ui.tested > 0 ? 'Testing the rack'
    : 'Experiment ready';

  const lastColour = probeRead
    ? { hex: rgbStr(indicatorRgb(probeRead.ph)), name: SLOTS[slotIndexForPh(probeRead.ph)].label }
    : null;

  // ---- render -----------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.tested > 0 || ui.placed > 0 ? 'active' : 'ready'}
      captionChip="Drag · hold · place — colour is the evidence"
      legend={[
        { color: '#4a5d26', label: 'Universal indicator' },
        { color: '#8da8b9', label: 'Glass tubes' },
        { color: '#435062', label: 'Digital pH probe' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start testing', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="pH bench — drag the dropper to add universal indicator, drag the probe to measure exact pH, drag tubes onto the 0–14 scale strip"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              squeezeNext();
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
          <div className="ph-layout">
            <div className="ph-actions">
              <button
                className="action-button"
                type="button"
                data-nudge="squeeze"
                onClick={() => { squeezeNext(); notePointer(true); }}
                disabled={ui.nextUntested < 0}
              >
                <span className="dispense-icon" aria-hidden="true">💧</span>
                <span>{ui.nextUntested >= 0 ? `Squeeze indicator — ${SOLUTIONS[ui.nextUntested].short}` : 'Whole rack in colour'}</span>
                <small>or drag the dropper yourself · Space</small>
              </button>
              <button
                className="action-button"
                type="button"
                data-nudge="probe"
                onClick={() => { probeNext(); notePointer(true); }}
                disabled={ui.nextUnprobed < 0}
              >
                <span className="dispense-icon" aria-hidden="true">🔬</span>
                <span>{ui.nextUnprobed >= 0 ? `Dip the probe — ${SOLUTIONS[ui.nextUnprobed].short}` : 'Every tube measured'}</span>
                <small>or drag the probe into any tube</small>
              </button>
            </div>
            <div className="ph-progress">
              <div className="ph-progress-row">
                <label><span>Rack tested with indicator</span><strong>{ui.tested}/9</strong></label>
                <div className="ph-bar"><span style={{ width: `${(ui.tested / 9) * 100}%` }} /></div>
              </div>
              <div className="ph-progress-row">
                <label><span>Tubes standing on the scale</span><strong>{ui.placed}/9</strong></label>
                <div className="ph-bar"><span style={{ width: `${(ui.placed / 9) * 100}%` }} /></div>
              </div>
              <div className="ph-progress-row">
                <label><span>Correct colour bands</span><strong>{ui.correct}/9</strong></label>
                <div className="ph-bar"><span style={{ width: `${(ui.correct / 9) * 100}%` }} /></div>
              </div>
            </div>
          </div>
          <div className="ph-scale-map" aria-label="pH scale band map">
            {SLOTS.map((sl, i) => (
              <div className="ph-slot-chip" key={sl.label}>
                <i style={{ background: sl.colour }} />
                <span>{sl.label}</span>
                <small>pH {sl.range}</small>
                <b>{ui.slotCounts[i] > 0 ? '●'.repeat(ui.slotCounts[i]) : '—'}</b>
              </div>
            ))}
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Colour first, numbers second: the indicator gives the band, the probe gives the pH to one decimal — and a tube only records in your table when its band truly matches.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Probe reading</h2></div><span className="instrument-live">LIVE</span></div>
          <div className={`reading-main${ui.measuring ? ' ph-measuring' : ''}`}>
            <span>Digital pH probe{ui.measuring ? ' · settling…' : ''}</span>
            <strong>
              {probeRead
                ? <>{probeRead.ph.toFixed(1)} <small>pH · {SOLUTIONS[probeRead.tube].name}</small></>
                : <small className="ph-quiet">dip the probe into a tube</small>}
            </strong>
            <div className="reading-track"><span style={{ width: `${probeRead ? (probeRead.ph / 14) * 100 : 0}%`, background: lastColour ? lastColour.hex : undefined }} /></div>
            <div className="reading-scale"><span>0</span><span>7</span><span>14</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Tubes tested</span><strong>{ui.tested}/9</strong></div>
            <div><span>Tubes placed</span><strong>{ui.placed}/9</strong></div>
            <div><span>Correct bands</span><strong>{ui.correct}/9</strong></div>
            <div><span>Drops added</span><strong>{ui.drops}</strong></div>
            <div>
              <span>Indicator colour</span>
              <strong>{lastColour ? <><span className="ph-dot" style={{ background: lastColour.hex }} />{lastColour.name}</> : '—'}</strong>
            </div>
            <div><span>Classification</span><strong>{probeRead ? classifyWord(probeRead.ph) : '—'}</strong></div>
          </div>
          {probeRead && <p className="ph-probe-note">{SOLUTIONS[probeRead.tube].name} reads pH {probeRead.ph.toFixed(1)} — {classifyWord(probeRead.ph)}. The indicator colour alone puts it in the {SLOTS[slotIndexForPh(probeRead.ph)].label} band.</p>}
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Pick up the dropper — drag it over a tube and hold still: a drop swells, falls in and the liquid swirls to its colour.</li>
              <li>Work along the rack until every solution has its universal-indicator colour.</li>
              <li>Drag the digital probe into a tube and hold — the exact pH locks in the side panel.</li>
              <li>Drag each coloured tube down onto the 0–14 strip, matching liquid colour to band colour. A true band clinks; a mismatch sways until re-placed.</li>
              <li>Open Observations for your table — solution, colour, matched pH and acid, neutral or alkali.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>An untested tube has no evidence — the mentor sends it straight back to the rack. Test first, place second, exactly like a chemist.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your pH observations</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Place a tested tube on its colour band — every correct placement records a row here.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Solution</th><th>Colour</th><th>Matched pH</th><th>Probe</th><th>Type</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tube}>
                      <td>{r.tube}</td>
                      <td>{r.name}</td>
                      <td><span className="ph-dot" style={{ background: r.colourHex }} />{r.colourName}</td>
                      <td>{r.matched}</td>
                      <td>{r.probe !== null ? r.probe.toFixed(1) : '—'}</td>
                      <td>{r.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {plotRows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Colour band vs probe</h3>
                <Plot
                  points={plotRows.map((r) => ({ x: SLOTS[r.slotIdx].centre, y: r.probe as number }))}
                  xLabel="Band centre pH"
                  yLabel="Probe pH"
                  fitLine
                  height={200}
                />
                {plotFit && <p className="observation-note">Slope {plotFit.m.toFixed(2)} — points hugging the rising diagonal mean your colour bands agree with the instrument; the offsets show how much precision a band can hide.</p>}
              </>
            )}
            <p className="observation-note">The violet end (pH 12–14) stays empty on purpose — none of these household solutions is a strong alkali. Drain cleaner or bleach would live there.</p>
            <p className="observation-note">Placement is the data: each row was written the moment a tube clinked into its true colour band.</p>
          </>
        ),
        theory: (
          <>
            <h3>The pH number</h3>
            <p>Acids release hydrogen ions into water and alkalis accept them. Because the hydrogen ion concentration [H⁺] ranges over enormous values, chemists compress it into a single logarithmic number:</p>
            <div className="equation">pH = −log₁₀ [H⁺]</div>
            <p>Distilled water has [H⁺] = 10⁻⁷ mol per litre, so its pH is exactly 7. Anything below 7 is acidic; anything above 7 is alkaline.</p>
            <h3>A rack of dyes</h3>
            <p>Universal indicator is a mixture of several dyes, each changing colour at a different pH, so together they paint one continuous spectrum: red pH 1–2, orange 3–4, yellow 5–6, green 7, blue 8–9, indigo 10–11 and violet 12–14. That is why the strip at the bottom of the bench is a smooth rainbow rather than seven flat blocks — and why the colour of each tube blends continuously as its pH moves.</p>
            <h3>Why logarithmic matters</h3>
            <p>Each pH unit is a factor of ten in hydrogen ion concentration. Lemon juice at pH 2.4 holds about 100,000 times more H⁺ than distilled water at pH 7 — five units, ten to the power five. Two solutions that sit side by side on the strip can differ in acidity by more than every ocean on Earth.</p>
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
