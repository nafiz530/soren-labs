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
import './resonance-tube.css';

/**
 * Resonance tube — measuring the speed of sound with a water column.
 *
 * A vertical tube above a water reservoir forms a closed air column whose
 * length L (5–100 cm) the student sets by dragging the reservoir or sliding
 * the level control. Striking a tuning fork (512 / 440 / 341 Hz) holds it
 * over the tube mouth; a VU-style loudness meter responds with Gaussian
 * peaks at L = λ/4 and L = 3λ/4 (v = 343 m/s). The student sweeps, finds the
 * peaks, marks them, and the table computes λ = 4L (or 4L/3) and v = f·λ.
 */

const V_AIR = 343; // speed of sound in air at 20 °C, m/s
const SIGMA = 1.1; // resonance peak width, cm
const L_MIN = 5;
const L_MAX = 100;

const FORKS: { id: string; freq: number }[] = [
  { id: '512', freq: 512 },
  { id: '440', freq: 440 },
  { id: '341', freq: 341 },
];

/** First resonance length L₁ = v/(4f), in cm. */
const res1 = (f: number) => (100 * V_AIR) / (4 * f);
/** Second resonance length L₂ = 3v/(4f), in cm. */
const res2 = (f: number) => 3 * res1(f);
const gauss = (x: number, mu: number) => Math.exp(-(((x - mu) / SIGMA) ** 2));
/** Gaussian loudness model: near-dead silence off resonance, sharp peaks on it. */
const loudnessAt = (L: number, f: number) => Math.min(1, gauss(L, res1(f)) + 0.85 * gauss(L, res2(f)));

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'strike', title: 'Strike the 512 Hz fork', detail: 'Press “Strike the fork” — it rings at 512 Hz and is held over the tube mouth.', hint: 'The ping you hear is the fork’s true frequency; the tube answers only at resonance.' },
  { id: 'sweep', title: 'Sweep the water level', detail: 'Drag the reservoir (or slide the level control) slowly and watch the loudness meter as the air column changes length.', hint: 'Slow sweeps find sharper peaks — the meter’s peak-hold bar remembers the loudest point you passed.' },
  { id: 'first', title: 'Find and mark the first peak', detail: 'The first resonance sits near a quarter wavelength: L = λ/4. Creep to the loudest point and mark it.', hint: 'The first peak hides in the lower half of the tube’s travel.' },
  { id: 'second', title: 'Continue to the second peak', detail: 'Keep sweeping upward. A second peak appears at three times the first length: L = 3λ/4. Mark it too.', hint: 'Two peaks from one fork is a built-in cross-check on your wavelength.' },
  { id: 'read', title: 'Read v from the table', detail: 'Each mark computes λ and v = f·λ. Open Observations and see how close your v lands to 343 m/s.', hint: 'Marking the exact top of the peak is what buys the 2% badge.' },
  { id: 'again', title: 'Try the 440 Hz fork', detail: 'Swap to 440 Hz and repeat. The peaks move — but the speed of sound should not. Does your v agree?', hint: 'A second fork that agrees is the strongest evidence your method is sound.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-resonance', title: 'First Resonance', icon: '♪', detail: 'Marked a first-resonance peak on the loudness meter.' },
  { id: 'both-peaks', title: 'Both Peaks', icon: '⇅', detail: 'Marked the first and the second resonance of the air column.' },
  { id: 'sound-speed', title: 'Sound Speed', icon: '⚡', detail: 'Computed the speed of sound within 2% of 343 m/s.' },
  { id: 'tri-fork', title: 'Tri-Fork', icon: '♬', detail: 'Rang all three tuning forks over the tube.' },
];

interface MarkRow { id: number; forkId: string; freq: number; order: 1 | 2; L: number; lambdaCm: number; v: number }

interface UiSnap { loud: number; held: boolean; sweptRange: number; marksCount: number }

const meta = getLabBySlug('resonance-tube')!;

export default function ResonanceTubeLab() {
  // ---- simulation state (refs — the canvas loop owns the live meter) -------
  const sim = useRef({
    held: false,
    strikeAge: 0,
    loud: 0,
    vu: 0,
    peak: 0,
    wavePh: 0,
    dragging: false,
    marks: [] as { L: number; order: 1 | 2; forkId: string }[],
    sweptMin: 8,
    sweptMax: 8,
    idle: 0,
    uiAcc: 0,
    tickL: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSliderTick = useRef(0);

  // ---- student controls ----------------------------------------------------
  const [forkIdx, setForkIdx] = useState(0);
  const [L, setL] = useState(8);
  const [rows, setRows] = useState<MarkRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawObs, setSawObs] = useState(false);
  const [struck, setStruck] = useState<string[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ loud: 0, held: false, sweptRange: 0, marksCount: 0 });

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
    setUi({ loud: s.loud, held: s.held, sweptRange: s.sweptMax - s.sweptMin, marksCount: s.marks.length });
  }, []);

  // ---- mentor completion flags ---------------------------------------------
  const done = [
    struck.includes('512'),
    ui.sweptRange >= 22,
    rows.some((r) => r.order === 1),
    rows.some((r) => r.order === 2),
    sawObs && rows.length >= 2,
    new Set(rows.map((r) => r.forkId)).size >= 2,
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
    if (struck.length >= 3) earn('tri-fork');
  }, [struck, earn]);

  // ---- nudge -----------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'strike': return { target: 'strike', gesture: 'press', title: 'Strike the fork', body: 'Press “Strike the fork” — the 512 Hz fork rings and is held over the tube mouth.' };
      case 'sweep': return { target: 'level', gesture: 'drag', title: 'Sweep the level', body: 'Drag the reservoir up and down (or slide the level control) — watch the loudness meter react.' };
      case 'first': return { target: 'mark1', gesture: 'press', title: 'Mark the first peak', body: 'Creep to the loudest point and press “Mark first resonance” while the meter tops out.' };
      case 'second': return { target: 'mark2', gesture: 'press', title: 'Mark the second peak', body: 'Keep sweeping upward to the next peak near three times the first length, then mark it.' };
      case 'read': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your resonance table computes λ and v = f·λ for every mark — compare with 343 m/s.' };
      case 'again': return { target: 'fork', gesture: 'tap', title: 'Try the 440 Hz fork', body: 'Select the 440 Hz fork, strike it, and see whether your v agrees with the 512 Hz run.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ---------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const benchY = h - 24;
    const tubeW = clamp(w * 0.075, 44, 64);
    const tubeCx = clamp(w * 0.24, tubeW / 2 + 46, w * 0.4);
    const tubeTop = 46;
    const tubeBottom = benchY - 6;
    const pxPerCm = (tubeBottom - tubeTop) / 110;
    const jugW = clamp(w * 0.11, 54, 72);
    const jugX = clamp(tubeCx + tubeW / 2 + clamp(w * 0.17, 64, 110) + jugW / 2, tubeCx + tubeW + 46, w - jugW / 2 - 14);
    return { w, h, benchY, tubeW, tubeCx, tubeTop, tubeBottom, pxPerCm, jugW, jugX };
  }, []);

  // ---- loop step ------------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.idle += dt;
    const f = FORKS[forkIdx].freq;
    s.loud = s.held ? loudnessAt(L, f) : 0;
    s.vu += (s.loud - s.vu) * Math.min(1, dt * 12);
    s.peak = Math.max(s.peak - dt * 0.22, s.vu);
    if (s.held) s.wavePh += dt * (2.4 + s.loud * 9);
    s.strikeAge += dt;
    s.sweptMin = Math.min(s.sweptMin, L);
    s.sweptMax = Math.max(s.sweptMax, L);
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [forkIdx, L, syncUi]);

  // ---- drawing ---------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const f = FORKS[forkIdx].freq;
    const g1 = gauss(L, res1(f));
    const g2 = gauss(L, res2(f));
    const waterY = g.tubeTop + L * g.pxPerCm;
    const tubeL = g.tubeCx - g.tubeW / 2;
    const tubeR = g.tubeCx + g.tubeW / 2;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, g.benchY);
    ctx.lineTo(w, g.benchY);
    ctx.stroke();
    ctx.strokeStyle = '#dde4ea';
    ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, g.benchY);
      ctx.lineTo(x - 10, g.benchY + 10);
      ctx.stroke();
    }

    // ---- ruler along the tube (reads the air-column length L from the mouth) ----
    const rulerX = tubeL - 16;
    ctx.strokeStyle = '#b6c1cc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rulerX, g.tubeTop);
    ctx.lineTo(rulerX, g.tubeBottom);
    ctx.stroke();
    ctx.font = '9px "DM Sans", sans-serif';
    ctx.fillStyle = '#8a96a4';
    ctx.textAlign = 'right';
    for (let cm = 0; cm <= 110; cm += 5) {
      const y = g.tubeTop + cm * g.pxPerCm;
      const long = cm % 20 === 0;
      ctx.strokeStyle = long ? '#98a4b0' : '#c0cad3';
      ctx.beginPath();
      ctx.moveTo(rulerX, y);
      ctx.lineTo(rulerX - (long ? 11 : cm % 10 === 0 ? 7 : 4), y);
      ctx.stroke();
      if (long && cm > 0) ctx.fillText(`${cm}`, rulerX - 13, y + 3);
    }
    // live L marker on the ruler
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(rulerX + 3, waterY);
    ctx.lineTo(rulerX - 5, waterY - 5);
    ctx.lineTo(rulerX - 5, waterY + 5);
    ctx.closePath();
    ctx.fill();

    // ---- tube (glass) ----
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    roundRect(ctx, tubeL, g.tubeTop, g.tubeW, g.tubeBottom - g.tubeTop, 6);
    ctx.fill();
    // water inside the tube
    const wgrad = ctx.createLinearGradient(0, waterY, 0, g.tubeBottom);
    wgrad.addColorStop(0, '#bcd9ec');
    wgrad.addColorStop(1, '#8fbcd8');
    ctx.fillStyle = wgrad;
    ctx.fillRect(tubeL + 2, waterY, g.tubeW - 4, g.tubeBottom - waterY - 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const wob = Math.sin(s.idle * 2.4) * 0.8;
    ctx.moveTo(tubeL + 2, waterY + wob);
    ctx.lineTo(tubeR - 2, waterY - wob);
    ctx.stroke();
    // glass walls
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tubeL, g.tubeTop - 4);
    ctx.lineTo(tubeL, g.tubeBottom - 5);
    ctx.quadraticCurveTo(tubeL, g.tubeBottom, tubeL + 6, g.tubeBottom);
    ctx.lineTo(tubeR - 6, g.tubeBottom);
    ctx.quadraticCurveTo(tubeR, g.tubeBottom, tubeR, g.tubeBottom - 5);
    ctx.lineTo(tubeR, g.tubeTop - 4);
    ctx.stroke();
    // mouth lip
    ctx.strokeStyle = '#a9bfc9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tubeL - 4, g.tubeTop - 7);
    ctx.lineTo(tubeL + 2, g.tubeTop - 1);
    ctx.moveTo(tubeR + 4, g.tubeTop - 7);
    ctx.lineTo(tubeR - 2, g.tubeTop - 1);
    ctx.stroke();

    // ---- standing wave in the air column (amplitude ∝ loudness) ----
    const mode = g1 >= g2 ? 1 : 2;
    const amp = s.held ? Math.max(g1, g2) : 0;
    if (amp > 0.02 && waterY - g.tubeTop > 12) {
      const colH = waterY - g.tubeTop;
      const shape = (sn: number) => Math.sin((mode === 1 ? 1 : 3) * Math.PI * sn / 2);
      const ampPx = amp * g.tubeW * 0.34;
      const vib = Math.sin(s.wavePh);
      // dashed envelope
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = `rgba(249,115,22,${0.28 * amp})`;
      ctx.lineWidth = 1.25;
      for (const sign of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const sn = i / 24;
          const y = waterY - sn * colH;
          const x = g.tubeCx + sign * shape(sn) * ampPx;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // live oscillation
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const sn = i / 24;
        const y = waterY - sn * colH;
        const x = g.tubeCx + shape(sn) * ampPx * vib;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let i = 24; i >= 0; i--) {
        const sn = i / 24;
        const y = waterY - sn * colH;
        const x = g.tubeCx - shape(sn) * ampPx * vib;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(249,115,22,${0.16 * amp})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(232,99,42,${0.7 * amp})`;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      // node dots (surface node always; interior node for the 3λ/4 mode)
      ctx.fillStyle = `rgba(23,35,52,${clamp(amp, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(g.tubeCx, waterY - 3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (mode === 2) {
        ctx.beginPath();
        ctx.arc(g.tubeCx, waterY - (2 / 3) * colH, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- resonance marks stamped on the tube ----
    for (const m of s.marks) {
      const y = g.tubeTop + m.L * g.pxPerCm;
      const x = tubeR + 5;
      ctx.fillStyle = m.order === 1 ? '#f97316' : '#2f7fb8';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 7, y - 4.5);
      ctx.lineTo(x + 7, y + 4.5);
      ctx.closePath();
      ctx.fill();
    }

    // ---- hose + reservoir jug ----
    const jugTop = waterY - 30;
    const jugBottom = waterY + 62;
    ctx.strokeStyle = '#9db4c2';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(g.tubeCx, g.tubeBottom - 2);
    ctx.quadraticCurveTo(g.tubeCx + 8, g.benchY + 2, (g.tubeCx + g.jugX) / 2, g.benchY + 2);
    ctx.quadraticCurveTo(g.jugX - 6, g.benchY + 2, g.jugX, jugBottom - 2);
    ctx.stroke();
    ctx.strokeStyle = '#a9cfe8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(g.tubeCx, g.tubeBottom - 2);
    ctx.quadraticCurveTo(g.tubeCx + 8, g.benchY + 2, (g.tubeCx + g.jugX) / 2, g.benchY + 2);
    ctx.quadraticCurveTo(g.jugX - 6, g.benchY + 2, g.jugX, jugBottom - 2);
    ctx.stroke();

    // jug body
    if (s.dragging) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      roundRect(ctx, g.jugX - g.jugW / 2 - 8, jugTop - 8, g.jugW + 16, jugBottom - jugTop + 16, 10);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    roundRect(ctx, g.jugX - g.jugW / 2, jugTop, g.jugW, jugBottom - jugTop, 8);
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    roundRect(ctx, g.jugX - g.jugW / 2, jugTop, g.jugW, jugBottom - jugTop, 8);
    ctx.stroke();
    // jug water (level matches the tube — connected vessels)
    ctx.fillStyle = 'rgba(169,207,232,0.92)';
    roundRect(ctx, g.jugX - g.jugW / 2 + 3, waterY, g.jugW - 6, jugBottom - waterY - 4, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.jugX - g.jugW / 2 + 4, waterY - wob);
    ctx.lineTo(g.jugX + g.jugW / 2 - 4, waterY + wob);
    ctx.stroke();
    // handle
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.jugX + g.jugW / 2 + 7, waterY + 14, 9, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // drag affordance chevrons
    ctx.fillStyle = '#b6c1cc';
    for (const [cy, dir] of [[jugTop - 14, -1], [jugBottom + 14, 1]] as [number, number][]) {
      ctx.beginPath();
      ctx.moveTo(g.jugX, cy + dir * 4);
      ctx.lineTo(g.jugX - 5, cy - dir * 3);
      ctx.lineTo(g.jugX + 5, cy - dir * 3);
      ctx.closePath();
      ctx.fill();
    }

    // ---- tuning fork over the mouth ----
    if (s.held) {
      const fx = g.tubeCx;
      const fy = g.tubeTop - 40;
      const shake = Math.sin(s.idle * 34) * (0.5 + s.loud * 1.6);
      ctx.strokeStyle = '#8a94a0';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        // motion-blur ghost
        if (s.loud > 0.25) {
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.moveTo(fx + side * 7 + shake, fy + 10);
          ctx.lineTo(fx + side * 7 + shake * 1.6, fy - 15);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.moveTo(fx + side * 7, fy + 10);
        ctx.lineTo(fx + side * 7 + shake * 0.8, fy - 15);
        ctx.stroke();
      }
      // yoke + stem toward the mouth
      ctx.beginPath();
      ctx.moveTo(fx - 7, fy + 10);
      ctx.lineTo(fx + 7, fy + 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx, fy + 10);
      ctx.lineTo(fx, g.tubeTop - 10);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#5d6a79';
      ctx.beginPath();
      ctx.arc(fx, fy + 12, 5, 0, Math.PI * 2);
      ctx.fill();
      // strike ring
      if (s.strikeAge < 1.2) {
        const rr = s.strikeAge * 70;
        ctx.strokeStyle = `rgba(249,115,22,${(1.2 - s.strikeAge) / 1.2 * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fx, fy - 2, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ---- sound arcs rising from the mouth ----
    if (s.held && s.loud > 0.12) {
      for (let i = 0; i < 3; i++) {
        const r = (s.idle * 26 + i * 17) % 50;
        const a = s.loud * (1 - r / 50) * 0.55;
        ctx.strokeStyle = `rgba(232,99,42,${a})`;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.arc(g.tubeCx, g.tubeTop - 4, r + 6, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ---- VU loudness meter ----
    const meterW = Math.min(210, w * 0.42);
    const mx0 = w - 24 - meterW;
    const mx1 = w - 24;
    const my = 30;
    const mh = 14;
    ctx.fillStyle = '#f2f5f8';
    roundRect(ctx, mx0 - 6, my - 6, meterW + 12, mh + 12, 8);
    ctx.fill();
    ctx.strokeStyle = '#d3dae1';
    ctx.lineWidth = 1;
    roundRect(ctx, mx0 - 6, my - 6, meterW + 12, mh + 12, 8);
    ctx.stroke();
    const segs = 16;
    const segW = (mx1 - mx0 - (segs - 1) * 2) / segs;
    for (let i = 0; i < segs; i++) {
      const lit = (i + 0.5) / segs <= s.vu;
      let color = '#e6ebf1';
      if (lit) color = i < 11 ? '#34c759' : i < 14 ? '#f5b642' : '#e8443a';
      ctx.fillStyle = color;
      roundRect(ctx, mx0 + i * (segW + 2), my, segW, mh, 2);
      ctx.fill();
    }
    // peak-hold marker
    const peakX = mx0 + s.peak * (mx1 - mx0 - 2);
    ctx.fillStyle = 'rgba(23,35,52,0.72)';
    ctx.fillRect(peakX, my - 3, 2, mh + 6);
    ctx.beginPath();
    ctx.moveTo(peakX + 1, my - 7);
    ctx.lineTo(peakX - 3, my - 3);
    ctx.lineTo(peakX + 5, my - 3);
    ctx.closePath();
    ctx.fill();
    if (s.vu > 0.95) {
      ctx.strokeStyle = 'rgba(249,115,22,0.55)';
      ctx.lineWidth = 2;
      roundRect(ctx, mx0 - 6, my - 6, meterW + 12, mh + 12, 8);
      ctx.stroke();
    }
  }, [forkIdx, L, geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- interactions ---------------------------------------------------------------
  const strike = useCallback(() => {
    const s = sim.current;
    s.held = true;
    s.strikeAge = 0;
    labSound.ping(FORKS[forkIdx].freq, 0.16);
    setStruck((cur) => (cur.includes(FORKS[forkIdx].id) ? cur : [...cur, FORKS[forkIdx].id]));
    notePointer(true);
    syncUi();
  }, [forkIdx, notePointer, syncUi]);

  const selectFork = (i: number) => {
    if (i === forkIdx) {
      labSound.ping(FORKS[i].freq, 0.16);
      setStruck((cur) => (cur.includes(FORKS[i].id) ? cur : [...cur, FORKS[i].id]));
      if (!sim.current.held) {
        sim.current.held = true;
        sim.current.strikeAge = 0;
      }
    } else {
      setForkIdx(i);
      if (sim.current.held) {
        labSound.ping(FORKS[i].freq, 0.16);
        setStruck((cur) => (cur.includes(FORKS[i].id) ? cur : [...cur, FORKS[i].id]));
        sim.current.strikeAge = 0;
      } else {
        labSound.tick();
      }
    }
    notePointer(true);
  };

  const setLevel = (v: number, fromDrag: boolean) => {
    const nv = clamp(Math.round(v * 10) / 10, L_MIN, L_MAX);
    if (nv === L) return;
    setL(nv);
    const s = sim.current;
    if (fromDrag) {
      if (Math.abs(nv - s.tickL) > 0.4) {
        s.tickL = nv;
        labSound.tick();
      }
    } else {
      const nowT = performance.now();
      if (nowT - lastSliderTick.current > 140) {
        lastSliderTick.current = nowT;
        labSound.tick();
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    const waterY = g.tubeTop + L * g.pxPerCm;
    const jugTop = waterY - 30;
    const jugBottom = waterY + 62;
    if (px > g.jugX - g.jugW / 2 - 20 && px < g.jugX + g.jugW / 2 + 24 && py > jugTop - 12 && py < jugBottom + 12) {
      sim.current.dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.slide(0.4);
      notePointer(true);
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
    const py = e.clientY - rect.top;
    const g = geom();
    setLevel((py - g.tubeTop) / g.pxPerCm, true);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sim.current.dragging) return;
    sim.current.dragging = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  const markResonance = (order: 1 | 2) => {
    const s = sim.current;
    if (!s.held) return;
    const fork = FORKS[forkIdx];
    const lambdaCm = order === 1 ? 4 * L : (4 * L) / 3;
    const v = (fork.freq * lambdaCm) / 100;
    const row: MarkRow = { id: rows.length + 1, forkId: fork.id, freq: fork.freq, order, L, lambdaCm, v };
    const nextRows = [...rows, row];
    setRows(nextRows);
    s.marks.push({ L, order, forkId: fork.id });
    if (s.marks.length > 12) s.marks.shift();
    labSound.milestone();
    if (!rows.some((r) => r.order === 1) && order === 1) earn('first-resonance');
    if (nextRows.some((r) => r.order === 1) && nextRows.some((r) => r.order === 2)) earn('both-peaks');
    const err = Math.abs(v - V_AIR) / V_AIR;
    if (err <= 0.02) earn('sound-speed');
    if (err > 0.02) {
      pushToast('warn', '⚠', `v = ${v.toFixed(1)} m/s — ${(err * 100).toFixed(1)}% off 343. The mark likely missed the exact peak; sweep back and re-mark at the loudest point.`);
    } else {
      pushToast('good', '♪', `Marked resonance ${order === 1 ? 'one (λ/4)' : 'two (3λ/4)'} at L = ${L.toFixed(1)} cm → v = ${v.toFixed(1)} m/s.`);
    }
    notePointer(true);
  };

  const resetAll = () => {
    const s = sim.current;
    s.held = false;
    s.strikeAge = 0;
    s.loud = 0;
    s.vu = 0;
    s.peak = 0;
    s.dragging = false;
    s.marks = [];
    s.sweptMin = 8;
    s.sweptMax = 8;
    s.tickL = 0;
    setL(8);
    setForkIdx(0);
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setStruck([]);
    setSawObs(false);
    syncUi();
  };

  // ---- analysis -----------------------------------------------------------------------
  const plotRows = rows.map((r) => ({ x: 1000 / r.freq, y: r.lambdaCm }));
  const plotFit = useMemo(() => (plotRows.length >= 2 ? linearFit(plotRows) : null), [plotRows]);
  const distinctForks = new Set(rows.map((r) => r.forkId));
  const vMean = rows.length ? rows.reduce((acc, r) => acc + r.v, 0) / rows.length : null;
  const vSpread = rows.length ? Math.max(...rows.map((r) => r.v)) - Math.min(...rows.map((r) => r.v)) : null;
  const latestV = rows.length ? rows[rows.length - 1].v : null;

  // ---- coach ---------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (!ui.held) {
      return { tone: 'info', line: 'Strike a tuning fork to hold it over the tube mouth — the mentor starts with the 512 Hz fork.' };
    }
    if (ui.loud >= 0.85) {
      return { tone: 'good', line: `The tube is singing — loudness ${Math.round(ui.loud * 100)}%. Creep the water level to the very loudest point and mark the resonance.` };
    }
    if (rows.length >= 2 && latestV) {
      const err = ((latestV - V_AIR) / V_AIR) * 100;
      return { tone: Math.abs(err) <= 2 ? 'good' : 'info', line: `Latest v = ${latestV.toFixed(1)} m/s (${Math.abs(err).toFixed(1)}% ${err >= 0 ? 'above' : 'below'} 343). Try another fork — the speed of sound should not care which one you ring.` };
    }
    if (rows.length === 1) {
      return { tone: 'good', line: 'First peak marked. Keep sweeping — the second resonance hides near three times the first length.' };
    }
    return { tone: 'info', line: 'Sweep the water level slowly and watch the loudness meter — somewhere along the column the air will start to sing.' };
  }, [ui, rows.length, latestV]);

  // ---- status ----------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Speed of sound measured'
    : ui.held
      ? rows.length ? 'Hunting the next peak' : 'Fork over the tube — sweep the level'
      : 'Strike a fork to begin';

  // ---- render ------------------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.held ? 'active' : 'ready'}
      captionChip="Resonance in an air column"
      legend={[
        { color: '#f97316', label: 'Fork & standing wave' },
        { color: '#2f7fb8', label: 'Water column' },
        { color: '#34c759', label: 'Loudness meter' },
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
          aria-label="Resonance tube — strike a tuning fork over the tube and drag the reservoir to tune the air column"
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              if (!e.repeat) { e.preventDefault(); strike(); }
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
              e.preventDefault();
              setLevel(L + 0.2, false);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
              e.preventDefault();
              setLevel(L - 0.2, false);
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
          <div className="rt-layout">
            <div className="fork-row" data-nudge="fork">
              <span>TUNING FORK · HELD OVER THE TUBE</span>
              <div className="fork-options" role="group" aria-label="Tuning fork frequency">
                {FORKS.map((fk, i) => (
                  <button
                    key={fk.id}
                    type="button"
                    className={i === forkIdx ? 'selected' : ''}
                    onClick={() => { selectFork(i); }}
                    aria-pressed={i === forkIdx}
                  >
                    {fk.freq} Hz
                  </button>
                ))}
              </div>
              <small>Click the selected fork again to re-strike it over the mouth.</small>
            </div>
            <button
              className="action-button"
              type="button"
              data-nudge="strike"
              onClick={() => { strike(); }}
            >
              <span className="dispense-icon" aria-hidden="true">♪</span>
              <span>{ui.held ? `Strike the ${FORKS[forkIdx].freq} Hz fork again` : `Strike the ${FORKS[forkIdx].freq} Hz fork`}</span>
              <small>it rings and waits over the tube mouth</small>
            </button>
          </div>
          <div className="lab-slider-row" data-nudge="level">
            <label><span>Water level · air column L</span><strong>{L.toFixed(1)} cm</strong></label>
            <input
              type="range"
              min={L_MIN}
              max={L_MAX}
              step={0.1}
              value={L}
              aria-label="Air column length in centimetres"
              onChange={(e) => { setLevel(Number(e.target.value), false); }}
            />
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>The air column sings when its length matches an odd quarter-wavelength: L = λ/4 or 3λ/4. Mark the loudest points — the table turns each into v = f·λ.</p></div>
          <div className="rt-marks">
            <button
              className="mark-button"
              type="button"
              data-nudge="mark1"
              onClick={() => { markResonance(1); }}
              disabled={!ui.held}
            >
              <span>♪ Mark first resonance</span>
              <small>λ = 4L · L = {L.toFixed(1)} cm · meter {Math.round(ui.loud * 100)}%</small>
            </button>
            <button
              className="mark-button boil"
              type="button"
              data-nudge="mark2"
              onClick={() => { markResonance(2); }}
              disabled={!ui.held}
            >
              <span>♪♪ Mark second resonance</span>
              <small>λ = 4L/3 · L = {L.toFixed(1)} cm · meter {Math.round(ui.loud * 100)}%</small>
            </button>
          </div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Resonance bench</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Resonance loudness</span><strong>{Math.round(ui.loud * 100)} <small>%</small></strong>
            <div className="reading-track"><span style={{ width: `${clamp(ui.loud * 100, 0, 100)}%` }} /></div>
            <div className="reading-scale"><span>Silent</span><span>Singing</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Air column L</span><strong>{L.toFixed(1)} <small>cm</small></strong></div>
            <div><span>Fork</span><strong>{FORKS[forkIdx].freq} <small>Hz</small></strong></div>
            <div><span>Marks</span><strong>{rows.length}</strong></div>
            <div><span>Latest v</span><strong>{latestV ? <>{latestV.toFixed(1)} <small>m/s</small></> : '—'}</strong></div>
            <div><span>Forks rung</span><strong>{struck.length}/3</strong></div>
            <div><span>Swept range</span><strong>{ui.sweptRange.toFixed(0)} <small>cm</small></strong></div>
          </div>
          {vMean !== null && (
            <div className="v-readout">
              <span>Speed of sound — from your marks</span>
              <strong>{vMean.toFixed(1)} <small>m/s</small></strong>
              <p>Mean of {rows.length} mark{rows.length > 1 ? 's' : ''} · spread {vSpread?.toFixed(1)} m/s · accepted 343 m/s at 20 °C · error {((Math.abs(vMean - V_AIR) / V_AIR) * 100).toFixed(1)}%</p>
            </div>
          )}
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Strike the 512 Hz fork and hold it over the tube mouth.</li>
              <li>Sweep the water level slowly — drag the reservoir or slide the level control — watching the loudness meter.</li>
              <li>Find the first peak, creep to its loudest point, and mark the first resonance.</li>
              <li>Continue upward to the second peak and mark the second resonance.</li>
              <li>Read your v from the observation table and compare with 343 m/s.</li>
              <li>Repeat with the 440 Hz and 341 Hz forks — does v agree?</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Peak-hold is your friend: the thin marker on the meter remembers the loudest point you passed. Sweep slowly, bracket the peak, and mark only when the current bar tops the hold mark.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your resonance table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Strike a fork, sweep to a peak, and mark it — every mark records (fork, order, L) and computes λ and v here.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Fork (Hz)</th><th>Order</th><th>L (cm)</th><th>λ (cm)</th><th>v (m/s)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.freq}</td>
                      <td>{r.order === 1 ? '1 · λ/4' : '2 · 3λ/4'}</td>
                      <td>{r.L.toFixed(1)}</td>
                      <td>{r.lambdaCm.toFixed(1)}</td>
                      <td>{r.v.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {distinctForks.size >= 2 && plotRows.length >= 2 && plotFit && (
              <>
                <h3 style={{ marginTop: 16 }}>λ versus 1/f — one line, one speed</h3>
                <Plot points={plotRows} xLabel="1000/f (ms)" yLabel="λ (cm)" fitLine height={200} />
                <p className="observation-note">Slope = {plotFit.m.toFixed(2)} cm/ms → v = 10 × slope = <strong>{(plotFit.m * 10).toFixed(1)} m/s</strong>. Every fork should land on the same straight line through the origin, because λ = v/f for one and the same air.</p>
              </>
            )}
            <p className="observation-note">Each row computes λ = 4L (first resonance) or λ = 4L/3 (second), then v = f·λ. Marks made off the peak show up as outliers — re-mark at the loudest point to tighten them.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why the tube sings</h3>
            <p>A tube closed at one end by water and open at the mouth supports standing waves with a displacement node at the water surface and an antinode at the mouth. Resonance occurs when the air column fits an odd number of quarter-wavelengths:</p>
            <div className="equation">L = λ/4, 3λ/4, 5λ/4 … and v = f·λ</div>
            <p>So the first resonance sits at L₁ = v/(4f) and the second at L₂ = 3v/(4f). Measuring either one hands you λ, and multiplying by the fork’s frequency gives the speed of sound. In this lab the loudness follows a sharp Gaussian in L around each resonance — exactly how a real tube answers a fork.</p>
            <p>Two refinements matter in the real world. The antinode sits slightly above the mouth (the end correction, about 0.6 × the tube radius), which makes measured lengths a touch short; and the speed of sound depends on temperature, v ≈ 331.3 + 0.6·T °C m/s — here the air is a calm 20 °C, giving 343 m/s.</p>
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
