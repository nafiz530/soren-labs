import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './magnetic-field-mapping.css';

/**
 * Magnetic field mapping — top-down plotting-paper bench.
 *
 * The student drags bar magnets from a wooden tray onto plotting paper,
 * carries a compass anywhere with the pointer (its needle obeys the local
 * superposed dipole field), taps to stamp persistent needle marks, and can
 * reveal integrated streamlines to check the hand-drawn map. Neutral points
 * between like poles are found by hunting for the spot where the needle
 * cannot decide.
 */

const PAD = 14;
const TRAY_H = 74;
const MAG_LEN = 112;
const MAG_H = 30;
const PX_PER_CM = 20; // plotting paper: 20 px = 1 cm
const M_STRENGTH = 5e6; // dipole moment scale (px units)
const R_CLAMP = 22; // clamp distance near the poles
const NEEDLE_TORQUE = 26;
const NEEDLE_DAMP = 2.6;
const B_WEAK = 0.9; // below this the needle is "confused"
const MAX_STAMPS = 240;

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'place', title: 'Lay a magnet on the paper', detail: 'Drag a bar magnet from the wooden tray onto the plotting paper — or press “Add a bar magnet”.', hint: 'Tap a placed magnet later to flip its polarity.' },
  { id: 'explore', title: 'Carry the compass', detail: 'Drag the plotting compass all around the magnet and watch the needle obey the local field.', hint: 'Near the poles the needle snaps round; far away it drifts lazily.' },
  { id: 'trail', title: 'Stamp a trail', detail: 'With Trace mode on, tap along a curve from N to S — every tap leaves a needle stamp, like pencil marks on real paper.', hint: 'Five or more stamps make a trail worth comparing.' },
  { id: 'reveal', title: 'Reveal the field lines', detail: 'Switch on “Reveal field lines” and compare the faint integrated streamlines with your stamped trail.', hint: 'The lines follow the same field your compass needle obeys.' },
  { id: 'flip', title: 'Flip and re-stamp', detail: 'Tap the magnet to flip its polarity, then stamp a fresh trail — every needle on the paper turns tail.', hint: 'The field reverses everywhere, not just beside the magnet.' },
  { id: 'neutral', title: 'Hunt the neutral point', detail: 'Place two magnets N-to-N (flip one of them) and park the compass between the like poles — find the spot where the needle cannot decide.', hint: 'Where like poles face, the two fields cancel at a point.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-stamp', title: 'First stamp', icon: '✎', detail: 'Stamped your first compass needle onto the paper.' },
  { id: 'trail-blazer', title: 'Trail blazer', icon: '⌁', detail: 'Traced ten or more needle stamps onto the paper.' },
  { id: 'line-revealer', title: 'Line revealer', icon: '✧', detail: 'Revealed the integrated field lines and compared them with the stamps.' },
  { id: 'neutral-hunter', title: 'Neutral hunter', icon: '◎', detail: 'Parked the compass right on a neutral point between like poles.' },
];

interface Magnet { x: number; y: number; flip: boolean }
interface Pt { x: number; y: number }
interface StampPt { x: number; y: number; a: number }
interface Rect { x: number; y: number; w: number; h: number }
interface StampRow { id: number; cx: number; cy: number; deg: number }
interface UiSnap { bearing: number; bMag: number; travel: number; weak: boolean }

type DragState =
  | { kind: 'new'; offY: number; sx: number; sy: number; moved: boolean }
  | { kind: 'move'; idx: number; ox: number; oy: number; sx: number; sy: number; moved: boolean }
  | { kind: 'compass'; sx: number; sy: number; moved: boolean }
  | { kind: 'tap'; sx: number; sy: number; moved: boolean };

const meta = getLabBySlug('magnetic-field-mapping')!;

// ------------------------------------------------------------------ physics

/** Net field at a point — superposition of bar-magnet dipole fields.
 *  B ∝ (3(m·r̂)r̂ − m)/r³ per magnet, distance clamped near the poles. */
function fieldAt(px: number, py: number, magnets: Magnet[]): { x: number; y: number } {
  let bx = 0;
  let by = 0;
  for (let i = 0; i < magnets.length; i += 1) {
    const mg = magnets[i];
    let dx = px - mg.x;
    let dy = py - mg.y;
    let d = Math.hypot(dx, dy);
    if (d < R_CLAMP) {
      if (d < 0.001) { dx = 1; dy = 0; d = R_CLAMP; }
      else { const k = R_CLAMP / d; dx *= k; dy *= k; d = R_CLAMP; }
    }
    const mx = mg.flip ? -M_STRENGTH : M_STRENGTH; // moment points S → N
    const mdotr = (mx * dx) / d;
    const inv = 1 / (d * d * d);
    bx += (3 * mdotr * (dx / d) - mx) * inv;
    by += 3 * mdotr * (dy / d) * inv;
  }
  return { x: bx, y: by };
}

/** Integrated streamlines: 8 seeds around each magnet, RK2 along B̂. */
function traceLines(magnets: Magnet[], paper: Rect): Pt[][] {
  const lines: Pt[][] = [];
  const step = 6;
  for (let mi = 0; mi < magnets.length; mi += 1) {
    const mg = magnets[mi];
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      let x = mg.x + Math.cos(a) * (MAG_LEN * 0.5 + 8);
      let y = mg.y + Math.sin(a) * (MAG_LEN * 0.5 + 8);
      const start = { x, y };
      const pts: Pt[] = [start];
      for (let s = 0; s < 430; s += 1) {
        const b1 = fieldAt(x, y, magnets);
        const n1 = Math.hypot(b1.x, b1.y);
        if (n1 < 1e-4) break;
        const b2 = fieldAt(x + (b1.x / n1) * step * 0.5, y + (b1.y / n1) * step * 0.5, magnets);
        const n2 = Math.hypot(b2.x, b2.y);
        if (n2 < 1e-4) break;
        x += (b2.x / n2) * step;
        y += (b2.y / n2) * step;
        pts.push({ x, y });
        if (x < paper.x - 30 || x > paper.x + paper.w + 30 || y < paper.y - 30 || y > paper.y + paper.h + 30) break;
        let diving = false;
        for (let q = 0; q < magnets.length; q += 1) {
          if (Math.hypot(x - magnets[q].x, y - magnets[q].y) < R_CLAMP * 1.2) { diving = true; break; }
        }
        if (diving) break;
        if (s > 8 && Math.hypot(x - start.x, y - start.y) < step * 1.2) break;
      }
      if (pts.length > 5) lines.push(pts);
    }
  }
  return lines;
}

/** Neutral point: interior minimum of |B| with real curvature, deep enough
 *  to be a genuine cancellation (only happens between like poles). */
function findNeutral(magnets: Magnet[], paper: Rect): Pt | null {
  if (magnets.length < 2) return null;
  const margin = 38;
  if (paper.w < margin * 2 + 60 || paper.h < margin * 2 + 60) return null;
  const x0 = paper.x + margin;
  const x1 = paper.x + paper.w - margin;
  const y0 = paper.y + margin;
  const y1 = paper.y + paper.h - margin;
  const bAt = (x: number, y: number) => {
    const f = fieldAt(x, y, magnets);
    return Math.hypot(f.x, f.y);
  };
  let bx = (x0 + x1) / 2;
  let by = (y0 + y1) / 2;
  let bb = Infinity;
  const NX = 40;
  const NY = 26;
  for (let i = 0; i <= NX; i += 1) {
    for (let j = 0; j <= NY; j += 1) {
      const x = x0 + ((x1 - x0) * i) / NX;
      const y = y0 + ((y1 - y0) * j) / NY;
      const b = bAt(x, y);
      if (b < bb) { bb = b; bx = x; by = y; }
    }
  }
  let cw = (x1 - x0) / NX;
  let chh = (y1 - y0) / NY;
  for (let r = 0; r < 3; r += 1) {
    cw /= 3;
    chh /= 3;
    for (let i = -6; i <= 6; i += 1) {
      for (let j = -6; j <= 6; j += 1) {
        const x = clamp(bx + i * cw, x0, x1);
        const y = clamp(by + j * chh, y0, y1);
        const b = bAt(x, y);
        if (b < bb) { bb = b; bx = x; by = y; }
      }
    }
  }
  if (bb > 0.3) return null; // no genuine cancellation anywhere
  const probes: [number, number][] = [[16, 0], [-16, 0], [0, 16], [0, -16]];
  for (let p = 0; p < probes.length; p += 1) {
    if (bAt(bx + probes[p][0], by + probes[p][1]) < bb * 1.7 + 0.03) return null;
  }
  return { x: bx, y: by };
}

// ------------------------------------------------------------------ layout

function layoutOf(w: number, h: number): { paper: Rect; tray: Rect; slots: Pt[] } {
  const paper: Rect = { x: PAD, y: PAD, w: w - PAD * 2, h: h - TRAY_H - PAD * 2 - 6 };
  const tray: Rect = { x: PAD, y: h - TRAY_H - 4, w: w - PAD * 2, h: TRAY_H - 10 };
  const slots = tray.w >= 330
    ? [
        { x: tray.x + tray.w / 2 - 128, y: tray.y + tray.h / 2 },
        { x: tray.x + tray.w / 2 + 128, y: tray.y + tray.h / 2 },
      ]
    : [
        { x: tray.x + tray.w * 0.26, y: tray.y + tray.h / 2 },
        { x: tray.x + tray.w * 0.74, y: tray.y + tray.h / 2 },
      ];
  return { paper, tray, slots };
}

function clampToPaper(m: Magnet, paper: Rect) {
  m.x = clamp(m.x, paper.x + MAG_LEN / 2 + 4, paper.x + paper.w - MAG_LEN / 2 - 4);
  m.y = clamp(m.y, paper.y + MAG_H / 2 + 4, paper.y + paper.h - MAG_H / 2 - 4);
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

// ------------------------------------------------------------------ component

export default function MagneticFieldLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    magnets: [] as Magnet[],
    stamps: [] as StampPt[],
    compass: { x: -1, y: -1 },
    needle: -Math.PI / 2,
    omega: 0,
    drag: null as DragState | null,
    lines: [] as Pt[][],
    neutral: null as Pt | null,
    linesDirty: true,
    compassTravel: 0,
    bAt: 0,
    flips: 0,
    stampsAfterFlip: 0,
    neutralFound: false,
    acc: 0,
    uiAcc: 0,
    lastSlide: 0,
    stampId: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simGhost = useRef<{ x: number; y: number } | null>(null);

  // ---- student controls ---------------------------------------------------
  const [traceMode, setTraceMode] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [magnetCount, setMagnetCount] = useState(0);
  const [stampCount, setStampCount] = useState(0);
  const [stampRows, setStampRows] = useState<StampRow[]>([]);
  const [flipInfo, setFlipInfo] = useState({ flips: 0, after: 0 });
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ bearing: 270, bMag: 0, travel: 0, weak: false });

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
    let deg = (s.needle * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    setUi({ bearing: deg, bMag: s.bAt, travel: s.compassTravel, weak: s.bAt < B_WEAK });
  }, []);

  // ---- mentor completion flags -------------------------------------------
  const placedOne = magnetCount >= 1;
  const done = [
    placedOne,
    ui.travel >= 240,
    stampCount >= 5,
    badges.includes('line-revealer'),
    flipInfo.flips >= 1 && flipInfo.after >= 3,
    badges.includes('neutral-hunter'),
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

  // ---- nudge ---------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    if (done[done.length - 1]) {
      return { target: 'observations', gesture: 'tap', title: 'Review your map', body: 'Your stamp table lives in the Observations tab — the bearings tell the story of the field you mapped.' };
    }
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'place': return { target: 'magnet', gesture: 'drag', title: 'Take a magnet', body: 'Drag a bar magnet from the wooden tray onto the paper — or press “Add a bar magnet”.' };
      case 'explore': return { target: 'scene', gesture: 'drag', title: 'Drag the compass', body: 'Grab the plotting compass and carry it around the magnet — the needle obeys the field wherever it goes.' };
      case 'trail': return { target: 'scene', gesture: 'tap', title: 'Stamp the trail', body: 'Tap the paper along a curve from N to S — each tap leaves a needle stamp behind, like a pencil mark.' };
      case 'reveal': return { target: 'reveal', gesture: 'press', title: 'Reveal the lines', body: 'Switch on “Reveal field lines” and compare the faint streamlines with your stamped trail.' };
      case 'flip': return { target: 'scene', gesture: 'tap', title: 'Flip the magnet', body: 'Tap the placed magnet to swap N and S, then stamp a fresh trail — every needle turns tail.' };
      case 'neutral':
        return magnetCount < 2
          ? { target: 'magnet', gesture: 'drag', title: 'Second magnet', body: 'Place a second bar magnet on the paper, then tap one of them so like poles face each other.' }
          : { target: 'scene', gesture: 'point', title: 'Hunt the neutral point', body: 'Park the compass between the like poles and watch the needle lose its mind — that spot is the neutral point.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex, magnetCount, done]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics -----------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    if (s.linesDirty) {
      const canvas = canvasRef.current;
      const w = canvas?.clientWidth ?? 800;
      const h = canvas?.clientHeight ?? 500;
      const { paper } = layoutOf(w, h);
      s.lines = traceLines(s.magnets, paper);
      s.neutral = findNeutral(s.magnets, paper);
      s.linesDirty = false;
    }
    s.acc += dt;
    const hstep = 1 / 240;
    while (s.acc >= hstep) {
      s.acc -= hstep;
      const b = fieldAt(s.compass.x, s.compass.y, s.magnets);
      const bmag = Math.hypot(b.x, b.y);
      s.bAt = bmag;
      const targ = Math.atan2(b.y, b.x);
      let dAng = targ - s.needle;
      dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
      const eff = bmag / (bmag + 2.2); // soft saturation: strong field, snappy needle
      let torque = eff * NEEDLE_TORQUE * Math.sin(dAng);
      if (bmag < B_WEAK) {
        // near a neutral point the needle has nothing to obey — it wanders
        torque += (Math.random() - 0.5) * 6 * (1 - bmag / B_WEAK);
      }
      s.omega += (torque - NEEDLE_DAMP * s.omega) * hstep;
      s.needle += s.omega * hstep;
    }
    if (s.neutral && !s.neutralFound) {
      const d = Math.hypot(s.compass.x - s.neutral.x, s.compass.y - s.neutral.y);
      if (d < 20 && s.bAt < 0.6) {
        s.neutralFound = true;
        labSound.milestone();
        earn('neutral-hunter');
        pushToast('good', '◎', 'Neutral point found — the two fields cancel and the needle gives up.');
      }
    }
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [earn, pushToast, syncUi]);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const { paper, tray, slots } = layoutOf(w, h);
    if (s.compass.x < 0) {
      s.compass.x = paper.x + paper.w * 0.62;
      s.compass.y = paper.y + paper.h * 0.5;
    }

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // plotting paper
    ctx.save();
    ctx.shadowColor = 'rgba(23,35,52,0.16)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#fbfcfe';
    ctx.fillRect(paper.x, paper.y, paper.w, paper.h);
    ctx.restore();
    ctx.strokeStyle = '#b9c6d4';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(paper.x, paper.y, paper.w, paper.h);

    // graph-paper grid: minor 1 cm, major 5 cm
    ctx.lineWidth = 1;
    for (let x = paper.x + PX_PER_CM; x < paper.x + paper.w; x += PX_PER_CM) {
      const major = Math.round((x - paper.x) / PX_PER_CM) % 5 === 0;
      ctx.strokeStyle = major ? '#cfdcea' : '#e6edf4';
      ctx.beginPath();
      ctx.moveTo(x, paper.y);
      ctx.lineTo(x, paper.y + paper.h);
      ctx.stroke();
    }
    for (let y = paper.y + PX_PER_CM; y < paper.y + paper.h; y += PX_PER_CM) {
      const major = Math.round((y - paper.y) / PX_PER_CM) % 5 === 0;
      ctx.strokeStyle = major ? '#cfdcea' : '#e6edf4';
      ctx.beginPath();
      ctx.moveTo(paper.x, y);
      ctx.lineTo(paper.x + paper.w, y);
      ctx.stroke();
    }

    // revealed field lines (faint, under everything on the paper)
    if (reveal && s.lines.length) {
      ctx.strokeStyle = 'rgba(38,68,110,0.20)';
      ctx.lineWidth = 1.3;
      for (const line of s.lines) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i += 1) ctx.lineTo(line[i].x, line[i].y);
        ctx.stroke();
      }
      // small direction arrows along each line
      ctx.strokeStyle = 'rgba(38,68,110,0.34)';
      ctx.lineWidth = 1.2;
      for (const line of s.lines) {
        if (line.length < 30) continue;
        for (const frac of [0.42, 0.78]) {
          const i = Math.floor(line.length * frac);
          const p = line[i];
          const q = line[Math.min(line.length - 1, i + 2)];
          const ang = Math.atan2(q.y - p.y, q.x - p.x);
          ctx.beginPath();
          ctx.moveTo(p.x - Math.cos(ang - 0.45) * 5, p.y - Math.sin(ang - 0.45) * 5);
          ctx.lineTo(p.x, p.y);
          ctx.lineTo(p.x - Math.cos(ang + 0.45) * 5, p.y - Math.sin(ang + 0.45) * 5);
          ctx.stroke();
        }
      }
    }

    // stamps — persistent pencil-like needle marks
    ctx.lineCap = 'round';
    for (const st of s.stamps) {
      const dx = Math.cos(st.a) * 10;
      const dy = Math.sin(st.a) * 10;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(192,57,43,0.82)';
      ctx.beginPath();
      ctx.moveTo(st.x, st.y);
      ctx.lineTo(st.x + dx, st.y + dy);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(74,87,105,0.82)';
      ctx.beginPath();
      ctx.moveTo(st.x, st.y);
      ctx.lineTo(st.x - dx, st.y - dy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(74,87,105,0.9)';
      ctx.beginPath();
      ctx.arc(st.x, st.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // placed magnets
    for (let i = 0; i < s.magnets.length; i += 1) {
      drawMagnet(ctx, s.magnets[i].x, s.magnets[i].y, s.magnets[i].flip, false);
    }

    // compass
    drawCompass(ctx, s.compass.x, s.compass.y, s.needle, s.drag?.kind === 'compass', s.bAt < B_WEAK);

    // magnet tray (wooden strip at the bottom)
    const wood = ctx.createLinearGradient(0, tray.y, 0, tray.y + tray.h);
    wood.addColorStop(0, '#eadfc9');
    wood.addColorStop(1, '#dccdb0');
    ctx.fillStyle = wood;
    roundRect(ctx, tray.x, tray.y, tray.w, tray.h, 9);
    ctx.fill();
    ctx.strokeStyle = '#c8b593';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,98,62,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tray.x + 8, tray.y + 5);
    ctx.lineTo(tray.x + tray.w - 8, tray.y + 5);
    ctx.stroke();

    // tray slots + magnets waiting in them
    for (let i = 0; i < 2; i += 1) {
      const sl = slots[i];
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(120,98,62,0.5)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, sl.x - MAG_LEN / 2 - 8, sl.y - MAG_H / 2 - 7, MAG_LEN + 16, MAG_H + 14, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      if (i >= s.magnets.length && !(s.drag?.kind === 'new')) {
        drawMagnet(ctx, sl.x, sl.y, false, false);
      }
    }

    // magnet being dragged from the tray / across the paper
    if (s.drag?.kind === 'new' && simGhost.current) {
      ctx.globalAlpha = 0.92;
      drawMagnet(ctx, simGhost.current.x, simGhost.current.y, false, true);
      ctx.globalAlpha = 1;
    }
  }, [reveal]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- shared actions -----------------------------------------------------------
  const stampAt = useCallback((x: number, y: number) => {
    const s = sim.current;
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const { paper } = layoutOf(w, h);
    const px = clamp(x, paper.x + 4, paper.x + paper.w - 4);
    const py = clamp(y, paper.y + 4, paper.y + paper.h - 4);
    const b = fieldAt(px, py, s.magnets);
    const a = Math.atan2(b.y, b.x);
    s.stamps.push({ x: px, y: py, a });
    if (s.stamps.length > MAX_STAMPS) s.stamps.shift();
    s.stampId += 1;
    if (s.flips > 0) s.stampsAfterFlip += 1;
    labSound.tick();
    earn('first-stamp');
    if (s.stamps.length >= 10) earn('trail-blazer');
    setStampCount(s.stamps.length);
    setStampRows((cur) => {
      const deg = Math.round((((a * 180) / Math.PI) % 360 + 360) % 360);
      const row: StampRow = { id: s.stampId, cx: Math.round((px - paper.x) / PX_PER_CM), cy: Math.round((py - paper.y) / PX_PER_CM), deg };
      return [...cur, row].slice(-MAX_STAMPS);
    });
    setFlipInfo({ flips: s.flips, after: s.stampsAfterFlip });
  }, [earn]);

  const addMagnet = useCallback(() => {
    const s = sim.current;
    if (s.magnets.length >= 2) return;
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const { paper } = layoutOf(w, h);
    const m: Magnet = {
      x: paper.x + paper.w * (s.magnets.length === 0 ? 0.3 : 0.7),
      y: paper.y + paper.h * 0.5,
      flip: false,
    };
    clampToPaper(m, paper);
    s.magnets.push(m);
    s.linesDirty = true;
    labSound.thunk(false);
    setMagnetCount(s.magnets.length);
    pushToast('info', '🧲', 'Bar magnet placed — tap it to flip its polarity.');
  }, [pushToast]);

  // ---- pointer interaction ---------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (s.drag) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { slots } = layoutOf(rect.width, rect.height);

    // 1) the compass (precision target wins)
    if (Math.hypot(px - s.compass.x, py - s.compass.y) < 30) {
      s.drag = { kind: 'compass', sx: px, sy: py, moved: false };
      labSound.tick();
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      return;
    }
    // 2) a placed magnet (drag to move, tap to flip)
    for (let i = 0; i < s.magnets.length; i += 1) {
      const m = s.magnets[i];
      if (Math.abs(px - m.x) <= MAG_LEN / 2 + 6 && Math.abs(py - m.y) <= MAG_H / 2 + 8) {
        s.drag = { kind: 'move', idx: i, ox: px - m.x, oy: py - m.y, sx: px, sy: py, moved: false };
        labSound.creak(0.35);
        notePointer(true);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        return;
      }
    }
    // 3) a magnet in the tray (drag a fresh one onto the paper)
    for (let i = s.magnets.length; i < 2; i += 1) {
      const sl = slots[i];
      if (Math.abs(px - sl.x) <= MAG_LEN / 2 + 8 && Math.abs(py - sl.y) <= MAG_H / 2 + 12) {
        s.drag = { kind: 'new', offY: e.pointerType === 'touch' ? -34 : 0, sx: px, sy: py, moved: false };
        simGhost.current = { x: px, y: py - 34 };
        labSound.creak(0.35);
        notePointer(true);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        return;
      }
    }
    // 4) bare tap on the paper → potential stamp
    s.drag = { kind: 'tap', sx: px, sy: py, moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (!s.drag) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { paper } = layoutOf(rect.width, rect.height);
    const nowT = performance.now();
    if (Math.hypot(px - s.drag.sx, py - s.drag.sy) > 6) s.drag.moved = true;

    if (s.drag.kind === 'new') {
      simGhost.current = { x: px, y: py + s.drag.offY };
      if (nowT - s.lastSlide > 110) { s.lastSlide = nowT; labSound.slide(0.3); }
    } else if (s.drag.kind === 'move') {
      const m = s.magnets[s.drag.idx];
      if (m) {
        m.x = px - s.drag.ox;
        m.y = py - s.drag.oy;
        clampToPaper(m, paper);
        s.linesDirty = true;
        if (nowT - s.lastSlide > 110) { s.lastSlide = nowT; labSound.slide(0.35); }
      }
    } else if (s.drag.kind === 'compass') {
      const nx = clamp(px, paper.x + 12, paper.x + paper.w - 12);
      const ny = clamp(py, paper.y + 12, paper.y + paper.h - 12);
      s.compassTravel += Math.hypot(nx - s.compass.x, ny - s.compass.y);
      s.compass.x = nx;
      s.compass.y = ny;
      if (nowT - s.lastSlide > 90) { s.lastSlide = nowT; labSound.slide(0.22); }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const s = sim.current;
    if (!s.drag) return;
    const rect = canvas?.getBoundingClientRect();
    const px = rect ? e.clientX - rect.left : 0;
    const py = rect ? e.clientY - rect.top : 0;
    const drag = s.drag;
    s.drag = null;
    try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const { paper } = layoutOf(rect?.width ?? 800, rect?.height ?? 500);

    if (drag.kind === 'new') {
      const g = simGhost.current;
      simGhost.current = null;
      if (g && g.x > paper.x + 20 && g.x < paper.x + paper.w - 20 && g.y > paper.y + 10 && g.y < paper.y + paper.h - 10 && s.magnets.length < 2) {
        const m: Magnet = { x: g.x, y: g.y, flip: false };
        clampToPaper(m, paper);
        s.magnets.push(m);
        s.linesDirty = true;
        labSound.thunk(false);
        setMagnetCount(s.magnets.length);
        notePointer(true);
        pushToast('info', '🧲', 'Magnet on the paper — tap it to flip N and S.');
      } else {
        notePointer(false);
      }
    } else if (drag.kind === 'move') {
      const m = s.magnets[drag.idx];
      if (m) {
        if (!drag.moved) {
          m.flip = !m.flip;
          s.flips += 1;
          s.stampsAfterFlip = 0;
          s.linesDirty = true;
          labSound.click();
          setFlipInfo({ flips: s.flips, after: 0 });
          notePointer(true);
          pushToast('info', '⇄', 'Polarity flipped — N and S have swapped ends.');
        } else {
          clampToPaper(m, paper);
          s.linesDirty = true;
          labSound.thunk(true);
          notePointer(true);
        }
      }
    } else if (drag.kind === 'compass') {
      if (drag.moved) notePointer(true);
    } else if (drag.kind === 'tap') {
      const inside = px > paper.x && px < paper.x + paper.w && py > paper.y && py < paper.y + paper.h;
      if (!drag.moved && inside && traceMode) {
        stampAt(px, py);
        notePointer(true);
      } else {
        notePointer(false);
      }
    }
  };

  // ---- controls --------------------------------------------------------------
  const toggleTrace = () => {
    setTraceMode((v) => !v);
    labSound.click();
    notePointer(true);
  };

  const toggleReveal = () => {
    const next = !reveal;
    setReveal(next);
    if (next) {
      labSound.milestone();
      earn('line-revealer');
      pushToast('good', '✧', 'Field lines revealed — compare them with your stamped trail.');
    } else {
      labSound.click();
    }
    notePointer(true);
  };

  const removeLast = () => {
    const s = sim.current;
    if (!s.magnets.length) return;
    s.magnets.pop();
    s.linesDirty = true;
    labSound.tick();
    setMagnetCount(s.magnets.length);
    notePointer(true);
  };

  const clearStamps = () => {
    const s = sim.current;
    s.stamps = [];
    labSound.click();
    setStampCount(0);
    setStampRows([]);
    notePointer(true);
  };

  const resetAll = () => {
    const s = sim.current;
    s.magnets = [];
    s.stamps = [];
    s.compass = { x: -1, y: -1 };
    s.needle = -Math.PI / 2;
    s.omega = 0;
    s.drag = null;
    simGhost.current = null;
    s.lines = [];
    s.neutral = null;
    s.linesDirty = true;
    s.compassTravel = 0;
    s.flips = 0;
    s.stampsAfterFlip = 0;
    s.neutralFound = false;
    setTraceMode(true);
    setReveal(false);
    setMagnetCount(0);
    setStampCount(0);
    setStampRows([]);
    setFlipInfo({ flips: 0, after: 0 });
    setMentorIndex(0);
    setBadges([]);
    syncUi();
  };

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (badges.includes('neutral-hunter')) return { tone: 'good', line: 'Neutral point conquered — between like poles the fields cancel to nothing. Try S-to-S as well and find it again.' };
    if (magnetCount === 2 && ui.weak) return { tone: 'warn', line: 'The needle is barely deciding — you are close to a neutral point. Creep the compass around until the field is nearly zero.' };
    if (magnetCount === 0) return { tone: 'info', line: 'Drag a bar magnet from the wooden tray onto the plotting paper — then carry the compass around it.' };
    if (ui.travel < 240) return { tone: 'info', line: 'Grab the compass and drag it around the magnet — the red end always points along the local field, out of N and into S.' };
    if (stampCount < 5) return { tone: 'info', line: 'Trace mode is on: tap the paper to stamp needles. Curve a trail from N to S like you would with a real compass and pencil.' };
    if (!reveal) return { tone: 'good', line: `${stampCount} stamps banked — time to check your handiwork. Switch on “Reveal field lines” and compare.` };
    if (flipInfo.flips === 0) return { tone: 'info', line: 'Tap the magnet to flip its polarity, then stamp a fresh trail — every needle on the paper should turn tail.' };
    if (magnetCount < 2) return { tone: 'info', line: 'Place a second magnet and make like poles face (tap one to flip). Then hunt the neutral point between them.' };
    return { tone: 'info', line: 'Keep mapping — join your stamps with smooth curves; that is exactly what the revealed lines are.' };
  }, [badges, magnetCount, ui.travel, ui.weak, stampCount, reveal, flipInfo.flips]);

  // ---- status ------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Field mapped — nice work' : magnetCount > 0 ? 'Mapping in progress' : 'Experiment ready';

  // ---- render -------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="Top-down plotting bench"
      legend={[
        { color: '#d64541', label: 'N pole / needle N' },
        { color: '#3f6fbf', label: 'S pole / needle S' },
        { color: '#7c8a9c', label: 'Needle stamps' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start mapping', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Magnet mapping bench — drag magnets from the tray, drag the compass, tap the paper to stamp needles"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              if (sim.current.magnets.length === 0) addMagnet();
              else if (traceMode) stampAt(sim.current.compass.x, sim.current.compass.y);
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
          <div className="mag-control-row">
            <button
              className="action-button mag-add"
              type="button"
              data-nudge="magnet"
              onClick={() => { addMagnet(); notePointer(true); }}
              disabled={magnetCount >= 2}
            >
              <span className="dispense-icon" aria-hidden="true">＋</span>
              <span>{magnetCount >= 2 ? 'Two magnets are out' : 'Add a bar magnet'}</span>
              <small>or drag one from the tray</small>
            </button>
            <button
              className={`toggle-pill${traceMode ? ' on' : ''}`}
              type="button"
              onClick={toggleTrace}
              aria-pressed={traceMode}
            >
              <span className="dot" aria-hidden="true" />
              Trace mode {traceMode ? 'on' : 'off'}
            </button>
            <button
              className={`toggle-pill${reveal ? ' on' : ''}`}
              type="button"
              data-nudge="reveal"
              onClick={toggleReveal}
              aria-pressed={reveal}
            >
              <span className="dot" aria-hidden="true" />
              Reveal field lines
            </button>
          </div>
          <div className="mag-tools">
            <button className="text-button" type="button" onClick={removeLast} disabled={magnetCount === 0}>Put back last magnet ↩</button>
            <button className="text-button" type="button" onClick={clearStamps} disabled={stampCount === 0}>Clear stamps ✎</button>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Tap the paper to stamp a needle wherever Trace mode is on — tap a placed magnet to flip N↔S. Two like poles facing? Park the compass between them and hunt the neutral point.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Compass readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Needle bearing (from east, anticlockwise)</span>
            <strong>{ui.bearing.toFixed(0)} <small>°</small></strong>
            <div className="reading-track"><span style={{ width: `${(ui.bearing / 360) * 100}%` }} /></div>
            <div className="reading-scale"><span>0°</span><span>360°</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Field at compass</span><strong>{ui.bMag < 0.01 ? '≈ 0' : ui.bMag.toFixed(1)}<small> rel</small></strong></div>
            <div><span>Needle state</span><strong>{ui.weak ? 'confused' : 'aligned'}</strong></div>
            <div><span>Magnets placed</span><strong>{magnetCount} / 2</strong></div>
            <div><span>Needle stamps</span><strong>{stampCount}</strong></div>
            <div><span>Polarity flips</span><strong>{flipInfo.flips}</strong></div>
            <div><span>Neutral point</span><strong>{badges.includes('neutral-hunter') ? 'found' : magnetCount === 2 ? 'hunting…' : '—'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag a bar magnet from the tray onto the plotting paper (or press “Add a bar magnet”).</li>
              <li>Drag the compass all around it — the needle settles along the local field.</li>
              <li>With Trace mode on, tap along a curve from N to S to stamp a trail of needles.</li>
              <li>Reveal the field lines and compare them with your stamps.</li>
              <li>Tap the magnet to flip its polarity, then re-stamp — everything reverses.</li>
              <li>Place two magnets N-to-N and hunt the neutral point between them.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Stamp close to the magnet where the field bends quickly, and farther out where it changes slowly — that is how the real plotting exercise keeps its curves smooth.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your needle-stamp map</h3>
            {stampRows.length === 0 ? (
              <p className="observation-note">No stamps yet. With Trace mode on, tap the paper — each tap records position and the local field bearing.</p>
            ) : (
              <>
                <table className="trial-table">
                  <thead><tr><th>#</th><th>x (cm)</th><th>y (cm)</th><th>Bearing (°)</th></tr></thead>
                  <tbody>
                    {stampRows.slice(-14).map((r) => (
                      <tr key={r.id}><td>{r.id}</td><td>{r.cx}</td><td>{r.cy}</td><td>{r.deg}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="observation-note">{stampRows.length} stamp{stampRows.length > 1 ? 's' : ''} recorded — showing the last 14. The bearing is where the red (N) end points; 0° is east, measured anticlockwise.</p>
              </>
            )}
            <p className="observation-note">Join stamps of similar bearing with smooth curves and you have drawn the field lines yourself — switch on “Reveal field lines” in the controls to check your map.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why the needle obeys</h3>
            <p>A bar magnet behaves, from a distance, like a magnetic dipole with moment m pointing from S to N. Its field at a point a distance r away is:</p>
            <div className="equation">B ∝ (3(m·r̂)r̂ − m) / r³</div>
            <p>With two magnets on the paper the compass feels the vector sum of both fields — superposition. On the magnet&apos;s own axis the field points along m (out of N); on its equator the field points backwards (into S); that is why stamped needles turn as you walk around the magnet.</p>
            <p>Between two like poles the two dipole fields oppose each other. At one special point they cancel exactly — the neutral point — where the net B is zero and the needle has nothing to obey. Real compasses wander there exactly like the simulated one does.</p>
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

  // ---- canvas painters (pure — no state) ------------------------------------

  function drawMagnet(ctx: CanvasRenderingContext2D, x: number, y: number, flip: boolean, ghost: boolean) {
    const w2 = MAG_LEN / 2;
    const hh = MAG_H / 2;
    ctx.save();
    if (!ghost) {
      ctx.shadowColor = 'rgba(23,35,52,0.28)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
    }
    ctx.fillStyle = flip ? '#3f6fbf' : '#d64541';
    roundRect(ctx, x - w2, y - hh, MAG_LEN, MAG_H, 6);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x - w2, y - hh, MAG_LEN, MAG_H, 6);
    ctx.clip();
    ctx.fillStyle = flip ? '#d64541' : '#3f6fbf';
    ctx.fillRect(x, y - hh, w2, MAG_H);
    // subtle top bevel
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x - w2, y - hh, MAG_LEN, 4);
    ctx.restore();
    ctx.strokeStyle = '#2e3a4a';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x - w2, y - hh, MAG_LEN, MAG_H, 6);
    ctx.stroke();
    // pole letters
    ctx.fillStyle = '#fff';
    ctx.font = '800 13px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(flip ? 'N' : 'S', x - w2 / 2, y + 1);
    ctx.fillText(flip ? 'S' : 'N', x + w2 / 2, y + 1);
    ctx.textBaseline = 'alphabetic';
    if (ghost) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#e8632a';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x - w2 - 5, y - hh - 5, MAG_LEN + 10, MAG_H + 10, 9);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, held: boolean, weak: boolean) {
    const r = 17;
    ctx.save();
    ctx.shadowColor = 'rgba(23,35,52,0.3)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2;
    const bez = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, r + 3);
    bez.addColorStop(0, '#f3d99a');
    bez.addColorStop(0.6, '#d9a441');
    bez.addColorStop(1, '#8a6420');
    ctx.fillStyle = bez;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // face
    ctx.fillStyle = weak ? '#f6f3e2' : '#fdfcf7';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // cardinal ticks
    ctx.strokeStyle = '#9aa4b1';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5));
      ctx.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
      ctx.stroke();
    }
    // needle: red N end points along the field
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = '#d64541';
    ctx.beginPath();
    ctx.moveTo(0, -2.4);
    ctx.lineTo(13.5, 0);
    ctx.lineTo(0, 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#46566b';
    ctx.beginPath();
    ctx.moveTo(0, -2.4);
    ctx.lineTo(-13.5, 0);
    ctx.lineTo(0, 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // pivot
    ctx.fillStyle = '#8a6420';
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x - 0.8, y - 0.9, 0.9, 0, Math.PI * 2);
    ctx.fill();
    // glass shine
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r - 4.5, -2.4, -1.3);
    ctx.stroke();
    if (held) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#e8632a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
