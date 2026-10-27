import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './series-parallel-circuits.css';

/**
 * Series & parallel resistance — one toggle, two circuits, fourfold proof.
 *
 * The same two 10 Ω resistors are rewired between SERIES (one loop) and
 * PARALLEL (two branches) with an animated wire re-route. Bulb glows track
 * each resistor's power, needles settle onto honest meter values, and the
 * student records the combined resistance from their own V/I in both modes
 * — 20 Ω against 5 Ω, the 4× ratio the formulas predict.
 */

type Mode = 'series' | 'parallel';

const E_BAT = 6; // V — ideal battery
const R1 = 10; // Ω
const R2 = 10; // Ω
const R_SERIES = R1 + R2; // 20 Ω
const R_PARALLEL = 1 / (1 / R1 + 1 / R2); // 5 Ω
const AM_FS = 1.5; // A — ammeter full scale
const VM_FS = 8; // V — voltmeter full scale
const SWITCH_DEBOUNCE_MS = 900;

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'wire', title: 'Wire the circuit in series', detail: 'The bench opens wired in SERIES — one loop, R₁ then R₂, so the same current squeezes through both. Watch the ammeter: 0.30 A at 6 V.', hint: 'The little bulbs glow with the power each resistor is dissipating — dim in series.' },
  { id: 'record-series', title: 'Record the series resistance', detail: 'From your meters: R = V/I = 6.00 V ÷ 0.30 A. Record it — the comparison table keeps it safe.', hint: 'Combined resistance from V/I, never from the formula — that comes later.' },
  { id: 'rewire', title: 'Rewire in parallel', detail: 'Flip the big toggle: two branches side by side, each resistor wired straight across the battery. Watch the ammeter quadruple.', hint: 'The canvas re-routes the wires as you watch.' },
  { id: 'record-parallel', title: 'Record the parallel resistance', detail: 'Same drill: R = V/I, now with four times the current. Record the second row.', hint: 'Same V, 1.20 A — what does V/I say now?' },
  { id: 'compare', title: 'Compare with the formulas', detail: 'Open Observations: 20 Ω against 5 Ω — a 4× ratio, exactly what R₁+R₂ and R₁R₂/(R₁+R₂) predict. And the bulbs are four times brighter in parallel.', hint: 'Two equal resistors: series is always four times parallel.' },
];

const BADGES: BadgeDef[] = [
  { id: 'series-pro', title: 'Series pro', icon: '⛓', detail: 'Measured the series combined resistance within 2% of 20 Ω.' },
  { id: 'parallel-pro', title: 'Parallel pro', icon: '⑃', detail: 'Measured the parallel combined resistance within 2% of 5 Ω.' },
  { id: 'formula-confirmer', title: 'Formula confirmer', icon: '✓', detail: 'Both measurements within 2% of the formula predictions.' },
  { id: 'bright-idea', title: 'Bright idea', icon: '💡', detail: 'Toggled between series and parallel four or more times.' },
];

interface ModeRow { mode: Mode; I: number; V: number; R: number }

interface UiSnap { I: number; V: number; settled: boolean; rewiring: boolean }

const meta = getLabBySlug('series-parallel-circuits')!;

interface Needle { u: number; v: number }

function stepNeedle(nd: Needle, target: number, h: number) {
  const omega = 9.5;
  const zeta = 0.62;
  nd.v += (omega * omega * (target - nd.u) - 2 * zeta * omega * nd.v) * h;
  nd.u += nd.v * h;
}

const needleSettled = (nd: Needle, target: number) => Math.abs(nd.u - target) < 0.004 && Math.abs(nd.v) < 0.02;

export default function SeriesParallelLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    mode: 'series' as Mode,
    animFrom: null as Mode | null,
    animT: 1,
    acc: 0,
    uiAcc: 0,
    ndA: { u: 0, v: 0 } as Needle,
    ndV: { u: 0, v: 0 } as Needle,
    flow: 0,
    dirty: true,
    settled: false,
    lastSwitchAt: 0,
    glow: 0, // bulb brightness 0..1 (power-normalised)
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [mode, setMode] = useState<Mode>('series');
  const [modeToggles, setModeToggles] = useState(0);
  const [rows, setRows] = useState<ModeRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [sawGraph, setSawGraph] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ I: 0, V: 0, settled: false, rewiring: false });

  const confirmDone = useRef(false);

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
    setUi({ I: s.ndA.u * AM_FS, V: s.ndV.u * VM_FS, settled: s.settled, rewiring: s.animFrom !== null });
  }, []);

  // ---- mentor completion flags -------------------------------------------
  const seriesRow = rows.find((r) => r.mode === 'series') ?? null;
  const parallelRow = rows.find((r) => r.mode === 'parallel') ?? null;
  const done = [
    mentorAcked || !!seriesRow,
    !!seriesRow,
    mode === 'parallel',
    !!parallelRow,
    sawGraph && !!seriesRow && !!parallelRow,
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
      case 'wire': return { target: 'scene', gesture: 'point', title: 'Read the series meters', body: 'One loop, two resistors in a line. The ammeter reads 0.30 A and the voltmeter 6.00 V — that pair is your series measurement.' };
      case 'record-series': return { target: 'record', gesture: 'press', title: 'Record series R', body: 'Press “Record” — the table stores R from your own V/I: 6.00 ÷ 0.30.' };
      case 'rewire': return { target: 'mode', gesture: 'press', title: 'Flip to parallel', body: 'Press the PARALLEL half of the big toggle — the wires re-route and the current quadruples.' };
      case 'record-parallel': return { target: 'record', gesture: 'press', title: 'Record parallel R', body: 'Needles settled on 1.20 A? Record the second row — R from V/I again.' };
      case 'compare': return { target: 'observations', gesture: 'tap', title: 'Compare with formulas', body: 'Open Observations: your two measured rows sit next to the formula predictions — check the 4× ratio.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics -------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    if (s.animFrom !== null) {
      s.animT += dt / 0.45;
      if (s.animT >= 1) { s.animT = 1; s.animFrom = null; }
    }
    const It = s.mode === 'series' ? E_BAT / R_SERIES : E_BAT / R_PARALLEL;
    const Vt = E_BAT;
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
      labSound.ping(760, 0.08);
    }
    s.settled = st;
    const glowTarget = s.mode === 'series' ? (It * It * R1) / 3.6 : (Vt * Vt / R1) / 3.6;
    s.glow += (glowTarget - s.glow) * Math.min(1, dt * 4);
    s.flow += dt * 100;
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) { s.uiAcc = 0; syncUi(); }
  }, [syncUi]);

  // ---- geometry --------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const cw = canvas?.clientWidth ?? 800;
    const ch = canvas?.clientHeight ?? 500;
    const L = Math.max(72, cw * 0.16);
    const Rt = cw - Math.max(56, cw * 0.09);
    const T = Math.max(62, ch * 0.17);
    const B = ch - Math.max(60, ch * 0.15);
    const NA = L + (Rt - L) * 0.24;
    const NB = Rt - (Rt - L) * 0.24;
    const resLen = (NB - NA) * 0.34;
    const inset = (NB - NA) * 0.33;
    const MY = T + (B - T) * 0.42;
    const meterR = Math.max(14, Math.min(20, (Rt - L) * 0.045));
    const batCy = (T + B) / 2;
    const pitch = Math.max(18, Math.min(30, (B - T) * 0.105));
    const batHalf = (4 * pitch) / 2 + pitch * 0.3;
    const amX = (L + Rt) / 2;
    const volCx = Math.max(L - 56, 26);
    const volCy = batCy;
    const bulbR = Math.max(8, Math.min(10.5, (Rt - L) * 0.022));
    return { cw, ch, L, Rt, T, B, NA, NB, resLen, inset, MY, meterR, batCy, pitch, batHalf, amX, volCx, volCy, bulbR };
  }, []);

  // ---- drawing ---------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const tSec = performance.now() / 1000;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (s.animFrom !== null && s.animT < 1) {
      drawLayout(ctx, g, s.animFrom, 1 - s.animT, s.glow, s.flow, tSec);
      drawLayout(ctx, g, s.mode, s.animT, s.glow, s.flow, tSec);
    } else {
      drawLayout(ctx, g, s.mode, 1, s.glow, s.flow, tSec);
    }

    // meters and voltmeter branch are mode-independent — always full strength
    drawVoltmeterBranch(ctx, g);
    drawMeter(ctx, g.amX, g.B, g.meterR, 'A', s.ndA.u);
    drawMeter(ctx, g.volCx, g.volCy, g.meterR, 'V', s.ndV.u);

    // settle halo on the ammeter when a fresh reading is ready
    if (s.settled && s.animFrom === null) {
      const pulse = 0.3 + 0.2 * Math.sin(tSec * 3);
      ctx.strokeStyle = `rgba(249,115,22,${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.amX, g.B, g.meterR + 6 + Math.sin(tSec * 3) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- controls --------------------------------------------------------------
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    const s = sim.current;
    s.animFrom = mode;
    s.animT = 0;
    s.mode = next;
    s.lastSwitchAt = performance.now();
    s.dirty = true;
    labSound.click();
    setMode(next);
    setModeToggles((n) => n + 1);
    notePointer(true);
  };

  useEffect(() => {
    if (modeToggles >= 4) earn('bright-idea');
  }, [modeToggles, earn]);

  const recordReading = () => {
    const s = sim.current;
    const nowT = performance.now();
    if (nowT - s.lastSwitchAt < SWITCH_DEBOUNCE_MS || !s.settled) {
      labSound.warn();
      pushToast('warn', '⚠', 'Hold on — let the meters settle after the re-wire before you record.');
      return;
    }
    const I = Math.round(ui.I * 1000) / 1000;
    const V = Math.round(ui.V * 100) / 100;
    const row: ModeRow = { mode, I, V, R: V / I };
    setRows((cur) => [...cur.filter((r) => r.mode !== mode), row]);
    labSound.click();
    pushToast('good', '✎', `Recorded ${mode}: I = ${I.toFixed(3)} A, V = ${V.toFixed(2)} V → R = ${(V / I).toFixed(1)} Ω from your own V/I.`);
  };

  const resetAll = () => {
    const s = sim.current;
    s.mode = 'series'; s.animFrom = null; s.animT = 1;
    s.acc = 0; s.uiAcc = 0;
    s.ndA = { u: 0, v: 0 }; s.ndV = { u: 0, v: 0 };
    s.flow = 0; s.dirty = true; s.settled = false;
    s.lastSwitchAt = 0; s.glow = 0;
    setMode('series');
    setModeToggles(0);
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setSawGraph(false);
    setBadges([]);
    syncUi();
  };

  // ---- badge checks ------------------------------------------------------------
  useEffect(() => {
    if (seriesRow && Math.abs(seriesRow.R - R_SERIES) / R_SERIES <= 0.02) earn('series-pro');
    if (parallelRow && Math.abs(parallelRow.R - R_PARALLEL) / R_PARALLEL <= 0.02) earn('parallel-pro');
    if (
      !confirmDone.current &&
      seriesRow && parallelRow &&
      Math.abs(seriesRow.R - R_SERIES) / R_SERIES <= 0.02 &&
      Math.abs(parallelRow.R - R_PARALLEL) / R_PARALLEL <= 0.02
    ) {
      confirmDone.current = true;
      labSound.milestone();
      pushToast('good', '✓', `Formulas confirmed: ${seriesRow.R.toFixed(1)} Ω series vs ${parallelRow.R.toFixed(1)} Ω parallel — the 4× ratio, measured by your own meters.`);
      earn('formula-confirmer');
    }
  }, [seriesRow, parallelRow, earn, pushToast]);

  // ---- coach --------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.rewiring) return { tone: 'info', line: 'Re-wiring — the branches are re-routing themselves while the old layout fades.' };
    if (!ui.settled) return { tone: 'info', line: 'The needles are catching up with the new current — wait for stillness before recording.' };
    if (mode === 'series' && !seriesRow) return { tone: 'good', line: `Series: I = ${ui.I.toFixed(2)} A and V = ${ui.V.toFixed(2)} V — your meters say R = V/I = ${(ui.V / Math.max(ui.I, 1e-6)).toFixed(1)} Ω. Record it.` };
    if (mode === 'parallel' && !parallelRow) return { tone: 'good', line: `Parallel: the same ${ui.V.toFixed(2)} V but I = ${ui.I.toFixed(2)} A — four times the current. Record R from V/I and compare.` };
    if (seriesRow && parallelRow && !sawGraph) return { tone: 'good', line: 'Both modes banked — open Observations and put your two rows next to the formula predictions.' };
    if (seriesRow && parallelRow) {
      const ratio = seriesRow.R / parallelRow.R;
      return { tone: 'good', line: `${seriesRow.R.toFixed(1)} Ω against ${parallelRow.R.toFixed(1)} Ω — a ${ratio.toFixed(1)}× ratio, exactly as R₁+R₂ and R₁R₂/(R₁+R₂) predict. The bulbs glow four times brighter in parallel too.` };
    }
    return { tone: 'info', line: 'Start in series: one loop, two resistors in line. Read the meters, record, then flip the wiring and watch everything change.' };
  }, [ui, mode, seriesRow, parallelRow, sawGraph]);

  // ---- status ------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete ? 'Experiment complete'
    : ui.rewiring ? 'Re-wiring…'
    : !ui.settled ? 'Meters settling'
    : seriesRow && parallelRow ? 'Both modes recorded'
    : 'Experiment ready';

  // ---- render -------------------------------------------------------------------
  const liveR = ui.I > 0.001 ? ui.V / ui.I : null;
  const bulbP = mode === 'series' ? ui.I * ui.I * R1 : (ui.V * ui.V) / R1;
  const totalP = mode === 'series' ? ui.I * ui.I * R_SERIES : (ui.V * ui.V) / R_PARALLEL;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : 'ready'}
      captionChip="One toggle — two circuits"
      legend={[
        { color: '#172334', label: 'Wires' },
        { color: '#f97316', label: 'Current flow' },
        { color: '#ffd98a', label: 'Bulb glow ∝ power' },
        { color: '#d9a441', label: 'Battery cells' },
      ]}
      coach={coach}
      mentor={{
        steps: MENTOR_STEPS,
        index: mentorIndex,
        done,
        ack: mentorIndex === 0 && !mentorAcked
          ? { label: 'Got it — read the meters', onClick: () => setMentorAcked(true) }
          : undefined,
      }}
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label={`Circuit bench wired in ${mode} — press Space to toggle between series and parallel`}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              switchMode(mode === 'series' ? 'parallel' : 'series');
            }
          }}
          onPointerDown={() => {
            // no drag gesture here: taps are looks, not actions
            notePointer(false);
          }}
        />
      }
      controls={
        <div>
          <div className="mode-toggle" data-nudge="mode" role="group" aria-label="Wiring mode">
            <button
              type="button"
              className={`seg${mode === 'series' ? ' on' : ''}`}
              aria-pressed={mode === 'series'}
              onClick={() => switchMode('series')}
            >
              <span className="seg-title">SERIES</span>
              <span className="seg-sub">R₁ then R₂ in one loop</span>
            </button>
            <button
              type="button"
              className={`seg${mode === 'parallel' ? ' on' : ''}`}
              aria-pressed={mode === 'parallel'}
              onClick={() => switchMode('parallel')}
            >
              <span className="seg-title">PARALLEL</span>
              <span className="seg-sub">two branches side by side</span>
            </button>
          </div>
          <div className="sp-live-row">
            <div className="sp-live"><span>AMMETER</span><strong>{ui.I.toFixed(2)}<small>A</small></strong></div>
            <div className="sp-live"><span>VOLTMETER</span><strong>{ui.V.toFixed(2)}<small>V</small></strong></div>
            <div className="sp-live"><span>COMBINED R = V/I</span><strong>{liveR ? liveR.toFixed(1) : '—'}<small>Ω</small></strong></div>
            <div className="sp-live"><span>WIRING</span><strong className="sp-mode">{mode}</strong></div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>The combined-R readout is computed from <em>your</em> measured V and I, never from the formula. Record in both wirings — then let the comparison table settle the argument.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordReading(); notePointer(true); }}
          >
            {ui.settled && !ui.rewiring
              ? `✎ Record ${mode} — I = ${ui.I.toFixed(2)} A · V = ${ui.V.toFixed(2)} V → R = ${(ui.V / Math.max(ui.I, 1e-6)).toFixed(1)} Ω`
              : 'Meters settling after the re-wire…'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Meter panel</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Current I (live)</span>
            <strong>{ui.I.toFixed(2)} <small>A</small></strong>
            <div className="reading-track"><span style={{ width: `${Math.min(100, (ui.I / AM_FS) * 100)}%` }} /></div>
            <div className="reading-scale"><span>0 A</span><span>{AM_FS} A</span></div>
          </div>
          <div className="reading-grid">
            <div><span>V across network</span><strong>{ui.V.toFixed(2)} <small>V</small></strong></div>
            <div><span>Combined R = V/I</span><strong>{liveR ? liveR.toFixed(1) : '—'} <small>Ω</small></strong></div>
            <div><span>Each bulb power</span><strong>{bulbP.toFixed(2)} <small>W</small></strong></div>
            <div><span>Total power</span><strong>{totalP.toFixed(2)} <small>W</small></strong></div>
          </div>
          <div className="r-readout">
            <span>Combined resistance (from your meters)</span>
            <strong>{liveR ? <>{liveR.toFixed(1)} <small>Ω</small></> : <small style={{ fontSize: 13 }}>waiting for the needles…</small>}</strong>
            <p>Formula prediction: series R₁ + R₂ = {R_SERIES} Ω · parallel R₁R₂/(R₁+R₂) = {R_PARALLEL} Ω. Your readout is V/I — the formula never touches it.</p>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Start in SERIES. Let the needles settle and read I and V.</li>
              <li>Record the series row — R comes from your own V/I.</li>
              <li>Flip the toggle to PARALLEL and watch the wires re-route.</li>
              <li>Record the parallel row the same way.</li>
              <li>Open Observations and compare both rows with the formulas — the 4× ratio.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>After every re-wire, give the needles a moment — the record guard will warn you if you rush. Watch the bulbs as you flip: brightness is power, and power quadruples in parallel.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Combined resistance — measured vs formula</h3>
            {!seriesRow && !parallelRow ? (
              <p className="observation-note">Record the combined resistance in both wirings — the comparison table builds itself from your meters.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>Wiring</th><th>I (A)</th><th>V (V)</th><th>R measured = V/I</th><th>R formula</th><th>Δ</th></tr></thead>
                <tbody>
                  {seriesRow && (
                    <tr>
                      <td>Series</td>
                      <td>{seriesRow.I.toFixed(3)}</td>
                      <td>{seriesRow.V.toFixed(2)}</td>
                      <td>{seriesRow.R.toFixed(1)} Ω</td>
                      <td>{R_SERIES} Ω</td>
                      <td>{(((seriesRow.R - R_SERIES) / R_SERIES) * 100).toFixed(1)}%</td>
                    </tr>
                  )}
                  {parallelRow && (
                    <tr>
                      <td>Parallel</td>
                      <td>{parallelRow.I.toFixed(3)}</td>
                      <td>{parallelRow.V.toFixed(2)}</td>
                      <td>{parallelRow.R.toFixed(1)} Ω</td>
                      <td>{R_PARALLEL} Ω</td>
                      <td>{(((parallelRow.R - R_PARALLEL) / R_PARALLEL) * 100).toFixed(1)}%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {seriesRow && parallelRow && (
              <p className="observation-note">
                Ratio R<sub>series</sub> / R<sub>parallel</sub> = <strong>{(seriesRow.R / parallelRow.R).toFixed(2)}×</strong> — two equal resistors in series are four times their parallel combination.
                Current quadrupled for the same voltage; total power went from {(seriesRow.I * seriesRow.I * R_SERIES).toFixed(1)} W to {((parallelRow.V * parallelRow.V) / R_PARALLEL).toFixed(1)} W — which is why the bulbs blaze in parallel.
              </p>
            )}
            <p className="observation-note">Every number in the measured column came from dividing your voltmeter reading by your ammeter reading. The formulas only got to comment afterwards.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>In series, the current has no choice: it flows through R₁ then R₂, and the resistances simply add. In parallel, the current splits — each resistor is wired straight across the battery, so each carries its own full current, and the combined resistance is smaller than either single resistor:</p>
            <div className="equation">Series: R = R₁ + R₂ = 20 Ω</div>
            <div className="equation">Parallel: 1/R = 1/R₁ + 1/R₂ → R = 5 Ω</div>
            <p>With two equal 10 Ω resistors the ratio is exactly 4 — and the meters agree: 6 V pushes 0.30 A through 20 Ω but 1.20 A through 5 Ω. Power tells the brighter story. Each bulb glows with the power dissipated by its resistor: in series each gets P = I²R = 0.9 W; in parallel each gets the full P = V²/R = 3.6 W. Four times the glow, from the same battery.</p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={(t) => { if (t === 'observations' && seriesRow && parallelRow) setSawGraph(true); }}
    />
  );
}

// ---- layout drawing (per wiring mode, crossfaded during a re-route) ---------

interface Geom {
  L: number; Rt: number; T: number; B: number; NA: number; NB: number;
  resLen: number; inset: number; MY: number; meterR: number;
  batCy: number; pitch: number; batHalf: number; amX: number; bulbR: number;
}

function drawLayout(ctx: CanvasRenderingContext2D, g: Geom, mode: Mode, alpha: number, glow: number, flow: number, tSec: number) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const wire = '#172334';
  const batTop = g.batCy - g.batHalf;
  const batBot = g.batCy + g.batHalf;
  const rA = g.meterR;

  // ---- base wires ----
  ctx.strokeStyle = wire;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(g.L, batTop);
  ctx.lineTo(g.L, g.T);
  ctx.lineTo(g.Rt, g.T);
  ctx.lineTo(g.Rt, g.B);
  ctx.lineTo(g.L, g.B);
  ctx.lineTo(g.L, batBot);
  ctx.stroke();

  const I = mode === 'series' ? E_BAT / R_SERIES : E_BAT / R_PARALLEL;

  if (mode === 'series') {
    const r1x1 = g.NA;
    const r1x2 = g.NA + g.resLen;
    const r2x1 = g.NB - g.resLen;
    const r2x2 = g.NB;
    // moving current dashes (single loop)
    const segs: [number, number, number, number][] = [
      [g.L, batTop, g.L, g.T],
      [g.L, g.T, r1x1, g.T],
      [r1x2, g.T, r2x1, g.T],
      [r2x2, g.T, g.Rt, g.T],
      [g.Rt, g.T, g.Rt, g.B],
      [g.Rt, g.B, g.amX - rA, g.B],
      [g.amX + rA, g.B, g.L, g.B],
      [g.L, g.B, g.L, batBot],
    ];
    drawCurrent(ctx, segs, flow, (26 + I * 170) / 100);
    // resistors
    drawResistor(ctx, r1x1, r1x2, g.T, Math.max(6, g.meterR * 0.5));
    drawResistor(ctx, r2x1, r2x2, g.T, Math.max(6, g.meterR * 0.5));
    // bulbs above each resistor
    drawBulb(ctx, (r1x1 + r1x2) / 2, g.T - 30, g.bulbR, glow, tSec, -1);
    drawBulb(ctx, (r2x1 + r2x2) / 2, g.T - 30, g.bulbR, glow, tSec, -1);
  } else {
    const r1x1 = g.NA + g.inset;
    const r1x2 = g.NB - g.inset;
    const r2x1 = g.NA + g.inset;
    const r2x2 = g.NB - g.inset;
    // branch wires
    ctx.strokeStyle = wire;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(g.NA, g.T);
    ctx.lineTo(g.NA, g.MY);
    ctx.lineTo(g.NB, g.MY);
    ctx.lineTo(g.NB, g.T);
    ctx.stroke();
    // junction dots
    ctx.fillStyle = wire;
    for (const [jx, jy] of [[g.NA, g.T], [g.NB, g.T], [g.NA, g.MY], [g.NB, g.MY]] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(jx, jy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // moving current dashes: main loop at I, branches at I/2
    const mainSegs: [number, number, number, number][] = [
      [g.L, batTop, g.L, g.T],
      [g.L, g.T, g.NA, g.T],
      [g.NB, g.T, g.Rt, g.T],
      [g.Rt, g.T, g.Rt, g.B],
      [g.Rt, g.B, g.amX - rA, g.B],
      [g.amX + rA, g.B, g.L, g.B],
      [g.L, g.B, g.L, batBot],
    ];
    const branchSegs: [number, number, number, number][] = [
      [g.NA, g.T, g.NA, g.MY],
      [g.NA, g.MY, r2x1, g.MY],
      [r2x2, g.MY, g.NB, g.MY],
      [g.NB, g.MY, g.NB, g.T],
      [g.NA, g.T, r1x1, g.T],
      [r1x2, g.T, g.NB, g.T],
    ];
    drawCurrent(ctx, mainSegs, flow, (26 + I * 170) / 100);
    drawCurrent(ctx, branchSegs, flow, (26 + (I / 2) * 170) / 100);
    // resistors
    drawResistor(ctx, r1x1, r1x2, g.T, Math.max(6, g.meterR * 0.5));
    drawResistor(ctx, r2x1, r2x2, g.MY, Math.max(6, g.meterR * 0.5));
    // bulbs: one above the top branch, one below the mid branch
    drawBulb(ctx, (r1x1 + r1x2) / 2, g.T - 30, g.bulbR, glow, tSec, -1);
    drawBulb(ctx, (r2x1 + r2x2) / 2, g.MY + 30, g.bulbR, glow, tSec, 1);
  }

  // ---- battery (4 cells = 6 V) ----
  for (let i = 0; i < 4; i += 1) {
    const yLong = batTop + g.pitch * 0.3 + i * g.pitch;
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(g.L - g.pitch * 0.5, yLong);
    ctx.lineTo(g.L + g.pitch * 0.5, yLong);
    ctx.stroke();
    ctx.strokeStyle = wire;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(g.L - g.pitch * 0.24, yLong + g.pitch * 0.34);
    ctx.lineTo(g.L + g.pitch * 0.24, yLong + g.pitch * 0.34);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCurrent(ctx: CanvasRenderingContext2D, segs: [number, number, number, number][], flow: number, factor: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(249,115,22,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 10]);
  let travelled = 0;
  for (const [x1, y1, x2, y2] of segs) {
    ctx.lineDashOffset = -(flow * factor + travelled);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    travelled += Math.hypot(x2 - x1, y2 - y1);
  }
  ctx.restore();
}

function drawResistor(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, amp: number) {
  ctx.strokeStyle = '#172334';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const lead = 10;
  const span = x2 - x1 - 2 * lead;
  if (span <= 4) {
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
  } else {
    const step = span / 12;
    ctx.moveTo(x1, y);
    ctx.lineTo(x1 + lead, y);
    let up = true;
    for (let i = 0; i < 12; i += 1) {
      ctx.lineTo(x1 + lead + step * (i + 1), y + (up ? -amp : amp));
      up = !up;
    }
    ctx.lineTo(x2 - lead, y);
    ctx.lineTo(x2, y);
  }
  ctx.stroke();
}

function drawBulb(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, glow: number, tSec: number, dir: number) {
  // indicator stub to the wire (thin dashed — an indicator, not a circuit path)
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#b6c1cc';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - dir * (r + 3));
  ctx.lineTo(cx, cy - dir * (r + 14));
  ctx.stroke();
  ctx.restore();
  // glow halo ∝ power
  const haloR = r + 8 + glow * 16 + Math.sin(tSec * 2.4 + cx) * glow * 2;
  const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, haloR);
  halo.addColorStop(0, `rgba(255,205,112,${0.1 + glow * 0.6})`);
  halo.addColorStop(1, 'rgba(255,205,112,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();
  // glass
  ctx.fillStyle = `rgba(255,244,220,${0.28 + glow * 0.5})`;
  ctx.strokeStyle = '#8a96a4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // filament
  ctx.strokeStyle = `rgba(${Math.round(168 + 87 * glow)},${Math.round(84 + 130 * glow)},${Math.round(40 + 160 * glow)},1)`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.45, cy);
  ctx.lineTo(cx - r * 0.15, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.15, cy + r * 0.3);
  ctx.lineTo(cx + r * 0.45, cy);
  ctx.stroke();
}

function drawVoltmeterBranch(ctx: CanvasRenderingContext2D, g: Geom & { volCx: number; volCy: number }) {
  const wire = '#172334';
  const batTop = g.batCy - g.batHalf;
  const batBot = g.batCy + g.batHalf;
  const yTap1 = batTop - 16;
  const yTap2 = batBot + 16;
  ctx.strokeStyle = wire;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.L, yTap1);
  ctx.lineTo(g.volCx, yTap1);
  ctx.lineTo(g.volCx, g.volCy - g.meterR);
  ctx.moveTo(g.L, yTap2);
  ctx.lineTo(g.volCx, yTap2);
  ctx.lineTo(g.volCx, g.volCy + g.meterR);
  ctx.stroke();
  ctx.fillStyle = wire;
  for (const [dx, dy] of [[g.L, yTap1], [g.L, yTap2]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMeter(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, letter: string, u: number) {
  ctx.fillStyle = '#fdfefe';
  ctx.strokeStyle = '#172334';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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
  ctx.fillStyle = '#172334';
  ctx.font = `800 ${Math.max(10, r * 0.85)}px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy + r * 0.72);
  ctx.textBaseline = 'alphabetic';
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
