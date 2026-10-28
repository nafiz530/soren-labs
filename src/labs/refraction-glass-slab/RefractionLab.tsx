import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { clamp, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './refraction-glass-slab.css';

/**
 * Refraction through a rectangular glass slab — Snell's law lab.
 *
 * The student drags a light box along an arc around the slab's left face,
 * sweeping the angle of incidence from 0° to 60°. A live protractor frames
 * the point of incidence; the panel reads both angles honestly (r really is
 * asin(sin i / 1.5)). Recorded pairs (i, r) turn into a sin i–sin r graph
 * whose slope is the refractive index, while the emergent ray stays parallel
 * to the incident ray with a lateral shift that visibly grows with angle.
 */

const N_GLASS = 1.5;
const SLAB_THICKNESS_CM = 6;
const MAX_ANGLE = 60;
const TARGET_ANGLES = 5;
const RAD = Math.PI / 180;

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'aim', title: 'Aim the ray', detail: 'Drag the light box along its arc until the protractor reads about 30°. The ray kinks toward the normal the moment it enters the glass.', hint: 'On touch screens drag with a finger — or use the angle slider below the scene.' },
  { id: 'read', title: 'Read the refraction angle', detail: 'The bench readings show both angles live. At i ≈ 30° the glass gives r ≈ 19.5° — read it off the protractor, then record the pair.' },
  { id: 'sweep', title: 'Sweep five angles', detail: 'Sweep to fresh angles across 0–60° and record each pair. Spread them out — a line loves reach.', hint: 'Include one steep angle near 50°: that is where the sideways shift gets dramatic.' },
  { id: 'graph', title: 'Open your graph', detail: 'Observations plots sin i against sin r. Your points should already be marching along a straight line through the origin.' },
  { id: 'index', title: 'Read off the index', detail: 'The slope of the sin i–sin r line is the refractive index. Compare yours with crown glass at about 1.5.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-ray', title: 'First ray', icon: '✦', detail: 'Steered the light box for the first time.' },
  { id: 'five-angles', title: 'Five angles', icon: '◔', detail: 'Recorded five distinct angles of incidence.' },
  { id: 'index-hunter', title: 'Index hunter', icon: '◎', detail: 'Measured the refractive index within 2% of 1.5.' },
  { id: 'shift-spotter', title: 'Shift spotter', icon: '⇉', detail: 'Recorded at 50° or more and caught the lateral shift.' },
];

interface TrialRow { id: number; i: number; r: number; sinI: number; sinR: number }
interface UiSnap { i: number; r: number; dragging: boolean }
interface Pulse { seg: number; s: number }

const meta = getLabBySlug('refraction-glass-slab')!;

const refract = (iDeg: number) => Math.asin(Math.sin(iDeg * RAD) / N_GLASS) / RAD;
const lateralShiftCm = (iDeg: number, rDeg: number) => (SLAB_THICKNESS_CM * Math.sin((iDeg - rDeg) * RAD)) / Math.cos(rDeg * RAD);

export default function RefractionLab() {
  // ---- simulation state (refs — the canvas loop owns the motion) ----------
  const sim = useRef({
    display: 0, // eased angle actually drawn
    dragging: false,
    pulses: [] as Pulse[],
    spawnAt: 0,
    t: 0,
    uiAcc: 0,
    slideAt: 0,
    shiftTimer: 0,
    shiftNoted: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls -----------------------------------------------------
  const [angle, setAngle] = useState(0);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [aimed30, setAimed30] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [shiftSeen, setShiftSeen] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ i: 0, r: 0, dragging: false });

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
    setUi({ i: s.display, r: refract(s.display), dragging: s.dragging });
  }, []);

  // ---- analysis (declared before mentor flags that read it) ----------------
  const fit = useMemo(
    () => (rows.length >= 2 ? linearFit(rows.map((r) => ({ x: r.sinR, y: r.sinI }))) : null),
    [rows],
  );
  const nEst = fit && fit.m > 0 ? fit.m : null;

  // ---- mentor completion flags ----------------------------------------------
  const interacted = badges.includes('first-ray');
  const distinctI = new Set(rows.map((r) => r.i.toFixed(1))).size;
  const done = [
    aimed30,
    rows.length >= 1,
    distinctI >= TARGET_ANGLES,
    sawGraph && distinctI >= TARGET_ANGLES,
    sawGraph && nEst !== null,
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
    if (angle >= 27 && angle <= 33) setAimed30(true);
  }, [angle]);

  // ---- nudge ------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'aim': return { target: 'scene', gesture: 'drag', title: 'Aim the ray', body: 'Grab the light box and drag it along its arc until the protractor reads about 30°. The ray bends as it enters the glass.' };
      case 'read': return { target: 'record', gesture: 'press', title: 'Record the pair', body: 'Read i and r off the bench readings, then press “Record this pair” to bank them in your table.' };
      case 'sweep': return { target: 'angle', gesture: 'drag', title: 'Sweep a new angle', body: 'Slide the angle (drag the box or the slider) to a fresh value and record again — five distinct angles make the line honest.' };
      case 'graph': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your sin i vs sin r graph lives in the Observations tab — the fitted slope is the refractive index.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ----------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const sw = clamp(w * 0.26, 140, 250);
    const sh = clamp(h * 0.6, 220, 330);
    const cx = w * 0.56;
    const cy = h * 0.5;
    const p1 = { x: cx - sw / 2, y: cy - sh * 0.24 };
    const R = clamp(Math.min(h * 0.3, w * 0.24), 105, 170);
    return { w, h, sw, sh, cx, cy, p1, R };
  }, []);

  /** Full ray path for a given incidence angle (degrees). */
  const path = useCallback((iDeg: number) => {
    const g = geom();
    const iRad = iDeg * RAD;
    const rRad = refract(iDeg) * RAD;
    const box = { x: g.p1.x - g.R * Math.cos(iRad), y: g.p1.y - g.R * Math.sin(iRad) };
    const ap = { x: box.x + 33 * Math.cos(iRad), y: box.y + 33 * Math.sin(iRad) };
    const p2 = { x: g.p1.x + g.sw, y: g.p1.y + g.sw * Math.tan(rRad) };
    const dir = { x: Math.cos(iRad), y: Math.sin(iRad) };
    const tX = (g.w - p2.x) / dir.x;
    const tY = dir.y > 0.001 ? (g.h - p2.y) / dir.y : Infinity;
    const tEnd = Math.max(70, Math.min(tX, tY));
    const end = { x: p2.x + dir.x * tEnd, y: p2.y + dir.y * tEnd };
    const segs: { x: number; y: number }[][] = [[ap, g.p1], [g.p1, p2], [p2, end]];
    const lens = segs.map((sg) => Math.hypot(sg[1].x - sg[0].x, sg[1].y - sg[0].y));
    return { g, box, ap, p1: g.p1, p2, end, segs, lens };
  }, [geom]);

  // ---- physics + animation -------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.t += dt;
    s.display += (angle - s.display) * Math.min(1, dt * 10);
    if (Math.abs(angle - s.display) < 0.01) s.display = angle;

    // dwell timer for the lateral-shift note
    if (s.display >= 48) {
      s.shiftTimer += dt;
      if (s.shiftTimer > 0.8 && !s.shiftNoted) {
        s.shiftNoted = true;
        setShiftSeen(true);
      }
    } else {
      s.shiftTimer = 0;
    }

    // photon pulses run the path — slower inside the glass, like real light
    const P = path(s.display);
    const speeds = [330, 330 / N_GLASS, 330];
    s.spawnAt += dt;
    if (s.spawnAt > 0.6 && s.pulses.length < 3) {
      s.spawnAt = 0;
      s.pulses.push({ seg: 0, s: 0 });
    }
    for (const p of s.pulses) {
      p.s += speeds[p.seg] * dt;
      while (p.s > P.lens[p.seg]) {
        p.s -= P.lens[p.seg];
        p.seg += 1;
        if (p.seg > 2) {
          p.seg = 0;
          p.s = 0;
          break;
        }
      }
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [angle, path, syncUi]);

  // ---- drawing --------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const iDeg = s.display;
    const iRad = iDeg * RAD;
    const rDeg = refract(iDeg);
    const rRad = rDeg * RAD;
    const P = path(iDeg);
    const { g } = P;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // optical-table dot grid + border
    if (w > 460) {
      ctx.fillStyle = '#dbe2e9';
      for (let x = 26; x < w - 16; x += 26) {
        for (let y = 30; y < h - 26; y += 26) {
          ctx.beginPath();
          ctx.arc(x, y, 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = '#dfe5ec';
    ctx.lineWidth = 2;
    roundRect(ctx, 10, 10, w - 20, h - 20, 14);
    ctx.stroke();

    // drag rail for the light box
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = s.dragging ? 'rgba(152,164,176,0.55)' : 'rgba(152,164,176,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(g.p1.x, g.p1.y, g.R, Math.PI, Math.PI + 78 * RAD);
    ctx.stroke();
    ctx.setLineDash([]);

    // glass slab
    const slabGrad = ctx.createLinearGradient(0, g.cy - g.sh / 2, 0, g.cy + g.sh / 2);
    slabGrad.addColorStop(0, 'rgba(157,186,203,0.34)');
    slabGrad.addColorStop(0.5, 'rgba(141,168,185,0.24)');
    slabGrad.addColorStop(1, 'rgba(125,154,173,0.32)');
    ctx.fillStyle = slabGrad;
    ctx.shadowColor = 'rgba(60,80,100,0.18)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    roundRect(ctx, g.cx - g.sw / 2, g.cy - g.sh / 2, g.sw, g.sh, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    roundRect(ctx, g.cx - g.sw / 2, g.cy - g.sh / 2, g.sw, g.sh, 7);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.cx - g.sw / 2 + 9, g.cy - g.sh / 2 + g.sh * 0.3);
    ctx.lineTo(g.cx + g.sw / 2 - 9, g.cy - g.sh / 2 + g.sh * 0.14);
    ctx.stroke();

    // dashed normals at both faces
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = '#9aa4b1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(P.p1.x - 84, P.p1.y);
    ctx.lineTo(P.p1.x + 76, P.p1.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(P.p2.x - 72, P.p2.y);
    ctx.lineTo(P.p2.x + 72, P.p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // protractor at the point of incidence
    const Rp = 58;
    ctx.strokeStyle = '#aeb9c4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(P.p1.x, P.p1.y, Rp, Math.PI, Math.PI + 75 * RAD);
    ctx.stroke();
    ctx.fillStyle = '#8a96a4';
    ctx.font = '9px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    for (let a = 0; a <= 75; a += 5) {
      const th = Math.PI + a * RAD;
      const inner = Rp - (a % 15 === 0 ? 10 : 5);
      ctx.strokeStyle = a % 15 === 0 ? '#98a4b0' : '#c0cad3';
      ctx.lineWidth = a % 15 === 0 ? 1.6 : 1.2;
      ctx.beginPath();
      ctx.moveTo(P.p1.x + Math.cos(th) * inner, P.p1.y + Math.sin(th) * inner);
      ctx.lineTo(P.p1.x + Math.cos(th) * Rp, P.p1.y + Math.sin(th) * Rp);
      ctx.stroke();
      if (a % 15 === 0) {
        ctx.fillText(`${a}°`, P.p1.x + Math.cos(th) * (Rp + 13), P.p1.y + Math.sin(th) * (Rp + 13) + 3);
      }
    }

    // incidence wedge (air side, above the normal)
    if (iDeg > 0.5) {
      ctx.beginPath();
      ctx.moveTo(P.p1.x, P.p1.y);
      ctx.arc(P.p1.x, P.p1.y, Rp - 12, Math.PI, Math.PI + iRad);
      ctx.closePath();
      ctx.fillStyle = 'rgba(249,115,22,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,99,42,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // refraction wedge (glass side, below the normal)
    if (rDeg > 0.35) {
      ctx.beginPath();
      ctx.moveTo(P.p1.x, P.p1.y);
      ctx.arc(P.p1.x, P.p1.y, 46, 0, rRad);
      ctx.closePath();
      ctx.fillStyle = 'rgba(90,140,170,0.20)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,140,170,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // unrefracted extension of the incident ray (shows the lateral shift)
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(249,115,22,0.30)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(P.p1.x, P.p1.y);
    ctx.lineTo(P.end.x, P.end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // lateral-shift bracket between extension and emergent ray
    if (iDeg > 4) {
      const bx = P.p2.x + Math.min(52, (g.w - P.p2.x) * 0.4);
      if (bx < g.w - 8) {
        const tExt = (bx - P.p1.x) / Math.cos(iRad);
        const tEm = (bx - P.p2.x) / Math.cos(iRad);
        const ey = P.p1.y + Math.sin(iRad) * tExt;
        const sy = P.p2.y + Math.sin(iRad) * tEm;
        if (sy < g.h - 8) {
          ctx.strokeStyle = 'rgba(93,138,166,0.8)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(bx, ey + 4);
          ctx.lineTo(bx, sy - 4);
          ctx.stroke();
          ctx.fillStyle = 'rgba(93,138,166,0.9)';
          for (const [px, py, dir] of [[bx, ey + 4, 1], [bx, sy - 4, -1]] as const) {
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - 3.5, py + dir * 4);
            ctx.lineTo(px + 3.5, py + dir * 4);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    // faint partial reflection whose intensity grows with angle
    if (iDeg > 1) {
      const reflAlpha = 0.06 + 0.4 * Math.pow(iDeg / MAX_ANGLE, 2);
      ctx.strokeStyle = `rgba(249,164,106,${reflAlpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(P.p1.x, P.p1.y);
      ctx.lineTo(P.p1.x - Math.cos(iRad) * 130, P.p1.y + Math.sin(iRad) * 130);
      ctx.stroke();
    }

    // the rays themselves
    ray(ctx, P.ap.x, P.ap.y, P.p1.x, P.p1.y, '#f97316', 2.5);
    ray(ctx, P.p1.x, P.p1.y, P.p2.x, P.p2.y, '#e8632a', 2.5);
    ray(ctx, P.p2.x, P.p2.y, P.end.x, P.end.y, '#f97316', 2.5);

    // glow at the interfaces
    glow(ctx, P.p1.x, P.p1.y, 11, 'rgba(249,115,22,0.22)');
    glow(ctx, P.p2.x, P.p2.y, 9, 'rgba(249,115,22,0.16)');

    // travelling pulses
    for (const p of s.pulses) {
      const seg = P.segs[p.seg];
      const len = Math.max(1, P.lens[p.seg]);
      const f = clamp(p.s / len, 0, 1);
      const x = seg[0].x + (seg[1].x - seg[0].x) * f;
      const y = seg[0].y + (seg[1].y - seg[0].y) * f;
      const ux = (seg[1].x - seg[0].x) / len;
      const uy = (seg[1].y - seg[0].y) / len;
      ctx.strokeStyle = 'rgba(255,190,120,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - ux * 14, y - uy * 14);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = '#ffb066';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffe3c2';
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // light box
    drawLightBox(ctx, P.box.x, P.box.y, iRad, s.dragging);
  }, [path]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const P = path(sim.current.display);
    const distBox = Math.hypot(px - P.box.x, py - P.box.y);
    const distRay = distToSeg(px, py, P.ap.x, P.ap.y, P.p1.x, P.p1.y);
    if (distBox < 42 || distRay < 16) {
      sim.current.dragging = true;
      labSound.slide(0.3);
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    } else {
      notePointer(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    const iRaw = Math.atan2(g.p1.y - py, g.p1.x - px) / RAD;
    const v = Math.round(clamp(iRaw, 0, MAX_ANGLE) * 2) / 2;
    if (v !== angle) {
      setAngle(v);
      const nowT = performance.now();
      if (nowT - s.slideAt > 90) {
        s.slideAt = nowT;
        labSound.slide(0.25 + Math.abs(v - angle) * 0.04);
      }
    }
    syncUi();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.dragging) return;
    s.dragging = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    syncUi();
  };

  // ---- controls -------------------------------------------------------------------
  const changeAngle = (v: number) => {
    setAngle(v);
    labSound.slide(0.4);
    notePointer(true);
    earn('first-ray');
    syncUi();
  };

  const recordPair = () => {
    const iDeg = Math.round(angle * 2) / 2;
    const rDeg = refract(iDeg);
    const row: TrialRow = {
      id: rows.length + 1,
      i: iDeg,
      r: rDeg,
      sinI: Math.sin(iDeg * RAD),
      sinR: Math.sin(iDeg * RAD) / N_GLASS,
    };
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded: i = ${iDeg.toFixed(1)}°, r = ${rDeg.toFixed(1)}° — sin i / sin r = ${(row.sinI / row.sinR).toFixed(3)}`);
    if (iDeg >= 50 && shiftSeen) earn('shift-spotter');
    if (new Set([...rows.map((x) => x.i.toFixed(1)), iDeg.toFixed(1)]).size >= TARGET_ANGLES) earn('five-angles');
  };

  const resetAll = () => {
    const s = sim.current;
    s.display = 0;
    s.dragging = false;
    s.pulses = [];
    s.shiftNoted = false;
    s.shiftTimer = 0;
    setAngle(0);
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setAimed30(false);
    setSawGraph(false);
    setShiftSeen(false);
    setBadges([]);
    syncUi();
  };

  // ---- badges from the fit ------------------------------------------------------------
  useEffect(() => {
    if (nEst && !badges.includes('index-hunter') && Math.abs(nEst - N_GLASS) / N_GLASS <= 0.02) {
      labSound.milestone();
      earn('index-hunter');
      pushToast('good', '◎', `Slope = ${nEst.toFixed(3)} — that is your refractive index, within 2% of crown glass.`);
    }
  }, [nEst, badges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- coach --------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.i >= 48) {
      return { tone: 'info', line: `Steep stuff — the emergent ray stays parallel but has jogged sideways by ${lateralShiftCm(ui.i, ui.r).toFixed(2)} cm. Record this one; the shift grows fast from here.` };
    }
    if (!interacted) return { tone: 'info', line: 'Drag the light box around its arc — at 0° the ray goes straight through; tilt it and the glass drags the ray toward the normal.' };
    if (rows.length === 0) return { tone: 'info', line: `Protractor reads i = ${ui.i.toFixed(1)}°, r = ${ui.r.toFixed(1)}° — bank the pair with the record button.` };
    if (distinctI < TARGET_ANGLES) return { tone: 'info', line: 'Pair banked. Sweep to a fresh angle — spread across 0–60° so the line has reach.' };
    if (!sawGraph) return { tone: 'good', line: 'Five angles collected — open Observations: sin i versus sin r is already straightening up.' };
    if (nEst) {
      const err = ((nEst - N_GLASS) / N_GLASS) * 100;
      return { tone: Math.abs(err) <= 2 ? 'good' : 'warn', line: `Your n = ${nEst.toFixed(3)} — ${Math.abs(err).toFixed(1)}% ${err >= 0 ? 'above' : 'below'} crown glass at 1.5. More angles tighten the fit.` };
    }
    return { tone: 'info', line: 'Keep sweeping — the mentor is watching your hands.' };
  }, [ui, interacted, rows.length, distinctI, sawGraph, nEst]);

  // ---- status -----------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : ui.dragging
      ? 'Aiming the ray'
      : rows.length
        ? 'Pair recorded — next angle'
        : 'Bench ready — set the angle';
  const sameAngle = rows.length > 0 && Math.abs(rows[rows.length - 1].i - angle) < 0.4;

  // ---- render --------------------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="Student-controlled optics bench"
      legend={[
        { color: '#f97316', label: 'Incident & emergent ray' },
        { color: '#e8632a', label: 'Refracted ray in glass' },
        { color: '#8da8b9', label: 'Glass slab' },
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
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Optics bench — drag the light box along its arc to set the angle of incidence"
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
              e.preventDefault();
              if (!e.repeat) changeAngle(clamp(angle + 1, 0, MAX_ANGLE));
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
              e.preventDefault();
              if (!e.repeat) changeAngle(clamp(angle - 1, 0, MAX_ANGLE));
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
          <div className="refraction-layout">
            <div className="refraction-sliders">
              <div className="lab-slider-row" data-nudge="angle">
                <label><span>Angle of incidence i</span><strong>{ui.i.toFixed(1)}°</strong></label>
                <input
                  type="range" min="0" max={MAX_ANGLE} step="0.5" value={angle}
                  aria-label="Angle of incidence in degrees (accessibility alternative to dragging the light box)"
                  onChange={(e) => changeAngle(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="angle-duo">
              <div className="deg-i">
                <span>Incidence i</span>
                <strong>{ui.i.toFixed(1)}°</strong>
                <small>sin i = {Math.sin(ui.i * RAD).toFixed(4)}</small>
              </div>
              <div className="deg-r">
                <span>Refraction r</span>
                <strong>{ui.r.toFixed(1)}°</strong>
                <small>sin r = {(Math.sin(ui.i * RAD) / N_GLASS).toFixed(4)}</small>
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Angles are read from the normal (the dashed line). Sweep five angles from 0° to 60° and record each — the slope of your sin i–sin r line is the refractive index.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordPair(); notePointer(true); }}
            disabled={sameAngle}
          >
            {sameAngle ? 'Sweep to a new angle first' : `✎ Record this pair — i = ${ui.i.toFixed(1)}°, r = ${ui.r.toFixed(1)}°`}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Protractor readouts</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Angle of incidence i (live)</span>
            <strong>{ui.i.toFixed(1)} <small>°</small></strong>
            <div className="reading-track"><span style={{ width: `${(ui.i / MAX_ANGLE) * 100}%` }} /></div>
            <div className="reading-scale"><span>0°</span><span>60°</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Refraction r</span><strong>{ui.r.toFixed(2)}°</strong></div>
            <div><span>sin i</span><strong>{Math.sin(ui.i * RAD).toFixed(4)}</strong></div>
            <div><span>sin r</span><strong>{(Math.sin(ui.i * RAD) / N_GLASS).toFixed(4)}</strong></div>
            <div><span>Lateral shift</span><strong>{lateralShiftCm(ui.i, ui.r).toFixed(2)} cm</strong></div>
            <div><span>Emergent angle</span><strong>{ui.i.toFixed(1)}°</strong></div>
            <div><span>Slab thickness</span><strong>{SLAB_THICKNESS_CM}.0 cm</strong></div>
          </div>
          <div className="refraction-n-readout">
            <span>Measured refractive index</span>
            <strong>{nEst ? nEst.toFixed(3) : <small style={{ fontSize: 13 }}>record 2+ pairs to fit n</small>}</strong>
            {fit && nEst && <p>From the sin i–sin r fit with R² = {fit.r2.toFixed(4)} over {rows.length} pair{rows.length > 1 ? 's' : ''} · slope = n = sin i / sin r · crown glass ≈ 1.5 · error {((Math.abs(nEst - N_GLASS) / N_GLASS) * 100).toFixed(1)}%</p>}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the light box along its arc (or use the angle slider) until the protractor reads i ≈ 30°.</li>
              <li>Read the refraction angle r from the bench readings — at 30° it should land near 19.5°.</li>
              <li>Record the pair; the table fills in sin i and sin r for you.</li>
              <li>Sweep five different angles between 0° and 60°, recording each one.</li>
              <li>Open Observations and read the refractive index off the slope of the sin i–sin r line.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Include one steep angle near 50–60°: the sideways shift of the emergent ray grows fast there, and the faint reflected ray at the entry face brightens as the angles steepen.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Aim the light box, read i and r off the protractor readouts, and record your first pair. Five spread-out angles unlock the graph.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>i (°)</th><th>r (°)</th><th>sin i</th><th>sin r</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}><td>{r.id}</td><td>{r.i.toFixed(1)}</td><td>{r.r.toFixed(1)}</td><td>{r.sinI.toFixed(4)}</td><td>{r.sinR.toFixed(4)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>sin i – sin r analysis</h3>
                <Plot
                  points={rows.map((r) => ({ x: r.sinR, y: r.sinI }))}
                  xLabel="sin r"
                  yLabel="sin i"
                  fitLine
                  livePoint={{ x: Math.sin(ui.r * RAD), y: Math.sin(ui.i * RAD) }}
                  height={220}
                />
                {nEst && <p className="observation-note">Slope = {fit?.m.toFixed(4)} → n = sin i / sin r = <strong>{nEst.toFixed(3)}</strong> ({((Math.abs(nEst - N_GLASS) / N_GLASS) * 100).toFixed(1)}% from crown glass at 1.5).</p>}
              </>
            )}
            <p className="observation-note">Each point is one of your recorded pairs. Snell's law promises they all lie on one straight line through the origin — your own data is the proof.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Light travels slower inside glass than in air. When a ray crosses the boundary at an angle, the part of the wavefront that enters first slows down before the rest, swinging the ray toward the normal — the way a car's wheels drag when one side hits a patch of gravel. The bending obeys Snell's law, written with the angles measured from the normal:</p>
            <div className="equation">n₁ sin i = n₂ sin r</div>
            <p>Air's index is almost exactly 1, so for a glass slab the law collapses to sin i = n sin r. That is why this lab plots sin i against sin r: the points fall on a line through the origin whose slope is the refractive index n — no more, no less.</p>
            <p>Because the slab's two faces are parallel, the bend at the far face exactly undoes the first: the emergent ray leaves parallel to the incident ray, only nudged sideways by the lateral shift d = t·sin(i−r)/cos r for a slab of thickness t — watch that shift balloon as you steepen the angle. A little light also reflects at each face; it is faint at small angles and visibly brightens toward grazing incidence, which is exactly what the faint reflected ray in the scene shows.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && distinctI >= TARGET_ANGLES) setSawGraph(true); }}
    />
  );
}

// ---- drawing helpers ------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ray(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // chevron at 55% along the ray, pointing along travel
  const mx = x1 + (x2 - x1) * 0.55;
  const my = y1 + (y2 - y1) * 0.55;
  const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(mx + ux * 5, my + uy * 5);
  ctx.lineTo(mx - uy * 4, my + ux * 4);
  ctx.lineTo(mx + uy * 4, my - ux * 4);
  ctx.closePath();
  ctx.fill();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawLightBox(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, active: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // shadow
  ctx.fillStyle = 'rgba(40,55,75,0.14)';
  ctx.beginPath();
  ctx.ellipse(4, 18, 24, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  const grad = ctx.createLinearGradient(0, -16, 0, 16);
  grad.addColorStop(0, '#51617a');
  grad.addColorStop(0.5, '#3d4a5c');
  grad.addColorStop(1, '#2c3644');
  ctx.fillStyle = grad;
  roundRect(ctx, -26, -15, 52, 30, 7);
  ctx.fill();
  ctx.strokeStyle = '#242e3a';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -26, -15, 52, 30, 7);
  ctx.stroke();
  // brass band
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, -24, -13, 48, 5, 3);
  ctx.fill();
  // vents
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-18 + i * 7, 4);
    ctx.lineTo(-18 + i * 7, 10);
    ctx.stroke();
  }
  // barrel + glowing aperture
  ctx.fillStyle = '#242e3a';
  roundRect(ctx, 24, -5, 10, 10, 3);
  ctx.fill();
  const ap = ctx.createRadialGradient(30, 0, 1, 30, 0, 7);
  ap.addColorStop(0, active ? '#ffd9a8' : '#ffc98a');
  ap.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = ap;
  ctx.beginPath();
  ctx.arc(30, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  // light cone toward the slab
  const cone = ctx.createLinearGradient(32, 0, 62, 0);
  cone.addColorStop(0, 'rgba(249,115,22,0.28)');
  cone.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(32, -5);
  ctx.lineTo(62, -11);
  ctx.lineTo(62, 11);
  ctx.lineTo(32, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
