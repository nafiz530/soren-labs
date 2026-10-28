import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './density-archimedes.css';

/**
 * Density & Archimedes — weigh solid blocks in air and in water, catch the
 * overflow in a measuring cylinder, and verify that upthrust equals the
 * weight of displaced water. Floaters teach the floating condition.
 */

const G = 9.81;
const RHO_W = 1000;
const V_BLOCK = 100e-6; // 100 cm³ in m³

interface Material { id: string; label: string; rho: number; color1: string; color2: string; rim: string }

const MATERIALS: Material[] = [
  { id: 'brass', label: 'Brass', rho: 8500, color1: '#f6d27c', color2: '#b07d23', rim: '#8a6420' },
  { id: 'aluminium', label: 'Aluminium', rho: 2700, color1: '#eef1f4', color2: '#aeb9c4', rim: '#8a95a3' },
  { id: 'ice', label: 'Ice', rho: 920, color1: '#e8f6fd', color2: '#a9d6ea', rim: '#7fb5d0' },
  { id: 'wood', label: 'Wood', rho: 600, color1: '#e8c49a', color2: '#a4713d', rim: '#7c5426' },
];

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'weigh', title: 'Weigh the brass block', detail: 'The balance shows the block\u2019s true weight in air — note it before anything gets wet.' },
  { id: 'lower', title: 'Lower it into the water', detail: 'Hold the button to lower the block into the brim-full overflow can and watch the balance drop.' },
  { id: 'record', title: 'Record and read the cylinder', detail: 'Record the run — displaced water volume, upthrust and density are computed from your numbers.' },
  { id: 'second', title: 'Repeat with aluminium', detail: 'Switch material and repeat: weigh, lower, record. Two materials show the pattern.' },
  { id: 'verify', title: 'Verify Archimedes', detail: 'Compare upthrust (W_air − W_water) with the weight of the displaced water — they should match.' },
  { id: 'float', title: 'Try wood — watch it float', detail: 'Lower the wood block: it stops part-way, the balance reads zero, and displaced weight still equals its weight.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-weighing', title: 'First weighing', icon: '⚖', detail: 'Weighed a block in air.' },
  { id: 'two-materials', title: 'Two materials', icon: '⇄', detail: 'Recorded runs for two different materials.' },
  { id: 'archimedes', title: 'Archimedes verified', icon: '◉', detail: 'Upthrust matched the displaced water\u2019s weight within 3%.' },
  { id: 'float-philosopher', title: 'Float philosopher', icon: '✦', detail: 'Floated wood or ice and read why the balance reads zero.' },
];

interface Row { id: number; material: string; wAir: number; wWater: number; vDisp: number }

const meta = getLabBySlug('density-archimedes')!;

export default function DensityLab() {
  const sim = useRef({
    blockY: 0,        // 0 = hanging above water, 1 = fully lowered
    lowering: false,
    raising: false,
    settled: false,   // stable: submerged or floating equilibrium
    submergedFrac: 0, // 0..1 of block volume under water
    cylLevel: 0,      // ml in the measuring cylinder
    ripple: 0,
    entryPlayed: false,
    uiAcc: 0,
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [materialId, setMaterialId] = useState('brass');
  const material = MATERIALS.find((m) => m.id === materialId)!;
  const [rows, setRows] = useState<Row[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [floatNote, setFloatNote] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState({ wNow: 0, frac: 0, cyl: 0, settled: false });

  const mat = useRef(material);
  mat.current = material;

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
    const m = mat.current;
    const wAir = m.rho * V_BLOCK * G;
    const wNow = wAir - RHO_W * G * V_BLOCK * s.submergedFrac;
    setUi({ wNow, frac: s.submergedFrac, cyl: s.cylLevel, settled: s.settled });
  }, []);

  // ---- derived physics -----------------------------------------------------
  const wAir = material.rho * V_BLOCK * G;
  const floats = material.rho < RHO_W;

  const changeMaterial = (id: string) => {
    setMaterialId(id);
    const s = sim.current;
    s.blockY = 0; s.lowering = false; s.raising = false; s.settled = false;
    s.submergedFrac = 0; s.cylLevel = 0; s.ripple = 0; s.entryPlayed = false;
    setFloatNote(false);
    labSound.glassClink(true);
    syncUi();
  };

  // ---- simulation ------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const m = mat.current;
    const isFloater = m.rho < RHO_W;
    const eqFrac = m.rho / RHO_W;
    const speed = 0.55;

    if (s.lowering) s.blockY = Math.min(1, s.blockY + dt * speed);
    if (s.raising) s.blockY = Math.max(0, s.blockY - dt * speed * 1.2);

    // Geometry: block enters water once blockY passes entry point (0.35).
    const entry = 0.35;
    const travel = 0.65; // blockY 0.35..1 maps onto submersion 0..1
    const rawFrac = (s.blockY - entry) / travel;
    let frac = Math.max(0, Math.min(1, rawFrac));

    if (isFloater && s.lowering) {
      // stop lowering when equilibrium buoyancy = weight
      if (frac >= eqFrac) {
        frac = eqFrac;
        s.blockY = entry + travel * eqFrac;
        s.lowering = false;
        s.settled = true;
      }
    } else if (isFloater && frac > eqFrac) {
      frac = eqFrac; // a floater never sinks past equilibrium
    }
    if (!isFloater && s.blockY >= 1 && !s.settled) {
      s.settled = true;
    }
    if (s.raising && frac === 0) {
      s.settled = false;
      s.entryPlayed = false;
    }

    if (frac > 0 && !s.entryPlayed) {
      s.entryPlayed = true;
      labSound.thunk(false);
      s.ripple = 0.5;
    }
    s.submergedFrac = frac;
    s.cylLevel = V_BLOCK * frac * 1e6; // ml

    if (s.ripple > 0) s.ripple = Math.max(0, s.ripple - dt * 1.4);

    if (s.lowering && frac > 0 && frac < 1 && Math.random() < dt * 6) labSound.drip(true);

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) { s.uiAcc = 0; syncUi(); }
  }, [syncUi]);

  // ---- drawing ----------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const m = mat.current;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench
    ctx.strokeStyle = '#c9d2db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 22);
    ctx.lineTo(w, h - 22);
    ctx.stroke();

    const cx = w * 0.42;

    // digital balance (top)
    const bw = 150, bh = 46;
    ctx.fillStyle = '#435062';
    roundRect(ctx, cx - bw / 2, 18, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = '#e9f8ef';
    ctx.font = '700 16px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    const wAirNow = m.rho * V_BLOCK * G;
    const wNow = wAirNow - RHO_W * G * V_BLOCK * s.submergedFrac;
    ctx.fillText(`${wNow.toFixed(2)} N`, cx, 47);
    ctx.fillStyle = '#8b97a5';
    ctx.font = '8px "DM Sans", sans-serif';
    ctx.fillText('SPRING BALANCE', cx, 30);

    // hook + string to the block
    const blockSz = 74;
    const blockTopMax = 92;
    const canTop = h * 0.58;
    const blockTop = blockTopMax + (canTop - blockTopMax - blockSz * 0.9) * s.blockY;
    const blockX = cx - blockSz / 2;

    ctx.strokeStyle = '#9aa4b1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 18 + bh);
    ctx.lineTo(cx, blockTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, blockTop + 3, 4, Math.PI, 0);
    ctx.stroke();

    // the block
    const grad = ctx.createLinearGradient(blockX, blockTop, blockX + blockSz, blockTop + blockSz);
    grad.addColorStop(0, m.color1);
    grad.addColorStop(1, m.color2);
    ctx.fillStyle = grad;
    roundRect(ctx, blockX, blockTop, blockSz, blockSz, 7);
    ctx.fill();
    ctx.strokeStyle = m.rim;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath();
    ctx.arc(blockX + blockSz * 0.3, blockTop + blockSz * 0.28, 8, 0, Math.PI * 2);
    ctx.fill();

    // overflow can: brim-full; water surface at canTop
    const canW = 210, canH = h - 22 - canTop + 40;
    const canX = cx - canW / 2;
    // glass body
    ctx.fillStyle = 'rgba(214,232,240,0.55)';
    roundRect(ctx, canX, canTop, canW, canH, 8);
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2.5;
    roundRect(ctx, canX, canTop, canW, canH, 8);
    ctx.stroke();
    // water inside (level sits slightly below brim once displaced)
    const waterDrop = 4 + s.submergedFrac * 10;
    ctx.fillStyle = 'rgba(126,180,214,0.5)';
    ctx.fillRect(canX + 3, canTop + waterDrop, canW - 6, canH - waterDrop - 3);
    // water surface line + ripple
    ctx.strokeStyle = '#5e93b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canX + 3, canTop + waterDrop);
    ctx.lineTo(canX + canW - 3, canTop + waterDrop);
    ctx.stroke();
    if (s.ripple > 0) {
      ctx.strokeStyle = `rgba(94,147,184,${s.ripple})`;
      ctx.beginPath();
      ctx.ellipse(cx, canTop + waterDrop, 46 + (0.5 - s.ripple) * 90, 6 + (0.5 - s.ripple) * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // spout + measuring cylinder on the right
    const spX = canX + canW, spY = canTop + 10;
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(spX, spY);
    ctx.lineTo(spX + 34, spY);
    ctx.lineTo(spX + 34, spY + 26);
    ctx.stroke();
    const cylX = spX + 16, cylY = spY + 26, cylW = 36, cylH = 120;
    ctx.fillStyle = 'rgba(214,232,240,0.5)';
    roundRect(ctx, cylX, cylY, cylW, cylH, 5);
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    roundRect(ctx, cylX, cylY, cylW, cylH, 5);
    ctx.stroke();
    // cylinder water level
    const levelH = (s.cylLevel / 100) * (cylH - 8);
    if (levelH > 0) {
      ctx.fillStyle = 'rgba(126,180,214,0.75)';
      ctx.fillRect(cylX + 3, cylY + cylH - 3 - levelH, cylW - 6, levelH);
    }
    // ticks
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#7a8795';
    ctx.font = '8px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    for (let ml = 0; ml <= 100; ml += 20) {
      const ty = cylY + cylH - 3 - (ml / 100) * (cylH - 8);
      ctx.beginPath();
      ctx.moveTo(cylX + cylW, ty);
      ctx.lineTo(cylX + cylW + (ml % 50 === 0 ? 8 : 4), ty);
      ctx.stroke();
      if (ml % 50 === 0) ctx.fillText(`${ml}`, cylX + cylW + 10, ty + 3);
    }

    // dashed water line guide across the block for the floating case
    if (floats && s.submergedFrac > 0.02) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#5e93b8aa';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(canX + 6, canTop + waterDrop);
      ctx.lineTo(canX + canW - 6, canTop + waterDrop);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, []);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- controls -----------------------------------------------------------
  const startLower = () => { sim.current.lowering = true; sim.current.raising = false; };
  const stopLower = () => { sim.current.lowering = false; };
  const startRaise = () => { sim.current.raising = true; sim.current.lowering = false; sim.current.settled = false; };
  const stopRaise = () => { sim.current.raising = false; };

  const recordRun = () => {
    const s = sim.current;
    if (!s.settled) return;
    const wWater = wAir - RHO_W * G * V_BLOCK * s.submergedFrac;
    const row: Row = { id: rows.length + 1, material: material.label, wAir, wWater, vDisp: s.cylLevel };
    setRows((cur) => [...cur, row]);
    labSound.click();
    earn('first-weighing');
    pushToast('good', '✎', `Recorded ${material.label}: ${s.cylLevel.toFixed(0)} cm³ displaced`);
    if (rows.length >= 1) earn('two-materials');
    const up = wAir - wWater;
    const displacedW = RHO_W * G * (s.cylLevel * 1e-6);
    if (displacedW > 0 && Math.abs(up - displacedW) / displacedW <= 0.03) earn('archimedes');
    if (floats) { earn('float-philosopher'); setFloatNote(true); }
    // lift the block out for the next material
    s.raising = true; s.lowering = false;
  };

  const pushToast = (tone: 'good' | 'warn' | 'info', icon: string, msg: string) => setToast({ tone, icon, msg });

  const resetAll = () => {
    const s = sim.current;
    s.blockY = 0; s.lowering = false; s.raising = false; s.settled = false;
    s.submergedFrac = 0; s.cylLevel = 0; s.entryPlayed = false;
    setRows([]);
    setBadges([]);
    setMentorIndex(0);
    setFloatNote(false);
    syncUi();
  };

  // ---- mentor ----------------------------------------------------------------
  const materialsDone = new Set(rows.map((r) => r.material));
  const verified = rows.some((r) => {
    const up = r.wAir - r.wWater;
    const dw = RHO_W * G * (r.vDisp * 1e-6);
    return dw > 0 && Math.abs(up - dw) / dw <= 0.03;
  });
  const done = [
    rows.length >= 1 || ui.frac > 0,
    ui.frac > 0,
    rows.length >= 1,
    materialsDone.size >= 2,
    verified,
    rows.some((r) => r.material === 'Wood' || r.material === 'Ice'),
  ];
  useEffect(() => {
    const next = done.findIndex((d, i) => !d && i <= mentorIndex);
    if (next > mentorIndex) { setMentorIndex(next); labSound.step(); }
  }, [done, mentorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- nudge -------------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'weigh': return { target: 'material', gesture: 'point', title: 'Weigh in air', body: 'The spring balance already shows the block\u2019s weight in air — read the number, then lower it.' };
      case 'lower': return { target: 'submerge', gesture: 'press', title: 'Lower into water', body: 'Hold the button and watch the balance drop while water spills into the cylinder.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the run', body: 'Displacement is stable — record it to bank the numbers.' };
      case 'second': return { target: 'material', gesture: 'tap', title: 'Switch material', body: 'Choose aluminium and repeat: weigh, lower, record.' };
      case 'verify': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your table compares upthrust with the displaced water\u2019s weight — see them match.' };
      case 'float': return { target: 'material', gesture: 'tap', title: 'Try wood', body: 'Pick Wood, lower it slowly — it stops by itself and the balance reads zero.' };
      default: return null;
    }
  }, [mentorIndex]);
  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (floatNote) return { tone: 'info', line: 'The balance reads zero because the water alone is holding the block up — displaced water weight still equals the block\u2019s weight exactly.' };
    if (ui.settled && !rows.some((r) => r.material === material.label)) return { tone: 'good', line: `Stable: ${ui.cyl.toFixed(0)} cm³ displaced, balance at ${ui.wNow.toFixed(2)} N — record the run.` };
    if (ui.frac > 0 && !ui.settled) return { tone: 'info', line: `Lowering… ${ui.cyl.toFixed(0)} cm³ displaced so far. The balance falls as buoyancy grows.` };
    if (rows.length >= 1 && materialsDone.size < 2) return { tone: 'info', line: 'One material down. Switch to another — the overflow can refills itself between runs.' };
    if (verified) return { tone: 'good', line: 'Archimedes verified: the upthrust equals the weight of the displaced water in every row.' };
    return { tone: 'info', line: 'Hold the button to lower the block into the brim-full can — what spills into the cylinder is exactly what the block displaces.' };
  }, [floatNote, ui, rows, materialsDone.size, verified, material.label]);

  const statusText = done[done.length - 1] ? 'Experiment complete' : ui.frac > 0 ? 'Measuring buoyancy' : 'Experiment ready';

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={done[done.length - 1] ? 'complete' : 'ready'}
      captionChip="Student-controlled experiment"
      legend={[
        { color: material.color2, label: `${material.label} block` },
        { color: 'rgba(126,180,214,0.9)', label: 'Water' },
        { color: '#435062', label: 'Spring balance' },
      ]}
      coach={coach}
      mentor={{ steps: MENTOR_STEPS, index: mentorIndex, done }}
      toolbarExtra={
        <label>Material
          <select data-nudge="material" value={materialId} onChange={(e) => { changeMaterial(e.target.value); notePointer(true); }} aria-label="Block material">
            {MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Density bench — balance with a block above a brim-full overflow can"
          onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startLower(); window.setTimeout(stopLower, 1200); notePointer(true); } }}
        />
      }
      controls={
        <div>
          <div className="density-layout">
            <div className="density-readout">
              <span>BALANCE READING</span>
              <strong>{ui.wNow.toFixed(2)} <small>N</small></strong>
              <em>{ui.frac > 0 ? `${(ui.frac * 100).toFixed(0)}% of block submerged` : 'block hangs in air'}</em>
            </div>
            <div className="density-actions">
              <button
                className="action-button"
                type="button"
                data-nudge="submerge"
                onPointerDown={(e) => { e.preventDefault(); startLower(); notePointer(true); }}
                onPointerUp={stopLower}
                onPointerLeave={stopLower}
                onPointerCancel={stopLower}
                disabled={ui.frac >= 1 || (floats && ui.settled)}
              >
                <span className="dispense-icon" aria-hidden="true">↓</span>
                <span>{floats && ui.settled ? 'Floating' : ui.frac >= 1 ? 'Fully submerged' : 'Hold to lower'}</span>
                <small>{floats ? 'this material floats' : 'into the overflow can'}</small>
              </button>
              <button
                className="action-button"
                type="button"
                onPointerDown={(e) => { e.preventDefault(); startRaise(); }}
                onPointerUp={stopRaise}
                onPointerLeave={stopRaise}
                onPointerCancel={stopRaise}
                disabled={ui.frac <= 0}
              >
                <span className="dispense-icon" aria-hidden="true">↑</span>
                <span>Lift out</span>
                <small>hang it back in air</small>
              </button>
            </div>
          </div>
          <div className="density-stats">
            <span>{(ui.cyl).toFixed(0)} cm³</span> displaced in cylinder · upthrust {(wAir - ui.wNow).toFixed(2)} N · displaced water weighs {(RHO_W * G * ui.cyl * 1e-6).toFixed(2)} N
          </div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRun(); notePointer(true); }}
            disabled={!ui.settled}
          >
            {ui.settled ? `✎ Record ${material.label} — ${ui.cyl.toFixed(0)} cm³ displaced` : 'Record unlocks once the block settles'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Density of {material.label} (from your data)</span>
            <strong>{ui.cyl > 0.5 ? <>{((wAir / G) / (ui.cyl * 1e-6)).toFixed(0)} <small>kg/m³</small></> : <small style={{ fontSize: 13 }}>lower the block to measure</small>}</strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (ui.cyl / 100) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0 cm³</span><span>100 cm³</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Weight in air</span><strong>{wAir.toFixed(2)} N</strong></div>
            <div><span>Weight now</span><strong>{ui.wNow.toFixed(2)} N</strong></div>
            <div><span>Upthrust</span><strong>{(wAir - ui.wNow).toFixed(2)} N</strong></div>
            <div><span>Displaced volume</span><strong>{ui.cyl.toFixed(0)} cm³</strong></div>
            <div><span>True density</span><strong>{material.rho} kg/m³</strong></div>
            <div><span>Sinks or floats</span><strong>{floats ? 'Floats' : 'Sinks'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Read the block\u2019s weight in air from the balance.</li>
              <li>Hold “Lower” to sink it into the brim-full overflow can.</li>
              <li>Watch the balance fall and the cylinder fill — then record the run.</li>
              <li>Switch to another material and repeat.</li>
              <li>Try wood or ice and watch the block float to its own equilibrium.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>The overflow can is filled to the brim, so the water that spills into the cylinder is exactly the volume the block pushes aside — no more, no less.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Lower a block and record your first run — the table fills itself from your measurements.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Material</th><th>W_air</th><th>W_water</th><th>V disp</th><th>ρ</th><th>Upthrust</th><th>ρw·g·V</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const up = r.wAir - r.wWater;
                    const dw = RHO_W * G * (r.vDisp * 1e-6);
                    const rho = (r.wAir / G) / (r.vDisp * 1e-6);
                    return (
                      <tr key={r.id}>
                        <td>{r.id}</td><td>{r.material}</td>
                        <td>{r.wAir.toFixed(2)} N</td><td>{r.wWater.toFixed(2)} N</td>
                        <td>{r.vDisp.toFixed(0)} cm³</td><td>{rho.toFixed(0)}</td>
                        <td>{up.toFixed(2)} N</td><td className={Math.abs(up - dw) / Math.max(0.01, dw) <= 0.03 ? 'ok' : 'off'}>{dw.toFixed(2)} N</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="observation-note">Every row should show upthrust ≈ ρ_water·g·V — Archimedes\u2019 principle in your own numbers. Densities come from ρ = W_air / (g·V_disp): true values are brass 8500, aluminium 2700, ice 920, wood 600 kg/m³.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Water pushes up on anything immersed in it — and by a beautifully simple rule, the size of that push equals the weight of the water the object displaced:</p>
            <div className="equation">Upthrust = ρ_water · g · V_displaced</div>
            <p>That is Archimedes\u2019 principle. It also explains floating: a block less dense than water can only sink until the displaced water\u2019s weight equals its own — then the push balances the weight and it floats, with the submerged fraction exactly ρ_block/ρ_water. Wood at 600 kg/m³ rides with 60% of its volume under the surface.</p>
            <p>Density follows from two weighings: the balance in air gives W_air (so mass = W_air/g), and the cylinder gives V_displaced. Density is their quotient — which is why even a floating block measures correctly: its displaced volume is smaller, but by just the right amount.</p>
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
