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
import './heart-blood-flow.css';

/**
 * Journey of blood — the heart virtual lab.
 *
 * A big friendly cross-section heart beats on the canvas while blood cells
 * travel the honest double circuit: vena cava → right atrium → (tricuspid) →
 * right ventricle → (pulmonary valve) → pulmonary artery → lungs, where they
 * turn scarlet → pulmonary vein → left atrium → (mitral) → left ventricle →
 * (aortic valve) → aorta → body loop, where they darken again. Chambers
 * visibly contract in atrial systole → ventricular systole → diastole, the
 * four valves flap in sequence, and every beat plays a synthesized lub-dub.
 *
 * Students click structures to meet them, drag DOM name chips onto the right
 * parts in Label mode, click the journey step-by-step in Trace mode, record a
 * rest-versus-exercise rate study, and answer two conclusion cards.
 */

// ---------------------------------------------------------------- constants

const VW = 900; // virtual design width
const VH = 560; // virtual design height
const BASE_SPEED = 95; // virtual units / second at 72 bpm
const CELL_COUNT = 64;

const DARK_RGB = { r: 68, g: 84, b: 158 }; // oxygen-poor blue-purple
const BRIGHT_RGB = { r: 212, g: 59, b: 46 }; // oxygen-rich scarlet
const DARK_TUBE = '#4E61AC';
const BRIGHT_TUBE = '#C74036';

type StructId =
  | 'vc' | 'ra' | 'tricuspid' | 'rv' | 'psv' | 'pa' | 'lungs'
  | 'pv' | 'la' | 'mitral' | 'lv' | 'asv' | 'ao' | 'body' | 'septum';

type SegId =
  | 'vc' | 'ra' | 'xtri' | 'rv' | 'xpsv' | 'pa' | 'lungs'
  | 'pv' | 'la' | 'xmit' | 'lv' | 'xasv' | 'ao' | 'body';

interface VPt { x: number; y: number }

interface StructInfo {
  name: string;
  side: string;
  oxy: string;
  role: string;
  /** Function-only hint for a wrong label drop — never reveals the name. */
  hint: string;
}

const STRUCT_INFO: Record<StructId, StructInfo> = {
  vc: {
    name: 'Vena cava', side: 'Enters the right atrium', oxy: 'Oxygen-poor (blue-purple)',
    role: 'The great vein collecting dark, oxygen-poor blood from the whole body and delivering it into the right atrium.',
    hint: 'This wide tube gathers tired blood from everywhere in the body and tips it into the first waiting chamber.',
  },
  ra: {
    name: 'Right atrium', side: 'Right side of the heart', oxy: 'Oxygen-poor (blue-purple)',
    role: 'Receives blood returning from the body, then gives a small top-up squeeze so the ventricle below fills completely.',
    hint: 'This upper waiting room on the blue side contracts first, topping up the pump directly beneath it.',
  },
  tricuspid: {
    name: 'Tricuspid valve', side: 'Right side of the heart', oxy: 'Oxygen-poor (blue-purple)',
    role: 'Three-flap door between the right atrium and right ventricle — it shuts on every beat so blood cannot slip backwards.',
    hint: 'This three-flap door stops blood sliding back into the waiting chamber above when the pump squeezes.',
  },
  rv: {
    name: 'Right ventricle', side: 'Right side of the heart', oxy: 'Oxygen-poor (blue-purple)',
    role: 'Pumps blood a short distance to the lungs to pick up oxygen — a modest job, so its wall is thinner than the left side.',
    hint: 'This lower pump only pushes blood to the nearby lungs, so its wall stays comparatively modest.',
  },
  psv: {
    name: 'Pulmonary valve', side: 'Right side of the heart', oxy: 'Oxygen-poor (blue-purple)',
    role: 'Semilunar valve at the exit into the pulmonary artery — it snaps shut after each beat so blood cannot fall back into the ventricle.',
    hint: 'This crescent-shaped exit door closes right after the pump fires, so the blood it pushed out cannot tumble back in.',
  },
  pa: {
    name: 'Pulmonary artery', side: 'Right side of the heart', oxy: 'Oxygen-poor (blue-purple)',
    role: 'The only artery in the body carrying oxygen-poor blood — it takes it from the right ventricle out to the lungs.',
    hint: 'Unusually among arteries, this one carries oxygen-poor blood — straight out to the lungs for a refill.',
  },
  lungs: {
    name: 'Lungs', side: 'Outside the heart', oxy: 'Turns scarlet here',
    role: 'Capillary beds wrapped around millions of air sacs, where blood drops off carbon dioxide and loads up with oxygen.',
    hint: 'Inside this pair of soft sacs, blood swaps its carbon dioxide for a fresh cargo of oxygen.',
  },
  pv: {
    name: 'Pulmonary vein', side: 'Left side of the heart', oxy: 'Oxygen-rich (scarlet)',
    role: 'The only vein in the body carrying oxygen-rich blood — bright scarlet from the lungs into the left atrium.',
    hint: 'Unusually among veins, this one carries bright scarlet blood — fresh from the lungs.',
  },
  la: {
    name: 'Left atrium', side: 'Left side of the heart', oxy: 'Oxygen-rich (scarlet)',
    role: 'Receives freshly oxygenated blood from the lungs and passes it down through the mitral valve into the left ventricle.',
    hint: 'This upper chamber on the red side receives bright blood from the lungs and hands it downward.',
  },
  mitral: {
    name: 'Mitral (bicuspid) valve', side: 'Left side of the heart', oxy: 'Oxygen-rich (scarlet)',
    role: 'Two-flap door between the left atrium and left ventricle — it withstands the highest pressure in the whole circulation.',
    hint: 'This two-flap door holds shut against the strongest pressure anywhere in the circulation.',
  },
  lv: {
    name: 'Left ventricle', side: 'Left side of the heart', oxy: 'Oxygen-rich (scarlet)',
    role: 'The powerhouse: its thick muscular wall drives oxygen-rich blood around the entire body at high pressure.',
    hint: 'This pump has the thickest wall of all four chambers — it pushes blood all the way to your farthest toes.',
  },
  asv: {
    name: 'Aortic valve', side: 'Left side of the heart', oxy: 'Oxygen-rich (scarlet)',
    role: 'Semilunar valve at the entrance of the aorta — it closes so the body’s freshly pumped blood cannot drain back.',
    hint: 'This crescent-shaped exit door keeps the widest vessel from draining backwards between beats.',
  },
  ao: {
    name: 'Aorta', side: 'Left side of the heart', oxy: 'Oxygen-rich (scarlet)',
    role: 'The body’s largest artery — arches over the heart and carries bright blood from the left ventricle to every organ.',
    hint: 'This is the widest vessel of all, arching over the top to feed the whole body.',
  },
  body: {
    name: 'Body (capillary beds)', side: 'Outside the heart', oxy: 'Turns blue-purple here',
    role: 'Where body cells take oxygen from the blood and hand over carbon dioxide — darkening it for the trip home.',
    hint: 'Out here the body’s cells unload oxygen from the blood, dimming it for the journey home.',
  },
  septum: {
    name: 'Septum', side: 'Between the two sides', oxy: 'Divides the two bloods',
    role: 'The muscular wall dividing the right and left sides of the heart — it keeps oxygen-rich and oxygen-poor blood from mixing.',
    hint: 'This dividing wall keeps the bright and dark blood from ever mixing.',
  },
};

const LABEL_IDS: StructId[] = [
  'vc', 'ra', 'tricuspid', 'rv', 'psv', 'pa', 'pv', 'la', 'mitral', 'lv', 'asv', 'ao',
];

const TRACE_ORDER: StructId[] = [
  'vc', 'ra', 'tricuspid', 'rv', 'psv', 'pa', 'lungs', 'pv', 'la', 'mitral', 'lv', 'asv', 'ao', 'body',
];

const TABLE_ORDER: StructId[] = [...TRACE_ORDER, 'septum'];

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'meet', title: 'Meet the heart', detail: 'Four chambers, four valves, two great loops outside. Start the beat, listen for the lub-dub, then click any chamber or vessel — its name and job appear in the card on the right.', hint: 'Click any chamber, valve or vessel on the scene to introduce yourself.' },
  { id: 'pulmonary', title: 'Follow a cell to the lungs', detail: 'Spotlight one blood cell and ride along: right atrium, right ventricle, pulmonary artery, into the lungs — where it turns scarlet — then home to the left atrium.', hint: 'Press “Spotlight a blood cell” and keep an eye on the ringed cell.' },
  { id: 'body', title: 'Follow one around the body', detail: 'Stay with your spotlighted cell as the left ventricle fires it down the aorta, around the body loop — where it gives up its oxygen and darkens — and back to the vena cava.', hint: 'The same ringed cell carries on: aorta, body loop, back to the start.' },
  { id: 'label', title: 'Label the parts', detail: 'Switch to Label mode and drag the name chips onto the chambers and valves. The chip snaps when you find the right part; wrong drops earn a hint about that part’s job.', hint: 'Aim for eight or more correct labels to complete this step.' },
  { id: 'trace', title: 'Trace the whole journey', detail: 'In Trace mode, click the next structure on the blood’s route, one stop at a time — from the vena cava all the way around the double circuit and back.', hint: 'Think “body → vena cava → right atrium →…” and click in order.' },
  { id: 'conclude', title: 'Draw your conclusions', detail: 'Open Observations: record a resting and an exercising heart rate for the rate study, then answer the two conclusion cards about the thick left wall and the double circuit.', hint: 'The record button sits under the scene; the conclusion cards are in Observations.' },
];

const BADGES: BadgeDef[] = [
  { id: 'cell-follower', title: 'Circuit tracer', icon: '✦', detail: 'Followed one spotlighted blood cell all the way through the lungs loop.' },
  { id: 'labeler', title: 'Master labeler', icon: '🏷', detail: 'Placed all twelve labels correctly on the first try.' },
  { id: 'double-circulation', title: 'Double circulation', icon: '⇄', detail: 'Traced the full journey without a single wrong click.' },
  { id: 'rate-studier', title: 'Rate studier', icon: '💓', detail: 'Recorded both a resting and an exercising heart rate.' },
  { id: 'conclusion', title: 'Conclusion champion', icon: '🏆', detail: 'Answered both conclusion cards correctly.' },
];

const CONCLUSIONS: { q: string; options: string[]; correct: number; why: string; wrongNote: string }[] = [
  {
    q: 'Why is the left ventricle’s wall thicker than the right ventricle’s?',
    options: [
      'It holds a larger volume of blood before each beat',
      'It must pump blood around the whole body at higher pressure',
      'It pumps blood to the lungs, which are further away',
    ],
    correct: 1,
    why: 'Right — the left ventricle drives blood through the long body circuit, so it needs a far more powerful, thicker wall than the right ventricle, which only nudges blood to the nearby lungs.',
    wrongNote: 'Not quite — think about how far each pump has to push its blood, and at what pressure.',
  },
  {
    q: 'Why does blood pass through the heart twice before completing one full circuit?',
    options: [
      'The heart is too small to pump all the blood at once',
      'One side is held in reserve in case the other fails',
      'Double circulation — blood is first sent to the lungs to collect oxygen, then routed around the body',
    ],
    correct: 2,
    why: 'Exactly — the right side sends blood to the lungs to be oxygenated; the left side then delivers that bright blood to the body. Two pumps in series, one heart.',
    wrongNote: 'Hint — one pass is for picking up oxygen, the other for delivering it.',
  },
];

// ------------------------------------------------------------- flow geometry

const CTRL: Record<SegId, VPt[]> = {
  vc: [{ x: 682, y: 330 }, { x: 640, y: 352 }, { x: 612, y: 300 }, { x: 596, y: 208 }, { x: 566, y: 150 }, { x: 500, y: 148 }, { x: 430, y: 158 }, { x: 360, y: 178 }, { x: 338, y: 198 }],
  ra: [{ x: 338, y: 198 }, { x: 348, y: 228 }, { x: 365, y: 250 }],
  xtri: [{ x: 365, y: 250 }, { x: 366, y: 264 }],
  rv: [{ x: 366, y: 264 }, { x: 348, y: 298 }, { x: 326, y: 272 }, { x: 316, y: 281 }],
  xpsv: [{ x: 316, y: 280 }, { x: 300, y: 272 }],
  pa: [{ x: 298, y: 270 }, { x: 262, y: 282 }, { x: 228, y: 302 }, { x: 202, y: 328 }, { x: 186, y: 352 }],
  lungs: [{ x: 186, y: 352 }, { x: 152, y: 372 }, { x: 112, y: 378 }, { x: 82, y: 352 }, { x: 72, y: 306 }, { x: 86, y: 262 }, { x: 118, y: 236 }, { x: 150, y: 242 }, { x: 168, y: 272 }, { x: 162, y: 308 }, { x: 140, y: 318 }, { x: 128, y: 292 }, { x: 140, y: 266 }, { x: 160, y: 252 }, { x: 182, y: 242 }],
  pv: [{ x: 182, y: 242 }, { x: 212, y: 204 }, { x: 258, y: 162 }, { x: 318, y: 130 }, { x: 392, y: 116 }, { x: 448, y: 128 }, { x: 480, y: 158 }, { x: 490, y: 180 }],
  la: [{ x: 490, y: 182 }, { x: 498, y: 215 }, { x: 500, y: 248 }],
  xmit: [{ x: 500, y: 250 }, { x: 501, y: 262 }],
  lv: [{ x: 501, y: 264 }, { x: 492, y: 320 }, { x: 505, y: 375 }, { x: 525, y: 330 }, { x: 522, y: 270 }, { x: 514, y: 252 }],
  xasv: [{ x: 514, y: 250 }, { x: 517, y: 236 }],
  ao: [{ x: 517, y: 234 }, { x: 524, y: 188 }, { x: 542, y: 144 }, { x: 576, y: 120 }, { x: 614, y: 122 }, { x: 642, y: 150 }, { x: 652, y: 202 }, { x: 658, y: 262 }, { x: 664, y: 326 }, { x: 670, y: 390 }, { x: 690, y: 428 }],
  body: [{ x: 690, y: 428 }, { x: 745, y: 466 }, { x: 805, y: 468 }, { x: 855, y: 438 }, { x: 872, y: 382 }, { x: 868, y: 318 }, { x: 845, y: 262 }, { x: 800, y: 228 }, { x: 748, y: 216 }, { x: 706, y: 238 }, { x: 684, y: 290 }, { x: 682, y: 330 }],
};

const SEG_IDS: SegId[] = ['vc', 'ra', 'xtri', 'rv', 'xpsv', 'pa', 'lungs', 'pv', 'la', 'xmit', 'lv', 'xasv', 'ao', 'body'];

const SEG_NEXT: Record<SegId, SegId> = {
  vc: 'ra', ra: 'xtri', xtri: 'rv', rv: 'xpsv', xpsv: 'pa', pa: 'lungs',
  lungs: 'pv', pv: 'la', la: 'xmit', xmit: 'lv', lv: 'xasv', xasv: 'ao', ao: 'body', body: 'vc',
};

/** Which valve guards the ENTRANCE of a segment (undefined = always open). */
const SEG_VALVE: Partial<Record<SegId, 'av' | 'sl'>> = {
  xtri: 'av', xpsv: 'sl', xmit: 'av', xasv: 'sl',
};

const DARK_SEGS = new Set<SegId>(['vc', 'ra', 'xtri', 'rv', 'xpsv', 'pa']);

const SEG_NAME: Record<SegId, string> = {
  vc: 'in the vena cava', ra: 'in the right atrium', xtri: 'crossing the tricuspid valve',
  rv: 'in the right ventricle', xpsv: 'crossing the pulmonary valve', pa: 'in the pulmonary artery',
  lungs: 'in the lungs', pv: 'in the pulmonary vein', la: 'in the left atrium',
  xmit: 'crossing the mitral valve', lv: 'in the left ventricle', xasv: 'crossing the aortic valve',
  ao: 'in the aorta', body: 'in the body loop',
};

/** Maps a flow segment to the structure that owns it (valve crossings map to their valve). */
const SEG_TO_STRUCT: Record<SegId, StructId> = {
  vc: 'vc', ra: 'ra', xtri: 'tricuspid', rv: 'rv', xpsv: 'psv', pa: 'pa',
  lungs: 'lungs', pv: 'pv', la: 'la', xmit: 'mitral', lv: 'lv', xasv: 'asv',
  ao: 'ao', body: 'body',
};

const CHAMBERS: { id: StructId; c: VPt; rx: number; ry: number; wall: number; left: boolean }[] = [
  { id: 'ra', c: { x: 368, y: 208 }, rx: 54, ry: 46, wall: 7, left: false },
  { id: 'rv', c: { x: 362, y: 335 }, rx: 56, ry: 74, wall: 9, left: false },
  { id: 'la', c: { x: 502, y: 208 }, rx: 54, ry: 46, wall: 7, left: true },
  { id: 'lv', c: { x: 513, y: 340 }, rx: 58, ry: 76, wall: 18, left: true },
];

const CHAMBER_OF: Partial<Record<SegId, VPt>> = {
  ra: { x: 368, y: 208 }, rv: { x: 362, y: 335 }, la: { x: 502, y: 208 }, lv: { x: 513, y: 340 },
};

const VALVES: { id: StructId; p: VPt; kind: 'av' | 'sl'; dx: number; dy: number }[] = [
  { id: 'tricuspid', p: { x: 366, y: 256 }, kind: 'av', dx: 0, dy: 1 },
  { id: 'mitral', p: { x: 500, y: 256 }, kind: 'av', dx: 0, dy: 1 },
  { id: 'psv', p: { x: 312, y: 280 }, kind: 'sl', dx: -0.87, dy: -0.49 },
  { id: 'asv', p: { x: 515, y: 242 }, kind: 'sl', dx: 0.24, dy: -0.97 },
];

const LUNG_BLOBS: { c: VPt; rx: number; ry: number }[] = [
  { c: { x: 112, y: 300 }, rx: 58, ry: 92 },
  { c: { x: 160, y: 300 }, rx: 40, ry: 72 },
];

const BODY_RING = { c: { x: 777, y: 342 }, rx: 108, ry: 132 };

const LABEL_SLOTS: { id: StructId; slot: VPt; anchor: VPt }[] = [
  { id: 'vc', slot: { x: 560, y: 58 }, anchor: { x: 508, y: 150 } },
  { id: 'ra', slot: { x: 250, y: 92 }, anchor: { x: 352, y: 163 } },
  { id: 'tricuspid', slot: { x: 238, y: 250 }, anchor: { x: 360, y: 256 } },
  { id: 'rv', slot: { x: 236, y: 430 }, anchor: { x: 322, y: 390 } },
  { id: 'psv', slot: { x: 236, y: 338 }, anchor: { x: 314, y: 281 } },
  { id: 'pa', slot: { x: 105, y: 470 }, anchor: { x: 224, y: 308 } },
  { id: 'pv', slot: { x: 300, y: 50 }, anchor: { x: 320, y: 131 } },
  { id: 'la', slot: { x: 634, y: 168 }, anchor: { x: 542, y: 163 } },
  { id: 'mitral', slot: { x: 634, y: 258 }, anchor: { x: 500, y: 256 } },
  { id: 'lv', slot: { x: 602, y: 430 }, anchor: { x: 548, y: 400 } },
  { id: 'asv', slot: { x: 702, y: 146 }, anchor: { x: 520, y: 238 } },
  { id: 'ao', slot: { x: 748, y: 86 }, anchor: { x: 648, y: 152 } },
];

// ------------------------------------------------------------- path plumbing

interface FlowPath { pts: VPt[]; cum: number[]; len: number }

function catmull(pts: VPt[], seg = 12): VPt[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const out: VPt[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    for (let j = 0; j < seg; j += 1) {
      const t = j / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[n - 1]);
  return out;
}

function makePath(pts: VPt[]): FlowPath {
  const dense = catmull(pts, 12);
  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  }
  return { pts: dense, cum, len: cum[cum.length - 1] };
}

const SEG_PATHS: Record<SegId, FlowPath> = SEG_IDS.reduce((acc, id) => {
  acc[id] = makePath(CTRL[id]);
  return acc;
}, {} as Record<SegId, FlowPath>);

function posAt(fp: FlowPath, d: number): VPt {
  const dd = clamp(d, 0, fp.len);
  let i = 1;
  while (i < fp.cum.length - 1 && fp.cum[i] < dd) i += 1;
  const c0 = fp.cum[i - 1];
  const c1 = fp.cum[i];
  const t = c1 > c0 ? (dd - c0) / (c1 - c0) : 0;
  const a = fp.pts[i - 1];
  const b = fp.pts[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function distToPath(fp: FlowPath, p: VPt): number {
  let best = Infinity;
  for (let i = 1; i < fp.pts.length; i += 1) {
    const a = fp.pts[i - 1];
    const b = fp.pts[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0;
    t = clamp(t, 0, 1);
    const dx = p.x - (a.x + abx * t);
    const dy = p.y - (a.y + aby * t);
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

function viewOf(w: number, h: number) {
  const S = Math.max(0, Math.min(w / VW, h / VH));
  return { S, ox: (w - VW * S) / 2, oy: (h - VH * S) / 2 };
}

// ------------------------------------------------------------- beat dynamics

function contractAtrial(p: number): number {
  if (p < 0.12) return p / 0.12;
  return Math.max(0, 1 - (p - 0.12) / 0.1);
}

function contractVent(p: number): number {
  if (p < 0.12) return 0;
  if (p < 0.25) return (p - 0.12) / 0.13;
  if (p < 0.32) return 1;
  return Math.max(0, 1 - (p - 0.32) / 0.08);
}

function flowMult(seg: SegId, phase: number): number {
  if (seg === 'ra' || seg === 'la') return 0.8 + 2.4 * contractAtrial(phase);
  if (seg === 'rv' || seg === 'lv') return 0.8 + 2.4 * contractVent(phase);
  if (seg === 'xtri' || seg === 'xpsv' || seg === 'xmit' || seg === 'xasv') return 3;
  if (seg === 'lungs' || seg === 'body') return 0.75;
  return 1;
}

function oxyOf(seg: SegId, t: number): number {
  if (seg === 'lungs') return t;
  if (seg === 'body') return 1 - t;
  return DARK_SEGS.has(seg) ? 0 : 1;
}

function bloodColor(o: number): string {
  const r = Math.round(DARK_RGB.r + (BRIGHT_RGB.r - DARK_RGB.r) * o);
  const g = Math.round(DARK_RGB.g + (BRIGHT_RGB.g - DARK_RGB.g) * o);
  const b = Math.round(DARK_RGB.b + (BRIGHT_RGB.b - DARK_RGB.b) * o);
  return `rgb(${r},${g},${b})`;
}

/** Honest simple model: stroke volume rises modestly with rate, capped. */
function strokeVolume(bpm: number): number {
  return clamp(55 + 0.35 * (bpm - 40), 55, 110);
}

function cardiacOutput(bpm: number): number {
  return (bpm * strokeVolume(bpm)) / 1000;
}

function phaseWord(p: number): string {
  if (p < 0.12) return 'Atrial systole';
  if (p < 0.4) return 'Ventricular systole';
  return 'Diastole';
}

// --------------------------------------------------------------- sim

interface Particle { seg: SegId; dist: number; spd: number; trail: VPt[] }

interface SimState {
  phase: number;
  time: number;
  beats: number;
  particles: Particle[];
  spot: number;
  hover: StructId | null;
  valves: { tri: number; mit: number; psv: number; asv: number };
  flagPulm: boolean;
  flagBody: boolean;
  pendingPulm: boolean;
  pendingBody: boolean;
  uiAcc: number;
}

function makeParticles(): Particle[] {
  const total = SEG_IDS.reduce((a, id) => a + SEG_PATHS[id].len, 0);
  const ps: Particle[] = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    let r = Math.random() * total;
    let seg: SegId = SEG_IDS[0];
    for (const id of SEG_IDS) {
      r -= SEG_PATHS[id].len;
      if (r <= 0) { seg = id; break; }
    }
    ps.push({ seg, dist: Math.random() * SEG_PATHS[seg].len, spd: 0.75 + Math.random() * 0.5, trail: [] });
  }
  return ps;
}

// ------------------------------------------------------------ hit testing

function hitStruct(v: VPt, opts: { lungs: boolean; body: boolean; pad?: number }): StructId | null {
  const pad = opts.pad ?? 8;
  for (const valve of VALVES) {
    if (Math.hypot(v.x - valve.p.x, v.y - valve.p.y) < 22 + pad) return valve.id;
  }
  for (const ch of CHAMBERS) {
    const dx = (v.x - ch.c.x) / (ch.rx + 10);
    const dy = (v.y - ch.c.y) / (ch.ry + 10);
    if (dx * dx + dy * dy <= 1) return ch.id;
  }
  if (v.x > 421 && v.x < 451 && v.y > 156 && v.y < 449) return 'septum';
  if (distToPath(SEG_PATHS.ao, v) < 15 + pad) return 'ao';
  if (distToPath(SEG_PATHS.vc, v) < 16 + pad) return 'vc';
  if (distToPath(SEG_PATHS.pa, v) < 13 + pad) return 'pa';
  if (distToPath(SEG_PATHS.pv, v) < 13 + pad) return 'pv';
  if (opts.lungs) {
    for (const blob of LUNG_BLOBS) {
      const dx = (v.x - blob.c.x) / (blob.rx + 8);
      const dy = (v.y - blob.c.y) / (blob.ry + 8);
      if (dx * dx + dy * dy <= 1) return 'lungs';
    }
  }
  if (opts.body) {
    const dx = (v.x - BODY_RING.c.x) / BODY_RING.rx;
    const dy = (v.y - BODY_RING.c.y) / BODY_RING.ry;
    const d = Math.hypot(dx, dy);
    if (d > 0.62 && d < 1.38) return 'body';
  }
  return null;
}

// ------------------------------------------------------------- draw helpers

function pathRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function strokePolyline(ctx: CanvasRenderingContext2D, fp: FlowPath) {
  ctx.beginPath();
  ctx.moveTo(fp.pts[0].x, fp.pts[0].y);
  for (let i = 1; i < fp.pts.length; i += 1) ctx.lineTo(fp.pts[i].x, fp.pts[i].y);
  ctx.stroke();
}

function drawTube(ctx: CanvasRenderingContext2D, fp: FlowPath, color: string, width: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f2f5f8';
  ctx.lineWidth = width + 8;
  strokePolyline(ctx, fp);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  strokePolyline(ctx, fp);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(3, width * 0.32);
  strokePolyline(ctx, fp);
}

function drawAVValve(ctx: CanvasRenderingContext2D, x: number, y: number, open: number, hot: boolean, t: number) {
  const w = 18;
  const drop = 7 + 15 * open;
  const meet = 7 * (1 - open);
  const shimmer = 1.3 * Math.sin(t * 7 + x);
  const color = hot ? '#e8632a' : '#93423B';
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w, y - 2);
  ctx.quadraticCurveTo(x - w * 0.55, y + drop * 0.35, x - meet, y + drop + shimmer);
  ctx.moveTo(x + w, y - 2);
  ctx.quadraticCurveTo(x + w * 0.55, y + drop * 0.35, x + meet, y + drop - shimmer);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x - w, y - 2, 2.6, 0, Math.PI * 2);
  ctx.arc(x + w, y - 2, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSLValve(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, open: number, hot: boolean, t: number) {
  const px = -dy;
  const py = dx;
  const w = 13;
  const reach = 3 + 11 * open;
  const close = 8 * (1 - open);
  const shimmer = 1.1 * Math.sin(t * 8 + x);
  const color = hot ? '#e8632a' : '#93423B';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  const ax = x - px * w;
  const ay = y - py * w;
  const bx = x + px * w;
  const by = y + py * w;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(
    ax + dx * reach * 0.5 - px * w * 0.5,
    ay + dy * reach * 0.5 - py * w * 0.5,
    x + dx * reach - px * (close * 0.4 + shimmer * 0.5),
    y + dy * reach - py * (close * 0.4 + shimmer * 0.5),
  );
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(
    bx + dx * reach * 0.5 + px * w * 0.5,
    by + dy * reach * 0.5 + py * w * 0.5,
    x + dx * reach + px * (close * 0.4 + shimmer * 0.5),
    y + dy * reach + py * (close * 0.4 + shimmer * 0.5),
  );
  ctx.stroke();
}

function outlineRegion(ctx: CanvasRenderingContext2D, id: StructId, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  const valve = VALVES.find((vv) => vv.id === id);
  if (valve) {
    ctx.beginPath();
    ctx.arc(valve.p.x, valve.p.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const chamber = CHAMBERS.find((cc) => cc.id === id);
  if (chamber) {
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(chamber.c.x, chamber.c.y, chamber.rx + 13, chamber.ry + 13, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (id === 'septum') {
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(419, 151, 34, 303);
    ctx.restore();
    return;
  }
  if (id === 'lungs') {
    ctx.setLineDash([6, 5]);
    for (const blob of LUNG_BLOBS) {
      ctx.beginPath();
      ctx.ellipse(blob.c.x, blob.c.y, blob.rx + 10, blob.ry + 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const segMap: Partial<Record<StructId, SegId>> = { vc: 'vc', pa: 'pa', pv: 'pv', ao: 'ao', body: 'body' };
  const seg = segMap[id];
  if (seg) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePolyline(ctx, SEG_PATHS[seg]);
    ctx.lineWidth = 3.5;
    ctx.setLineDash([7, 5]);
    strokePolyline(ctx, SEG_PATHS[seg]);
  }
  ctx.restore();
}

// --------------------------------------------------------------- component

const meta = getLabBySlug('heart-blood-flow')!;

interface UiSnap { phase: number; beats: number; spotSeg: SegId | null }
interface RateRow { id: number; bpm: number; sv: number; co: number }

export default function HeartLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef<SimState>({
    phase: 0,
    time: 0,
    beats: 0,
    particles: makeParticles(),
    spot: -1,
    hover: null,
    valves: { tri: 1, mit: 1, psv: 0, asv: 0 },
    flagPulm: false,
    flagBody: false,
    pendingPulm: false,
    pendingBody: false,
    uiAcc: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const dragIdRef = useRef<StructId | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);

  // ---- student controls ----------------------------------------------------
  const [running, setRunning] = useState(true);
  const [bpm, setBpm] = useState(72);
  const [mode, setMode] = useState<'explore' | 'label' | 'trace'>('explore');
  const [showLungs, setShowLungs] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [selected, setSelected] = useState<StructId | null>(null);
  const [visited, setVisited] = useState<StructId[]>([]);
  const [labelsPlaced, setLabelsPlaced] = useState<StructId[]>([]);
  const [labelMisses, setLabelMisses] = useState(0);
  const [dragChip, setDragChip] = useState<StructId | null>(null);
  const [wobbleId, setWobbleId] = useState<StructId | null>(null);
  const [trace, setTrace] = useState<{ step: number; wrong: number; done: boolean }>({ step: 0, wrong: 0, done: false });
  const [rateRows, setRateRows] = useState<RateRow[]>([]);
  const [answers, setAnswers] = useState<(number | null)[]>([null, null]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [pulmDone, setPulmDone] = useState(false);
  const [bodyDone, setBodyDone] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [flash, setFlash] = useState<{ tone: CoachTone; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ phase: 0, beats: 0, spotSeg: null });
  const [view, setView] = useState<{ S: number; ox: number; oy: number }>({ S: 0, ox: 0, oy: 0 });

  const earnedRef = useRef<Set<string>>(new Set());
  const mentorIdxRef = useRef(0);
  mentorIdxRef.current = mentorIndex;

  const earn = useCallback((id: string) => {
    if (earnedRef.current.has(id)) return;
    earnedRef.current.add(id);
    const b = BADGES.find((x) => x.id === id);
    if (b) setToast({ tone: 'good', icon: b.icon, msg: `Badge earned — ${b.title}` });
    labSound.badge();
    setBadges((cur) => (cur.includes(id) ? cur : [...cur, id]));
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
    const t = window.setTimeout(() => setFlash(null), 6500);
    return () => window.clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!wobbleId) return;
    const t = window.setTimeout(() => setWobbleId(null), 700);
    return () => window.clearTimeout(t);
  }, [wobbleId]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    const spotSeg = s.spot >= 0 ? s.particles[s.spot].seg : null;
    setUi({ phase: s.phase, beats: s.beats, spotSeg });
    const canvas = canvasRef.current;
    if (canvas) setView(viewOf(canvas.clientWidth, canvas.clientHeight));
  }, []);

  // ---- mentor completion flags ----------------------------------------------
  const done = [
    mentorAcked && visited.length > 0,
    pulmDone,
    bodyDone,
    labelsPlaced.length >= 8,
    trace.done,
    answers[0] === CONCLUSIONS[0].correct && answers[1] === CONCLUSIONS[1].correct,
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
      case 'meet': return { target: 'scene', gesture: 'point', title: 'Click any part', body: 'Click a chamber, valve or vessel — its name and job appear in the sidebar card.' };
      case 'pulmonary': return { target: 'spotlight', gesture: 'press', title: 'Spotlight a cell', body: 'Press “Spotlight a blood cell”, then follow the ringed cell out to the lungs and back.' };
      case 'body': return { target: 'scene', gesture: 'point', title: 'Stay with the cell', body: 'Keep watching the ringed cell — the left ventricle is about to fire it around the body loop.' };
      case 'label': return { target: 'mode-label', gesture: 'tap', title: 'Switch to Label mode', body: 'Label mode lives in the scene toolbar — drag the name chips onto the parts of the heart.' };
      case 'trace': return { target: 'mode-trace', gesture: 'tap', title: 'Switch to Trace mode', body: 'Trace mode asks you to click the next stop on the blood’s journey, step by step.' };
      case 'conclude': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Record both heart rates and answer the two conclusion cards in the Observations tab.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics: the beat + the blood --------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.time += dt;
    if (running) {
      const prev = s.phase;
      let p = prev + (dt * bpm) / 60;
      let wrapped = false;
      if (p >= 1) { p -= 1; wrapped = true; }
      s.phase = p;
      if (wrapped) s.beats += 1;
      const crossed = (x: number) => prev < x && p >= x;
      // The heart sounds: “lub” as the AV valves slam shut, “dub” as the
      // semilunar valves close — two throttled one-shots per beat.
      if (crossed(0.12)) { labSound.thunk(false); labSound.slosh(0.5); }
      if (crossed(0.4)) { labSound.thunk(true); }

      const avT = p < 0.12 || p >= 0.4 ? 1 : 0;
      const slT = p >= 0.12 && p < 0.4 ? 1 : 0;
      const approach = (cur: number, target: number) => {
        const d = target - cur;
        return cur + clamp(d, -dt * 10, dt * 10);
      };
      s.valves.tri = approach(s.valves.tri, avT);
      s.valves.mit = approach(s.valves.mit, avT);
      s.valves.psv = approach(s.valves.psv, slT);
      s.valves.asv = approach(s.valves.asv, slT);

      const f = bpm / 72;
      for (let i = 0; i < s.particles.length; i += 1) {
        const pt = s.particles[i];
        const path = SEG_PATHS[pt.seg];
        pt.dist += dt * BASE_SPEED * f * pt.spd * flowMult(pt.seg, p);
        if (pt.dist >= path.len) {
          const nxt = SEG_NEXT[pt.seg];
          const v = SEG_VALVE[nxt];
          const open = v === undefined || (v === 'av' ? avT > 0.5 : slT > 0.5);
          if (open) {
            pt.dist -= path.len;
            pt.seg = nxt;
            if (i === s.spot) {
              if (pt.seg === 'la' && !s.flagPulm) { s.flagPulm = true; s.pendingPulm = true; }
              if (pt.seg === 'vc' && !s.flagBody) { s.flagBody = true; s.pendingBody = true; }
            }
          } else {
            pt.dist = path.len; // pooled behind a closed valve
          }
        }
      }
      if (mentorIdxRef.current === 1 && s.spot < 0) {
        const idx = s.particles.findIndex((q) => q.seg === 'vc' && q.dist < 90);
        if (idx >= 0) s.spot = idx;
      }
    }
    if (s.pendingPulm) {
      s.pendingPulm = false;
      setPulmDone(true);
      earn('cell-follower');
      pushToast('good', '✦', 'One cell, lungs loop complete — it turned scarlet and reached the left atrium.');
    }
    if (s.pendingBody) {
      s.pendingBody = false;
      setBodyDone(true);
      labSound.milestone();
      pushToast('good', '⇄', 'Double circuit complete — the very same cell is home in the vena cava.');
    }
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [running, bpm, earn, pushToast, syncUi]);

  // ---- drawing -------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const { S, ox, oy } = viewOf(w, h);
    const t = s.time;
    const ca = contractAtrial(s.phase);
    const cv = contractVent(s.phase);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(ox, oy);
    if (S > 0) ctx.scale(S, S);

    // ---- body loop (capillary beds around the body) ----
    if (showBody) {
      drawTube(ctx, SEG_PATHS.body, '#CE9C97', 20);
      ctx.fillStyle = 'rgba(143,163,173,0.75)';
      for (let d = 14; d < SEG_PATHS.body.len; d += 34) {
        const p = posAt(SEG_PATHS.body, d);
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(d * 0.7) * 6, p.y + Math.cos(d * 0.5) * 6, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- lungs ----
    if (showLungs) {
      for (const blob of LUNG_BLOBS) {
        const g = ctx.createRadialGradient(blob.c.x - 14, blob.c.y - 20, 8, blob.c.x, blob.c.y, blob.ry);
        g.addColorStop(0, '#F2DAD6');
        g.addColorStop(1, '#E0BFBF');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(blob.c.x, blob.c.y, blob.rx, blob.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#C79B9C';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      drawTube(ctx, SEG_PATHS.lungs, '#9D86B8', 13);
      ctx.fillStyle = 'rgba(196,150,190,0.85)';
      for (let d = 12; d < SEG_PATHS.lungs.len; d += 22) {
        const p = posAt(SEG_PATHS.lungs, d);
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(d * 1.3) * 7, p.y + Math.cos(d * 1.1) * 7, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- great vessels (drawn under the heart) ----
    drawTube(ctx, SEG_PATHS.vc, DARK_TUBE, 20);
    drawTube(ctx, SEG_PATHS.pa, DARK_TUBE, 18);
    drawTube(ctx, SEG_PATHS.pv, BRIGHT_TUBE, 18);
    drawTube(ctx, SEG_PATHS.ao, BRIGHT_TUBE, 22);

    // ---- the heart itself ----
    ctx.fillStyle = '#CE938D';
    pathRoundRect(ctx, 300, 148, 280, 312, 64);
    ctx.fill();
    ctx.strokeStyle = '#B26E69';
    ctx.lineWidth = 3;
    ctx.stroke();

    for (const ch of CHAMBERS) {
      const k = ch.id === 'ra' || ch.id === 'la' ? ca : cv;
      const rx = ch.rx * (1 - 0.22 * k);
      const ry = ch.ry * (1 - 0.22 * k);
      ctx.fillStyle = ch.left ? '#C0463C' : '#5A6DAD';
      ctx.beginPath();
      ctx.ellipse(ch.c.x, ch.c.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#A85F5A';
      ctx.lineWidth = ch.wall;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(ch.c.x - rx * 0.18, ch.c.y - ry * 0.2, rx * 0.55, ry * 0.5, -0.5, Math.PI * 0.9, Math.PI * 1.6);
      ctx.stroke();
    }

    // septum between the two sides
    ctx.fillStyle = '#C07F79';
    ctx.fillRect(424, 160, 24, 285);
    ctx.strokeStyle = '#A85F5A';
    ctx.lineWidth = 2;
    ctx.strokeRect(424, 160, 24, 285);

    // ---- valves ----
    for (const valve of VALVES) {
      const hot = selected === valve.id;
      const open = valve.id === 'tricuspid' ? s.valves.tri
        : valve.id === 'mitral' ? s.valves.mit
          : valve.id === 'psv' ? s.valves.psv
            : s.valves.asv;
      if (valve.kind === 'av') drawAVValve(ctx, valve.p.x, valve.p.y, open, hot, t);
      else drawSLValve(ctx, valve.p.x, valve.p.y, valve.dx, valve.dy, open, hot, t);
    }

    // ---- blood cells ----
    for (let i = 0; i < s.particles.length; i += 1) {
      const pt = s.particles[i];
      const path = SEG_PATHS[pt.seg];
      let pos = posAt(path, Math.min(pt.dist, path.len));
      const chC = CHAMBER_OF[pt.seg];
      if (chC) {
        const kk = 0.24 * (pt.seg === 'ra' || pt.seg === 'la' ? ca : cv);
        pos = { x: pos.x + (chC.x - pos.x) * kk, y: pos.y + (chC.y - pos.y) * kk };
      }
      if (pt.dist >= path.len - 0.5) {
        pos.x += Math.sin(t * 2.4 + i) * 2.2;
        pos.y += Math.cos(t * 2.1 + i * 1.7) * 2.2;
      }
      const oxy = oxyOf(pt.seg, Math.min(pt.dist, path.len) / path.len);
      ctx.fillStyle = bloodColor(oxy);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4.4, 0, Math.PI * 2);
      ctx.fill();
      if (i === s.spot) {
        pt.trail.push({ x: pos.x, y: pos.y });
        if (pt.trail.length > 60) pt.trail.shift();
        ctx.lineWidth = 2;
        for (let j = 1; j < pt.trail.length; j += 1) {
          ctx.strokeStyle = `rgba(249,115,22,${(j / pt.trail.length) * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(pt.trail[j - 1].x, pt.trail[j - 1].y);
          ctx.lineTo(pt.trail[j].x, pt.trail[j].y);
          ctx.stroke();
        }
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(249,115,22,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 15, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ---- hover (while dragging a label chip) + selected highlight ----
    if (s.hover) outlineRegion(ctx, s.hover, '#5d6a79', 0.35);
    if (selected && selected !== s.hover) {
      outlineRegion(ctx, selected, '#f97316', 0.4 + 0.22 * Math.sin(t * 4));
    }

    // ---- anchor dots for placed labels ----
    for (const id of labelsPlaced) {
      const slot = LABEL_SLOTS.find((l) => l.id === id);
      if (!slot) continue;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(slot.anchor.x, slot.anchor.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(249,115,22,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(slot.anchor.x, slot.anchor.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }, [selected, labelsPlaced, showLungs, showBody]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ------------------------------------------------------------
  const toVirtual = useCallback((clientX: number, clientY: number): VPt | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const v = viewOf(rect.width, rect.height);
    if (v.S <= 0) return null;
    return { x: (clientX - rect.left - v.ox) / v.S, y: (clientY - rect.top - v.oy) / v.S };
  }, []);

  const markVisited = useCallback((id: StructId) => {
    setVisited((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }, []);

  const answerTrace = useCallback((id: StructId) => {
    if (id === TRACE_ORDER[trace.step]) {
      labSound.tick();
      setFlash({ tone: 'good', msg: `✓ ${STRUCT_INFO[id].name} — that is the next stop.` });
      markVisited(id);
      const next = trace.step + 1;
      if (next >= TRACE_ORDER.length) {
        setTrace({ step: next, wrong: trace.wrong, done: true });
        labSound.milestone();
        pushToast('good', '⇄', 'The whole double circuit, traced by hand — vena cava to aorta and home again.');
        if (trace.wrong === 0) earn('double-circulation');
      } else {
        setTrace((cur) => ({ ...cur, step: next }));
      }
    } else {
      labSound.warn();
      setTrace((cur) => ({ ...cur, wrong: cur.wrong + 1 }));
      setFlash({ tone: 'warn', msg: `✗ That is the ${STRUCT_INFO[id].name} — ${STRUCT_INFO[id].role}` });
      notePointer(false);
    }
  }, [trace, markVisited, earn, pushToast, notePointer]);

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const v = toVirtual(e.clientX, e.clientY);
    const hit = v ? hitStruct(v, { lungs: showLungs, body: showBody }) : null;
    if (hit) {
      labSound.click();
      setSelected(hit);
      markVisited(hit);
      if (mode === 'trace' && !trace.done) answerTrace(hit);
      notePointer(true);
    } else {
      notePointer(false);
    }
  };

  // ---- label chip dragging (pointer capture, real gesture) ------------------------------
  const positionGhost = useCallback((clientX: number, clientY: number) => {
    const layer = overlayRef.current;
    const ghost = ghostRef.current;
    if (!layer || !ghost) return;
    const rect = layer.getBoundingClientRect();
    ghost.style.transform = `translate(${clientX - rect.left - 45}px, ${clientY - rect.top - 16}px)`;
  }, []);

  const moveGhostTo = useCallback((clientX: number, clientY: number) => {
    dragPosRef.current = { x: clientX, y: clientY };
    positionGhost(clientX, clientY);
    const v = toVirtual(clientX, clientY);
    sim.current.hover = v ? hitStruct(v, { lungs: showLungs, body: showBody, pad: 10 }) : null;
  }, [positionGhost, toVirtual, showLungs, showBody]);

  useEffect(() => {
    if (dragChip && dragPosRef.current) {
      positionGhost(dragPosRef.current.x, dragPosRef.current.y);
    }
  }, [dragChip, positionGhost]);

  const startChipDrag = (e: React.PointerEvent<HTMLButtonElement>, id: StructId) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    dragIdRef.current = id;
    setDragChip(id);
    labSound.slide(0.4);
    moveGhostTo(e.clientX, e.clientY);
    notePointer(true);
  };

  const onChipPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragIdRef.current) return;
    moveGhostTo(e.clientX, e.clientY);
  };

  const endChipDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const id = dragIdRef.current;
    if (!id) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    dragIdRef.current = null;
    sim.current.hover = null;
    setDragChip(null);
    const v = toVirtual(e.clientX, e.clientY);
    const hit = v ? hitStruct(v, { lungs: showLungs, body: showBody, pad: 26 }) : null;
    if (hit === id) {
      labSound.glassClink(true);
      setLabelsPlaced((cur) => (cur.includes(id) ? cur : [...cur, id]));
      markVisited(id);
      setFlash({ tone: 'good', msg: `✓ ${STRUCT_INFO[id].name} placed — ${STRUCT_INFO[id].role}` });
      if (labelsPlaced.length + 1 === LABEL_IDS.length && labelMisses === 0) earn('labeler');
    } else {
      labSound.warn();
      setLabelMisses((m) => m + 1);
      setWobbleId(id);
      setFlash({ tone: 'warn', msg: `✗ Not there. ${STRUCT_INFO[id].hint}` });
      notePointer(false);
    }
  };

  // ---- controls ---------------------------------------------------------------
  const toggleRunning = () => {
    setRunning((r) => !r);
    labSound.click();
    notePointer(true);
  };

  const changeBpm = (v: number) => {
    setBpm(v);
    labSound.slide(0.3 + Math.abs(v - bpm) / 300);
    notePointer(true);
  };

  const setPresetBpm = (v: number) => {
    setBpm(v);
    labSound.tick();
    notePointer(true);
  };

  const spotlightCell = () => {
    const s = sim.current;
    let idx = s.particles.findIndex((q) => q.seg === 'vc' && q.dist < 120);
    if (idx < 0) idx = s.particles.findIndex((q) => q.seg === 'body');
    if (idx < 0) idx = 0;
    s.particles[idx].trail = [];
    s.spot = idx;
    labSound.ping(660, 0.1);
    pushToast('info', '◎', 'One blood cell ringed in orange — follow it around the circuit.');
    notePointer(true);
  };

  const clearSpotlight = () => {
    sim.current.spot = -1;
    labSound.tick();
  };

  const recordRate = () => {
    const sv = strokeVolume(bpm);
    const co = cardiacOutput(bpm);
    setRateRows((cur) => [...cur, { id: cur.length + 1, bpm, sv, co }]);
    labSound.click();
    pushToast('good', '✎', `Recorded ${bpm} bpm → stroke volume ${sv.toFixed(0)} mL, cardiac output ${co.toFixed(1)} L/min`);
    const hasRest = rateRows.some((r) => r.bpm <= 90) || bpm <= 90;
    const hasExercise = rateRows.some((r) => r.bpm >= 120) || bpm >= 120;
    if (hasRest && hasExercise) earn('rate-studier');
    notePointer(true);
  };

  const pickAnswer = (qi: number, oi: number) => {
    if (answers[qi] !== null) return;
    const c = CONCLUSIONS[qi];
    if (oi === c.correct) {
      labSound.click();
      const next = [...answers];
      next[qi] = oi;
      setAnswers(next);
      setFlash({ tone: 'good', msg: `✓ ${c.why}` });
      const other = qi === 0 ? 1 : 0;
      if (next[other] === CONCLUSIONS[other].correct) {
        labSound.milestone();
        earn('conclusion');
        pushToast('good', '🏆', 'Both conclusions correct — the double circulation makes sense now.');
      }
      notePointer(true);
    } else {
      labSound.warn();
      setFlash({ tone: 'warn', msg: `✗ ${c.wrongNote}` });
      notePointer(false);
    }
  };

  const resetAll = () => {
    const s = sim.current;
    s.phase = 0;
    s.beats = 0;
    s.spot = -1;
    s.hover = null;
    s.particles = makeParticles();
    s.flagPulm = false;
    s.flagBody = false;
    s.pendingPulm = false;
    s.pendingBody = false;
    s.valves = { tri: 1, mit: 1, psv: 0, asv: 0 };
    setRunning(true);
    setBpm(72);
    setMode('explore');
    setShowLungs(true);
    setShowBody(true);
    setSelected(null);
    setVisited([]);
    setLabelsPlaced([]);
    setLabelMisses(0);
    setDragChip(null);
    setTrace({ step: 0, wrong: 0, done: false });
    setRateRows([]);
    setAnswers([null, null]);
    setMentorIndex(0);
    setMentorAcked(false);
    setPulmDone(false);
    setBodyDone(false);
    setBadges([]);
    earnedRef.current.clear();
    setFlash(null);
    syncUi();
  };

  // ---- analysis ---------------------------------------------------------------
  const restRow = useMemo(() => {
    const rows = rateRows.filter((r) => r.bpm <= 90);
    return rows.length ? rows.reduce((a, b) => (a.bpm <= b.bpm ? a : b)) : null;
  }, [rateRows]);
  const exerciseRow = useMemo(() => {
    const rows = rateRows.filter((r) => r.bpm >= 120);
    return rows.length ? rows.reduce((a, b) => (a.bpm >= b.bpm ? a : b)) : null;
  }, [rateRows]);

  // ---- coach ----------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (flash) return { tone: flash.tone, line: flash.msg };
    if (trace.done && !done[5]) return { tone: 'good', line: 'Journey traced! Now open Observations — record both heart rates and answer the two conclusion cards.' };
    if (mode === 'trace' && !trace.done) return { tone: 'info', line: `Trace step ${trace.step + 1} of ${TRACE_ORDER.length} — click the next stop on the blood’s journey. ${trace.wrong === 0 ? 'No wrong clicks so far.' : `${trace.wrong} wrong click${trace.wrong > 1 ? 's' : ''} so far — read each hint.`}` };
    if (mode === 'label' && labelsPlaced.length < LABEL_IDS.length) return { tone: 'info', line: `${labelsPlaced.length}/${LABEL_IDS.length} labels placed — drag a name chip from the tray onto the part it names. Wrong drops hint at the part’s job, never its name.` };
    if (labelsPlaced.length === LABEL_IDS.length) return { tone: 'good', line: 'All twelve labels placed — the heart is fully mapped. Try Trace mode next.' };
    if (!running) return { tone: 'info', line: 'The beat is paused — chambers hold still while the valve flaps shimmer. Press “Start the beat” to keep the blood moving.' };
    if (!mentorAcked) return { tone: 'info', line: 'Meet the heart: the blue-purple right side, the scarlet left side, and the septum between. Acknowledge the mentor and click any part.' };
    if (restRow && exerciseRow) return { tone: 'good', line: `Rest ${restRow.bpm} bpm → ${restRow.co.toFixed(1)} L/min, exercise ${exerciseRow.bpm} bpm → ${exerciseRow.co.toFixed(1)} L/min — rate and stroke volume rise together during effort.` };
    if (ui.spotSeg) {
      const sid = SEG_TO_STRUCT[ui.spotSeg];
      return { tone: 'info', line: `Your spotlighted cell is ${SEG_NAME[ui.spotSeg]} — ${STRUCT_INFO[sid].role}` };
    }
    return { tone: 'info', line: 'Watch the beat: atria squeeze first, then the ventricles — the lub-dub you hear is both sets of valves closing.' };
  }, [flash, trace, mode, labelsPlaced.length, running, mentorAcked, restRow, exerciseRow, ui.spotSeg, done]);

  // ---- status -------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Journey mapped'
    : trace.done
      ? 'Journey traced'
      : mode === 'trace'
        ? 'Tracing the journey'
        : mode === 'label'
          ? 'Labeling the heart'
          : running
            ? `Beating · ${bpm} bpm`
            : 'Beat paused';

  // ---- render ---------------------------------------------------------------------------
  const tracePrompt = trace.step === 0
    ? 'Blood drains back from the body, tired and oxygen-poor. Click the vessel that collects it.'
    : `From the ${STRUCT_INFO[TRACE_ORDER[trace.step - 1]].name} → click the next stop on the blood’s journey.`;
  const chipTray = LABEL_IDS.filter((id) => !labelsPlaced.includes(id));

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="Cross-section heart · double circulation"
      legend={[
        { color: '#44549E', label: 'Oxygen-poor blood' },
        { color: '#D43B2E', label: 'Oxygen-rich blood' },
        { color: '#f97316', label: 'Spotlighted cell' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start the beat', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <div className="heart-mode" role="group" aria-label="Interaction mode">
          <button type="button" className={mode === 'explore' ? 'active' : ''} onClick={() => { setMode('explore'); labSound.tick(); notePointer(true); }}>Explore</button>
          <button type="button" data-nudge="mode-label" className={mode === 'label' ? 'active' : ''} onClick={() => { setMode('label'); labSound.tick(); notePointer(true); }}>Label</button>
          <button type="button" data-nudge="mode-trace" className={mode === 'trace' ? 'active' : ''} onClick={() => { setMode('trace'); labSound.tick(); notePointer(true); }}>Trace</button>
        </div>
      }
      scene={
        <>
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="application"
            aria-label="Heart cross-section — click chambers and vessels to identify them, drag labels in Label mode, click stops in Trace mode. Space pauses or restarts the beat."
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                toggleRunning();
              }
            }}
            onPointerDown={onCanvasPointerDown}
          />
          {mode === 'label' && (
            <div className="heart-label-layer" ref={overlayRef} aria-hidden="true">
              <svg className="heart-label-svg">
                {labelsPlaced.map((id) => {
                  const slot = LABEL_SLOTS.find((l) => l.id === id);
                  if (!slot || view.S <= 0) return null;
                  const x1 = view.ox + slot.slot.x * view.S;
                  const y1 = view.oy + slot.slot.y * view.S;
                  const x2 = view.ox + slot.anchor.x * view.S;
                  const y2 = view.oy + slot.anchor.y * view.S;
                  return <line key={id} x1={x1} y1={y1} x2={x2} y2={y2} />;
                })}
              </svg>
              {labelsPlaced.map((id) => {
                const slot = LABEL_SLOTS.find((l) => l.id === id);
                if (!slot || view.S <= 0) return null;
                return (
                  <div
                    key={id}
                    className="heart-label-chip"
                    style={{ left: view.ox + slot.slot.x * view.S, top: view.oy + slot.slot.y * view.S }}
                  >
                    {STRUCT_INFO[id].name}
                  </div>
                );
              })}
              {dragChip && (
                <div ref={ghostRef} className="heart-label-chip ghost">
                  {STRUCT_INFO[dragChip].name}
                </div>
              )}
            </div>
          )}
        </>
      }
      controls={
        <div>
          <div className="heart-layout">
            <div className="heart-beat-panel">
              <button
                className="action-button"
                type="button"
                data-nudge="beat"
                onClick={toggleRunning}
              >
                <span className="dispense-icon" aria-hidden="true">{running ? '⏸' : '▶'}</span>
                <span>{running ? 'Pause the beat' : 'Start the beat'}</span>
                <small>or press Space on the scene</small>
              </button>
              <div className="lab-slider-row" data-nudge="bpm">
                <label><span>Heart rate</span><strong>{bpm} bpm</strong></label>
                <input
                  type="range" min="40" max="180" step="1" value={bpm}
                  aria-label="Heart rate in beats per minute"
                  onChange={(e) => changeBpm(Number(e.target.value))}
                />
              </div>
              <div className="heart-presets">
                <button type="button" className={bpm === 72 ? 'heart-pill active' : 'heart-pill'} onClick={() => setPresetBpm(72)}>Resting · 72 bpm</button>
                <button type="button" className={bpm === 150 ? 'heart-pill active' : 'heart-pill'} onClick={() => setPresetBpm(150)}>Exercise · 150 bpm</button>
              </div>
            </div>
            <div className="heart-tools">
              <button
                className="action-button secondary"
                type="button"
                data-nudge="spotlight"
                onClick={spotlightCell}
              >
                <span className="dispense-icon" aria-hidden="true">◎</span>
                <span>Spotlight a blood cell</span>
                <small>follow one cell around the circuit</small>
              </button>
              {ui.spotSeg && (
                <button type="button" className="text-button" onClick={clearSpotlight}>Stop following</button>
              )}
              <div className="heart-loop-toggles">
                <button
                  type="button"
                  className={showLungs ? 'heart-pill active' : 'heart-pill'}
                  aria-pressed={showLungs}
                  onClick={() => { setShowLungs((v) => !v); labSound.tick(); notePointer(true); }}
                >
                  Lungs loop {showLungs ? 'shown' : 'hidden'}
                </button>
                <button
                  type="button"
                  className={showBody ? 'heart-pill active' : 'heart-pill'}
                  aria-pressed={showBody}
                  onClick={() => { setShowBody((v) => !v); labSound.tick(); notePointer(true); }}
                >
                  Body loop {showBody ? 'shown' : 'hidden'}
                </button>
              </div>
            </div>
          </div>

          <div className="hint-row">
            <span>✦</span>
            <p style={{ margin: 0 }}>Click any chamber, valve or vessel to identify it. Colour is oxygenation: blue-purple blood is oxygen-poor, scarlet is oxygen-rich — watch it change in the lungs and body loops.</p>
          </div>

          {mode === 'label' && (
            <div className="heart-tray">
              <div className="heart-tray-head">
                <strong>Label the heart</strong>
                <span>{labelsPlaced.length}/{LABEL_IDS.length} placed{labelMisses > 0 ? ` · ${labelMisses} miss${labelMisses > 1 ? 'es' : ''}` : ''}</span>
              </div>
              <div className="heart-chip-row">
                {chipTray.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`heart-chip${wobbleId === id ? ' wobble' : ''}`}
                    onPointerDown={(e) => startChipDrag(e, id)}
                    onPointerMove={onChipPointerMove}
                    onPointerUp={endChipDrag}
                    onPointerCancel={endChipDrag}
                  >
                    {STRUCT_INFO[id].name}
                  </button>
                ))}
                {chipTray.length === 0 && <p className="heart-tray-done">Every label placed — the heart is fully mapped. 🏷</p>}
              </div>
            </div>
          )}

          {mode === 'trace' && (
            <div className="heart-quiz-card">
              <div className="heart-quiz-head">
                <strong>Trace the blood’s journey</strong>
                <span>{Math.min(trace.step, TRACE_ORDER.length)}/{TRACE_ORDER.length}</span>
              </div>
              {trace.done ? (
                <p className="heart-quiz-done">Complete — the full double circuit, from the vena cava to the aorta and back. {trace.wrong === 0 ? 'Flawless: not a single wrong click.' : `${trace.wrong} wrong click${trace.wrong > 1 ? 's' : ''} along the way.`}</p>
              ) : (
                <>
                  <p className="heart-quiz-prompt">{tracePrompt}</p>
                  <div className="heart-quiz-dots" aria-hidden="true">
                    {TRACE_ORDER.map((id, i) => (
                      <span key={id} className={i < trace.step ? 'done' : i === trace.step ? 'now' : ''} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={recordRate}
          >
            ✎ Record this heart rate — {bpm} bpm → {strokeVolume(bpm).toFixed(0)} mL × {bpm} = {cardiacOutput(bpm).toFixed(1)} L/min
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Circulation readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Heart rate</span>
            <strong>{bpm} <small>bpm</small></strong>
            <div className="reading-track"><span style={{ width: `${((bpm - 40) / 140) * 100}%` }} /></div>
            <div className="reading-scale"><span>40</span><span>180</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Beat phase</span><strong>{running ? phaseWord(ui.phase) : 'Paused'}</strong></div>
            <div><span>Beats counted</span><strong>{ui.beats}</strong></div>
            <div><span>Stroke volume (model)</span><strong>{strokeVolume(bpm).toFixed(0)} mL</strong></div>
            <div><span>Cardiac output (live)</span><strong>{cardiacOutput(bpm).toFixed(1)} L/min</strong></div>
            <div><span>Blood cells flowing</span><strong>{CELL_COUNT}</strong></div>
            <div><span>Spotlighted cell</span><strong>{ui.spotSeg ? SEG_NAME[ui.spotSeg] : '—'}</strong></div>
          </div>
          <div className="heart-struct-card">
            {selected ? (
              <>
                <strong>{STRUCT_INFO[selected].name}</strong>
                <span className="heart-struct-side">{STRUCT_INFO[selected].side} · {STRUCT_INFO[selected].oxy}</span>
                <p>{STRUCT_INFO[selected].role}</p>
              </>
            ) : (
              <p>Click any chamber, valve or vessel on the scene — its name and job appear here, and it joins your structure table in Observations.</p>
            )}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Watch the beat — atrial systole, ventricular systole, diastole — and click chambers and vessels to meet them.</li>
              <li>Press “Spotlight a blood cell” and follow one cell out to the lungs, where it turns scarlet.</li>
              <li>Stay with it around the body loop, where it darkens again before returning to the vena cava.</li>
              <li>Switch to Label mode and drag all twelve name chips onto their structures.</li>
              <li>Switch to Trace mode and click the journey stop-by-stop, from vena cava to aorta and home.</li>
              <li>Record resting and exercising heart rates, then answer the two conclusion cards in Observations.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>The heart’s two sides are two pumps in series: the right sends blood to the lungs, the left sends it to the body. Follow one cell the whole way and the double circuit stops being a diagram and becomes a journey.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Structure table</h3>
            {visited.length === 0 ? (
              <p className="observation-note">Click structures on the scene (or place labels) and each one you meet is added here automatically.</p>
            ) : (
              <table className="trial-table heart-struct-table">
                <thead><tr><th>Structure</th><th>Where</th><th>Blood</th><th>Job</th></tr></thead>
                <tbody>
                  {TABLE_ORDER.filter((id) => visited.includes(id)).map((id) => (
                    <tr key={id}><td>{STRUCT_INFO[id].name}</td><td>{STRUCT_INFO[id].side}</td><td>{STRUCT_INFO[id].oxy}</td><td>{STRUCT_INFO[id].role}</td></tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 style={{ marginTop: 18 }}>Rate study — rest versus exercise</h3>
            <p className="observation-note">Set a heart rate under the scene, then press “Record this heart rate”. The stroke volume is modelled honestly: it rises modestly with rate (stronger filling and contraction) and is capped at 110 mL.</p>
            {rateRows.length === 0 ? (
              <p className="observation-note">No rates recorded yet — try 72 bpm, then 150 bpm.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Rate (bpm)</th><th>Stroke volume (mL)</th><th>Cardiac output (L/min)</th></tr></thead>
                <tbody>
                  {rateRows.map((r) => (
                    <tr key={r.id}><td>{r.id}</td><td>{r.bpm}</td><td>{r.sv.toFixed(0)}</td><td>{r.co.toFixed(1)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {rateRows.length >= 2 && (
              <div style={{ marginTop: 14 }}>
                <Plot points={rateRows.map((r) => ({ x: r.bpm, y: r.co }))} xLabel="Heart rate (bpm)" yLabel="Cardiac output (L/min)" fitLine height={200} />
              </div>
            )}
            {restRow && exerciseRow && (
              <div className="heart-rate-compare">
                <strong>Rest {restRow.bpm} bpm → {restRow.co.toFixed(1)} L/min · Exercise {exerciseRow.bpm} bpm → {exerciseRow.co.toFixed(1)} L/min</strong>
                <p>That is about {(exerciseRow.co / restRow.co).toFixed(1)}× more blood every minute during effort — because the rate rises <em>and</em> each beat pushes a larger volume.</p>
              </div>
            )}

            <h3 style={{ marginTop: 18 }}>Conclusions</h3>
            {CONCLUSIONS.map((c, qi) => (
              <div key={qi} className={answers[qi] === c.correct ? 'heart-conclusion solved' : 'heart-conclusion'}>
                <strong>{c.q}</strong>
                <div className="heart-options">
                  {c.options.map((opt, oi) => (
                    <button
                      key={oi}
                      type="button"
                      disabled={answers[qi] !== null}
                      className={
                        answers[qi] === oi
                          ? oi === c.correct ? 'heart-option right' : 'heart-option wrong'
                          : 'heart-option'
                      }
                      onClick={() => pickAnswer(qi, oi)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {answers[qi] === c.correct && <p className="heart-solved-note">✓ {c.why}</p>}
              </div>
            ))}
          </>
        ),
        theory: (
          <>
            <h3>One heart, two pumps</h3>
            <p>The heart is a double pump. Its right side collects oxygen-poor blood from the body and pushes it a short distance to the lungs; its left side collects the newly oxygen-rich blood and drives it around the whole body. Because blood passes through the heart twice per lap — once for the lungs, once for the body — this is called <strong>double circulation</strong>.</p>
            <h3>The cardiac cycle</h3>
            <p>Each beat has three phases. First <strong>atrial systole</strong>: the two atria squeeze, topping up the ventricles through the open tricuspid and mitral valves. Then <strong>ventricular systole</strong>: the AV valves slam shut (the “lub”), and the ventricles contract, forcing blood through the pulmonary and aortic valves into the arteries. Finally <strong>diastole</strong>: the semilunar valves close (the “dub”) and everything relaxes and refills.</p>
            <div className="equation">Cardiac output = stroke volume × heart rate</div>
            <p>At a resting 72 beats per minute with roughly 70 mL per beat, the heart moves about 5 litres per minute — almost exactly the blood volume of an adult. During exercise both factors climb together, so the output can nearly triple.</p>
            <h3>Why walls differ</h3>
            <p>The left ventricle’s wall is far thicker than the right’s because of the job description: the right ventricle only nudges blood next door to the lungs at low pressure, while the left ventricle must push blood to the top of your head and the tips of your toes at high pressure. The septum between them keeps the two bloods from ever mixing.</p>
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
