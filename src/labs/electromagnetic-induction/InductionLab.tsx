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
import './electromagnetic-induction.css';

/**
 * Electromagnetic induction — a magnet, a coil and a centre-zero
 * galvanometer, all driven by the student's hand.
 *
 * The magnet is grabbed and dragged (or thrown) along the coil axis; the
 * flux through the coil is the exact superposed point-dipole flux of the
 * magnet, EMF = −N·dΦ/dt is differenced honestly at 240 Hz, and the needle
 * is a spring–damper galvanometer that kicks, overshoots and settles. Speed,
 * direction, polarity and loop count all show up in the deflection.
 */

const PXC = 10; // px per cm
const R_CM = 5.5; // coil radius (cm)
const MAG_L_CM = 9; // magnet length (cm)
const MAG_L_PX = 90;
const MAG_H_PX = 26;
const M0 = 1.2e5; // dipole strength scale (µWb·cm³) — sets the flux scale
const R_CIRC = 60; // coil + galvanometer circuit resistance (Ω)
const IFs_MA = 5; // galvanometer full scale (±5 mA, centre zero)

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'slow', title: 'Push in slowly', detail: 'Grab the magnet and slide it slowly along the axis into the coil — the needle kicks, then settles as you stop.', hint: 'Slow means a couple of centimetres per second.' },
  { id: 'still', title: 'Hold it dead still', detail: 'Park the magnet anywhere inside or beside the coil and hold it — after three quiet seconds the needle proves there is no EMF without motion.', hint: 'Perfect stillness, zero current.' },
  { id: 'fast', title: 'Yank it out fast', detail: 'Pull the magnet clear of the coil in one quick stroke — a bigger kick, on the opposite side of zero.', hint: 'Speed is the whole story: EMF ∝ dΦ/dt.' },
  { id: 'flip', title: 'Flip the polarity', detail: 'Press “Flip magnet polarity” and push in again — the needle swings the other way for the very same motion.', hint: 'Lenz’s law: the induced current opposes the change that made it.' },
  { id: 'loops', title: 'Triple the loops', detail: 'Switch the coil to 60 loops and repeat a stroke — the same motion now kicks roughly three times as hard.', hint: 'EMF = −N·dΦ/dt, and N just tripled.' },
  { id: 'law', title: 'Read your data', detail: 'Open Observations: your kick table and the peak-EMF-versus-speed graph carry the whole law.', hint: 'Straight line through the origin — EMF grows in proportion to speed.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-kick', title: 'First kick', icon: '⚡', detail: 'Deflected the galvanometer for the first time.' },
  { id: 'stillness-proof', title: 'Stillness proof', icon: '⏸', detail: 'Held the magnet perfectly still for three seconds — needle at zero.' },
  { id: 'speed-demon', title: 'Speed demon', icon: '⇉', detail: 'Produced a fast-pull deflection more than twice a slow push.' },
  { id: 'loop-multiplier', title: 'Loop multiplier', icon: '๐', detail: 'Compared real kicks at 20 loops and at 60 loops.' },
];

interface KickRow { id: number; emf: number; dir: 1 | -1; speed: number; loops: number; pol: 1 | -1 }
interface UiSnap { xcm: number; vcm: number; phi: number; emf: number; iMa: number; nu: number; dragging: boolean }

const meta = getLabBySlug('electromagnetic-induction')!;

// ------------------------------------------------------------------ physics

/** Exact flux (per unit moment scale) through a coaxial loop of radius R_CM
 *  from a point dipole at axial distance d (cm): Φ ∝ (2d² − R²)/(R²+d²)^{5/2}. */
function dipFlux(d: number): number {
  const r2 = R_CM * R_CM + d * d;
  return (2 * d * d - R_CM * R_CM) / (r2 * r2 * Math.sqrt(r2));
}

/** Flux through the coil (µWb) from the magnet centred at xcm — three
 *  co-located dipoles spread along the bar. sign flips with polarity. */
function coilFlux(xcm: number, signedStrength: number): number {
  let f = 0;
  for (let i = -1; i <= 1; i += 1) f += dipFlux(xcm - (i * MAG_L_CM) / 3);
  return (M0 * signedStrength / 3) * f;
}

/** Local dipole streamlines around the magnet (precomputed once, px units,
 *  moment along +x). Drawn around the moving magnet to show the flux threading. */
const MAG_LOCAL_LINES: { x: number; y: number }[][] = (() => {
  const lines: { x: number; y: number }[][] = [];
  const B = (x: number, y: number) => {
    let d = Math.hypot(x, y);
    if (d < 18) d = 18;
    const ux = x / d;
    const uy = y / d;
    const inv = 1 / (d * d * d);
    return { x: (3 * ux * ux - 1) * inv, y: 3 * ux * uy * inv };
  };
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * Math.PI * 2 + 0.28;
    let x = Math.cos(a) * 52;
    let y = Math.sin(a) * 52;
    const start = { x, y };
    const pts = [{ x, y }];
    for (let s = 0; s < 200; s += 1) {
      const b = B(x, y);
      const n = Math.hypot(b.x, b.y);
      if (n < 1e-9) break;
      x += (b.x / n) * 5;
      y += (b.y / n) * 5;
      pts.push({ x, y });
      if (Math.hypot(x, y) > 250) break;
      if (s > 8 && Math.hypot(x - start.x, y - start.y) < 6) break;
    }
    lines.push(pts);
  }
  return lines;
})();

// ------------------------------------------------------------------ layout

function layoutOf(w: number, h: number) {
  const R = clamp(h * 0.115, 40, 58); // coil radius px
  const gr = clamp(h * 0.115, 40, 58); // galvanometer radius px
  const cx = Math.round(w * 0.4);
  const axY = Math.round(h * 0.4);
  const gx = Math.round(w - gr - 16);
  const gy = Math.round(h - gr - 14);
  const travel = { min: 52, max: Math.max(160, gx - 66) };
  return { R, gr, cx, axY, gx, gy, travel };
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

export default function InductionLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    x: -1, // magnet centre (px) — initialised on the first step
    vx: 0, // px/s
    vcm: 0,
    dragging: false,
    dragX: 0,
    prevPhi: 0,
    emfMv: 0,
    iMa: 0,
    nu: 0, nv: 0, // galvanometer needle position / velocity (−1..1 of scale)
    flow: 0,
    acc: 0,
    uiAcc: 0,
    kickOn: false,
    kickPeak: 0, kickEmf: 0, kickSpeed: 0, kickDir: 1 as 1 | -1, kickLoops: 20, kickPol: 1 as 1 | -1,
    kickId: 0,
    loopsV: 20, strengthV: 1, polSign: 1, // mirrors of the controls (no stale closures)
    everMoved: false, stillT: 0, stillDone: false,
    firstKick: false,
    spd: { 20: { slow: 0, fast: 0 }, 60: { slow: 0, fast: 0 } } as Record<number, { slow: number; fast: number }>,
    kickN: { 20: false, 60: false } as Record<number, boolean>,
    flips: 0,
    slowDone: false, fastDone: false, flippedKick: false,
    lastPing: 0, lastSlide: 0, lastBounce: 0,
    pendingRow: null as KickRow | null,
    grabbedOnce: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [flipped, setFlipped] = useState(false); // false: N on the right
  const [loops, setLoops] = useState(20);
  const [strength, setStrength] = useState(1);
  const [rows, setRows] = useState<KickRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [lenzNote, setLenzNote] = useState(false);
  const [everSlow, setEverSlow] = useState(false);
  const [everFast, setEverFast] = useState(false);
  const [everFlippedKick, setEverFlippedKick] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ xcm: -20, vcm: 0, phi: 0, emf: 0, iMa: 0, nu: 0, dragging: false });

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
    if (!lenzNote) return;
    const t = window.setTimeout(() => setLenzNote(false), 6500);
    return () => window.clearTimeout(t);
  }, [lenzNote]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const L = layoutOf(w, canvas?.clientHeight ?? 500);
    setUi({
      xcm: (s.x - L.cx) / PXC,
      vcm: s.vcm,
      phi: s.prevPhi,
      emf: s.emfMv,
      iMa: s.iMa,
      nu: s.nu,
      dragging: s.dragging,
    });
  }, []);

  // ---- mentor completion flags -------------------------------------------
  const done = [
    everSlow,
    badges.includes('stillness-proof'),
    everFast,
    (sim.current.flips >= 1 || flipped) && everFlippedKick,
    badges.includes('loop-multiplier'),
    sawGraph && rows.length >= 1,
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
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'slow': return { target: 'scene', gesture: 'drag', title: 'Push the magnet in', body: 'Grab the bar magnet and slide it slowly along the dashed axis into the coil — watch the needle kick and settle.' };
      case 'still': return { target: 'scene', gesture: 'point', title: 'Hold it still', body: 'Stop the magnet anywhere and keep it dead still — the needle sinks back to zero within a second.' };
      case 'fast': return { target: 'scene', gesture: 'drag', title: 'Yank it out', body: 'Fling the magnet clear of the coil in one fast stroke — the needle swings hard to the other side.' };
      case 'flip': return { target: 'flip', gesture: 'press', title: 'Flip the polarity', body: 'Press “Flip magnet polarity”, then push the magnet in again — the kick reverses direction.' };
      case 'loops': return { target: 'loops', gesture: 'tap', title: 'More loops', body: 'Switch the coil from 20 to 60 loops and repeat a stroke — the deflection grows about threefold.' };
      case 'law': return { target: 'observations', gesture: 'tap', title: 'Read the law', body: 'Open Observations — your kick table and EMF-versus-speed graph are Faraday’s law in your own data.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics -----------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const L = layoutOf(w, h);
    const nowT = performance.now();
    const signed = s.strengthV * s.polSign;
    const nLoops = s.loopsV;

    if (s.x < 0) {
      s.x = L.travel.min + 30;
      s.prevPhi = coilFlux((s.x - L.cx) / PXC, signed);
    }

    s.acc += dt;
    const hstep = 1 / 240;
    while (s.acc >= hstep) {
      s.acc -= hstep;

      // ---- magnet motion: stiff spring toward the pointer, then friction
      if (s.dragging) {
        const wn = 34;
        s.vx += (wn * wn * (s.dragX - s.x) - 2 * wn * s.vx) * hstep;
      } else {
        s.vx *= Math.exp(-2.4 * hstep);
        if (Math.abs(s.vx) < 4) s.vx = 0;
      }
      s.x += s.vx * hstep;
      if (s.x < L.travel.min) {
        s.x = L.travel.min;
        if (Math.abs(s.vx) > 160 && nowT - s.lastBounce > 260) { s.lastBounce = nowT; labSound.thunk(true); }
        s.vx = -s.vx * 0.3;
      } else if (s.x > L.travel.max) {
        s.x = L.travel.max;
        if (Math.abs(s.vx) > 160 && nowT - s.lastBounce > 260) { s.lastBounce = nowT; labSound.thunk(true); }
        s.vx = -s.vx * 0.3;
      }
      s.vcm = s.vx / PXC;

      // ---- Faraday: EMF = −N·dΦ/dt, differenced honestly per substep
      const xcm = (s.x - L.cx) / PXC;
      const phi = coilFlux(xcm, signed);
      const dphi = (phi - s.prevPhi) / hstep; // µWb/s = µV per turn
      s.prevPhi = phi;
      s.emfMv = (-nLoops * dphi) / 1000;
      s.iMa = s.emfMv / R_CIRC;

      // ---- galvanometer needle: spring–damper toward the current
      const target = clamp(s.iMa / IFs_MA, -1.15, 1.15);
      const wn = 8;
      const zeta = 0.65;
      s.nv += (wn * wn * (target - s.nu) - 2 * zeta * wn * s.nv) * hstep;
      s.nu += s.nv * hstep;
      s.flow += s.iMa * hstep * 46;

      const defl = Math.abs(s.nu);
      const spd = Math.abs(s.vcm);

      // ---- badges & mentor flags
      if (!s.firstKick && defl > 0.15) { s.firstKick = true; earn('first-kick'); }
      if (!s.slowDone && defl > 0.08 && spd < 45) { s.slowDone = true; setEverSlow(true); }
      if (!s.fastDone && defl > 0.4 && spd > 110) { s.fastDone = true; setEverFast(true); }
      if (s.flips > 0 && !s.flippedKick && defl > 0.15) { s.flippedKick = true; setEverFlippedKick(true); }
      if (spd > 25) s.everMoved = true;
      if (s.everMoved && spd < 2 && Math.abs(s.nu) < 0.02) {
        s.stillT += hstep;
        if (!s.stillDone && s.stillT >= 3) {
          s.stillDone = true;
          earn('stillness-proof');
          pushToast('good', '⏸', 'Stillness proof — no motion, no EMF. The needle told the truth.');
        }
      } else if (spd >= 2) {
        s.stillT = 0;
      }

      // ---- speed-demon bookkeeping, per loop count
      const rec = s.spd[nLoops] ?? (s.spd[nLoops] = { slow: 0, fast: 0 });
      if (spd > 5 && spd <= 40 && defl > rec.slow) rec.slow = defl;
      if (spd > 120 && defl > rec.fast) rec.fast = defl;
      if (rec.slow > 0.1 && rec.fast > 2 * rec.slow) earn('speed-demon');

      // ---- kick detector: bank a row when a deflection completes
      if (!s.kickOn && defl > 0.18) {
        s.kickOn = true;
        s.kickPeak = defl;
        s.kickEmf = Math.abs(s.emfMv);
        s.kickSpeed = spd;
        s.kickDir = s.nu > 0 ? 1 : -1;
        s.kickLoops = nLoops;
        s.kickPol = s.polSign as 1 | -1;
      } else if (s.kickOn) {
        if (defl > s.kickPeak) {
          s.kickPeak = defl;
          s.kickEmf = Math.abs(s.emfMv);
          s.kickSpeed = spd;
          s.kickDir = s.nu > 0 ? 1 : -1;
        }
        if (defl < 0.06) {
          s.kickOn = false;
          if (s.kickPeak > 0.12) {
            s.kickId += 1;
            if (s.kickPeak > 0.25) s.kickN[nLoops] = true;
            if (s.kickN[20] && s.kickN[60]) earn('loop-multiplier');
            s.pendingRow = { id: s.kickId, emf: s.kickEmf, dir: s.kickDir, speed: s.kickSpeed, loops: s.kickLoops, pol: s.kickPol };
          }
        }
      }

      // ---- throttled ping on strong deflections
      if (defl > 0.3 && nowT - s.lastPing > 150) {
        s.lastPing = nowT;
        labSound.ping(220 + 300 * Math.min(1, defl), 0.05 + 0.06 * Math.min(1, defl));
      }
    }

    if (s.pendingRow) {
      const row = s.pendingRow;
      s.pendingRow = null;
      labSound.tick();
      setRows((cur) => [...cur, row].slice(-40));
      if (row.id === 1) pushToast('good', '⚡', 'First kick banked — it is in your observation table.');
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
    const L = layoutOf(w, h);
    if (s.x < 0) return; // not yet initialised

    // background bench
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // axis + travel bounds
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(120,130,145,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(L.travel.min - 14, L.axY);
    ctx.lineTo(L.travel.max + 14, L.axY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#b6c1cc';
    ctx.lineWidth = 2;
    for (const bx of [L.travel.min, L.travel.max]) {
      ctx.beginPath();
      ctx.moveTo(bx, L.axY - 16);
      ctx.lineTo(bx, L.axY + 16);
      ctx.stroke();
    }

    // position ruler (desktop / tablet only)
    if (w > 620) {
      const ry = L.axY + L.R + 26;
      ctx.strokeStyle = '#b6c1cc';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(L.travel.min, ry);
      ctx.lineTo(L.travel.max, ry);
      ctx.stroke();
      ctx.fillStyle = '#8a96a4';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      for (let cm = -30; cm <= 30; cm += 2) {
        const px = L.cx + cm * PXC;
        if (px < L.travel.min || px > L.travel.max) continue;
        const major = cm % 10 === 0;
        ctx.beginPath();
        ctx.moveTo(px, ry);
        ctx.lineTo(px, ry + (major ? 10 : 5));
        ctx.stroke();
        if (major) ctx.fillText(`${cm}`, px, ry + 21);
      }
      ctx.beginPath();
      ctx.moveTo(L.cx, ry - 4);
      ctx.lineTo(L.cx, ry + 10);
      ctx.strokeStyle = '#f97316';
      ctx.stroke();
    }

    // wires (under everything else) — coil to galvanometer
    const wire = (pts: { x: number; y: number }[]) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    };
    const pTop = { x: L.gx, y: L.gy - L.gr + 3 };
    const pLeft = { x: L.gx - L.gr + 3, y: L.gy };
    const topWire = [
      { x: L.cx, y: L.axY - L.R - 2 },
      { x: L.cx, y: 30 },
      { x: L.gx, y: 30 },
      pTop,
    ];
    const botWire = [
      { x: L.cx - 26, y: L.axY + L.R + 2 },
      { x: L.cx - 26, y: L.gy },
      pLeft,
    ];
    ctx.strokeStyle = '#7a8795';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    wire(topWire);
    wire(botWire);

    // animated current dashes along the wires
    const amp = Math.min(0.9, Math.abs(s.iMa) / 1.5);
    if (amp > 0.04) {
      ctx.save();
      ctx.strokeStyle = `rgba(232,99,42,${amp})`;
      ctx.lineWidth = 2.6;
      ctx.setLineDash([3, 10]);
      ctx.lineDashOffset = -s.flow;
      wire(topWire);
      ctx.lineDashOffset = -s.flow;
      wire(botWire);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ---- the coil: stacked loop ellipses with copper shading
    const nLoops = loops === 60 ? 9 : 6;
    const spacing = 9;
    const halfW = ((nLoops - 1) * spacing) / 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < nLoops; i += 1) {
      const lx = L.cx - halfW + i * spacing;
      // back half (left) — lighter
      ctx.strokeStyle = '#e6c487';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(lx, L.axY, 12, L.R, 0, Math.PI / 2, (Math.PI * 3) / 2);
      ctx.stroke();
    }
    for (let i = 0; i < nLoops; i += 1) {
      const lx = L.cx - halfW + i * spacing;
      // front half (right) — copper
      ctx.strokeStyle = '#c08531';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(lx, L.axY, 12, L.R, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(246,222,168,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(lx, L.axY, 12, L.R, 0, -Math.PI / 2 + 0.5, Math.PI / 2 - 0.5);
      ctx.stroke();
    }
    // coil leads
    ctx.strokeStyle = '#c08531';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(L.cx, L.axY - L.R);
    ctx.lineTo(L.cx, L.axY - L.R - 2);
    ctx.stroke();

    // ---- the magnet with its local field lines
    const pol = flipped ? -1 : 1;
    ctx.save();
    ctx.translate(s.x, L.axY);
    ctx.scale(pol, 1);
    ctx.strokeStyle = 'rgba(55,80,122,0.16)';
    ctx.lineWidth = 1.2;
    for (const line of MAG_LOCAL_LINES) {
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i += 1) ctx.lineTo(line[i].x, line[i].y);
      ctx.stroke();
    }
    ctx.restore();

    // motion streaks
    const spd = Math.abs(s.vx);
    if (spd > 650) {
      const dir = Math.sign(s.vx);
      for (let g = 1; g <= 2; g += 1) {
        ctx.globalAlpha = g === 1 ? 0.22 : 0.1;
        drawMagnet(ctx, s.x - dir * g * 12, L.axY, pol);
        ctx.globalAlpha = 1;
      }
    }
    drawMagnet(ctx, s.x, L.axY, pol);

    // grab-me affordance until first grab
    if (!s.grabbedOnce) {
      const pulse = 0.45 + 0.3 * Math.sin(performance.now() / 380);
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = `rgba(232,99,42,${pulse})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(s.x, L.axY, 56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (s.dragging) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#e8632a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(s.x, L.axY, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- the centre-zero galvanometer
    drawGalvo(ctx, L.gx, L.gy, L.gr, s.nu);
  }, [loops, flipped]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const L = layoutOf(rect.width, rect.height);
    if (s.x >= 0 && Math.abs(px - s.x) <= MAG_L_PX / 2 + 18 && Math.abs(py - L.axY) <= MAG_H_PX / 2 + 22) {
      s.dragging = true;
      s.dragX = clamp(px, L.travel.min, L.travel.max);
      s.grabbedOnce = true;
      labSound.creak(0.4);
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    } else {
      notePointer(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (!s.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const L = layoutOf(rect.width, rect.height);
    s.dragX = clamp(px, L.travel.min, L.travel.max);
    const nowT = performance.now();
    if (nowT - s.lastSlide > 100) {
      s.lastSlide = nowT;
      labSound.slide(Math.min(1, Math.abs(s.vx) / 900 + 0.25));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.dragging) return;
    s.dragging = false; // the magnet keeps its velocity — you can throw it
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    notePointer(true);
  };

  // ---- controls --------------------------------------------------------------
  const applySettings = (nextLoops: number, nextStrength: number, nextFlipped: boolean) => {
    const s = sim.current;
    s.loopsV = nextLoops;
    s.strengthV = nextStrength;
    s.polSign = nextFlipped ? -1 : 1;
    // re-seed the differencer so the setting change itself makes no fake EMF
    if (s.x >= 0) {
      const canvas = canvasRef.current;
      const w = canvas?.clientWidth ?? 800;
      const L = layoutOf(w, canvas?.clientHeight ?? 500);
      s.prevPhi = coilFlux((s.x - L.cx) / PXC, nextStrength * (nextFlipped ? -1 : 1));
    }
  };

  const flipPolarity = () => {
    const s = sim.current;
    const next = !flipped;
    setFlipped(next);
    s.flips += 1;
    applySettings(loops, strength, next);
    labSound.tick();
    setLenzNote(true);
    pushToast('info', '⇄', next ? 'Flipped — S now leads. Every induced current will reverse.' : 'Flipped back — N leads again.');
    notePointer(true);
  };

  const changeLoops = (v: number) => {
    setLoops(v);
    applySettings(v, strength, flipped);
    labSound.tick();
    notePointer(true);
  };

  const changeStrength = (v: number) => {
    setStrength(v);
    applySettings(loops, v, flipped);
    labSound.tick();
    notePointer(true);
  };

  const resetAll = () => {
    const s = sim.current;
    s.x = -1; // re-initialised on the next step at the resting spot
    s.vx = 0;
    s.vcm = 0;
    s.dragging = false;
    s.prevPhi = 0;
    s.emfMv = 0;
    s.iMa = 0;
    s.nu = 0;
    s.nv = 0;
    s.flow = 0;
    s.acc = 0;
    s.kickOn = false;
    s.kickId = 0;
    s.everMoved = false;
    s.stillT = 0;
    s.stillDone = false;
    s.firstKick = false;
    s.spd = { 20: { slow: 0, fast: 0 }, 60: { slow: 0, fast: 0 } };
    s.kickN = { 20: false, 60: false };
    s.flips = 0;
    s.slowDone = false;
    s.fastDone = false;
    s.flippedKick = false;
    s.pendingRow = null;
    s.grabbedOnce = false;
    s.loopsV = 20;
    s.strengthV = 1;
    s.polSign = 1;
    setFlipped(false);
    setLoops(20);
    setStrength(1);
    setRows([]);
    setMentorIndex(0);
    setEverSlow(false);
    setEverFast(false);
    setEverFlippedKick(false);
    setSawGraph(false);
    setLenzNote(false);
    setBadges([]);
    syncUi();
  };

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (lenzNote) return { tone: 'info', line: 'Polarity flipped — the coil now sees the field backwards, so every induced current reverses too. Lenz’s law: the induced current always opposes the change that made it.' };
    if (badges.includes('stillness-proof') && Math.abs(ui.vcm) < 2 && !ui.dragging) return { tone: 'good', line: 'Still magnet, dead needle — EMF needs a changing flux, and a parked magnet changes nothing.' };
    if (Math.abs(ui.emf) > 120) return { tone: 'good', line: `Big kick — ${Math.abs(ui.emf).toFixed(0)} mV while sweeping at ${Math.abs(ui.vcm).toFixed(0)} cm/s. Faster motion, bigger EMF.` };
    if (!sim.current.grabbedOnce) return { tone: 'info', line: 'Grab the bar magnet and slide it along the axis into the coil — slow first, so you can see the needle kick and settle.' };
    if (Math.abs(ui.nu) < 0.03 && Math.abs(ui.vcm) < 2 && sim.current.everMoved) return { tone: 'info', line: 'The needle is back at zero — hold it still a moment longer and the lab will bank your stillness proof.' };
    if (rows.length >= 3 && !badges.includes('loop-multiplier')) return { tone: 'info', line: 'Nice table of kicks building. Now try 60 loops, and a slow push versus a fast pull — the graph in Observations will straighten everything out.' };
    return { tone: 'info', line: 'EMF = −N·dΦ/dt — motion is mandatory. Push in, pull out, hold still, flip, and watch the needle keep score.' };
  }, [lenzNote, badges, ui, rows.length]);

  // ---- status ------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Law demonstrated — nice work' : sim.current.dragging ? 'Dragging — watch the needle' : rows.length ? 'Inducing — kicks banked' : 'Experiment ready';

  // ---- render -------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="Hand-driven Faraday bench"
      legend={[
        { color: '#d64541', label: 'Magnet N' },
        { color: '#3f6fbf', label: 'Magnet S' },
        { color: '#c08531', label: 'Coil & leads' },
        { color: '#e8632a', label: 'Induced current' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — start inducing', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Induction bench — drag the bar magnet along the coil axis and watch the galvanometer"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const s = sim.current;
              if (!s.dragging) {
                s.vx = clamp(s.vx + (e.key === 'ArrowRight' ? 260 : -260), -900, 900);
                notePointer(true);
              }
            } else if (e.key === ' ' && !e.repeat) {
              e.preventDefault();
              const s = sim.current;
              const canvas = canvasRef.current;
              const w = canvas?.clientWidth ?? 800;
              const L = layoutOf(w, canvas?.clientHeight ?? 500);
              if (!s.dragging) {
                s.vx = s.x < L.cx ? 430 : -430;
                notePointer(true);
              }
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
          <div className="ind-control-row">
            <button
              className="action-button ind-flip"
              type="button"
              data-nudge="flip"
              onClick={flipPolarity}
            >
              <span className="dispense-icon" aria-hidden="true">⇄</span>
              <span>Flip magnet polarity</span>
              <small>{flipped ? 'S now leads on the right' : 'N now leads on the right'}</small>
            </button>
            <div className="ind-selects">
              <label data-nudge="loops">
                <span>Coil loops</span>
                <select value={loops} onChange={(e) => changeLoops(Number(e.target.value))} aria-label="Number of coil loops">
                  <option value={20}>20 loops</option>
                  <option value={60}>60 loops</option>
                </select>
              </label>
              <label>
                <span>Magnet strength</span>
                <select value={strength} onChange={(e) => changeStrength(Number(e.target.value))} aria-label="Magnet strength">
                  <option value={1}>Weak</option>
                  <option value={1.8}>Strong</option>
                </select>
              </label>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Drag the magnet with your pointer — or fling it and let it slide. Hold it still and the needle returns to zero; speed, direction, polarity and loop count all change what the galvanometer does. Arrow keys nudge the magnet; Space fires it through the coil.</p></div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Galvanometer &amp; field</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Galvanometer reading (±5 mA, centre zero)</span>
            <strong>{(ui.nu * IFs_MA >= 0 ? '+' : '')}{(ui.nu * IFs_MA).toFixed(2)} <small>mA</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (Math.abs(ui.nu) / 1.15) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0</span><span>full scale</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Magnet position</span><strong>{ui.xcm >= 0 ? '+' : ''}{ui.xcm.toFixed(1)}<small> cm</small></strong></div>
            <div><span>Magnet speed</span><strong>{Math.abs(ui.vcm).toFixed(0)}<small> cm/s</small></strong></div>
            <div><span>Flux Φ through coil</span><strong>{ui.phi.toFixed(0)}<small> µWb</small></strong></div>
            <div><span>EMF (−N·dΦ/dt)</span><strong>{ui.emf.toFixed(1)}<small> mV</small></strong></div>
            <div><span>Coil loops</span><strong>{loops}</strong></div>
            <div><span>Leading pole</span><strong>{flipped ? 'S' : 'N'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Grab the magnet and push it slowly into the coil — the needle kicks, then settles.</li>
              <li>Hold it dead still for three seconds — the needle proves EMF needs motion.</li>
              <li>Pull it out fast — a bigger kick, on the opposite side of zero.</li>
              <li>Flip the polarity and push in again — the kick reverses.</li>
              <li>Switch to 60 loops and repeat a stroke — deflection grows about threefold.</li>
              <li>Open Observations and read EMF = −N·dΦ/dt off your own kick table.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Each completed kick is banked automatically with its peak EMF and the speed that made it — compare slow strokes with fast ones in the graph to see the proportionality directly.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your kick table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Move the magnet through the coil — every completed deflection is banked here with its peak EMF, direction and speed.</p>
            ) : (
              <>
                <table className="trial-table">
                  <thead><tr><th>#</th><th>Peak EMF (mV)</th><th>Needle</th><th>Speed (cm/s)</th><th>Loops</th><th>Pole</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.emf.toFixed(1)}</td>
                        <td>{r.dir === 1 ? 'right' : 'left'}</td>
                        <td>{r.speed.toFixed(0)}</td>
                        <td>{r.loops}</td>
                        <td>{r.pol === 1 ? 'N' : 'S'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Peak EMF versus speed</h3>
                <Plot
                  points={rows.map((r) => ({ x: r.speed, y: r.emf }))}
                  xLabel="speed (cm/s)"
                  yLabel="peak EMF (mV)"
                  fitLine
                  height={220}
                  livePoint={Math.abs(ui.vcm) > 2 ? { x: Math.abs(ui.vcm), y: Math.abs(ui.emf) } : null}
                />
                <p className="observation-note">Points from 60-loop strokes sit roughly three times higher than 20-loop strokes at the same speed — that is the N in Faraday’s law. The fitted line through the origin is the proportionality EMF ∝ speed.</p>
              </>
            )}
            <p className="observation-note">Direction flips with motion direction and with polarity; magnitude tracks speed. Nothing appears for a stationary magnet — no matter where it sits.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>The coil feels the magnetic flux Φ of the magnet. Only a <em>changing</em> flux induces anything:</p>
            <div className="equation">EMF = −N · dΦ/dt</div>
            <p>N is the number of loops — triple them and the same flux change pushes three times the EMF, which is exactly what the 60-loop setting shows. The minus sign is Lenz’s law: the induced current flows so that its own field opposes the change in flux. Push the N pole in and the coil makes a facing N to repel it; pull it out and the coil makes an S to hold it back.</p>
            <p>The galvanometer needle has inertia and a return spring, so it kicks, overshoots and settles — read it at rest for the honest value. In this bench the magnet is modelled as three co-axial dipoles spread along its length, so the flux curve (and therefore the EMF at every speed) comes from the exact dipole-flux formula, integrated numerically 240 times a second.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && rows.length >= 1) setSawGraph(true); }}
    />
  );

  // ---- canvas painters (pure) ---------------------------------------------------

  function drawMagnet(ctx: CanvasRenderingContext2D, x: number, y: number, pol: number) {
    const w2 = MAG_L_PX / 2;
    const hh = MAG_H_PX / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(23,35,52,0.3)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = pol > 0 ? '#3f6fbf' : '#d64541';
    roundRect(ctx, x - w2, y - hh, MAG_L_PX, MAG_H_PX, 5);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x - w2, y - hh, MAG_L_PX, MAG_H_PX, 5);
    ctx.clip();
    ctx.fillStyle = pol > 0 ? '#d64541' : '#3f6fbf';
    ctx.fillRect(x, y - hh, w2, MAG_H_PX);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fillRect(x - w2, y - hh, MAG_L_PX, 4);
    ctx.restore();
    ctx.strokeStyle = '#2e3a4a';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x - w2, y - hh, MAG_L_PX, MAG_H_PX, 5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '800 13px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pol > 0 ? 'S' : 'N', x - w2 / 2, y + 1);
    ctx.fillText(pol > 0 ? 'N' : 'S', x + w2 / 2, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawGalvo(ctx: CanvasRenderingContext2D, gx: number, gy: number, gr: number, u: number) {
    // bezel
    ctx.save();
    ctx.shadowColor = 'rgba(23,35,52,0.28)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    const bez = ctx.createRadialGradient(gx - gr * 0.3, gy - gr * 0.35, gr * 0.2, gx, gy, gr);
    bez.addColorStop(0, '#f3d99a');
    bez.addColorStop(0.6, '#d9a441');
    bez.addColorStop(1, '#8a6420');
    ctx.fillStyle = bez;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // face
    ctx.fillStyle = '#fdfcf7';
    ctx.beginPath();
    ctx.arc(gx, gy, gr - 5, 0, Math.PI * 2);
    ctx.fill();

    const pivotY = gy + gr * 0.32;
    const arcR = gr * 0.74;
    // scale arc (centre-zero) with ticks
    ctx.strokeStyle = '#4a5769';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(gx, pivotY, arcR, -Math.PI / 2 - 0.87, -Math.PI / 2 + 0.87);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let k = -5; k <= 5; k += 1) {
      const a = -Math.PI / 2 + (k / 5) * 0.87;
      const len = k % 5 === 0 ? 9 : 5;
      ctx.beginPath();
      ctx.moveTo(gx + Math.cos(a) * (arcR - 2), pivotY + Math.sin(a) * (arcR - 2));
      ctx.lineTo(gx + Math.cos(a) * (arcR - 2 - len), pivotY + Math.sin(a) * (arcR - 2 - len));
      ctx.strokeStyle = Math.abs(k) === 5 ? '#c0392b' : '#4a5769';
      ctx.stroke();
    }
    // needle
    const ang = -Math.PI / 2 + clamp(u, -1.15, 1.15) * 0.87;
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx - Math.cos(ang) * 12, pivotY - Math.sin(ang) * 12);
    ctx.lineTo(gx + Math.cos(ang) * (arcR - 6), pivotY + Math.sin(ang) * (arcR - 6));
    ctx.stroke();
    // pivot hub
    ctx.fillStyle = '#8a6420';
    ctx.beginPath();
    ctx.arc(gx, pivotY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(gx - 1.4, pivotY - 1.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // glass shine
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, gr - 9, -2.5, -1.5);
    ctx.stroke();
    // terminal posts
    ctx.fillStyle = '#c9a25a';
    for (const p of [{ x: gx, y: gy - gr + 3 }, { x: gx - gr + 3, y: gy }]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a6420';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
