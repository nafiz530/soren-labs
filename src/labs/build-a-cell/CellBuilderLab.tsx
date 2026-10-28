import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './build-a-cell.css';

/**
 * Build-a-cell — cell construction bench for the Soren Lab Engine.
 *
 * The student assembles two cells from an organelle tray: a plant cell (a
 * fixed rigid rectangle whose dashed outer boundary awaits its wall) and an
 * animal cell (a soft, slowly undulating blob). Placed organelles settle into
 * sensible spots and keep drifting — they are alive. Parts that do not belong
 * fly home with a coach correction. A completed cell unlocks the label phase
 * (drag name chips onto organelles; leader lines draw themselves), then a
 * five-question function quiz answered by tapping organelles in the scene.
 * The Observations tab auto-fills a plant-vs-animal comparison table from the
 * student's real placements and ends in a three-differences conclusion.
 */

// ------------------------------------------------------------------- data ---

type CellId = 'plant' | 'animal';
type OrganelleId =
  | 'wall' | 'membrane' | 'cytoplasm' | 'nucleus' | 'mitochondrion'
  | 'chloroplast' | 'vacuole' | 'vesicle' | 'ribosome';
type CellPhase = 'build' | 'label' | 'quiz' | 'done';

interface OrganelleDef {
  id: OrganelleId;
  name: string;
  plant: boolean;
  animal: boolean;
  need: { plant: number; animal: number };
  fn: string;
  riddle: string;
  colour: string;
}

const RIBO_MIN = 30;
const RIBO_CAP = 140;
const RIBO_BURST = 8;

const ORGANELLES: OrganelleDef[] = [
  { id: 'wall', name: 'Cell wall', plant: true, animal: false, need: { plant: 1, animal: 0 }, fn: 'the rigid outer box that protects and supports the cell', riddle: 'this stiff outer crate holds the cell’s shape like a cardboard box', colour: '#a4bd8a' },
  { id: 'membrane', name: 'Cell membrane', plant: true, animal: true, need: { plant: 1, animal: 1 }, fn: 'controls what enters and leaves the cell', riddle: 'this thin skin is the gatekeeper — it decides what passes in and out', colour: '#d97706' },
  { id: 'cytoplasm', name: 'Cytoplasm', plant: true, animal: true, need: { plant: 1, animal: 1 }, fn: 'the living jelly where the cell’s reactions happen', riddle: 'everything floats inside this jelly — it fills the cell between the parts', colour: '#e9d9b0' },
  { id: 'nucleus', name: 'Nucleus', plant: true, animal: true, need: { plant: 1, animal: 1 }, fn: 'controls the cell’s activities and holds the genetic material', riddle: 'this large sphere is the cell’s control centre', colour: '#c886ae' },
  { id: 'mitochondrion', name: 'Mitochondria', plant: true, animal: true, need: { plant: 2, animal: 2 }, fn: 'releases energy from food', riddle: 'this bean-shaped powerhouse releases energy from food', colour: '#dd8848' },
  { id: 'chloroplast', name: 'Chloroplasts', plant: true, animal: false, need: { plant: 2, animal: 0 }, fn: 'absorbs light energy to make food', riddle: 'these green lenses catch sunlight and cook food with it', colour: '#7cbf58' },
  { id: 'vacuole', name: 'Central vacuole', plant: true, animal: false, need: { plant: 1, animal: 0 }, fn: 'stores water and keeps the cell firm', riddle: 'this big watery sac keeps the cell plump and firm', colour: '#aed3ec' },
  { id: 'vesicle', name: 'Vesicles', plant: false, animal: true, need: { plant: 0, animal: 3 }, fn: 'tiny sacs that store and move materials', riddle: 'these tiny sacs ferry materials around the cell', colour: '#bcd7e8' },
  { id: 'ribosome', name: 'Ribosomes', plant: true, animal: true, need: { plant: RIBO_MIN, animal: RIBO_MIN }, fn: 'builds proteins', riddle: 'these specks are tiny protein factories', colour: '#3b5b7e' },
];

const ORG: Record<OrganelleId, OrganelleDef> = ORGANELLES.reduce((acc, d) => {
  acc[d.id] = d;
  return acc;
}, {} as Record<OrganelleId, OrganelleDef>);

const ORG_ORDER: OrganelleId[] = ORGANELLES.map((d) => d.id);

const labelListOf = (cell: CellId): OrganelleId[] => ORGANELLES.filter((d) => d[cell]).map((d) => d.id);

/** Sensible settle spots — fractions of the plant rectangle / animal blob. */
const PLANT_SPOTS: Partial<Record<OrganelleId, [number, number][]>> = {
  nucleus: [[0.32, 0.4]],
  mitochondrion: [[0.24, 0.72], [0.46, 0.18]],
  chloroplast: [[0.76, 0.26], [0.8, 0.68]],
  vacuole: [[0.6, 0.58]],
};
const ANIMAL_SPOTS: Partial<Record<OrganelleId, [number, number][]>> = {
  nucleus: [[0.02, -0.02]],
  mitochondrion: [[-0.42, -0.38], [0.48, 0.4]],
  vesicle: [[-0.5, 0.42], [0.55, -0.35], [0.08, 0.58]],
};

/** Anchor angles (radians) for the scene label chips, per cell shape. */
const PLANT_CHIP: Partial<Record<OrganelleId, number>> = {
  nucleus: -1.57, wall: -0.6, mitochondrion: -0.09, chloroplast: 0.87,
  vacuole: 1.57, ribosome: 2.27, cytoplasm: 2.79, membrane: 3.6,
};
const ANIMAL_CHIP: Partial<Record<OrganelleId, number>> = {
  membrane: 3.14, cytoplasm: 2.44, ribosome: 1.05, vesicle: -2.42,
  nucleus: -1.57, mitochondrion: -0.35,
};

const DRIFT: Partial<Record<OrganelleId, number>> = {
  nucleus: 1.6, mitochondrion: 4.5, chloroplast: 3, vesicle: 3.2, vacuole: 1,
};

const WRONG_CELL_LINE: Record<string, string> = {
  'wall:animal': 'Animal cells have no cell wall — they would be locked in a box. Animal cells keep their shape with the soft membrane alone.',
  'chloroplast:animal': 'No green kitchens in an animal cell — animals cannot turn sunlight into food, so chloroplasts have no work here.',
  'vacuole:animal': 'Animal cells keep only tiny vesicles for storage — one giant watery sac would crowd everything else out.',
  'vesicle:plant': 'Plant cells store their water in one big central vacuole instead of many small vesicles — this sac flies home.',
};

const DUP_LINE: Record<OrganelleId, string> = {
  wall: 'The wall is already up — this plant cell stands rigid.',
  membrane: 'This cell already wears its membrane — the inner skin is set.',
  cytoplasm: 'The jelly is already in — it fills the whole cell.',
  nucleus: 'One nucleus is plenty — it already runs this cell.',
  mitochondrion: 'Both mitochondria are in and drifting — they have all the space they need.',
  chloroplast: 'Both chloroplasts already sit near the edge where the light is.',
  vacuole: 'One central vacuole already fills the middle of this plant cell.',
  vesicle: 'All three vesicles are already floating in this animal cell.',
  ribosome: 'The shaker is already in your hand — sprinkle inside the cell.',
};

interface QuizSeed { q: string; answer: OrganelleId }
const PLANT_QUIZ_SEED: QuizSeed[] = [
  { q: 'Which part controls the cell’s activities and holds the genetic material?', answer: 'nucleus' },
  { q: 'Which part releases energy from food?', answer: 'mitochondrion' },
  { q: 'Which part absorbs light energy to make food?', answer: 'chloroplast' },
  { q: 'Which part stores water and keeps the cell firm?', answer: 'vacuole' },
  { q: 'Which part is the rigid outer layer that supports and protects?', answer: 'wall' },
];
const ANIMAL_QUIZ_SEED: QuizSeed[] = [
  { q: 'Which part controls the cell’s activities and holds the genetic material?', answer: 'nucleus' },
  { q: 'Which part releases energy from food?', answer: 'mitochondrion' },
  { q: 'Which part controls what enters and leaves the cell?', answer: 'membrane' },
  { q: 'Which part builds proteins?', answer: 'ribosome' },
  { q: 'Which tiny sacs store and move materials around the cell?', answer: 'vesicle' },
];

interface DiffStmt { id: string; text: string; ok: boolean }
const DIFFS: DiffStmt[] = [
  { id: 'wall', text: 'Plant cells have a cell wall; animal cells do not', ok: true },
  { id: 'chloro', text: 'Plant cells have chloroplasts to make food; animal cells do not', ok: true },
  { id: 'vac', text: 'Plant cells have a large central vacuole; animal cells have only small vesicles', ok: true },
  { id: 'sun', text: 'Animal cells make their own food using sunlight', ok: false },
  { id: 'nomem', text: 'Plant cells have no cell membrane', ok: false },
  { id: 'flip', text: 'Animal cells have chloroplasts but plant cells do not', ok: false },
];
const TRUE_DIFF_IDS = DIFFS.filter((d) => d.ok).map((d) => d.id);

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'choose',
    title: 'Pick your first cell',
    detail: 'A plant cell waits as a rigid rectangle and an animal cell as a soft blob. Choose one with the chips under the scene — you will build both before the session is done.',
    hint: 'Tapping the small preview in the scene corner switches cells too.',
  },
  {
    id: 'boundary',
    title: 'Lay the boundary and the jelly',
    detail: 'Plant cell: hang the cell wall first, then the membrane that hugs its inside, then pour the cytoplasm. Animal cell: the membrane comes first — it is the skin that holds the jelly.',
    hint: 'Drag parts from the tray at the bottom. A part that does not belong flies home with the reason why.',
  },
  {
    id: 'power',
    title: 'Add the control centre and the power parts',
    detail: 'The nucleus settles near the middle. Both mitochondria scatter and keep drifting — they are alive. Watch them breathe.',
    hint: 'Drops anywhere inside the cell settle into sensible spots: middle for the nucleus, scattered for the mitochondria.',
  },
  {
    id: 'storage',
    title: 'Finish the storage parts',
    detail: 'Plant cell: the big central vacuole and both chloroplasts near the edge. Animal cell: three tiny vesicles. Then hold the ribosome shaker inside and sprinkle the protein makers.',
    hint: 'Ribosomes count honestly — the sidebar shows every dot you sprinkle. Thirty completes a cell.',
  },
  {
    id: 'label',
    title: 'Label every organelle',
    detail: 'With a cell complete, its name chips appear in the sidebar. Drag each chip onto the matching part in the scene — the leader line draws itself.',
    hint: 'A wrong drop wobbles the part and earns a clue about its job — never its name.',
  },
  {
    id: 'quiz',
    title: 'Pass the quizzes and conclude',
    detail: 'Five function questions per cell, answered by tapping the organelle in the scene. Then name three key differences in the Observations tab to finish the session.',
    hint: 'Wrong taps restate the function and let you try again — the record keeps every tap.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'animal-built', title: 'Animal cell assembled', icon: '🐾', detail: 'Dragged every organelle into place and completed the animal cell.' },
  { id: 'plant-built', title: 'Plant cell assembled', icon: '🌱', detail: 'Built the plant cell — wall, vacuole, chloroplasts and all.' },
  { id: 'label-pro', title: 'Steady namer', icon: '🏷', detail: 'Labelled every organelle on both cells with no wrong drops.' },
  { id: 'quiz-whiz', title: 'Function master', icon: '🧠', detail: 'Passed both five-question function quizzes.' },
  { id: 'concluded', title: 'Difference spotter', icon: '🔬', detail: 'Named three key differences between plant and animal cells.' },
];

// ------------------------------------------------------------------ types ---

interface Layout {
  w: number;
  h: number;
  trayTop: number;
  itemR: number;
  slots: { x: number; y: number }[];
  cx: number;
  cy: number;
  pw: number;
  ph: number;
  rx: number;
  ry: number;
  wallB: number;
  prev: { x: number; y: number; r: number };
}

interface OrgInst {
  key: string;
  type: OrganelleId;
  cell: CellId;
  idx: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  landed: boolean;
  rot: number;
  phase: number;
  wobble: number;
  pulse: number;
  scale: number;
}

interface RiboDot { x: number; y: number; vx: number; vy: number }

interface CellSim {
  cyto: number;
  pourLoop: boolean;
  wallT: number;
  memT: number;
  wob: number;
  ribos: RiboDot[];
}

interface FlightHome {
  type: OrganelleId;
  x: number;
  y: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
}

interface Sim {
  time: number;
  uiAcc: number;
  layoutW: number;
  layoutH: number;
  layout: Layout;
  active: CellId;
  cells: Record<CellId, CellSim>;
  insts: OrgInst[];
  drag: { type: OrganelleId; x: number; y: number } | null;
  flights: FlightHome[];
  hover: OrganelleId | null;
  trayHover: number;
  riboAcc: number;
  riboTickAt: number;
  slideAt: number;
}

interface UiSnap {
  active: CellId;
  dragging: boolean;
  hovering: OrganelleId | null;
  ribos: { plant: number; animal: number };
  cyto: number;
  progress: number;
}

interface QuizQ { q: string; answer: OrganelleId; taps: number; solved: boolean }

type Counts = Record<OrganelleId, number>;
type PlacedMap = Record<CellId, Counts>;
type LabelMap = Record<CellId, Partial<Record<OrganelleId, boolean>>>;

const zeroCounts = (): Counts => ({
  wall: 0, membrane: 0, cytoplasm: 0, nucleus: 0, mitochondrion: 0,
  chloroplast: 0, vacuole: 0, vesicle: 0, ribosome: 0,
});

const freshQuiz = (): Record<CellId, QuizQ[]> => ({
  plant: PLANT_QUIZ_SEED.map((s) => ({ ...s, taps: 0, solved: false })),
  animal: ANIMAL_QUIZ_SEED.map((s) => ({ ...s, taps: 0, solved: false })),
});

// ------------------------------------------------------------- pure logic ---

function cellComplete(cell: CellId, counts: Counts, ribos: number): boolean {
  return ORGANELLES.every((d) => (d.id === 'ribosome' ? ribos >= RIBO_MIN : counts[d.id] >= d.need[cell]));
}

function labelsDoneCell(labeled: Partial<Record<OrganelleId, boolean>>, cell: CellId): boolean {
  return ORGANELLES.filter((d) => d[cell]).every((d) => !!labeled[d.id]);
}

function quizPassedCell(qs: QuizQ[]): boolean {
  return qs.every((q) => q.solved);
}

function phaseOfCell(cell: CellId, counts: Counts, labeled: Partial<Record<OrganelleId, boolean>>, qs: QuizQ[], ribos: number): CellPhase {
  if (!cellComplete(cell, counts, ribos)) return 'build';
  if (!labelsDoneCell(labeled, cell)) return 'label';
  if (!quizPassedCell(qs)) return 'quiz';
  return 'done';
}

function progressOf(cell: CellId, counts: Counts, ribos: number): number {
  let have = 0;
  let total = 0;
  for (const d of ORGANELLES) {
    if (!d[cell]) continue;
    total += 1;
    have += d.id === 'ribosome' ? Math.min(1, ribos / RIBO_MIN) : Math.min(1, counts[d.id] / d.need[cell]);
  }
  return total > 0 ? have / total : 0;
}

// ------------------------------------------------------------------ layout --

function makeLayout(w: number, h: number): Layout {
  const rows = w < 720 ? 2 : 1;
  const itemR = w < 560 ? 27 : 34;
  const trayTop = h - (rows === 2 ? 118 : 74);
  const gapX = itemR * 2 + 10;
  const slots: { x: number; y: number }[] = [];
  for (let i = 0; i < ORG_ORDER.length; i += 1) {
    const row = rows === 1 ? 0 : i < 5 ? 0 : 1;
    const col = rows === 1 ? i : i % 5;
    const rowCount = rows === 1 ? 9 : row === 0 ? 5 : 4;
    const rowX0 = (w - rowCount * gapX) / 2 + gapX / 2;
    const y = rows === 1 ? trayTop + itemR + 6 : trayTop + itemR + 4 + row * (itemR * 2 + 10);
    slots.push({ x: rowX0 + col * gapX, y });
  }
  const areaTop = 14;
  const areaBot = trayTop - 10;
  const cy = (areaTop + areaBot) / 2;
  const pw = clamp(w * 0.5, 168, 380);
  const ph = clamp((areaBot - areaTop) * 0.7, 118, 250);
  const rx = clamp(w * 0.27, 88, 165);
  const ry = clamp((areaBot - areaTop) * 0.4, 74, 148);
  const pr = clamp(w * 0.055, 20, 30);
  return {
    w, h, trayTop, itemR, slots,
    cx: w / 2, cy,
    pw: Math.min(pw, w - 90),
    ph: Math.min(ph, areaBot - areaTop - 6),
    rx: Math.min(rx, (w - 80) / 2),
    ry,
    wallB: clamp(ph * 0.055, 7, 12),
    prev: { x: w - pr - 12, y: pr + 20, r: pr },
  };
}

function freshCells(): Record<CellId, CellSim> {
  return {
    plant: { cyto: 0, pourLoop: false, wallT: 1, memT: 1, wob: 0, ribos: [] },
    animal: { cyto: 0, pourLoop: false, wallT: 1, memT: 1, wob: 0, ribos: [] },
  };
}

function freshSim(): Sim {
  return {
    time: 0, uiAcc: 0,
    layoutW: 0, layoutH: 0,
    layout: makeLayout(800, 500),
    active: 'plant',
    cells: freshCells(),
    insts: [],
    drag: null,
    flights: [],
    hover: null,
    trayHover: -1,
    riboAcc: 0, riboTickAt: 0,
    slideAt: 0,
  };
}

function settleTarget(cell: CellId, type: OrganelleId, idx: number, L: Layout): { x: number; y: number } {
  const spots = (cell === 'plant' ? PLANT_SPOTS : ANIMAL_SPOTS)[type];
  const f = spots && spots.length ? spots[Math.min(idx, spots.length - 1)] : [0, 0];
  if (cell === 'plant') return { x: L.cx - L.pw / 2 + f[0] * L.pw, y: L.cy - L.ph / 2 + f[1] * L.ph };
  return { x: L.cx + f[0] * L.rx, y: L.cy + f[1] * L.ry };
}

function relayout(s: Sim): void {
  s.layout = makeLayout(s.layoutW, s.layoutH);
  const L = s.layout;
  for (const inst of s.insts) {
    const tgt = settleTarget(inst.cell, inst.type, inst.idx, L);
    inst.tx = tgt.x;
    inst.ty = tgt.y;
    inst.scale = cellScale(inst.cell, L);
    if (inst.landed) { inst.x = inst.tx; inst.y = inst.ty; }
  }
  for (const cell of ['plant', 'animal'] as CellId[]) {
    const cs = s.cells[cell];
    for (const d of cs.ribos) clampRibo(d, cell, L);
  }
}

function cellScale(cell: CellId, L: Layout): number {
  return cell === 'plant'
    ? clamp(Math.min(L.pw / 340, L.ph / 240), 0.55, 1)
    : clamp(Math.min(L.rx / 170, L.ry / 150), 0.55, 1);
}

function nucleusR(cell: CellId, L: Layout): number {
  return cell === 'plant' ? clamp(L.ph * 0.17, 15, 34) : clamp(L.ry * 0.26, 15, 34);
}

function vesR(cell: CellId, L: Layout): number {
  return clamp(7 * cellScale(cell, L) + 2, 6.5, 11);
}

function insideCell(cell: CellId, L: Layout, x: number, y: number): boolean {
  if (cell === 'plant') return Math.abs(x - L.cx) <= L.pw / 2 + 24 && Math.abs(y - L.cy) <= L.ph / 2 + 24;
  return Math.hypot((x - L.cx) / (L.rx + 18), (y - L.cy) / (L.ry + 18)) <= 1;
}

function clampRibo(d: RiboDot, cell: CellId, L: Layout): void {
  if (cell === 'plant') {
    const x0 = L.cx - L.pw / 2 + L.wallB + 12;
    const x1 = L.cx + L.pw / 2 - L.wallB - 12;
    const y0 = L.cy - L.ph / 2 + L.wallB + 12;
    const y1 = L.cy + L.ph / 2 - L.wallB - 12;
    d.x = clamp(d.x, x0, x1);
    d.y = clamp(d.y, y0, y1);
  } else {
    const rn = Math.hypot((d.x - L.cx) / (L.rx * 0.72), (d.y - L.cy) / (L.ry * 0.72));
    if (rn > 1) {
      d.x = L.cx + (d.x - L.cx) / rn;
      d.y = L.cy + (d.y - L.cy) / rn;
    }
  }
}

function hitTest(s: Sim, cell: CellId, counts: Counts, x: number, y: number): OrganelleId | null {
  const L = s.layout;
  const instHit = (r: number) => (inst: OrgInst) => Math.hypot(x - inst.x, y - inst.y) <= r;
  for (const type of ['nucleus', 'vesicle', 'mitochondrion', 'chloroplast'] as OrganelleId[]) {
    const r = type === 'nucleus' ? nucleusR(cell, L) + 12
      : type === 'vesicle' ? vesR(cell, L) + 9
        : 22 * cellScale(cell, L) + 8;
    if (s.insts.some((inst) => inst.cell === cell && inst.type === type && instHit(r)(inst))) return type;
  }
  for (const inst of s.insts) {
    if (inst.cell !== cell || inst.type !== 'vacuole') continue;
    const vrx = L.pw * 0.26 + 12;
    const vry = L.ph * 0.3 + 12;
    if (((x - inst.x) / vrx) ** 2 + ((y - inst.y) / vry) ** 2 <= 1) return 'vacuole';
  }
  const cs = s.cells[cell];
  if (cs.ribos.some((d) => Math.hypot(x - d.x, y - d.y) <= 15)) return 'ribosome';
  if (cell === 'plant') {
    const dx = x - L.cx;
    const dy = y - L.cy;
    if (Math.abs(dx) > L.pw / 2 || Math.abs(dy) > L.ph / 2) return null;
    const edge = Math.min(L.pw / 2 - Math.abs(dx), L.ph / 2 - Math.abs(dy));
    if (counts.wall > 0) {
      if (edge <= L.wallB * 0.9) return 'wall';
      if (counts.membrane > 0 && edge <= L.wallB + 9) return 'membrane';
    }
  } else {
    const rn = Math.hypot((x - L.cx) / L.rx, (y - L.cy) / L.ry);
    if (rn > 1.14) return null;
    if (counts.membrane > 0 && rn >= 0.8) return 'membrane';
  }
  if (counts.cytoplasm > 0) return 'cytoplasm';
  return null;
}

function boundaryPoint(cell: CellId, L: Layout, ax: number, ay: number, inset: number): { x: number; y: number } {
  const ux = ax - L.cx;
  const uy = ay - L.cy;
  const len = Math.hypot(ux, uy) || 1;
  const nx = ux / len;
  const ny = uy / len;
  if (cell === 'plant') {
    const t = 1 / Math.max(Math.abs(nx) / (L.pw / 2), Math.abs(ny) / (L.ph / 2));
    return { x: L.cx + nx * (t - inset), y: L.cy + ny * (t - inset) };
  }
  const t = 1 / Math.hypot(nx / L.rx, ny / L.ry);
  const k = Math.max(0.15, t - inset / Math.min(L.rx, L.ry));
  return { x: L.cx + nx * L.rx * k, y: L.cy + ny * L.ry * k };
}

function chipAnchor(type: OrganelleId, cell: CellId, L: Layout): { x: number; y: number } {
  const a = (cell === 'plant' ? PLANT_CHIP : ANIMAL_CHIP)[type] ?? 0;
  const x = cell === 'plant'
    ? L.cx + Math.cos(a) * (L.pw / 2 + 34)
    : L.cx + Math.cos(a) * (L.rx + 40);
  const y = cell === 'plant'
    ? L.cy + Math.sin(a) * (L.ph / 2 + 26)
    : L.cy + Math.sin(a) * (L.ry + 30);
  return { x: clamp(x, 44, L.w - 44), y: clamp(y, 18, L.trayTop - 42) };
}

const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
const easeOutBack = (k: number) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

// --------------------------------------------------------- canvas helpers ---

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The animal cell's soft undulating blob (scale < 1 gives the inner line). */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, t: number, k = 1) {
  const N = 10;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const wob = 1 + 0.055 * Math.sin(t * 0.8 + i * 2.1) + 0.03 * Math.sin(t * 0.5 + i * 1.3 + 1.7);
    pts.push({ x: cx + Math.cos(a) * rx * wob * k, y: cy + Math.sin(a) * ry * wob * k });
  }
  ctx.beginPath();
  ctx.moveTo((pts[0].x + pts[N - 1].x) / 2, (pts[0].y + pts[N - 1].y) / 2);
  for (let i = 0; i < N; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % N];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
}

function drawBench(ctx: CanvasRenderingContext2D, L: Layout) {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, '#eef2f6');
  g.addColorStop(1, '#e2e8ee');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.strokeStyle = '#d3dbe3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(L.w, 90);
  ctx.stroke();
  // bench front under the tray
  ctx.fillStyle = '#dde4ea';
  ctx.fillRect(0, L.h - 14, L.w, 14);
  ctx.strokeStyle = '#c2ccd6';
  ctx.beginPath();
  ctx.moveTo(0, L.h - 14);
  ctx.lineTo(L.w, L.h - 14);
  ctx.stroke();
}

function drawNucleus(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r);
  g.addColorStop(0, '#f0d7e8');
  g.addColorStop(0.55, '#c886ae');
  g.addColorStop(1, '#92527d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6d3a58';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const nr = r * 0.42;
  const nx = x + r * 0.18;
  const ny = y + r * 0.1;
  const g2 = ctx.createRadialGradient(nx - nr * 0.3, ny - nr * 0.3, nr * 0.15, nx, ny, nr);
  g2.addColorStop(0, '#7c425f');
  g2.addColorStop(1, '#5b2c44');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(nx, ny, nr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function drawMitochondrion(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = 26 * s;
  const h = 15 * s;
  const g = ctx.createLinearGradient(0, -h, 0, h);
  g.addColorStop(0, '#f2b077');
  g.addColorStop(0.5, '#dd8848');
  g.addColorStop(1, '#b05f2c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a4a20';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  // folded inner membranes (cristae)
  ctx.strokeStyle = '#7a3d1d';
  ctx.lineWidth = 1.3 * s;
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const xx = -w * 0.62 + (w * 1.24 / 4) * i;
    ctx.moveTo(xx, -h * 0.55);
    ctx.lineTo(xx + w * 0.14, h * 0.55);
  }
  ctx.stroke();
  ctx.restore();
}

function drawChloroplast(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const w = 24 * s;
  const h = 13 * s;
  const g = ctx.createLinearGradient(0, -h, 0, h);
  g.addColorStop(0, '#a8d97f');
  g.addColorStop(0.5, '#7cbf58');
  g.addColorStop(1, '#4e9440');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.quadraticCurveTo(0, -h * 1.35, w, 0);
  ctx.quadraticCurveTo(0, h * 1.35, -w, 0);
  ctx.fill();
  ctx.strokeStyle = '#3f7a33';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  // stacked grana
  ctx.fillStyle = '#2c6234';
  for (let i = -1; i <= 1; i += 1) {
    const gx = i * w * 0.45;
    for (let j = 0; j < 3; j += 1) {
      roundRect(ctx, gx - 2 * s, -h * 0.45 + j * h * 0.38, 4 * s, h * 0.26, 1.2 * s);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawVacuole(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, t: number) {
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.3, ry * 0.2, x, y, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(224,240,250,0.96)');
  g.addColorStop(0.7, 'rgba(190,220,242,0.88)');
  g.addColorStop(1, 'rgba(156,198,229,0.92)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7fa8c9';
  ctx.lineWidth = 2;
  ctx.stroke();
  // shimmering glints
  const a1 = 0.35 + 0.25 * Math.sin(t * 1.1);
  ctx.fillStyle = `rgba(255,255,255,${a1.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.35 + Math.sin(t * 0.6) * 4, y - ry * 0.35 + Math.cos(t * 0.5) * 3, rx * 0.18, ry * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  const a2 = 0.22 + 0.18 * Math.sin(t * 0.9 + 2);
  ctx.fillStyle = `rgba(255,255,255,${a2.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.25, y + ry * 0.3, rx * 0.1, ry * 0.07, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawVesicle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, '#f4f9fc');
  g.addColorStop(1, '#bcd7e8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7fa3bd';
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

function drawWallIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const w = 30 * s;
  const h = 30 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#d7e4c3';
  roundRect(ctx, -w / 2, -h / 2, w, h, 5 * s);
  ctx.fill();
  ctx.strokeStyle = '#7f9b6a';
  ctx.lineWidth = 1.8 * s;
  ctx.stroke();
  ctx.strokeStyle = '#a4bd8a';
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  for (const f of [-1, 1]) {
    ctx.moveTo(-w / 2 + 3 * s, f * (h / 2 - 6 * s));
    ctx.lineTo(w / 2 - 3 * s, f * (h / 2 - 6 * s));
  }
  ctx.stroke();
  ctx.strokeStyle = '#6e8a58';
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const c = 8 * s;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    ctx.moveTo(sx * (w / 2 - 3 * s) - sx * c, sy * (h / 2 - 3 * s));
    ctx.lineTo(sx * (w / 2 - 3 * s), sy * (h / 2 - 3 * s));
    ctx.lineTo(sx * (w / 2 - 3 * s), sy * (h / 2 - 3 * s) - sy * c);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMembraneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const w = 30 * s;
  const h = 22 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2.6 * s;
  roundRect(ctx, -w / 2, -h / 2, w, h, 8 * s);
  ctx.stroke();
  ctx.strokeStyle = '#f5b642';
  ctx.lineWidth = 1.3 * s;
  roundRect(ctx, -w / 2 + 4 * s, -h / 2 + 4 * s, w - 8 * s, h - 8 * s, 6 * s);
  ctx.stroke();
  ctx.restore();
}

function drawJar(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const w = 22 * s;
  const h = 24 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#fdf3dd';
  roundRect(ctx, -w / 2, -h / 2 + 4 * s, w, h - 4 * s, 4 * s);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.fillStyle = '#e9d9b0';
  roundRect(ctx, -w / 2 + 3 * s, -h / 2 + 8 * s, w - 6 * s, h - 13 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = '#c9b48c';
  roundRect(ctx, -w / 2 - 1.5 * s, -h / 2, w + 3 * s, 5 * s, 2 * s);
  ctx.fill();
  ctx.strokeStyle = '#a98f66';
  ctx.lineWidth = 1 * s;
  ctx.stroke();
  ctx.restore();
}

function drawShaker(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const w = 18 * s;
  const h = 22 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 0.8) * 0.06);
  ctx.fillStyle = 'rgba(59,91,126,0.16)';
  roundRect(ctx, -w / 2, -h / 2 + 5 * s, w, h - 5 * s, 4 * s);
  ctx.fill();
  ctx.strokeStyle = '#5b6b7d';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.fillStyle = '#3b5b7e';
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.arc(-w / 4 + (i % 2) * w / 2, -h / 2 + 2.6 * s + Math.floor(i / 2) * 3.4 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8da8b9';
  roundRect(ctx, -w / 2 - 1.5 * s, -h / 2 - 5 * s, w + 3 * s, 6 * s, 2.5 * s);
  ctx.fill();
  ctx.strokeStyle = '#5b6b7d';
  ctx.stroke();
  ctx.restore();
}

function drawVesicleIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  drawVesicle(ctx, x - 8 * s, y + 4 * s, 5.5 * s);
  drawVesicle(ctx, x + 7 * s, y - 3 * s, 6.5 * s);
  drawVesicle(ctx, x + 1 * s, y + 8 * s, 4.5 * s);
}

function drawTrayItem(ctx: CanvasRenderingContext2D, type: OrganelleId, x: number, y: number, s: number, t: number) {
  switch (type) {
    case 'wall':
      drawWallIcon(ctx, x, y, s);
      break;
    case 'membrane':
      drawMembraneIcon(ctx, x, y, s);
      break;
    case 'cytoplasm':
      drawJar(ctx, x, y, s);
      break;
    case 'nucleus':
      drawNucleus(ctx, x, y, 12 * s);
      break;
    case 'mitochondrion':
      drawMitochondrion(ctx, x, y, -0.3, s * 0.62);
      break;
    case 'chloroplast':
      drawChloroplast(ctx, x, y, 0.25, s * 0.62);
      break;
    case 'vacuole':
      drawVacuole(ctx, x, y, 14 * s, 9 * s, t);
      break;
    case 'vesicle':
      drawVesicleIcon(ctx, x, y, s);
      break;
    case 'ribosome':
      drawShaker(ctx, x, y, s, t);
      break;
  }
}

function drawPlantWall(ctx: CanvasRenderingContext2D, L: Layout, t: number, growT: number, wob: number, ghost: boolean) {
  const hw = L.pw / 2;
  const hh = L.ph / 2;
  const B = L.wallB;
  const jx = wob > 0 ? Math.sin(t * 22) * wob * 3 : 0;
  ctx.save();
  ctx.translate(L.cx + jx, L.cy - jx * 0.6);
  if (ghost) {
    ctx.fillStyle = 'rgba(215,228,195,0.28)';
    roundRect(ctx, -hw, -hh, L.pw, L.ph, 16);
    ctx.fill();
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = -t * 18;
    ctx.strokeStyle = '#9db385';
    ctx.lineWidth = 2.4;
    roundRect(ctx, -hw, -hh, L.pw, L.ph, 16);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const e = easeOutBack(Math.min(1, growT));
    ctx.scale(0.93 + 0.07 * e, 0.93 + 0.07 * e);
    ctx.globalAlpha = Math.min(1, growT * 2.5);
    ctx.fillStyle = '#d7e4c3';
    roundRect(ctx, -hw, -hh, L.pw, L.ph, 16);
    ctx.fill();
    ctx.strokeStyle = '#7f9b6a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = '#a4bd8a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = -hw + 20; x < hw - 10; x += 24) {
      ctx.moveTo(x, -hh + 1.5);
      ctx.lineTo(x, -hh + B - 1.5);
      ctx.moveTo(x, hh - B + 1.5);
      ctx.lineTo(x, hh - 1.5);
    }
    for (let y = -hh + 20; y < hh - 10; y += 24) {
      ctx.moveTo(-hw + 1.5, y);
      ctx.lineTo(-hw + B - 1.5, y);
      ctx.moveTo(hw - B + 1.5, y);
      ctx.lineTo(hw - 1.5, y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#6e8a58';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const cB = 15;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
      ctx.moveTo(sx * (hw - 4) - sx * cB, sy * (hh - 4));
      ctx.lineTo(sx * (hw - 4), sy * (hh - 4));
      ctx.lineTo(sx * (hw - 4), sy * (hh - 4) - sy * cB);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlantMembrane(ctx: CanvasRenderingContext2D, L: Layout, t: number, growT: number, wob: number, ghost: boolean) {
  const hw = L.pw / 2;
  const hh = L.ph / 2;
  const B = L.wallB;
  const jx = wob > 0 ? Math.sin(t * 20 + 1.3) * wob * 3 : 0;
  ctx.save();
  ctx.translate(L.cx + jx, L.cy + jx * 0.5);
  const inset = ghost ? 6 : B + 2;
  const e = easeOutBack(Math.min(1, growT));
  ctx.globalAlpha = ghost ? 0.8 : Math.min(1, growT * 2.5);
  if (ghost) {
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -t * 14;
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    roundRect(ctx, -hw + inset, -hh + inset, L.pw - 2 * inset, L.ph - 2 * inset, 12);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.scale(0.95 + 0.05 * e, 0.95 + 0.05 * e);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    roundRect(ctx, -hw + inset, -hh + inset, L.pw - 2 * inset, L.ph - 2 * inset, 12);
    ctx.stroke();
    ctx.strokeStyle = '#f5b642';
    ctx.lineWidth = 1.5;
    const inset2 = inset + 4;
    roundRect(ctx, -hw + inset2, -hh + inset2, L.pw - 2 * inset2, L.ph - 2 * inset2, 10);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCytoplasm(ctx: CanvasRenderingContext2D, L: Layout, cell: CellId, cs: CellSim, t: number) {
  const B = L.wallB;
  const clip = () => {
    if (cell === 'plant') {
      roundRect(ctx, L.cx - L.pw / 2 + B + 4, L.cy - L.ph / 2 + B + 4, L.pw - 2 * (B + 4), L.ph - 2 * (B + 4), 12);
    } else {
      blobPath(ctx, L.cx, L.cy, L.rx, L.ry, t, 0.9);
    }
  };
  const iw = cell === 'plant' ? L.pw / 2 - B - 4 : L.rx * 0.9;
  const ih = cell === 'plant' ? L.ph / 2 - B - 4 : L.ry * 0.9;
  ctx.save();
  clip();
  ctx.clip();
  const base = cell === 'plant' ? ['#f0f7e4', '#e3efcf'] : ['#fdeee2', '#f7e2cf'];
  const g = ctx.createLinearGradient(L.cx - iw, L.cy - ih, L.cx + iw, L.cy + ih);
  g.addColorStop(0, base[0]);
  g.addColorStop(1, base[1]);
  ctx.globalAlpha = Math.min(1, cs.cyto * 1.4);
  ctx.fillStyle = g;
  ctx.fillRect(L.cx - iw - 8, L.cy - ih - 8, 2 * iw + 16, 2 * ih + 16);
  ctx.globalAlpha = 1;
  if (cs.cyto < 1) {
    const kr = easeOutCubic(cs.cyto);
    const maxR = Math.hypot(iw, ih) * 1.05;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, kr * maxR, 0, Math.PI * 2);
    ctx.stroke();
  }
  // living shimmer — always drifting, even when idle
  for (let i = 0; i < 3; i += 1) {
    const px = L.cx + Math.sin(t * 0.32 + i * 2.4) * iw * 0.32;
    const py = L.cy + Math.cos(t * 0.27 + i * 1.9) * ih * 0.32;
    const pr = (iw + ih) * 0.17;
    const a = 0.1 + 0.05 * Math.sin(t * 0.9 + i * 2);
    const rg = ctx.createRadialGradient(px, py, 0, px, py, pr);
    rg.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPreview(ctx: CanvasRenderingContext2D, L: Layout, cell: CellId, counts: Counts, ribos: number, complete: boolean, t: number) {
  const { x, y, r } = L.prev;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(23,35,52,0.1)';
  ctx.beginPath();
  ctx.ellipse(2, r * 0.8, r * 0.9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (cell === 'plant') {
    const w = r * 2;
    const h = r * 1.35;
    ctx.fillStyle = complete ? 'rgba(215,228,195,0.85)' : 'rgba(215,228,195,0.35)';
    roundRect(ctx, -w / 2, -h / 2, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = complete ? '#7f9b6a' : '#b3c4a1';
    ctx.lineWidth = 2;
    if (!complete) {
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -t * 10;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = complete ? 'rgba(253,238,226,0.9)' : 'rgba(253,238,226,0.4)';
    blobPath(ctx, 0, 0, r * 0.95, r * 0.72, t, 1);
    ctx.fill();
    ctx.strokeStyle = complete ? '#d97706' : '#dcb37c';
    ctx.lineWidth = 2;
    if (!complete) {
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -t * 10;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // mini organelles appear as the real cell gains them
  const rr = r / 30;
  if (counts.nucleus > 0) drawNucleus(ctx, -r * 0.15, -r * 0.05, 6.5 * rr * 3);
  if (counts.mitochondrion > 0) drawMitochondrion(ctx, r * 0.3, -r * 0.25, -0.3, rr * 1.9);
  if (counts.mitochondrion > 1) drawMitochondrion(ctx, -r * 0.4, r * 0.3, 0.25, rr * 1.9);
  if (counts.chloroplast > 0) drawChloroplast(ctx, r * 0.42, r * 0.3, 0.2, rr * 1.9);
  if (counts.chloroplast > 1) drawChloroplast(ctx, -r * 0.45, -r * 0.35, -0.2, rr * 1.9);
  if (counts.vacuole > 0) drawVacuole(ctx, r * 0.15, r * 0.28, r * 0.34, r * 0.2, t);
  if (counts.vesicle > 0) drawVesicle(ctx, -r * 0.45, r * 0.15, 3.5 * rr * 1.6);
  if (counts.vesicle > 1) drawVesicle(ctx, r * 0.5, -r * 0.3, 3.5 * rr * 1.6);
  if (counts.vesicle > 2) drawVesicle(ctx, r * 0.1, -r * 0.5, 3 * rr * 1.6);
  if (ribos > 0) {
    ctx.fillStyle = '#3b5b7e';
    const n = Math.min(10, Math.ceil((ribos / RIBO_MIN) * 10));
    for (let i = 0; i < n; i += 1) {
      const a = (i / 10) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.45, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // completeness ring
  const frac = progressOf(cell, counts, ribos);
  if (frac > 0) {
    ctx.strokeStyle = complete ? '#34c759' : '#f97316';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// --------------------------------------------------------------- component ---

const meta = getLabBySlug('build-a-cell')!;

export default function CellBuilderLab() {
  // ---- simulation state (refs — the canvas loop owns the animation) -------
  const sim = useRef<Sim>(freshSim());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chipRefs = useRef(new Map<OrganelleId, HTMLSpanElement>());
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const celebrated = useRef({ plant: false, animal: false, labelsP: false, labelsA: false, quizP: false, quizA: false });

  // ---- student state -------------------------------------------------------
  const [activeCell, setActiveCell] = useState<CellId>('plant');
  const [placed, setPlaced] = useState<PlacedMap>({ plant: zeroCounts(), animal: zeroCounts() });
  const [labels, setLabels] = useState<LabelMap>({ plant: {}, animal: {} });
  const [firstTry, setFirstTry] = useState<Record<CellId, boolean>>({ plant: true, animal: true });
  const [quiz, setQuiz] = useState<Record<CellId, QuizQ[]>>(freshQuiz);
  const [cursor, setCursor] = useState<Record<CellId, number>>({ plant: 0, animal: 0 });
  const [picks, setPicks] = useState<string[]>(['', '', '']);
  const [concluded, setConcluded] = useState(false);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [choseCell, setChoseCell] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [flash, setFlash] = useState<{ tone: CoachTone; line: string } | null>(null);
  const [dragLabel, setDragLabel] = useState<OrganelleId | null>(null);
  const [ui, setUi] = useState<UiSnap>({ active: 'plant', dragging: false, hovering: null, ribos: { plant: 0, animal: 0 }, cyto: 0, progress: 0 });

  const placedRef = useRef(placed);
  placedRef.current = placed;

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
    const cell = s.active;
    const counts = placedRef.current[cell];
    setUi({
      active: cell,
      dragging: !!s.drag,
      hovering: s.hover,
      ribos: { plant: s.cells.plant.ribos.length, animal: s.cells.animal.ribos.length },
      cyto: s.cells[cell].cyto,
      progress: progressOf(cell, counts, s.cells[cell].ribos.length),
    });
  }, []);

  // ---- derived phases ------------------------------------------------------
  const phases = useMemo(() => ({
    plant: phaseOfCell('plant', placed.plant, labels.plant, quiz.plant, ui.ribos.plant),
    animal: phaseOfCell('animal', placed.animal, labels.animal, quiz.animal, ui.ribos.animal),
  }), [placed, labels, quiz, ui.ribos]);
  const phase = phases[activeCell];
  const otherCell: CellId = activeCell === 'plant' ? 'animal' : 'plant';
  const keyList = useMemo(() => labelListOf(activeCell), [activeCell]);

  // ---- placing parts (shared by real drops and the assist button) ---------
  const placePart = (cell: CellId, type: OrganelleId, fromX: number, fromY: number): boolean => {
    const s = sim.current;
    const L = s.layout;
    const counts = placed[cell];
    if (type === 'cytoplasm') {
      const cs = s.cells[cell];
      cs.cyto = 0.001;
      cs.pourLoop = true;
      labSound.slosh(0.75);
      labSound.startLoop('pour');
      labSound.drip(true);
    } else if (type === 'wall') {
      s.cells[cell].wallT = 0.001;
      labSound.thunk(false);
    } else if (type === 'membrane') {
      s.cells[cell].memT = 0.001;
      labSound.glassClink(true);
    } else {
      const idx = counts[type];
      const tgt = settleTarget(cell, type, idx, L);
      s.insts.push({
        key: `${cell}:${type}:${idx}`,
        type, cell, idx,
        x: fromX, y: fromY, fx: fromX, fy: fromY,
        tx: tgt.x, ty: tgt.y,
        t: 0, landed: false,
        rot: type === 'mitochondrion' ? -0.3 + idx * 0.55 : type === 'chloroplast' ? 0.35 - idx * 0.5 : 0,
        phase: Math.random() * Math.PI * 2,
        wobble: 0, pulse: 0,
        scale: cellScale(cell, L),
      });
      labSound.glassClink(true);
    }
    setPlaced((cur) => ({ ...cur, [cell]: { ...cur[cell], [type]: cur[cell][type] + 1 } }));
    setChoseCell(true);
    return true;
  };

  const flyHome = (type: OrganelleId, x: number, y: number) => {
    const s = sim.current;
    const slot = s.layout.slots[ORG_ORDER.indexOf(type)];
    s.flights.push({ type, x, y, fx: x, fy: y, tx: slot.x, ty: slot.y, t: 0 });
    labSound.slide(0.4);
  };

  /** Gate one dropped tray part honestly: wrong cell, prerequisites, duplicates. */
  const dropPart = (type: OrganelleId, x: number, y: number): boolean => {
    const s = sim.current;
    const cell = activeCell;
    const L = s.layout;
    const counts = placed[cell];
    const def = ORG[type];
    if (!def[cell]) {
      labSound.warn();
      setFlash({ tone: 'warn', line: WRONG_CELL_LINE[`${type}:${cell}`] ?? 'That part does not belong in this cell — it flies home.' });
      flyHome(type, x, y);
      return false;
    }
    if (type === 'membrane' && cell === 'plant' && counts.wall === 0) {
      labSound.warn();
      setFlash({ tone: 'warn', line: 'Hang the cell wall first — the membrane hugs the inside of it.' });
      flyHome(type, x, y);
      return false;
    }
    if (type === 'cytoplasm' && counts.membrane === 0) {
      labSound.warn();
      setFlash({ tone: 'warn', line: 'The jelly needs a skin to sit in — place the cell membrane before pouring the cytoplasm.' });
      flyHome(type, x, y);
      return false;
    }
    if (type !== 'cytoplasm' && type !== 'wall' && type !== 'membrane' && type !== 'ribosome' && counts.cytoplasm === 0) {
      labSound.warn();
      setFlash({ tone: 'warn', line: 'Pour the cytoplasm first — organelles float in the living jelly.' });
      flyHome(type, x, y);
      return false;
    }
    if (type !== 'ribosome' && counts[type] >= def.need[cell]) {
      labSound.warn();
      setFlash({ tone: 'warn', line: DUP_LINE[type] });
      flyHome(type, x, y);
      return false;
    }
    if (!insideCell(cell, L, x, y)) {
      flyHome(type, x, y);
      return false;
    }
    return placePart(cell, type, x, y);
  };

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

    // ribosome shaker: sprinkle while held inside the cell
    if (s.drag && s.drag.type === 'ribosome') {
      const cell = s.active;
      const cs = s.cells[cell];
      if (cs.cyto > 0.15 && insideCell(cell, L, s.drag.x, s.drag.y) && cs.ribos.length < RIBO_CAP) {
        s.riboAcc += dt * 16;
        while (s.riboAcc >= 1) {
          s.riboAcc -= 1;
          const d: RiboDot = {
            x: s.drag.x + (Math.random() - 0.5) * 16,
            y: s.drag.y + (Math.random() - 0.5) * 16,
            vx: (Math.random() - 0.5) * 34,
            vy: (Math.random() - 0.5) * 34,
          };
          clampRibo(d, cell, L);
          cs.ribos.push(d);
        }
        if (s.time - s.riboTickAt > 0.22) {
          s.riboTickAt = s.time;
          labSound.tick();
        }
      }
    }

    // cytoplasm pour + boundary grow-ins + wobble decay
    for (const cell of ['plant', 'animal'] as CellId[]) {
      const cs = s.cells[cell];
      if (cs.cyto > 0 && cs.cyto < 1) {
        cs.cyto = Math.min(1, cs.cyto + dt / 1.25);
        if (cs.cyto >= 1 && cs.pourLoop) {
          cs.pourLoop = false;
          labSound.stopLoop();
          labSound.slosh(0.5);
          labSound.glassClink(true);
        }
      }
      if (cs.wallT > 0 && cs.wallT < 1) cs.wallT = Math.min(1, cs.wallT + dt / 0.4);
      if (cs.memT > 0 && cs.memT < 1) cs.memT = Math.min(1, cs.memT + dt / 0.4);
      cs.wob = Math.max(0, cs.wob - dt * 1.1);
      // dots ride the cytoplasm current
      const damp = Math.exp(-3.2 * dt);
      for (const d of cs.ribos) {
        const fx = Math.sin(d.y * 0.02 + s.time * 0.4) * 6;
        const fy = Math.cos(d.x * 0.02 + s.time * 0.33) * 6;
        d.vx *= damp;
        d.vy *= damp;
        d.x += (d.vx + fx) * dt;
        d.y += (d.vy + fy) * dt;
        clampRibo(d, cell, L);
      }
    }

    // instances: settle flight, then idle drift
    for (const inst of s.insts) {
      if (!inst.landed) {
        inst.t += dt;
        const k = Math.min(1, inst.t / 0.45);
        const e = easeOutCubic(k);
        inst.x = inst.fx + (inst.tx - inst.fx) * e;
        inst.y = inst.fy + (inst.ty - inst.fy) * e;
        if (k >= 1) {
          inst.landed = true;
          labSound.thunk(true);
        }
      } else {
        const amp = DRIFT[inst.type] ?? 2;
        inst.x = inst.tx + Math.sin(s.time * 0.5 + inst.phase) * amp;
        inst.y = inst.ty + Math.cos(s.time * 0.42 + inst.phase * 1.3) * amp * 0.8;
        if (inst.type === 'mitochondrion') inst.rot += Math.sin(s.time * 0.4 + inst.phase) * 0.0009;
      }
      inst.wobble = Math.max(0, inst.wobble - dt * 1.1);
      inst.pulse = Math.max(0, inst.pulse - dt * 1.6);
    }

    // rejected parts flying home
    for (let i = s.flights.length - 1; i >= 0; i -= 1) {
      const f = s.flights[i];
      f.t += dt;
      const k = Math.min(1, f.t / 0.5);
      const e = easeOutCubic(k);
      f.x = f.fx + (f.tx - f.fx) * e;
      f.y = f.fy + (f.ty - f.fy) * e;
      if (k >= 1) {
        s.flights.splice(i, 1);
        labSound.thunk(true);
      }
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [syncUi]);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const L = s.layout;
    const t = s.time;
    const cell = activeCell;
    const counts = placed[cell];
    const labeled = labels[cell];
    const cs = s.cells[cell];

    drawBench(ctx, L);

    // the other cell's live preview (click to switch)
    drawPreview(ctx, L, otherCell, placed[otherCell], s.cells[otherCell].ribos.length, phases[otherCell] === 'done', t);

    // ---- the active cell ----
    const draggingIn = s.drag && s.drag.type !== 'ribosome' && ORG[s.drag.type][cell] && insideCell(cell, L, s.drag.x, s.drag.y);
    if (cell === 'plant') {
      drawPlantWall(ctx, L, t, cs.wallT, cs.wob, counts.wall === 0);
      if (counts.wall > 0 && counts.cytoplasm > 0) drawCytoplasm(ctx, L, 'plant', cs, t);
      else if (counts.wall === 0) {
        ctx.fillStyle = 'rgba(247,244,234,0.4)';
        roundRect(ctx, L.cx - L.pw / 2 + 6, L.cy - L.ph / 2 + 6, L.pw - 12, L.ph - 12, 12);
        ctx.fill();
      }
      if (counts.wall > 0) drawPlantMembrane(ctx, L, t, cs.memT, cs.wob, counts.membrane === 0);
    } else {
      if (counts.cytoplasm > 0) drawCytoplasm(ctx, L, 'animal', cs, t);
      else {
        ctx.fillStyle = 'rgba(253,238,226,0.35)';
        blobPath(ctx, L.cx, L.cy, L.rx, L.ry, t, 0.92);
        ctx.fill();
      }
      const jx = cs.wob > 0 ? Math.sin(t * 20) * cs.wob * 3 : 0;
      ctx.save();
      ctx.translate(jx, -jx * 0.5);
      if (counts.membrane > 0) {
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 3.5;
        blobPath(ctx, L.cx, L.cy, L.rx, L.ry, t, 1);
        ctx.stroke();
        ctx.strokeStyle = '#f5b642';
        ctx.lineWidth = 1.5;
        blobPath(ctx, L.cx, L.cy, L.rx, L.ry, t, 0.88);
        ctx.stroke();
      } else {
        ctx.setLineDash([8, 7]);
        ctx.lineDashOffset = -t * 18;
        ctx.strokeStyle = '#d9a441';
        ctx.lineWidth = 2.4;
        blobPath(ctx, L.cx, L.cy, L.rx, L.ry, t, 1);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // drop-zone glow while dragging an applicable part over the cell
    if (draggingIn) {
      ctx.save();
      if (cell === 'plant') {
        roundRect(ctx, L.cx - L.pw / 2 + L.wallB + 4, L.cy - L.ph / 2 + L.wallB + 4, L.pw - 2 * (L.wallB + 4), L.ph - 2 * (L.wallB + 4), 12);
      } else {
        blobPath(ctx, L.cx, L.cy, L.rx, L.ry, t, 0.9);
      }
      ctx.clip();
      ctx.fillStyle = 'rgba(249,115,22,0.08)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // ribosome dots
    ctx.fillStyle = '#3b5b7e';
    for (const d of cs.ribos) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // organelle instances (vacuole behind, nucleus on top)
    const drawOrder: OrganelleId[] = ['vacuole', 'chloroplast', 'mitochondrion', 'vesicle', 'nucleus'];
    for (const type of drawOrder) {
      for (const inst of s.insts) {
        if (inst.cell !== cell || inst.type !== type) continue;
        const ox = inst.wobble > 0 ? Math.sin(t * 24 + inst.phase) * inst.wobble * 5 : 0;
        const oy = inst.wobble > 0 ? Math.cos(t * 21 + inst.phase) * inst.wobble * 4 : 0;
        const grow = inst.landed ? 1 + inst.pulse * 0.18 : easeOutBack(Math.min(1, inst.t / 0.45));
        const sc = inst.scale * grow;
        if (type === 'nucleus') {
          drawNucleus(ctx, inst.x + ox, inst.y + oy, nucleusR(cell, L) * grow);
        } else if (type === 'vacuole') {
          drawVacuole(ctx, inst.x + ox, inst.y + oy, L.pw * 0.26 * Math.min(1, grow), L.ph * 0.3 * Math.min(1, grow), t);
        } else if (type === 'mitochondrion') {
          drawMitochondrion(ctx, inst.x + ox, inst.y + oy, inst.rot, sc);
        } else if (type === 'chloroplast') {
          drawChloroplast(ctx, inst.x + ox, inst.y + oy, inst.rot, sc);
        } else {
          drawVesicle(ctx, inst.x + ox, inst.y + oy, vesR(cell, L) * grow);
        }
      }
    }

    // hover highlight during label / quiz phases
    if ((phase === 'label' || phase === 'quiz') && s.hover && !s.drag) {
      const hv = s.hover;
      const pulse = 0.45 + 0.3 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(249,115,22,${pulse.toFixed(3)})`;
      ctx.lineWidth = 2.4;
      if (hv === 'wall') {
        roundRect(ctx, L.cx - L.pw / 2 - 4, L.cy - L.ph / 2 - 4, L.pw + 8, L.ph + 8, 18);
        ctx.stroke();
      } else if (hv === 'membrane') {
        if (cell === 'plant') {
          const inset = L.wallB + 2;
          roundRect(ctx, L.cx - L.pw / 2 + inset - 4, L.cy - L.ph / 2 + inset - 4, L.pw - 2 * inset + 8, L.ph - 2 * inset + 8, 14);
          ctx.stroke();
        } else {
          blobPath(ctx, L.cx, L.cy, L.rx + 5, L.ry + 5, t, 1);
          ctx.stroke();
        }
      } else if (hv === 'cytoplasm') {
        ctx.save();
        if (cell === 'plant') {
          roundRect(ctx, L.cx - L.pw / 2 + L.wallB + 4, L.cy - L.ph / 2 + L.wallB + 4, L.pw - 2 * (L.wallB + 4), L.ph - 2 * (L.wallB + 4), 12);
        } else {
          blobPath(ctx, L.cx, L.cy, L.rx, L.ry, t, 0.9);
        }
        ctx.clip();
        ctx.fillStyle = 'rgba(249,115,22,0.07)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else if (hv === 'ribosome') {
        ctx.fillStyle = '#f97316';
        for (const d of cs.ribos) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (const inst of s.insts) {
          if (inst.cell !== cell || inst.type !== hv) continue;
          const r = hv === 'nucleus' ? nucleusR(cell, L) : hv === 'vesicle' ? vesR(cell, L) : 24 * inst.scale;
          ctx.beginPath();
          ctx.arc(inst.x, inst.y, r + 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // label leader lines + DOM chip anchors
    for (const type of labelListOf(cell)) {
      if (!labeled[type]) continue;
      const a = chipAnchor(type, cell, L);
      const el = chipRefs.current.get(type);
      if (el) el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -50%)`;
      ctx.strokeStyle = 'rgba(122,135,149,0.8)';
      ctx.lineWidth = 1.2;
      const targets: { x: number; y: number }[] = [];
      const insts = s.insts.filter((i) => i.cell === cell && i.type === type);
      if (insts.length) {
        for (const inst of insts) targets.push({ x: inst.x, y: inst.y });
      } else if (type === 'wall' || type === 'membrane') {
        const p = boundaryPoint(cell, L, a.x, a.y, type === 'wall' ? L.wallB * 0.5 : L.wallB + 5);
        targets.push(p);
      } else if (type === 'ribosome' && cs.ribos.length) {
        let best = cs.ribos[0];
        let bd = Infinity;
        for (const d of cs.ribos) {
          const dd = (d.x - a.x) ** 2 + (d.y - a.y) ** 2;
          if (dd < bd) { bd = dd; best = d; }
        }
        targets.push({ x: best.x, y: best.y });
      } else {
        const p = boundaryPoint(cell, L, a.x, a.y, -0.35 * Math.min(cell === 'plant' ? L.pw : L.rx, cell === 'plant' ? L.ph : L.ry));
        targets.push(p);
      }
      for (const p of targets) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- the organelle tray ----
    const boardY = L.h - 14;
    const firstSlot = L.slots[0];
    const lastSlot = L.slots[L.slots.length - 1];
    const trayX0 = Math.min(firstSlot.x, L.slots[4].x) - L.itemR - 12;
    const trayX1 = Math.max(lastSlot.x, L.slots[4].x) + L.itemR + 12;
    const tg = ctx.createLinearGradient(0, boardY - 8, 0, boardY + 8);
    tg.addColorStop(0, '#e2d4b2');
    tg.addColorStop(1, '#c9b48c');
    ctx.fillStyle = tg;
    roundRect(ctx, trayX0, boardY - 8, trayX1 - trayX0, 12, 4);
    ctx.fill();
    ctx.strokeStyle = '#a98f66';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < ORG_ORDER.length; i += 1) {
      const type = ORG_ORDER[i];
      const slot = L.slots[i];
      const taken = s.drag?.type === type;
      const done = type === 'ribosome'
        ? s.cells[cell].ribos.length >= RIBO_MIN
        : placed[cell][type] >= ORG[type].need[cell];
      const bob = Math.sin(t * 1.4 + i * 0.7) * 1.5;
      if (taken) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#c2ccd6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, L.itemR * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.save();
        ctx.globalAlpha = done ? 0.35 : 1;
        const lift = s.trayHover === i ? -4 : 0;
        ctx.fillStyle = 'rgba(23,35,52,0.12)';
        ctx.beginPath();
        ctx.ellipse(slot.x + 2, slot.y + L.itemR * 0.75, L.itemR * 0.7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        drawTrayItem(ctx, type, slot.x, slot.y + bob + lift, L.itemR / 34, t);
        ctx.restore();
      }
      // remaining-count dots for multi-instance parts
      const need = ORG[type].need[cell];
      if (need > 1 && type !== 'ribosome' && !taken) {
        const remaining = Math.max(0, need - placed[cell][type]);
        ctx.fillStyle = remaining > 0 ? '#f97316' : '#b6c1cc';
        for (let j = 0; j < remaining; j += 1) {
          ctx.beginPath();
          ctx.arc(slot.x - (remaining - 1) * 3.5 + j * 7, slot.y + L.itemR + 9, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (s.trayHover === i && !taken) {
        ctx.strokeStyle = `rgba(249,115,22,${(0.4 + 0.25 * Math.sin(t * 5)).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, L.itemR + 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // parts flying home after a rejection
    for (const f of s.flights) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(23,35,52,0.14)';
      ctx.beginPath();
      ctx.ellipse(f.x + 2, f.y + 16, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      drawTrayItem(ctx, f.type, f.x, f.y, L.itemR / 34, t);
      ctx.restore();
    }

    // the part in hand
    if (s.drag) {
      const d = s.drag;
      ctx.save();
      ctx.fillStyle = 'rgba(23,35,52,0.18)';
      ctx.beginPath();
      ctx.ellipse(d.x + 3, d.y + 20, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      drawTrayItem(ctx, d.type, d.x, d.y, (L.itemR / 34) * 1.18, t);
      ctx.restore();
    }
  }, [activeCell, placed, labels, phase, otherCell, phases]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction on the scene --------------------------------------
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
    const L = s.layout;
    if (s.drag) return;
    // tap the preview to switch cells
    if (Math.hypot(p.x - L.prev.x, p.y - L.prev.y) <= L.prev.r + 10) {
      selectCell(otherCell);
      notePointer(true);
      return;
    }
    // grab a tray part (any part may be grabbed — wrong cells teach on drop)
    for (let i = 0; i < ORG_ORDER.length; i += 1) {
      const slot = L.slots[i];
      if (Math.hypot(p.x - slot.x, p.y - slot.y) <= L.itemR + 14) {
        const type = ORG_ORDER[i];
        s.drag = { type, x: p.x, y: p.y };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.creak(0.4);
        notePointer(true);
        syncUi();
        return;
      }
    }
    // quiz answers are taps on organelles in the scene
    if (phase === 'quiz') {
      const hit = hitTest(s, activeCell, placed[activeCell], p.x, p.y);
      if (hit) {
        answerQuiz(hit);
        notePointer(hit === quiz[activeCell][cursor[activeCell]]?.answer);
        return;
      }
      setFlash({ tone: 'info', line: 'Tap an organelle in the scene to answer — the numbered list in the sidebar works too.' });
      notePointer(false);
      return;
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerPos(e);
    if (!p) return;
    const s = sim.current;
    const L = s.layout;
    if (s.drag) {
      s.drag.x = clamp(p.x, 14, L.w - 14);
      s.drag.y = clamp(p.y, 14, L.h - 14);
      const now = performance.now();
      if (now - s.slideAt > 160) {
        s.slideAt = now;
        labSound.slide(0.25);
      }
    } else {
      let trayHover = -1;
      for (let i = 0; i < ORG_ORDER.length; i += 1) {
        const slot = L.slots[i];
        if (Math.hypot(p.x - slot.x, p.y - slot.y) <= L.itemR + 12) { trayHover = i; break; }
      }
      s.trayHover = trayHover;
      s.hover = (phase === 'label' || phase === 'quiz')
        ? hitTest(s, activeCell, placed[activeCell], p.x, p.y)
        : null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      let cursor = 'default';
      if (s.drag) cursor = 'grabbing';
      else if (s.trayHover >= 0 || Math.hypot(p.x - L.prev.x, p.y - L.prev.y) <= L.prev.r + 10) cursor = 'grab';
      else if (s.hover) cursor = 'pointer';
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const d = s.drag;
    if (!d) return;
    s.drag = null;
    if (d.type === 'ribosome') {
      flyHome('ribosome', d.x, d.y);
      syncUi();
      return;
    }
    const ok = dropPart(d.type, d.x, d.y);
    notePointer(ok);
    syncUi();
  };

  // ---- quiz ------------------------------------------------------------------
  const answerQuiz = (type: OrganelleId) => {
    const cell = activeCell;
    const qs = quiz[cell];
    if (qs.every((q) => q.solved)) return;
    const q = qs[cursor[cell]];
    if (!q) return;
    if (type === q.answer) {
      setQuiz((cur) => {
        const next = [...cur[cell]];
        const i = next.findIndex((x) => x.q === q.q);
        next[i] = { ...next[i], taps: next[i].taps + 1, solved: true };
        return { ...cur, [cell]: next };
      });
      labSound.ping(660, 0.14);
      for (const inst of sim.current.insts) {
        if (inst.cell === cell && inst.type === type) inst.pulse = 1;
      }
      if (type === 'wall' || type === 'membrane' || type === 'cytoplasm') sim.current.cells[cell].wob = 0.4;
      setCursor((cur) => {
        const nextIdx = (cur[cell] + 1) % qs.length;
        return { ...cur, [cell]: nextIdx };
      });
    } else {
      setQuiz((cur) => {
        const next = [...cur[cell]];
        const i = next.findIndex((x) => x.q === q.q);
        next[i] = { ...next[i], taps: next[i].taps + 1 };
        return { ...cur, [cell]: next };
      });
      labSound.warn();
      const hitRiddle = type !== q.answer ? ORG[type].riddle : null;
      setFlash({
        tone: 'warn',
        line: hitRiddle
          ? `${cap(type)} — not quite: ${hitRiddle}. The question asks: ${q.q}`
          : `Look again — ${q.q} Tap the part it describes in the scene.`,
      });
      for (const inst of sim.current.insts) {
        if (inst.cell === cell && inst.type === type) inst.wobble = 1;
      }
    }
  };

  // ---- label drag (DOM chips onto the canvas) ------------------------------
  const beginLabelDrag = (e: React.PointerEvent<HTMLButtonElement>, type: OrganelleId) => {
    if (labels[activeCell][type] || phase !== 'label') return;
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    setDragLabel(type);
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.display = 'block';
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    }
    labSound.creak(0.3);
    notePointer(true);
  };

  const moveLabelDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragLabel) return;
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const s = sim.current;
    s.hover = (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height)
      ? hitTest(s, activeCell, placed[activeCell], x, y)
      : null;
  };

  const endLabelDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragLabel) return;
    const type = dragLabel;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const ghost = ghostRef.current;
    if (ghost) ghost.style.display = 'none';
    setDragLabel(null);
    const s = sim.current;
    s.hover = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setFlash({ tone: 'info', line: 'Drop the chip on the scene — right on the part it names.' });
      notePointer(false);
      return;
    }
    const hit = hitTest(s, activeCell, placed[activeCell], x, y);
    if (hit === type) {
      setLabels((cur) => ({ ...cur, [activeCell]: { ...cur[activeCell], [type]: true } }));
      labSound.tick();
      notePointer(true);
    } else if (hit) {
      labSound.warn();
      setFirstTry((cur) => ({ ...cur, [activeCell]: false }));
      for (const inst of s.insts) {
        if (inst.cell === activeCell && inst.type === hit) inst.wobble = 1;
      }
      if (hit === 'wall' || hit === 'membrane' || hit === 'cytoplasm') s.cells[activeCell].wob = 1;
      setFlash({ tone: 'warn', line: `Not this one — ${ORG[hit].riddle}.` });
      notePointer(false);
    } else {
      setFlash({ tone: 'info', line: 'Drop the chip right on the part it names — aim for the middle of the cell.' });
      notePointer(false);
    }
  };

  // ---- mentor completion flags ------------------------------------------------
  const done = useMemo(() => ([
    choseCell,
    (placed.plant.wall > 0 && placed.plant.membrane > 0 && placed.plant.cytoplasm > 0)
      || (placed.animal.membrane > 0 && placed.animal.cytoplasm > 0),
    (placed.plant.nucleus > 0 && placed.plant.mitochondrion >= 2)
      || (placed.animal.nucleus > 0 && placed.animal.mitochondrion >= 2),
    cellComplete('plant', placed.plant, ui.ribos.plant) || cellComplete('animal', placed.animal, ui.ribos.animal),
    labelsDoneCell(labels.plant, 'plant') && labelsDoneCell(labels.animal, 'animal'),
    quizPassedCell(quiz.plant) && quizPassedCell(quiz.animal) && concluded,
  ]), [choseCell, placed, labels, quiz, ui.ribos, concluded]);

  useEffect(() => {
    const next = done.findIndex((d) => !d);
    if (next > mentorIndex) {
      setMentorIndex(next);
      labSound.step();
    } else if (done[done.length - 1] && mentorIndex < MENTOR_STEPS.length - 1) {
      setMentorIndex(MENTOR_STEPS.length - 1);
    }
  }, [done, mentorIndex]);

  // ---- milestones ---------------------------------------------------------------
  useEffect(() => {
    if (cellComplete('plant', placed.plant, ui.ribos.plant) && !celebrated.current.plant) {
      celebrated.current.plant = true;
      earn('plant-built');
      labSound.milestone();
      pushToast('good', '🌱', 'Plant cell assembled — wall, vacuole and chloroplasts all in. Labels unlock in the sidebar.');
    }
    if (cellComplete('animal', placed.animal, ui.ribos.animal) && !celebrated.current.animal) {
      celebrated.current.animal = true;
      earn('animal-built');
      labSound.milestone();
      pushToast('good', '🐾', 'Animal cell assembled — membrane, vesicles and all. Labels unlock in the sidebar.');
    }
  }, [placed, ui.ribos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (labelsDoneCell(labels.plant, 'plant') && celebrated.current.labelsP === false && Object.keys(labels.plant).length > 0) {
      celebrated.current.labelsP = true;
      labSound.step();
      pushToast('info', '🏷', 'Plant cell fully labeled — the function quiz unlocks below.');
    }
    if (labelsDoneCell(labels.animal, 'animal') && celebrated.current.labelsA === false && Object.keys(labels.animal).length > 0) {
      celebrated.current.labelsA = true;
      labSound.step();
      pushToast('info', '🏷', 'Animal cell fully labeled — the function quiz unlocks below.');
    }
    if (
      celebrated.current.labelsP && celebrated.current.labelsA
      && firstTry.plant && firstTry.animal
    ) {
      earn('label-pro');
    }
  }, [labels, firstTry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (quizPassedCell(quiz.plant) && !celebrated.current.quizP) {
      celebrated.current.quizP = true;
      labSound.milestone();
      pushToast('good', '🧠', 'Plant function quiz passed — five for five functions.');
    }
    if (quizPassedCell(quiz.animal) && !celebrated.current.quizA) {
      celebrated.current.quizA = true;
      labSound.milestone();
      pushToast('good', '🧠', 'Animal function quiz passed — five for five functions.');
    }
    if (celebrated.current.quizP && celebrated.current.quizA) earn('quiz-whiz');
  }, [quiz]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'choose':
        return { target: 'choose', gesture: 'tap', title: 'Pick your first cell', body: 'Plant or animal — choose with the chips under the scene. You will build both before the session ends.' };
      case 'boundary':
        return { target: 'scene', gesture: 'drag', title: 'Lay the boundary', body: 'Drag the cell wall (or the membrane for the animal cell) from the tray into the cell, then pour the cytoplasm.' };
      case 'power':
        return { target: 'scene', gesture: 'drag', title: 'Nucleus and power', body: 'Drag the nucleus toward the middle, then both mitochondria — they scatter and drift once settled.' };
      case 'storage':
        return { target: 'scene', gesture: 'drag', title: 'Finish the cell', body: 'Plant: the big vacuole and both chloroplasts. Animal: three vesicles. Then hold the ribosome shaker inside and sprinkle.' };
      case 'label':
        return { target: 'labels', gesture: 'drag', title: 'Label the parts', body: 'Drag each name chip from the sidebar onto its organelle in the scene — leader lines draw themselves.' };
      case 'quiz':
        return { target: 'quizkeys', gesture: 'tap', title: 'Answer by tapping', body: 'Read the function question, then tap the organelle it describes — or use the numbered list.' };
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- cells, assist, keyboard ---------------------------------------------
  const selectCell = (cell: CellId) => {
    if (sim.current.drag) return;
    if (cell === activeCell) return;
    sim.current.active = cell;
    sim.current.hover = null;
    setActiveCell(cell);
    setChoseCell(true);
    labSound.tick();
    syncUi();
  };

  const sprinkleBurst = (cell: CellId) => {
    const s = sim.current;
    const L = s.layout;
    const cs = s.cells[cell];
    for (let i = 0; i < RIBO_BURST && cs.ribos.length < RIBO_CAP; i += 1) {
      const d: RiboDot = {
        x: L.cx + (Math.random() - 0.5) * (cell === 'plant' ? L.pw * 0.5 : L.rx),
        y: L.cy + (Math.random() - 0.5) * (cell === 'plant' ? L.ph * 0.5 : L.ry),
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
      };
      clampRibo(d, cell, L);
      cs.ribos.push(d);
    }
    labSound.tick();
    setChoseCell(true);
    syncUi();
  };

  const attachNextLabel = () => {
    const t = labelListOf(activeCell).find((x) => !labels[activeCell][x]);
    if (!t) return;
    setLabels((cur) => ({ ...cur, [activeCell]: { ...cur[activeCell], [t]: true } }));
    labSound.tick();
    setFlash({ tone: 'info', line: `Mentor assist — ${ORG[t].name} attached to its organelle.` });
  };

  const nextAction = () => {
    if (sim.current.drag) return;
    const cell = activeCell;
    if (phase === 'build') {
      const counts = placed[cell];
      const ribos = sim.current.cells[cell].ribos.length;
      for (const t of ORG_ORDER) {
        if (!ORG[t][cell]) continue;
        if (t === 'ribosome') {
          if (ribos < RIBO_MIN) { sprinkleBurst(cell); return; }
          continue;
        }
        if (counts[t] < ORG[t].need[cell]) {
          const slot = sim.current.layout.slots[ORG_ORDER.indexOf(t)];
          placePart(cell, t, slot.x, slot.y);
          return;
        }
      }
      return;
    }
    if (phase === 'label') {
      attachNextLabel();
      return;
    }
    if (phase === 'quiz') {
      setCursor((cur) => ({ ...cur, [cell]: (cur[cell] + 1) % quiz[cell].length }));
      labSound.tick();
      return;
    }
    if (phases[otherCell] !== 'done') {
      selectCell(otherCell);
      setFlash({ tone: 'info', line: `Switching to the ${otherCell} cell — two cells to build, and only one is done.` });
      return;
    }
    if (!concluded) {
      setFlash({ tone: 'good', line: 'Open the Observations tab in the sidebar — the conclusion card waits for three differences.' });
      labSound.tick();
      return;
    }
    setFlash({ tone: 'good', line: 'Experiment complete: two cells built, labeled, quizzed and compared. Reset deals a fresh pair.' });
    labSound.tick();
  };

  // ---- conclusion -----------------------------------------------------------
  const submitConclusion = () => {
    if (picks.some((p) => !p)) {
      setFlash({ tone: 'info', line: 'Pick three statements first — one for each difference.' });
      labSound.tick();
      return;
    }
    const set = new Set(picks);
    if (TRUE_DIFF_IDS.every((id) => set.has(id))) {
      setConcluded(true);
      labSound.milestone();
      earn('concluded');
      pushToast('good', '🔬', 'Concluded — three real differences, earned from your own bench.');
    } else {
      labSound.warn();
      setFlash({ tone: 'warn', line: 'At least one statement does not survive your own comparison table — reread the tally above and try again.' });
    }
  };

  // ---- reset -----------------------------------------------------------------
  const resetAll = () => {
    labSound.stopLoop();
    const keepW = sim.current.layoutW;
    const keepH = sim.current.layoutH;
    const s = freshSim();
    s.layoutW = keepW;
    s.layoutH = keepH;
    if (keepW > 0) relayout(s);
    sim.current = s;
    celebrated.current = { plant: false, animal: false, labelsP: false, labelsA: false, quizP: false, quizA: false };
    setActiveCell('plant');
    setPlaced({ plant: zeroCounts(), animal: zeroCounts() });
    setLabels({ plant: {}, animal: {} });
    setFirstTry({ plant: true, animal: true });
    setQuiz(freshQuiz());
    setCursor({ plant: 0, animal: 0 });
    setPicks(['', '', '']);
    setConcluded(false);
    setBadges([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setChoseCell(false);
    setFlash(null);
    setToast(null);
    setDragLabel(null);
    syncUi();
  };

  // ---- coach ------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (flash) return flash;
    const cell = activeCell;
    const counts = placed[cell];
    const ribos = ui.ribos[cell];
    if (phase === 'build') {
      if (cell === 'plant' && counts.wall === 0) return { tone: 'info', line: 'Hang the cell wall first — drag the crate from the tray onto the dashed rectangle. The membrane hugs its inside.' };
      if (counts.membrane === 0) return { tone: 'info', line: cell === 'plant' ? 'Wall up. Now drag the membrane in — it settles just inside the wall.' : 'Start the animal cell with its membrane — the soft double-line skin along the blob.' };
      if (counts.cytoplasm === 0) return { tone: 'info', line: 'Pour the cytoplasm — drag the jar in and watch the living jelly spread.' };
      if (counts.nucleus === 0) return { tone: 'info', line: 'Jelly in. Now the nucleus — it settles near the middle and takes charge.' };
      if (counts.mitochondrion < 2) return { tone: 'info', line: `Both mitochondria belong in — ${counts.mitochondrion}/2 placed. They drift once settled: they are alive.` };
      if (cell === 'plant' && counts.chloroplast < 2) return { tone: 'info', line: `${counts.chloroplast}/2 chloroplasts in — they settle near the edge where the light is.` };
      if (cell === 'plant' && counts.vacuole === 0) return { tone: 'info', line: 'The big central vacuole goes toward the middle — plant storage is one giant sac.' };
      if (cell === 'animal' && counts.vesicle < 3) return { tone: 'info', line: `${counts.vesicle}/3 tiny vesicles in — animal cells store in small sacs.` };
      if (ribos < RIBO_MIN) return { tone: 'info', line: `Hold the ribosome shaker inside the cell and sprinkle — ${ribos} dotted so far, ${RIBO_MIN} completes it.` };
      return { tone: 'good', line: 'Cell assembled — every part is in. Labels unlock in the sidebar.' };
    }
    if (phase === 'label') {
      const remaining = labelListOf(cell).filter((t) => !labels[cell][t]).length;
      return remaining > 0
        ? { tone: 'info', line: `Drag the name chips onto their organelles — ${remaining} to go. A wrong drop wobbles the part and hints at its job.` }
        : { tone: 'good', line: 'All labeled — the function quiz unlocks below.' };
    }
    if (phase === 'quiz') {
      const q = quiz[cell][cursor[cell]];
      return q ? { tone: 'info', line: `${q.q} Tap your answer in the scene.` } : { tone: 'good', line: 'Quiz underway.' };
    }
    if (phases[otherCell] !== 'done') return { tone: 'good', line: `${cap(cell)} cell finished — switch to the ${otherCell} cell and build it too.` };
    if (!concluded) return { tone: 'good', line: 'Both cells complete — name three key differences in Observations to finish.' };
    return { tone: 'good', line: 'Experiment complete: two cells built, labeled, quizzed and compared. Reset deals a fresh pair.' };
  }, [flash, activeCell, phase, phases, placed, labels, quiz, cursor, concluded, ui.ribos, otherCell]);

  // ---- status ------------------------------------------------------------------
  const allDone = done[done.length - 1];
  const statusText = allDone ? 'Experiment complete'
    : phase === 'build' ? `Building the ${activeCell} cell`
      : phase === 'label' ? `${cap(activeCell)} cell built — labeling`
        : phase === 'quiz' ? `Function quiz — ${activeCell} cell`
          : `${cap(activeCell)} cell finished`;
  const statusTone: 'ready' | 'active' | 'complete' = allDone ? 'complete' : choseCell ? 'active' : 'ready';

  // ---- observations data ---------------------------------------------------------
  const obsRows = useMemo(() => ORGANELLES
    .filter((d) => placed.plant[d.id] > 0 || placed.animal[d.id] > 0 || ui.ribos.plant > 0 || ui.ribos.animal > 0)
    .map((d) => ({
      def: d,
      plant: d.id === 'ribosome' ? ui.ribos.plant : placed.plant[d.id],
      animal: d.id === 'ribosome' ? ui.ribos.animal : placed.animal[d.id],
    }))
    .filter((r) => r.plant > 0 || r.animal > 0), [placed, ui.ribos]);
  const onlyPlant = obsRows.filter((r) => r.plant >= r.def.need.plant && !r.def.animal);
  const onlyAnimal = obsRows.filter((r) => r.animal >= r.def.need.animal && !r.def.plant);
  const inBoth = obsRows.filter((r) => r.plant >= r.def.need.plant && r.animal >= r.def.need.animal);

  // ---- action button copy ---------------------------------------------------------
  const [actionLabel, actionSub] = useMemo(() => {
    if (phase === 'build') return ['Place next part', 'flies the next missing organelle in · Space'];
    if (phase === 'label') return ['Attach next label', 'sticks the next name chip on · Space'];
    if (phase === 'quiz') return ['Skip this question', 'it comes back around · Space'];
    if (phases[otherCell] !== 'done') return [`Switch to the ${otherCell} cell`, 'two cells to build · Space'];
    if (!concluded) return ['Name three differences', 'finish in the Observations tab · Space'];
    return ['Session complete', 'Reset above to build a fresh pair'];
  }, [phase, phases, otherCell, concluded]);

  const partsPlaced = labelListOf(activeCell).filter((t) => (t === 'ribosome' ? ui.ribos[activeCell] >= RIBO_MIN : placed[activeCell][t] >= ORG[t].need[activeCell])).length;
  const partsTotal = labelListOf(activeCell).length;
  const labelsPlaced = labelListOf(activeCell).filter((t) => labels[activeCell][t]).length;
  const quizSolved = quiz[activeCell].filter((q) => q.solved).length;
  const currentQ = quiz[activeCell][cursor[activeCell]];

  // ---- render ------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Drag · build · label · quiz"
      legend={[
        { color: '#a4bd8a', label: 'Cell wall' },
        { color: '#d97706', label: 'Membrane' },
        { color: '#c886ae', label: 'Nucleus' },
        { color: '#dd8848', label: 'Mitochondria' },
        { color: '#7cbf58', label: 'Chloroplasts' },
        { color: '#aed3ec', label: 'Vacuole' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — open the tray', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={(
        <label>Cell
          <select value={activeCell} onChange={(e) => { selectCell(e.target.value as CellId); notePointer(true); }} aria-label="Active cell">
            <option value="plant">Plant</option>
            <option value="animal">Animal</option>
          </select>
        </label>
      )}
      scene={(
        <div className="cbc-scene">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="application"
            aria-label="Cell construction bench — drag organelles from the tray into the cell, tap organelles to answer quiz questions"
            onKeyDown={(e) => {
              if (e.repeat) return;
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                nextAction();
                notePointer(true);
              } else if (e.key === 'p' || e.key === 'P') {
                selectCell('plant');
              } else if (e.key === 'a' || e.key === 'A') {
                selectCell('animal');
              } else if (phase === 'quiz' && e.key >= '1' && e.key <= '9') {
                const i = Number(e.key) - 1;
                if (i < keyList.length) {
                  answerQuiz(keyList[i]);
                  notePointer(true);
                }
              }
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="cbc-chips" aria-hidden="true">
            {labelListOf(activeCell).filter((t) => labels[activeCell][t]).map((t) => (
              <span
                key={t}
                className="cbc-chip"
                ref={(el) => { if (el) chipRefs.current.set(t, el); else chipRefs.current.delete(t); }}
              >
                <i style={{ background: ORG[t].colour }} />
                {ORG[t].name}
              </span>
            ))}
          </div>
          <div ref={ghostRef} className="cbc-ghost" aria-hidden="true">{dragLabel ? ORG[dragLabel].name : ''}</div>
        </div>
      )}
      controls={(
        <div>
          <div className="cbc-selector" data-nudge="choose" role="group" aria-label="Choose the cell you are building">
            <span className="cbc-selector-label">Building</span>
            <button
              type="button"
              className={`cbc-chip-btn${activeCell === 'plant' ? ' active' : ''}`}
              onClick={() => { selectCell('plant'); notePointer(true); }}
              aria-pressed={activeCell === 'plant'}
            >
              <i style={{ background: '#a4bd8a' }} aria-hidden="true" />
              Plant cell
            </button>
            <button
              type="button"
              className={`cbc-chip-btn${activeCell === 'animal' ? ' active' : ''}`}
              onClick={() => { selectCell('animal'); notePointer(true); }}
              aria-pressed={activeCell === 'animal'}
            >
              <i style={{ background: '#d97706' }} aria-hidden="true" />
              Animal cell
            </button>
          </div>

          <div className="cbc-phase-row" aria-label="Phase for the active cell">
            <span className={`cbc-phase${phase === 'build' ? ' on' : ''}`}>1 · Build</span>
            <span className={`cbc-phase${phase === 'label' ? ' on' : ''}`}>2 · Label</span>
            <span className={`cbc-phase${phase === 'quiz' ? ' on' : ''}`}>3 · Quiz</span>
            {phase === 'done' && <span className="cbc-phase on">✓ Done</span>}
          </div>

          <div className="cbc-actions">
            <button
              className="action-button"
              type="button"
              data-nudge="nextpart"
              onClick={() => { nextAction(); notePointer(true); }}
              disabled={ui.dragging}
            >
              <span className="dispense-icon" aria-hidden="true">✦</span>
              <span>{actionLabel}</span>
              <small>{actionSub}</small>
            </button>
          </div>

          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Build both cells, label them, pass both quizzes — then name the three differences in Observations. The plant cell refuses to be complete without its wall and vacuole.</p></div>
        </div>
      )}
      sidebarTop={(
        <>
          <section className="instrument-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>{cap(activeCell)} cell bench</h2></div><span className="instrument-live">LIVE</span></div>
            <div className="reading-main">
              <span>Cell completeness</span>
              <strong>{Math.round(ui.progress * 100)}<small>%</small></strong>
              <div className="reading-track"><span style={{ width: `${Math.round(ui.progress * 100)}%` }} /></div>
              <div className="reading-scale"><span>empty outline</span><span>assembled</span></div>
            </div>
            <div className="reading-grid">
              <div><span>Phase</span><strong>{cap(phase)}</strong></div>
              <div><span>Parts in</span><strong>{partsPlaced}/{partsTotal}</strong></div>
              <div><span>Ribosomes</span><strong>{ui.ribos[activeCell]}<small> / {RIBO_MIN}</small></strong></div>
              <div><span>Labels</span><strong>{labelsPlaced}/{partsTotal}</strong></div>
              <div><span>Quiz</span><strong>{quizSolved}/5</strong></div>
              <div><span>Other cell</span><strong>{phases[otherCell] === 'done' ? '✓ done' : cap(phases[otherCell])}</strong></div>
            </div>
            <div className="cbc-parts">
              {labelListOf(activeCell).map((t) => {
                const have = t === 'ribosome' ? ui.ribos[activeCell] : placed[activeCell][t];
                const need = t === 'ribosome' ? RIBO_MIN : ORG[t].need[activeCell];
                const ok = have >= need;
                return (
                  <div key={t} className={`cbc-part-row${ok ? ' ok' : ''}`}>
                    <i style={{ background: ORG[t].colour }} aria-hidden="true" />
                    <span>{ORG[t].name}</span>
                    <em>{t === 'ribosome' ? `${have} dots` : `${Math.min(have, need)}/${need}`}</em>
                    {ok && <b aria-hidden="true">✓</b>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="instrument-card" data-nudge="labels">
            <div className="instrument-header"><div><span className="panel-kicker">LABEL PHASE</span><h2>Name the parts</h2></div></div>
            {phase === 'build' ? (
              <p className="cbc-label-note">Chips unlock when the {activeCell} cell is assembled — drag them onto the matching organelles.</p>
            ) : (
              <>
                <div className="cbc-labels">
                  {labelListOf(activeCell).map((t) => {
                    const isPlaced = !!labels[activeCell][t];
                    return (
                      <button
                        key={t}
                        type="button"
                        className={`cbc-label-chip${isPlaced ? ' placed' : ''}${dragLabel === t ? ' dragging' : ''}`}
                        disabled={isPlaced || phase !== 'label'}
                        onPointerDown={(e) => beginLabelDrag(e, t)}
                        onPointerMove={moveLabelDrag}
                        onPointerUp={endLabelDrag}
                        onPointerCancel={endLabelDrag}
                        aria-label={`Label chip ${ORG[t].name} — drag onto the matching organelle`}
                      >
                        <i style={{ background: ORG[t].colour }} aria-hidden="true" />
                        {ORG[t].name}
                        {isPlaced && <b aria-hidden="true">✓</b>}
                      </button>
                    );
                  })}
                </div>
                {phase === 'label' && (
                  <p className="cbc-label-note">Drag each chip onto its organelle in the scene — the leader line draws itself. A wrong drop wobbles the part and hints at its job.</p>
                )}
              </>
            )}
          </section>

          {labelsDoneCell(labels[activeCell], activeCell) && (
            <section className="instrument-card">
              <div className="instrument-header"><div><span className="panel-kicker">FUNCTION QUIZ</span><h2>{cap(activeCell)} cell</h2></div><span className="instrument-live">{quizSolved}/5</span></div>
              {quizPassedCell(quiz[activeCell]) ? (
                <p className="cbc-label-note">Quiz passed — {quiz[activeCell].reduce((s, q) => s + q.taps, 0)} taps in total, every function matched. The record lives in Observations.</p>
              ) : (
                <>
                  <div className="cbc-quiz-dots" aria-label="Quiz progress">
                    {quiz[activeCell].map((q, i) => (
                      <span key={q.q} className={q.solved ? 'solved' : i === cursor[activeCell] ? 'now' : ''} />
                    ))}
                  </div>
                  <p className="cbc-quiz-q">{currentQ ? currentQ.q : ''}</p>
                  <div className="cbc-quiz-keys" data-nudge="quizkeys" role="group" aria-label="Answer by organelle">
                    {keyList.map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        className="cbc-key-btn"
                        onClick={() => { answerQuiz(t); notePointer(t === currentQ?.answer); }}
                      >
                        <b>{i + 1}</b>
                        <i style={{ background: ORG[t].colour }} aria-hidden="true" />
                        {ORG[t].name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-button cbc-skip"
                    onClick={() => { setCursor((cur) => ({ ...cur, [activeCell]: (cur[activeCell] + 1) % quiz[activeCell].length })); labSound.tick(); }}
                  >
                    Skip this question ↷
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Pick a cell — plant or animal — and hang its boundary: the wall first in a plant, the membrane first in an animal.</li>
              <li>Pour the cytoplasm and watch the living jelly spread; it shimmers forever after.</li>
              <li>Drag in the nucleus, both mitochondria, then the storage parts (vacuole or vesicles) and the chloroplasts.</li>
              <li>Hold the ribosome shaker inside the cell and sprinkle until the count reaches thirty.</li>
              <li>Drag every name chip onto its organelle; leader lines draw themselves.</li>
              <li>Answer the five function questions by tapping organelles — then conclude in Observations and repeat on the other cell.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Parts dropped in the wrong cell fly home with the reason why — those corrections are the fastest way to learn which structures belong where.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Plant vs animal — your comparison so far</h3>
            {obsRows.length === 0 ? (
              <p className="observation-note">Place your first organelle and the comparison table starts filling itself — from your placements, not from a book.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>Structure</th><th>Plant cell?</th><th>Animal cell?</th><th>Function</th></tr></thead>
                <tbody>
                  {obsRows.map((r) => (
                    <tr key={r.def.id}>
                      <td>{r.def.name}</td>
                      <td>{r.def.id === 'ribosome' ? (r.plant >= RIBO_MIN ? '✓' : `${r.plant}`) : r.plant >= r.def.need.plant ? '✓' : '—'}</td>
                      <td>{r.def.id === 'ribosome' ? (r.animal >= RIBO_MIN ? '✓' : `${r.animal}`) : r.animal >= r.def.need.animal ? '✓' : '—'}</td>
                      <td style={{ textAlign: 'left' }}>{r.def.fn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 style={{ marginTop: 16 }}>Where things live</h3>
            <div className="cbc-tally">
              <div>
                <span>ONLY IN PLANTS</span>
                <strong>{onlyPlant.length}</strong>
                <small>{onlyPlant.map((r) => r.def.name).join(', ') || '—'}</small>
              </div>
              <div>
                <span>ONLY IN ANIMALS</span>
                <strong>{onlyAnimal.length}</strong>
                <small>{onlyAnimal.map((r) => r.def.name).join(', ') || '—'}</small>
              </div>
              <div>
                <span>IN BOTH</span>
                <strong>{inBoth.length}</strong>
                <small>{inBoth.map((r) => r.def.name).join(', ') || '—'}</small>
              </div>
            </div>

            <h3 style={{ marginTop: 16 }}>Function quiz record</h3>
            <table className="trial-table">
              <thead><tr><th>Cell</th><th style={{ textAlign: 'left' }}>Question</th><th>Taps</th><th>Status</th></tr></thead>
              <tbody>
                {(['plant', 'animal'] as CellId[]).flatMap((c) => quiz[c].map((q, i) => (
                  <tr key={`${c}-${i}`}>
                    <td>{cap(c)}</td>
                    <td style={{ textAlign: 'left' }}>{q.q}</td>
                    <td>{q.taps}</td>
                    <td>{q.solved ? '✓ solved' : 'open'}</td>
                  </tr>
                )))}
              </tbody>
            </table>
            <p className="observation-note">Every tap is counted — a question answered on the first tap earns no more credit than one that took four honest tries.</p>

            <h3 style={{ marginTop: 16 }}>Conclusion — three key differences</h3>
            {!quizPassedCell(quiz.plant) || !quizPassedCell(quiz.animal) ? (
              <div className="hint-box"><span>✦</span><p>Unlocks after both function quizzes are passed — the comparison you built yourself is the evidence.</p></div>
            ) : concluded ? (
              <p className="observation-note">Recorded: plant cells carry a cell wall, chloroplasts and a large central vacuole; animal cells have none of these and keep only small vesicles — everything else is shared.</p>
            ) : (
              <div className="cbc-conclude">
                {picks.map((pick, i) => (
                  <select
                    key={i}
                    aria-label={`Difference ${i + 1}`}
                    value={pick}
                    onChange={(e) => {
                      const next = [...picks];
                      next[i] = e.target.value;
                      setPicks(next);
                      labSound.tick();
                    }}
                  >
                    <option value="">choose difference {i + 1}…</option>
                    {DIFFS.map((d) => (
                      <option key={d.id} value={d.id} disabled={picks.includes(d.id) && pick !== d.id}>{d.text}</option>
                    ))}
                  </select>
                ))}
                <button
                  type="button"
                  className="record-button"
                  data-nudge="conclude"
                  onClick={() => { submitConclusion(); notePointer(true); }}
                >
                  Lock in the three differences
                </button>
              </div>
            )}
          </>
        ),
        theory: (
          <>
            <h3>Two cells, one plan</h3>
            <p>Every cell is a living bag of jelly (the cytoplasm) wrapped in a thin, choosy skin (the membrane). Inside, the nucleus holds the instructions and runs the cell, mitochondria release energy from food, and ribosomes build proteins. That plan is shared by plants and animals — which is why most parts appear in both cells you build.</p>
            <h3>What makes them different</h3>
            <p>Plant cells add three structures animal cells never carry. A rigid cell wall boxes the membrane in and holds the shape. Green chloroplasts catch light energy and make food. A large central vacuole stores water and keeps the cell firm — animal cells manage with nothing more than tiny vesicles.</p>
            <div className="equation">plant = wall + chloroplasts + big vacuole · animal = neither</div>
            <p>Why the wall matters so much: a plant cannot chase food or shelter, so it builds its own scaffold. The wall lets a leaf stand up into the light and a stem carry water without collapsing — support without bones.</p>
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

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
