import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { fmtClock, linearFit } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './pendulum.css';

/**
 * Simple pendulum — reference implementation of the Soren Lab Engine.
 *
 * The student drags the bob aside, releases it, and the lab times twenty
 * full oscillations while a photogate counts. Length, mass and playback
 * speed are theirs to control; four recorded runs turn into a T²–L graph
 * whose fitted slope measures g.
 */

const G_TRUE = 9.81;
const DAMPING = 0.03;
const MAX_ANGLE = 0.524; // 30° clamp
const TARGET_SWINGS = 20;

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'setup', title: 'Set up the swing', detail: 'Drag the brass bob aside to roughly 15° and let it go — the stopwatch starts the moment you release.', hint: 'On touch screens, drag the bob with a finger — or press “Release from 15°”.' },
  { id: 'twenty', title: 'Time twenty swings', detail: 'Watch the photogate count each full oscillation. The watch stops itself at twenty — that is your t₂₀.', hint: 'Big angles stretch the formula; stay at 15° or less.' },
  { id: 'record', title: 'Record the run', detail: 'Record the length and total time in your observation table. The period and T² are computed for you.' },
  { id: 'length', title: 'Try a new length', detail: 'Move the length slider and repeat the whole timing. Four different lengths give the graph something to bite on.' },
  { id: 'graph', title: 'Read your g', detail: 'Open Observations: the slope of the T²–L line hides 4π²/g. Compare your measured g with 9.81 m/s².' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-swing', title: 'First swing', icon: '✦', detail: 'Released the pendulum for the first time.' },
  { id: 'patience', title: 'Twenty swings', icon: '⏱', detail: 'Let the photogate count a full twenty oscillations.' },
  { id: 'varied', title: 'Four lengths', icon: '⇄', detail: 'Recorded runs at four different string lengths.' },
  { id: 'gravity', title: 'Gravity hunter', icon: '🌍', detail: 'Measured g within 2% of 9.81 m/s².' },
  { id: 'skeptic', title: 'Mass skeptic', icon: '⚖', detail: 'Changed the bob mass three times to check that period ignores it.' },
];

interface TrialRow { id: number; L: number; t20: number; T: number; T2: number }

interface UiSnap { theta: number; count: number; watchTime: number; swinging: boolean }

const meta = getLabBySlug('pendulum')!;

export default function PendulumLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) --------
  const sim = useRef({
    theta: 0,
    omega: 0,
    swinging: false,
    dragging: false,
    watchRunning: false,
    awaitingGate: false,
    watchTime: 0,
    count: 0,
    lastSign: 0,
    acc: 0,
    uiAcc: 0,
    gateFlash: 0,
    creakAt: 0,
    trail: [] as { x: number; y: number }[],
    pendingMilestone: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [length, setLength] = useState(0.6);
  const [mass, setMass] = useState(100);
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const massEdits = useRef(0);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [massNote, setMassNote] = useState(false);
  const [bigAngleNote, setBigAngleNote] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ theta: 0, count: 0, watchTime: 0, swinging: false });

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
    setUi({ theta: s.theta, count: s.count, watchTime: s.watchTime, swinging: s.swinging });
  }, []);

  // ---- mentor completion flags -------------------------------------------
  const released = badges.includes('first-swing');
  const counted20 = badges.includes('patience');
  const distinctLengths = new Set(rows.map((r) => r.L.toFixed(2))).size;
  const done = [
    released,
    counted20,
    rows.length >= 1,
    distinctLengths >= 4,
    sawGraph && distinctLengths >= 4,
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
      case 'setup': return { target: 'scene', gesture: 'drag', title: 'Drag the bob aside', body: 'Grab the brass bob, pull it to about 15° on the protractor, then release — timing starts with your let-go.' };
      case 'twenty': return { target: 'scene', gesture: 'point', title: 'Let it count', body: 'The photogate at the bottom counts full swings. Keep the phone still — the watch stops itself at twenty.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the run', body: 'Twenty swings are timed — press “Record this run” to bank the length and t₂₀.' };
      case 'length': return { target: 'length', gesture: 'drag', title: 'New length', body: 'Slide the string to a new length, release the bob and time twenty swings again.' };
      case 'graph': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your T²–L graph lives in the Observations tab — the fitted slope measures g.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics -------------------------------------------------------------
  const release = useCallback((fromDeg?: number) => {
    const s = sim.current;
    if (fromDeg !== undefined) s.theta = (fromDeg * Math.PI) / 180;
    if (Math.abs(s.theta) < 0.035) return;
    s.omega = 0;
    s.swinging = true;
    // Photogate timing: the watch starts when the bob first sweeps through the
    // gate (count = 0), and stops on the 21st crossing = exactly 20 periods.
    s.watchRunning = false;
    s.awaitingGate = true;
    s.watchTime = 0;
    s.count = 0;
    s.lastSign = Math.sign(s.theta) || 1;
    s.trail = [];
    labSound.thunk(false);
    earn('first-swing');
    if (Math.abs(s.theta) > 0.35) {
      setBigAngleNote(true);
      labSound.warn();
    }
    syncUi();
  }, [earn, syncUi]);

  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const spd = speed;
    const scaled = dt * spd;
    s.acc += scaled;
    const h = 1 / 240;
    while (s.acc >= h) {
      s.acc -= h;
      if (s.swinging && !s.dragging) {
        const L = length;
        s.omega += (-(G_TRUE / L) * Math.sin(s.theta) - DAMPING * s.omega) * h;
        s.theta += s.omega * h;
        // A leftward pass through centre is one gate event. The first starts
        // the watch (count 0); the 21st stops it after exactly 20 periods.
        const sign = s.theta >= 0 ? 1 : -1;
        if (sign !== s.lastSign && sign === -1) {
          s.gateFlash = 0.18;
          labSound.tick();
          if (s.awaitingGate) {
            s.awaitingGate = false;
            s.watchRunning = true;
            s.watchTime = 0;
            s.count = 0;
          } else {
            s.count += 1;
            if (s.count >= TARGET_SWINGS && s.watchRunning) {
              s.watchRunning = false;
              s.pendingMilestone = true;
            }
          }
        }
        s.lastSign = sign;
        if (Math.abs(s.theta) < 0.002 && Math.abs(s.omega) < 0.02) {
          s.swinging = false;
        }
      }
      if (s.watchRunning) s.watchTime += h;
    }
    if (s.gateFlash > 0) s.gateFlash = Math.max(0, s.gateFlash - dt);
    if (s.swinging) {
      // trail sample (in draw-space units added during draw)
      s.trail.length > 90 && s.trail.shift();
    }
    if (s.pendingMilestone) {
      s.pendingMilestone = false;
      labSound.milestone();
      earn('patience');
      pushToast('good', '⏱', 'Twenty swings timed — the watch stopped itself. Record the run.');
      syncUi();
    }
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, length, earn, pushToast, syncUi]);

  // ---- geometry helpers ------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const cw = canvas?.clientWidth ?? 800;
    const ch = canvas?.clientHeight ?? 500;
    const pivot = { x: cw / 2, y: 34 };
    const scale = (ch - 170) / 1.05;
    return { cw, ch, pivot, scale, Lpx: length * scale };
  }, [length]);

  const bobPos = useCallback(() => {
    const { pivot, Lpx } = geom();
    return { x: pivot.x + Math.sin(sim.current.theta) * Lpx, y: pivot.y + Math.cos(sim.current.theta) * Lpx };
  }, [geom]);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const { pivot, Lpx } = geom();
    const bobR = 13 + ((mass - 50) / 150) * 9;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // floor
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 22);
    ctx.lineTo(w, h - 22);
    ctx.stroke();
    ctx.strokeStyle = '#dde4ea';
    ctx.lineWidth = 1;
    for (let x = 8; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, h - 22);
      ctx.lineTo(x - 10, h - 12);
      ctx.stroke();
    }

    // support beam + clamp
    ctx.fillStyle = '#435062';
    roundRect(ctx, w / 2 - 110, 16, 220, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#313d4d';
    roundRect(ctx, w / 2 - 13, 24, 26, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // length ruler (only when there is room)
    if (w > 560) {
      const rx = 46;
      ctx.strokeStyle = '#b6c1cc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, pivot.y);
      ctx.lineTo(rx, pivot.y + (1.0 * (h - 170)) / 1.05);
      ctx.stroke();
      ctx.fillStyle = '#8a96a4';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      for (let cm = 0; cm <= 100; cm += 5) {
        const y = pivot.y + ((cm / 100) * (h - 170)) / 1.05;
        const long = cm % 20 === 0;
        ctx.beginPath();
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + (long ? 12 : 6), y);
        ctx.strokeStyle = '#b6c1cc';
        ctx.stroke();
        if (long) ctx.fillText(`${cm}`, rx + 15, y + 3);
      }
      // live length marker on the ruler
      const ly = pivot.y + Lpx;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(rx - 3, ly);
      ctx.lineTo(rx - 11, ly - 5);
      ctx.lineTo(rx - 11, ly + 5);
      ctx.closePath();
      ctx.fill();
    }

    // protractor arc
    const pr = 66;
    ctx.strokeStyle = '#aeb9c4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, pr, Math.PI / 2 - MAX_ANGLE, Math.PI / 2 + MAX_ANGLE);
    ctx.stroke();
    ctx.fillStyle = '#8a96a4';
    ctx.font = '9px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    for (let deg = -30; deg <= 30; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const inner = pr - (deg % 15 === 0 ? 9 : 5);
      ctx.beginPath();
      ctx.moveTo(pivot.x + Math.sin(a) * inner, pivot.y + Math.cos(a) * inner);
      ctx.lineTo(pivot.x + Math.sin(a) * pr, pivot.y + Math.cos(a) * pr);
      ctx.strokeStyle = deg % 15 === 0 ? '#98a4b0' : '#c0cad3';
      ctx.stroke();
      if (deg % 15 === 0 && deg !== 0) {
        ctx.fillText(`${Math.abs(deg)}°`, pivot.x + Math.sin(a) * (pr + 13), pivot.y + Math.cos(a) * (pr + 13) + 3);
      }
    }

    // current-angle wedge
    if (Math.abs(s.theta) > 0.02) {
      ctx.beginPath();
      ctx.moveTo(pivot.x, pivot.y);
      ctx.arc(pivot.x, pivot.y, pr - 16, Math.PI / 2, Math.PI / 2 - s.theta, s.theta > 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(249,115,22,0.13)';
      ctx.fill();
    }

    // trail
    if (s.trail.length > 1) {
      ctx.lineWidth = 2;
      for (let i = 1; i < s.trail.length; i += 1) {
        const a = (i / s.trail.length) * 0.5;
        ctx.strokeStyle = `rgba(232,99,42,${a})`;
        ctx.beginPath();
        ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
        ctx.lineTo(s.trail[i].x, s.trail[i].y);
        ctx.stroke();
      }
    }

    // string
    ctx.strokeStyle = '#f7f1e4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(pivot.x + Math.sin(s.theta) * Lpx, pivot.y + Math.cos(s.theta) * Lpx);
    ctx.stroke();

    // photogate
    const gy = pivot.y + Lpx + bobR + 24;
    ctx.fillStyle = '#5d6a79';
    roundRect(ctx, w / 2 - 46, gy - 4, 12, 26, 3); ctx.fill();
    roundRect(ctx, w / 2 + 34, gy - 4, 12, 26, 3); ctx.fill();
    const beamOn = s.gateFlash > 0;
    ctx.strokeStyle = beamOn ? '#f97316' : '#c2ccd6';
    ctx.lineWidth = beamOn ? 2.5 : 1.5;
    if (beamOn) {
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.moveTo(w / 2 - 34, gy + 8);
    ctx.lineTo(w / 2 + 34, gy + 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // bob
    const bx = pivot.x + Math.sin(s.theta) * Lpx;
    const by = pivot.y + Math.cos(s.theta) * Lpx;
    const grad = ctx.createRadialGradient(bx - bobR * 0.35, by - bobR * 0.4, bobR * 0.15, bx, by, bobR);
    grad.addColorStop(0, '#f6d27c');
    grad.addColorStop(0.55, '#d9a441');
    grad.addColorStop(1, '#8a6420');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, bobR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6e5019';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(bx - bobR * 0.32, by - bobR * 0.38, bobR * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // hook
    ctx.strokeStyle = '#9aa4b1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by - bobR - 3, 4, Math.PI, 0);
    ctx.stroke();

    // drag affordance
    if (s.dragging) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#e8632a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pivot.x, pivot.y, Lpx, Math.PI / 2 - MAX_ANGLE, Math.PI / 2 + MAX_ANGLE);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // extend trail with the current bob position
    if (s.swinging) {
      s.trail.push({ x: bx, y: by });
      if (s.trail.length > 90) s.trail.shift();
    }
  }, [geom, mass]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { x: bx, y: by } = bobPos();
    const bobR = 13 + ((mass - 50) / 150) * 9;
    const dist = Math.hypot(px - bx, py - by);
    if (dist < bobR + 26) {
      sim.current.dragging = true;
      sim.current.swinging = false;
      sim.current.omega = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.4);
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
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { pivot } = geom();
    const theta = Math.atan2(px - pivot.x, py - pivot.y);
    s.theta = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, theta));
    const nowT = performance.now();
    if (nowT - s.creakAt > 90) {
      s.creakAt = nowT;
      labSound.creak(0.2 + Math.abs(s.theta) * 1.4);
    }
    syncUi();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.dragging) return;
    s.dragging = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (Math.abs(s.theta) >= 0.035) release();
    else { s.theta = 0; s.omega = 0; syncUi(); }
  };

  // ---- controls --------------------------------------------------------------
  const changeLength = (v: number) => {
    setLength(v);
    const s = sim.current;
    s.swinging = false;
    s.omega = 0;
    s.theta = 0;
    s.watchRunning = false;
    s.watchTime = 0;
    s.count = 0;
    s.trail = [];
    labSound.slide(0.5);
    syncUi();
  };

  const changeMass = (v: number) => {
    setMass(v);
    labSound.tick();
    massEdits.current += 1;
    if (massEdits.current >= 3) earn('skeptic');
    if (sim.current.count > 0 || sim.current.swinging) {
      setMassNote(true);
      window.setTimeout(() => setMassNote(false), 5000);
    }
  };

  const recordRun = () => {
    const s = sim.current;
    if (s.count < TARGET_SWINGS) return;
    const T = s.watchTime / TARGET_SWINGS;
    const row: TrialRow = { id: rows.length + 1, L: length, t20: s.watchTime, T, T2: T * T };
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded: L = ${(length * 100).toFixed(0)} cm, t₂₀ = ${s.watchTime.toFixed(1)} s`);
    // ready the bench for the next run
    s.swinging = false;
    s.theta = 0;
    s.omega = 0;
    s.watchRunning = false;
    s.watchTime = 0;
    s.count = 0;
    s.trail = [];
    syncUi();
    if (new Set([...rows.map((r) => r.L.toFixed(2)), length.toFixed(2)]).size >= 4) earn('varied');
  };

  const resetAll = () => {
    const s = sim.current;
    s.theta = 0; s.omega = 0; s.swinging = false; s.dragging = false;
    s.watchRunning = false; s.watchTime = 0; s.count = 0; s.trail = [];
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    syncUi();
  };

  // ---- analysis ---------------------------------------------------------------
  const fit = useMemo(
    () => (rows.length >= 2 ? linearFit(rows.map((r) => ({ x: r.L, y: r.T2 }))) : null),
    [rows],
  );
  const gEst = fit && fit.m > 0 ? (4 * Math.PI * Math.PI) / fit.m : null;

  useEffect(() => {
    if (gEst && Math.abs(gEst - G_TRUE) / G_TRUE <= 0.02) earn('gravity');
  }, [gEst]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (bigAngleNote) return { tone: 'warn', line: 'That release was wide — big swings bend the simple formula. Aim for 15° or less for a clean g.' };
    if (massNote) return { tone: 'info', line: 'Notice: the period ignored the mass change — mass never appears in T = 2π√(L/g).' };
    if (!released) return { tone: 'info', line: 'Drag the brass bob aside to about 15° and let it go — the stopwatch starts with your release.' };
    if (ui.swinging && ui.count < TARGET_SWINGS) return { tone: 'info', line: `${ui.count}/${TARGET_SWINGS} swings · ${ui.watchTime.toFixed(1)} s on the watch — steady hands, let it count.` };
    if (ui.count >= TARGET_SWINGS && rows.length < 1) return { tone: 'good', line: 'Twenty swings timed — the watch stopped itself. Record the run, then we will change the length.' };
    if (distinctLengths < 4) return { tone: 'info', line: 'Good run banked. Move the length slider to a new value and repeat — four lengths make the graph honest.' };
    if (!sawGraph) return { tone: 'good', line: 'Four lengths collected — open Observations and read your g off the fitted line.' };
    if (gEst) {
      const err = ((gEst - G_TRUE) / G_TRUE) * 100;
      return { tone: Math.abs(err) <= 2 ? 'good' : 'warn', line: `Your g = ${gEst.toFixed(2)} m/s² — that is ${Math.abs(err).toFixed(1)}% ${err >= 0 ? 'above' : 'below'} the accepted 9.81. Repeat runs sharpen the fit.` };
    }
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [bigAngleNote, massNote, released, ui, rows.length, distinctLengths, sawGraph, gEst]);

  // ---- status ------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Experiment complete' : ui.swinging ? 'Timing in progress' : rows.length ? 'Run recorded — next length' : 'Experiment ready';

  // ---- render -------------------------------------------------------------------
  const watchSec = ui.watchTime;
  const countPct = Math.min(100, (ui.count / TARGET_SWINGS) * 100);

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="Student-controlled experiment"
      legend={[
        { color: '#d9a441', label: 'Brass bob' },
        { color: '#f97316', label: 'Photogate beam' },
        { color: '#e8e0d2', label: 'String' },
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
      toolbarExtra={
        <label>Playback
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Playback speed">
            <option value={1}>1× real time</option>
            <option value={2}>2× faster</option>
            <option value={4}>4× faster</option>
            <option value={8}>8× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Pendulum bench — drag the bob to set the release angle, then release"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); release(15); notePointer(true); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="pendulum-layout">
            <div className="pendulum-action">
              <button
                className="action-button"
                type="button"
                data-nudge="release"
                onClick={() => { release(15); notePointer(true); }}
                disabled={ui.swinging}
              >
                <span className="dispense-icon" aria-hidden="true">↺</span>
                <span>{ui.swinging ? 'Swinging…' : 'Release from 15°'}</span>
                <small>or drag the bob yourself</small>
              </button>
              <div className="stopwatch">
                <span>STOPWATCH · SIMULATED TIME</span>
                <strong className={sim.current.watchRunning ? 'running' : ''}>{fmtClock(watchSec)}</strong>
                <div className="count-line">
                  <span>{Math.min(ui.count, TARGET_SWINGS)}/{TARGET_SWINGS} swings</span>
                  <div><span style={{ width: `${countPct}%` }} /></div>
                </div>
              </div>
            </div>
            <div className="pendulum-sliders">
              <div className="lab-slider-row" data-nudge="length">
                <label><span>String length</span><strong>{(length * 100).toFixed(0)} cm</strong></label>
                <input type="range" min="0.2" max="1" step="0.01" value={length}
                  aria-label="String length in metres"
                  onChange={(e) => changeLength(Number(e.target.value))} />
              </div>
              <div className="lab-slider-row" data-nudge="mass">
                <label><span>Bob mass</span><strong>{mass} g</strong></label>
                <input type="range" min="50" max="200" step="5" value={mass}
                  aria-label="Bob mass in grams"
                  onChange={(e) => changeMass(Number(e.target.value))} />
              </div>
              <div className="lab-slider-row">
                <label><span>Release angle</span><strong>{Math.abs(Math.round((ui.theta * 180) / Math.PI))}°</strong></label>
                <input type="range" min="2" max="30" step="1" value={Math.max(2, Math.abs(Math.round((ui.theta * 180) / Math.PI)))}
                  aria-label="Release angle in degrees (readout of current bob angle)"
                  onChange={(e) => { sim.current.theta = (Number(e.target.value) * Math.PI) / 180 * (sim.current.theta >= 0 ? 1 : -1); sim.current.swinging = false; sim.current.omega = 0; syncUi(); }} />
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Time twenty swings at four different lengths — the slope of your T²–L line measures g. Changing mass changes nothing but the bob&apos;s size: that is the point.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRun(); notePointer(true); }}
            disabled={ui.count < TARGET_SWINGS}
          >
            {ui.count >= TARGET_SWINGS ? `✎ Record this run — L = ${(length * 100).toFixed(0)} cm, t₂₀ = ${ui.watchTime.toFixed(1)} s` : 'Record unlocks after twenty swings'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Estimated period (live)</span><strong>{(2 * Math.PI * Math.sqrt(length / G_TRUE)).toFixed(3)} <small>s</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (length / 1) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0.2 m</span><span>1.0 m</span></div>
          </div>
          <div className="reading-grid">
            <div><span>String length</span><strong>{(length * 100).toFixed(0)} cm</strong></div>
            <div><span>Bob mass</span><strong>{mass} g</strong></div>
            <div><span>Swing angle</span><strong>{Math.abs(Math.round((ui.theta * 180) / Math.PI))}°</strong></div>
            <div><span>Oscillations</span><strong>{ui.count}</strong></div>
            <div><span>Stopwatch</span><strong>{watchSec.toFixed(1)} s</strong></div>
            <div><span>Measured T (t₂₀/20)</span><strong>{ui.count >= TARGET_SWINGS ? (ui.watchTime / TARGET_SWINGS).toFixed(3) : '—'}{ui.count >= TARGET_SWINGS ? ' s' : ''}</strong></div>
          </div>
          <div className="g-readout">
            <span>Measured gravitational acceleration</span>
            <strong>{gEst ? <>{gEst.toFixed(2)} <small>m/s²</small></> : <small style={{ fontSize: 13 }}>record 2+ runs to fit g</small>}</strong>
            {fit && gEst && <p>From the T²–L fit with R² = {fit.r2.toFixed(4)} over {rows.length} run{rows.length > 1 ? 's' : ''} · accepted value 9.81 m/s² · error {((Math.abs(gEst - G_TRUE) / G_TRUE) * 100).toFixed(1)}%</p>}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Drag the brass bob aside to about 15° and release it — or press “Release from 15°”.</li>
              <li>Let the photogate count twenty full oscillations; the watch stops itself.</li>
              <li>Record the run — length, t₂₀, period and T² land in the table.</li>
              <li>Change the string length and repeat: four different lengths.</li>
              <li>Open Observations and read g off the fitted T²–L line.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Time accumulates many cycles to divide your timing error by twenty — the oldest trick in measurement. Keep releases small: 15° or less.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Time twenty swings and record your first run. Four different lengths unlock the graph.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>L (cm)</th><th>t₂₀ (s)</th><th>T (s)</th><th>T² (s²)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}><td>{r.id}</td><td>{(r.L * 100).toFixed(0)}</td><td>{r.t20.toFixed(1)}</td><td>{r.T.toFixed(3)}</td><td>{r.T2.toFixed(4)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>T²–L analysis</h3>
                <Plot points={rows.map((r) => ({ x: r.L, y: r.T2 }))} xLabel="L (m)" yLabel="T² (s²)" fitLine height={220} />
                {gEst && <p className="observation-note">Slope = {fit?.m.toFixed(3)} s²/m → g = 4π²/slope = <strong>{gEst.toFixed(2)} m/s²</strong> ({((Math.abs(gEst - G_TRUE) / G_TRUE) * 100).toFixed(1)}% from 9.81).</p>}
              </>
            )}
            <p className="observation-note">A stopwatch that stops itself still measures the same physics: T² = (4π²/g)·L. Your straight line is the proof.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>A pendulum swings because gravity pulls the bob back toward the lowest point. For small angles the restoring pull is proportional to how far the bob has strayed, so the motion is simple harmonic with period:</p>
            <div className="equation">T = 2π √(L / g)</div>
            <p>Squaring gives T² = (4π²/g)·L — a straight line through the origin. That is why the lab plots period-squared against length: the slope hands you g as 4π² divided by slope, using nothing but a stopwatch and a ruler.</p>
            <p>Mass cancels because the same gravity that speeds a heavy bob up also makes it harder to move — the two effects cancel exactly. Amplitude only matters once swings get wide; beyond about 15° the simple proportionality breaks and the true period drifts longer.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && distinctLengths >= 4) setSawGraph(true); }}
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
