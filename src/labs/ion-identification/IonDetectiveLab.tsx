import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './ion-identification.css';

/**
 * Ion detective — qualitative analysis bench for the Soren Lab Engine.
 *
 * Three numbered unknown salt solutions (plus one known carbonate reference)
 * wait in a rack. The student drags real bench tools onto a chosen tube:
 * the platinum loop (dip → roast in the Bunsen flame → flame colour), four
 * dropper bottles (NaOH, dilute HCl, BaCl₂, AgNO₃/HNO₃) and a damp red
 * litmus strip for the ammonium gas test. Every completed test writes a
 * row in an evidence table (test · observation · inference); when the
 * deduction is safe, the student names the cation AND anion from dropdowns
 * and closes the case. Wrong calls get a coach hint pointing at the
 * strongest unused evidence — never the answer.
 */

// ------------------------------------------------------------------ data ---

type CationId = 'Na' | 'K' | 'Ca' | 'Cu' | 'Fe2' | 'Fe3' | 'NH4';
type AnionId = 'Cl' | 'SO4' | 'CO3';
type TestId = 'flame' | 'naoh' | 'litmus' | 'hcl' | 'bacl2' | 'agno3';

interface FlameInfo {
  colour: string;
  name: string;
  dur: number;
  persistent?: boolean;
  fleeting?: boolean;
  cobalt?: boolean;
}

interface CationDef {
  label: string;
  flame: FlameInfo | null;
  naohPpt: { colour: string; name: string } | null;
}

const CATION_INFO: Record<CationId, CationDef> = {
  Na: {
    label: 'Na⁺',
    flame: { colour: '#f2c53d', name: 'golden-yellow', dur: 6.0, persistent: true },
    naohPpt: null,
  },
  K: {
    label: 'K⁺',
    flame: { colour: '#b48ae0', name: 'lilac', dur: 1.35, fleeting: true, cobalt: true },
    naohPpt: null,
  },
  Ca: {
    label: 'Ca²⁺',
    flame: { colour: '#c9583a', name: 'brick-red', dur: 3.2 },
    naohPpt: null,
  },
  Cu: {
    label: 'Cu²⁺',
    flame: { colour: '#2fa8a0', name: 'blue-green', dur: 3.6 },
    naohPpt: { colour: '#a9d4e8', name: 'light-blue' },
  },
  Fe2: {
    label: 'Fe²⁺',
    flame: null,
    naohPpt: { colour: '#7d9a6e', name: 'dirty-green' },
  },
  Fe3: {
    label: 'Fe³⁺',
    flame: null,
    naohPpt: { colour: '#a9683c', name: 'rust-brown' },
  },
  NH4: {
    label: 'NH₄⁺',
    flame: null,
    naohPpt: null,
  },
};

const ANION_LABEL: Record<AnionId, string> = {
  Cl: 'Cl⁻',
  SO4: 'SO₄²⁻',
  CO3: 'CO₃²⁻',
};

interface SaltDef {
  id: string;
  name: string;
  cation: CationId;
  anion: AnionId;
  tint: string; // colour of the aqueous solution in the tube
}

const SALT_POOL: SaltDef[] = [
  { id: 'nacl', name: 'sodium chloride', cation: 'Na', anion: 'Cl', tint: '#edf3f8' },
  { id: 'kcl', name: 'potassium chloride', cation: 'K', anion: 'Cl', tint: '#eff4f9' },
  { id: 'cacl2', name: 'calcium chloride', cation: 'Ca', anion: 'Cl', tint: '#eaf1f7' },
  { id: 'cuso4', name: 'copper(II) sulfate', cation: 'Cu', anion: 'SO4', tint: '#a9d7ee' },
  { id: 'feso4', name: 'iron(II) sulfate', cation: 'Fe2', anion: 'SO4', tint: '#bcd9c0' },
  { id: 'fecl3', name: 'iron(III) chloride', cation: 'Fe3', anion: 'Cl', tint: '#e5c387' },
  { id: 'nh4cl', name: 'ammonium chloride', cation: 'NH4', anion: 'Cl', tint: '#f0f5f9' },
];

const REFERENCE_SALT: SaltDef = {
  id: 'na2co3',
  name: 'sodium carbonate (reference)',
  cation: 'Na',
  anion: 'CO3',
  tint: '#eef3f8',
};

const LETTERS = ['A', 'B', 'C', 'R'];
const TAPES = ['#e2a23d', '#3aa6a0', '#8f6bbf', '#5b6b7d'];

interface ReagentDef {
  id: 'naoh' | 'hcl' | 'bacl2' | 'agno3';
  label: string;
  sub: string;
  cap: string;
  liquid: string;
}

const REAGENTS: ReagentDef[] = [
  { id: 'naoh', label: 'NaOH', sub: 'sodium hydroxide, dropwise', cap: '#3b5b7e', liquid: '#eaf0f6' },
  { id: 'hcl', label: 'HCl', sub: 'dilute hydrochloric acid, warmed', cap: '#2e8577', liquid: '#e7f4ee' },
  { id: 'bacl2', label: 'BaCl₂', sub: 'barium chloride solution', cap: '#8d99a6', liquid: '#eff3f6' },
  { id: 'agno3', label: 'AgNO₃', sub: 'silver nitrate + dilute HNO₃', cap: '#6f5d8f', liquid: '#f1eef7' },
];

const TEST_LABEL: Record<TestId, string> = {
  flame: 'Flame test (Pt loop)',
  naoh: 'NaOH, dropwise',
  litmus: 'Damp red litmus at the mouth',
  hcl: 'Dilute HCl, warmed',
  bacl2: 'BaCl₂ solution',
  agno3: 'AgNO₃ acidified with HNO₃',
};

const FLAME_TOAST: Record<CationId, string> = {
  Na: 'Persistent golden-yellow — sodium’s colour is hard to miss and harder to wash off a loop.',
  K: 'A fleeting lilac, already fading — the cobalt glass slid in to filter any sodium glare.',
  Ca: 'Brick-red — calcium’s signature in a hot flame.',
  Cu: 'Blue-green — copper speaks in colour.',
  Fe2: 'No characteristic colour — the flame stayed blue. That silence is evidence too.',
  Fe3: 'No characteristic colour — the flame stayed blue. That silence is evidence too.',
  NH4: 'No characteristic colour — the flame stayed blue. That silence is evidence too.',
};

interface TestOutcome {
  observation: string;
  inference: string;
  swatch: string | null;
  ppt: boolean;
}

/** The chemistry engine: what the student observes for each test on each salt. */
function outcomeFor(salt: SaltDef, test: TestId): TestOutcome {
  const cat = CATION_INFO[salt.cation];
  switch (test) {
    case 'flame': {
      const f = cat.flame;
      if (!f) {
        return {
          observation: 'no characteristic flame colour — the flame stays blue',
          inference: 'not Na⁺, K⁺, Ca²⁺ or Cu²⁺ — Fe²⁺, Fe³⁺ or NH₄⁺ more likely',
          swatch: null,
          ppt: false,
        };
      }
      const qualifier = f.persistent ? ' — persistent' : f.fleeting ? ' — fleeting, gone in a blink' : '';
      const cobalt = f.cobalt ? ' (viewed through cobalt glass)' : '';
      return {
        observation: `${f.name} flame${qualifier}${cobalt}`,
        inference: `${cat.label} present`,
        swatch: f.colour,
        ppt: false,
      };
    }
    case 'naoh': {
      const p = cat.naohPpt;
      if (p) {
        return {
          observation: `${p.name} precipitate forms dropwise and settles`,
          inference: `${cat.label} present — an insoluble hydroxide`,
          swatch: p.colour,
          ppt: true,
        };
      }
      if (salt.cation === 'NH4') {
        return {
          observation: 'no precipitate — warm it and test the gas',
          inference: 'not Cu²⁺/Fe²⁺/Fe³⁺; if NH₄⁺ is there, NaOH + warming releases ammonia',
          swatch: null,
          ppt: false,
        };
      }
      return { observation: 'no precipitate', inference: 'not Cu²⁺, Fe²⁺ or Fe³⁺', swatch: null, ppt: false };
    }
    case 'litmus': {
      if (salt.cation === 'NH4') {
        return {
          observation: 'damp red litmus at the mouth turned blue',
          inference: 'NH₃ released on warming with NaOH — NH₄⁺ present',
          swatch: '#3556c9',
          ppt: false,
        };
      }
      return {
        observation: 'damp red litmus stayed red',
        inference: 'no ammonia on warming — NH₄⁺ absent',
        swatch: '#d1524a',
        ppt: false,
      };
    }
    case 'hcl': {
      if (salt.anion === 'CO3') {
        return {
          observation: 'brisk effervescence; the gas turns lime water milky',
          inference: 'CO₃²⁻ present',
          swatch: null,
          ppt: false,
        };
      }
      return { observation: 'no effervescence on warming', inference: 'CO₃²⁻ absent', swatch: null, ppt: false };
    }
    case 'bacl2': {
      if (salt.anion === 'SO4') {
        return { observation: 'dense white precipitate', inference: 'SO₄²⁻ present', swatch: '#f2f4f6', ppt: true };
      }
      if (salt.anion === 'CO3') {
        return {
          observation: 'white precipitate — BaCO₃ forms too; acidify before trusting Ba²⁺',
          inference: 'SO₄²⁻ or CO₃²⁻ — settle it with dilute HCl first',
          swatch: '#f2f4f6',
          ppt: true,
        };
      }
      return { observation: 'no precipitate', inference: 'SO₄²⁻ absent', swatch: null, ppt: false };
    }
    case 'agno3': {
      if (salt.anion === 'Cl') {
        return {
          observation: 'curdy white precipitate that greys in the light',
          inference: 'Cl⁻ present',
          swatch: '#f2f4f6',
          ppt: true,
        };
      }
      if (salt.anion === 'CO3') {
        return {
          observation: 'brief fizz (the HNO₃ destroys carbonate), then no curdy precipitate',
          inference: 'Cl⁻ absent',
          swatch: null,
          ppt: false,
        };
      }
      return { observation: 'no curdy precipitate', inference: 'Cl⁻ absent', swatch: null, ppt: false };
    }
  }
  return { observation: '', inference: '', swatch: null, ppt: false };
}

/** Deal a fresh session: 3 distinct unknowns from the pool + the known reference. */
function drawSession(): SaltDef[] {
  const pool = [...SALT_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...pool.slice(0, 3), REFERENCE_SALT];
}

// ------------------------------------------------------------------ types ---

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

interface TubeChem {
  x: number;
  y: number;
  naohAdded: boolean;
  ppt: { colour: Rgb; t: number; curd: boolean; darken: number } | null;
  fizzT: number;
  vialT: number;
  milky: number;
  warm: number;
  solved: boolean;
}

interface AutoAnim {
  sample: number;
  phase: number;
  t: number;
  fromX: number;
  fromY: number;
}

interface Tool {
  x: number;
  y: number;
  hx: number;
  hy: number;
  held: boolean;
  grabDX: number;
  grabDY: number;
  auto: AutoAnim | null;
}

interface LoopTool extends Tool {
  loaded: boolean;
  loadTint: string;
}

interface LitmusTool extends Tool {
  blue: number;
}

interface Sim {
  time: number;
  uiAcc: number;
  layout: Layout;
  layoutW: number;
  layoutH: number;
  tubes: TubeChem[];
  active: number;
  bottles: (Tool & { tip: number; dripT: number; dripCount: number })[];
  loop: LoopTool;
  litmus: LitmusTool;
  flameOn: boolean;
  flameColour: { rgb: Rgb | null; t: number; dur: number; cobalt: boolean; persistent: boolean } | null;
  pendingFlash: string | null;
  drops: { x: number; y: number; vy: number; sample: number; reagent: TestId }[];
  bubbles: { x: number; y: number; vy: number; r: number; seed: number; sample: number }[];
  ripples: { x: number; y: number; r: number; a: number }[];
  fizzAcc: number;
  lastPop: number;
  slideAt: number;
  pending: { sample: number; test: TestId }[];
}

interface UiSnap {
  active: number;
  flameOn: boolean;
  busy: string | null;
  held: boolean;
  fizzing: boolean;
  pptForming: boolean;
}

interface EvidenceRow {
  key: string;
  sample: number;
  test: TestId;
  observation: string;
  inference: string;
  swatch: string | null;
  ppt: boolean;
}

interface Guess {
  cation: string;
  anion: string;
}

// ----------------------------------------------------------------- layout ---

interface Layout {
  w: number;
  h: number;
  tubeW: number;
  tubeH: number;
  tubeXs: number[];
  tubeY: number;
  benchY: number;
  burnerX: number;
  barrelTop: number;
  shelf: 'side' | 'top';
  bottleXs: number[];
  bottleYs: number[];
  loopHome: { x: number; y: number };
  litmusHome: { x: number; y: number };
}

function makeLayout(w: number, h: number): Layout {
  const benchY = h - 24;
  const tubeW = clamp(w * 0.034, 18, 27);
  const tubeH = clamp(h * 0.2, 60, 96);
  const tubeXs = [0, 1, 2, 3].map((i) => 28 + tubeW / 2 + i * (tubeW + 13));
  const tubeY = benchY - 10 - tubeH / 2;
  const burnerX = w >= 620 ? w * 0.5 : w - 92;
  const barrelTop = benchY - 66;
  const shelf: 'side' | 'top' = w >= 620 ? 'side' : 'top';
  const bottleXs = shelf === 'side'
    ? [0, 1, 2, 3].map(() => w - 38)
    : [0, 1, 2, 3].map((i) => 44 + i * ((w - 88) / 3));
  const bottleYs = shelf === 'side' ? [58, 126, 194, 262] : [54, 54, 54, 54];
  return {
    w, h, tubeW, tubeH, tubeXs, tubeY, benchY, burnerX, barrelTop,
    shelf, bottleXs, bottleYs,
    loopHome: { x: burnerX - 66, y: benchY - 46 },
    litmusHome: { x: burnerX + 64, y: benchY - 42 },
  };
}

function freshTubes(L: Layout): TubeChem[] {
  return LETTERS.map((_, i) => ({
    x: L.tubeXs[i],
    y: L.tubeY,
    naohAdded: false,
    ppt: null,
    fizzT: 0,
    vialT: 0,
    milky: 0,
    warm: 0,
    solved: false,
  }));
}

function freshSim(): Sim {
  const L = makeLayout(800, 500);
  const bottles = REAGENTS.map((_, i) => ({
    x: L.bottleXs[i],
    y: L.bottleYs[i],
    hx: L.bottleXs[i],
    hy: L.bottleYs[i],
    held: false, grabDX: 0, grabDY: 0, auto: null,
    tip: 0, dripT: 0, dripCount: 0,
  }));
  return {
    time: 0, uiAcc: 0,
    layout: L, layoutW: 0, layoutH: 0,
    tubes: freshTubes(L),
    active: 0,
    bottles,
    loop: { x: L.loopHome.x, y: L.loopHome.y, hx: L.loopHome.x, hy: L.loopHome.y, held: false, grabDX: 0, grabDY: 0, auto: null, loaded: false, loadTint: '#eef3f8' },
    litmus: { x: L.litmusHome.x, y: L.litmusHome.y, hx: L.litmusHome.x, hy: L.litmusHome.y, held: false, grabDX: 0, grabDY: 0, auto: null, blue: 0 },
    flameOn: false,
    flameColour: null,
    pendingFlash: null,
    drops: [], bubbles: [], ripples: [],
    fizzAcc: 0, lastPop: 0, slideAt: 0,
    pending: [],
  };
}

function relayout(s: Sim): void {
  s.layout = makeLayout(s.layoutW, s.layoutH);
  const L = s.layout;
  s.tubes.forEach((tb, i) => {
    tb.x = L.tubeXs[i];
    tb.y = L.tubeY;
  });
  s.bottles.forEach((b, i) => {
    b.hx = L.bottleXs[i];
    b.hy = L.bottleYs[i];
    if (!b.held && !b.auto) { b.x = b.hx; b.y = b.hy; }
  });
  s.loop.hx = L.loopHome.x; s.loop.hy = L.loopHome.y;
  s.litmus.hx = L.litmusHome.x; s.litmus.hy = L.litmusHome.y;
}

const surfYOf = (s: Sim, i: number) => s.tubes[i].y - s.layout.tubeH / 2 + s.layout.tubeH * 0.24;

function tubeAt(s: Sim, x: number, y: number): number {
  const L = s.layout;
  for (let i = 0; i < s.tubes.length; i += 1) {
    const tb = s.tubes[i];
    if (Math.abs(x - tb.x) < L.tubeW / 2 + 14 && Math.abs(y - tb.y) < L.tubeH / 2 + 16) return i;
  }
  return -1;
}

function burnerAt(s: Sim, x: number, y: number): boolean {
  const L = s.layout;
  return Math.abs(x - L.burnerX) < 30 && y > L.barrelTop - 46 && y < L.benchY + 6;
}

function anyToolBusy(s: Sim): boolean {
  if (s.loop.held || s.loop.auto || s.litmus.held || s.litmus.auto) return true;
  return s.bottles.some((b) => b.held || b.auto);
}

/** True when the tube already holds this very precipitate — later drips of
 *  the same reagent must keep it accumulating, not restart its settling. */
function isSamePpt(p: TubeChem['ppt'], colour: string, curd: boolean): boolean {
  if (!p || p.curd !== curd) return false;
  const c = hex2rgb(colour);
  return p.colour[0] === c[0] && p.colour[1] === c[1] && p.colour[2] === c[2];
}

/** Apply a reagent's visible chemistry the moment its drop lands. */
function applyReagent(s: Sim, sample: number, reagent: TestId, salt: SaltDef): void {
  const tube = s.tubes[sample];
  const cat = CATION_INFO[salt.cation];
  switch (reagent) {
    case 'naoh':
      tube.naohAdded = true;
      if (cat.naohPpt && !isSamePpt(tube.ppt, cat.naohPpt.colour, false)) {
        tube.ppt = { colour: hex2rgb(cat.naohPpt.colour), t: 0, curd: false, darken: 0 };
      }
      break;
    case 'hcl':
      if (salt.anion === 'CO3') { tube.fizzT = 2.6; tube.vialT = 9; }
      break;
    case 'bacl2':
      if ((salt.anion === 'SO4' || salt.anion === 'CO3') && !isSamePpt(tube.ppt, '#eef1f4', false)) {
        tube.ppt = { colour: hex2rgb('#eef1f4'), t: 0, curd: false, darken: 0 };
      }
      break;
    case 'agno3':
      if (salt.anion === 'Cl' && !isSamePpt(tube.ppt, '#f2f4f6', true)) {
        tube.ppt = { colour: hex2rgb('#f2f4f6'), t: 0, curd: true, darken: 0 };
      } else if (salt.anion === 'CO3') {
        tube.fizzT = Math.max(tube.fizzT, 0.8);
      }
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------- canvas helpers ---

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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

function drawBench(ctx: CanvasRenderingContext2D, L: Layout): void {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, '#eef2f6');
  g.addColorStop(1, '#e2e8ee');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.w, L.h);
  // back wall seam
  ctx.strokeStyle = '#d3dbe3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, L.benchY - 128);
  ctx.lineTo(L.w, L.benchY - 128);
  ctx.stroke();
  // bench surface
  ctx.fillStyle = '#cfd8e0';
  ctx.fillRect(0, L.benchY, L.w, 3);
  ctx.fillStyle = '#dde4ea';
  ctx.fillRect(0, L.benchY + 3, L.w, L.h - L.benchY - 3);
  ctx.strokeStyle = '#c2ccd6';
  ctx.lineWidth = 1;
  for (let x = 10; x < L.w; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, L.benchY + 4);
    ctx.lineTo(x - 12, L.h - 6);
    ctx.stroke();
  }
}

function drawRack(ctx: CanvasRenderingContext2D, L: Layout): void {
  const x0 = L.tubeXs[0] - L.tubeW / 2 - 10;
  const x1 = L.tubeXs[3] + L.tubeW / 2 + 10;
  // base board
  const g = ctx.createLinearGradient(0, L.benchY - 16, 0, L.benchY);
  g.addColorStop(0, '#e2d4b2');
  g.addColorStop(1, '#c9b48c');
  ctx.fillStyle = g;
  roundRect(ctx, x0, L.benchY - 16, x1 - x0, 15, 4);
  ctx.fill();
  ctx.strokeStyle = '#a98f66';
  ctx.lineWidth = 1;
  ctx.stroke();
  // back rail behind the tube tape bands
  ctx.fillStyle = '#d8c9a4';
  roundRect(ctx, x0, L.tubeY - L.tubeH / 2 + 2, x1 - x0, 10, 4);
  ctx.fill();
  ctx.strokeStyle = '#a98f66';
  ctx.stroke();
  // holes in the rail
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = '#4a3a26';
    ctx.beginPath();
    ctx.ellipse(L.tubeXs[i], L.tubeY - L.tubeH / 2 + 7, L.tubeW * 0.62, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // brass screws
  ctx.fillStyle = '#d9a441';
  for (const sx of [x0 + 8, x1 - 8]) {
    ctx.beginPath();
    ctx.arc(sx, L.benchY - 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShelf(ctx: CanvasRenderingContext2D, L: Layout): void {
  for (let i = 0; i < 4; i += 1) {
    const bx = L.bottleXs[i];
    const by = L.bottleYs[i];
    const boardY = by + 24;
    const g = ctx.createLinearGradient(0, boardY, 0, boardY + 8);
    g.addColorStop(0, '#e2d4b2');
    g.addColorStop(1, '#c9b48c');
    ctx.fillStyle = g;
    roundRect(ctx, bx - 22, boardY, 44, 8, 3);
    ctx.fill();
    ctx.strokeStyle = '#a98f66';
    ctx.lineWidth = 1;
    ctx.stroke();
    // wall bracket
    ctx.strokeStyle = '#9aa7b4';
    ctx.beginPath();
    ctx.moveTo(bx - 12, boardY + 8);
    ctx.lineTo(bx - 4, boardY + 18);
    ctx.moveTo(bx + 12, boardY + 8);
    ctx.lineTo(bx + 4, boardY + 18);
    ctx.stroke();
  }
}

function drawTube(
  ctx: CanvasRenderingContext2D,
  tube: TubeChem,
  salt: SaltDef,
  tape: string,
  L: Layout,
  t: number,
  active: boolean,
  letterIdx: number,
): void {
  const tw = L.tubeW;
  const th = L.tubeH;
  const surf = -th / 2 + th * 0.24;
  ctx.save();
  ctx.translate(tube.x, tube.y);

  // soft shadow
  ctx.fillStyle = 'rgba(23,35,52,0.12)';
  ctx.beginPath();
  ctx.ellipse(3, th / 2 + 8, tw * 0.8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // active-sample halo
  if (active) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.strokeStyle = `rgba(249,115,22,${0.35 + pulse * 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, th / 2 + 5, tw / 2 + 8, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // liquid + precipitate (clipped inside the glass)
  tubeBodyPath(ctx, tw, th);
  ctx.save();
  ctx.clip();
  const base = hex2rgb(salt.tint);
  const lg = ctx.createLinearGradient(0, surf, 0, th / 2);
  lg.addColorStop(0, rgbStr(mixRgb(base, [255, 255, 255], 0.25)));
  lg.addColorStop(1, rgbStr(mixRgb(base, [0, 0, 0], 0.08)));
  ctx.fillStyle = lg;
  ctx.fillRect(-tw / 2, surf, tw, th);
  // precipitate: settling specks then a bottom band
  if (tube.ppt) {
    const p = tube.ppt;
    let col = p.colour;
    if (p.darken > 0) col = mixRgb(col, [139, 139, 152], p.darken);
    const bandH = p.t * th * 0.24;
    ctx.fillStyle = rgbStr(col);
    ctx.beginPath();
    ctx.moveTo(-tw / 2, th / 2);
    ctx.lineTo(-tw / 2, th / 2 - bandH);
    ctx.quadraticCurveTo(0, th / 2 - bandH - 3, tw / 2, th / 2 - bandH);
    ctx.lineTo(tw / 2, th / 2);
    ctx.closePath();
    ctx.fill();
    if (p.t < 1) {
      const drift = (1 - p.t) * 10;
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.8)`;
      for (let k = 0; k < 4; k += 1) {
        const sx = Math.sin(k * 2.3 + letterIdx * 1.7 + t * 0.8) * (tw * 0.28);
        const sy = surf + th * 0.12 + k * (th * 0.14) + Math.sin(t * 2 + k) * drift * 0.4;
        ctx.beginPath();
        ctx.arc(sx, sy, p.curd ? 2.6 : 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // AgCl curdy lumps on the settled band
    if (p.curd && p.t > 0.5) {
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.9)`;
      for (let k = 0; k < 3; k += 1) {
        ctx.beginPath();
        ctx.arc(-tw * 0.24 + k * tw * 0.24, th / 2 - bandH * 0.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // meniscus + shimmer
  ctx.strokeStyle = 'rgba(23,35,52,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, surf, tw / 2 - 1.5, 2.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.4;
  const mx = Math.sin(t * 1.6 + letterIdx * 2.1) * (tw * 0.16);
  ctx.beginPath();
  ctx.ellipse(mx, surf + 1, tw * 0.2, 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // glass outline + rim + shine
  tubeBodyPath(ctx, tw, th);
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-tw / 2 + 3.5, -th / 2 + 10);
  ctx.lineTo(-tw / 2 + 3.5, th / 2 - tw / 2 - 6);
  ctx.stroke();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -th / 2 + 4, tw / 2 + 2, 3, 0, 0, Math.PI * 2);
  ctx.stroke();

  // identification tape near the rim (checkered for the known reference)
  const tapeY = -th / 2 + 10;
  if (letterIdx === 3) {
    const sq = 4;
    for (let cx = 0; cx < 5; cx += 1) {
      for (let cy = 0; cy < 2; cy += 1) {
        ctx.fillStyle = (cx + cy) % 2 === 0 ? '#5b6b7d' : '#d9a441';
        ctx.fillRect(-tw / 2 - 2 + cx * sq, tapeY + cy * sq, sq, sq);
      }
    }
    ctx.strokeStyle = '#46556a';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-tw / 2 - 2, tapeY, 5 * sq, 2 * sq);
  } else {
    ctx.fillStyle = tape;
    ctx.fillRect(-tw / 2 - 2, tapeY, tw + 4, 8);
    ctx.strokeStyle = 'rgba(23,35,52,0.35)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-tw / 2 - 2, tapeY, tw + 4, 8);
  }

  // brass collar + tick on a solved case
  if (tube.solved) {
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(-tw / 2, th / 2 - 16, tw, 4);
    ctx.strokeStyle = '#a97e22';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-tw / 2, th / 2 - 16, tw, 4);
    ctx.strokeStyle = '#1e8e4e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tw / 2 + 4, -th / 2 + 12);
    ctx.lineTo(tw / 2 + 8, -th / 2 + 18);
    ctx.lineTo(tw / 2 + 16, -th / 2 + 6);
    ctx.stroke();
  }

  // warming wisps while the litmus test runs at the mouth
  if (tube.warm > 0.05) {
    ctx.strokeStyle = `rgba(148,163,178,${0.5 * tube.warm})`;
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k += 1) {
      const ph = (t * 1.4 + k * 0.33) % 1;
      const wx = Math.sin((t * 2.2 + k * 2.1) * 2) * 5;
      ctx.beginPath();
      ctx.moveTo(wx + k * 4 - 4, -th / 2 - ph * 26);
      ctx.quadraticCurveTo(wx + k * 4 + 3, -th / 2 - ph * 26 - 7, wx + k * 4 - 3, -th / 2 - ph * 26 - 13);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawVial(ctx: CanvasRenderingContext2D, tube: TubeChem, L: Layout, t: number): void {
  if (tube.vialT <= 0) return;
  const alpha = clamp(tube.vialT, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  const vx = tube.x + L.tubeW / 2 + 16;
  const vy = tube.y + L.tubeH / 2 - 6;
  // delivery tube: out of the sample mouth, bending into the vial
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tube.x + 4, tube.y - L.tubeH / 2 - 2);
  ctx.quadraticCurveTo(tube.x + 22, tube.y - L.tubeH / 2 - 16, vx - 4, vy - 16);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // travelling gas bubbles in the delivery tube
  if (tube.fizzT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 3; k += 1) {
      const ph = (t * 0.9 + k * 0.33) % 1;
      const bx = tube.x + 4 + (vx - 4 - tube.x - 4) * ph;
      const by = tube.y - L.tubeH / 2 - 2 + (vy - 16 - (tube.y - L.tubeH / 2 - 2)) * ph - Math.sin(ph * Math.PI) * 10;
      ctx.beginPath();
      ctx.arc(bx, by, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the lime water vial itself
  ctx.fillStyle = 'rgba(226,238,245,0.6)';
  roundRect(ctx, vx - 7, vy - 16, 14, 18, 4);
  ctx.fill();
  const milky = tube.milky;
  ctx.fillStyle = `rgba(${Math.round(238 - 20 * milky)},${Math.round(242 - 15 * milky)},${Math.round(246 - 10 * milky)},${0.55 + 0.4 * milky})`;
  roundRect(ctx, vx - 5.5, vy - 10, 11, 11, 3);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.2;
  roundRect(ctx, vx - 7, vy - 16, 14, 18, 4);
  ctx.stroke();
  ctx.restore();
}

function drawBurner(ctx: CanvasRenderingContext2D, s: Sim, t: number): void {
  const L = s.layout;
  const bx = L.burnerX;
  const baseY = L.benchY - 2;
  // base plate
  ctx.fillStyle = '#3c4756';
  roundRect(ctx, bx - 17, baseY - 8, 34, 9, 3);
  ctx.fill();
  ctx.strokeStyle = '#2a3441';
  ctx.lineWidth = 1;
  ctx.stroke();
  // barrel
  const bg = ctx.createLinearGradient(bx - 6, 0, bx + 6, 0);
  bg.addColorStop(0, '#6d7a89');
  bg.addColorStop(0.45, '#a9b5c1');
  bg.addColorStop(1, '#5d6a79');
  ctx.fillStyle = bg;
  roundRect(ctx, bx - 6, L.barrelTop, 12, baseY - 8 - L.barrelTop, 4);
  ctx.fill();
  ctx.strokeStyle = '#4a5666';
  ctx.lineWidth = 1;
  ctx.stroke();
  // air holes
  ctx.fillStyle = '#39434f';
  for (let k = 0; k < 3; k += 1) {
    ctx.beginPath();
    ctx.ellipse(bx, L.barrelTop + 14 + k * 8, 2.6, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // collar
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, bx - 8, baseY - 26, 16, 10, 3);
  ctx.fill();
  ctx.strokeStyle = '#a97e22';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (!s.flameOn) {
    // gas tap hint dot
    ctx.fillStyle = '#9aa4b1';
    ctx.beginPath();
    ctx.arc(bx, L.barrelTop - 4, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const flick = 1 + Math.sin(t * 13) * 0.045 + Math.sin(t * 31) * 0.02;
  const tipY = L.barrelTop - 34 * flick;
  const fc = s.flameColour;
  let env = 0;
  let col: Rgb | null = null;
  if (fc) {
    const fadeIn = Math.min(1, fc.t / 0.25);
    const fadeOut = fc.persistent
      ? Math.min(1, (fc.dur - fc.t) / 0.6)
      : Math.min(1, (fc.dur - fc.t) / (fc.dur * 0.24));
    env = fadeIn * fadeOut;
    col = fc.rgb;
  }

  // outer cone
  ctx.beginPath();
  ctx.moveTo(bx - 7, L.barrelTop + 2);
  ctx.quadraticCurveTo(bx - 6, L.barrelTop - 18, bx, tipY);
  ctx.quadraticCurveTo(bx + 6, L.barrelTop - 18, bx + 7, L.barrelTop + 2);
  ctx.closePath();
  let outerCol: string = 'rgba(96,146,255,0.32)';
  if (col && env > 0) {
    const mixed = mixRgb([96, 146, 255], col, clamp(env * 0.85, 0, 1));
    outerCol = `rgba(${mixed[0]},${mixed[1]},${mixed[2]},${0.34 + 0.3 * env})`;
  }
  ctx.fillStyle = outerCol;
  ctx.fill();
  // inner cone (roaring blue)
  ctx.beginPath();
  ctx.moveTo(bx - 4, L.barrelTop + 2);
  ctx.quadraticCurveTo(bx - 3.4, L.barrelTop - 10, bx, L.barrelTop - 19 * flick);
  ctx.quadraticCurveTo(bx + 3.4, L.barrelTop - 10, bx + 4, L.barrelTop + 2);
  ctx.closePath();
  let innerCol = 'rgba(122,178,255,0.85)';
  if (col && env > 0) {
    const light = mixRgb(col, [255, 255, 255], 0.35);
    innerCol = `rgba(${light[0]},${light[1]},${light[2]},${0.5 + 0.45 * env})`;
  }
  ctx.fillStyle = innerCol;
  ctx.fill();
  // colour glow around the flame
  if (col && env > 0) {
    const glow = ctx.createRadialGradient(bx, L.barrelTop - 18, 4, bx, L.barrelTop - 18, 46);
    glow.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.4 * env})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(bx - 50, L.barrelTop - 66, 100, 100);
  }
  // no-colour cases still show a few orange flecks
  if (fc && !fc.rgb && fc.t < fc.dur) {
    ctx.fillStyle = 'rgba(240,150,60,0.7)';
    for (let k = 0; k < 3; k += 1) {
      const ph = (t * 2.4 + k * 0.37) % 1;
      ctx.beginPath();
      ctx.arc(bx + Math.sin(k * 2.6 + t * 5) * 4, L.barrelTop - ph * 26, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // cobalt glass pane slides in for the potassium lilac
  if (fc && fc.cobalt && env > 0.1) {
    const px = bx - 16;
    const py = tipY - 34;
    ctx.fillStyle = 'rgba(43,58,122,0.5)';
    roundRect(ctx, px, py, 32, 76, 6);
    ctx.fill();
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 5, py + 62);
    ctx.lineTo(px + 11, py + 8);
    ctx.stroke();
  }
}

function drawLoopStand(ctx: CanvasRenderingContext2D, L: Layout): void {
  const hx = L.loopHome.x;
  ctx.fillStyle = '#4a5666';
  roundRect(ctx, hx - 7, L.benchY - 6, 14, 6, 2);
  ctx.fill();
  ctx.strokeStyle = '#7d8b9b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx, L.benchY - 4);
  ctx.lineTo(hx, L.loopHome.y - 12);
  ctx.stroke();
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(hx, L.loopHome.y - 10, 5, Math.PI * 0.15, Math.PI * 1.1);
  ctx.stroke();
}

function drawLitmusStand(ctx: CanvasRenderingContext2D, L: Layout): void {
  const hx = L.litmusHome.x;
  ctx.fillStyle = '#4a5666';
  roundRect(ctx, hx - 7, L.benchY - 6, 14, 6, 2);
  ctx.fill();
  ctx.strokeStyle = '#7d8b9b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx, L.benchY - 4);
  ctx.lineTo(hx, L.litmusHome.y - 14);
  ctx.stroke();
  ctx.fillStyle = '#8d99a6';
  roundRect(ctx, hx - 5, L.litmusHome.y - 14, 10, 6, 2);
  ctx.fill();
}

function drawBottle(ctx: CanvasRenderingContext2D, b: { x: number; y: number; tip: number }, r: ReagentDef): void {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.tip * 1.0);
  // shadow when resting upright
  if (b.tip < 0.05) {
    ctx.fillStyle = 'rgba(23,35,52,0.10)';
    ctx.beginPath();
    ctx.ellipse(0, 26, 15, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // body
  const bg = ctx.createLinearGradient(-12, 0, 12, 0);
  bg.addColorStop(0, 'rgba(198,216,228,0.75)');
  bg.addColorStop(0.4, 'rgba(238,246,251,0.85)');
  bg.addColorStop(1, 'rgba(178,196,210,0.75)');
  ctx.fillStyle = bg;
  roundRect(ctx, -12, -8, 24, 32, 6);
  ctx.fill();
  // reagent stock
  ctx.fillStyle = r.liquid;
  ctx.globalAlpha = 0.9;
  roundRect(ctx, -10, 2, 20, 20, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  // label chip
  ctx.fillStyle = '#fbfcfd';
  roundRect(ctx, -8, -2, 16, 12, 2);
  ctx.fill();
  ctx.fillStyle = r.cap;
  ctx.fillRect(-8, 3.5, 16, 3);
  ctx.strokeStyle = '#9fb2c1';
  ctx.lineWidth = 0.8;
  roundRect(ctx, -8, -2, 16, 12, 2);
  ctx.stroke();
  // neck + cap
  ctx.fillStyle = 'rgba(198,216,228,0.8)';
  roundRect(ctx, -4, -16, 8, 9, 2);
  ctx.fill();
  const cg = ctx.createLinearGradient(-6, 0, 6, 0);
  cg.addColorStop(0, r.cap);
  cg.addColorStop(0.5, mixRgbStr(r.cap, '#ffffff', 0.35));
  cg.addColorStop(1, r.cap);
  ctx.fillStyle = cg;
  roundRect(ctx, -6, -23, 12, 8, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,35,52,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // outline + shine
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.4;
  roundRect(ctx, -12, -8, 24, 32, 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-8.5, -4);
  ctx.lineTo(-8.5, 20);
  ctx.stroke();
  ctx.restore();
}

function mixRgbStr(hex: string, other: string, k: number): string {
  const a = hex2rgb(hex);
  const b = hex2rgb(other);
  return rgbStr(mixRgb(a, b, k));
}

function drawLoop(ctx: CanvasRenderingContext2D, lp: LoopTool, t: number): void {
  const bob = lp.held || lp.auto ? 0 : Math.sin(t * 1.8) * 2;
  ctx.save();
  ctx.translate(lp.x, lp.y + bob);
  // handle (dark glass rod)
  const hg = ctx.createLinearGradient(-3, 0, 3, 0);
  hg.addColorStop(0, '#39434f');
  hg.addColorStop(0.5, '#6d7a89');
  hg.addColorStop(1, '#39434f');
  ctx.fillStyle = hg;
  roundRect(ctx, -3, 0, 6, 28, 3);
  ctx.fill();
  ctx.strokeStyle = '#2a3441';
  ctx.lineWidth = 1;
  ctx.stroke();
  // brass ferrule
  ctx.fillStyle = '#d9a441';
  ctx.fillRect(-4, 26, 8, 5);
  ctx.strokeStyle = '#a97e22';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-4, 26, 8, 5);
  // platinum wire
  ctx.strokeStyle = '#cfd6dd';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 31);
  ctx.lineTo(0, 38);
  ctx.stroke();
  // the loop itself
  const burn = lp.auto && lp.auto.phase === 3;
  if (burn) {
    ctx.shadowColor = 'rgba(255,170,80,0.9)';
    ctx.shadowBlur = 10;
  }
  ctx.strokeStyle = burn ? '#f4b74a' : '#cfd6dd';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 42, 6, 4.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // film of sample in the loop
  if (lp.loaded) {
    ctx.fillStyle = lp.loadTint;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 42, 5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawLitmus(ctx: CanvasRenderingContext2D, li: LitmusTool, t: number): void {
  const bob = li.held || li.auto ? 0 : Math.sin(t * 1.5 + 1) * 2;
  ctx.save();
  ctx.translate(li.x, li.y + bob);
  // brass clip + handle
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, -5, 0, 10, 7, 2);
  ctx.fill();
  ctx.strokeStyle = '#a97e22';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  const hg = ctx.createLinearGradient(-2.5, 0, 2.5, 0);
  hg.addColorStop(0, '#39434f');
  hg.addColorStop(0.5, '#6d7a89');
  hg.addColorStop(1, '#39434f');
  ctx.fillStyle = hg;
  roundRect(ctx, -2.5, -14, 5, 14, 2);
  ctx.fill();
  // damp red paper strip
  const stripTop = 7;
  const stripH = 26;
  const g = ctx.createLinearGradient(0, stripTop, 0, stripTop + stripH);
  g.addColorStop(0, '#e0716a');
  g.addColorStop(1, '#c44a42');
  ctx.fillStyle = g;
  roundRect(ctx, -3.5, stripTop, 7, stripH, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(23,35,52,0.3)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // damp sheen
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(-3.5, stripTop + 3, 2, stripH - 8);
  // blue creeping up from the tip
  if (li.blue > 0) {
    const bh = stripH * clamp(li.blue, 0, 1);
    const bg2 = ctx.createLinearGradient(0, stripTop + stripH - bh, 0, stripTop + stripH);
    bg2.addColorStop(0, '#4d6bd8');
    bg2.addColorStop(1, '#2c48b8');
    ctx.fillStyle = bg2;
    roundRect(ctx, -3.5, stripTop + stripH - bh, 7, bh, 2);
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------- UI texts -----

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'choose',
    title: 'Pick your first unknown',
    detail: 'Three unknown solutions sit in the rack, taped amber, teal and violet. Choose one with the selector — the highlighted tube is where your tests land.',
    hint: 'Tapping a tube on the bench selects it too. The checkered tape is a known sodium carbonate reference, yours to compare against.',
  },
  {
    id: 'flame',
    title: 'Run a flame test',
    detail: 'Light the Bunsen, then drag the platinum wire loop into your tube: it dips, loads a film of solution and rides into the roaring flame.',
    hint: 'Sodium’s golden-yellow persists; potassium’s lilac is gone in a blink — the cobalt glass slides in to help you judge it.',
  },
  {
    id: 'naoh',
    title: 'Add NaOH dropwise',
    detail: 'Drag the NaOH bottle onto the sample. A coloured precipitate names Cu²⁺, Fe²⁺ or Fe³⁺; silence points to Na⁺, K⁺, Ca²⁺ or NH₄⁺.',
    hint: 'No precipitate? Warm it and hold the damp red litmus strip at the mouth — ammonia turning it blue is the ammonium signature.',
  },
  {
    id: 'anion',
    title: 'Run one anion test',
    detail: 'AgNO₃ (acidified) catches Cl⁻ as a curdy white precipitate; BaCl₂ catches SO₄²⁻ as a dense white one; dilute HCl would fizz a carbonate.',
    hint: 'Try all three eventually — ruling an ion out is as good as ruling it in.',
  },
  {
    id: 'record',
    title: 'Record evidence as you go',
    detail: 'Every completed test writes its observation and inference into your evidence table. Open Observations and read the case so far.',
    hint: 'The table is your case file — deductions should point at rows, not memories.',
  },
  {
    id: 'identify',
    title: 'Identify all three unknowns',
    detail: 'For each tube, name the cation AND the anion from the dropdowns and close the case. A wrong call earns a hint, never a telling-off.',
    hint: 'The flame and NaOH rows settle the cation; the AgNO₃ and BaCl₂ rows settle the anion.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'first-flame', title: 'First flame', icon: '🔥', detail: 'Roasted the first sample film in the Bunsen flame with the platinum loop.' },
  { id: 'first-ppt', title: 'First precipitate', icon: '☁', detail: 'Formed the first precipitate — a colour that names an ion.' },
  { id: 'first-case', title: 'Case closed', icon: '✔', detail: 'Correctly identified the cation and anion of one unknown.' },
  { id: 'all-cases', title: 'Bench detective', icon: '🏅', detail: 'Identified all three unknowns in one session.' },
  { id: 'anion-trifecta', title: 'Anion trifecta', icon: '⚗', detail: 'Used all three anion tests — dilute HCl, BaCl₂ and AgNO₃.' },
];

const CATION_OPTIONS: { value: CationId; label: string }[] = (Object.keys(CATION_INFO) as CationId[]).map((k) => ({
  value: k,
  label: CATION_INFO[k].label,
}));

const ANION_OPTIONS: { value: AnionId; label: string }[] = (Object.keys(ANION_LABEL) as AnionId[]).map((k) => ({
  value: k,
  label: ANION_LABEL[k],
}));

const meta = getLabBySlug('ion-identification')!;

// -------------------------------------------------------------- component ---

export default function IonDetectiveLab() {
  // ---- simulation state (refs — the canvas loop owns the animation) --------
  const sim = useRef<Sim>(freshSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const saltsRef = useRef<SaltDef[]>(drawSession());
  const celebrated = useRef({ all: false });

  // ---- student state --------------------------------------------------------
  const [salts, setSalts] = useState<SaltDef[]>(() => saltsRef.current);
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [solved, setSolved] = useState<boolean[]>([false, false, false]);
  const [guesses, setGuesses] = useState<Guess[]>([
    { cation: '', anion: '' },
    { cation: '', anion: '' },
    { cation: '', anion: '' },
  ]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [choseSample, setChoseSample] = useState(false);
  const [sawObservations, setSawObservations] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [flash, setFlash] = useState<{ tone: CoachTone; line: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ active: 0, flameOn: false, busy: null, held: false, fizzing: false, pptForming: false });

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
    const t = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(t);
  }, [flash]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    let busy: string | null = null;
    if (s.loop.auto && s.loop.auto.phase === 3) busy = 'Flame test burning';
    else if (s.loop.auto) busy = 'Flame loop working';
    else if (s.litmus.auto && s.litmus.auto.phase === 1) busy = 'Gas test at the mouth';
    else if (s.litmus.auto) busy = 'Litmus moving';
    else {
      const b = s.bottles.findIndex((x) => x.auto);
      if (b >= 0) busy = `Adding ${REAGENTS[b].label}`;
    }
    setUi({
      active: s.active,
      flameOn: s.flameOn,
      busy,
      held: s.loop.held || s.litmus.held || s.bottles.some((x) => x.held),
      fizzing: s.tubes.some((tb) => tb.fizzT > 0),
      pptForming: s.tubes.some((tb) => tb.ppt !== null && tb.ppt.t < 1),
    });
  }, []);

  // ---- evidence recording (called from the sim loop on completion) ---------
  const commitEvidence = useCallback((sample: number, test: TestId) => {
    const salt = saltsRef.current[sample];
    const out = outcomeFor(salt, test);
    const row: EvidenceRow = {
      key: `${sample}:${test}`,
      sample,
      test,
      observation: out.observation,
      inference: out.inference,
      swatch: out.swatch,
      ppt: out.ppt,
    };
    setRows((cur) => {
      const i = cur.findIndex((r) => r.key === row.key);
      if (i >= 0) {
        const next = [...cur];
        next[i] = row;
        return next;
      }
      return [...cur, row];
    });
    labSound.click();
    if (test === 'flame') {
      earn('first-flame');
      pushToast('info', '🔥', FLAME_TOAST[salt.cation]);
    }
    if (out.ppt) earn('first-ppt');
    if (test === 'litmus' && salt.cation === 'NH4') {
      pushToast('good', '📄', 'Red litmus turned blue at the mouth — ammonia, the ammonium signature.');
    }
    if (test === 'naoh' && !out.ppt && salt.cation === 'NH4') {
      setFlash({
        tone: 'info',
        line: 'No precipitate with NaOH — warm the mixture and hold the damp red litmus strip at the mouth: escaping ammonia would turn it blue.',
      });
    }
  }, [earn, pushToast]);

  // ---- mentor completion flags ----------------------------------------------
  const done = useMemo(() => ([
    choseSample || rows.length > 0,
    rows.some((r) => r.test === 'flame'),
    rows.some((r) => r.test === 'naoh'),
    rows.some((r) => r.test === 'hcl' || r.test === 'bacl2' || r.test === 'agno3'),
    sawObservations && rows.length >= 3,
    solved.every(Boolean),
  ]), [choseSample, rows, sawObservations, solved]);

  useEffect(() => {
    const next = done.findIndex((d) => !d);
    if (next > mentorIndex) {
      setMentorIndex(next);
      labSound.step();
    } else if (done[done.length - 1] && mentorIndex < MENTOR_STEPS.length - 1) {
      setMentorIndex(MENTOR_STEPS.length - 1);
    }
  }, [done, mentorIndex]);

  useEffect(() => {
    const tests = new Set(rows.map((r) => r.test));
    if (tests.has('hcl') && tests.has('bacl2') && tests.has('agno3')) earn('anion-trifecta');
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (solved.every(Boolean) && !celebrated.current.all) {
      celebrated.current.all = true;
      earn('all-cases');
      labSound.milestone();
      pushToast('good', '🏅', 'All three cases closed — the bench salutes you. Reset deals three fresh unknowns.');
    }
  }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'choose':
        return { target: 'choose', gesture: 'tap', title: 'Pick your unknown', body: 'Choose tube A, B or C with the selector — or tap a tube on the bench. The glowing ring marks your working sample.' };
      case 'flame':
        return sim.current.flameOn
          ? { target: 'looptest', gesture: 'press', title: 'Run the flame test', body: 'Press Flame test — or drag the platinum loop into your tube. It dips, loads a film and rides into the flame.' }
          : { target: 'burner', gesture: 'press', title: 'Light the Bunsen', body: 'A cold flame shows no colours — light the burner first, then run the flame test on your unknown.' };
      case 'naoh':
        return { target: 'naoh', gesture: 'press', title: 'Add NaOH dropwise', body: 'Drag the slate-blue NaOH bottle onto your tube — or press here. Watch for a coloured precipitate settling out.' };
      case 'anion':
        return { target: 'bacl2', gesture: 'press', title: 'Test the anion', body: 'BaCl₂ catches SO₄²⁻ as a dense white precipitate; AgNO₃ catches Cl⁻ as a curdy one. Dilute HCl would fizz a carbonate.' };
      case 'record':
        return { target: 'observations', gesture: 'tap', title: 'Read your evidence', body: 'Open Observations — every completed test has written its observation and inference into the evidence table.' };
      case 'identify': {
        const i = solved.findIndex((x) => !x);
        const letter = i >= 0 ? LETTERS[i] : 'A';
        return { target: `close${letter}`, gesture: 'press', title: `Close case ${letter}`, body: 'Name the cation AND the anion from the dropdowns, then close the case. Wrong calls get a hint at the unused evidence.' };
      }
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex, solved]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- tool orchestration -------------------------------------------------------
  const toggleFlame = useCallback(() => {
    const s = sim.current;
    s.flameOn = !s.flameOn;
    if (s.flameOn) labSound.startLoop('hum');
    else labSound.stopLoop();
    labSound.click();
    syncUi();
  }, [syncUi]);

  const selectSample = useCallback((i: number) => {
    const s = sim.current;
    s.active = i;
    setChoseSample(true);
    labSound.tick();
    syncUi();
  }, [syncUi]);

  /** Start a tool's automatic run on a sample (drag-drop or button). */
  const startTool = useCallback((test: TestId, sample: number): boolean => {
    const s = sim.current;
    if (anyToolBusy(s)) return false;
    if (test === 'flame') {
      if (!s.flameOn) {
        setFlash({ tone: 'warn', line: 'Light the Bunsen first — a cold flame tells no colours. The toggle sits below the scene (or tap the burner).' });
        labSound.warn();
        return false;
      }
      s.loop.auto = { sample, phase: 0, t: 0, fromX: s.loop.x, fromY: s.loop.y };
      labSound.creak(0.4);
      return true;
    }
    if (test === 'litmus') {
      if (!s.tubes[sample].naohAdded) {
        setFlash({ tone: 'info', line: 'Ammonia only escapes from a warm alkaline mixture — add NaOH to that sample first, then bring the litmus to the mouth.' });
        return false;
      }
      s.litmus.blue = 0;
      s.litmus.auto = { sample, phase: 0, t: 0, fromX: s.litmus.x, fromY: s.litmus.y };
      labSound.creak(0.3);
      return true;
    }
    const idx = REAGENTS.findIndex((r) => r.id === test);
    if (idx < 0) return false;
    s.bottles[idx].auto = { sample, phase: 0, t: 0, fromX: s.bottles[idx].x, fromY: s.bottles[idx].y };
    labSound.glassClink(true);
    return true;
  }, []);

  const runTest = useCallback((test: TestId) => {
    startTool(test, sim.current.active);
    syncUi();
  }, [startTool, syncUi]);

  // ---- simulation step ------------------------------------------------------------
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

    // dropper bottles: auto-flight + drip sequence, or easing home
    for (let i = 0; i < s.bottles.length; i += 1) {
      const b = s.bottles[i];
      const a = b.auto;
      if (a) {
        a.t += dt;
        const tube = s.tubes[a.sample];
        if (a.phase === 0) {
          const k = Math.min(1, a.t / 0.42);
          const e = k * k * (3 - 2 * k);
          const tx = tube.x - 6;
          const ty = tube.y - L.tubeH / 2 - 40;
          b.x = a.fromX + (tx - a.fromX) * e;
          b.y = a.fromY + (ty - a.fromY) * e;
          if (k >= 1) { a.phase = 1; a.t = 0; b.dripT = 0; b.dripCount = 0; }
        } else if (a.phase === 1) {
          b.tip = Math.min(1, b.tip + dt * 4);
          b.dripT += dt;
          if (b.dripCount < 3 && b.dripT > 0.34) {
            b.dripT = 0;
            b.dripCount += 1;
            const ang = b.tip * 1.0;
            s.drops.push({
              x: b.x + Math.sin(ang) * 16,
              y: b.y - Math.cos(ang) * 18,
              vy: 40,
              sample: a.sample,
              reagent: REAGENTS[i].id,
            });
          }
          if (b.dripCount >= 3 && b.dripT > 1.05) {
            s.pending.push({ sample: a.sample, test: REAGENTS[i].id });
            a.phase = 2;
            a.t = 0;
            a.fromX = b.x;
            a.fromY = b.y;
          }
        } else {
          const k = Math.min(1, a.t / 0.45);
          const e = k * k * (3 - 2 * k);
          b.x = a.fromX + (b.hx - a.fromX) * e;
          b.y = a.fromY + (b.hy - a.fromY) * e;
          b.tip = Math.max(0, b.tip - dt * 5);
          if (k >= 1) { b.auto = null; b.tip = 0; }
        }
      } else if (!b.held) {
        const k = Math.min(1, dt * 9);
        b.x += (b.hx - b.x) * k;
        b.y += (b.hy - b.y) * k;
        b.tip = Math.max(0, b.tip - dt * 5);
      }
    }

    // platinum loop: fly → dip → load → fly to flame → burn → home
    const lp = s.loop;
    const la = lp.auto;
    if (la) {
      la.t += dt;
      const tube = s.tubes[la.sample];
      if (la.phase === 0) {
        const k = Math.min(1, la.t / 0.42);
        const e = k * k * (3 - 2 * k);
        const tx = tube.x;
        const ty = tube.y - L.tubeH / 2 - 54;
        lp.x = la.fromX + (tx - la.fromX) * e;
        lp.y = la.fromY + (ty - la.fromY) * e;
        if (k >= 1) { la.phase = 1; la.t = 0; la.fromX = lp.x; la.fromY = lp.y; }
      } else if (la.phase === 1) {
        const k = Math.min(1, la.t / 0.5);
        const e = k * k * (3 - 2 * k);
        const surf = surfYOf(s, la.sample);
        const tx = tube.x;
        const ty = surf - 38;
        lp.x = la.fromX + (tx - la.fromX) * e;
        lp.y = la.fromY + (ty - la.fromY) * e;
        if (k >= 1) {
          lp.loaded = true;
          lp.loadTint = saltsRef.current[la.sample].tint;
          la.phase = 2;
          la.t = 0;
          la.fromX = lp.x;
          la.fromY = lp.y;
        }
      } else if (la.phase === 2) {
        const k = Math.min(1, la.t / 0.5);
        const e = k * k * (3 - 2 * k);
        const tx = L.burnerX;
        const ty = L.barrelTop - 58;
        lp.x = la.fromX + (tx - la.fromX) * e;
        lp.y = la.fromY + (ty - la.fromY) * e;
        if (k >= 1) {
          if (!s.flameOn) {
            s.pendingFlash = 'The flame went out mid-test — light the Bunsen again and rerun the loop.';
            la.phase = 4;
            la.t = 0;
            la.fromX = lp.x;
            la.fromY = lp.y;
          } else {
            const f = CATION_INFO[saltsRef.current[la.sample].cation].flame;
            s.flameColour = f
              ? { rgb: hex2rgb(f.colour), t: 0, dur: f.dur, cobalt: !!f.cobalt, persistent: !!f.persistent }
              : { rgb: null, t: 0, dur: 0.9, cobalt: false, persistent: false };
            s.pending.push({ sample: la.sample, test: 'flame' });
            la.phase = 3;
            la.t = 0;
          }
        }
      } else if (la.phase === 3) {
        lp.x = L.burnerX + Math.sin(s.time * 9) * 1.2;
        lp.y = L.barrelTop - 58 + Math.sin(s.time * 6) * 0.8;
        if (!s.flameColour) {
          la.phase = 4;
          la.t = 0;
          la.fromX = lp.x;
          la.fromY = lp.y;
        }
      } else {
        const k = Math.min(1, la.t / 0.5);
        const e = k * k * (3 - 2 * k);
        lp.x = la.fromX + (lp.hx - la.fromX) * e;
        lp.y = la.fromY + (lp.hy - la.fromY) * e;
        if (k >= 1) { lp.auto = null; lp.loaded = false; }
      }
    } else if (!lp.held) {
      const k = Math.min(1, dt * 9);
      lp.x += (lp.hx - lp.x) * k;
      lp.y += (lp.hy - lp.y) * k;
    }

    // flame colour lifetime
    if (s.flameColour) {
      s.flameColour.t += dt;
      if (s.flameColour.t >= s.flameColour.dur) s.flameColour = null;
    }

    // litmus strip: fly to the mouth → warm hold → home
    const li = s.litmus;
    const lia = li.auto;
    if (lia) {
      lia.t += dt;
      const tube = s.tubes[lia.sample];
      if (lia.phase === 0) {
        const k = Math.min(1, lia.t / 0.42);
        const e = k * k * (3 - 2 * k);
        const tx = tube.x;
        const ty = tube.y - L.tubeH / 2 - 36;
        li.x = lia.fromX + (tx - lia.fromX) * e;
        li.y = lia.fromY + (ty - lia.fromY) * e;
        if (k >= 1) { lia.phase = 1; lia.t = 0; }
      } else if (lia.phase === 1) {
        tube.warm = 1;
        if (saltsRef.current[lia.sample].cation === 'NH4') {
          li.blue = Math.min(1, li.blue + dt / 1.2);
        }
        if (lia.t >= 1.6) {
          s.pending.push({ sample: lia.sample, test: 'litmus' });
          lia.phase = 2;
          lia.t = 0;
          lia.fromX = li.x;
          lia.fromY = li.y;
        }
      } else {
        const k = Math.min(1, lia.t / 0.45);
        const e = k * k * (3 - 2 * k);
        li.x = lia.fromX + (li.hx - lia.fromX) * e;
        li.y = lia.fromY + (li.hy - lia.fromY) * e;
        if (k >= 1) li.auto = null;
      }
    } else if (!li.held) {
      const k = Math.min(1, dt * 9);
      li.x += (li.hx - li.x) * k;
      li.y += (li.hy - li.y) * k;
    }

    // falling reagent drops
    for (let i = s.drops.length - 1; i >= 0; i -= 1) {
      const d = s.drops[i];
      d.vy += 1400 * dt;
      d.y += d.vy * dt;
      d.x += (s.tubes[d.sample].x - d.x) * Math.min(1, dt * 6);
      const surf = surfYOf(s, d.sample);
      if (d.y >= surf) {
        s.drops.splice(i, 1);
        s.ripples.push({ x: s.tubes[d.sample].x, y: surf, r: 3, a: 0.85 });
        labSound.drip(false);
        labSound.slosh(0.35);
        applyReagent(s, d.sample, d.reagent, saltsRef.current[d.sample]);
      }
    }

    // tube chemistry: ppt growth, AgCl darkening, fizz, milky lime water, warmth
    s.fizzAcc += dt;
    for (let i = 0; i < s.tubes.length; i += 1) {
      const tb = s.tubes[i];
      if (tb.ppt) {
        tb.ppt.t = Math.min(1, tb.ppt.t + dt / 1.2);
        if (tb.ppt.t >= 1 && tb.ppt.curd) tb.ppt.darken = Math.min(1, tb.ppt.darken + dt / 4);
      }
      if (tb.fizzT > 0) {
        tb.fizzT -= dt;
        tb.warm = Math.max(tb.warm, 0.55); // the warmed-acid test shows its warming wisps
        tb.milky = Math.min(1, tb.milky + dt / 2.6);
        if (s.fizzAcc > 0.07) {
          s.fizzAcc = 0;
          s.bubbles.push({
            x: tb.x + (Math.random() - 0.5) * L.tubeW * 0.7,
            y: tb.y + L.tubeH * 0.26,
            vy: 30 + Math.random() * 40,
            r: 1.2 + Math.random() * 2.2,
            seed: Math.random() * 10,
            sample: i,
          });
        }
      }
      if (tb.vialT > 0 && tb.fizzT <= 0) tb.vialT -= dt;
      if (!(li.auto && li.auto.phase === 1 && li.auto.sample === i)) {
        tb.warm = Math.max(0, tb.warm - dt * 1.4);
      }
    }

    // rising gas bubbles pop at the surface
    for (let i = s.bubbles.length - 1; i >= 0; i -= 1) {
      const b = s.bubbles[i];
      b.y -= b.vy * dt;
      b.x += Math.sin(s.time * 14 + b.seed) * 9 * dt;
      const surf = surfYOf(s, b.sample);
      if (b.y <= surf + 2) {
        s.bubbles.splice(i, 1);
        if (s.time - s.lastPop > 0.06) {
          s.lastPop = s.time;
          labSound.ping(1100 + Math.random() * 900, 0.05);
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

    // drain completed tests into the evidence table
    if (s.pending.length) {
      for (const p of s.pending) commitEvidence(p.sample, p.test);
      s.pending.length = 0;
    }

    // drain a coach flash queued by the animation (e.g. flame went out mid-test)
    if (s.pendingFlash) {
      const line = s.pendingFlash;
      s.pendingFlash = null;
      setFlash({ tone: 'warn', line });
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [commitEvidence, syncUi]);

  // ----------------------------------------------------------------- drawing --
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, _w: number, _h: number) => {
    const s = sim.current;
    const L = s.layout;
    const t = s.time;

    drawBench(ctx, L);
    drawShelf(ctx, L);
    drawRack(ctx, L);

    // tubes (with chemistry), vials behind the tools
    for (let i = 0; i < s.tubes.length; i += 1) {
      drawVial(ctx, s.tubes[i], L, t);
    }
    for (let i = 0; i < s.tubes.length; i += 1) {
      drawTube(ctx, s.tubes[i], saltsRef.current[i], TAPES[i], L, t, s.active === i, i);
    }

    // ripples on the liquid surfaces
    for (const rp of s.ripples) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, rp.a)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // gas bubbles inside fizzing tubes
    for (const b of s.bubbles) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r * 0.85, b.r, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // falling reagent drops
    for (const d of s.drops) {
      const stretch = 1 + Math.min(1.1, d.vy * 0.0011);
      ctx.fillStyle = 'rgba(226,238,245,0.95)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 3.2, 3.2 * stretch, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(d.x - 1, d.y - 1.2, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // burner + stands + tools on top
    drawBurner(ctx, s, t);
    drawLoopStand(ctx, L);
    drawLitmusStand(ctx, L);
    for (let i = 0; i < s.bottles.length; i += 1) {
      drawBottle(ctx, s.bottles[i], REAGENTS[i]);
    }
    drawLoop(ctx, s.loop, t);
    drawLitmus(ctx, s.litmus, t);

    // drop-target ring while dragging a tool over a tube
    const dragTip = s.loop.held
      ? { x: s.loop.x, y: s.loop.y + 40 }
      : s.litmus.held
        ? { x: s.litmus.x, y: s.litmus.y + 34 }
        : null;
    const bottleDrag = s.bottles.findIndex((b) => b.held);
    const tip = dragTip ?? (bottleDrag >= 0
      ? { x: s.bottles[bottleDrag].x, y: s.bottles[bottleDrag].y + 26 }
      : null);
    if (tip) {
      const idx = tubeAt(s, tip.x, tip.y);
      if (idx >= 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        const tb = s.tubes[idx];
        ctx.strokeStyle = `rgba(249,115,22,${0.4 + pulse * 0.5})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(tb.x, tb.y - L.tubeH / 2 + 2, L.tubeW / 2 + 7, 5.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, []);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---------------------------------------------------------------- pointers --
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
    // grab a dropper bottle (only while no other tool is mid-run)
    if (!anyToolBusy(s)) {
      for (let i = 0; i < s.bottles.length; i += 1) {
        const b = s.bottles[i];
        if (!b.held && !b.auto && Math.abs(p.x - b.x) < 22 && Math.abs(p.y - b.y) < 28) {
          b.held = true;
          b.grabDX = p.x - b.x;
          b.grabDY = p.y - b.y;
          try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
          labSound.creak(0.35);
          notePointer(true);
          return;
        }
      }
      // grab the platinum loop
      if (!s.loop.held && !s.loop.auto && Math.abs(p.x - s.loop.x) < 18 && Math.abs(p.y - (s.loop.y + 16)) < 36) {
        s.loop.held = true;
        s.loop.grabDX = p.x - s.loop.x;
        s.loop.grabDY = p.y - s.loop.y;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.creak(0.4);
        notePointer(true);
        return;
      }
      // grab the litmus strip
      if (!s.litmus.held && !s.litmus.auto && Math.abs(p.x - s.litmus.x) < 16 && Math.abs(p.y - (s.litmus.y + 8)) < 32) {
        s.litmus.held = true;
        s.litmus.grabDX = p.x - s.litmus.x;
        s.litmus.grabDY = p.y - s.litmus.y;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.creak(0.3);
        notePointer(true);
        return;
      }
    }
    // tap the burner to light / extinguish
    if (burnerAt(s, p.x, p.y)) {
      toggleFlame();
      notePointer(true);
      return;
    }
    // tap a tube to make it the working sample
    const idx = tubeAt(s, p.x, p.y);
    if (idx >= 0) {
      selectSample(idx);
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
    let dragging = false;
    for (const b of s.bottles) {
      if (b.held) {
        dragging = true;
        b.x = clamp(p.x - b.grabDX, 16, L.w - 16);
        b.y = clamp(p.y - b.grabDY, 16, L.h - 30);
      }
    }
    if (s.loop.held) {
      dragging = true;
      s.loop.x = clamp(p.x - s.loop.grabDX, 16, L.w - 16);
      s.loop.y = clamp(p.y - s.loop.grabDY, 12, L.h - 60);
    }
    if (s.litmus.held) {
      dragging = true;
      s.litmus.x = clamp(p.x - s.litmus.grabDX, 16, L.w - 16);
      s.litmus.y = clamp(p.y - s.litmus.grabDY, 12, L.h - 60);
    }
    if (dragging && now - s.slideAt > 160) {
      s.slideAt = now;
      labSound.slide(0.25);
    }
    const canvas = canvasRef.current;
    if (canvas) {
      let cursor = 'default';
      if (dragging) cursor = 'grabbing';
      else {
        const overBottle = s.bottles.some((b) => !b.held && !b.auto && Math.abs(p.x - b.x) < 22 && Math.abs(p.y - b.y) < 28);
        const overLoop = !s.loop.held && !s.loop.auto && Math.abs(p.x - s.loop.x) < 18 && Math.abs(p.y - (s.loop.y + 16)) < 36;
        const overLitmus = !s.litmus.held && !s.litmus.auto && Math.abs(p.x - s.litmus.x) < 16 && Math.abs(p.y - (s.litmus.y + 8)) < 32;
        if (overBottle || overLoop || overLitmus || tubeAt(s, p.x, p.y) >= 0 || burnerAt(s, p.x, p.y)) cursor = 'grab';
      }
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (s.loop.held) {
      s.loop.held = false;
      const idx = tubeAt(s, s.loop.x, s.loop.y + 40);
      if (idx >= 0) {
        s.active = idx;
        setChoseSample(true);
        startTool('flame', idx);
        syncUi();
        return;
      }
    }
    if (s.litmus.held) {
      s.litmus.held = false;
      const idx = tubeAt(s, s.litmus.x, s.litmus.y + 34);
      if (idx >= 0) {
        s.active = idx;
        setChoseSample(true);
        startTool('litmus', idx);
        syncUi();
        return;
      }
    }
    const bi = s.bottles.findIndex((b) => b.held);
    if (bi >= 0) {
      const b = s.bottles[bi];
      b.held = false;
      const idx = tubeAt(s, b.x, b.y + 26);
      if (idx >= 0) {
        s.active = idx;
        setChoseSample(true);
        startTool(REAGENTS[bi].id, idx);
        syncUi();
        return;
      }
    }
    syncUi();
  };

  // ------------------------------------------------------------------ reset --
  const resetAll = () => {
    labSound.stopLoop();
    const s = freshSim();
    s.layoutW = sim.current.layoutW;
    s.layoutH = sim.current.layoutH;
    if (s.layoutW > 0) relayout(s);
    sim.current = s;
    const next = drawSession();
    saltsRef.current = next;
    setSalts(next);
    celebrated.current = { all: false };
    setRows([]);
    setSolved([false, false, false]);
    setGuesses([{ cation: '', anion: '' }, { cation: '', anion: '' }, { cation: '', anion: '' }]);
    setBadges([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setChoseSample(false);
    setSawObservations(false);
    setFlash(null);
    syncUi();
  };

  // ------------------------------------------------------------- identify ---
  const hintForCase = (i: number): string => {
    const salt = salts[i];
    const mine = rows.filter((r) => r.sample === i);
    const has = (t: TestId) => mine.some((r) => r.test === t);
    const cationWrong = guesses[i].cation !== salt.cation;
    const anionWrong = guesses[i].anion !== salt.anion;
    if (!has('flame')) {
      return `The platinum loop has not visited tube ${LETTERS[i]} yet — a flame colour splits Na⁺, K⁺, Ca²⁺ and Cu²⁺ in seconds.`;
    }
    if (!has('naoh')) {
      return `No NaOH row for tube ${LETTERS[i]} — its precipitate (or its silence) sorts the cation further.`;
    }
    if (anionWrong && !has('agno3') && !has('bacl2')) {
      return 'The anion is barely tested — AgNO₃ catches Cl⁻ as a curdy white, BaCl₂ catches SO₄²⁻ as a dense white, and warmed dilute HCl fizzes a carbonate.';
    }
    if (cationWrong) {
      const p = CATION_INFO[salt.cation].naohPpt;
      if (p) return `Reread your NaOH row for this tube — one cation in the scheme answers NaOH with a ${p.name} precipitate.`;
      if (salt.cation === 'NH4') return 'No precipitate and no flame colour leaves three candidates — the damp litmus at the mouth settles one of them.';
      const f = CATION_INFO[salt.cation].flame;
      if (f) return `The flame colour you recorded for this tube names its cation — check it against the swatch in your evidence table.`;
      return 'No characteristic flame colour points to Fe²⁺, Fe³⁺ or NH₄⁺ — the NaOH and litmus rows decide between them.';
    }
    if (anionWrong) {
      return 'Your anion rows decide this one — a curdy white with AgNO₃ means Cl⁻; a dense white with BaCl₂ means SO₄²⁻.';
    }
    return 'Both names must match the evidence to close a case — check each dropdown against your rows.';
  };

  const closeCase = (i: number) => {
    if (solved[i]) return;
    const g = guesses[i];
    if (!g.cation || !g.anion) {
      setFlash({ tone: 'info', line: `Name both ions for tube ${LETTERS[i]} — pick a cation and an anion from the dropdowns, then close the case.` });
      labSound.tick();
      return;
    }
    const salt = salts[i];
    if (g.cation === salt.cation && g.anion === salt.anion) {
      const next = [...solved];
      next[i] = true;
      setSolved(next);
      sim.current.tubes[i].solved = true;
      labSound.glassClink(true);
      labSound.milestone();
      earn('first-case');
      pushToast('good', '✔', `Tube ${LETTERS[i]} closed — ${salt.name} (${CATION_INFO[salt.cation].label} + ${ANION_LABEL[salt.anion]}).`);
    } else {
      labSound.warn();
      setFlash({ tone: 'warn', line: hintForCase(i) });
    }
  };

  // ------------------------------------------------------------------ coach --
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (flash) return flash;
    if (ui.busy === 'Flame test burning') {
      return { tone: 'info', line: 'The loop is in the flame — hold your eye on the colour. Golden-yellow persists, lilac vanishes fast.' };
    }
    if (ui.fizzing) {
      return { tone: 'info', line: 'Effervescence! A gas is coming off — watch it travel through the delivery tube and cloud the lime water.' };
    }
    if (ui.pptForming) {
      return { tone: 'info', line: 'A precipitate is settling — its colour is about to become a row of evidence.' };
    }
    if (solved.every(Boolean)) {
      return { tone: 'good', line: 'Three cases closed from colours, clouds and one blue slip of paper. Reset the bench for a fresh set of unknowns.' };
    }
    if (ui.active === 3) {
      return { tone: 'info', line: 'The checkered tube is the known reference — sodium carbonate. Use it to see what a positive carbonate test looks like before trusting a negative.' };
    }
    if (!ui.flameOn && !rows.some((r) => r.test === 'flame')) {
      return { tone: 'info', line: 'Light the Bunsen and run the flame test first — colours sort the cations faster than anything else on this bench.' };
    }
    const solvedCount = solved.filter(Boolean).length;
    if (solvedCount > 0) {
      return { tone: 'good', line: `${solvedCount} case${solvedCount > 1 ? 's' : ''} closed. Keep testing the remaining tubes — every row you bank narrows the field.` };
    }
    const activeRows = rows.filter((r) => r.sample === ui.active);
    if (activeRows.length === 0) {
      return { tone: 'info', line: `Tube ${LETTERS[ui.active]} is untouched — start with the flame test, then NaOH, then one anion test.` };
    }
    const hasAnion = activeRows.some((r) => r.test === 'hcl' || r.test === 'bacl2' || r.test === 'agno3');
    if (!hasAnion && activeRows.length >= 2) {
      return { tone: 'info', line: `The cation side is warming up for tube ${LETTERS[ui.active]} — now the anion: AgNO₃ for Cl⁻, BaCl₂ for SO₄²⁻.` };
    }
    if (activeRows.length >= 3) {
      return { tone: 'good', line: `Three clues banked for tube ${LETTERS[ui.active]} — if the pattern is clear, name both ions and close the case.` };
    }
    return { tone: 'info', line: 'Watch, record, deduce — the evidence table grows with every completed test.' };
  }, [flash, ui, rows, solved]);

  // ------------------------------------------------------------------ status --
  const solvedCount = solved.filter(Boolean).length;
  const complete = solved.every(Boolean);
  const statusText = complete ? 'All cases closed'
    : ui.busy ? 'Test running…'
    : ui.fizzing ? 'Effervescence!'
    : ui.flameOn ? 'Bunsen lit — bench ready'
    : rows.length ? 'Investigation under way'
    : 'Investigation ready';

  const flameTestsRun = rows.filter((r) => r.test === 'flame').length;
  const precipitates = rows.filter((r) => r.ppt).length;
  const anionTestsUsed = (['hcl', 'bacl2', 'agno3'] as TestId[]).filter((t) => rows.some((r) => r.test === t)).length;

  const activeLetter = LETTERS[ui.active];
  const activeName = activeLetter === 'R' ? 'the reference' : `tube ${activeLetter}`;
  const activeReagentLabel = (id: TestId) => (id === 'flame' ? `Flame test — ${activeName}` : id === 'litmus' ? `Litmus check — ${activeName}` : `${REAGENTS.find((r) => r.id === id)?.label ?? ''} — ${activeName}`);

  // ------------------------------------------------------------------ render --
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : rows.length ? 'active' : 'ready'}
      captionChip="Drag · drip · roast · deduce"
      legend={[
        { color: '#3b5b7e', label: 'NaOH bottle' },
        { color: '#2e8577', label: 'HCl bottle' },
        { color: '#8d99a6', label: 'BaCl₂ bottle' },
        { color: '#6f5d8f', label: 'AgNO₃ bottle' },
        { color: '#cfd6dd', label: 'Platinum loop' },
        { color: '#d1524a', label: 'Red litmus strip' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — open the case', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Ion detective bench — drag dropper bottles, the platinum loop or the litmus strip onto a tube; tap a tube to select it; tap the burner to light it"
          onKeyDown={(e) => {
            if (e.repeat) return;
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              runTest('naoh');
              notePointer(true);
            } else if (e.key >= '1' && e.key <= '4') {
              selectSample(Number(e.key) - 1);
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
          <div className="ion-selector" data-nudge="choose" role="group" aria-label="Choose the working sample">
            <span className="ion-selector-label">Working on</span>
            {LETTERS.map((letter, i) => (
              <button
                key={letter}
                type="button"
                className={`ion-chip${ui.active === i ? ' active' : ''}`}
                onClick={() => { selectSample(i); notePointer(true); }}
              >
                <i style={{ background: TAPES[i] }} aria-hidden="true" />
                {i < 3 ? `Tube ${letter}` : 'Reference'}
              </button>
            ))}
          </div>

          <div className="ion-actions">
            <button
              className="action-button"
              type="button"
              data-nudge="burner"
              onClick={() => { toggleFlame(); notePointer(true); }}
            >
              <span className="dispense-icon" aria-hidden="true">{ui.flameOn ? '🔥' : '🌑'}</span>
              <span>{ui.flameOn ? 'Bunsen lit — extinguish' : 'Light the Bunsen'}</span>
              <small>or tap the burner on the bench</small>
            </button>
            <button
              className="action-button"
              type="button"
              data-nudge="looptest"
              onClick={() => { runTest('flame'); notePointer(true); }}
              disabled={!!ui.busy || ui.held}
            >
              <span className="dispense-icon" aria-hidden="true">✦</span>
              <span>{activeReagentLabel('flame')}</span>
              <small>or drag the platinum loop into the tube</small>
            </button>
            {REAGENTS.map((r) => (
              <button
                key={r.id}
                className="action-button"
                type="button"
                data-nudge={r.id}
                onClick={() => { runTest(r.id); notePointer(true); }}
                disabled={!!ui.busy || ui.held}
              >
                <span className="dispense-icon" aria-hidden="true"><i className="ion-dot" style={{ background: r.cap }} />{r.label}</span>
                <span>{activeReagentLabel(r.id)}</span>
                <small>{r.sub}</small>
              </button>
            ))}
            <button
              className="action-button"
              type="button"
              data-nudge="litmus"
              onClick={() => { runTest('litmus'); notePointer(true); }}
              disabled={!!ui.busy || ui.held}
            >
              <span className="dispense-icon" aria-hidden="true">📄</span>
              <span>{activeReagentLabel('litmus')}</span>
              <small>after NaOH · drag the red strip to the mouth</small>
            </button>
          </div>

          <div className="ion-cases">
            {LETTERS.slice(0, 3).map((letter, i) => (
              <div key={letter} className={`ion-case${solved[i] ? ' closed' : ''}`}>
                <div className="ion-case-head">
                  <i style={{ background: TAPES[i] }} aria-hidden="true" />
                  <strong>Tube {letter}</strong>
                  <span>{solved[i] ? 'case closed' : `${rows.filter((r) => r.sample === i).length} clues`}</span>
                </div>
                {solved[i] ? (
                  <div className="ion-case-solved">
                    <strong>{CATION_INFO[salts[i].cation].label} + {ANION_LABEL[salts[i].anion]}</strong>
                    <small>{salts[i].name}</small>
                  </div>
                ) : (
                  <div className="ion-case-fields">
                    <select
                      aria-label={`Cation guess for tube ${letter}`}
                      value={guesses[i].cation}
                      onChange={(e) => {
                        const next = [...guesses];
                        next[i] = { ...next[i], cation: e.target.value };
                        setGuesses(next);
                        labSound.tick();
                      }}
                    >
                      <option value="">cation…</option>
                      {CATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select
                      aria-label={`Anion guess for tube ${letter}`}
                      value={guesses[i].anion}
                      onChange={(e) => {
                        const next = [...guesses];
                        next[i] = { ...next[i], anion: e.target.value };
                        setGuesses(next);
                        labSound.tick();
                      }}
                    >
                      <option value="">anion…</option>
                      {ANION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button
                      type="button"
                      className="ion-close-btn"
                      data-nudge={`close${letter}`}
                      onClick={() => { closeCase(i); notePointer(true); }}
                    >
                      Close case
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hint-row">
            <span>✦</span>
            <p style={{ margin: 0 }}>
              Tape colours mark the tubes — amber A, teal B, violet C, checkered R (a known sodium carbonate reference).
              Drag any bottle, the loop or the litmus onto a tube, or use the buttons. Space adds NaOH to the working tube; keys 1–4 switch tubes.
            </p>
          </div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">CASE BOARD</span><h2>Detective’s desk</h2></div><span className="instrument-live">{solvedCount}/3</span></div>
          <div className="reading-main">
            <span>Cases closed</span>
            <strong>{solvedCount}<small> / 3 unknowns</small></strong>
            <div className="reading-track"><span style={{ width: `${(solvedCount / 3) * 100}%` }} /></div>
            <div className="reading-scale"><span>fresh session</span><span>bench cleared</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Evidence rows</span><strong>{rows.length}</strong></div>
            <div><span>Flame tests run</span><strong>{flameTestsRun}</strong></div>
            <div><span>Precipitates seen</span><strong>{precipitates}</strong></div>
            <div><span>Anion tests used</span><strong>{anionTestsUsed}/3</strong></div>
            <div><span>Working tube</span><strong>{activeLetter === 'R' ? 'Reference' : `Tube ${activeLetter}`}</strong></div>
            <div><span>Burner</span><strong>{ui.flameOn ? 'lit 🔥' : 'out'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Pick an unknown — tube A, B or C — with the selector or by tapping the tube.</li>
              <li>Light the Bunsen, then drag the platinum loop into the tube: it dips, loads a film and roasts in the flame. Watch the colour.</li>
              <li>Drag the NaOH bottle onto the sample — a light-blue, dirty-green or rust-brown precipitate names Cu²⁺, Fe²⁺ or Fe³⁺.</li>
              <li>No precipitate? Drag the damp red litmus strip to the tube mouth — it warms the alkaline mixture and catches escaping ammonia.</li>
              <li>Run the anion tests: AgNO₃ (acidified) for Cl⁻, BaCl₂ for SO₄²⁻, dilute HCl warmed for CO₃²⁻.</li>
              <li>Open Observations and read your evidence table — every completed test is already a row.</li>
              <li>Name both ions for each tube and close the case. Wrong calls point you at the unused evidence.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>The checkered reference tube holds a known sodium carbonate — run the HCl test on it once to see what a real effervescence and milky lime water look like before you trust a negative.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Evidence table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Run a test on any tube — the observation and its inference land here the moment the test completes.</p>
            ) : (
              <table className="trial-table ion-evidence">
                <thead><tr><th>Tube</th><th>Test</th><th>Observation</th><th>Inference</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>{LETTERS[r.sample]}</td>
                      <td>{TEST_LABEL[r.test]}</td>
                      <td>{r.swatch ? <span className="ion-dot" style={{ background: r.swatch, borderColor: '#c9d2db' }} /> : null}{r.observation}</td>
                      <td>{r.inference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {solved.some(Boolean) && (
              <>
                <h3 style={{ marginTop: 16 }}>Closed cases</h3>
                <ul>
                  {LETTERS.slice(0, 3).map((letter, i) => solved[i] && (
                    <li key={letter}>Tube {letter}: {salts[i].name} — {CATION_INFO[salts[i].cation].label} + {ANION_LABEL[salts[i].anion]}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="observation-note">Row R is the known sodium carbonate reference — it shows the positive carbonate tests (fizz with HCl, white with BaCl₂) so you can compare, not guess.</p>
            <p className="observation-note">Deduce like a chemist: each row eliminates as well as confirms. A “no precipitate” is as loud as a colour.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why flame colours happen</h3>
            <p>Heat an ion in a roaring flame and its electrons jump to higher energy levels; falling back, they emit light of very specific wavelengths. Sodium’s electrons emit a persistent golden-yellow so intense that a trace of contamination paints the whole flame — which is why a clean platinum loop matters and why potassium’s delicate lilac is usually viewed through cobalt glass, which filters the sodium glare away.</p>
            <div className="equation">excited ion → ion + light of a characteristic colour</div>
            <h3>Hydroxide precipitates</h3>
            <p>Adding sodium hydroxide dropwise hands OH⁻ ions to the solution. Metals with insoluble hydroxides drop out of solution as characteristic solids:</p>
            <div className="equation">Cu²⁺(aq) + 2OH⁻(aq) → Cu(OH)₂(s) — light blue</div>
            <div className="equation">Fe³⁺(aq) + 3OH⁻(aq) → Fe(OH)₃(s) — rust-brown</div>
            <p>Ammonium ions never precipitate — instead, in the warm alkaline mixture they quietly convert to ammonia gas:</p>
            <div className="equation">NH₄⁺(aq) + OH⁻(aq) → NH₃(g) + H₂O(l)</div>
            <p>Ammonia is the only common alkaline gas, so damp red litmus held at the tube mouth turning blue is its unmistakable signature. (Aluminium and zinc hydroxides would dissolve again in excess NaOH — amphoteric behaviour this bench’s salt set deliberately avoids.)</p>
            <h3>Anion tests and the classic order</h3>
            <p>Carbonates are tested first because acid destroys them: dilute HCl on a carbonate gives brisk effervescence, and the escaping CO₂ clouds lime water as insoluble calcium carbonate. Only after acid has ruled carbonate out do the white-precipitate tests mean anything: Ba²⁺ + SO₄²⁻ → BaSO₄ (dense white), Ag⁺ + Cl⁻ → AgCl (curdy white). Silver chloride darkens in light because light decomposes it to tiny silver particles — the same chemistry that once powered photographic film.</p>
            <h3>The deduction</h3>
            <p>Qualitative analysis is a logic tree, not a memory test: flame colour and NaOH behaviour narrow the cation; AgNO₃ and BaCl₂ settle the anion; negatives eliminate as surely as positives confirm. Two independent confirmations before naming an ion is the professional habit this bench trains.</p>
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
