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
import './hookes-law-spring.css';

/**
 * Hooke's law spring — a mass-loading bench.
 *
 * The student taps slotted 50 g masses onto a hanger; the spring dips,
 * overshoots and settles against a mm ruler. Each settled (mass, extension)
 * pair is banked into a table, and the F–x graph hands back the spring
 * constant. Past 450 g the spring yields: the line bends and the pointer
 * refuses to return to zero — plastic deformation, taught by hand.
 */

const G_TRUE = 9.81; // m/s²
const K_TRUE = 25; // N/m — the hidden spring constant
const K_SOFT = 12; // N/m — stiffness past the elastic limit
const F_LIM = 4.45; // N — elastic limit (just above the 450 g load)
const X_LIM = F_LIM / K_TRUE;
const CHIP_G = 50;
const MAX_CHIPS = 10;
const HANGER_KG = 0.05; // effective moving mass of the empty hanger
const NATURAL_M = 0.1; // natural spring length (m)
const ROD_M = 0.125; // hanger rod length below the pointer (m)

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'zero', title: 'Find your zero', detail: 'With the hanger empty, the pointer tip sits exactly on the ruler’s 0 mark. Every extension you record is measured down from that line.', hint: 'Read the pointer TIP — and keep your eye level with it to dodge parallax.' },
  { id: 'load', title: 'Load 100 g and watch it settle', detail: 'Tap two 50 g chips. The spring dips, overshoots and rings softly before coming to rest — real springs do exactly that.', hint: 'The Record button unlocks only when the pointer is still.' },
  { id: 'record', title: 'Record force and extension', detail: 'Bank the pair into your table: the mass, F = mg, and the extension x read from the zero line.' },
  { id: 'five', title: 'Collect five points up to 400 g', detail: 'Change the load — 100, 150, 200 … 400 g — recording each settled reading. Five well-spread points make a line worth fitting.' },
  { id: 'slope', title: 'Read k off your graph', detail: 'Open Observations: your F–x points lean onto a straight line. Its slope is the spring constant — compare it with the hidden 25 N/m.' },
  { id: 'limit', title: 'Break the elastic limit (once!)', detail: 'Load past 450 g. Watch the graph bend as the spring yields — then unload fully and see the pointer refuse to return to zero.', hint: 'That permanent stretch is plastic deformation. The spring remembers.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-load', title: 'First load', icon: '✦', detail: 'Loaded the first 50 g mass onto the hanger.' },
  { id: 'five-points', title: 'Five points', icon: '▤', detail: 'Recorded five force–extension pairs.' },
  { id: 'spring-constant', title: 'Spring constant', icon: 'k', detail: 'Measured k within 3% of the hidden value from your own graph.' },
  { id: 'zero-keeper', title: 'Zero keeper', icon: '↺', detail: 'Completed a full load–unload cycle without ever passing the elastic limit.' },
  { id: 'limit-breaker', title: 'Limit breaker', icon: '⚠', detail: 'Witnessed plastic deformation: pushed past the elastic limit and unloaded to a permanent stretch.' },
];

interface TrialRow { id: number; mG: number; F: number; x: number; plastic: boolean }

interface UiSnap { x: number; settled: boolean; s: number; reached100: boolean }

const meta = getLabBySlug('hookes-law-spring')!;

/** Equilibrium extension for a load, given the current permanent set. */
const equilibrium = (mKg: number, set: number) => {
  const F = mKg * G_TRUE;
  return F <= F_LIM ? set + F / K_TRUE : set + X_LIM + (F - F_LIM) / K_SOFT;
};

export default function HookesLawLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    x: 0, // extension from the zero line (m)
    v: 0, // velocity (m/s)
    m: 0, // loaded mass (kg)
    s: 0, // permanent plastic set (m)
    acc: 0,
    uiAcc: 0,
    settled: true,
    everLoaded: false,
    everPastLimit: false,
    reached100: false,
    creakAt: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [stack, setStack] = useState<number[]>([]);
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [limitWarn, setLimitWarn] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ x: 0, settled: true, s: 0, reached100: false });

  const kBadgeDone = useRef(false);

  const totalG = stack.length * CHIP_G;
  const totalKg = totalG / 1000;
  const loadF = totalKg * G_TRUE;

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
    setUi({ x: s.x, settled: s.settled, s: s.s, reached100: s.reached100 });
  }, []);

  // ---- mentor completion flags -------------------------------------------
  const elasticRows = rows.filter((r) => !r.plastic).length;
  const done = [
    mentorAcked || badges.includes('first-load'),
    badges.includes('first-load') && ui.reached100,
    rows.length >= 1,
    elasticRows >= 5,
    sawGraph && elasticRows >= 5,
    badges.includes('limit-breaker'),
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
      case 'zero': return { target: 'scene', gesture: 'point', title: 'Find your zero', body: 'See the pointer tip resting on the ruler’s 0 mark? That line is the reference for every extension you will measure.' };
      case 'load': return { target: 'mass', gesture: 'press', title: 'Load the hanger', body: 'Tap two 50 g chips to load 100 g — then watch the spring dip, overshoot and settle.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the pair', body: 'The pointer is still — press “Record” to bank the mass, F = mg and the extension.' };
      case 'five': return { target: 'mass', gesture: 'press', title: 'Change the load', body: 'Add or remove chips and record each settled reading — five points spread up to 400 g.' };
      case 'slope': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your F–x graph lives in the Observations tab — the slope of the fitted line is the spring constant.' };
      case 'limit': return { target: 'mass', gesture: 'press', title: 'Push past 450 g', body: 'Keep adding chips past 450 g — the spring will yield, and the graph will remember it.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics -------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.acc += dt * speed;
    const h = 1 / 480;
    while (s.acc >= h) {
      s.acc -= h;
      const mEff = HANGER_KG + s.m;
      const Fw = s.m * G_TRUE;
      const e = s.x - s.s;
      const Fs = e <= X_LIM ? K_TRUE * e : F_LIM + K_SOFT * (e - X_LIM);
      const c = 2 * 0.22 * Math.sqrt(K_TRUE * mEff);
      s.v += ((Fw - Fs - c * s.v) / mEff) * h;
      s.x += s.v * h;
      if (s.x < 0) { s.x = 0; s.v = Math.abs(s.v) * 0.25; }
    }
    const xEq = equilibrium(s.m, s.s);
    const settledNow = Math.abs(s.x - xEq) < 0.0003 && Math.abs(s.v) < 0.004;
    if (settledNow && !s.settled) {
      if (s.m > 0) labSound.glassClink(true);
      if (s.m >= 0.1) s.reached100 = true;
      if (s.m === 0 && s.everLoaded && s.s < 0.0005) earn('zero-keeper');
    }
    s.settled = settledNow;
    if (Math.abs(s.v) > 0.02) {
      const nowT = performance.now();
      if (nowT - s.creakAt > 130) {
        s.creakAt = nowT;
        labSound.creak(Math.min(1, 0.25 + Math.abs(s.v) * 1.2));
      }
    }
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) { s.uiAcc = 0; syncUi(); }
  }, [speed, earn, syncUi]);

  // ---- geometry --------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const cw = canvas?.clientWidth ?? 800;
    const ch = canvas?.clientHeight ?? 500;
    const totalM = NATURAL_M + 0.25 + ROD_M;
    const scale = Math.min((ch - 84) / totalM, (cw * 0.72) / 0.5);
    const springX = cw * 0.4;
    const rulerX = springX + Math.max(46, cw * 0.085);
    const springTop = 44;
    const pointer0 = springTop + NATURAL_M * scale;
    return { cw, ch, scale, springX, rulerX, springTop, pointer0 };
  }, []);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const tSec = performance.now() / 1000;
    const pointerY = g.pointer0 + s.x * g.scale;
    const pastLimit = s.m * G_TRUE > F_LIM;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // support beam + clamp
    ctx.fillStyle = '#435062';
    roundRect(ctx, g.springX - 120, 14, 240, 13, 5);
    ctx.fill();
    ctx.fillStyle = '#313d4d';
    roundRect(ctx, g.springX - 15, 22, 30, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(g.springX, 33, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // yield glow on the top coils when past the elastic limit
    if (pastLimit) {
      const pulse = 0.18 + 0.1 * Math.sin(tSec * 6);
      const glow = ctx.createRadialGradient(g.springX, g.springTop + 26, 4, g.springX, g.springTop + 26, 58);
      glow.addColorStop(0, `rgba(232,99,42,${pulse})`);
      glow.addColorStop(1, 'rgba(232,99,42,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(g.springX - 60, g.springTop - 30, 120, 120);
    }

    // ---- the mm ruler ----
    const rTop = g.pointer0 - 0.03 * g.scale;
    const rBot = g.pointer0 + 0.252 * g.scale;
    ctx.strokeStyle = '#9aa7b4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.rulerX, rTop);
    ctx.lineTo(g.rulerX, rBot);
    ctx.stroke();
    const mmStep = g.scale >= 780 ? 1 : 5;
    ctx.font = '9px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    for (let mm = -30; mm <= 252; mm += mmStep) {
      const y = g.pointer0 + (mm / 1000) * g.scale;
      if (y < rTop || y > rBot) continue;
      const long = mm % 10 === 0;
      const mid = mm % 5 === 0;
      ctx.strokeStyle = long ? '#98a4b0' : '#c0cad3';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.rulerX, y);
      ctx.lineTo(g.rulerX + (long ? 13 : mid ? 8 : 4.5), y);
      ctx.stroke();
      if (long) {
        ctx.fillStyle = '#8a96a4';
        ctx.fillText(`${mm / 10}`, g.rulerX + 17, y + 3);
      }
    }

    // zero reference line (dashed, gently alive)
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -(tSec * 9) % 11;
    ctx.strokeStyle = 'rgba(249,115,22,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.springX - 42, g.pointer0);
    ctx.lineTo(g.rulerX + 15, g.pointer0);
    ctx.stroke();
    ctx.restore();

    // zero marker triangle on the ruler
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(g.rulerX - 3, g.pointer0);
    ctx.lineTo(g.rulerX - 12, g.pointer0 - 5);
    ctx.lineTo(g.rulerX - 12, g.pointer0 + 5);
    ctx.closePath();
    ctx.fill();

    // ---- the spring ----
    const coilW = Math.min(30, w * 0.045);
    const coilColor = pastLimit ? '#b3542a' : '#7e8c9b';
    // soft shadow pass
    ctx.save();
    ctx.translate(1.5, 2);
    drawCoil(ctx, g.springX, g.springTop, pointerY, coilW, 14, 'rgba(23,35,52,0.16)');
    ctx.restore();
    drawCoil(ctx, g.springX, g.springTop, pointerY, coilW, 14, coilColor);
    // end collars
    ctx.strokeStyle = '#5d6a79';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.springX - 8, g.springTop);
    ctx.lineTo(g.springX + 8, g.springTop);
    ctx.moveTo(g.springX - 8, pointerY);
    ctx.lineTo(g.springX + 8, pointerY);
    ctx.stroke();

    // ---- hanger rod + plate ----
    const plateY = pointerY + ROD_M * g.scale;
    ctx.strokeStyle = '#6b7887';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.springX, pointerY);
    ctx.lineTo(g.springX, plateY);
    ctx.stroke();
    ctx.fillStyle = '#5d6a79';
    roundRect(ctx, g.springX - 0.035 * g.scale, plateY, 0.07 * g.scale, 5, 2);
    ctx.fill();

    // ---- slotted masses stacked on the plate ----
    const count = Math.round(s.m / (CHIP_G / 1000));
    const massH = Math.max(4, 0.011 * g.scale);
    const massW = Math.max(24, 0.05 * g.scale);
    for (let i = 0; i < count; i += 1) {
      const y = plateY - (i + 1) * massH;
      const grad = ctx.createLinearGradient(g.springX - massW / 2, y, g.springX + massW / 2, y);
      grad.addColorStop(0, '#f0d389');
      grad.addColorStop(0.5, '#d9a441');
      grad.addColorStop(1, '#9c7226');
      ctx.fillStyle = grad;
      roundRect(ctx, g.springX - massW / 2, y, massW, massH - 1.5, 2);
      ctx.fill();
      ctx.strokeStyle = '#8a6420';
      ctx.lineWidth = 1;
      ctx.stroke();
      // slot notch
      ctx.strokeStyle = 'rgba(90,64,20,0.5)';
      ctx.beginPath();
      ctx.moveTo(g.springX - 5, y + 1.5);
      ctx.lineTo(g.springX + 5, y + 1.5);
      ctx.stroke();
    }

    // ---- the pointer needle (tip reads the ruler) ----
    ctx.strokeStyle = '#172334';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.springX - 36, pointerY);
    ctx.lineTo(g.rulerX - 4, pointerY);
    ctx.stroke();
    ctx.fillStyle = '#e8632a';
    ctx.beginPath();
    ctx.moveTo(g.rulerX + 2, pointerY);
    ctx.lineTo(g.rulerX - 7, pointerY - 4.5);
    ctx.lineTo(g.rulerX - 7, pointerY + 4.5);
    ctx.closePath();
    ctx.fill();

    // settle halo at the tip when ready to record
    if (s.settled && s.m > 0) {
      const pulse = 0.35 + 0.25 * Math.sin(tSec * 3.2);
      ctx.strokeStyle = `rgba(249,115,22,${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.rulerX + 2, pointerY, 9 + Math.sin(tSec * 3.2) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- controls --------------------------------------------------------------
  const toggleChip = (i: number) => {
    const s = sim.current;
    const on = stack.includes(i);
    const next = on ? stack.filter((c) => c !== i) : [...stack, i];
    const total = next.length * CHIP_G;
    const F = (total / 1000) * G_TRUE;
    if (!on) {
      if (F > F_LIM) {
        // the spring yields: permanent set grows with the overload
        s.s += (F - F_LIM) * (1 / K_SOFT - 1 / K_TRUE);
        s.everPastLimit = true;
        labSound.warn();
        setLimitWarn(true);
        window.setTimeout(() => setLimitWarn(false), 6000);
      }
      if (stack.length === 0) {
        s.everLoaded = true;
        earn('first-load');
      }
    }
    s.m = total / 1000;
    s.settled = false;
    setStack(next);
    labSound.click();
    syncUi();
  };

  const undoChip = () => {
    if (stack.length === 0) return;
    toggleChip(stack[stack.length - 1]);
  };

  const recordRow = () => {
    const s = sim.current;
    if (!s.settled || s.m <= 0) return;
    const F = s.m * G_TRUE;
    const x = Math.round(s.x * 10000) / 10000; // 0.1 mm reading resolution
    const row: TrialRow = { id: rows.length + 1, mG: Math.round(s.m * 1000), F, x, plastic: F > F_LIM };
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded: ${row.mG} g → F = ${F.toFixed(3)} N, x = ${(x * 1000).toFixed(1)} mm`);
    if (rows.length + 1 >= 5) earn('five-points');
  };

  const resetAll = () => {
    const s = sim.current;
    s.x = 0; s.v = 0; s.m = 0; s.s = 0; s.acc = 0; s.uiAcc = 0;
    s.settled = true; s.everLoaded = false; s.everPastLimit = false; s.reached100 = false;
    setStack([]);
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setSawGraph(false);
    setBadges([]);
    syncUi();
  };

  // ---- analysis ---------------------------------------------------------------
  const fitElastic = useMemo(
    () => {
      const pts = rows.filter((r) => !r.plastic).map((r) => ({ x: r.x, y: r.F }));
      return pts.length >= 2 ? linearFit(pts) : null;
    },
    [rows],
  );
  const kEst = fitElastic && fitElastic.m > 0 ? fitElastic.m : null;
  const plasticCount = rows.length - elasticRows;

  useEffect(() => {
    if (kBadgeDone.current) return;
    if (!kEst || elasticRows < 4) return;
    if (Math.abs(kEst - K_TRUE) / K_TRUE <= 0.03) {
      kBadgeDone.current = true;
      labSound.milestone();
      pushToast('good', 'k', `Spring constant read off your graph: k = ${kEst.toFixed(1)} N/m — within 3% of the hidden value.`);
      earn('spring-constant');
    }
  }, [kEst, elasticRows, earn, pushToast]);

  // limit breaker: unloaded after yielding, permanent stretch visible
  useEffect(() => {
    const s = sim.current;
    if (s.everPastLimit && stack.length === 0 && s.s > 0.005) {
      earn('limit-breaker');
    }
  }, [stack, ui, earn]);

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (limitWarn) return { tone: 'warn', line: 'Past the elastic limit! The extension is growing faster than F = kx can explain — and this spring will not fully spring back.' };
    if (sim.current.everPastLimit && stack.length === 0 && ui.s > 0.005) return { tone: 'warn', line: `Look at the ruler: the pointer rests ${(ui.s * 1000).toFixed(0)} mm below zero. That permanent stretch is plastic deformation — the spring has a new natural length.` };
    if (!ui.settled && stack.length > 0) return { tone: 'info', line: 'Let it settle — a real spring overshoots and rings before it rests. The record button unlocks when the pointer is still.' };
    if (ui.settled && stack.length > 0 && (rows.length === 0 || rows[rows.length - 1].mG !== totalG)) return { tone: 'good', line: `Settled at ${(ui.x * 1000).toFixed(1)} mm with ${totalG} g hanging — record the pair, then change the load.` };
    if (elasticRows >= 5 && !sawGraph) return { tone: 'good', line: 'Five elastic points banked — open Observations and read k off the slope of your F–x line.' };
    if (kEst) {
      const err = ((kEst - K_TRUE) / K_TRUE) * 100;
      return { tone: Math.abs(err) <= 3 ? 'good' : 'warn', line: `Your k = ${kEst.toFixed(1)} N/m — ${Math.abs(err).toFixed(1)}% ${err >= 0 ? 'above' : 'below'} the hidden 25 N/m. More spread points sharpen the fit.` };
    }
    return { tone: 'info', line: 'Tap the 50 g chips to load the hanger — every extension is read from the zero line on the ruler.' };
  }, [limitWarn, stack.length, ui, rows, totalG, elasticRows, sawGraph, kEst]);

  // ---- status ------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Experiment complete'
    : !ui.settled && stack.length > 0 ? 'Spring settling…'
    : plasticCount > 0 ? 'Elastic limit explored'
    : rows.length ? 'Point banked — next load'
    : 'Bench ready';

  // ---- render -------------------------------------------------------------------
  const recordReady = ui.settled && stack.length > 0;
  const springState = loadF > F_LIM ? 'Yielding' : stack.length ? 'Elastic' : 'At rest';

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="Student-controlled experiment"
      legend={[
        { color: '#7e8c9b', label: 'Spring coil' },
        { color: '#d9a441', label: 'Slotted masses' },
        { color: '#e8632a', label: 'Pointer tip' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — zero noted', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      toolbarExtra={
        <label>Settle speed
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Settle playback speed">
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
          aria-label="Spring bench — pointer on a millimetre ruler; press Space to load the next 50 g mass"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              const nextIdx = Array.from({ length: MAX_CHIPS }, (_, i) => i).find((i) => !stack.includes(i));
              if (nextIdx !== undefined) toggleChip(nextIdx);
              notePointer(true);
            }
          }}
          onPointerDown={() => {
            // the bench itself has no drag gesture; a deliberate tap counts as observation
            notePointer(true);
          }}
        />
      }
      controls={
        <div>
          <div className="hooke-layout">
            <div className="chip-block" data-nudge="mass">
              <div className="chip-head">
                <span className="panel-kicker">SLOTTED MASSES · 50 g EACH</span>
                <strong>{stack.length === 0 ? 'Hanger empty' : `${totalG} g on the hanger`}</strong>
              </div>
              <div className="chip-row" role="group" aria-label="Slotted masses, tap to load or unload">
                {Array.from({ length: MAX_CHIPS }, (_, i) => {
                  const on = stack.includes(i);
                  const order = stack.indexOf(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`mass-chip${on ? ' on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${on ? 'Unload' : 'Load'} mass M${i + 1}, 50 grams`}
                      onClick={() => { toggleChip(i); notePointer(true); }}
                    >
                      <span className="chip-mass">50 g</span>
                      <span className="chip-slot">{on ? `#${order + 1}` : `M${i + 1}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="hooke-actions">
              <button
                className="action-button"
                type="button"
                onClick={() => { undoChip(); notePointer(true); }}
                disabled={stack.length === 0}
              >
                <span className="dispense-icon" aria-hidden="true">⤒</span>
                <span>Undo last chip</span>
                <small>removes the newest mass</small>
              </button>
              <div className="load-readout">
                <span>LOAD</span>
                <strong>{totalKg.toFixed(2)} <small>kg</small></strong>
                <span>F = mg</span>
                <strong>{loadF.toFixed(3)} <small>N</small></strong>
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Extension is always read from the zero line the empty pointer makes. Collect five points up to 400 g for a clean k — then, once, push past 450 g and meet the elastic limit.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRow(); notePointer(true); }}
            disabled={!recordReady}
          >
            {recordReady
              ? `✎ Record — ${totalG} g · F = ${loadF.toFixed(2)} N · x = ${(ui.x * 1000).toFixed(1)} mm`
              : stack.length === 0 ? 'Load a mass to record' : 'Waiting for the spring to settle…'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Pointer reading · extension x (live)</span>
            <strong>{(ui.x * 1000).toFixed(1)} <small>mm</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (ui.x / 0.25) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0 mm</span><span>250 mm</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Load</span><strong>{totalG} g</strong></div>
            <div><span>Force F = mg</span><strong>{loadF > 0 ? loadF.toFixed(3) : '0.000'} <small>N</small></strong></div>
            <div><span>Spring state</span><strong>{springState}</strong></div>
            <div><span>Permanent set</span><strong>{(ui.s * 1000).toFixed(1)} <small>mm</small></strong></div>
          </div>
          <div className="k-readout">
            <span>Measured spring constant (from your F–x graph)</span>
            <strong>{kEst ? <>{kEst.toFixed(1)} <small>N/m</small></> : <small style={{ fontSize: 13 }}>record 2+ elastic points to fit k</small>}</strong>
            {fitElastic && kEst && <p>From the slope of your elastic points with R² = {fitElastic.r2.toFixed(4)} over {elasticRows} point{elasticRows > 1 ? 's' : ''} · hidden value 25 N/m · error {((Math.abs(kEst - K_TRUE) / K_TRUE) * 100).toFixed(1)}%</p>}
            {plasticCount > 0 && <p className="plastic-note">{plasticCount} yielded point{plasticCount > 1 ? 's' : ''} excluded — past the elastic limit the spring softens and the line bends.</p>}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Note where the empty pointer sits on the ruler — that is your zero.</li>
              <li>Load 100 g (two chips) and watch the spring settle.</li>
              <li>Record the pair: the table banks m, F = mg and the extension x.</li>
              <li>Change the load and repeat — five points spread up to 400 g.</li>
              <li>Open Observations and read k off the slope of your F–x line.</li>
              <li>Once: load past 450 g, watch the line bend, then unload and check the zero.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Take readings only when the pointer is still, and read its tip with your eye level with the ruler. Spread your five loads evenly — clustered points make a wobbly fit.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Load the hanger and record your first force–extension pair. Five elastic points unlock the graph.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>m (g)</th><th>F (N)</th><th>x (mm)</th><th>note</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}><td>{r.id}</td><td>{r.mG}</td><td>{r.F.toFixed(3)}</td><td>{(r.x * 1000).toFixed(1)}</td><td>{r.plastic ? '⚠ past limit' : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>F–x analysis</h3>
                <Plot
                  points={rows.map((r) => ({ x: r.x, y: r.F }))}
                  xLabel="x (m)"
                  yLabel="F (N)"
                  fitLine
                  livePoint={recordReady ? { x: ui.x, y: loadF } : null}
                  height={220}
                />
                {kEst && <p className="observation-note">Slope of your elastic points = {fitElastic?.m.toFixed(1)} N/m → <strong>k = {kEst.toFixed(1)} N/m</strong> ({((Math.abs(kEst - K_TRUE) / K_TRUE) * 100).toFixed(1)}% from the hidden 25 N/m).</p>}
                {plasticCount > 0 && <p className="observation-note">⚠ The {plasticCount} yielded point{plasticCount > 1 ? 's' : ''} bend{plasticCount > 1 ? '' : 's'} the fitted line downward — that is the elastic limit breaking, not bad technique.</p>}
              </>
            )}
            <p className="observation-note">F = kx is only a law while the spring obeys it. Your straight line is the proof; the bend at the top is the boundary.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>A spring pulls back in proportion to how far it is stretched — double the load, double the extension. That proportionality is Hooke&apos;s law:</p>
            <div className="equation">F = k · x</div>
            <p>k, the spring constant, measures stiffness: a stiff spring needs many newtons per metre of stretch. Plotting force against extension turns k into a slope — which is why this experiment is fundamentally graphical. Your line&apos;s steepness <em>is</em> the physics.</p>
            <p>The proportionality has a boundary. Past the elastic limit the metal&apos;s internal structure begins to slip: extension grows faster than force (the lab&apos;s spring softens), and when you unload, the coils do not fully return. The leftover stretch — about 2 cm after one trip to 500 g here — is called permanent set or plastic deformation.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && elasticRows >= 5) setSawGraph(true); }}
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

function drawCoil(ctx: CanvasRenderingContext2D, x: number, yTop: number, yBot: number, width: number, coils: number, color: string) {
  const n = coils * 2;
  const seg = (yBot - yTop) / n;
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  for (let i = 0; i < n; i += 1) {
    const y = yTop + seg * (i + 0.5);
    const dx = (i % 2 === 0 ? 1 : -1) * (width / 2);
    ctx.lineTo(x + dx, y);
  }
  ctx.lineTo(x, yBot);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
