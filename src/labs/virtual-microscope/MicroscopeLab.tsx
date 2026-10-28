import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp, mean } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './virtual-microscope.css';

/**
 * Virtual microscope — a compound microscope you actually operate.
 *
 * The bench holds a handsome side-view scope: a three-objective turret
 * (4× red, 10× yellow, 40× blue), coarse and fine focus knobs that really
 * turn, an illuminator with a brightness dial, a condenser diaphragm lever,
 * and a slide box with three slides the student drags onto the stage
 * (onion epidermis, human cheek epithelial cells, and the classic printed
 * letter "e"). The circular ocular panel shows the round field of view with
 * honest optics: the image is inverted and mirrored, blur grows with
 * |stage − focus| scaled per objective (low power forgives, 40× is brutal),
 * and cranking the coarse knob at 40× can crack the cover slip. An eyepiece
 * graticule calibrated in µm per division turns clicks into real cell
 * measurements with ±2% reading jitter — five cells per slide make a mean,
 * and the plant-vs-animal comparison concludes the lab.
 */

// ---- optical constants ---------------------------------------------------

interface Objective {
  mag: number;
  band: string; // barrel ring band colour
  ring: string; // UI chip colour
  short: string;
  name: string;
  fov: number; // field-of-view diameter, µm (20 mm field-number eyepiece)
  umPerDiv: number; // graticule calibration (50 divisions across the FOV)
  blurK: number; // visible blur px per unit of stage defocus
}

const OBJECTIVES: Objective[] = [
  { mag: 4, band: '#c0392b', ring: '#d64541', short: '4× red', name: 'scanning', fov: 5000, umPerDiv: 100, blurK: 45 },
  { mag: 10, band: '#b7810a', ring: '#e8b420', short: '10× yellow', name: 'medium', fov: 2000, umPerDiv: 40, blurK: 110 },
  { mag: 40, band: '#1f5fa8', ring: '#3d7dd8', short: '40× blue', name: 'high power', fov: 500, umPerDiv: 10, blurK: 300 },
];

const STAGE_TRAVEL_UM = 4000; // full stage-z range, in µm of travel
const COARSE_RATE = 0.0038; // stage units per px of coarse-knob drag
const FINE_RATE = 0.00055; // stage units per px of fine-knob drag
const COARSE_STEP = 0.045; // button/keyboard coarse step
const FINE_STEP = 0.004; // button/keyboard fine step
const SHARP_BLUR = 2.2; // blur radius px that still counts as razor sharp
const ALMOST_BLUR = 6.5; // "almost sharp" gate for the mentor
const MEASURE_BLUR = 3.5; // blur above which measuring is refused
const TOUCH_Z = 0.75; // stage height where the 40× barrel meets the cover slip
const PAN_MAX = 1300; // µm of stage travel while panning
const JITTER = 0.02; // ±2% graticule reading jitter

type SlideId = 'onion' | 'cheek' | 'lettere';

interface SlideDef { id: SlideId; name: string; chip: string; icon: string; blurb: string; placeMsg: string }

const SLIDES: SlideDef[] = [
  { id: 'onion', name: 'Onion epidermis', chip: '#c98f3d', icon: '🧅', blurb: 'plant cells · iodine stain', placeMsg: 'Onion epidermis on the stage — iodine-stained, brick-shaped plant cells.' },
  { id: 'cheek', name: 'Cheek epithelial', chip: '#8fb7dd', icon: '🧫', blurb: 'animal cells · methylene blue', placeMsg: 'Cheek epithelial cells on the stage — methylene blue, prominent dark nuclei.' },
  { id: 'lettere', name: 'Letter e (practice)', chip: '#5b6570', icon: 'ǝ', blurb: 'printed ink · optics demo', placeMsg: 'ǝ — practice slide on the stage. Focus it and watch what the optics do to the printed e.' },
];

const SPOTS: { key: 'wall' | 'vac' | 'brick' | 'nuclei' | 'irregular'; title: string; detail: string; tag: string }[] = [
  { key: 'wall', title: 'Cell wall seen', detail: 'thick double outlines — onion, sharp at 10× or 40×', tag: 'plant only' },
  { key: 'vac', title: 'Large central vacuole seen', detail: 'the pale inner region — onion, sharp at 40×', tag: 'plant only' },
  { key: 'brick', title: 'Regular brick shape seen', detail: 'whole fields of tidy rectangles — onion at low power', tag: 'plant only' },
  { key: 'nuclei', title: 'Prominent bare nuclei seen', detail: 'dark dots dominating each cell — cheek, sharp at 10× or 40×', tag: 'both · darkest in animal' },
  { key: 'irregular', title: 'Irregular flattened mosaic seen', detail: 'scattered blob-shaped cells — cheek at low power', tag: 'animal look' },
];

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'place', title: 'Choose and place a slide', detail: 'Drag a slide from the box onto the stage — start with the onion epidermis. It settles under the clips with a glassy clink.', hint: 'On touch screens, drag with a finger — or press the “Place onion slide” button.' },
  { id: 'coarse', title: 'Coarse-focus at 4×', detail: 'Click the red-ring 4× objective, then turn the big coarse knob until the cells are almost sharp. Low power forgives.', hint: 'Drag the large knob on the arm — or use the coarse buttons below the scene.' },
  { id: 'fine40', title: 'Fine focus, then 40×', detail: 'Nudge the small fine knob to finish the sharpness, click the blue 40× objective and refocus GENTLY — the fine knob only.', hint: 'Coarse at 40× can crack the cover slip. If it does, fetch a fresh slide and try again, softly.' },
  { id: 'lettere', title: 'Witness the inversion', detail: 'Swap in the letter-e slide and focus it sharp. The printed e stands rotated a half-turn — upside down AND mirrored.', hint: 'Pan the view and watch the e drift against your hand.' },
  { id: 'measure', title: 'Measure five onion cells', detail: 'Switch on the graticule, pick 10× (a whole onion cell spans about five divisions) and click one end of a cell, then the other. Five cells make an honest mean.', hint: 'Values carry ±2% reading jitter, just like reading a real graticule.' },
  { id: 'compare', title: 'Cheek cells and the conclusion', detail: 'Place the cheek slide, measure five of its smaller cells, then answer the three comparison questions below the scene.', hint: 'Your own means decide the size question — the bar chart lives in Observations.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-sharp', title: 'First sharp image', icon: '◉', detail: 'Focused any slide to a razor-sharp image.' },
  { id: 'inversion', title: 'Inversion witnessed', icon: 'ǝ', detail: 'Watched the printed letter e come through the optics rotated a half-turn.' },
  { id: 'gentle-hands', title: 'Gentle hands', icon: '🤲', detail: 'Reached a sharp 40× image without ever cracking a cover slip.' },
  { id: 'five-and-five', title: 'Five and five', icon: '⇔', detail: 'Measured five cells on each slide with the graticule.' },
  { id: 'concluded', title: 'Comparison concluded', icon: '💡', detail: 'Named three differences between plant and animal cells — correctly.' },
];

interface Question { q: string; opts: { id: string; label: string; ok: boolean }[] }

const QUESTIONS: Question[] = [
  {
    q: 'Which structure did you see ONLY in the onion (plant) cells?',
    opts: [
      { id: 'wall', label: 'The cellulose cell wall', ok: true },
      { id: 'nuc', label: 'The nucleus', ok: false },
      { id: 'cyt', label: 'The cytoplasm', ok: false },
    ],
  },
  {
    q: 'The large central vacuole you drew belongs to…',
    opts: [
      { id: 'plant', label: 'Plant cells only', ok: true },
      { id: 'animal', label: 'Animal cells only', ok: false },
      { id: 'both', label: 'Both equally', ok: false },
    ],
  },
  {
    q: 'From your graticule means, onion cells are…',
    opts: [
      { id: 'long', label: 'About three times longer than cheek cells', ok: true },
      { id: 'same', label: 'Roughly the same length', ok: false },
      { id: 'short', label: 'About three times shorter', ok: false },
    ],
  },
];

// ---- deterministic specimen fields ---------------------------------------

function mulberry(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Onion epidermis: brick-like rectangles in a running-bond mosaic. */
interface OnionCell { x: number; y: number; w: number; h: number; fill: string; nx: number; ny: number; nr: number }

const ONION: OnionCell[] = (() => {
  const rnd = mulberry(2028);
  const cells: OnionCell[] = [];
  let y = -3900;
  let row = 0;
  while (y < 3900) {
    const rh = 66 + rnd() * 26;
    let x = -3900 + (row % 2 === 0 ? 0 : 80 + rnd() * 70);
    while (x < 3900) {
      const w = 150 + rnd() * 100; // 150–250 µm long, per the honest spec
      const t = rnd();
      cells.push({
        x,
        y,
        w,
        h: rh * 0.9,
        fill: `rgb(${Math.round(212 + t * 20)},${Math.round(170 + t * 18)},${Math.round(98 + t * 16)})`,
        nx: x + w * (0.2 + rnd() * 0.6),
        ny: y + rh * 0.45,
        nr: 7 + rnd() * 4.5,
      });
      x += w + 6;
    }
    y += rh;
    row += 1;
  }
  return cells;
})();

/** Cheek epithelial cells: irregular flattened blobs in a scattered mosaic. */
interface CheekCell { cx: number; cy: number; pts: { x: number; y: number }[]; poly: { x: number; y: number }[]; fill: string; nx: number; ny: number; nr: number }

const CHEEK: CheekCell[] = (() => {
  const rnd = mulberry(1155);
  const cells: CheekCell[] = [];
  for (let gy = -2600; gy <= 2600; gy += 84) {
    for (let gx = -2600; gx <= 2600; gx += 84) {
      const cx = gx + (rnd() - 0.5) * 30;
      const cy = gy + (rnd() - 0.5) * 30;
      const rr = 26 + rnd() * 12; // diameter ≈ 50–80 µm
      const n = 7 + Math.floor(rnd() * 3);
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
        const r = rr * (0.72 + rnd() * 0.5);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.86 });
      }
      const t = rnd();
      cells.push({
        cx,
        cy,
        pts,
        poly: pts.map((p) => ({ x: p.x, y: p.y })),
        fill: `rgb(${Math.round(198 + t * 16)},${Math.round(218 + t * 12)},${Math.round(234 + t * 10)})`,
        nx: cx + (rnd() - 0.5) * rr * 0.8,
        ny: cy + (rnd() - 0.5) * rr * 0.8,
        nr: 6.5 + rnd() * 3.5,
      });
    }
  }
  return cells;
})();

/** Stray fibres and dust on the letter-e slide — real slides are never clean. */
const FIBERS: { x: number; y: number; len: number; ang: number }[] = (() => {
  const rnd = mulberry(777);
  return Array.from({ length: 5 }, () => ({
    x: (rnd() - 0.5) * 3400,
    y: (rnd() - 0.5) * 3400,
    len: 140 + rnd() * 320,
    ang: rnd() * Math.PI * 2,
  }));
})();

interface Speck { x: number; y: number; r: number }
const SLIDE_SPECKS: Speck[] = (() => {
  const rnd = mulberry(4242);
  return Array.from({ length: 9 }, () => ({
    x: (rnd() - 0.5) * 3800,
    y: (rnd() - 0.5) * 3800,
    r: 4 + rnd() * 10,
  }));
})();

/** Deterministic crack polylines, normalised to the ocular circle. */
function makeCracks(seed: number): { x: number; y: number }[][] {
  const rnd = mulberry(seed);
  const cx = (rnd() - 0.5) * 0.4;
  const cy = (rnd() - 0.5) * 0.4;
  const lines: { x: number; y: number }[][] = [];
  const n = 5;
  for (let k = 0; k < n; k += 1) {
    const ang = (k / n) * Math.PI * 2 + rnd() * 0.8;
    const pts: { x: number; y: number }[] = [{ x: cx, y: cy }];
    let r = 0.12;
    let a = ang;
    while (r < 0.96) {
      r += 0.1 + rnd() * 0.14;
      a += (rnd() - 0.5) * 0.7;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    lines.push(pts);
  }
  return lines;
}

// ---- sim / ui types --------------------------------------------------------

interface SpotMap { wall: boolean; vac: boolean; brick: boolean; nuclei: boolean; irregular: boolean }

type DragKind = 'slide' | 'coarse' | 'fine' | 'dial' | 'iris' | 'pan';

interface Drag {
  kind: DragKind;
  slide?: SlideId;
  from: 'box' | 'stage';
  startX: number;
  startY: number;
  grabDX: number;
  grabDY: number;
  startB?: number;
  startI?: number;
  moved: boolean;
}

interface Sim {
  t: number;
  uiAcc: number;
  slideSoundAt: number;
  knobSoundAt: number;
  warnAt: number;
  flashAt: number;
  fiveFiveNoted: boolean;
  objIndex: number;
  turretBase: number;
  turretTarget: number;
  stageZ: number;
  focusZ: number;
  rotCoarse: number;
  rotFine: number;
  drag: Drag | null;
  slideOn: SlideId | null;
  slideCracked: boolean;
  cracks: { x: number; y: number }[][];
  crackAt: number;
  placeAnim: number;
  panX: number;
  panY: number;
  panVX: number;
  panVY: number;
  panHome: boolean;
  panLastT: number;
  fieldKey: string;
  fieldPanX: number;
  fieldPanY: number;
  brightness: number;
  iris: number;
  graticule: boolean;
  pointer: { x: number; y: number };
  lastP: { x: number; y: number };
  tickA: { x: number; y: number } | null;
  tickPair: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  tickFade: number;
  lastUm: number | null;
  specks: { x: number; y: number; r: number; vx: number; vy: number }[];
  motes: { u: number; a: number; vy: number; ph: number }[];
  sharpNoted: boolean;
  almostNoted: boolean;
  sharp40Noted: boolean;
  inversionNoted: boolean;
  fineStopNoted: boolean;
  spots: SpotMap;
  everCracked: boolean;
}

interface UiSnap {
  objIndex: number;
  stageZ: number;
  blur: number;
  sharp01: number;
  slideOn: SlideId | null;
  cracked: boolean;
  graticule: boolean;
  brightness: number;
  iris: number;
  tickPending: boolean;
  lastUm: number | null;
  focusErr: number | null;
  spots: SpotMap;
}

interface MeasRow { id: number; slide: SlideId; mag: number; um: number }

const meta = getLabBySlug('virtual-microscope')!;

function normAngle(a: number): number {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function currentBlur(s: Sim): number {
  if (!s.slideOn) return 0;
  if (s.slideCracked) return 26;
  return Math.abs(s.stageZ - s.focusZ) * OBJECTIVES[s.objIndex].blurK;
}

// ---- drawing helpers (module level — pure, no text on this canvas) --------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A printed lowercase "e" as pure geometry — the classic practice-slide glyph. */
function drawLetterE(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, lw: number, color: string) {
  const R = size * 0.72;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lw);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0.8, 0.2 + Math.PI * 2, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-R, 0);
  ctx.lineTo(R * 0.99, 0);
  ctx.stroke();
  ctx.restore();
}

let FILTER_OK: boolean | null = null;
function ctxFilterOK(ctx: CanvasRenderingContext2D): boolean {
  if (FILTER_OK === null) {
    try {
      ctx.filter = 'blur(1px)';
      FILTER_OK = ctx.filter.indexOf('blur') >= 0;
      ctx.filter = 'none';
    } catch {
      FILTER_OK = false;
    }
  }
  return FILTER_OK;
}

function drawImageWithBlur(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, w: number, h: number, blur: number) {
  if (blur < 0.5) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }
  const b = Math.min(26, blur);
  if (ctxFilterOK(ctx)) {
    ctx.filter = `blur(${b.toFixed(1)}px)`;
    ctx.drawImage(img, x, y, w, h);
    ctx.filter = 'none';
    return;
  }
  ctx.drawImage(img, x, y, w, h);
  ctx.save();
  ctx.globalAlpha = 0.2;
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    ctx.drawImage(img, x + Math.cos(a) * b * 0.7, y + Math.sin(a) * b * 0.7, w, h);
  }
  ctx.restore();
}

function drawOnionCell(octx: CanvasRenderingContext2D, c: OnionCell, mx: (v: number) => number, my: (v: number) => number, sc: number, objIndex: number) {
  const x = mx(c.x + c.w);
  const y = my(c.y + c.h);
  const w = c.w * sc;
  const h = c.h * sc;
  if (w < 1 || h < 1) return;
  octx.fillStyle = c.fill;
  octx.fillRect(x, y, w, h);
  // shared cell walls — double-drawn boundaries darken naturally
  octx.strokeStyle = 'rgba(122,79,30,0.85)';
  octx.lineWidth = Math.max(1, 4.2 * sc);
  octx.strokeRect(x, y, w, h);
  // large central vacuole (tonoplast)
  octx.strokeStyle = `rgba(176,124,52,${objIndex === 2 ? 0.6 : 0.32})`;
  octx.lineWidth = Math.max(0.8, 2 * sc);
  octx.strokeRect(x + w * 0.18, y + h * 0.26, w * 0.64, h * 0.48);
  // nucleus (skipped when sub-pixel — invisible at low power, and thousands of
  // forced-minimum dots were the single heaviest draw on the 4× cheek field)
  if (c.nr * sc >= 0.9) {
    const nx = mx(c.nx);
    const ny = my(c.ny);
    const nr = c.nr * sc;
    octx.fillStyle = '#5b3a12';
    octx.beginPath();
    octx.arc(nx, ny, nr, 0, Math.PI * 2);
    octx.fill();
    if (objIndex === 2 && nr > 4) {
      octx.fillStyle = '#3a2410';
      octx.beginPath();
      octx.arc(nx, ny, nr * 0.38, 0, Math.PI * 2);
      octx.fill();
      octx.strokeStyle = 'rgba(91,58,18,0.22)';
      octx.lineWidth = Math.max(0.7, 1.1 * sc);
      octx.beginPath();
      octx.moveTo(nx, ny);
      octx.lineTo(x + w * 0.1, y + h * 0.2);
      octx.moveTo(nx, ny);
      octx.lineTo(x + w * 0.9, y + h * 0.85);
      octx.stroke();
    }
  }
}

function drawCheekCell(octx: CanvasRenderingContext2D, c: CheekCell, mx: (v: number) => number, my: (v: number) => number, sc: number, objIndex: number) {
  const pts = c.pts.map((p) => ({ x: mx(p.x), y: my(p.y) }));
  const n = pts.length;
  if (n < 3) return;
  octx.beginPath();
  if (objIndex === 0) {
    // low power: plain polygons — smoothing is invisible there
    octx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < n; k += 1) octx.lineTo(pts[k].x, pts[k].y);
    octx.closePath();
  } else {
    octx.moveTo((pts[0].x + pts[n - 1].x) / 2, (pts[0].y + pts[n - 1].y) / 2);
    for (let k = 0; k < n; k += 1) {
      const p = pts[k];
      const q = pts[(k + 1) % n];
      octx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    octx.closePath();
  }
  octx.fillStyle = c.fill;
  octx.fill();
  octx.strokeStyle = 'rgba(126,166,201,0.7)';
  octx.lineWidth = Math.max(0.8, 1.6 * sc);
  octx.stroke();
  // prominent dark nucleus — the methylene-blue signature (sub-pixel nuclei
  // are skipped: invisible at low power, and needlessly expensive en masse)
  if (c.nr * sc >= 0.9) {
    const nx = mx(c.nx);
    const ny = my(c.ny);
    const nr = c.nr * sc;
    octx.fillStyle = '#1d3a5f';
    octx.beginPath();
    octx.arc(nx, ny, nr, 0, Math.PI * 2);
    octx.fill();
    if (objIndex === 2 && nr > 3.5) {
      octx.fillStyle = '#0f2440';
      octx.beginPath();
      octx.arc(nx, ny, nr * 0.4, 0, Math.PI * 2);
      octx.fill();
      octx.fillStyle = 'rgba(29,58,95,0.35)';
      for (let k = 0; k < 4; k += 1) {
        const a = k * 1.9;
        octx.beginPath();
        octx.arc(nx + Math.cos(a) * nr * 1.6, ny + Math.sin(a) * nr * 1.6, nr * 0.28, 0, Math.PI * 2);
        octx.fill();
      }
    }
  }
}

/** The specimen field, rendered into the offscreen ocular canvas.
 *  panX/panY are the baked pan values — snapped to whole pixels by the caller so
 *  the expensive field regenerates only when it genuinely shifts. */
function drawSpecimenField(octx: CanvasRenderingContext2D, W: number, R: number, s: Sim, panX: number, panY: number) {
  const C = W / 2;
  const obj = OBJECTIVES[s.objIndex];
  const sc = (2 * R) / obj.fov;
  const mx = (um: number) => C - (um - panX) * sc; // inverted optics
  const my = (um: number) => C - (um - panY) * sc;
  octx.fillStyle = '#dde7ec';
  octx.fillRect(0, 0, W, W);
  if (!s.slideOn) return;
  const half = obj.fov / 2 + 400;
  if (s.slideOn === 'onion') {
    for (const c of ONION) {
      if (c.x + c.w < panX - half || c.x > panX + half || c.y + c.h < panY - half || c.y > panY + half) continue;
      drawOnionCell(octx, c, mx, my, sc, s.objIndex);
    }
  } else if (s.slideOn === 'cheek') {
    for (const c of CHEEK) {
      if (Math.abs(c.cx - panX) > half + 90 || Math.abs(c.cy - panY) > half + 90) continue;
      drawCheekCell(octx, c, mx, my, sc, s.objIndex);
    }
  } else {
    // practice slide: printed letter e + stray fibres + specks
    octx.strokeStyle = 'rgba(140,150,160,0.28)';
    octx.lineWidth = Math.max(0.8, 3 * sc);
    for (const f of FIBERS) {
      octx.beginPath();
      octx.moveTo(mx(f.x), my(f.y));
      octx.quadraticCurveTo(mx(f.x + Math.cos(f.ang + 0.6) * f.len * 0.5), my(f.y + Math.sin(f.ang + 0.6) * f.len * 0.5), mx(f.x + Math.cos(f.ang) * f.len), my(f.y + Math.sin(f.ang) * f.len));
      octx.stroke();
    }
    octx.fillStyle = 'rgba(120,130,140,0.3)';
    for (const sp of SLIDE_SPECKS) {
      octx.beginPath();
      octx.arc(mx(sp.x), my(sp.y), Math.max(0.7, sp.r * sc), 0, Math.PI * 2);
      octx.fill();
    }
    drawLetterE(octx, mx(0), my(0), 900 * sc, 150 * sc, '#2e3542');
  }
}

function drawKnob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, brass: boolean, hover: boolean) {
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  if (brass) {
    grad.addColorStop(0, '#f0d084');
    grad.addColorStop(0.55, '#d9a441');
    grad.addColorStop(1, '#8a6420');
  } else {
    grad.addColorStop(0, '#7e8ca2');
    grad.addColorStop(0.55, '#5a6a80');
    grad.addColorStop(1, '#333f52');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = brass ? '#6e5019' : '#242e3f';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // rim knurl — rotates with the knob so turning is visible
  ctx.strokeStyle = brass ? 'rgba(110,80,25,0.8)' : 'rgba(20,28,42,0.7)';
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 14; k += 1) {
    const a = rot + (k / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  // three spokes
  ctx.strokeStyle = brass ? 'rgba(255,240,200,0.75)' : 'rgba(220,230,240,0.5)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k += 1) {
    const a = rot + (k / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.18, y + Math.sin(a) * r * 0.18);
    ctx.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72);
    ctx.stroke();
  }
  ctx.fillStyle = brass ? '#6e5019' : '#1d2635';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  if (hover) {
    ctx.strokeStyle = '#e8632a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawMiniSlide(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, id: SlideId, cracked: boolean) {
  ctx.fillStyle = 'rgba(214,230,240,0.92)';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // frosted end
  ctx.fillStyle = 'rgba(233,240,246,0.85)';
  ctx.fillRect(x, y, w * 0.22, h);
  const sx = x + w * 0.28;
  const sw = w * 0.66;
  if (id === 'onion') {
    ctx.fillStyle = '#c98f3d';
    ctx.fillRect(sx, y + h * 0.18, sw, h * 0.64);
    ctx.strokeStyle = 'rgba(122,79,30,0.8)';
    ctx.lineWidth = 1;
    for (let k = 0; k <= 3; k += 1) {
      const px = sx + (sw * k) / 3;
      ctx.beginPath();
      ctx.moveTo(px, y + h * 0.18);
      ctx.lineTo(px, y + h * 0.82);
      ctx.stroke();
    }
  } else if (id === 'cheek') {
    ctx.fillStyle = '#a9c8e4';
    ctx.fillRect(sx, y + h * 0.18, sw, h * 0.64);
    ctx.fillStyle = 'rgba(29,58,95,0.75)';
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath();
      ctx.arc(sx + sw * (0.2 + k * 0.3), y + h * 0.5, Math.max(1, h * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#f2f4f6';
    ctx.fillRect(sx, y + h * 0.18, sw, h * 0.64);
    drawLetterE(ctx, sx + sw * 0.5, y + h * 0.5, Math.min(h * 0.36, sw * 0.16), 1.6, '#2e3542');
  }
  if (cracked) {
    ctx.strokeStyle = 'rgba(25,32,44,0.85)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.25);
    ctx.lineTo(x + w * 0.45, y + h * 0.6);
    ctx.lineTo(x + w * 0.6, y + h * 0.3);
    ctx.lineTo(x + w * 0.78, y + h * 0.75);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- component

export default function MicroscopeLab() {
  // ---- simulation state (refs — the canvas loop owns the motion) ---------
  const sim = useRef<Sim>({
    t: 0,
    uiAcc: 0,
    slideSoundAt: 0,
    knobSoundAt: 0,
    warnAt: 0,
    flashAt: 0,
    fiveFiveNoted: false,
    objIndex: 0,
    turretBase: Math.PI / 2 + 2.0944,
    turretTarget: Math.PI / 2 + 2.0944,
    stageZ: 0.18,
    focusZ: 0.55,
    rotCoarse: 0,
    rotFine: 0,
    drag: null,
    slideOn: null,
    slideCracked: false,
    cracks: [],
    crackAt: 0,
    placeAnim: 0,
    panX: 0,
    panY: 0,
    panVX: 0,
    panVY: 0,
    panHome: false,
    panLastT: 0,
    fieldKey: '',
    fieldPanX: 0,
    fieldPanY: 0,
    brightness: 0.85,
    iris: 0.7,
    graticule: false,
    pointer: { x: -999, y: -999 },
    lastP: { x: 0, y: 0 },
    tickA: null,
    tickPair: null,
    tickFade: 0,
    lastUm: null,
    specks: Array.from({ length: 6 }, (_, i) => {
      const rnd = mulberry(90 + i * 17);
      return { x: (rnd() - 0.5) * 1.4, y: (rnd() - 0.5) * 1.4, r: 0.03 + rnd() * 0.05, vx: (rnd() - 0.5) * 0.05, vy: (rnd() - 0.5) * 0.04 };
    }),
    motes: Array.from({ length: 12 }, (_, i) => {
      const rnd = mulberry(31 + i * 13);
      return { u: rnd(), a: (rnd() - 0.5) * 1.6, vy: 0.05 + rnd() * 0.12, ph: rnd() * Math.PI * 2 };
    }),
    sharpNoted: false,
    almostNoted: false,
    sharp40Noted: false,
    inversionNoted: false,
    fineStopNoted: false,
    spots: { wall: false, vac: false, brick: false, nuclei: false, irregular: false },
    everCracked: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const oscRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student-facing state ---------------------------------------------
  const [rows, setRows] = useState<MeasRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [placedEver, setPlacedEver] = useState(false);
  const [almostEver, setAlmostEver] = useState(false);
  const [sharp40Ever, setSharp40Ever] = useState(false);
  const [sawObs, setSawObs] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [flash, setFlash] = useState<{ tone: CoachTone; line: string } | null>(null);
  const [answers, setAnswers] = useState<[string | null, string | null, string | null]>([null, null, null]);
  const [ui, setUi] = useState<UiSnap>({
    objIndex: 0,
    stageZ: 0.18,
    blur: 0,
    sharp01: 0,
    slideOn: null,
    cracked: false,
    graticule: false,
    brightness: 0.85,
    iris: 0.7,
    tickPending: false,
    lastUm: null,
    focusErr: null,
    spots: { wall: false, vac: false, brick: false, nuclei: false, irregular: false },
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
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 5200);
    return () => window.clearTimeout(t);
  }, [flash]);

  const flashOnce = useCallback((tone: CoachTone, line: string, gap = 6000) => {
    const s = sim.current;
    const now = performance.now();
    if (now - s.flashAt < gap) return;
    s.flashAt = now;
    setFlash({ tone, line });
    if (tone === 'warn') labSound.warn();
  }, []);

  const syncUi = useCallback(() => {
    const s = sim.current;
    const blur = currentBlur(s);
    setUi({
      objIndex: s.objIndex,
      stageZ: s.stageZ,
      blur,
      sharp01: s.slideOn && !s.slideCracked ? clamp(1 - blur / 8, 0, 1) : 0,
      slideOn: s.slideOn,
      cracked: s.slideCracked,
      graticule: s.graticule,
      brightness: s.brightness,
      iris: s.iris,
      tickPending: !!s.tickA,
      lastUm: s.lastUm,
      focusErr: s.slideOn ? Math.abs(s.stageZ - s.focusZ) * STAGE_TRAVEL_UM : null,
      spots: { ...s.spots },
    });
  }, []);

  // ---- derived data ------------------------------------------------------
  const onionRows = useMemo(() => rows.filter((r) => r.slide === 'onion'), [rows]);
  const cheekRows = useMemo(() => rows.filter((r) => r.slide === 'cheek'), [rows]);
  const onionMean = onionRows.length ? mean(onionRows.map((r) => r.um)) : null;
  const cheekMean = cheekRows.length ? mean(cheekRows.map((r) => r.um)) : null;
  const concluded = answers[0] !== null && answers[1] !== null && answers[2] !== null;
  const spotsCount = (['wall', 'vac', 'brick', 'nuclei', 'irregular'] as const).filter((k) => ui.spots[k]).length;
  const conclusionOpen = spotsCount >= 5 && onionRows.length >= 5 && cheekRows.length >= 5;

  const summary = useMemo(() => {
    const map = new Map<string, { slide: SlideId; mag: number; n: number; sum: number }>();
    for (const r of rows) {
      const k = `${r.slide}-${r.mag}`;
      const e = map.get(k) ?? { slide: r.slide, mag: r.mag, n: 0, sum: 0 };
      e.n += 1;
      e.sum += r.um;
      map.set(k, e);
    }
    return [...map.values()].map((e) => ({ ...e, mean: e.sum / e.n }));
  }, [rows]);

  // ---- mentor completion flags ------------------------------------------
  const done = [
    placedEver,
    almostEver,
    sharp40Ever,
    badges.includes('inversion'),
    onionRows.length >= 5,
    cheekRows.length >= 5 && concluded,
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
    if (onionRows.length >= 5 && cheekRows.length >= 5 && !sim.current.fiveFiveNoted) {
      sim.current.fiveFiveNoted = true;
      labSound.milestone();
      earn('five-and-five');
      pushToast('good', '⇔', 'Five and five — both means are locked in. Open Observations for the plant-vs-animal bar chart.');
    }
  }, [onionRows.length, cheekRows.length, earn, pushToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge --------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'place': return { target: 'scene', gesture: 'drag', title: 'Place a slide', body: 'Drag the onion slide from the box on the bench onto the stage — or press the “Place onion slide” button below.' };
      case 'coarse': return { target: 'stage', gesture: 'drag', title: 'Coarse-focus at 4×', body: 'Click the red 4× objective if you are not there, then drag the big knob on the arm up and down until the cells are almost sharp.' };
      case 'fine40':
        return ui.objIndex < 2
          ? { target: 'objectives', gesture: 'press', title: 'Click up to 40×', body: 'Fine-focus at low power first, then click the blue 40× objective — and refocus with the FINE knob only.' }
          : { target: 'scene', gesture: 'drag', title: 'Fine-focus gently', body: 'Drag the small knob in tiny steps. Coarse at 40× risks cracking the cover slip — the lesson every microscopist learns once.' };
      case 'lettere': return { target: 'slides', gesture: 'press', title: 'Swap in the letter e', body: 'Press the letter-e button (or drag that slide over) and focus it sharp to watch it stand rotated a half-turn.' };
      case 'measure':
        return !ui.graticule
          ? { target: 'graticule', gesture: 'press', title: 'Graticule on', body: 'Switch on the eyepiece graticule — the ruled scale — then click both ends of a cell to measure it.' }
          : { target: 'scene', gesture: 'tap', title: 'Measure a cell', body: 'Click one end of an onion cell, then the other — the length lands in your table. At 10× a whole cell spans about five divisions.' };
      case 'compare': return { target: 'slides', gesture: 'press', title: 'Cheek cells next', body: 'Place the cheek slide, measure five of its cells, then answer the three comparison questions below the scene.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex, ui.objIndex, ui.graticule]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 860;
    const h = canvas?.clientHeight ?? 480;
    const narrow = w < 620;
    const benchY = h - (narrow ? 24 : 32);
    const R = narrow ? clamp(Math.min(w * 0.3, h * 0.3), 74, 116) : clamp(h * 0.32, 128, 165);
    const ocx = narrow ? w * 0.29 : w * 0.255;
    const ocy = narrow ? h * 0.375 : h * 0.4;
    const ms = narrow ? clamp(w / 620, 0.6, 0.86) : clamp(Math.min(w / 860, h / 470), 0.82, 1.1);
    const mcx = narrow ? w * 0.79 : w * 0.715;
    const ox = mcx - 62 * ms;
    const stageY = benchY - 200 * ms;
    const turretY = stageY - 66 * ms;
    const headTop = Math.max(30, stageY - 236 * ms);
    const boxW = narrow ? 132 : 198;
    const boxH = narrow ? 62 : 84;
    const boxX = narrow ? 14 : 18;
    const boxY = benchY - boxH;
    const slotW = narrow ? 36 : 56;
    const slotH = narrow ? 15 : 21;
    return {
      w, h, narrow, benchY, R, ocx, ocy, ms, mcx, ox, stageY, turretY, headTop,
      boxX, boxY, boxW, boxH, slotW, slotH,
      slots: [0, 1, 2].map((i) => ({ x: boxX + 10 + i * (slotW + (narrow ? 6 : 12)), y: boxY + (narrow ? 10 : 14), w: slotW, h: slotH })),
      coarse: { x: mcx + 58 * ms, y: stageY + 38 * ms, r: (narrow ? 20 : 27) * ms },
      fine: { x: mcx + 52 * ms, y: stageY - 26 * ms, r: (narrow ? 12 : 16) * ms },
      dial: { x: mcx + 66 * ms, y: benchY - 13 * (narrow ? 1.4 : 1), r: (narrow ? 9 : 12) * ms },
      iris: { x: ox + 34 * ms, y: stageY + 34 * ms },
    };
  }, []);

  const slideRect = (g: ReturnType<typeof geom>) => ({ x: g.ox - 74 * g.ms, y: g.stageY - 24, w: 148 * g.ms, h: 36 * g.ms });

  const objPoint = (g: ReturnType<typeof geom>, i: number) => {
    const s = sim.current;
    const a = s.turretBase + (i - 1) * 2.0944;
    return { x: g.ox + Math.cos(a) * 38 * g.ms, y: g.turretY + Math.sin(a) * 38 * g.ms };
  };

  // ---- actions -----------------------------------------------------------

  const checkCrack = useCallback(() => {
    const s = sim.current;
    if (s.objIndex === 2 && s.slideOn && !s.slideCracked && s.stageZ >= TOUCH_Z) {
      s.slideCracked = true;
      s.everCracked = true;
      s.crackAt = s.t;
      s.cracks = makeCracks(Math.floor(Math.random() * 1e9));
      s.tickA = null;
      s.tickPair = null;
      labSound.warn();
      window.setTimeout(() => labSound.glassClink(false), 130);
      setFlash({
        tone: 'warn',
        line: 'CRACK — the coarse knob at 40× drove the barrel into the cover slip. That is why coarse is a low-power tool. Fetch a fresh slide from the box; nothing else was lost.',
      });
      syncUi();
    }
  }, [setFlash, syncUi]);

  const placeSlide = useCallback((id: SlideId) => {
    const s = sim.current;
    if (s.slideOn === id && !s.slideCracked) {
      setFlash({ tone: 'info', line: 'That slide is already on the stage — pick a different one, or start focusing.' });
      labSound.tick();
      return;
    }
    const hadOther = s.slideOn !== null && s.slideOn !== id;
    s.slideOn = id;
    s.slideCracked = false;
    s.cracks = [];
    s.focusZ = 0.42 + Math.random() * 0.26; // every slide has its own focal depth
    s.placeAnim = 1;
    s.panHome = true;
    s.panVX = 0;
    s.panVY = 0;
    s.tickA = null;
    s.tickPair = null;
    s.sharpNoted = false;
    s.almostNoted = false;
    s.sharp40Noted = false;
    labSound.glassClink(false);
    if (hadOther) window.setTimeout(() => labSound.thunk(false), 170);
    setPlacedEver(true);
    const info = SLIDES.find((x) => x.id === id)!;
    pushToast('info', info.icon, info.placeMsg);
    syncUi();
  }, [pushToast, syncUi]);

  const setObjective = useCallback((i: number) => {
    const s = sim.current;
    if (i === s.objIndex) return;
    s.objIndex = i;
    s.turretTarget = Math.PI / 2 - (i - 1) * 2.0944;
    s.tickA = null;
    s.tickPair = null;
    s.fineStopNoted = s.stageZ < 0.55;
    labSound.tick();
    if (i === 2) checkCrack(); // swinging the long barrel into a high stage
    syncUi();
  }, [checkCrack, syncUi]);

  const applyCoarse = useCallback((delta: number) => {
    const s = sim.current;
    const before = s.stageZ;
    s.stageZ = clamp(s.stageZ + delta, 0, 1);
    s.rotCoarse += ((s.stageZ - before) / COARSE_RATE) * 0.14;
    checkCrack();
    syncUi();
  }, [checkCrack, syncUi]);

  const applyFine = useCallback((delta: number) => {
    const s = sim.current;
    let target = clamp(s.stageZ + delta, 0, 1);
    if (s.objIndex === 2 && s.slideOn && !s.slideCracked) {
      const cap = TOUCH_Z - 0.01;
      if (target > cap) {
        target = cap;
        if (delta > 0 && !s.fineStopNoted && s.stageZ < cap - 0.001) {
          s.fineStopNoted = true;
          setFlash({ tone: 'warn', line: 'The fine knob stops here — any higher and the 40× barrel would grind the cover slip. Ease back down and approach slowly.' });
        }
      }
    }
    const before = s.stageZ;
    s.stageZ = target;
    s.rotFine += ((s.stageZ - before) / FINE_RATE) * 0.5;
    syncUi();
  }, [setFlash, syncUi]);

  const setBrightness = useCallback((v: number) => {
    sim.current.brightness = clamp(v, 0, 1);
    syncUi();
  }, [syncUi]);

  const setIris = useCallback((v: number) => {
    sim.current.iris = clamp(v, 0, 1);
    syncUi();
  }, [syncUi]);

  const toggleGraticule = useCallback(() => {
    const s = sim.current;
    s.graticule = !s.graticule;
    if (!s.graticule) {
      s.tickA = null;
      s.tickPair = null;
    }
    labSound.tick();
    syncUi();
  }, [syncUi]);

  const centerSpecimen = useCallback(() => {
    const s = sim.current;
    s.panHome = true;
    s.panVX = 0;
    s.panVY = 0;
    labSound.slide(0.4);
    syncUi();
  }, [syncUi]);

  const dropTickAt = useCallback((p: { x: number; y: number }) => {
    const s = sim.current;
    const g = geom();
    if (!s.slideOn) {
      flashOnce('warn', 'Nothing on the stage to measure — place a slide first.');
      notePointer(false);
      return;
    }
    if (s.slideCracked) {
      flashOnce('warn', 'The cover slip is cracked — replace the slide before measuring anything.');
      notePointer(false);
      return;
    }
    if (currentBlur(s) > MEASURE_BLUR) {
      flashOnce('warn', 'Too soft to measure honestly — ease the fine knob until the edges crisp up, then click.');
      notePointer(false);
      return;
    }
    if (Math.hypot(p.x - g.ocx, p.y - g.ocy) > g.R - 4) return;
    const obj = OBJECTIVES[s.objIndex];
    const sc = (2 * g.R) / obj.fov;
    const um = { x: s.panX + (g.ocx - p.x) / sc, y: s.panY + (g.ocy - p.y) / sc };
    if (!s.tickA) {
      s.tickA = um;
      labSound.ping(620, 0.1);
      notePointer(true);
      syncUi();
      return;
    }
    const dist = Math.hypot(um.x - s.tickA.x, um.y - s.tickA.y);
    if (dist < 12) {
      flashOnce('warn', 'Both ticks on the same spot — spread them across the cell’s length.');
      notePointer(false);
      return;
    }
    const jitter = 1 + (Math.random() - 0.5) * 2 * JITTER;
    const value = Math.max(1, Math.round(dist * jitter));
    const slideId = s.slideOn;
    s.lastUm = value;
    s.tickPair = { a: s.tickA, b: um };
    s.tickFade = 1.4;
    s.tickA = null;
    setRows((cur) => [...cur, { id: cur.length + 1, slide: slideId, mag: obj.mag, um: value }]);
    labSound.ping(880, 0.12);
    notePointer(true);
    const name = SLIDES.find((x) => x.id === slideId)!.name;
    pushToast('good', '✎', `${value} µm — ${name} cell at ${obj.mag}× (±2% reading jitter).`);
    syncUi();
  }, [geom, flashOnce, notePointer, pushToast, syncUi]);

  const dropCenterTick = useCallback(() => {
    const g = geom();
    if (!sim.current.graticule) {
      flashOnce('info', 'Switch on the graticule first — the ⌗ button puts the ruled scale in the eyepiece.');
      return;
    }
    dropTickAt({ x: g.ocx, y: g.ocy });
  }, [geom, flashOnce, dropTickAt]);

  const answerConclusion = (qi: number, optId: string) => {
    if (concluded) return;
    const opt = QUESTIONS[qi].opts.find((o) => o.id === optId);
    if (!opt) return;
    if (opt.ok) {
      const next: [string | null, string | null, string | null] = [...answers];
      next[qi] = optId;
      setAnswers(next);
      labSound.tick();
      notePointer(true);
      if (next[0] !== null && next[1] !== null && next[2] !== null) {
        labSound.milestone();
        earn('concluded');
        pushToast('good', '💡', 'Comparison concluded: cell wall, large vacuole and the size gap — three honest differences between plant and animal cells.');
      }
    } else {
      labSound.warn();
      notePointer(false);
      setFlash({ tone: 'warn', line: 'Not quite — look back through the ocular at both slides before trying that one again.' });
    }
  };

  const resetAll = () => {
    const s = sim.current;
    s.objIndex = 0;
    s.turretBase = Math.PI / 2 + 2.0944;
    s.turretTarget = Math.PI / 2 + 2.0944;
    s.stageZ = 0.18;
    s.focusZ = 0.55;
    s.rotCoarse = 0;
    s.rotFine = 0;
    s.drag = null;
    s.slideOn = null;
    s.slideCracked = false;
    s.cracks = [];
    s.placeAnim = 0;
    s.panX = 0;
    s.panY = 0;
    s.panVX = 0;
    s.panVY = 0;
    s.panHome = false;
    s.brightness = 0.85;
    s.iris = 0.7;
    s.graticule = false;
    s.tickA = null;
    s.tickPair = null;
    s.lastUm = null;
    s.fieldKey = '';
    s.fieldPanX = 0;
    s.fieldPanY = 0;
    s.fiveFiveNoted = false;
    s.sharpNoted = false;
    s.almostNoted = false;
    s.sharp40Noted = false;
    s.inversionNoted = false;
    s.fineStopNoted = false;
    s.spots = { wall: false, vac: false, brick: false, nuclei: false, irregular: false };
    s.everCracked = false;
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setPlacedEver(false);
    setAlmostEver(false);
    setSharp40Ever(false);
    setSawObs(false);
    setBadges([]);
    setAnswers([null, null, null]);
    setFlash(null);
    syncUi();
  };

  // ---- physics + idle animation -------------------------------------------

  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.t += dt;

    // turret rotation (shortest angular path)
    s.turretBase += normAngle(s.turretTarget - s.turretBase) * Math.min(1, dt * 5);

    // slide placement settle
    if (s.placeAnim > 0) s.placeAnim = Math.max(0, s.placeAnim - dt / 0.4);

    // pan: home easing or drift momentum (the specimen settles after a pan)
    if (s.panHome) {
      s.panX += (0 - s.panX) * Math.min(1, dt * 4);
      s.panY += (0 - s.panY) * Math.min(1, dt * 4);
      if (Math.hypot(s.panX, s.panY) < 1) {
        s.panX = 0;
        s.panY = 0;
        s.panHome = false;
      }
    } else if (!s.drag || s.drag.kind !== 'pan') {
      s.panX = clamp(s.panX + s.panVX * dt, -PAN_MAX, PAN_MAX);
      s.panY = clamp(s.panY + s.panVY * dt, -PAN_MAX, PAN_MAX);
      const decay = Math.exp(-3.2 * dt);
      s.panVX *= decay;
      s.panVY *= decay;
    }

    // floating dust specks in the optical path (seen at 40×)
    for (const d of s.specks) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (Math.hypot(d.x, d.y) > 0.82) {
        d.vx = -d.vx;
        d.vy = -d.vy;
        d.x = clamp(d.x, -0.8, 0.8);
        d.y = clamp(d.y, -0.8, 0.8);
      }
    }

    // dust motes rising in the lamp beam
    for (const m of s.motes) {
      m.u += m.vy * dt;
      if (m.u > 1) m.u -= 1;
    }

    // 40× proximity warning
    if (s.objIndex === 2 && s.slideOn && !s.slideCracked && s.stageZ > 0.62) {
      const now = performance.now();
      if (now - s.warnAt > 9000) {
        s.warnAt = now;
        setFlash({ tone: 'warn', line: 'Careful — the 40× barrel is very close to the cover slip now. Fine knob only, tiny steps.' });
      }
    }
    if (s.stageZ < 0.55) s.fineStopNoted = false;

    // sharpness detections (fire once each)
    const blur = currentBlur(s);
    if (s.slideOn && !s.slideCracked) {
      if (blur <= SHARP_BLUR) {
        if (!s.sharpNoted) {
          s.sharpNoted = true;
          earn('first-sharp');
          labSound.ping(880, 0.09);
        }
        if (s.objIndex === 2 && !s.sharp40Noted) {
          s.sharp40Noted = true;
          setSharp40Ever(true);
          if (!s.everCracked) earn('gentle-hands');
        }
        if (s.slideOn === 'onion') {
          if (s.objIndex >= 1) {
            if (!s.spots.wall) {
              s.spots.wall = true;
              pushToast('good', '✓', 'Cell wall spotted — those thick double outlines exist only in plant cells.');
            }
            if (!s.spots.brick) {
              s.spots.brick = true;
              pushToast('good', '✓', 'Brick shape spotted — tidy rectangles in rows, the plant signature.');
            }
            if (s.objIndex === 2 && !s.spots.vac) {
              s.spots.vac = true;
              pushToast('good', '✓', 'Large central vacuole spotted — the pale inner region filling most of each onion cell.');
            }
          }
        } else if (s.slideOn === 'cheek') {
          if (s.objIndex >= 1 && !s.spots.nuclei) {
            s.spots.nuclei = true;
            pushToast('good', '✓', 'Prominent bare nuclei spotted — dark methylene-blue dots dominating each cheek cell.');
          }
          if (s.objIndex <= 1 && !s.spots.irregular) {
            s.spots.irregular = true;
            pushToast('good', '✓', 'Irregular flattened mosaic spotted — scattered blob shapes, no walls between them.');
          }
        } else if (s.slideOn === 'lettere' && s.objIndex >= 1 && !s.inversionNoted) {
          s.inversionNoted = true;
          earn('inversion');
          pushToast('info', 'ǝ', 'Inversion witnessed — the printed e stands rotated a half-turn: upside down AND left-right reversed. Two lenses, two flips.');
        }
      }
      if (s.objIndex === 0 && blur <= ALMOST_BLUR && !s.almostNoted) {
        s.almostNoted = true;
        setAlmostEver(true);
      }
    }

    // recorded tick pair fades away
    if (s.tickPair) {
      s.tickFade -= dt;
      if (s.tickFade <= 0) s.tickPair = null;
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [earn, pushToast, syncUi]);

  // ---- drawing --------------------------------------------------------------

  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const obj = OBJECTIVES[s.objIndex];
    const ms = g.ms;
    const benchY = g.benchY;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // soft shadows on the bench
    ctx.fillStyle = 'rgba(40,55,75,0.08)';
    ctx.beginPath();
    ctx.ellipse(g.ox, benchY + 6, 150 * ms, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(g.boxX + g.boxW / 2, benchY + 5, g.boxW / 2 + 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // wooden bench
    const wood = ctx.createLinearGradient(0, benchY, 0, h);
    wood.addColorStop(0, '#cda670');
    wood.addColorStop(0.25, '#c19a62');
    wood.addColorStop(1, '#a2744a');
    ctx.fillStyle = wood;
    ctx.fillRect(0, benchY, w, h - benchY);
    ctx.strokeStyle = 'rgba(120,80,40,0.35)';
    ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, benchY + 2);
      ctx.lineTo(x + 8, h - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = '#96693c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, benchY);
    ctx.lineTo(w, benchY);
    ctx.stroke();

    // ---- slide box (left) ----
    ctx.fillStyle = '#a97e4e';
    roundRect(ctx, g.boxX, g.boxY, g.boxW, g.boxH, 6);
    ctx.fill();
    ctx.fillStyle = '#8a6238';
    roundRect(ctx, g.boxX + 5, g.boxY + 6, g.boxW - 10, g.boxH - 10, 4);
    ctx.fill();
    ctx.strokeStyle = '#6e4d2a';
    ctx.lineWidth = 1.5;
    roundRect(ctx, g.boxX, g.boxY, g.boxW, g.boxH, 6);
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      const sl = g.slots[i];
      const isOnStage = s.slideOn === SLIDES[i].id && !s.slideCracked && (!s.drag || s.drag.kind !== 'slide' || s.drag.slide !== SLIDES[i].id);
      if (!isOnStage) {
        drawMiniSlide(ctx, sl.x, sl.y, sl.w, sl.h, SLIDES[i].id, false);
      } else {
        ctx.strokeStyle = 'rgba(174,185,196,0.6)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        roundRect(ctx, sl.x, sl.y, sl.w, sl.h, 3);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ---- light cone from the illuminator up to the stage ----
    const lampY = benchY - 15 * ms;
    const coneA = 0.05 + s.brightness * 0.13;
    const cone = ctx.createLinearGradient(0, lampY, 0, g.stageY);
    cone.addColorStop(0, `rgba(255,214,150,${coneA})`);
    cone.addColorStop(1, `rgba(255,214,150,${coneA * 0.35})`);
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(g.ox - 16 * ms, lampY);
    ctx.lineTo(g.ox + 16 * ms, lampY);
    ctx.lineTo(g.ox + 27 * ms, g.stageY + 4);
    ctx.lineTo(g.ox - 27 * ms, g.stageY + 4);
    ctx.closePath();
    ctx.fill();

    // ---- microscope body ----
    // base + foot
    ctx.fillStyle = '#45526a';
    roundRect(ctx, g.ox - 118 * ms, benchY - 26 * ms, (118 + 62 + 108) * ms, 26 * ms, 8);
    ctx.fill();
    ctx.fillStyle = '#333f52';
    roundRect(ctx, g.ox - 126 * ms, benchY - 9 * ms, (126 + 62 + 116) * ms, 9 * ms, 4);
    ctx.fill();
    ctx.strokeStyle = '#2a3446';
    ctx.lineWidth = 1.5;
    roundRect(ctx, g.ox - 118 * ms, benchY - 26 * ms, (118 + 62 + 108) * ms, 26 * ms, 8);
    ctx.stroke();

    // curved arm
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a566b';
    ctx.lineWidth = 30 * ms;
    ctx.beginPath();
    ctx.moveTo(g.mcx + 78 * ms, benchY - 26 * ms);
    ctx.bezierCurveTo(g.mcx + 92 * ms, benchY - 120 * ms, g.mcx + 84 * ms, g.stageY + 30 * ms, g.mcx + 66 * ms, g.turretY - 4 * ms);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 8 * ms;
    ctx.beginPath();
    ctx.moveTo(g.mcx + 74 * ms, benchY - 34 * ms);
    ctx.bezierCurveTo(g.mcx + 87 * ms, benchY - 120 * ms, g.mcx + 79 * ms, g.stageY + 26 * ms, g.mcx + 62 * ms, g.turretY - 2 * ms);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // stage plate with central hole
    ctx.fillStyle = '#39465b';
    roundRect(ctx, g.ox - 86 * ms, g.stageY, 172 * ms, 11 * ms, 3);
    ctx.fill();
    ctx.fillStyle = '#4e5d74';
    ctx.fillRect(g.ox - 86 * ms, g.stageY, 172 * ms, 3 * ms);
    ctx.strokeStyle = '#2a3446';
    ctx.lineWidth = 1.4;
    roundRect(ctx, g.ox - 86 * ms, g.stageY, 172 * ms, 11 * ms, 3);
    ctx.stroke();
    // hole glow
    ctx.fillStyle = `rgba(255,222,164,${0.25 + s.brightness * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(g.ox, g.stageY + 6, 22 * ms, 4.5 * ms, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20293a';
    ctx.beginPath();
    ctx.ellipse(g.ox, g.stageY + 6, 22 * ms, 3.2 * ms, 0, 0, Math.PI * 2);
    ctx.fill();

    // slide on the stage
    if (s.slideOn && !(s.drag && s.drag.kind === 'slide' && s.drag.slide === s.slideOn)) {
      const settle = 1 - s.placeAnim;
      const yOff = (1 - settle) * 26;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * settle;
      const sw = 148 * ms;
      const sh = 7 * ms;
      const topH = 12 * ms;
      const sx = g.ox - sw / 2;
      const sy = g.stageY - sh - yOff;
      ctx.fillStyle = 'rgba(214,230,240,0.95)';
      roundRect(ctx, sx, sy, sw, sh + topH, 2);
      ctx.fill();
      ctx.strokeStyle = '#8da8b9';
      ctx.lineWidth = 1.2;
      roundRect(ctx, sx, sy, sw, sh + topH, 2);
      ctx.stroke();
      // specimen stripe on the top face
      const px = sx + sw * 0.26;
      const pw = sw * 0.66;
      if (s.slideOn === 'onion') {
        ctx.fillStyle = '#c98f3d';
        ctx.fillRect(px, sy + 2, pw, topH - 4);
        ctx.strokeStyle = 'rgba(122,79,30,0.8)';
        ctx.lineWidth = 1;
        for (let k = 0; k <= 5; k += 1) {
          const lx = px + (pw * k) / 5;
          ctx.beginPath();
          ctx.moveTo(lx, sy + 2);
          ctx.lineTo(lx, sy + topH - 2);
          ctx.stroke();
        }
      } else if (s.slideOn === 'cheek') {
        ctx.fillStyle = '#a9c8e4';
        ctx.fillRect(px, sy + 2, pw, topH - 4);
        ctx.fillStyle = 'rgba(29,58,95,0.8)';
        for (let k = 0; k < 5; k += 1) {
          ctx.beginPath();
          ctx.arc(px + pw * (0.12 + k * 0.19), sy + topH / 2, Math.max(1, topH * 0.16), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#f2f4f6';
        ctx.fillRect(px, sy + 2, pw, topH - 4);
        drawLetterE(ctx, px + pw / 2, sy + topH / 2, topH * 0.34, 1.4, '#2e3542');
      }
      if (s.slideCracked) {
        ctx.strokeStyle = 'rgba(25,32,44,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + sw * 0.2, sy + topH * 0.4);
        ctx.lineTo(sx + sw * 0.4, sy + topH * 0.85);
        ctx.lineTo(sx + sw * 0.58, sy + topH * 0.3);
        ctx.lineTo(sx + sw * 0.8, sy + topH * 0.8);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      // slide clips
      ctx.fillStyle = '#2f3a4c';
      roundRect(ctx, g.ox - 62 * ms, sy - 3, 13 * ms, 6 * ms, 2);
      ctx.fill();
      roundRect(ctx, g.ox + 49 * ms, sy - 3, 13 * ms, 6 * ms, 2);
      ctx.fill();
      ctx.restore();
    }

    // drop-zone highlight while dragging a slide
    if (s.drag && s.drag.kind === 'slide') {
      const inZone = Math.abs(s.pointer.x - g.ox) < 110 * ms && Math.abs(s.pointer.y - g.stageY) < 70;
      ctx.strokeStyle = inZone ? 'rgba(249,115,22,0.85)' : 'rgba(249,115,22,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      roundRect(ctx, g.ox - 96 * ms, g.stageY - 26, 192 * ms, 44, 8);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // condenser + diaphragm lever
    ctx.fillStyle = '#42506a';
    roundRect(ctx, g.ox - 23 * ms, g.stageY + 16 * ms, 46 * ms, 24 * ms, 4);
    ctx.fill();
    ctx.strokeStyle = '#2a3446';
    ctx.lineWidth = 1.3;
    roundRect(ctx, g.ox - 23 * ms, g.stageY + 16 * ms, 46 * ms, 24 * ms, 4);
    ctx.stroke();
    const leverA = 0.55 - s.iris * 1.5;
    const lx = g.ox + 26 * ms;
    const ly = g.stageY + 28 * ms;
    const tipX = lx + Math.cos(leverA) * 22 * ms;
    const tipY = ly + Math.sin(leverA) * 22 * ms;
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = '#8a6420';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 5.5 * ms, 0, Math.PI * 2);
    ctx.fill();

    // illuminator lamp + brightness dial
    ctx.fillStyle = '#2f3a4c';
    ctx.beginPath();
    ctx.arc(g.ox, lampY, 16 * ms, 0, Math.PI * 2);
    ctx.fill();
    const lampGlow = ctx.createRadialGradient(g.ox, lampY, 2, g.ox, lampY, 22 * ms);
    lampGlow.addColorStop(0, `rgba(255,236,190,${0.35 + s.brightness * 0.55})`);
    lampGlow.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.arc(g.ox, lampY, 22 * ms, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,244,214,${0.45 + s.brightness * 0.5})`;
    ctx.beginPath();
    ctx.arc(g.ox, lampY, 7 * ms, 0, Math.PI * 2);
    ctx.fill();
    // dial knob with pointer
    drawKnob(ctx, g.dial.x, g.dial.y, g.dial.r, s.brightness * 2.6, false, false);
    ctx.strokeStyle = '#f6d27c';
    ctx.lineWidth = 2;
    const dA = -2.2 + s.brightness * 2.6;
    ctx.beginPath();
    ctx.moveTo(g.dial.x, g.dial.y);
    ctx.lineTo(g.dial.x + Math.cos(dA) * g.dial.r * 0.8, g.dial.y + Math.sin(dA) * g.dial.r * 0.8);
    ctx.stroke();

    // head tube + eyepiece
    ctx.fillStyle = '#4a566b';
    roundRect(ctx, g.ox - 12 * ms, g.headTop + 16, 24 * ms, g.turretY - g.headTop - 26, 5);
    ctx.fill();
    ctx.strokeStyle = '#2a3446';
    ctx.lineWidth = 1.4;
    roundRect(ctx, g.ox - 12 * ms, g.headTop + 16, 24 * ms, g.turretY - g.headTop - 26, 5);
    ctx.stroke();
    ctx.fillStyle = '#39465b';
    roundRect(ctx, g.ox - 16 * ms, g.headTop - 6, 32 * ms, 26, 6);
    ctx.fill();
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.ox - 14 * ms, g.headTop - 2);
    ctx.lineTo(g.ox + 14 * ms, g.headTop - 2);
    ctx.stroke();
    // exit-pupil glow — brighter as the image comes into focus
    const sharp01 = s.slideOn && !s.slideCracked ? clamp(1 - currentBlur(s) / 8, 0, 1) : 0.15;
    const exitG = ctx.createRadialGradient(g.ox, g.headTop - 12, 1, g.ox, g.headTop - 12, 16 * ms);
    exitG.addColorStop(0, `rgba(255,240,205,${0.1 + sharp01 * 0.3})`);
    exitG.addColorStop(1, 'rgba(255,240,205,0)');
    ctx.fillStyle = exitG;
    ctx.beginPath();
    ctx.arc(g.ox, g.headTop - 12, 16 * ms, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,228,240,0.75)';
    ctx.beginPath();
    ctx.ellipse(g.ox, g.headTop - 6, 10 * ms, 3.4 * ms, 0, 0, Math.PI * 2);
    ctx.fill();

    // turret + three objective barrels
    for (let i = 0; i < 3; i += 1) {
      const a = s.turretBase + (i - 1) * 2.0944;
      const dirX = Math.cos(a);
      const dirY = Math.sin(a);
      const perpX = -dirY;
      const perpY = dirX;
      const selected = i === s.objIndex;
      const len0 = 15 * ms;
      const len1 = (selected ? 60 : 50) * ms;
      const w0 = 9 * ms;
      const w1 = 5 * ms;
      const bx = g.ox + dirX * len0;
      const by = g.turretY + dirY * len0;
      const tx = g.ox + dirX * len1;
      const ty = g.turretY + dirY * len1;
      ctx.fillStyle = '#7c8aa0';
      ctx.beginPath();
      ctx.moveTo(bx + perpX * w0, by + perpY * w0);
      ctx.lineTo(tx + perpX * w1, ty + perpY * w1);
      ctx.lineTo(tx - perpX * w1, ty - perpY * w1);
      ctx.lineTo(bx - perpX * w0, by - perpY * w0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#38445a';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // coloured ring band near the tip
      const rpos = len1 - 9 * ms;
      const rX = g.ox + dirX * rpos;
      const rY = g.turretY + dirY * rpos;
      const rw = (w1 + w0) / 2;
      ctx.strokeStyle = OBJECTIVES[i].band;
      ctx.lineWidth = 4.5 * ms;
      ctx.beginPath();
      ctx.moveTo(rX + perpX * rw, rY + perpY * rw);
      ctx.lineTo(rX - perpX * rw, rY - perpY * rw);
      ctx.stroke();
      // tip lens
      ctx.fillStyle = '#cfe0ee';
      ctx.beginPath();
      ctx.arc(tx, ty, w1 * 0.8, 0, Math.PI * 2);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = 'rgba(249,115,22,0.7)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(tx, ty, w1 * 0.8 + 3, 0, Math.PI * 2);
        ctx.stroke();
        if (sharp01 > 0.8) {
          ctx.strokeStyle = 'rgba(46,184,114,0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(tx, ty, w1 * 0.8 + 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = '#5a6a80';
    ctx.beginPath();
    ctx.arc(g.ox, g.turretY, 15 * ms, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a3446';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#39465b';
    ctx.beginPath();
    ctx.arc(g.ox, g.turretY, 6 * ms, 0, Math.PI * 2);
    ctx.fill();

    // dust motes drifting up the beam
    const moteA = 0.06 + s.brightness * 0.14;
    ctx.fillStyle = `rgba(255,222,164,${moteA})`;
    for (const m of s.motes) {
      const mx = g.ox + Math.sin(m.ph + s.t * 0.35) * (10 + m.u * 20) * ms;
      const my = lampY - m.u * (lampY - g.stageY - 12 * ms);
      ctx.beginPath();
      ctx.arc(mx, my, 1.1 + m.u * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // focus knobs (drawn last, on top of the arm)
    const hoverCoarse = !!s.drag && s.drag.kind === 'coarse';
    const hoverFine = !!s.drag && s.drag.kind === 'fine';
    drawKnob(ctx, g.coarse.x, g.coarse.y, g.coarse.r, s.rotCoarse, true, hoverCoarse);
    drawKnob(ctx, g.fine.x, g.fine.y, g.fine.r, s.rotFine, false, hoverFine);
    // red glint on the 40× tip when dangerously close to the glass
    if (s.objIndex === 2 && s.slideOn && !s.slideCracked && s.stageZ > 0.62) {
      ctx.fillStyle = `rgba(214,69,65,${0.35 + 0.3 * Math.sin(s.t * 6)})`;
      ctx.beginPath();
      ctx.arc(g.ox, g.turretY + 60 * ms, 4 * ms, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- ocular view panel ----
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.ceil(2 * g.R + 80);
    let oc = oscRef.current;
    if (!oc) {
      oc = document.createElement('canvas');
      oscRef.current = oc;
    }
    const bufW = Math.round(W * dpr);
    if (oc.width !== bufW) {
      oc.width = bufW;
      oc.height = bufW;
    }
    // The specimen field is baked into the buffer on a whole-pixel pan grid and
    // blitted with the residual sub-pixel offset: easing back to centre and
    // momentum after a pan no longer re-render thousands of cells every frame,
    // and the buffer size inside the key catches window resizes (which blank
    // the canvas buffer and would otherwise leave a stale, empty ocular view).
    const sc = (2 * g.R) / obj.fov;
    const snapX = Math.round(s.panX * sc) / sc;
    const snapY = Math.round(s.panY * sc) / sc;
    const drift = Math.max(Math.abs(s.panX - s.fieldPanX), Math.abs(s.panY - s.fieldPanY)) * sc;
    const key = `${s.slideOn}|${s.objIndex}|${s.slideCracked ? 1 : 0}|${bufW}`;
    if (key !== s.fieldKey || drift > 30) {
      s.fieldKey = key;
      s.fieldPanX = snapX;
      s.fieldPanY = snapY;
      const octx = oc.getContext('2d');
      if (octx) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.clearRect(0, 0, W, W);
        drawSpecimenField(octx, W, g.R, s, snapX, snapY);
      }
    }
    const offX = (s.panX - s.fieldPanX) * sc;
    const offY = (s.panY - s.fieldPanY) * sc;

    ctx.save();
    ctx.beginPath();
    ctx.arc(g.ocx, g.ocy, g.R, 0, Math.PI * 2);
    ctx.clip();
    // specimen (blurred by defocus, clipped to the round field)
    const blur = s.slideOn ? currentBlur(s) : 0;
    drawImageWithBlur(ctx, oc, g.ocx - W / 2 + offX, g.ocy - W / 2 + offY, W, W, blur);

    // brightness + diaphragm dimming (with a live shimmer)
    const shimmer = 1 + 0.02 * Math.sin(s.t * 1.7);
    const light = clamp(s.brightness * (0.62 + 0.38 * s.iris) * shimmer, 0, 1);
    const dim = clamp((1 - light) * 0.8, 0, 0.82);
    if (dim > 0.01) {
      ctx.fillStyle = `rgba(8,12,20,${dim.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(g.ocx, g.ocy, g.R, 0, Math.PI * 2);
      ctx.fill();
    }

    // vignette (deeper when the diaphragm closes)
    const vin = ctx.createRadialGradient(g.ocx, g.ocy, g.R * 0.45, g.ocx, g.ocy, g.R);
    vin.addColorStop(0, 'rgba(6,10,18,0)');
    vin.addColorStop(1, `rgba(6,10,18,${0.5 + (1 - s.iris) * 0.22})`);
    ctx.fillStyle = vin;
    ctx.beginPath();
    ctx.arc(g.ocx, g.ocy, g.R, 0, Math.PI * 2);
    ctx.fill();

    // dust specks in the optical path (40× shows them, 10× hints at them)
    const speckA = s.objIndex === 2 ? 0.16 : s.objIndex === 1 ? 0.05 : 0;
    if (speckA > 0) {
      for (const d of s.specks) {
        const px = g.ocx + d.x * g.R;
        const py = g.ocy + d.y * g.R;
        const pr = Math.max(2.5, d.r * g.R);
        const sg = ctx.createRadialGradient(px, py, 0.5, px, py, pr);
        sg.addColorStop(0, `rgba(25,32,44,${speckA})`);
        sg.addColorStop(1, 'rgba(25,32,44,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // graticule — ruled scale across the field (no numbers: they live in the DOM)
    if (s.graticule) {
      const div = (2 * g.R) / 50;
      ctx.strokeStyle = 'rgba(18,28,44,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.ocx - g.R, g.ocy);
      ctx.lineTo(g.ocx + g.R, g.ocy);
      ctx.moveTo(g.ocx, g.ocy - g.R);
      ctx.lineTo(g.ocx, g.ocy + g.R);
      ctx.stroke();
      ctx.lineWidth = 1;
      for (let k = -25; k <= 25; k += 1) {
        if (k === 0) continue;
        const x = g.ocx + k * div;
        const major = k % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(18,28,44,0.75)' : 'rgba(18,28,44,0.4)';
        ctx.beginPath();
        ctx.moveTo(x, g.ocy - (major ? 11 : 5));
        ctx.lineTo(x, g.ocy + (major ? 11 : 5));
        ctx.moveTo(g.ocx - (major ? 11 : 5), x);
        ctx.lineTo(g.ocx + (major ? 11 : 5), x);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(18,28,44,0.8)';
      ctx.beginPath();
      ctx.arc(g.ocx, g.ocy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // measuring ticks (specimen-attached, so they travel with the field)
    const objSc = (2 * g.R) / obj.fov;
    const tickScreen = (um: { x: number; y: number }) => ({
      x: g.ocx - (um.x - s.panX) * objSc,
      y: g.ocy - (um.y - s.panY) * objSc,
    });
    if (s.tickPair) {
      const a = tickScreen(s.tickPair.a);
      const b = tickScreen(s.tickPair.b);
      ctx.globalAlpha = clamp(s.tickFade / 1.4, 0, 1);
      ctx.strokeStyle = '#e8632a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      drawTickMark(ctx, a.x, a.y);
      drawTickMark(ctx, b.x, b.y);
      ctx.globalAlpha = 1;
    }
    if (s.tickA) {
      const a = tickScreen(s.tickA);
      drawTickMark(ctx, a.x, a.y);
      // preview line to the pointer
      if (s.pointer.x > 0 && Math.hypot(s.pointer.x - g.ocx, s.pointer.y - g.ocy) < g.R) {
        ctx.strokeStyle = 'rgba(232,99,42,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(s.pointer.x, s.pointer.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // crack overlay
    if (s.slideCracked) {
      ctx.fillStyle = 'rgba(10,14,22,0.35)';
      ctx.beginPath();
      ctx.arc(g.ocx, g.ocy, g.R, 0, Math.PI * 2);
      ctx.fill();
      const flashA = clamp(1 - (s.t - s.crackAt) / 0.4, 0, 1);
      for (const line of s.cracks) {
        ctx.strokeStyle = 'rgba(16,22,32,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        line.forEach((pt, i) => {
          const x = g.ocx + pt.x * g.R;
          const y = g.ocy + pt.y * g.R;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.strokeStyle = `rgba(250,252,255,${0.55 + flashA * 0.3})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
    ctx.restore();

    // bezel + glint
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#2b3648';
    ctx.beginPath();
    ctx.arc(g.ocx, g.ocy, g.R + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d9a441';
    ctx.beginPath();
    ctx.arc(g.ocx, g.ocy, g.R + 11, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 4; k += 1) {
      const a = Math.PI / 4 + (k / 4) * Math.PI * 2;
      ctx.fillStyle = '#5a6a80';
      ctx.beginPath();
      ctx.arc(g.ocx + Math.cos(a) * (g.R + 5), g.ocy + Math.sin(a) * (g.R + 5), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.035 * Math.sin(s.t * 0.8)})`;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(g.ocx, g.ocy, g.R * 0.84, -2.4, -1.7);
    ctx.stroke();

    // view-link: a dashed cue from the eyepiece to the ocular panel
    ctx.strokeStyle = 'rgba(150,163,178,0.55)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(g.ox, g.headTop - 14);
    ctx.quadraticCurveTo((g.ox + g.ocx + g.R) / 2 + 20, g.headTop - 60, g.ocx + g.R * 0.82, g.ocy - g.R * 0.55);
    ctx.stroke();
    ctx.setLineDash([]);

    // dragged slide follows the pointer
    if (s.drag && s.drag.kind === 'slide' && s.drag.slide) {
      const dx = s.pointer.x - s.drag.grabDX;
      const dy = s.pointer.y - s.drag.grabDY;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(-0.09);
      ctx.fillStyle = 'rgba(40,55,75,0.18)';
      roundRect(ctx, -34, -9 + 8, 68, 26, 4);
      ctx.fill();
      drawMiniSlide(ctx, -34, -9, 68, 26, s.drag.slide, false);
      ctx.restore();
    }
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    const canvas = canvasRef.current;
    if (!p || !canvas) return;
    const s = sim.current;
    const g = geom();
    s.lastP = { x: p.x, y: p.y };

    // grab a slide from the box
    for (let i = 0; i < 3; i += 1) {
      const sl = g.slots[i];
      if (p.x > sl.x - 12 && p.x < sl.x + sl.w + 12 && p.y > sl.y - 10 && p.y < sl.y + sl.h + 10) {
        if (s.slideOn === SLIDES[i].id && !s.slideCracked) {
          flashOnce('info', 'That slide is already on the stage — pick another, or start focusing.');
          notePointer(false);
          return;
        }
        s.drag = { kind: 'slide', slide: SLIDES[i].id, from: 'box', startX: p.x, startY: p.y, grabDX: p.x - (sl.x + sl.w / 2), grabDY: p.y - (sl.y + sl.h / 2), moved: false };
        labSound.creak(0.4);
        notePointer(true);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        syncUi();
        return;
      }
    }

    // lift the slide off the stage
    const sr = slideRect(g);
    if (s.slideOn && p.x > sr.x && p.x < sr.x + sr.w && p.y > sr.y && p.y < sr.y + sr.h) {
      const lifted = s.slideOn;
      s.slideOn = null;
      s.drag = { kind: 'slide', slide: lifted, from: 'stage', startX: p.x, startY: p.y, grabDX: p.x - g.ox, grabDY: p.y - (g.stageY - 8), moved: false };
      labSound.glassClink(true);
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      syncUi();
      return;
    }

    // focus knobs
    if (Math.hypot(p.x - g.coarse.x, p.y - g.coarse.y) < g.coarse.r + 18) {
      s.drag = { kind: 'coarse', from: 'stage', startX: p.x, startY: p.y, grabDX: 0, grabDY: 0, moved: false };
      labSound.creak(0.5);
      if (s.objIndex === 2 && s.slideOn) {
        flashOnce('warn', 'Coarse knob at 40× — tiny turns only, or the barrel meets the cover slip.', 14000);
      }
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      return;
    }
    if (Math.hypot(p.x - g.fine.x, p.y - g.fine.y) < g.fine.r + 16) {
      s.drag = { kind: 'fine', from: 'stage', startX: p.x, startY: p.y, grabDX: 0, grabDY: 0, moved: false };
      labSound.creak(0.3);
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      return;
    }

    // brightness dial
    if (Math.hypot(p.x - g.dial.x, p.y - g.dial.y) < g.dial.r + 15) {
      s.drag = { kind: 'dial', from: 'stage', startX: p.x, startY: p.y, grabDX: 0, grabDY: 0, startB: s.brightness, moved: false };
      labSound.tick();
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      return;
    }

    // diaphragm lever
    const leverA = 0.55 - s.iris * 1.5;
    const tipX = g.ox + 26 * g.ms + Math.cos(leverA) * 22 * g.ms;
    const tipY = g.stageY + 28 * g.ms + Math.sin(leverA) * 22 * g.ms;
    if (Math.hypot(p.x - tipX, p.y - tipY) < 22) {
      s.drag = { kind: 'iris', from: 'stage', startX: p.x, startY: p.y, grabDX: 0, grabDY: 0, startI: s.iris, moved: false };
      labSound.tick();
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      return;
    }

    // click an objective barrel
    for (let i = 0; i < 3; i += 1) {
      const op = objPoint(g, i);
      if (Math.hypot(p.x - op.x, p.y - op.y) < 30) {
        setObjective(i);
        notePointer(true);
        return;
      }
    }

    // inside the ocular view: pan (tap drops a measuring tick)
    if (Math.hypot(p.x - g.ocx, p.y - g.ocy) < g.R) {
      s.drag = { kind: 'pan', from: 'stage', startX: p.x, startY: p.y, grabDX: 0, grabDY: 0, moved: false };
      s.panVX = 0;
      s.panVY = 0;
      s.panHome = false;
      s.panLastT = performance.now();
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      return;
    }

    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = sim.current;
    const g = geom();
    s.pointer = { x: p.x, y: p.y };
    const nowT = performance.now();

    if (s.drag) {
      if (Math.hypot(p.x - s.drag.startX, p.y - s.drag.startY) > 8) s.drag.moved = true;
      const dy = p.y - s.lastP.y;
      const dx = p.x - s.lastP.x;
      switch (s.drag.kind) {
        case 'slide':
          if (s.drag.moved && nowT - s.slideSoundAt > 160) {
            s.slideSoundAt = nowT;
            labSound.slide(0.22);
          }
          break;
        case 'coarse':
          // applyCoarse already advances rotCoarse by exactly the stage travel
          applyCoarse(-dy * COARSE_RATE);
          if (Math.abs(dy) > 1 && nowT - s.knobSoundAt > 130) {
            s.knobSoundAt = nowT;
            labSound.slide(0.14);
          }
          break;
        case 'fine':
          // applyFine likewise owns rotFine — a second accumulation here used
          // to spin the knob twice as fast as the stage actually moved
          applyFine(-dy * FINE_RATE);
          if (Math.abs(dy) > 1 && nowT - s.knobSoundAt > 170) {
            s.knobSoundAt = nowT;
            labSound.creak(0.14);
          }
          break;
        case 'dial':
          // accumulated from the drag origin — the per-move delta left the
          // dial flickering a hair off its starting value instead of turning
          setBrightness((s.drag.startB ?? s.brightness) - (p.y - s.drag.startY) * 0.006);
          break;
        case 'iris':
          setIris((s.drag.startI ?? s.iris) + (p.x - s.drag.startX) * 0.006);
          break;
        case 'pan': {
          if (!s.drag.moved) break;
          const sc = (2 * g.R) / OBJECTIVES[s.objIndex].fov;
          s.panX = clamp(s.panX - dx / sc, -PAN_MAX, PAN_MAX);
          s.panY = clamp(s.panY - dy / sc, -PAN_MAX, PAN_MAX);
          const dt = Math.max(0.008, (nowT - s.panLastT) / 1000);
          s.panVX = s.panVX * 0.7 - dx / sc / dt;
          s.panVY = s.panVY * 0.7 - dy / sc / dt;
          s.panLastT = nowT;
          if (nowT - s.slideSoundAt > 200) {
            s.slideSoundAt = nowT;
            labSound.slide(0.1);
          }
          break;
        }
      }
    }
    s.lastP = { x: p.x, y: p.y };

    // cursor affordances
    const canvas = canvasRef.current;
    if (canvas) {
      let cursor = 'default';
      if (s.drag) cursor = 'grabbing';
      else {
        let grab = false;
        for (const sl of g.slots) {
          if (p.x > sl.x - 12 && p.x < sl.x + sl.w + 12 && p.y > sl.y - 10 && p.y < sl.y + sl.h + 10) { grab = true; break; }
        }
        const sr = slideRect(g);
        if (!grab && s.slideOn && p.x > sr.x && p.x < sr.x + sr.w && p.y > sr.y && p.y < sr.y + sr.h) grab = true;
        if (!grab && Math.hypot(p.x - g.coarse.x, p.y - g.coarse.y) < g.coarse.r + 18) grab = true;
        if (!grab && Math.hypot(p.x - g.fine.x, p.y - g.fine.y) < g.fine.r + 16) grab = true;
        if (!grab && Math.hypot(p.x - g.dial.x, p.y - g.dial.y) < g.dial.r + 15) grab = true;
        if (grab) cursor = 'grab';
        else {
          let onObj = false;
          for (let i = 0; i < 3; i += 1) {
            const op = objPoint(g, i);
            if (Math.hypot(p.x - op.x, p.y - op.y) < 30) { onObj = true; break; }
          }
          if (onObj) cursor = 'pointer';
          else if (Math.hypot(p.x - g.ocx, p.y - g.ocy) < g.R) cursor = s.graticule ? 'crosshair' : 'grab';
        }
      }
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag) return;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const p = pointerPos(e);
    const g = geom();
    const drag = s.drag;
    s.drag = null;

    if (drag.kind === 'slide' && drag.slide) {
      if (!drag.moved) {
        if (drag.from === 'box') {
          placeSlide(drag.slide);
        } else {
          // a tap on the stage slide simply settles it back
          s.slideOn = drag.slide;
          labSound.glassClink(true);
          syncUi();
        }
        return;
      }
      const inZone = !!p && Math.abs(p.x - g.ox) < 110 * g.ms && Math.abs(p.y - g.stageY) < 70;
      if (inZone) {
        placeSlide(drag.slide);
      } else {
        labSound.slide(0.35);
        labSound.thunk(false);
        if (drag.from === 'stage') flashOnce('info', 'Back in the box — the stage is where slides belong.');
        notePointer(false);
        syncUi();
      }
      return;
    }
    if (drag.kind === 'pan' && !drag.moved && p) {
      if (s.graticule) {
        dropTickAt(p);
      } else {
        flashOnce('info', 'Switch on the graticule (the ⌗ button) to drop measuring ticks.', 9000);
        notePointer(false);
      }
    }
  };

  // ---- keyboard / assist --------------------------------------------------

  const assist = useMemo(() => {
    const blur = ui.blur;
    const sharp = !!ui.slideOn && !ui.cracked && blur <= SHARP_BLUR;
    if (!ui.slideOn) return { label: 'Place the onion slide', small: 'drag it over, or press here', run: () => placeSlide('onion') };
    if (ui.cracked) return { label: 'Replace the cracked slide', small: 'a fresh one waits in the box', run: () => placeSlide(sim.current.slideOn ?? 'onion') };
    if (blur > 26) {
      if (ui.objIndex !== 0) return { label: 'Click the 4× objective', small: 'low power first — always', run: () => setObjective(0) };
      const dir = sim.current.stageZ < sim.current.focusZ ? 1 : -1;
      return { label: 'Turn the coarse knob', small: 'big steps toward almost-sharp', run: () => applyCoarse(dir * COARSE_STEP) };
    }
    if (!sharp) {
      const dir = sim.current.stageZ < sim.current.focusZ ? 1 : -1;
      // far from focus → coarse steps close the gap quickly; the fine knob
      // only earns the last stretch (and it was ~27 tiny presses from the
      // opening state before this branch learned to hand off)
      if (Math.abs(sim.current.focusZ - sim.current.stageZ) > 0.12) {
        return { label: 'Turn the coarse knob', small: 'big steps toward almost-sharp', run: () => applyCoarse(dir * COARSE_STEP) };
      }
      return { label: 'Nudge toward focus', small: 'small steps — the last bit of sharpness', run: () => applyFine(dir * FINE_STEP * 3) };
    }
    if (mentorIndex === 2 && ui.objIndex < 2) return { label: 'Click the 40× objective', small: 'then refocus with the fine knob only', run: () => setObjective(2) };
    if (mentorIndex >= 4 && !ui.graticule) return { label: 'Switch on the graticule', small: 'the ruled scale lives in the eyepiece', run: () => toggleGraticule() };
    return null;
  }, [ui, mentorIndex, placeSlide, setObjective, applyCoarse, applyFine, toggleGraticule]);

  const runAssist = () => {
    if (assist) {
      assist.run();
      pushToast('info', '✦', `${assist.label} — ${assist.small}.`);
      notePointer(true);
    } else {
      notePointer(false);
    }
  };

  const onCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      runAssist();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      dropCenterTick();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? COARSE_STEP : FINE_STEP;
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      if (e.shiftKey) applyCoarse(dir * step);
      else applyFine(dir * step);
      notePointer(true);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const s = sim.current;
      const obj = OBJECTIVES[s.objIndex];
      const d = obj.fov * 0.12 * (e.key === 'ArrowLeft' ? 1 : -1);
      s.panX = clamp(s.panX + d, -PAN_MAX, PAN_MAX);
      s.panHome = false;
      labSound.slide(0.12);
      notePointer(true);
    }
  };

  // ---- coach ------------------------------------------------------------------

  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (flash) return { tone: flash.tone, line: flash.line };
    if (ui.cracked) {
      return { tone: 'warn', line: 'Cover slip cracked — the coarse knob at 40× drove the barrel into the glass. Drag a fresh slide from the box (your data is untouched) and keep coarse for low power.' };
    }
    if (ui.tickPending) {
      return { tone: 'info', line: 'One tick down — click the far end of the same cell to finish the measurement. The dashed line previews your reading.' };
    }
    if (!ui.slideOn) {
      return { tone: 'info', line: 'Drag the onion slide from the box onto the stage — or press its button below. Then we will hunt focus, one knob at a time.' };
    }
    if (ui.slideOn === 'lettere' && ui.sharp01 > 0.75) {
      return { tone: 'good', line: 'ǝ — there it is: the printed e stands rotated a half-turn, upside down AND mirrored. Pan the view and it drifts against your hand. That is the compound optics talking.' };
    }
    if (ui.objIndex === 2 && ui.slideOn && ui.stageZ > 0.62 && !ui.cracked) {
      return { tone: 'warn', line: 'The 40× barrel is close to the cover slip — fine knob only, tiny steps. The red glint on the objective tip is your warning light.' };
    }
    if (ui.sharp01 > 0.75) {
      const name = SLIDES.find((x) => x.id === ui.slideOn)?.name ?? 'slide';
      return { tone: 'good', line: `Razor sharp on the ${name.toLowerCase()} at ${OBJECTIVES[ui.objIndex].mag}×. ${ui.objIndex === 2 ? 'Try the graticule for measurements — or swap slides.' : 'Click up to the next objective and refocus with the fine knob.'}` };
    }
    if (ui.blur > 26) {
      return { tone: 'info', line: 'Way out of focus — swing the coarse knob and watch the blur breathe. You are hunting the depth where the specimen plane meets the objective’s focal plane.' };
    }
    if (ui.objIndex === 0) {
      return { tone: 'info', line: 'Coarse at 4× is safe and fast — drag the big knob until the cells are almost sharp, then hand the last word to the fine knob.' };
    }
    if (ui.objIndex === 2) {
      return { tone: 'info', line: 'At 40× the depth of field is hairline-thin — tiny fine-knob steps. If the image will not resolve, drop to 4×, coarse-focus, then climb back up.' };
    }
    if (onionRows.length < 5 && ui.graticule && ui.slideOn === 'onion') {
      return { tone: 'info', line: `Graticule ready at ${OBJECTIVES[ui.objIndex].umPerDiv} µm per division — click one end of a cell, then the other. ${onionRows.length}/5 measured so far.` };
    }
    if (mentorIndex >= 5 && cheekRows.length < 5) {
      return { tone: 'info', line: 'Cheek cells next: place the blue-stained slide, measure five of them, then answer the comparison questions below the scene.' };
    }
    if (concluded && !sawObs) {
      return { tone: 'good', line: 'Comparison concluded — open Observations for the plant-vs-animal bar chart and your full measurement table.' };
    }
    if (concluded) {
      return { tone: 'good', line: 'Experiment complete: wall and vacuole and size — three differences between plant and animal cells, measured with your own clicks. Keep exploring; the bench is yours.' };
    }
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [flash, ui, onionRows.length, cheekRows.length, mentorIndex, concluded, sawObs]);

  // ---- status -------------------------------------------------------------------

  const complete = done[done.length - 1];
  const statusText = ui.cracked
    ? 'Cover slip cracked — replace the slide'
    : complete
      ? 'Experiment complete'
      : !ui.slideOn
        ? 'No slide on the stage'
        : ui.sharp01 > 0.75
          ? `Sharp at ${OBJECTIVES[ui.objIndex].mag}×`
          : ui.blur < ALMOST_BLUR
            ? 'Almost sharp…'
            : 'Focusing';

  const objNow = OBJECTIVES[ui.objIndex];
  const pct = Math.round(ui.sharp01 * 100);
  const slideName = ui.slideOn ? SLIDES.find((x) => x.id === ui.slideOn)!.name : null;

  // ---- render --------------------------------------------------------------------

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.cracked ? 'warn' : ui.sharp01 > 0.75 ? 'active' : 'ready'}
      captionChip="Student-operated compound microscope"
      legend={[
        { color: '#c98f3d', label: 'Onion slide · iodine' },
        { color: '#8fb7dd', label: 'Cheek slide · methylene blue' },
        { color: '#3d7dd8', label: '40× objective' },
        { color: '#d9a441', label: 'Brass focus knobs' },
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
        <label>Objective
          <select value={ui.objIndex} onChange={(e) => { setObjective(Number(e.target.value)); notePointer(true); }} aria-label="Select objective">
            {OBJECTIVES.map((o, i) => (
              <option key={o.mag} value={i}>{o.short} · {o.name}</option>
            ))}
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Compound microscope bench — drag slides from the box onto the stage, drag the focus knobs, click objectives, and pan or click inside the round ocular view"
          onKeyDown={onCanvasKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="micro-layout">
            <div className="micro-block">
              <span className="micro-block-title">OBJECTIVE TURRET · CLICK A BARREL</span>
              <div className="micro-objseg" data-nudge="objectives">
                {OBJECTIVES.map((o, i) => (
                  <button key={o.mag} type="button" className={ui.objIndex === i ? 'active' : ''} onClick={() => { setObjective(i); notePointer(true); }}>
                    <i style={{ background: o.ring }} />
                    <span>{o.short}</span>
                    <small>{o.name}</small>
                  </button>
                ))}
              </div>
              <div className="lab-slider-row" data-nudge="stage">
                <label><span>Stage height · coarse</span><strong>{Math.round(ui.stageZ * STAGE_TRAVEL_UM)} µm</strong></label>
                <input type="range" min="0" max="1" step="0.005" value={ui.stageZ}
                  aria-label="Stage height in micrometres — coarse focus duplicate of the big knob"
                  onChange={(e) => { applyCoarse(Number(e.target.value) - sim.current.stageZ); notePointer(true); }} />
              </div>
              <div className="micro-knobs">
                <div>
                  <span>COARSE KNOB</span>
                  <div className="micro-knobpair">
                    <button type="button" onClick={() => { applyCoarse(COARSE_STEP); notePointer(true); }} aria-label="Raise the stage with the coarse knob">▲ raise</button>
                    <button type="button" onClick={() => { applyCoarse(-COARSE_STEP); notePointer(true); }} aria-label="Lower the stage with the coarse knob">▼ lower</button>
                  </div>
                </div>
                <div>
                  <span>FINE KNOB</span>
                  <div className="micro-knobpair">
                    <button type="button" onClick={() => { applyFine(FINE_STEP); notePointer(true); }} aria-label="Raise the stage with the fine knob">▲ raise</button>
                    <button type="button" onClick={() => { applyFine(-FINE_STEP); notePointer(true); }} aria-label="Lower the stage with the fine knob">▼ lower</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="micro-block">
              <span className="micro-block-title">SLIDE BOX · DRAG ONTO THE STAGE</span>
              <div className="micro-slides" data-nudge="slides">
                {SLIDES.map((sl) => {
                  const onStage = ui.slideOn === sl.id;
                  return (
                    <button
                      key={sl.id}
                      type="button"
                      className={`micro-slidebtn${onStage ? ' on-stage' : ''}${onStage && ui.cracked ? ' cracked' : ''}`}
                      onClick={() => { placeSlide(sl.id); notePointer(true); }}
                    >
                      <i style={{ background: sl.chip }} />
                      <span>{sl.name}</span>
                      <small>{onStage ? (ui.cracked ? 'on stage · CRACKED — press to replace' : 'on the stage ✓') : sl.blurb}</small>
                    </button>
                  );
                })}
              </div>
              <div className="micro-toggles">
                <button type="button" className={ui.graticule ? 'on' : ''} data-nudge="graticule" onClick={() => { toggleGraticule(); notePointer(true); }} aria-pressed={ui.graticule}>
                  ⌗ Graticule {ui.graticule ? 'on' : 'off'}
                </button>
                <button type="button" onClick={() => { centerSpecimen(); notePointer(true); }}>⊕ Center specimen</button>
                <button type="button" onClick={() => { dropCenterTick(); notePointer(true); }} disabled={!ui.graticule}>✎ Drop measuring tick</button>
              </div>
              <div className="lab-slider-row">
                <label><span>Lamp brightness</span><strong>{Math.round(ui.brightness * 100)}%</strong></label>
                <input type="range" min="0" max="1" step="0.05" value={ui.brightness}
                  aria-label="Illuminator brightness"
                  onChange={(e) => { setBrightness(Number(e.target.value)); notePointer(true); }} />
              </div>
              <div className="lab-slider-row">
                <label><span>Diaphragm opening</span><strong>{Math.round(ui.iris * 100)}%</strong></label>
                <input type="range" min="0" max="1" step="0.05" value={ui.iris}
                  aria-label="Condenser diaphragm opening"
                  onChange={(e) => { setIris(Number(e.target.value)); notePointer(true); }} />
              </div>
            </div>
          </div>
          <div className="micro-chiprow">
            <div className="micro-chip">
              <span>IMAGE SHARPNESS</span>
              <strong className={ui.sharp01 > 0.75 ? 'sharp' : ''}>{ui.slideOn ? `${pct}%` : '—'}</strong>
              <div className="micro-track"><span style={{ width: `${pct}%` }} /></div>
              <small>{!ui.slideOn ? 'no slide on the stage' : ui.cracked ? 'cover slip cracked' : ui.blur < 9 ? `defocus ≈ ${Math.round(ui.focusErr ?? 0)} µm of stage travel` : 'far out of focus'}</small>
            </div>
            <div className="micro-chip">
              <span>GRATICULE · {objNow.umPerDiv} µm / DIVISION</span>
              <strong>{ui.lastUm !== null ? `${ui.lastUm} µm` : ui.tickPending ? 'tick 1 set' : '—'}</strong>
              <div className="micro-track"><span style={{ width: `${Math.min(100, (ui.lastUm ?? 0) / 3)}%` }} /></div>
              <small>{ui.tickPending ? 'click the far end of the same cell' : `${onionRows.length}/5 onion · ${cheekRows.length}/5 cheek measured`}</small>
            </div>
            <button className="action-button" type="button" data-nudge="assist" onClick={runAssist} disabled={!assist}>
              <span className="dispense-icon" aria-hidden="true">✦</span>
              <span>{assist ? assist.label : 'Bench is ready'}</span>
              <small>{assist ? assist.small : 'your hands, your experiment'}</small>
            </button>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Coarse at low power, fine at high power — that is the whole focusing creed. At 40× the depth of field is hairline-thin and the barrel nearly touches the glass: crank the coarse knob there and you will hear the lesson. The box always holds a fresh slide.</p></div>
          <div className="micro-conclude" data-nudge="conclude">
            <span>COMPARISON · PLANT CELLS vs ANIMAL CELLS</span>
            {!conclusionOpen ? (
              <small>
                {`unlocks when you have spotted all five differences (${spotsCount}/5) and measured five cells on each slide (${onionRows.length}/5 onion · ${cheekRows.length}/5 cheek)`}
              </small>
            ) : (
              <>
                {QUESTIONS.map((q, qi) => (
                  <div className="mic-q" key={q.q}>
                    <strong>{`${qi + 1}. ${q.q}`}</strong>
                    <div className="mic-opts">
                      {q.opts.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className={answers[qi] === o.id ? 'correct' : ''}
                          disabled={concluded}
                          onClick={() => { answerConclusion(qi, o.id); }}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <small>{concluded ? 'concluded: cell wall, large vacuole and the three-times size gap — three honest differences' : 'wrong picks warn and wait — look through the ocular again before retrying'}</small>
              </>
            )}
          </div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Ocular readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Image sharpness (live)</span>
            <strong>{ui.slideOn ? <>{pct}<small>%</small></> : <small style={{ fontSize: 13 }}>place a slide to begin</small>}</strong>
            <div className="reading-track"><span style={{ width: `${pct}%` }} /></div>
            <div className="reading-scale"><span>blurry</span><span>razor sharp</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Objective</span><strong>{objNow.short.split(' ')[0]}</strong></div>
            <div><span>Total magnification</span><strong>{objNow.mag * 10}×</strong></div>
            <div><span>Field of view</span><strong>{objNow.fov} µm</strong></div>
            <div><span>Graticule</span><strong>{objNow.umPerDiv} µm/div</strong></div>
            <div><span>Stage height</span><strong>{Math.round(ui.stageZ * STAGE_TRAVEL_UM)} µm</strong></div>
            <div><span>Focus error</span><strong>{ui.focusErr !== null ? `${Math.round(ui.focusErr)} µm` : '—'}</strong></div>
          </div>
          <div className="mic-status">
            <div><span>Slide on stage</span><strong>{slideName ? (ui.cracked ? `${slideName} · cracked` : slideName) : 'none'}</strong></div>
            <div><span>Illumination</span><strong>{`${Math.round(ui.brightness * 100)}% lamp · ${Math.round(ui.iris * 100)}% iris`}</strong></div>
            <div><span>Differences spotted</span><strong>{spotsCount}/5</strong></div>
            <div><span>Cells measured</span><strong>{`${onionRows.length} onion · ${cheekRows.length} cheek`}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the onion slide from the box onto the stage — or press its button below the scene.</li>
              <li>Click the red 4× objective, then drag the big coarse knob until the cells are almost sharp.</li>
              <li>Finish with the small fine knob, click the blue 40× objective and refocus GENTLY — fine knob only.</li>
              <li>Swap in the letter-e slide and focus it: the printed e stands rotated a half-turn. Pan it against your hand.</li>
              <li>Switch on the graticule and click both ends of five onion cells — 10× fits a whole cell across about five divisions.</li>
              <li>Place the cheek slide, measure five of its cells, then answer the three comparison questions.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Coarse only at low power. At 40× the objective rides a hairline from the cover slip, so the fine knob (or the arrow keys) does the last word. If you crack a slip, nothing is lost but the slide — the box always holds a fresh one.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your cell measurements</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Switch on the graticule, focus sharp, then click both ends of a cell — each pair lands here as one row with ±2% reading jitter.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Slide</th><th>Objective</th><th>Cell length</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{SLIDES.find((x) => x.id === r.slide)!.name}</td>
                      <td>{r.mag}×</td>
                      <td>{r.um} µm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {summary.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Summary by slide</h3>
                <table className="trial-table">
                  <thead><tr><th>Slide</th><th>Objective</th><th>Cells measured</th><th>Mean cell length</th></tr></thead>
                  <tbody>
                    {summary.map((r) => (
                      <tr key={`${r.slide}-${r.mag}`}>
                        <td>{SLIDES.find((x) => x.id === r.slide)!.name}</td>
                        <td>{r.mag}×</td>
                        <td>{r.n}</td>
                        <td>{r.mean.toFixed(0)} µm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <h3 style={{ marginTop: 16 }}>Plant vs animal — mean cell size</h3>
            <div className="mic-chart-legend">
              <span><i style={{ background: '#c98f3d' }} />Onion (plant)</span>
              <span><i style={{ background: '#8fb7dd' }} />Cheek (animal)</span>
            </div>
            <SizeBarChart onion={onionMean} cheek={cheekMean} />
            <p className="observation-note">Dashed bands mark the typical ranges — onion epidermis 150–250 µm, cheek epithelial cells 50–80 µm. Means are true means of your own five clicks; each reading carries ±2% graticule jitter, exactly as honest as reading a real eyepiece scale.</p>
            <h3 style={{ marginTop: 16 }}>Differences spotted</h3>
            <div className="mic-spots">
              {SPOTS.map((sp) => (
                <div key={sp.key} className={`mic-spot${ui.spots[sp.key] ? ' done' : ''}`}>
                  <i aria-hidden="true">{ui.spots[sp.key] ? '✓' : '○'}</i>
                  <div>
                    <strong>{sp.title}</strong>
                    <span>{sp.detail}</span>
                  </div>
                  <em>{sp.tag}</em>
                </div>
              ))}
            </div>
            <p className="observation-note">
              {`Tally — plant-only features spotted: ${(ui.spots.wall ? 1 : 0) + (ui.spots.vac ? 1 : 0) + (ui.spots.brick ? 1 : 0)} · animal-look features: ${ui.spots.irregular ? 1 : 0} · shared features seen: ${ui.spots.nuclei ? 1 : 0}. All five unlock the comparison conclusion.`}
            </p>
          </>
        ),
        theory: (
          <>
            <h3>Why the image is inverted</h3>
            <p>A compound microscope magnifies twice. The objective lens forms a real, magnified image of the specimen inside the tube — and that first image is already upside down and left-right reversed, because a single converging lens flips the image it projects. The eyepiece then acts as a magnifying glass looking at that intermediate image, adding plenty of size but no further flipping. What reaches your eye is the specimen rotated a full half-turn: the letter e arrives as ǝ.</p>
            <p>The same inversion explains a famous touch of stage craft — when you nudge the slide to the right, the image travels to the left. Pan this lab’s view and watch it drift against your hand: the mechanical stage moves the specimen, the optics rotate the result twice over.</p>
            <h3>Coarse, fine and the hairline depth of field</h3>
            <p>Focusing is hunting for one exact separation between specimen and objective. The coarse knob sweeps the whole range in a few turns; the fine knob creeps through a sliver of it. Which one you should use depends on the objective:</p>
            <div className="equation">visible blur ∝ |stage − focus| × magnification²</div>
            <p>High-power objectives gather light at steeper angles (larger numerical aperture), which shrinks the depth of field to a few micrometres — in this lab the sharp window at 4× spans about 200 µm of stage travel, while at 40× it is barely 30 µm. That is why the ritual exists: coarse-focus at low power where mistakes are cheap, then switch to 40× and finish with the fine knob. The 40× barrel also stops a hair’s breadth above the cover slip, so cranking the coarse knob there can end with a crack — the one sound every careful microscopist remembers.</p>
            <h3>Plant cells vs animal cells</h3>
            <p>The onion epidermis is a single transparent sheet of brick-shaped cells. Iodine stain darkens the cellulose walls, so every cell wears thick double outlines, the rows run in a tidy running bond, and a large central vacuole crowds the cytoplasm — and the small nucleus — against those walls. The vacuole stores water and keeps the cell firm.</p>
            <p>Cheek epithelial cells were scraped, smeared and stained with methylene blue. They are irregular flattened blobs scattered across the field with no walls between them — only a thin cell membrane — and the dark nucleus dominates each one. Both cell types share nucleus, cytoplasm and membrane; the wall, the big vacuole and the size are the honest differences, roughly 150–250 µm long for onion against 50–80 µm for cheek.</p>
            <h3>Measuring with an eyepiece graticule</h3>
            <p>The graticule is a ruled glass disc inside the eyepiece, so its scale sits in the image plane and divides whatever the current objective shows. It is calibrated per objective: one division spans 100 µm at 4×, 40 µm at 10× and 10 µm at 40× here, because the field of view itself shrinks from 5000 µm to 500 µm across the same three powers. Click both ends of a cell and the lab converts the tick separation into micrometres — with a ±2% reading jitter, because real eyes reading real divisions are never perfectly exact.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations') setSawObs(true); }}
    />
  );
}

// ---- observations-tab bar chart (text allowed here, mirroring Plot.tsx) ----

function drawTickMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#e8632a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.stroke();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function SizeBarChart(props: { onion: number | null; cheek: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, rect.width);
      const h = 200;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const pad = { l: 44, r: 14, t: 16, b: 34 };
      const iw = w - pad.l - pad.r;
      const ih = h - pad.t - pad.b;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(pad.l, pad.t, iw, ih);

      const bars = [
        { label: 'Onion (plant)', value: props.onion, color: '#c98f3d', range: [150, 250] as const },
        { label: 'Cheek (animal)', value: props.cheek, color: '#8fb7dd', range: [50, 80] as const },
      ];
      const maxV = Math.max(280, ...bars.map((b) => b.value ?? 0));
      const sy = (v: number) => pad.t + ih - (clamp(v, 0, maxV) / maxV) * ih;

      // grid + ticks
      ctx.strokeStyle = '#e8edf2';
      ctx.lineWidth = 1;
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.fillStyle = '#9aa4b1';
      for (let i = 0; i <= 4; i += 1) {
        const y = pad.t + (ih * (4 - i)) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + iw, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round((maxV * i) / 4)}`, pad.l - 6, y + 3);
      }
      // axes
      ctx.strokeStyle = '#c5cdd6';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ih);
      ctx.lineTo(pad.l + iw, pad.t + ih);
      ctx.stroke();

      const bw = Math.min(84, iw / 3);
      bars.forEach((b, i) => {
        const cx = pad.l + (iw * (i + 0.5)) / 2;
        // typical range band
        ctx.fillStyle = 'rgba(139,151,165,0.14)';
        ctx.fillRect(cx - bw / 2, sy(b.range[1]), bw, sy(b.range[0]) - sy(b.range[1]));
        ctx.strokeStyle = 'rgba(139,151,165,0.5)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - bw / 2, sy(b.range[1]), bw, sy(b.range[0]) - sy(b.range[1]));
        ctx.setLineDash([]);
        // the student's mean
        if (b.value !== null && b.value > 0) {
          ctx.fillStyle = b.color;
          ctx.fillRect(cx - bw / 2, sy(b.value), bw, pad.t + ih - sy(b.value));
          ctx.strokeStyle = 'rgba(23,35,52,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - bw / 2, sy(b.value), bw, pad.t + ih - sy(b.value));
          ctx.fillStyle = '#172334';
          ctx.textAlign = 'center';
          ctx.font = 'bold 10px "DM Sans", sans-serif';
          ctx.fillText(`${Math.round(b.value)} µm`, cx, sy(b.value) - 6);
        }
        // x label
        ctx.fillStyle = '#7a8795';
        ctx.textAlign = 'center';
        ctx.font = '9px "DM Sans", sans-serif';
        ctx.fillText(b.label, cx, h - pad.b + 14);
      });

      // axis title
      ctx.save();
      ctx.translate(11, pad.t + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#7a8795';
      ctx.textAlign = 'center';
      ctx.fillText('mean cell length (µm)', 0, 0);
      ctx.restore();
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [props.onion, props.cheek]);

  return <canvas ref={canvasRef} className="lab-plot" style={{ width: '100%', height: 200 }} aria-label="Bar chart comparing mean onion and cheek cell lengths in micrometres" />;
}
