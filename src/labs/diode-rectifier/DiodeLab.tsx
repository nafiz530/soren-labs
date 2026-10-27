import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './diode-rectifier.css';

/**
 * Diode & rectifier — sweep a semiconductor diode through forward and reverse
 * bias to trace its I–V curve, then flip to rectifier mode and watch a live
 * oscilloscope turn AC into pulsating DC (and a capacitor smooth it).
 */

const V_THRESHOLD = 0.7; // silicon knee
const LOAD = 100; // ohms
const LEAKAGE_MA = 0.005; // reverse leakage in mA

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'reverse', title: 'Sweep into reverse bias', detail: 'Drag the bias slider below zero — negative voltage. Watch the meter: almost nothing flows.', hint: 'Reverse bias is the diode\u2019s closed door.' },
  { id: 'knee', title: 'Creep up through +0.7 V', detail: 'Bring the bias slowly up through +0.7 V — the diode switches on and current leaps.', hint: 'That sharp bend is the knee.' },
  { id: 'forward', title: 'Record five points', detail: 'Record five or more (V, I) points across the forward range and watch the curve build its knee.', },
  { id: 'reverse-record', title: 'Record reverse data too', detail: 'Take one reading in reverse bias — the flat line below zero is half the story.' },
  { id: 'rectify', title: 'Open the rectifier', detail: 'Switch to rectifier mode: the AC source feeds the diode, and the scope shows the negative halves vanish.', },
  { id: 'capacitor', title: 'Toggle the capacitor', detail: 'Add the smoothing capacitor — the ripple flattens toward steady DC.', hint: 'That is how power supplies work.' },
];

const BADGES: BadgeDef[] = [
  { id: 'knee-finder', title: 'Knee finder', icon: '⌒', detail: 'Recorded a point between 0.6 and 0.8 V.' },
  { id: 'reverse-realist', title: 'Reverse realist', icon: '⤺', detail: 'Recorded reverse-bias data.' },
  { id: 'rectifier-ready', title: 'Rectifier ready', icon: '〜', detail: 'Opened the half-wave rectifier bench.' },
  { id: 'ripple-tamer', title: 'Ripple tamer', icon: '▬', detail: 'Toggled the smoothing capacitor and read the note.' },
];

interface Row { id: number; v: number; iMa: number }

const meta = getLabBySlug('diode-rectifier')!;

/** Diode forward current (mA) for a source voltage V with a series load. */
function currentMa(vSource: number): number {
  if (vSource <= 0) return -LEAKAGE_MA;
  if (vSource <= V_THRESHOLD) {
    // sub-threshold Shockley tail
    const mA = 0.08 * (Math.exp(vSource / 0.045) - 1);
    return Math.min(mA, (vSource / V_THRESHOLD) * 0.4);
  }
  return ((vSource - V_THRESHOLD) / LOAD) * 1000;
}

export default function DiodeLab() {
  const sim = useRef({
    bias: 0,           // V, −5..+5
    acPhase: 0,
    vCap: 0,
    scope: [] as { vin: number; vout: number }[],
    uiAcc: 0,
    lastBiasSound: 0,
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState<'iv' | 'rectifier'>('iv');
  const [bias, setBias] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [capOn, setCapOn] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [rippleNote, setRippleNote] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState({ iMa: 0 });

  const modeRef = useRef(mode); modeRef.current = mode;
  const capRef = useRef(capOn); capRef.current = capOn;
  const speedRef = useRef(speed); speedRef.current = speed;
  const biasRef = useRef(bias); biasRef.current = bias;

  const earn = useCallback((id: string) => {
    setBadges((cur) => {
      if (cur.includes(id)) return cur;
      const b = BADGES.find((x) => x.id === id);
      if (b) setToast({ tone: 'good', icon: b.icon, msg: `Badge earned — ${b.title}` });
      labSound.badge();
      return [...cur, id];
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    const i = modeRef.current === 'iv' ? currentMa(biasRef.current) : s.scope.length ? s.scope[s.scope.length - 1].vout / LOAD * 1000 : 0;
    setUi({ iMa: i });
  }, []);

  // ---- simulation -----------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    if (modeRef.current === 'rectifier') {
      const freq = 0.5; // Hz, slowed to visible
      s.acPhase += dt * freq * Math.PI * 2 * speedRef.current;
      const vin = 6 * Math.sin(s.acPhase);
      let vout = Math.max(0, vin - V_THRESHOLD);
      if (capRef.current) {
        const rc = 0.4;
        if (vout > s.vCap) s.vCap = vout;
        else s.vCap *= Math.exp(-dt * speedRef.current / rc);
        vout = s.vCap;
      } else {
        s.vCap = vout;
      }
      s.scope.push({ vin, vout });
      if (s.scope.length > 900) s.scope.shift();
    }
    s.uiAcc += dt;
    if (s.uiAcc > 0.12) { s.uiAcc = 0; syncUi(); }
  }, [syncUi]);

  // ---- drawing -----------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 22);
    ctx.lineTo(w, h - 22);
    ctx.stroke();

    if (modeRef.current === 'iv') drawIv(ctx, w, h, s, rows);
    else drawRectifier(ctx, w, h, s, capRef.current);
  }, [rows]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  function drawIv(ctx: CanvasRenderingContext2D, w: number, h: number, s: { bias: number }, rowList: Row[]) {
    // --- circuit, left half
    const l = 40, top = 60, r = w * 0.24, bot = h - 60;
    ctx.strokeStyle = '#5d6a79';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(l, top); ctx.lineTo(r, top); ctx.lineTo(r, bot); ctx.lineTo(l, bot); ctx.closePath();
    ctx.stroke();
    // source (circle with + −)
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(l, (top + bot) / 2, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5d6a79'; ctx.stroke();
    ctx.fillStyle = '#172334';
    ctx.font = '700 11px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.bias >= 0 ? '+' : '−', l, (top + bot) / 2 + 4);
    ctx.fillStyle = '#7a8795';
    ctx.font = '9px "DM Sans", sans-serif';
    ctx.fillText(`${s.bias.toFixed(2)} V`, l, (top + bot) / 2 + 32);
    // diode symbol on top wire
    const dx = (l + r) / 2 - 24;
    ctx.strokeStyle = '#172334';
    ctx.beginPath();
    ctx.moveTo(dx, top - 11); ctx.lineTo(dx + 20, top); ctx.lineTo(dx, top + 11); ctx.closePath();
    ctx.fillStyle = '#172334'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(dx, top - 11); ctx.lineTo(dx, top + 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx + 20, top - 11); ctx.lineTo(dx + 20, top + 11); ctx.stroke();
    if (s.bias > 0.3) { // current arrows
      ctx.strokeStyle = '#e8632a';
      ctx.fillStyle = '#e8632a';
      for (let i = 0; i < 3; i += 1) {
        const ax = l + 20 + ((performance.now() / 14 + i * 60) % Math.max(60, r - l - 60));
        ctx.beginPath();
        ctx.moveTo(ax, top - 4); ctx.lineTo(ax + 9, top); ctx.lineTo(ax, top + 4);
        ctx.closePath(); ctx.fill();
      }
    }
    // load resistor on right wire
    ctx.strokeStyle = '#5d6a79';
    ctx.lineWidth = 2.5;
    const ry = (top + bot) / 2;
    ctx.beginPath();
    ctx.moveTo(r, ry - 30);
    for (let i = 0; i < 6; i += 1) ctx.lineTo(r + (i % 2 === 0 ? 9 : -9), ry - 30 + (i + 1) * 10);
    ctx.lineTo(r, ry + 30);
    ctx.stroke();
    ctx.fillStyle = '#7a8795';
    ctx.font = '9px "DM Sans", sans-serif';
    ctx.fillText('100 Ω', r + 26, ry + 3);
    // mA meter
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc((l + r) / 2, bot, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5d6a79'; ctx.stroke();
    const imA = currentMa(s.bias);
    const frac = Math.max(-1, Math.min(1, imA / 45));
    ctx.strokeStyle = '#e8632a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo((l + r) / 2, bot);
    ctx.lineTo((l + r) / 2 + Math.sin(frac * 1.2) * 13, bot - Math.cos(frac * 1.2) * 13);
    ctx.stroke();

    // --- I–V plot, right half
    const px0 = w * 0.52, px1 = w - 30;
    const py0 = 40, py1 = h - 60;
    ctx.fillStyle = '#f7f9fb';
    ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
    ctx.strokeStyle = '#e8edf2';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const yy = py0 + (py1 - py0) * i / 4;
      ctx.beginPath(); ctx.moveTo(px0, yy); ctx.lineTo(px1, yy); ctx.stroke();
    }
    // axes: V from −5..+5, I from −1..+45 mA
    const vx = (v: number) => px0 + ((v + 5) / 10) * (px1 - px0);
    const iy = (mA: number) => py0 + (1 - (mA + 1) / 46) * (py1 - py0);
    ctx.strokeStyle = '#c5cdd6';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(vx(0), py0); ctx.lineTo(vx(0), py1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px0, iy(0)); ctx.lineTo(px1, iy(0)); ctx.stroke();
    ctx.fillStyle = '#9aa4b1';
    ctx.font = '9px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+5 V', px1 - 22, py1 + 14);
    ctx.fillText('−5 V', px0 + 22, py1 + 14);
    ctx.fillText('V', (px0 + px1) / 2, py1 + 14);
    ctx.textAlign = 'right';
    ctx.fillText('45 mA', px0 - 4, py0 + 8);
    // full theoretical curve, faint
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let v = -5; v <= 5.001; v += 0.1) {
      const X = vx(v), Y = iy(currentMa(v));
      if (v === -5) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    // recorded points
    for (const p of rowList) {
      ctx.fillStyle = '#172334';
      ctx.beginPath();
      ctx.arc(vx(p.v), iy(p.iMa), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // live point
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(vx(s.bias), iy(imA), 5.5, 0, Math.PI * 2);
    ctx.fill();
    // knee marker
    ctx.strokeStyle = '#f9731688';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(vx(V_THRESHOLD), py0); ctx.lineTo(vx(V_THRESHOLD), py1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8632a';
    ctx.font = '700 9px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('knee ≈ 0.7 V', vx(V_THRESHOLD) + 6, py0 + 12);
  }

  function drawRectifier(ctx: CanvasRenderingContext2D, w: number, h: number, s: { scope: { vin: number; vout: number }[] }, cap: boolean) {
    // AC source circle
    const sx = 60, sy = h * 0.5;
    ctx.strokeStyle = '#5d6a79';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx, sy, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy); ctx.quadraticCurveTo(sx - 6, sy - 12, sx, sy);
    ctx.quadraticCurveTo(sx + 6, sy + 12, sx + 12, sy);
    ctx.stroke();
    // wires to diode + load (simplified schematic at left)
    ctx.strokeStyle = '#5d6a79';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 20); ctx.lineTo(sx + 90, sy - 20); ctx.lineTo(sx + 90, sy + 60); ctx.lineTo(sx, sy + 60); ctx.closePath();
    ctx.stroke();
    // diode
    const dx = sx + 46;
    ctx.fillStyle = '#172334';
    ctx.beginPath();
    ctx.moveTo(dx, sy - 31); ctx.lineTo(dx + 18, sy - 20); ctx.lineTo(dx, sy - 9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#172334';
    ctx.beginPath(); ctx.moveTo(dx, sy - 31); ctx.lineTo(dx, sy - 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx + 18, sy - 31); ctx.lineTo(dx + 18, sy - 9); ctx.stroke();
    // capacitor symbol
    if (cap) {
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 3;
      const cxx = sx + 90, cyy = sy + 22;
      ctx.beginPath(); ctx.moveTo(cxx - 12, cyy); ctx.lineTo(cxx - 2, cyy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxx + 2, cyy); ctx.lineTo(cxx + 12, cyy); ctx.stroke();
      ctx.strokeStyle = '#5d6a79';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cxx - 12, cyy); ctx.lineTo(cxx - 12, sy - 20); ctx.stroke();
    }
    // scope, right side
    const px0 = w * 0.32, px1 = w - 26;
    const py0 = 34, py1 = h - 44;
    ctx.fillStyle = '#172334';
    roundRect(ctx, px0 - 8, py0 - 8, px1 - px0 + 16, py1 - py0 + 16, 10);
    ctx.fill();
    ctx.strokeStyle = '#22314a';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const yy = py0 + (py1 - py0) * i / 4;
      ctx.beginPath(); ctx.moveTo(px0, yy); ctx.lineTo(px1, yy); ctx.stroke();
    }
    for (let i = 1; i < 6; i += 1) {
      const xx = px0 + (px1 - px0) * i / 6;
      ctx.beginPath(); ctx.moveTo(xx, py0); ctx.lineTo(xx, py1); ctx.stroke();
    }
    const n = s.scope.length;
    if (n > 2) {
      const win = Math.min(n, 600);
      const vy = (v: number) => (py0 + py1) / 2 - (v / 7) * (py1 - py0) / 2;
      // input trace
      ctx.strokeStyle = '#8fb7e8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < win; i += 1) {
        const p = s.scope[n - win + i];
        const xx = px0 + (i / win) * (px1 - px0);
        if (i === 0) ctx.moveTo(xx, vy(p.vin)); else ctx.lineTo(xx, vy(p.vin));
      }
      ctx.stroke();
      // output trace
      ctx.strokeStyle = '#ffb26f';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < win; i += 1) {
        const p = s.scope[n - win + i];
        const xx = px0 + (i / win) * (px1 - px0);
        if (i === 0) ctx.moveTo(xx, vy(p.vout)); else ctx.lineTo(xx, vy(p.vout));
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#8fb7e8';
    ctx.font = '700 9px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('AC INPUT', px0, py1 + 10);
    ctx.fillStyle = '#ffb26f';
    ctx.fillText(cap ? 'SMOOTHED DC' : 'RECTIFIED OUTPUT', px0 + 90, py1 + 10);
  }

  // ---- controls ------------------------------------------------------------
  const changeBias = (v: number) => {
    setBias(v);
    sim.current.bias = v;
    const now = performance.now();
    if (now - sim.current.lastBiasSound > 80) {
      sim.current.lastBiasSound = now;
      labSound.tick();
    }
  };

  const recordPoint = () => {
    const v = bias;
    const iMa = currentMa(v);
    if (rows.some((r) => Math.abs(r.v - v) < 0.05)) return;
    setRows((cur) => [...cur, { id: cur.length + 1, v, iMa }]);
    labSound.click();
    if (v > 0.6 && v < 0.8) earn('knee-finder');
    if (v < 0) earn('reverse-realist');
    setToast({ tone: 'good', icon: '✎', msg: `Recorded ${v.toFixed(2)} V → ${iMa.toFixed(2)} mA` });
  };

  const switchMode = (m: 'iv' | 'rectifier') => {
    if (m === mode) return;
    setMode(m);
    sim.current.scope = [];
    sim.current.vCap = 0;
    labSound.milestone();
    if (m === 'rectifier') earn('rectifier-ready');
  };

  const toggleCap = () => {
    setCapOn((c) => !c);
    labSound.click();
    if (!capOn) {
      earn('ripple-tamer');
      setRippleNote(true);
      window.setTimeout(() => setRippleNote(false), 6000);
    }
  };

  const resetAll = () => {
    sim.current.bias = 0; sim.current.scope = []; sim.current.vCap = 0;
    setBias(0); setRows([]); setBadges([]); setMentorIndex(0); setCapOn(false);
    setMode('iv');
  };

  // ---- mentor ------------------------------------------------------------------
  const done = [
    bias < -0.5 || rows.some((r) => r.v < 0),
    bias >= 0.65 || rows.some((r) => r.v > 0.6),
    rows.filter((r) => r.v > 0).length >= 5,
    rows.some((r) => r.v < 0),
    mode === 'rectifier',
    capOn,
  ];
  useEffect(() => {
    const next = done.findIndex((d, i) => !d && i <= mentorIndex);
    if (next > mentorIndex) { setMentorIndex(next); labSound.step(); }
  }, [done, mentorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge ----------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'reverse': return { target: 'bias', gesture: 'drag', title: 'Go negative', body: 'Drag the bias slider below 0 V and watch the meter barely move.' };
      case 'knee': return { target: 'bias', gesture: 'drag', title: 'Find the knee', body: 'Creep the slider up through +0.7 V — current switches on sharply.' };
      case 'forward': return { target: 'record', gesture: 'press', title: 'Record five points', body: 'Record (V, I) points across the forward range — the curve builds as you go.' };
      case 'reverse-record': return { target: 'record', gesture: 'press', title: 'Record reverse', body: 'Set the slider below zero and record one reverse point.' };
      case 'rectify': return { target: 'mode', gesture: 'tap', title: 'Open the rectifier', body: 'Switch the bench to rectifier mode and watch the scope.' };
      case 'capacitor': return { target: 'capacitor', gesture: 'tap', title: 'Smooth it', body: 'Toggle the smoothing capacitor — the ripple collapses toward steady DC.' };
      default: return null;
    }
  }, [mentorIndex]);
  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- coach ------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (rippleNote) return { tone: 'info', line: 'The capacitor charges at each peak and leaks slowly between peaks — the ripple is what\u2019s left of that leak. Bigger capacitance, smaller ripple.' };
    if (mode === 'rectifier') return capOn
      ? { tone: 'good', line: 'Smoothed: the output hugs a steady DC level with a small ripple instead of pulsing to zero.' }
      : { tone: 'info', line: 'Half-wave rectified: only the positive halves survive, each minus the diode\u2019s 0.7 V toll.' };
    if (bias < -0.5) return { tone: 'info', line: `Reverse bias at ${bias.toFixed(2)} V — only ${LEAKAGE_MA * 1000} µA of leakage. The diode\u2019s door is shut.` };
    if (bias > 0.55 && bias < 0.85) return { tone: 'info', line: 'Right at the knee — tiny voltage changes, huge current changes. This is the diode\u2019s switch-on region.' };
    if (bias >= 0.85) return { tone: 'good', line: `Forward bias: ${currentMa(bias).toFixed(1)} mA flowing. The extra voltage beyond 0.7 V lands on the load resistor.` };
    return { tone: 'info', line: 'Sweep the bias and record points — negative first, then creep up through the knee.' };
  }, [rippleNote, mode, capOn, bias]);

  const statusText = done[done.length - 1] ? 'Experiment complete' : mode === 'rectifier' ? 'Rectifier running' : 'I–V bench ready';

  const forwardRows = rows.filter((r) => r.v > 0);

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={done[done.length - 1] ? 'complete' : 'ready'}
      captionChip="Student-controlled experiment"
      legend={[
        { color: '#8fb7e8', label: 'AC input trace' },
        { color: '#ffb26f', label: 'Output trace' },
        { color: '#172334', label: 'Diode' },
      ]}
      coach={coach}
      mentor={{ steps: MENTOR_STEPS, index: mentorIndex, done }}
      toolbarExtra={
        mode === 'rectifier' ? (
          <label>Scope speed
            <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Oscilloscope time scale">
              <option value={1}>1× slow</option>
              <option value={2}>2×</option>
              <option value={4}>4× fast</option>
            </select>
          </label>
        ) : undefined
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Diode bench — bias sweep in IV mode, live oscilloscope in rectifier mode"
          onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && mode === 'iv') { e.preventDefault(); recordPoint(); notePointer(true); } }}
        />
      }
      controls={
        <div>
          <div className="diode-mode-row" role="group" aria-label="Bench mode">
            <button type="button" data-nudge="mode" className={mode === 'iv' ? 'diode-mode active' : 'diode-mode'} onClick={() => { switchMode('iv'); notePointer(true); }}>I–V CHARACTERISTICS</button>
            <button type="button" data-nudge="mode" className={mode === 'rectifier' ? 'diode-mode active' : 'diode-mode'} onClick={() => { switchMode('rectifier'); notePointer(true); }}>HALF-WAVE RECTIFIER</button>
          </div>

          {mode === 'iv' ? (
            <>
              <div className="diode-bias-row" data-nudge="bias">
                <div className="lab-slider-row">
                  <label><span>Bias voltage</span><strong>{bias.toFixed(2)} V</strong></label>
                  <input type="range" min={-5} max={5} step={0.05} value={bias} aria-label="Diode bias voltage" onChange={(e) => changeBias(Number(e.target.value))} />
                </div>
              </div>
              <div className="density-stats">
                <span>{ui.iMa.toFixed(2)} mA</span> flowing · {forwardRows.length}/{5} forward points recorded · {rows.some((r) => r.v < 0) ? 'reverse point banked' : 'no reverse point yet'}
              </div>
              <button
                className="record-button"
                type="button"
                data-nudge="record"
                onClick={() => { recordPoint(); notePointer(true); }}
                disabled={rows.some((r) => Math.abs(r.v - bias) < 0.05)}
              >
                {rows.some((r) => Math.abs(r.v - bias) < 0.05) ? 'Point already recorded at this bias' : `✎ Record ${bias.toFixed(2)} V → ${currentMa(bias).toFixed(2)} mA`}
              </button>
            </>
          ) : (
            <div className="diode-toggle" data-nudge="capacitor">
              <span>Smoothing capacitor {capOn ? '· ON (470 µF)' : '· OFF'}</span>
              <button type="button" className={capOn ? 'on' : ''} onClick={() => { toggleCap(); notePointer(true); }} aria-pressed={capOn}>
                {capOn ? 'CONNECTED' : 'ADD CAPACITOR'}
              </button>
            </div>
          )}
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>{mode === 'iv' ? 'Milliammeter' : 'Oscilloscope readings'}</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>{mode === 'iv' ? 'Diode current' : 'Output across load'}</span>
            <strong>{mode === 'iv' ? <>{ui.iMa.toFixed(2)} <small>mA</small></> : <>{(sim.current.scope.length ? sim.current.scope[sim.current.scope.length - 1].vout : 0).toFixed(2)} <small>V</small></>}</strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, Math.abs(mode === 'iv' ? ui.iMa / 45 * 100 : (sim.current.scope.length ? sim.current.scope[sim.current.scope.length - 1].vout / 6 : 0) * 100))}%` }} /></div>
          </div>
          <div className="reading-grid">
            <div><span>Bias / AC peak</span><strong>{mode === 'iv' ? `${bias.toFixed(2)} V` : '6.0 V'}</strong></div>
            <div><span>Diode drop</span><strong>{mode === 'iv' ? (bias > V_THRESHOLD ? '0.7 V' : '—') : '0.7 V'}</strong></div>
            <div><span>Points recorded</span><strong>{rows.length}</strong></div>
            <div><span>Knee found</span><strong>{rows.some((r) => r.v > 0.6 && r.v < 0.8) ? 'yes' : 'not yet'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the bias slider negative — record one reverse point.</li>
              <li>Creep up through +0.7 V and feel the current switch on.</li>
              <li>Record five forward points, including one near the knee.</li>
              <li>Switch to rectifier mode — watch the negative halves vanish.</li>
              <li>Toggle the smoothing capacitor and watch the ripple flatten.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Record points closer together near 0.7 V — that is where the curve bends, and where the diode\u2019s personality lives.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your I–V data</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Sweep the bias and record points — they appear on the canvas curve and here.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>V (V)</th><th>I (mA)</th><th>Region</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td><td>{r.v.toFixed(2)}</td><td>{r.iMa.toFixed(2)}</td>
                      <td>{r.v < 0 ? 'reverse' : r.v < 0.7 ? 'sub-threshold' : 'forward'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="observation-note">Forward points should sit on the steep rising branch past 0.7 V; the reverse point lies almost exactly on the flat axis. Together they sketch the one-way valve.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>A diode conducts willingly in one direction and barely at all in the other. Forward bias above roughly 0.7 V (for silicon) lets current grow steeply — every extra bit of voltage lands on the series load, so I ≈ (V − 0.7)/R. Reverse bias leaves only a microamp-scale leakage:</p>
            <div className="equation">I = (V − V_knee) / R&nbsp;&nbsp;(forward) · I ≈ leakage (reverse)</div>
            <p>That asymmetry is exactly what a rectifier exploits. Fed with alternating current, the diode passes only the positive halves — minus its 0.7 V toll — producing pulsating direct current at the load. The capacitor then does the smoothing: it charges at each peak and leaks slowly between peaks, so the output sags only slightly before the next peak refills it.</p>
            <p>Real power supplies chain this with full-wave rectification and larger capacitors — but the principle on this bench is the same one inside every charger and DC adapter.</p>
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
