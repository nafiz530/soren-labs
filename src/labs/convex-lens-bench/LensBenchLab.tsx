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
import './convex-lens-bench.css';

/**
 * Convex lens bench — focal length by the u–v method.
 *
 * The student drags a 3 cm object arrow along a slider track left of a
 * convex lens (f = 10 cm) and hunts the sharp image by dragging a white
 * screen along the bench. Three principal rays are constructed honestly
 * (parallel ray, chief ray, focal ray) so they cross at the true image tip
 * for every object position. Recorded (u, v) pairs — with u negative by the
 * Cartesian convention — give a 1/v versus 1/u line of slope 1 whose
 * intercept is 1/f. Inside the focal length the rays diverge and the coach
 * walks through the virtual-image case.
 */

const F_CM = 10;
const OBJ_H_CM = 3;
const APERTURE_CM = 6;
const U_MIN = 6;
const U_MAX = 50;
const V_MIN = 8;
const V_MAX = 60;
const EXAG = 1.6; // vertical exaggeration for the ray diagram (ratios stay true)
const TARGET_ROWS = 5;
const SHARP_BLUR = 0.15; // cm of blur circle that still counts as "sharp"
const PING_BLUR = 0.12;

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'object', title: 'Move the object', detail: 'Drag the orange arrow along the track to u = 30 cm — the ruler on the bench counts centimetres from the lens.', hint: 'Drag the arrow itself, or use the object-distance slider below the scene.' },
  { id: 'screen', title: 'Find the sharp image', detail: 'Drag the white screen along the bench until the blur circle tightens into a crisp inverted arrow — a soft ping marks perfect focus.', hint: 'Fine-focus with the screen slider or the canvas arrow keys (±0.1 cm).' },
  { id: 'record', title: 'Record the pair', detail: 'With the image sharp, record u and v. The table converts them to 1/u and 1/v for you — u goes in negative, by the sign convention.' },
  { id: 'sweep', title: 'Four more positions', detail: 'Move the object to four new positions between 12 and 50 cm, focus each time, and record. Spread them out — the graph loves reach.' },
  { id: 'graph', title: 'Read f off the graph', detail: 'Observations plots 1/v against 1/u. The line has slope 1 and its intercept on the 1/v axis is 1/f — compare with the 10 cm lens.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-focus', title: 'First focus', icon: '◉', detail: 'Focused a sharp real image on the screen for the first time.' },
  { id: 'five-positions', title: 'Five positions', icon: '⇄', detail: 'Recorded five distinct object positions.' },
  { id: 'focal-master', title: 'Focal master', icon: '🎯', detail: 'Measured the focal length within 2% of 10 cm.' },
  { id: 'blur-detective', title: 'Blur detective', icon: '◐', detail: 'Ventured inside the focal length and met the virtual image.' },
];

interface TrialRow { id: number; u: number; v: number }
interface UiSnap { u: number; v: number; blur: number; virt: boolean; sharp: number }

const meta = getLabBySlug('convex-lens-bench')!;

/** Live thin-lens optics: image position, blur circle and sharpness. */
function optics(uCm: number, vScreen: number) {
  if (uCm <= F_CM) return { virt: true, vImg: NaN, blur: Infinity, sharp: 0 };
  const vImg = (uCm * F_CM) / (uCm - F_CM);
  const blur = (APERTURE_CM * Math.abs(vScreen - vImg)) / vImg;
  return { virt: false, vImg, blur, sharp: clamp(1 - blur / 0.9, 0, 1) };
}

export default function LensBenchLab() {
  // ---- simulation state (refs — the canvas loop owns the motion) ----------
  const sim = useRef({
    uDisplay: 45,
    vDisplay: 40,
    dragObj: false,
    dragScreen: false,
    pulse: 0,
    t: 0,
    uiAcc: 0,
    slideAt: 0,
    wasSharp: false,
    virtTimer: 0,
    virtNoted: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls -----------------------------------------------------
  const [u, setU] = useState(45);
  const [screenV, setScreenV] = useState(40);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [aimed30, setAimed30] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ u: 45, v: 40, blur: 0, virt: false, sharp: 0 });

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
    const o = optics(s.uDisplay, s.vDisplay);
    setUi({ u: s.uDisplay, v: s.vDisplay, blur: o.virt ? Infinity : o.blur, virt: o.virt, sharp: o.sharp });
  }, []);

  // ---- analysis (declared before mentor flags that read it) ----------------
  const fit = useMemo(
    () => (rows.length >= 2 ? linearFit(rows.map((r) => ({ x: 1 / r.u, y: 1 / r.v }))) : null),
    [rows],
  );
  const fEst = fit && fit.b > 1e-4 ? 1 / fit.b : null;

  // ---- mentor completion flags ----------------------------------------------
  const distinctU = new Set(rows.map((r) => Math.abs(r.u).toFixed(1))).size;
  const done = [
    aimed30,
    badges.includes('first-focus'),
    rows.length >= 1,
    distinctU >= TARGET_ROWS,
    sawGraph && fEst !== null,
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
    if (Math.abs(u - 30) <= 1) setAimed30(true);
  }, [u]);

  // ---- nudge ------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    if (u < F_CM && mentorIndex >= 1) {
      return { target: 'object', gesture: 'drag', title: 'No real image in here', body: 'Inside the focal length the refracted rays only spread — a screen can never catch a virtual image. Slide the object back beyond the F tick and the real image returns.' };
    }
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'object': return { target: 'scene', gesture: 'drag', title: 'Move the object', body: 'Grab the orange arrow and drag it along the track until the ruler reads u = 30 cm.' };
      case 'screen': return { target: 'screen', gesture: 'drag', title: 'Hunt the focus', body: 'Slide the screen — drag the white card on the bench or use the screen slider — until the blur circle tightens into a crisp inverted arrow.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the pair', body: 'The image is sharp — press “Record” to bank u and v in your observation table.' };
      case 'sweep': return { target: 'object', gesture: 'drag', title: 'New object position', body: 'Move the object to a fresh position between 12 and 50 cm, refocus the screen and record again.' };
      case 'graph': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your 1/v versus 1/u graph lives in the Observations tab — the intercept hands you the focal length.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex, u]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry -----------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 860;
    const h = canvas?.clientHeight ?? 480;
    const pcm = Math.max(2.2, (w - 36) / 119);
    const lensX = 24 + 53 * pcm;
    return { w, h, pcm, pcmV: pcm * EXAG, lensX, axisY: h * 0.44, benchY: h * 0.78 };
  }, []);

  // ---- physics + animation ---------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.t += dt;
    s.uDisplay += (u - s.uDisplay) * Math.min(1, dt * 10);
    if (Math.abs(u - s.uDisplay) < 0.01) s.uDisplay = u;
    s.vDisplay += (screenV - s.vDisplay) * Math.min(1, dt * 10);
    if (Math.abs(screenV - s.vDisplay) < 0.01) s.vDisplay = screenV;

    const o = optics(s.uDisplay, s.vDisplay);
    if (!o.virt && o.blur <= PING_BLUR) {
      if (!s.wasSharp) {
        s.wasSharp = true;
        labSound.ping(880, 0.09);
        earn('first-focus');
      }
    } else if (o.virt || o.blur > 0.5) {
      s.wasSharp = false;
    }

    if (s.uDisplay < F_CM) {
      s.virtTimer += dt;
      if (s.virtTimer > 2 && !s.virtNoted) {
        s.virtNoted = true;
        earn('blur-detective');
      }
    } else {
      s.virtTimer = 0;
    }

    // light pulse travelling the chief ray (tip → lens centre → screen)
    s.pulse += dt * 0.55;
    if (s.pulse > 1) s.pulse -= 1;

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [u, screenV, earn, syncUi]);

  // ---- drawing ----------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const uD = s.uDisplay;
    const vD = s.vDisplay;
    const G = geom();
    const X = (cm: number) => G.lensX + cm * G.pcm;
    const Y = (cm: number) => G.axisY - cm * G.pcmV;
    const o = optics(uD, vD);

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench rail + ruler
    ctx.fillStyle = '#e3e9f0';
    roundRect(ctx, 14, G.benchY, w - 28, 16, 6);
    ctx.fill();
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 14, G.benchY, w - 28, 16, 6);
    ctx.stroke();
    ctx.fillStyle = '#8a96a4';
    ctx.font = '8.5px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    const stepLbl = G.pcm < 3 ? 20 : 10;
    for (let cm = -50; cm <= 60; cm += 5) {
      const x = X(cm);
      if (x < 22 || x > w - 22) continue;
      const major = cm % 10 === 0;
      ctx.strokeStyle = major ? '#a6b1bc' : '#c4cdd6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, G.benchY);
      ctx.lineTo(x, G.benchY - (major ? 7 : 4));
      ctx.stroke();
      if (cm % stepLbl === 0 && cm !== 0) ctx.fillText(`${cm}`, x, G.benchY + 11);
    }
    ctx.strokeStyle = '#e8632a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(G.lensX, G.benchY);
    ctx.lineTo(G.lensX, G.benchY - 10);
    ctx.stroke();

    // optical axis
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = '#b6c1cc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, G.axisY);
    ctx.lineTo(w - 18, G.axisY);
    ctx.stroke();
    ctx.setLineDash([]);

    // focal ticks
    for (const fx of [X(-F_CM), X(F_CM)]) {
      ctx.fillStyle = '#e8632a';
      ctx.beginPath();
      ctx.arc(fx, G.axisY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('F', fx, G.axisY - 9);
    }

    // lens
    const lensH = APERTURE_CM * G.pcmV;
    const bulge = Math.max(5, lensH * 0.15);
    const lensGrad = ctx.createLinearGradient(G.lensX - bulge, 0, G.lensX + bulge, 0);
    lensGrad.addColorStop(0, 'rgba(141,168,185,0.45)');
    lensGrad.addColorStop(0.5, 'rgba(170,196,212,0.28)');
    lensGrad.addColorStop(1, 'rgba(141,168,185,0.45)');
    ctx.fillStyle = lensGrad;
    ctx.beginPath();
    ctx.moveTo(G.lensX, G.axisY - lensH / 2);
    ctx.quadraticCurveTo(G.lensX + bulge, G.axisY, G.lensX, G.axisY + lensH / 2);
    ctx.quadraticCurveTo(G.lensX - bulge, G.axisY, G.lensX, G.axisY - lensH / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // shimmering highlight keeps the scene alive at idle
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(G.lensX + Math.sin(s.t * 0.9) * bulge * 0.5, G.axisY - lensH * 0.28, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // lens stand
    ctx.strokeStyle = '#8b97a5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(G.lensX, G.axisY + lensH / 2);
    ctx.lineTo(G.lensX, G.benchY);
    ctx.stroke();
    ctx.fillStyle = '#5d6a79';
    roundRect(ctx, G.lensX - 14, G.benchY - 3, 28, 6, 3);
    ctx.fill();

    // ---- principal rays, constructed in centimetres then mapped ----------
    const H = OBJ_H_CM;
    const tip = { x: X(-uD), y: Y(H) };
    const slopeA = -H / F_CM; // parallel ray: through the far focus
    const slopeB = -H / uD; // chief ray: through the lens centre
    const yLC = (-H * F_CM) / (uD - F_CM); // focal ray emerges parallel at this height
    const vCart = (uD * F_CM) / (uD - F_CM); // image position (negative when virtual)

    ctx.strokeStyle = 'rgba(232,99,42,0.62)';
    ctx.lineWidth = 1.8;
    // Ray A — parallel to the axis, then through F′
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(X(0), Y(H)); ctx.lineTo(X(vD), Y(H + slopeA * vD)); ctx.stroke();
    chevron(ctx, tip.x, tip.y, X(0), Y(H), 0.55);
    chevron(ctx, X(0), Y(H), X(vD), Y(H + slopeA * vD), 0.5);
    // Ray B — straight through the centre
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(X(0), Y(0)); ctx.lineTo(X(vD), Y(slopeB * vD)); ctx.stroke();
    chevron(ctx, tip.x, tip.y, X(0), Y(0), 0.5);
    // Ray C — through the near focus, emerges parallel to the axis
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(X(0), Y(yLC)); ctx.lineTo(X(vD), Y(yLC)); ctx.stroke();

    // ---- virtual image case -----------------------------------------------
    if (o.virt) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(232,99,42,0.38)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(X(0), Y(H)); ctx.lineTo(X(vCart), Y(H + slopeA * vCart)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(vCart), Y(slopeB * vCart)); ctx.stroke();
      ctx.setLineDash([]);
      // ghost arrow: upright, magnified, on the object's side
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(249,115,22,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(vCart), G.axisY); ctx.lineTo(X(vCart), Y(yLC)); ctx.stroke();
      ctx.fillStyle = 'rgba(249,115,22,0.12)';
      arrowHead(ctx, X(vCart), Y(yLC), -1);
      ctx.fill();
      ctx.setLineDash([]);
    }

    // ---- object arrow ---------------------------------------------------------
    const objX = X(-uD);
    ctx.strokeStyle = '#8b97a5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(objX, G.axisY);
    ctx.lineTo(objX, G.benchY);
    ctx.stroke();
    ctx.fillStyle = s.dragObj ? '#e8632a' : '#5d6a79';
    roundRect(ctx, objX - 13, G.benchY - 3, 26, 6, 3);
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#c2560f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(objX, G.axisY);
    ctx.lineTo(objX, Y(H) + 9);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#f97316';
    arrowHead(ctx, objX, Y(H), -1);
    ctx.fill();
    ctx.strokeStyle = '#c2560f';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // ---- screen ---------------------------------------------------------------
    const scrX = X(vD);
    const cardH = clamp(OBJ_H_CM * G.pcmV * 3.4, 84, 150);
    const cardTop = G.axisY - cardH * 0.4;
    ctx.fillStyle = 'rgba(40,55,75,0.10)';
    roundRect(ctx, scrX - 6, cardTop + 4, 14, cardH, 4);
    ctx.fill();
    ctx.fillStyle = '#fdfefe';
    roundRect(ctx, scrX - 7, cardTop, 14, cardH, 4);
    ctx.fill();
    ctx.strokeStyle = s.dragScreen ? '#e8632a' : '#c9d2db';
    ctx.lineWidth = s.dragScreen ? 2 : 1.5;
    roundRect(ctx, scrX - 7, cardTop, 14, cardH, 4);
    ctx.stroke();
    ctx.fillStyle = '#aeb9c4';
    roundRect(ctx, scrX - 9, cardTop - 3, 18, 5, 2);
    ctx.fill();
    ctx.strokeStyle = '#8b97a5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(scrX, cardTop + cardH);
    ctx.lineTo(scrX, G.benchY);
    ctx.stroke();
    ctx.fillStyle = s.dragScreen ? '#e8632a' : '#5d6a79';
    roundRect(ctx, scrX - 13, G.benchY - 3, 26, 6, 3);
    ctx.fill();

    // ---- image on the screen ---------------------------------------------------
    ctx.save();
    roundRect(ctx, scrX - 7, cardTop, 14, cardH, 4);
    ctx.clip();
    if (!o.virt) {
      const hImgCm = (-H * vD) / uD; // image-tip height at the screen (chief ray)
      const yTipImg = Y(hImgCm);
      const blurPx = clamp(o.blur * G.pcm * 2.6, 0, 26);
      if (o.blur > 0.05) {
        const haloR = Math.max(3, (o.blur / 2) * G.pcmV) + 5;
        const hg = ctx.createRadialGradient(scrX, yTipImg, 1, scrX, yTipImg, haloR);
        hg.addColorStop(0, `rgba(249,115,22,${(clamp(o.blur / 0.9, 0, 1) * 0.4).toFixed(3)})`);
        hg.addColorStop(1, 'rgba(249,115,22,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(scrX, yTipImg, haloR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.shadowColor = 'rgba(249,115,22,0.85)';
      ctx.shadowBlur = blurPx;
      ctx.lineCap = 'round';
      ctx.strokeStyle = o.blur <= SHARP_BLUR ? '#f97316' : '#f9a46a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(scrX, G.axisY);
      ctx.lineTo(scrX, yTipImg + (yTipImg > G.axisY ? 8 : -8));
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = o.blur <= SHARP_BLUR ? '#f97316' : '#f9a46a';
      arrowHead(ctx, scrX, yTipImg, yTipImg > G.axisY ? 1 : -1);
      ctx.fill();
      ctx.restore();
    } else {
      const gg = ctx.createRadialGradient(scrX, G.axisY, 2, scrX, G.axisY, 30);
      gg.addColorStop(0, 'rgba(249,115,22,0.30)');
      gg.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(scrX, G.axisY, 30, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // focus indicator dot on the card
    const sharp01 = o.virt ? 0 : o.sharp;
    ctx.fillStyle = `rgb(${Math.round(200 - sharp01 * 160)},${Math.round(90 + sharp01 * 100)},${Math.round(70 + sharp01 * 60)})`;
    ctx.beginPath();
    ctx.arc(scrX, cardTop - 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (sharp01 > 0.85) {
      ctx.strokeStyle = 'rgba(46,184,114,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(scrX, cardTop - 12, 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    // travelling light pulse along the chief ray
    const p2 = { x: X(vD), y: Y(slopeB * vD) };
    const l1 = Math.hypot(X(0) - tip.x, Y(0) - tip.y);
    const l2 = Math.hypot(p2.x - X(0), p2.y - Y(0));
    const total = l1 + l2;
    const dPulse = s.pulse * total;
    let px = tip.x;
    let py = tip.y;
    if (dPulse < l1) {
      const f = l1 > 0 ? dPulse / l1 : 0;
      px = tip.x + (X(0) - tip.x) * f;
      py = tip.y + (Y(0) - tip.y) * f;
    } else {
      const f = l2 > 0 ? (dPulse - l1) / l2 : 0;
      px = X(0) + (p2.x - X(0)) * f;
      py = Y(0) + (p2.y - Y(0)) * f;
    }
    ctx.save();
    ctx.shadowColor = '#ffb066';
    ctx.shadowBlur = 9;
    ctx.fillStyle = '#ffe3c2';
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // drag affordance guide
    if (s.dragObj || s.dragScreen) {
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(232,99,42,0.35)';
      ctx.lineWidth = 1;
      const ax = s.dragObj ? objX : scrX;
      ctx.beginPath();
      ctx.moveTo(ax, 18);
      ctx.lineTo(ax, G.benchY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction --------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const G = geom();
    const objX = G.lensX - u * G.pcm;
    const tipY = G.axisY - OBJ_H_CM * G.pcmV;
    const scrX = G.lensX + screenV * G.pcm;
    const cardH = clamp(OBJ_H_CM * G.pcmV * 3.4, 84, 150);
    const cardTop = G.axisY - cardH * 0.4;
    const hitObj = px > objX - 18 && px < objX + 18 && py > tipY - 14 && py < G.benchY;
    const hitScr = px > scrX - 16 && px < scrX + 16 && py > cardTop - 10 && py < G.benchY;
    if (hitObj) {
      sim.current.dragObj = true;
      labSound.slide(0.3);
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    } else if (hitScr) {
      sim.current.dragScreen = true;
      labSound.slide(0.3);
      notePointer(true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    } else {
      notePointer(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.dragObj && !s.dragScreen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const G = geom();
    const nowT = performance.now();
    if (s.dragObj) {
      const v = clamp(Math.round(((G.lensX - px) / G.pcm) * 2) / 2, U_MIN, U_MAX);
      if (v !== u) {
        setU(v);
        if (nowT - s.slideAt > 90) {
          s.slideAt = nowT;
          labSound.slide(0.3);
        }
      }
    } else {
      const v = clamp(Math.round(((px - G.lensX) / G.pcm) * 10) / 10, V_MIN, V_MAX);
      if (v !== screenV) {
        setScreenV(v);
        if (nowT - s.slideAt > 90) {
          s.slideAt = nowT;
          labSound.slide(0.3);
        }
      }
    }
    syncUi();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.dragObj && !s.dragScreen) return;
    s.dragObj = false;
    s.dragScreen = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    syncUi();
  };

  // ---- controls ---------------------------------------------------------------------
  const changeU = (v: number) => {
    setU(v);
    labSound.slide(0.4);
    notePointer(true);
    syncUi();
  };

  const changeV = (v: number) => {
    setScreenV(v);
    labSound.slide(0.3);
    notePointer(true);
    syncUi();
  };

  const recordPair = () => {
    const uSigned = -Math.round(u * 2) / 2;
    const vRec = Math.round(screenV * 10) / 10;
    const row: TrialRow = { id: rows.length + 1, u: uSigned, v: vRec };
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded: u = ${uSigned.toFixed(1)} cm, v = ${vRec.toFixed(1)} cm`);
    if (new Set([...rows.map((r) => Math.abs(r.u).toFixed(1)), Math.abs(uSigned).toFixed(1)]).size >= TARGET_ROWS) earn('five-positions');
  };

  const resetAll = () => {
    const s = sim.current;
    s.uDisplay = 45;
    s.vDisplay = 40;
    s.dragObj = false;
    s.dragScreen = false;
    s.wasSharp = false;
    s.virtNoted = false;
    s.virtTimer = 0;
    setU(45);
    setScreenV(40);
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setAimed30(false);
    setSawGraph(false);
    setBadges([]);
    syncUi();
  };

  // ---- badges from the fit ---------------------------------------------------------------
  useEffect(() => {
    if (fEst && !badges.includes('focal-master') && Math.abs(fEst - F_CM) / F_CM <= 0.02) {
      labSound.milestone();
      earn('focal-master');
      pushToast('good', '🎯', `Intercept = 1/f → f = ${fEst.toFixed(2)} cm — within 2% of the lens on the bench.`);
    }
  }, [fEst, badges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- coach --------------------------------------------------------------------------------
  const oNow = optics(u, screenV);
  const sharpGate = !oNow.virt && oNow.blur <= SHARP_BLUR;
  const mScreen = screenV / u;

  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (oNow.virt) {
      return { tone: 'warn', line: 'Inside the focal length the refracted rays only spread — trace them backwards and they meet at a virtual image: upright, magnified, on the object\u2019s own side. That is a magnifying glass, and no screen can ever catch it. Slide the object back beyond F.' };
    }
    if (oNow.vImg > V_MAX + 1) {
      return { tone: 'info', line: 'So close to F that the real image has run off the end of the bench — nudge the object a little further from the lens and the image comes back to a reachable distance.' };
    }
    if (sharpGate) {
      return { tone: 'good', line: `Razor sharp — v = ${screenV.toFixed(1)} cm and the magnification v/u ≈ ${mScreen.toFixed(2)}×, inverted. Record the pair, then move the object somewhere new.` };
    }
    if (rows.length === 0 && !badges.includes('first-focus')) {
      return { tone: 'info', line: 'Ease the screen along the bench — the blur circle shrinks as you approach the image plane, and a soft ping tells you when you are spot on.' };
    }
    if (distinctU < TARGET_ROWS) {
      return { tone: 'info', line: 'Pair banked. Move the object to a fresh position between 12 and 50 cm, hunt the focus again and record — five spread-out pairs make the line honest.' };
    }
    if (!sawGraph) {
      return { tone: 'good', line: 'Five positions collected — open Observations: your 1/v versus 1/u line is waiting, slope 1 with the focal length hiding in the intercept.' };
    }
    if (fEst) {
      const err = ((fEst - F_CM) / F_CM) * 100;
      return { tone: Math.abs(err) <= 2 ? 'good' : 'warn', line: `Your f = ${fEst.toFixed(2)} cm — ${Math.abs(err).toFixed(1)}% ${err >= 0 ? 'above' : 'below'} the 10 cm lens. Careful focusing (the slider nudges ±0.1 cm) sharpens the intercept.` };
    }
    return { tone: 'info', line: 'Keep hunting — the mentor is watching your hands.' };
  }, [oNow, sharpGate, rows.length, badges, distinctU, sawGraph, fEst, screenV, mScreen]);

  // ---- status ----------------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : oNow.virt
      ? 'Virtual image territory'
      : sharpGate
        ? 'Image sharp — record it'
        : rows.length
          ? 'Pair recorded — next position'
          : 'Bench ready — set u = 30 cm';
  const pct = Math.round(ui.sharp * 100);
  const sameU = rows.some((r) => Math.abs(-r.u - u) < 0.4);
  const canRecord = sharpGate && !sameU;

  // ---- render --------------------------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : oNow.virt ? 'warn' : sharpGate ? 'active' : 'ready'}
      captionChip="Student-controlled optical bench"
      legend={[
        { color: '#f97316', label: 'Object arrow & image' },
        { color: '#e8632a', label: 'Principal rays' },
        { color: '#8da8b9', label: 'Convex lens f = 10 cm' },
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
          aria-label="Optical bench — drag the object arrow and the white screen to find the sharp image"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const step = e.shiftKey ? 1 : 0.1;
              changeV(clamp(Math.round((screenV + (e.key === 'ArrowRight' ? step : -step)) * 10) / 10, V_MIN, V_MAX));
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const step = e.shiftKey ? 2 : 0.5;
              changeU(clamp(Math.round((u + (e.key === 'ArrowUp' ? step : -step)) * 2) / 2, U_MIN, U_MAX));
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
          <div className="lens-layout">
            <div className="lens-sliders">
              <div className="lab-slider-row" data-nudge="object">
                <label><span>Object distance u</span><strong>{u.toFixed(1)} cm</strong></label>
                <input type="range" min={U_MIN} max={U_MAX} step="0.5" value={u}
                  aria-label="Object distance from the lens in centimetres"
                  onChange={(e) => changeU(Number(e.target.value))} />
              </div>
              <div className="lab-slider-row" data-nudge="screen">
                <label><span>Screen position v</span><strong>{screenV.toFixed(1)} cm</strong></label>
                <input type="range" min={V_MIN} max={V_MAX} step="0.1" value={screenV}
                  aria-label="Screen distance from the lens in centimetres — fine focus control"
                  onChange={(e) => changeV(Number(e.target.value))} />
              </div>
            </div>
            <div className="focus-chip">
              <span>Image sharpness</span>
              <strong className={sharpGate ? 'sharp' : ''}>{ui.virt ? '—' : `${pct}%`}</strong>
              <div className="focus-track"><span style={{ width: `${pct}%` }} /></div>
              <small>{ui.virt ? 'no real image — virtual case' : ui.blur < 9 ? `blur circle ${ui.blur.toFixed(2)} cm` : 'far out of focus'}</small>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Record u and v with the Cartesian sign convention (u negative). Fine-focus with the screen slider or the canvas arrow keys — ±0.1 cm. Inside F no screen can focus: try it once.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordPair(); notePointer(true); }}
            disabled={!canRecord}
          >
            {oNow.virt
              ? 'No real image inside F — move the object beyond the focal tick'
              : sameU
                ? 'Move the object to a new position first'
                : canRecord
                  ? `✎ Record — u = ${(-u).toFixed(1)} cm, v = ${screenV.toFixed(1)} cm`
                  : `Focus the image to unlock recording (${pct}% sharp)`}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Image sharpness (live)</span>
            <strong>{ui.virt ? '—' : <>{pct}<small>%</small></>}</strong>
            <div className="reading-track"><span style={{ width: `${pct}%` }} /></div>
            <div className="reading-scale"><span>blurry</span><span>sharp</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Object distance u</span><strong>{u.toFixed(1)} cm</strong></div>
            <div><span>Screen position v</span><strong>{screenV.toFixed(1)} cm</strong></div>
            <div><span>Blur circle</span><strong>{ui.virt || ui.blur >= 9 ? '—' : `${ui.blur.toFixed(2)} cm`}</strong></div>
            <div><span>Magnification v/u</span><strong>{ui.virt ? '—' : `${mScreen.toFixed(2)}×`}</strong></div>
            <div><span>Image height</span><strong>{ui.virt ? '—' : `${(-OBJ_H_CM * mScreen).toFixed(2)} cm`}</strong></div>
            <div><span>Lens aperture</span><strong>{APERTURE_CM}.0 cm</strong></div>
          </div>
          <div className="lens-f-readout">
            <span>Measured focal length</span>
            <strong>{fEst ? <>{fEst.toFixed(2)} <small>cm</small></> : <small style={{ fontSize: 13 }}>record 2+ pairs to fit f</small>}</strong>
            {fit && fEst && <p>From the 1/v–1/u fit: slope {fit.m.toFixed(3)} (theory 1) · intercept = 1/f · R² = {fit.r2.toFixed(4)} over {rows.length} pair{rows.length > 1 ? 's' : ''} · lens is 10 cm · error {((Math.abs(fEst - F_CM) / F_CM) * 100).toFixed(1)}%</p>}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the orange object along the track to u = 30 cm — the ruler counts from the lens.</li>
              <li>Drag the white screen until the blur circle tightens into a crisp inverted arrow; a soft ping marks perfect focus.</li>
              <li>Record the pair — the table computes 1/u (negative, by the sign convention) and 1/v.</li>
              <li>Repeat at four more object positions between 12 and 50 cm, focusing each time.</li>
              <li>Open Observations and read f off the intercept of the 1/v–1/u line.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>The screen slider and the canvas arrow keys nudge the screen by ±0.1 cm — that is your fine-focus knob. And once you have your five pairs, slide the object inside F: the rays refuse to meet, and the coach will explain the magnifying glass.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            <p className="observation-note">Cartesian sign convention: the object sits on the incoming side, so u is recorded negative; the real image on the far side makes v positive.</p>
            {rows.length === 0 ? (
              <p className="observation-note">Focus an image and record your first pair. Five distinct object positions unlock the graph.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>u (cm)</th><th>v (cm)</th><th>1/u (cm⁻¹)</th><th>1/v (cm⁻¹)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}><td>{r.id}</td><td>{r.u.toFixed(1)}</td><td>{r.v.toFixed(1)}</td><td>{(1 / r.u).toFixed(4)}</td><td>{(1 / r.v).toFixed(4)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>1/v – 1/u analysis</h3>
                <Plot
                  points={rows.map((r) => ({ x: 1 / r.u, y: 1 / r.v }))}
                  xLabel="1/u (cm⁻¹)"
                  yLabel="1/v (cm⁻¹)"
                  fitLine
                  livePoint={{ x: 1 / -u, y: 1 / screenV }}
                  height={220}
                />
                {fEst && <p className="observation-note">Slope = {fit?.m.toFixed(3)} (theory: 1) · intercept = {fit?.b.toFixed(4)} cm⁻¹ → f = 1/intercept = <strong>{fEst.toFixed(2)} cm</strong> ({((Math.abs(fEst - F_CM) / F_CM) * 100).toFixed(1)}% from the 10 cm lens).</p>}
              </>
            )}
            <p className="observation-note">Each point is one focused pair of your own placing. The lens law promises a line of slope 1 — the intercept, not the slope, is where the focal length hides.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>A convex lens bends every ray from the object\u2019s tip so that the rays re-combine at a single new point — the image tip. Wherever the screen sits, the cone of light either has not yet converged (still blurry) or has crossed and spread again (blurry the other way). Only exactly at the image plane does every point of the arrow land in its own place, which is what "sharp" means.</p>
            <div className="equation">1/v − 1/u = 1/f</div>
            <p><strong>The convention matters.</strong>We use the Cartesian sign convention: distances are measured from the lens, positive in the direction light travels. The object is on the incoming side, so u is negative (−30 cm, not 30 cm); a real image on the far side has positive v. Rearranged, 1/v = 1/u + 1/f — which is why the lab plots 1/v against 1/u and expects a straight line of slope 1 whose intercept on the 1/v axis is exactly 1/f.</p>
            <p>The magnification is m = v/u with the same signs — negative means a real, inverted image. At u = 30 cm with f = 10 cm the lens gives v = 15 cm and m = −0.5: a half-size inverted arrow, exactly what the screen shows. The blur circle on the screen grows as the aperture times the fractional miss, b = A·|v_screen − v|/v, so a wide lens punishes sloppy focusing — and rewards careful placement.</p>
            <p>Push the object inside the focal length and no positive v satisfies the equation: the refracted rays diverge, and their backward extensions meet at a virtual image that is upright and magnified. The screen can never catch it — that is the magnifying glass, drawn honestly with dashed lines on your bench.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && distinctU >= TARGET_ROWS) setSawGraph(true); }}
    />
  );
}

// ---- drawing helpers ----------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Arrowhead triangle pointing up (dir −1) or down (dir +1). */
function arrowHead(ctx: CanvasRenderingContext2D, x: number, yTip: number, dir: number) {
  ctx.beginPath();
  ctx.moveTo(x, yTip);
  ctx.lineTo(x - 5.5, yTip - dir * 9);
  ctx.lineTo(x + 5.5, yTip - dir * 9);
  ctx.closePath();
}

/** Chevron at fraction f along a segment, pointing along travel. */
function chevron(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, f: number) {
  const mx = x1 + (x2 - x1) * f;
  const my = y1 + (y2 - y1) * f;
  const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  ctx.fillStyle = 'rgba(232,99,42,0.55)';
  ctx.beginPath();
  ctx.moveTo(mx + ux * 4.5, my + uy * 4.5);
  ctx.lineTo(mx - uy * 3.5, my + ux * 3.5);
  ctx.lineTo(mx + uy * 3.5, my - ux * 3.5);
  ctx.closePath();
  ctx.fill();
}
