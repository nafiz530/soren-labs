import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './ohms-law.css';

/**
 * Ohm's law bench — a live schematic you operate with your hand.
 *
 * The student drags the rheostat's wiper arrow directly on the canvas to
 * sweep the circuit resistance 0–50 Ω; analog needles swing with damping
 * while digital readouts mirror them. Recorded (I, V) pairs pile onto a
 * V–I graph whose slope is the fixed 20 Ω resistor — measured, not told.
 */

const R_FIXED = 20; // Ω — the resistor the voltmeter watches
const R_INT = 0.5; // Ω — hidden internal resistance of the battery
const RH_MIN = 0;
const RH_MAX = 50;
const AM_FS = 0.5; // A — ammeter full scale
const VM_FS = 6; // V — voltmeter full scale

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'max', title: 'Drag the wiper to maximum', detail: 'Grab the arrow on the rheostat and slide it to the right end — 50 Ω of resistance in the loop, the smallest current the bench can make.', hint: 'On touch screens, drag the arrow with a finger. Arrow keys work too.' },
  { id: 'read', title: 'Read the meters', detail: 'Watch the needles swing and settle, then check the digital ammeter and voltmeter readouts in the control panel.' },
  { id: 'record', title: 'Record the pair', detail: 'Bank this (I, V) reading into your observations table — the rheostat setting is logged with it.' },
  { id: 'sweep', title: 'Sweep five settings', detail: 'Drag the wiper to a new position and record again. Five settings spread along the track make a V–I line worth fitting.' },
  { id: 'slope', title: 'Read the resistance off the graph', detail: 'Open Observations: your V–I points lie on a straight line whose slope is the resistance. Compare it with 20 Ω.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-reading', title: 'First reading', icon: '✦', detail: 'Recorded your first (I, V) pair.' },
  { id: 'five-settings', title: 'Five settings', icon: '▤', detail: 'Recorded current and voltage at five different rheostat settings.' },
  { id: 'ohm-verified', title: 'Ohm verified', icon: 'Ω', detail: 'Slope of your V–I graph within 2% of the 20 Ω resistor.' },
  { id: 'current-master', title: 'Current master', icon: '⚡', detail: 'Also recorded readings at two different battery EMFs.' },
  { id: 'edge-sweep', title: 'Edge-to-edge', icon: '⇄', detail: 'Swept the wiper from near 0 Ω to near 50 Ω and back.' },
];

interface TrialRow { id: number; rheo: number; emf: number; I: number; V: number }

interface UiSnap { I: number; V: number; rheo: number; settled: boolean; canRecord: boolean; everMax: boolean; readied: boolean }

const meta = getLabBySlug('ohms-law')!;

interface Needle { u: number; v: number }

function stepNeedle(nd: Needle, target: number, h: number) {
  const omega = 9.5;
  const zeta = 0.62;
  nd.v += (omega * omega * (target - nd.u) - 2 * zeta * omega * nd.v) * h;
  nd.u += nd.v * h;
}

const needleSettled = (nd: Needle, target: number) => Math.abs(nd.u - target) < 0.004 && Math.abs(nd.v) < 0.02;

export default function OhmsLawLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    rheo: 12, // rheostat resistance (Ω)
    acc: 0,
    uiAcc: 0,
    ndA: { u: 0, v: 0 } as Needle, // ammeter needle (0..1 of full scale)
    ndV: { u: 0, v: 0 } as Needle, // voltmeter needle
    flow: 0, // accumulated dash offset for the current animation
    lastTargetI: -1,
    dirty: false, // meters moved since they last settled
    settled: false,
    drag: false, // wiper being dragged
    lastSlideAt: 0,
    everMax: false,
    everMin: false,
    wiperMoved: false,
    settledOnce: false,
    lastRecKey: '',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [emf, setEmf] = useState(4.5);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [sawGraph, setSawGraph] = useState(false);
  const [emfNote, setEmfNote] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ I: 0, V: 0, rheo: 12, settled: false, canRecord: false, everMax: false, readied: false });

  const ohmDone = useRef(false);

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
    const key = `${s.rheo.toFixed(1)}|${emf}`;
    setUi({
      I: s.ndA.u * AM_FS,
      V: s.ndV.u * VM_FS,
      rheo: s.rheo,
      settled: s.settled,
      canRecord: s.settled && key !== s.lastRecKey,
      everMax: s.everMax,
      readied: s.settledOnce && s.wiperMoved,
    });
  }, [emf]);

  // ---- mentor completion flags -------------------------------------------
  const distinctRheo = new Set(rows.map((r) => r.rheo.toFixed(1))).size;
  const done = [
    ui.everMax,
    ui.readied,
    rows.length >= 1,
    distinctRheo >= 5,
    sawGraph && distinctRheo >= 5,
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
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'max': return { target: 'scene', gesture: 'drag', title: 'Drag the wiper', body: 'Grab the arrow on the rheostat and slide it to the far right — that puts the full 50 Ω into the circuit.' };
      case 'read': return { target: 'scene', gesture: 'point', title: 'Watch the needles', body: 'The needles are swinging to the new current. Wait for them to settle, then read the digital panel.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the pair', body: 'Needles still? Press “Record I & V” to bank this reading with its rheostat setting.' };
      case 'sweep': return { target: 'scene', gesture: 'drag', title: 'Sweep the wiper', body: 'Slide the wiper to a new position and record again — five settings spread along the track.' };
      case 'slope': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your V–I graph lives in the Observations tab — the slope of the fitted line is the resistance.' };
      default: return null;
    }
  }, [mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics -------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const It = emf / (R_FIXED + s.rheo + R_INT);
    const Vt = It * R_FIXED;
    if (Math.abs(It - s.lastTargetI) > 1e-9) {
      s.lastTargetI = It;
      s.dirty = true;
    }
    s.acc += dt;
    const h = 1 / 240;
    while (s.acc >= h) {
      s.acc -= h;
      stepNeedle(s.ndA, It / AM_FS, h);
      stepNeedle(s.ndV, Vt / VM_FS, h);
    }
    const st = needleSettled(s.ndA, It / AM_FS) && needleSettled(s.ndV, Vt / VM_FS);
    if (st && !s.settled && s.dirty) {
      s.dirty = false;
      s.settledOnce = true;
      labSound.tick();
    }
    s.settled = st;
    s.flow += dt * (26 + It * 170);
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) { s.uiAcc = 0; syncUi(); }
  }, [emf, syncUi]);

  // ---- geometry --------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const cw = canvas?.clientWidth ?? 800;
    const ch = canvas?.clientHeight ?? 500;
    const L = Math.max(58, cw * 0.12);
    const Rt = cw - L;
    const T = Math.max(66, ch * 0.17);
    const B = ch - Math.max(62, ch * 0.15);
    const M = Math.max(20, (Rt - L) * 0.08);
    const usable = Rt - L - 2 * M;
    const rhX1 = L + M;
    const rhLen = usable * 0.34;
    const rhX2 = rhX1 + rhLen;
    const resLen = usable * 0.26;
    const resX2 = Rt - M;
    const resX1 = resX2 - resLen;
    const meterR = Math.max(15, Math.min(21, usable * 0.05));
    const batCy = (T + B) / 2;
    const pitch = Math.max(20, Math.min(32, (B - T) * 0.11));
    const cells = Math.max(1, Math.round(emf / 1.5));
    const batHalf = (cells * pitch) / 2 + pitch * 0.3;
    const volY = T + Math.min(88, (B - T) * 0.34);
    const volX = (resX1 + resX2) / 2;
    const amX = (L + Rt) / 2;
    return { cw, ch, L, Rt, T, B, rhX1, rhLen, rhX2, resX1, resX2, meterR, batCy, pitch, cells, batHalf, volY, volX, amX };
  }, [emf]);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const It = emf / (R_FIXED + s.rheo + R_INT);
    const tSec = performance.now() / 1000;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const wire = '#172334';

    // ---- main loop wires (with gaps for the components) ----
    ctx.strokeStyle = wire;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const segs: [number, number, number, number][] = [
      [g.L, g.batCy - g.batHalf, g.L, g.T],
      [g.L, g.T, g.rhX1, g.T],
      [g.rhX2, g.T, g.resX1, g.T],
      [g.resX2, g.T, g.Rt, g.T],
      [g.Rt, g.T, g.Rt, g.B],
      [g.Rt, g.B, g.amX - g.meterR, g.B],
      [g.amX + g.meterR, g.B, g.L, g.B],
      [g.L, g.B, g.L, g.batCy + g.batHalf],
    ];
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segs) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // ---- voltmeter branch (across the fixed resistor) ----
    ctx.beginPath();
    ctx.moveTo(g.resX1, g.T);
    ctx.lineTo(g.resX1, g.volY);
    ctx.lineTo(g.volX - g.meterR, g.volY);
    ctx.moveTo(g.resX2, g.T);
    ctx.lineTo(g.resX2, g.volY);
    ctx.lineTo(g.volX + g.meterR, g.volY);
    ctx.stroke();
    // junction dots
    ctx.fillStyle = wire;
    for (const [dx, dy] of [[g.resX1, g.T], [g.resX2, g.T]] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- battery (stacked cells on the left wire) ----
    const batTop = g.batCy - g.batHalf;
    for (let i = 0; i < g.cells; i += 1) {
      const yLong = batTop + g.pitch * 0.3 + i * g.pitch;
      // long line = + terminal
      ctx.strokeStyle = '#d9a441';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(g.L - g.pitch * 0.5, yLong);
      ctx.lineTo(g.L + g.pitch * 0.5, yLong);
      ctx.stroke();
      // short line = − terminal
      ctx.strokeStyle = wire;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(g.L - g.pitch * 0.24, yLong + g.pitch * 0.34);
      ctx.lineTo(g.L + g.pitch * 0.24, yLong + g.pitch * 0.34);
      ctx.stroke();
    }
    // tiny + mark above the top cell
    ctx.strokeStyle = '#8a96a4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.L + g.pitch * 0.62, batTop + g.pitch * 0.2 - 4);
    ctx.lineTo(g.L + g.pitch * 0.62, batTop + g.pitch * 0.2 + 4);
    ctx.moveTo(g.L + g.pitch * 0.62 - 4, batTop + g.pitch * 0.2);
    ctx.lineTo(g.L + g.pitch * 0.62 + 4, batTop + g.pitch * 0.2);
    ctx.stroke();

    // ---- rheostat (top wire, left) ----
    ctx.fillStyle = '#eaeff4';
    ctx.strokeStyle = wire;
    ctx.lineWidth = 2;
    roundRect(ctx, g.rhX1, g.T - 11, g.rhLen, 22, 5);
    ctx.fill();
    ctx.stroke();
    // active track (left end → wiper = resistance in circuit)
    const wx = g.rhX1 + (s.rheo / RH_MAX) * g.rhLen;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(g.rhX1 + 2, g.T);
    ctx.lineTo(wx, g.T);
    ctx.stroke();
    // wiper arrow
    if (s.drag) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(232,99,42,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wx, g.T - 58);
      ctx.lineTo(wx, g.T);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = wire;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(wx, g.T - 46);
    ctx.lineTo(wx, g.T - 14);
    ctx.stroke();
    ctx.fillStyle = wire;
    ctx.beginPath();
    ctx.moveTo(wx, g.T - 10);
    ctx.lineTo(wx - 5, g.T - 19);
    ctx.lineTo(wx + 5, g.T - 19);
    ctx.closePath();
    ctx.fill();
    // grab knob
    ctx.fillStyle = s.drag ? '#e8632a' : '#f97316';
    ctx.beginPath();
    ctx.arc(wx, g.T - 50, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ---- fixed resistor (zigzag, top wire right) ----
    ctx.strokeStyle = wire;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    zigzagPath(ctx, g.resX1, g.resX2, g.T, Math.max(7, g.meterR * 0.5), 6);
    ctx.stroke();

    // ---- moving current dashes ----
    ctx.save();
    ctx.strokeStyle = `rgba(249,115,22,${Math.min(0.75, 0.3 + It * 1.4)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 10]);
    let travelled = 0;
    for (const [x1, y1, x2, y2] of segs) {
      ctx.lineDashOffset = -(s.flow + travelled);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      travelled += Math.hypot(x2 - x1, y2 - y1);
    }
    ctx.restore();

    // ---- meters ----
    drawMeter(ctx, g.amX, g.B, g.meterR, 'A', s.ndA.u);
    drawMeter(ctx, g.volX, g.volY, g.meterR, 'V', s.ndV.u);

    // settle halo on the ammeter when a fresh reading is ready
    if (s.settled && !s.drag) {
      const pulse = 0.3 + 0.2 * Math.sin(tSec * 3);
      ctx.strokeStyle = `rgba(249,115,22,${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.amX, g.B, g.meterR + 6 + Math.sin(tSec * 3) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [geom, emf]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction: drag the wiper -----------------------------------
  const setRheo = (value: number, withSound: boolean) => {
    const s = sim.current;
    const next = Math.round(Math.max(RH_MIN, Math.min(RH_MAX, value)) * 10) / 10;
    if (next === s.rheo) return;
    s.rheo = next;
    s.wiperMoved = true;
    if (next >= 48) s.everMax = true;
    if (next <= 2) s.everMin = true;
    if (s.everMax && s.everMin) earn('edge-sweep');
    if (withSound) {
      const nowT = performance.now();
      if (nowT - s.lastSlideAt > 110) {
        s.lastSlideAt = nowT;
        labSound.slide(Math.min(1, 0.2 + Math.abs(next) / 60));
      }
    }
    syncUi();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    const s = sim.current;
    const wx = g.rhX1 + (s.rheo / RH_MAX) * g.rhLen;
    if (px > wx - 38 && px < wx + 38 && py > g.T - 66 && py < g.T + 26) {
      s.drag = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.tick();
      notePointer(true);
    } else {
      notePointer(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    if (s.drag) {
      const frac = (px - g.rhX1) / g.rhLen;
      setRheo(frac * RH_MAX, true);
    } else {
      // hover affordance
      const wx = g.rhX1 + (s.rheo / RH_MAX) * g.rhLen;
      const near = px > wx - 38 && px < wx + 38 && py > g.T - 66 && py < g.T + 26;
      canvas.style.cursor = near ? 'grab' : 'default';
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag) return;
    s.drag = false;
    canvasRef.current?.style && (canvasRef.current.style.cursor = 'default');
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    notePointer(true);
  };

  // ---- controls --------------------------------------------------------------
  const changeEmf = (v: number) => {
    setEmf(v);
    labSound.tick();
    setEmfNote(true);
    window.setTimeout(() => setEmfNote(false), 5000);
    notePointer(true);
  };

  const recordReading = () => {
    const s = sim.current;
    if (!s.settled) return;
    const key = `${s.rheo.toFixed(1)}|${emf}`;
    if (key === s.lastRecKey) return;
    const It = emf / (R_FIXED + s.rheo + R_INT);
    const row: TrialRow = { id: rows.length + 1, rheo: s.rheo, emf, I: It, V: It * R_FIXED };
    s.lastRecKey = key;
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded: I = ${row.I.toFixed(3)} A · V = ${row.V.toFixed(2)} V at ${row.rheo.toFixed(1)} Ω`);
    if (rows.length === 0) earn('first-reading');
    if (new Set([...rows.map((r) => r.rheo.toFixed(1)), row.rheo.toFixed(1)]).size >= 5) earn('five-settings');
    if (new Set([...rows.map((r) => r.emf), emf]).size >= 2) earn('current-master');
    syncUi();
  };

  const resetAll = () => {
    const s = sim.current;
    s.rheo = 12; s.acc = 0; s.uiAcc = 0;
    s.ndA = { u: 0, v: 0 }; s.ndV = { u: 0, v: 0 };
    s.flow = 0; s.lastTargetI = -1; s.dirty = true; s.settled = false;
    s.drag = false; s.everMax = false; s.everMin = false;
    s.wiperMoved = false; s.settledOnce = false; s.lastRecKey = '';
    setEmf(4.5);
    setRows([]);
    setMentorIndex(0);
    setSawGraph(false);
    setBadges([]);
    syncUi();
  };

  // ---- analysis ---------------------------------------------------------------
  const fit = useMemo(
    () => (rows.length >= 2 ? linearFit(rows.map((r) => ({ x: r.I, y: r.V }))) : null),
    [rows],
  );
  const rEst = fit && fit.m > 0 ? fit.m : null;

  useEffect(() => {
    if (ohmDone.current) return;
    if (!rEst || rows.length < 5) return;
    if (Math.abs(rEst - R_FIXED) / R_FIXED <= 0.02) {
      ohmDone.current = true;
      labSound.milestone();
      pushToast('good', 'Ω', `Ohm verified: your V–I slope is ${rEst.toFixed(1)} Ω — within 2% of the 20 Ω resistor.`);
      earn('ohm-verified');
    }
  }, [rEst, rows.length, earn, pushToast]);

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (emfNote) return { tone: 'info', line: 'Fresh EMF — the current jumps, but every point still lands on the very same V–I line. The resistance did not move; the battery just pushes harder.' };
    if (!ui.settled) return { tone: 'info', line: 'The needles are catching up with the new current — real meters lag, and good readings wait for stillness.' };
    if (rows.length > 0 && !ui.canRecord) return { tone: 'info', line: 'This exact setting is already banked — slide the wiper somewhere new (or change the battery EMF) for a fresh pair.' };
    if (ui.settled && rows.length < 5) return { tone: 'good', line: `I = ${ui.I.toFixed(3)} A and V = ${ui.V.toFixed(2)} V at ${ui.rheo.toFixed(1)} Ω — record the pair, then sweep the wiper again.` };
    if (rows.length >= 5 && !sawGraph) return { tone: 'good', line: 'Five settings banked — open Observations: the slope of your V–I line is the resistance, measured not memorised.' };
    if (rEst) {
      const err = ((rEst - R_FIXED) / R_FIXED) * 100;
      return { tone: Math.abs(err) <= 2 ? 'good' : 'warn', line: `Your V–I slope gives R = ${rEst.toFixed(1)} Ω — ${Math.abs(err).toFixed(1)}% from the printed 20 Ω. The battery’s hidden 0.5 Ω internal resistance is why I is a shade under E/R.` };
    }
    return { tone: 'info', line: 'Drag the wiper arrow on the rheostat — that is your hand on the resistance. The meters answer in real time.' };
  }, [emfNote, ui, rows.length, sawGraph, rEst]);

  // ---- status ------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Experiment complete'
    : !ui.settled ? 'Meters settling'
    : rows.length ? 'Reading recorded'
    : 'Experiment ready';

  // ---- render -------------------------------------------------------------------
  const terminalV = emf - ui.I * R_INT;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="Drag the wiper — real meters answer"
      legend={[
        { color: '#172334', label: 'Wires' },
        { color: '#f97316', label: 'Current flow' },
        { color: '#d9a441', label: 'Battery cells' },
        { color: '#e8e0d2', label: 'Rheostat track' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
      }}
      toolbarExtra={
        <label>Battery EMF
          <select value={emf} onChange={(e) => changeEmf(Number(e.target.value))} aria-label="Battery EMF in volts">
            <option value={1.5}>1.5 V · 1 cell</option>
            <option value={3}>3 V · 2 cells</option>
            <option value={4.5}>4.5 V · 3 cells</option>
            <option value={6}>6 V · 4 cells</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Circuit bench — drag the rheostat wiper arrow left or right to change resistance; arrow keys nudge it too"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const dir = e.key === 'ArrowRight' ? 1 : -1;
              setRheo(sim.current.rheo + dir, false);
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
          <div className="ohm-layout">
            <div className="dig-row" aria-label="Digital meter readouts">
              <div className="dig-meter"><span>AMMETER</span><strong>{ui.I.toFixed(3)}<small>A</small></strong></div>
              <div className="dig-meter"><span>VOLTMETER</span><strong>{ui.V.toFixed(2)}<small>V</small></strong></div>
              <div className="dig-meter"><span>RHEOSTAT</span><strong>{ui.rheo.toFixed(1)}<small>Ω</small></strong></div>
            </div>
            <div className="ohm-guide">
              <p><strong>Your hand on the resistance:</strong> drag the wiper arrow on the rheostat — or focus the circuit and use ← →. The orange dashes show the current; their speed follows the ammeter.</p>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>The voltmeter watches only the 20 Ω resistor, and the battery hides 0.5 Ω inside itself — so I is always a touch under E/R. Sweep the wiper, record five pairs, and let the V–I slope prove the resistance.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordReading(); notePointer(true); }}
            disabled={!ui.canRecord}
          >
            {ui.canRecord
              ? `✎ Record I & V — ${ui.I.toFixed(3)} A · ${ui.V.toFixed(2)} V`
              : rows.length > 0 && ui.settled ? 'Move the wiper (or change EMF) for a fresh pair' : 'Let the needles settle, then record'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Meter panel</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Current I (live)</span>
            <strong>{ui.I.toFixed(3)} <small>A</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (ui.I / AM_FS) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0 A</span><span>{AM_FS} A</span></div>
          </div>
          <div className="reading-grid">
            <div><span>V across 20 Ω</span><strong>{ui.V.toFixed(2)} <small>V</small></strong></div>
            <div><span>Rheostat</span><strong>{ui.rheo.toFixed(1)} <small>Ω</small></strong></div>
            <div><span>Battery EMF</span><strong>{emf.toFixed(1)} <small>V</small></strong></div>
            <div><span>Terminal V = E − I·r</span><strong>{terminalV.toFixed(2)} <small>V</small></strong></div>
            <div><span>R from V/I (live)</span><strong>{ui.I > 0.0005 ? (ui.V / ui.I).toFixed(1) : '—'} <small>Ω</small></strong></div>
            <div><span>Loop resistance</span><strong>{(R_FIXED + ui.rheo + R_INT).toFixed(1)} <small>Ω</small></strong></div>
          </div>
          <div className="r-readout">
            <span>Measured resistance (slope of your V–I graph)</span>
            <strong>{rEst ? <>{rEst.toFixed(1)} <small>Ω</small></> : <small style={{ fontSize: 13 }}>record 2+ pairs to fit R</small>}</strong>
            {fit && rEst && <p>From the fitted line with R² = {fit.r2.toFixed(4)} over {rows.length} pair{rows.length > 1 ? 's' : ''} · printed resistor 20 Ω · error {((Math.abs(rEst - R_FIXED) / R_FIXED) * 100).toFixed(1)}%</p>}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the rheostat’s wiper arrow to the far right — maximum resistance.</li>
              <li>Let the needles settle and read I and V from the panel.</li>
              <li>Record the pair.</li>
              <li>Sweep the wiper to new positions and record — five settings spread along the track.</li>
              <li>Open Observations and read R off the slope of the V–I line.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>One point is an anecdote; five is a line. Recording at several rheostat settings is what turns two meters into a resistance measurement — and switching the battery EMF adds points without moving the line.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Drag the wiper, wait for the needles, and record your first (I, V) pair.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Rheostat (Ω)</th><th>EMF (V)</th><th>I (A)</th><th>V (V)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}><td>{r.id}</td><td>{r.rheo.toFixed(1)}</td><td>{r.emf.toFixed(1)}</td><td>{r.I.toFixed(3)}</td><td>{r.V.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>V–I analysis</h3>
                <Plot
                  points={rows.map((r) => ({ x: r.I, y: r.V }))}
                  xLabel="I (A)"
                  yLabel="V (V)"
                  fitLine
                  livePoint={ui.settled ? { x: ui.I, y: ui.V } : null}
                  height={220}
                />
                {rEst && <p className="observation-note">Slope = {fit?.m.toFixed(2)} V/A → <strong>R = {rEst.toFixed(1)} Ω</strong> ({((Math.abs(rEst - R_FIXED) / R_FIXED) * 100).toFixed(1)}% from the printed 20 Ω).</p>}
              </>
            )}
            <p className="observation-note">Every point — whatever the rheostat or the EMF — lands on the same straight line, because the voltmeter watches a fixed 20 Ω. That constancy <em>is</em> Ohm’s law.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Ohm’s law says the voltage across a conductor is proportional to the current through it, and the constant of proportionality is the resistance:</p>
            <div className="equation">V = I · R</div>
            <p>So a graph of V against I is a straight line whose slope is R. In this circuit the voltmeter is wired across just the fixed 20 Ω resistor, so your slope recovers that resistance exactly — however you set the rheostat or the battery.</p>
            <p>The battery is not perfectly ideal: it hides r = 0.5 Ω in series with its EMF, so the current is I = E/(R + rheostat + r), always a touch smaller than E/(R + rheostat). The terminal voltage follows V<sub>t</sub> = E − I·r. That is also why setups that divide terminal voltage by current land slightly above R — the terminal voltage is pushing current through the rheostat as well. Watch it live in the meter panel.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && distinctRheo >= 5) setSawGraph(true); }}
    />
  );
}

// ---- local drawing helpers --------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function zigzagPath(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, amp: number, peaks: number) {
  const lead = 10;
  const span = x2 - x1 - 2 * lead;
  if (span <= 4) {
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    return;
  }
  const step = span / (peaks * 2);
  ctx.moveTo(x1, y);
  ctx.lineTo(x1 + lead, y);
  let up = true;
  for (let i = 0; i < peaks * 2; i += 1) {
    ctx.lineTo(x1 + lead + step * (i + 1), y + (up ? -amp : amp));
    up = !up;
  }
  ctx.lineTo(x2 - lead, y);
  ctx.lineTo(x2, y);
}

function drawMeter(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, letter: string, u: number) {
  // face
  ctx.fillStyle = '#fdfefe';
  ctx.strokeStyle = '#172334';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // scale arc + ticks (needle sweeps ±50° about the upward vertical)
  const pivot = { x: cx, y: cy + r * 0.45 };
  const arcR = r * 0.82;
  ctx.strokeStyle = '#b6c1cc';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const a0 = (-50 * Math.PI) / 180 - Math.PI / 2;
  const a1 = (50 * Math.PI) / 180 - Math.PI / 2;
  ctx.arc(pivot.x, pivot.y, arcR, a0, a1);
  ctx.stroke();
  for (let i = 0; i <= 4; i += 1) {
    const a = ((-50 + (i * 100) / 4) * Math.PI) / 180 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(pivot.x + Math.cos(a) * arcR, pivot.y + Math.sin(a) * arcR);
    ctx.lineTo(pivot.x + Math.cos(a) * (arcR - 5), pivot.y + Math.sin(a) * (arcR - 5));
    ctx.stroke();
  }
  // letter
  ctx.fillStyle = '#172334';
  ctx.font = `800 ${Math.max(10, r * 0.85)}px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy + r * 0.72);
  ctx.textBaseline = 'alphabetic';
  // needle
  const na = ((-50 + Math.min(1, Math.max(0, u)) * 100) * Math.PI) / 180 - Math.PI / 2;
  const nx = pivot.x + Math.cos(na) * r * 0.78;
  const ny = pivot.y + Math.sin(na) * r * 0.78;
  ctx.strokeStyle = '#e8632a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.fillStyle = '#172334';
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
  ctx.fill();
}
