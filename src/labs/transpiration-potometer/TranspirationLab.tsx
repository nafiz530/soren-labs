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
import './transpiration-potometer.css';

/**
 * Transpiration — the bubble potometer (Biology, Master, Experiment 031).
 *
 * The student cuts a leafy shoot under water, seats it through a rubber bung
 * sealed with vaseline, charges an air bubble to zero with the reservoir tap,
 * and then races that bubble along a capillary tube while fan, mist, lamp and
 * temperature are varied one run at a time. Rates are honest: still bright air
 * at 12 leaves runs ≈ 2.0 mm/min and every factor multiplies, with a ±6%
 * living wobble so recorded numbers never repeat exactly.
 */

type FanMode = 'off' | 'gentle' | 'strong';

interface RunRow {
  id: number;
  label: string;
  leaves: number;
  minutes: number;
  pos: number;
  rate: number;
  dirty: boolean;
  fan: FanMode;
  lamp: boolean;
  mist: boolean;
  temp: number;
  trace: { t: number; p: number }[];
}

interface UiSnap {
  pos: number;
  simMin: number;
  rate: number;
  running: boolean;
  charged: boolean;
  cutDone: boolean;
  airLock: boolean;
  bungSeated: boolean;
  sealed: boolean;
  endHit: boolean;
  trace: { t: number; p: number }[];
}

interface Droplet { x: number; y: number; vx: number; vy: number; life: number; r: number }
interface LeakBubble { x: number; y: number; vy: number; ph: number }
interface FallDrop { x: number; y: number; vy: number }

const CAPILLARY_MM = 100;
const BASE_RATE = 2.0; // mm/min at 12 leaves, still air, bright light, 20 °C
const FAN_FACTOR: Record<FanMode, number> = { off: 1, gentle: 1.8, strong: 2.8 };
const MIST_FACTOR = 0.45;
const DARK_FACTOR = 0.12;
const WARM_FACTOR = 1.6;
const LEAK_BIAS = 0.15; // mm/min of false reading when the vaseline seal is skipped
const SIM_MIN_PER_SEC = 0.5; // 1 simulated minute ≈ 2 s of real time at 1×
const SMEAR_ENOUGH = 0.55;
const RUN_COLORS = ['#f97316', '#3b82f6', '#0f9d76', '#8b5cf6', '#d9a441', '#d4629a'];

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'cut',
    title: 'Cut the shoot under water',
    detail: 'Drag the scissors sideways through the stem while it stands in the trough of water — an underwater cut keeps the water column unbroken. The quick-cut button cuts dry and lets an air lock in.',
    hint: 'Try the tempting “Quick cut on the bench” once — you will meet the air lock it causes and learn to flush it. The clean habit is cutting submerged.',
  },
  {
    id: 'seat',
    title: 'Seat the bung and seal it',
    detail: 'Drag the rubber bung down into the reservoir mouth, then smear vaseline from the jar around the joint with a slow drag. A skipped seal leaks and biases readings.',
    hint: 'Vaseline fills the tiny gaps where air sneaks in — without it every rate reads about 0.15 mm/min too fast.',
  },
  {
    id: 'baseline',
    title: 'Charge a still-air baseline',
    detail: 'Press the tap to send the bubble to zero and start the clock. Keep still air, bright light and 20 °C, let at least one simulated minute pass, then record the run.',
    hint: 'Change exactly one condition per run — that is what makes the comparison honest.',
  },
  {
    id: 'fan',
    title: 'Strong-fan run',
    detail: 'Switch the desk fan to strong, press the tap to charge a fresh bubble, and record again. Watch the bubble race past your baseline.',
    hint: 'Moving air sweeps the humid blanket away from the leaves, so evaporation speeds up.',
  },
  {
    id: 'mist',
    title: 'Mist brake',
    detail: 'Spray a mist around the shoot, charge the bubble and record. Humid air slows evaporation — the bubble should crawl.',
    hint: 'Compare the mist run against your still-air baseline at the same leaf count.',
  },
  {
    id: 'dark',
    title: 'Dark control and conclusion',
    detail: 'Turn the lamp off for the dim-room control, record it, then open Observations and answer the conclusion card: what increases the rate of transpiration?',
    hint: 'Stomata mostly close in dim light, so the rate collapses — that is your control run.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'clean-cut', title: 'Clean cut', icon: '✂', detail: 'Cut the shoot under water on the first try — no air lock.' },
  { id: 'sealed-run', title: 'Sealed and running', icon: '◉', detail: 'Sealed the bung with vaseline and recorded a real run.' },
  { id: 'wind-racer', title: 'Wind racer', icon: '💨', detail: 'Recorded a strong-fan run at least twice the still-air baseline.' },
  { id: 'humidity-brake', title: 'Humidity brake', icon: '💧', detail: 'Recorded a mist run at 0.6× the baseline or slower.' },
  { id: 'rate-table', title: 'Rate table', icon: '📋', detail: 'Recorded five or more runs across different conditions.' },
];

const CONCLUSION_OPTIONS = [
  { id: 'air', label: 'Moving air (fan on)', correct: true },
  { id: 'light', label: 'Bright light', correct: true },
  { id: 'warm', label: 'Warmth (30 °C)', correct: true },
  { id: 'leaves', label: 'More leaves on the shoot', correct: true },
  { id: 'mist', label: 'Misting the shoot', correct: false },
  { id: 'dim', label: 'A dim room', correct: false },
];

const meta = getLabBySlug('transpiration-potometer')!;

export default function TranspirationLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    // setup state
    cutDone: false,
    dryCut: false,
    airLock: false,
    cutDrag: false,
    cutPrevX: 0,
    cutX: 0,
    cutY: 0,
    cutClean: true,
    bungSeated: false,
    bungDrag: false,
    bungY: -1, // resolved during first draw via geom()
    smear: 0,
    smearDrag: false,
    sealed: false,
    setupAnim: 0,
    flushT: 0,
    // run state
    charged: false,
    running: false,
    simMin: 0,
    pos: 0,
    rateNow: 0,
    rateSmooth: 0,
    hist: [] as { m: number; p: number }[],
    trace: [] as { t: number; p: number }[],
    lastSample: 0,
    lastTrace: 0,
    ph1: Math.random() * 6.28,
    ph2: Math.random() * 6.28,
    endHit: false,
    pendingEnd: false,
    conditionDirty: false,
    // ambient animation
    t: 0,
    fanAngle: 0,
    fanSpin: 0,
    mistAcc: 0,
    dripAcc: 0,
    mistDrops: [] as Droplet[],
    leakBubbles: [] as LeakBubble[],
    fallDrops: [] as FallDrop[],
    creakAt: 0,
    uiAcc: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls -----------------------------------------------------
  const [fan, setFan] = useState<FanMode>('off');
  const [mistOn, setMistOn] = useState(false);
  const [lamp, setLamp] = useState(true);
  const [temp, setTemp] = useState(20);
  const [leaves, setLeaves] = useState(12);
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [conclusionOk, setConclusionOk] = useState(false);
  const [sawObs, setSawObs] = useState(false);
  const [ui, setUi] = useState<UiSnap>({
    pos: 0, simMin: 0, rate: 0, running: false, charged: false,
    cutDone: false, airLock: false, bungSeated: false, sealed: false,
    endHit: false, trace: [],
  });

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
    setUi({
      pos: s.pos, simMin: s.simMin, rate: s.rateSmooth, running: s.running,
      charged: s.charged, cutDone: s.cutDone, airLock: s.airLock,
      bungSeated: s.bungSeated, sealed: s.sealed, endHit: s.endHit,
      trace: s.trace.slice(),
    });
  }, []);

  // ---- shared bench geometry (canvas CSS pixels) -----------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const cw = canvas?.clientWidth ?? 900;
    const ch = canvas?.clientHeight ?? 520;
    const k = clamp((cw - 330) / 520, 0.62, 1);
    const benchY = ch - 54;
    const resW = 78 * k + 10;
    const resH = 116 * k + 8;
    const resX = clamp(cw * 0.3, 128, Math.max(210, cw - 330));
    const resTop = benchY - resH;
    const waterY = resTop + resH * 0.3;
    const stemTop = resTop - 148 * k - 12;
    const tubeY = benchY - 40;
    const tubeX0 = resX + resW / 2 - 2;
    const tubeX1 = cw - 46;
    const tubeLen = Math.max(110, tubeX1 - tubeX0);
    const mmX = (mm: number) => tubeX0 + (clamp(mm, 0, CAPILLARY_MM) / CAPILLARY_MM) * tubeLen;
    const fanX = Math.max(64 * k + 12, Math.min(cw * 0.12, resX - 175));
    const fanY = benchY - 92 * k;
    const tapX = resX - resW / 2 - 14 * k;
    const tapY = tubeY - 8;
    const troughW = 118 * k + 14;
    const troughH = 54 * k + 6;
    const troughX = resX;
    const troughSurfY = benchY - troughH * 0.42;
    const lampX = resX + 58 * k;
    const lampY = 44;
    return {
      cw, ch, k, benchY, resW, resH, resX, resTop, waterY, stemTop,
      tubeY, tubeX0, tubeX1, tubeLen, mmX, fanX, fanY, tapX, tapY,
      troughW, troughH, troughX, troughSurfY, lampX, lampY,
    };
  }, []);

  // ---- honest physics ---------------------------------------------------------
  const currentRate = useCallback(() => {
    let f = BASE_RATE * (leaves / 12);
    f *= lamp ? 1 : DARK_FACTOR;
    f *= FAN_FACTOR[fan];
    if (mistOn) f *= MIST_FACTOR;
    f *= temp === 30 ? WARM_FACTOR : 1;
    if (!sim.current.sealed) f += LEAK_BIAS;
    return f;
  }, [leaves, lamp, fan, mistOn, temp]);

  // ---- setup actions ------------------------------------------------------------
  const doCut = useCallback((clean: boolean) => {
    const s = sim.current;
    if (s.cutDone) return;
    s.cutDone = true;
    s.dryCut = !clean;
    s.airLock = !clean;
    s.cutClean = clean;
    labSound.creak(0.8);
    if (clean) {
      labSound.drip(false);
      earn('clean-cut');
      pushToast('good', '✂', 'Clean underwater cut — the water column stays whole.');
    } else {
      labSound.warn();
      pushToast('warn', '⚠', 'Dry cut — an air lock crept into the column. Flush it with the tap before runs will work.');
    }
    syncUi();
  }, [earn, pushToast, syncUi]);

  const seatBung = useCallback(() => {
    const s = sim.current;
    if (!s.cutDone || s.bungSeated) return;
    s.bungSeated = true;
    s.bungY = geom().resTop - 6;
    labSound.thunk(false);
    pushToast('good', '⬤', 'Bung seated — the shoot now seals the reservoir.');
    syncUi();
  }, [geom, pushToast, syncUi]);

  const sealVaseline = useCallback(() => {
    const s = sim.current;
    if (!s.bungSeated || s.sealed) return;
    s.smear = 1;
    s.sealed = true;
    labSound.click();
    labSound.glassClink(true);
    pushToast('good', '◎', 'Vaseline seal complete — no more sneaky leaks.');
    syncUi();
  }, [pushToast, syncUi]);

  const tapPress = useCallback(() => {
    const s = sim.current;
    if (!s.cutDone || !s.bungSeated) return;
    labSound.click();
    if (s.airLock) {
      s.airLock = false;
      s.flushT = 1;
      labSound.slosh(0.8);
      pushToast('good', '⌾', 'Air lock flushed — the column is solid water again.');
      syncUi();
      return;
    }
    // charge the bubble to zero and start the clock
    s.pos = 0;
    s.simMin = 0;
    s.rateNow = 0;
    s.rateSmooth = 0;
    s.hist = [{ m: 0, p: 0 }];
    s.trace = [{ t: 0, p: 0 }];
    s.lastSample = 0;
    s.lastTrace = 0;
    s.charged = true;
    s.running = true;
    s.endHit = false;
    s.conditionDirty = false;
    s.flushT = 1;
    labSound.slosh(0.5);
    labSound.drip(true);
    pushToast('info', '⌾', 'Bubble charged to zero — the clock is running.');
    syncUi();
  }, [pushToast, syncUi]);

  const recordRun = useCallback(() => {
    const s = sim.current;
    if (!s.running || s.simMin < 1) return;
    const label = conditionLabel({ fan, lamp, mistOn, temp, leaves, dirty: s.conditionDirty });
    const row: RunRow = {
      id: rows.length + 1,
      label,
      leaves,
      minutes: s.simMin,
      pos: s.pos,
      rate: s.rateSmooth,
      dirty: s.conditionDirty,
      fan, lamp, mist: mistOn, temp,
      trace: s.trace.slice(),
    };
    setRows((cur) => [...cur, row]);
    labSound.click();
    pushToast('good', '✎', `Recorded: ${label} · ${s.pos.toFixed(1)} mm in ${s.simMin.toFixed(0)} min`);
    if (s.sealed) earn('sealed-run');
    // wind / humidity comparisons against a clean still-air baseline at the same leaf count
    const baseline = [...rows].reverse().find((r) =>
      !r.dirty && r.leaves === leaves && r.fan === 'off' && r.lamp && !r.mist && r.temp === 20);
    if (baseline && baseline.rate > 0.05) {
      const ratio = s.rateSmooth / baseline.rate;
      if (row.fan === 'strong' && !row.dirty && ratio >= 2) earn('wind-racer');
      if (row.mist && !row.dirty && ratio <= 0.6) earn('humidity-brake');
    }
    const keys = new Set([...rows.map(rowKey), rowKey(row)]);
    if (rows.length + 1 >= 5 && keys.size >= 3) earn('rate-table');
    // bench ready for the next run — the student presses the tap again
    s.running = false;
    s.charged = false;
    s.conditionDirty = false;
    syncUi();
  }, [rows, fan, lamp, mistOn, temp, leaves, earn, pushToast, syncUi]);

  const keyboardNext = useCallback(() => {
    const s = sim.current;
    if (!s.cutDone) { doCut(true); return; }
    if (!s.bungSeated) { seatBung(); return; }
    if (!s.sealed) { sealVaseline(); return; }
    if (s.airLock || !s.charged) { tapPress(); return; }
    if (s.running && s.simMin >= 1) { recordRun(); return; }
    tapPress();
  }, [doCut, seatBung, sealVaseline, tapPress, recordRun]);

  // ---- condition changes -----------------------------------------------------
  const markCondition = useCallback(() => {
    const s = sim.current;
    if (s.running && s.charged && s.simMin > 0.05) {
      if (!s.conditionDirty) {
        s.conditionDirty = true;
        labSound.warn();
        pushToast('warn', '±', 'Condition changed mid-run — this reading will be marked with an asterisk. Charge a fresh bubble for a clean comparison.');
      }
    }
  }, [pushToast]);

  const changeFan = (v: FanMode) => {
    setFan(v);
    labSound.tick();
    if (v !== 'off') labSound.slide(0.4);
    markCondition();
  };

  const toggleMist = () => {
    const next = !mistOn;
    setMistOn(next);
    labSound.drip(false);
    if (next) {
      const s = sim.current;
      for (let i = 0; i < 10; i += 1) spawnMistDrop(s, geom());
    }
    markCondition();
  };

  const toggleLamp = () => {
    setLamp((cur) => !cur);
    labSound.click();
    markCondition();
  };

  const changeTemp = (v: number) => {
    setTemp(v);
    labSound.tick();
    markCondition();
  };

  const changeLeaves = (v: number) => {
    setLeaves(v);
    labSound.creak(0.3);
    markCondition();
  };

  // ---- fan hum loop ------------------------------------------------------------
  useEffect(() => {
    if (fan === 'off') labSound.stopLoop();
    else labSound.startLoop('hum');
    return () => labSound.stopLoop();
  }, [fan]);

  // ---- physics step ---------------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.t += dt;

    // fan blades spin toward their target rate
    const spinTarget = fan === 'strong' ? 17 : fan === 'gentle' ? 6.5 : 0;
    s.fanSpin += (spinTarget - s.fanSpin) * Math.min(1, dt * 2.2);
    s.fanAngle += s.fanSpin * dt;

    // shoot crossfades from trough to reservoir after the cut
    if (s.cutDone && s.setupAnim < 1) s.setupAnim = Math.min(1, s.setupAnim + dt / 0.9);
    if (s.flushT > 0) s.flushT = Math.max(0, s.flushT - dt * 2);

    // the run: simulated minutes and honest bubble travel
    if (s.running && s.charged && !s.airLock) {
      const dMin = dt * speed * SIM_MIN_PER_SEC;
      s.simMin += dMin;
      const wobble = 1 + 0.06 * Math.sin(s.simMin * 1.9 + s.ph1) * Math.sin(s.simMin * 0.7 + s.ph2);
      s.rateNow = currentRate() * wobble;
      s.pos += s.rateNow * dMin;
      if (s.simMin - s.lastSample >= 0.2) {
        s.lastSample = s.simMin;
        s.hist.push({ m: s.simMin, p: s.pos });
        if (s.hist.length > 14) s.hist.shift();
      }
      if (s.simMin - s.lastTrace >= 0.25) {
        s.lastTrace = s.simMin;
        s.trace.push({ t: s.simMin, p: s.pos });
      }
      // rate over the last simulated minute, lightly smoothed
      let m0 = 0;
      let p0 = 0;
      for (const h of s.hist) {
        if (h.m <= s.simMin - 1) { m0 = h.m; p0 = h.p; }
      }
      const span = Math.max(0.1, s.simMin - m0);
      const inst = (s.pos - p0) / span;
      s.rateSmooth += (inst - s.rateSmooth) * Math.min(1, dt * 3);

      if (s.pos >= CAPILLARY_MM) {
        s.pos = CAPILLARY_MM;
        s.running = false;
        s.endHit = true;
        s.pendingEnd = true;
      }
    }

    // mist droplets drift and fade
    if (mistOn) {
      s.mistAcc += dt;
      if (s.mistAcc > 0.07) {
        s.mistAcc = 0;
        spawnMistDrop(s, geom());
        if (Math.random() < 0.2) labSound.drip(true);
      }
    }
    const wind = fan === 'strong' ? 46 : fan === 'gentle' ? 22 : 0;
    for (const d of s.mistDrops) {
      d.x += (d.vx + wind) * dt;
      d.y += d.vy * dt;
      d.life -= dt;
    }
    s.mistDrops = s.mistDrops.filter((d) => d.life > 0);

    // unsealed bung lets tiny leak bubble trails creep out
    if (s.running && !s.sealed && s.cutDone && s.bungSeated && Math.random() < dt * 1.4) {
      const g = geom();
      s.leakBubbles.push({
        x: g.resX + (Math.random() - 0.5) * g.resW * 0.8,
        y: g.resTop - 4,
        vy: 12 + Math.random() * 10,
        ph: Math.random() * 6.28,
      });
    }
    for (const b of s.leakBubbles) {
      b.y -= b.vy * dt;
      b.x += Math.sin(s.t * 5 + b.ph) * 8 * dt;
    }
    s.leakBubbles = s.leakBubbles.filter((b) => b.y > geom().resTop - 130);

    // the open capillary tip drips into the waste beaker while running
    if (s.running && s.rateNow > 0.05) {
      s.dripAcc += dt * speed;
      if (s.dripAcc > 2.1) {
        s.dripAcc = 0;
        const g = geom();
        s.fallDrops.push({ x: g.tubeX1, y: g.tubeY + 5, vy: 30 });
      }
    }
    for (const d of s.fallDrops) {
      d.vy += 260 * dt;
      d.y += d.vy * dt;
    }
    const beakerY = geom().benchY - 26;
    if (s.fallDrops.some((d) => d.y >= beakerY)) {
      s.fallDrops = s.fallDrops.filter((d) => d.y < beakerY);
      labSound.drip(true);
    }

    if (s.pendingEnd) {
      s.pendingEnd = false;
      labSound.warn();
      pushToast('warn', '⚠', 'The bubble reached the far end of the tube — press the tap to reset it to zero.');
      syncUi();
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [fan, mistOn, speed, currentRate, geom, pushToast, syncUi]);

  // ---- drawing -----------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();
    const { k, benchY } = g;

    // background — warm neutral room
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // ---- bench ----
    const benchGrad = ctx.createLinearGradient(0, benchY, 0, h);
    benchGrad.addColorStop(0, '#cdb99a');
    benchGrad.addColorStop(0.12, '#bfa57f');
    benchGrad.addColorStop(1, '#9c8460');
    ctx.fillStyle = benchGrad;
    ctx.fillRect(0, benchY, w, h - benchY);
    ctx.strokeStyle = '#8a7355';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, benchY);
    ctx.lineTo(w, benchY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(138,115,85,0.35)';
    ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, benchY + 8);
      ctx.lineTo(x + 18, benchY + 8);
      ctx.stroke();
    }

    // ---- desk fan (left) ----
    drawFan(ctx, g.fanX, g.fanY, s.fanAngle, k, s.fanSpin > 0.5);

    // airflow streamlines when the fan blows
    if (fan !== 'off') {
      const strength = fan === 'strong' ? 0.5 : 0.28;
      ctx.save();
      ctx.setLineDash([9, 13]);
      ctx.lineDashOffset = -(s.t * (fan === 'strong' ? 130 : 70));
      ctx.strokeStyle = `rgba(120,150,180,${strength})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const y0 = g.stemTop + 18 * k + i * 34 * k;
        ctx.beginPath();
        ctx.moveTo(g.fanX + 40 * k, g.fanY - 26 + i * 16);
        ctx.bezierCurveTo(
          g.fanX + 120, y0 - 40,
          g.resX - 90, y0 + 10,
          g.resX + 10, y0 + (i - 1) * 12,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- apparatus: trough fading out, reservoir fading in ----
    const troughAlpha = s.cutDone ? 1 - s.setupAnim : 1;
    const resAlpha = s.cutDone ? s.setupAnim : 0;

    if (troughAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = troughAlpha;
      drawTrough(ctx, g.troughX, benchY, g.troughW, g.troughH, g.troughSurfY, s.t, k);
      // shoot standing in the trough (pre-cut)
      const shootBaseY = benchY - 6;
      drawPlant(ctx, g.troughX, shootBaseY, g.stemTop, leaves, swayAmp(fan), s.t, k, lamp);
      // scissors rest beside the trough (or follow the pointer during the cut)
      if (s.cutDrag) {
        drawScissors(ctx, s.cutX, s.cutY, 0.8, k);
        // affordance: the underwater band glows
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#2f9e77';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(g.troughX - 34 * k, g.troughSurfY + 4, 68 * k, benchY - g.troughSurfY - 12);
        ctx.restore();
      } else {
        drawScissors(ctx, g.troughX + g.troughW / 2 + 26 * k, benchY - 12, 0.12, k);
      }
      ctx.restore();
    }

    if (resAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = resAlpha;
      drawReservoir(ctx, g, s.t, s.flushT);
      // bung (floating above, being dragged, or seated)
      const bh = 24 * k;
      const bw = 46 * k;
      if (!s.bungSeated) {
        if (s.bungY < 0) s.bungY = g.resTop - 78 * k;
        drawBung(ctx, g.resX, s.bungY, bw, bh, 0);
        if (s.bungDrag) {
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = '#e8632a';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(g.resX - bw / 2 - 4, g.resTop - bh / 2 - 4, bw + 8, bh + 8);
          ctx.restore();
          // smear progress ring while dragging after seating
        }
      } else {
        drawBung(ctx, g.resX, g.resTop - 6, bw, bh, s.smear);
        if (!s.sealed && s.smear > 0) {
          // amber vaseline creeping around the collar
          ctx.save();
          ctx.globalAlpha = resAlpha * s.smear * 0.55;
          ctx.strokeStyle = '#d9a441';
          ctx.lineWidth = 5 * k;
          ctx.beginPath();
          ctx.arc(g.resX, g.resTop - 6, bw * 0.62, -Math.PI * 0.9, -Math.PI * 0.9 + s.smear * Math.PI * 1.8);
          ctx.stroke();
          ctx.restore();
        }
      }
      // the shoot stands through the bung
      drawPlant(ctx, g.resX, g.resTop - 6, g.stemTop, leaves, swayAmp(fan), s.t, k, lamp);
      // leak trails when the vaseline seal was skipped
      if (!s.sealed && s.cutDone) {
        for (const b of s.leakBubbles) {
          ctx.fillStyle = 'rgba(220,235,245,0.8)';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // ---- capillary tube, ruler, bubble ----
    drawCapillary(ctx, g, s.pos, s.t, s.airLock, s.running);

    // waste beaker under the open tip
    drawBeaker(ctx, g.tubeX1, benchY, k, s.t);

    // falling drips
    for (const d of s.fallDrops) {
      ctx.fillStyle = 'rgba(110,160,200,0.9)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 2, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- reservoir tap ----
    drawTap(ctx, g.tapX, g.tapY, k, s.charged, s.flushT, s.t);

    // ---- lamp fixture + lighting ----
    drawLamp(ctx, g.lampX, g.lampY, lamp, k);
    if (lamp) {
      const glow = ctx.createRadialGradient(g.resX, g.stemTop + 40, 20, g.resX, g.stemTop + 40, 240 * k);
      glow.addColorStop(0, 'rgba(255,214,140,0.30)');
      glow.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = 'rgba(23,35,52,0.30)';
      ctx.fillRect(0, 0, w, h);
    }

    // ---- mist droplets and haze ----
    if (mistOn) {
      ctx.fillStyle = 'rgba(150,190,215,0.10)';
      ctx.beginPath();
      ctx.ellipse(g.resX, g.stemTop + 60, 130 * k, 110 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of s.mistDrops) {
      const a = clamp(d.life / 2.2, 0, 1) * 0.75;
      ctx.fillStyle = `rgba(140,180,210,${a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [geom, fan, lamp, mistOn, leaves]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- pointer interaction ---------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const s = sim.current;
    const g = geom();

    // the reservoir tap
    if (s.cutDone && s.bungSeated && Math.hypot(px - g.tapX, py - (g.tapY - 8)) < 30) {
      tapPress();
      notePointer(true);
      return;
    }
    // the floating bung
    if (s.cutDone && !s.bungSeated) {
      const by = s.bungY < 0 ? g.resTop - 78 * g.k : s.bungY;
      if (Math.hypot(px - g.resX, py - by) < 34) {
        s.bungDrag = true;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.creak(0.3);
        notePointer(true);
        return;
      }
    }
    // vaseline smearing over the seated bung
    if (s.bungSeated && !s.sealed && Math.abs(px - g.resX) < 40 && Math.abs(py - (g.resTop - 6)) < 30) {
      s.smearDrag = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.glassClink(true);
      notePointer(true);
      return;
    }
    // the scissors / trough cut zone
    if (!s.cutDone) {
      const nearStem = Math.abs(px - g.troughX) < 90 * g.k && py > g.troughSurfY - 120 && py < g.benchY + 20;
      if (nearStem) {
        s.cutDrag = true;
        s.cutPrevX = px;
        s.cutX = px;
        s.cutY = py;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        labSound.slide(0.5);
        notePointer(true);
        return;
      }
    }
    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.cutDrag && !s.bungDrag && !s.smearDrag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    const nowT = performance.now();

    if (s.cutDrag) {
      s.cutX = px;
      s.cutY = py;
      // crossing the stem completes the cut; the height decides wet or dry
      const crossed = (s.cutPrevX < g.troughX - 6 && px >= g.troughX - 6)
        || (s.cutPrevX > g.troughX + 6 && px <= g.troughX + 6);
      if (crossed && py > g.troughSurfY - 130 && py < g.benchY + 10) {
        const clean = py > g.troughSurfY + 4;
        s.cutDrag = false;
        doCut(clean);
      }
      s.cutPrevX = px;
      if (nowT - s.creakAt > 110) { s.creakAt = nowT; labSound.creak(0.25); }
    } else if (s.bungDrag) {
      s.bungY = clamp(py, g.resTop - 150, g.resTop + 8);
      if (nowT - s.creakAt > 130) { s.creakAt = nowT; labSound.slide(0.25); }
    } else if (s.smearDrag) {
      const near = Math.abs(px - g.resX) < 46 && Math.abs(py - (g.resTop - 6)) < 32;
      if (near) {
        s.smear = Math.min(1, s.smear + 0.028);
        labSound.slide(0.2);
        if (s.smear >= SMEAR_ENOUGH && !s.sealed) sealVaseline();
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.cutDrag && !s.bungDrag && !s.smearDrag) return;
    const g = geom();
    if (s.bungDrag) {
      s.bungDrag = false;
      if (Math.abs(s.bungY - (g.resTop - 6)) < 16) seatBung();
      else s.bungY = g.resTop - 78 * g.k;
    }
    if (s.smearDrag) s.smearDrag = false;
    if (s.cutDrag) s.cutDrag = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  // ---- nudge ---------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    const s = sim.current;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'cut':
        return { target: 'scene', gesture: 'drag', title: 'Cut under water', body: 'Drag the scissors sideways through the stem below the trough’s water line. The same cut above the water runs dry and lets air in.' };
      case 'seat':
        if (!s.bungSeated) return { target: 'seat', gesture: 'press', title: 'Seat the bung', body: 'Drag the rubber bung down onto the reservoir mouth — or press here and it drops in.' };
        return { target: 'seal', gesture: 'press', title: 'Seal with vaseline', body: 'Drag slowly over the bung collar to smear vaseline around the joint and close every gap.' };
      case 'baseline':
        if (s.airLock) return { target: 'tap', gesture: 'press', title: 'Flush the air lock', body: 'Press the tap to drive the trapped air out of the column — runs only work on solid water.' };
        if (!s.charged) return { target: 'tap', gesture: 'press', title: 'Charge the bubble', body: 'Press the tap to reset the bubble to zero — the clock starts with the charge.' };
        return { target: 'record', gesture: 'press', title: 'Record the baseline', body: 'Let at least one simulated minute pass in still, bright, 20 °C air — then record the reading.' };
      case 'fan':
        return { target: 'fan', gesture: 'tap', title: 'Strong-fan run', body: 'Switch the fan to strong, press the tap to charge a fresh bubble, and record — compare it with your baseline.' };
      case 'mist':
        return { target: 'mist', gesture: 'press', title: 'Mist brake', body: 'Turn the mist on, charge the bubble and record. Humid air slows the bubble right down.' };
      case 'dark':
        if (!rows.some((r) => !r.lamp)) return { target: 'lamp', gesture: 'press', title: 'Dim the room', body: 'Switch the lamp off for the dark control run, charge and record — watch the rate collapse.' };
        return { target: 'observations', gesture: 'tap', title: 'Answer the conclusion', body: 'Open Observations and tick everything that increases the rate of transpiration — then check your answer.' };
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex, rows]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- mentor completion flags ----------------------------------------------
  const hasBaseline = rows.some((r) => r.fan === 'off' && r.lamp && !r.mist && r.temp === 20 && !r.dirty);
  const done = [
    ui.cutDone,
    ui.bungSeated && ui.sealed,
    hasBaseline,
    rows.some((r) => r.fan === 'strong'),
    rows.some((r) => r.mist),
    rows.some((r) => !r.lamp) && conclusionOk,
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

  // ---- coach -------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.airLock) return { tone: 'warn', line: 'An air lock from the dry cut is blocking the column — press the tap to flush it out before any run will work.' };
    if (!ui.cutDone) return { tone: 'info', line: 'Drag the scissors sideways through the stem under the trough’s water. The quick-cut button works too — but it cuts dry.' };
    if (!ui.bungSeated) return { tone: 'info', line: 'Drag the rubber bung down into the reservoir mouth so the shoot seals the system.' };
    if (!ui.sealed) return { tone: 'warn', line: 'The bung is bare — drag over it to smear vaseline. Until then a tiny leak adds about +0.15 mm/min to every reading.' };
    if (ui.running && sim.current.conditionDirty) return { tone: 'warn', line: 'You changed a condition mid-run — this reading will carry an asterisk. Charge a fresh bubble and change one thing at a time.' };
    if (ui.running) {
      return { tone: 'info', line: `Bubble at ${ui.pos.toFixed(1)} mm · ${ui.rate.toFixed(2)} mm/min over the last simulated minute — living plants wobble a little, exactly like this.` };
    }
    if (ui.endHit) return { tone: 'info', line: 'The bubble reached the far end of the tube — press the tap to reset it to zero.' };
    if (rows.length && !ui.charged) return { tone: 'good', line: 'Run banked. Press the tap to charge the next bubble whenever you are ready — one condition change per run.' };
    if (!ui.charged && rows.length === 0) return { tone: 'info', line: 'Sealed and seated. Press the tap to charge the bubble to zero and start the still-air baseline.' };
    if (rows.length >= 5 && !sawObs) return { tone: 'good', line: 'Five conditions banked — open Observations and answer the conclusion card.' };
    if (conclusionOk) return { tone: 'good', line: 'Conclusion locked in: moving air, light, warmth and more leaves raise the rate — mist is the brake, not the accelerator.' };
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [ui, rows.length, sawObs, conclusionOk]);

  // ---- status --------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : !ui.cutDone || !ui.bungSeated || !ui.sealed
      ? 'Setting up the potometer'
      : ui.airLock
        ? 'Air lock — flush the tap'
        : ui.running
          ? 'Run in progress'
          : rows.length
            ? 'Run banked — charge the next'
            : 'Potometer ready';

  // ---- conclusion card ---------------------------------------------------------------
  const checkConclusion = () => {
    const correct = CONCLUSION_OPTIONS.every((o) => !!picked[o.id] === o.correct);
    if (correct) {
      setConclusionOk(true);
      labSound.milestone();
      pushToast('good', '🏁', 'Conclusion correct — the whole experiment in one sentence.');
    } else {
      labSound.warn();
      pushToast('warn', '±', 'Not quite — re-read your table: which runs raced, and which crawled?');
    }
  };

  // ---- reset -----------------------------------------------------------------------
  const resetAll = () => {
    const s = sim.current;
    s.cutDone = false; s.dryCut = false; s.airLock = false; s.cutDrag = false;
    s.bungSeated = false; s.bungDrag = false; s.bungY = -1; s.smear = 0;
    s.smearDrag = false; s.sealed = false; s.setupAnim = 0; s.flushT = 0;
    s.charged = false; s.running = false; s.simMin = 0; s.pos = 0;
    s.rateNow = 0; s.rateSmooth = 0; s.hist = []; s.trace = [];
    s.lastSample = 0; s.lastTrace = 0; s.endHit = false; s.pendingEnd = false;
    s.conditionDirty = false; s.mistDrops = []; s.leakBubbles = []; s.fallDrops = [];
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setPicked({});
    setConclusionOk(false);
    setSawObs(false);
    setFan('off');
    setMistOn(false);
    setLamp(true);
    setTemp(20);
    setLeaves(12);
    setSpeed(1);
    labSound.stopLoop();
    syncUi();
  };

  // ---- render -----------------------------------------------------------------------
  const recordable = ui.running && ui.simMin >= 1;

  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.running ? 'active' : 'ready'}
      captionChip="Student-controlled experiment"
      legend={[
        { color: '#f97316', label: 'Air bubble' },
        { color: '#4c8a4f', label: 'Leafy shoot' },
        { color: '#6ea8c9', label: 'Water column' },
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
            <option value={4}>4× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Potometer bench — cut the shoot under water, seat and seal the bung, press the tap to charge the bubble, then vary fan, mist, lamp and warmth"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); keyboardNext(); notePointer(true); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="trans-layout">
            <div className="trans-actions">
              {!ui.cutDone && (
                <>
                  <button className="action-button" type="button" data-nudge="cut" onClick={() => { doCut(true); notePointer(true); }}>
                    <span className="dispense-icon" aria-hidden="true">✂</span>
                    <span>Cut under water</span>
                    <small>drag the scissors in the trough — or press here</small>
                  </button>
                  <button className="action-button ghost" type="button" onClick={() => { doCut(false); notePointer(true); }}>
                    <span className="dispense-icon" aria-hidden="true">⚡</span>
                    <span>Quick cut on the bench</span>
                    <small>fast — but the cut runs dry</small>
                  </button>
                </>
              )}
              {ui.cutDone && !ui.bungSeated && (
                <button className="action-button" type="button" data-nudge="seat" onClick={() => { seatBung(); notePointer(true); }}>
                  <span className="dispense-icon" aria-hidden="true">⬤</span>
                  <span>Seat the bung</span>
                  <small>or drag it down onto the reservoir</small>
                </button>
              )}
              {ui.bungSeated && !ui.sealed && (
                <button className="action-button" type="button" data-nudge="seal" onClick={() => { sealVaseline(); notePointer(true); }}>
                  <span className="dispense-icon" aria-hidden="true">◎</span>
                  <span>Seal with vaseline</span>
                  <small>or drag over the bung to smear it</small>
                </button>
              )}
              {ui.cutDone && ui.bungSeated && (
                <button className="action-button" type="button" data-nudge="tap" onClick={() => { tapPress(); notePointer(true); }}>
                  <span className="dispense-icon" aria-hidden="true">⌾</span>
                  <span>{ui.airLock ? 'Flush the air lock' : 'Press tap — charge to 0'}</span>
                  <small>{ui.airLock ? 'clears the column, then charge' : 'resets the bubble and the clock'}</small>
                </button>
              )}
            </div>
            <div className="trans-conditions">
              <label className="trans-field">
                <span>Desk fan</span>
                <select data-nudge="fan" value={fan} onChange={(e) => changeFan(e.target.value as FanMode)} aria-label="Desk fan strength">
                  <option value="off">Still air</option>
                  <option value="gentle">Gentle breeze</option>
                  <option value="strong">Strong blast</option>
                </select>
              </label>
              <label className="trans-field">
                <span>Room</span>
                <select value={temp} onChange={(e) => changeTemp(Number(e.target.value))} aria-label="Room temperature">
                  <option value={20}>20 °C room</option>
                  <option value={30}>30 °C warm</option>
                </select>
              </label>
              <label className="trans-field">
                <span>Shoot</span>
                <select value={leaves} onChange={(e) => changeLeaves(Number(e.target.value))} aria-label="Leaves on the shoot">
                  <option value={4}>4 leaves</option>
                  <option value={8}>8 leaves</option>
                  <option value={12}>12 leaves</option>
                </select>
              </label>
              <div className="trans-toggles">
                <button type="button" className={`trans-toggle${mistOn ? ' on' : ''}`} data-nudge="mist" onClick={toggleMist} aria-pressed={mistOn}>
                  <span aria-hidden="true">💧</span> Mist {mistOn ? 'on' : 'off'}
                </button>
                <button type="button" className={`trans-toggle${lamp ? ' on' : ''}`} data-nudge="lamp" onClick={toggleLamp} aria-pressed={lamp}>
                  <span aria-hidden="true">💡</span> Lamp {lamp ? 'bright' : 'dim'}
                </button>
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Charge the bubble with the tap, change exactly one condition per run, and record after a simulated minute or more. The rate readout averages the last simulated minute — wobble and all, like a living plant.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRun(); notePointer(true); }}
            disabled={!recordable}
          >
            {recordable
              ? `✎ Record reading — ${ui.pos.toFixed(1)} mm at ${ui.simMin.toFixed(0)} min`
              : 'Record unlocks after one simulated minute'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Potometer readings</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main">
            <span>Bubble position (live)</span>
            <strong>{ui.pos.toFixed(1)} <small>mm</small></strong>
            <div className="reading-track"><span style={{ width: `${clamp(ui.pos / CAPILLARY_MM, 0, 1) * 100}%` }} /></div>
            <div className="reading-scale"><span>0 mm</span><span>100 mm</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Elapsed</span><strong>{ui.simMin.toFixed(1)} <small>min</small></strong></div>
            <div><span>Rate (last min)</span><strong>{ui.rate.toFixed(2)} <small>mm/min</small></strong></div>
            <div><span>Leaves</span><strong>{leaves}</strong></div>
            <div><span>Runs banked</span><strong>{rows.length}</strong></div>
            <div><span>Seal</span><strong>{ui.sealed ? 'vaselined' : 'open'}</strong></div>
            <div><span>Conditions</span><strong>{shortCondition(fan, mistOn, lamp, temp)}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Cut the shoot fresh under water — drag the scissors sideways through the stem below the trough&apos;s surface. A dry cut lets an air lock in; flush it with the tap if it happens.</li>
              <li>Drag the bung into the reservoir mouth, then smear vaseline around the joint with a slow drag.</li>
              <li>Press the tap: the bubble charges to zero and the clock starts.</li>
              <li>Record a still-air, bright-lamp, 20 °C baseline after a simulated minute.</li>
              <li>Change one factor per run — fan, mist, lamp, warmth or leaf count — charging the bubble fresh each time.</li>
              <li>Open Observations, compare the traces, and answer the conclusion card.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>The bubble only measures water uptake, but at steady state uptake matches loss — that is why the potometer is trusted. Keep every run at the same leaf count when you compare conditions, and let the seal do its quiet work.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your run table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Charge the bubble, let a simulated minute pass and record your first run. Baseline first — then one factor at a time.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Conditions</th><th>Leaves</th><th>Time (min)</th><th>Bubble (mm)</th><th>Rate (mm/min)</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.label}</td>
                      <td>{r.leaves}</td>
                      <td>{r.minutes.toFixed(1)}</td>
                      <td>{r.pos.toFixed(1)}</td>
                      <td>{r.rate.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(rows.length > 0 || (ui.running && ui.trace.length > 1)) && (
              <>
                <h3 style={{ marginTop: 16 }}>Bubble travel — every run</h3>
                <RunChart rows={rows} live={ui.running && ui.trace.length > 1 ? ui.trace : null} />
                <div className="trans-chart-legend">
                  {rows.map((r, i) => (
                    <span key={r.id}><i style={{ background: RUN_COLORS[i % RUN_COLORS.length] }} />Run {r.id}</span>
                  ))}
                  {ui.running && ui.trace.length > 1 && <span className="live"><i style={{ background: '#f97316' }} />live</span>}
                </div>
                <p className="observation-note">Steep lines are thirsty runs; flat lines are the brakes. The live run is bright orange, earlier runs fade.</p>
              </>
            )}
            {rows.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Rate versus leaf area</h3>
                <Plot points={rows.map((r) => ({ x: r.leaves, y: r.rate }))} xLabel="Leaves on the shoot" yLabel="Rate (mm/min)" fitLine height={200} />
                <p className="observation-note">Each point is one recorded run. Vary the leaf count across runs and the fitted line shows how rate scales with transpiring area — every leaf is another tiny evaporator.</p>
              </>
            )}
            <h3 style={{ marginTop: 18 }}>Conclusion — what increases the rate of transpiration?</h3>
            <div className="trans-conclusion">
              {CONCLUSION_OPTIONS.map((o) => (
                <label key={o.id} className={`trans-check${picked[o.id] ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!picked[o.id]}
                    onChange={() => { setPicked((p) => ({ ...p, [o.id]: !p[o.id] })); labSound.tick(); }}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
              <button className="action-button" type="button" onClick={checkConclusion}>
                <span className="dispense-icon" aria-hidden="true">✓</span>
                <span>Check my answer</span>
                <small>compare with your own table first</small>
              </button>
              {conclusionOk && (
                <p className="trans-conclusion-ok">✓ Moving air, bright light, warmth and more leaves all raise the rate. Mist and dim rooms lower it — mist is the brake, never the accelerator.</p>
              )}
            </div>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Transpiration is the loss of water vapour from a plant, mostly through the stomata scattered over the leaf surfaces. Water evaporates inside air spaces in the leaf, and every molecule that escapes tugs on the chain of water behind it. Because water molecules cling to each other — cohesion — that tug travels all the way down the stem, pulling water up from the reservoir.</p>
            <div className="equation">rate ≈ baseline × moving air × light × warmth × leaf area ÷ humidity</div>
            <p>The potometer makes the invisible pull visible: as water leaves the leaf, water enters the shoot from the capillary tube, and the air bubble slides along in the opposite direction. Measuring the bubble is measuring transpiration — at steady state, uptake matches loss.</p>
            <p>The factors multiply. Moving air sweeps the humid blanket from the leaf surface so evaporation speeds up; bright light opens the stomata; warmth energises the escaping molecules; more leaves mean more evaporating surface. Mist does the opposite — it fills the air around the shoot with vapour, shrinking the gradient that drives the whole thing.</p>
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

// ---- module helpers: labels -------------------------------------------------------

function conditionLabel(c: { fan: FanMode; lamp: boolean; mistOn: boolean; temp: number; leaves: number; dirty: boolean }) {
  const parts = [
    `${c.leaves} leaves`,
    c.fan === 'off' ? 'still air' : c.fan === 'gentle' ? 'gentle fan' : 'strong fan',
    c.lamp ? 'bright' : 'dim',
    `${c.temp} °C`,
  ];
  if (c.mistOn) parts.push('mist');
  if (c.dirty) parts.push('mid-run change*');
  return parts.join(' · ');
}

function rowKey(r: RunRow) {
  return `${r.fan}|${r.lamp}|${r.mist}|${r.temp}|${r.leaves}`;
}

function shortCondition(fan: FanMode, mistOn: boolean, lamp: boolean, temp: number) {
  return `${fan === 'off' ? 'still' : fan} · ${lamp ? 'bright' : 'dim'} · ${temp}°${mistOn ? ' · mist' : ''}`;
}

function swayAmp(fan: FanMode) {
  return fan === 'strong' ? 0.16 : fan === 'gentle' ? 0.09 : 0.03;
}

function spawnMistDrop(s: { mistDrops: Droplet[] }, g: { resX: number; stemTop: number; k: number }) {
  s.mistDrops.push({
    x: g.resX + (Math.random() - 0.5) * 240 * g.k,
    y: g.stemTop + Math.random() * 150 * g.k,
    vx: -14 + Math.random() * 8,
    vy: 8 + Math.random() * 10,
    life: 1.6 + Math.random() * 0.9,
    r: 1.4 + Math.random() * 1.6,
  });
  if (s.mistDrops.length > 90) s.mistDrops.shift();
}

// ---- multi-run travel chart (SVG — text lives here, not on the scene canvas) -------

function RunChart(props: { rows: RunRow[]; live: { t: number; p: number }[] | null }) {
  const W = 360;
  const H = 216;
  const pl = 44;
  const pr = 12;
  const pt = 12;
  const pb = 30;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const maxT = Math.max(6, ...props.rows.map((r) => r.minutes), ...(props.live?.map((p) => p.t) ?? [0]));
  const xOf = (t: number) => pl + (t / maxT) * iw;
  const yOf = (p: number) => pt + ih - (clamp(p, 0, CAPILLARY_MM) / CAPILLARY_MM) * ih;
  const step = maxT <= 12 ? 2 : maxT <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  for (let t = 0; t <= maxT + 0.001; t += step) xTicks.push(Math.round(t * 10) / 10);
  const poly = (pts: { t: number; p: number }[]) => pts.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.p).toFixed(1)}`).join(' ');
  return (
    <svg className="trans-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bubble position versus simulated minutes for every recorded run">
      <rect x={pl} y={pt} width={iw} height={ih} fill="#f7f9fb" />
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={pl} x2={pl + iw} y1={yOf(v)} y2={yOf(v)} stroke="#e8edf2" />
          <text x={pl - 6} y={yOf(v) + 3} textAnchor="end" fontSize={9} fill="#9aa4b1">{v}</text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={t}>
          <line x1={xOf(t)} x2={xOf(t)} y1={pt} y2={pt + ih} stroke="#e8edf2" />
          <text x={xOf(t)} y={H - pb + 13} textAnchor="middle" fontSize={9} fill="#9aa4b1">{t}</text>
        </g>
      ))}
      <line x1={pl} x2={pl} y1={pt} y2={pt + ih} stroke="#c5cdd6" />
      <line x1={pl} x2={pl + iw} y1={pt + ih} y2={pt + ih} stroke="#c5cdd6" />
      <text x={pl + iw / 2} y={H - 3} textAnchor="middle" fontSize={9} fill="#7a8795">simulated minutes</text>
      <text x={10} y={pt + ih / 2} textAnchor="middle" fontSize={9} fill="#7a8795" transform={`rotate(-90 10 ${pt + ih / 2})`}>bubble (mm)</text>
      {props.rows.map((r, i) => (
        <polyline key={r.id} points={poly(r.trace)} fill="none" stroke={RUN_COLORS[i % RUN_COLORS.length]} strokeWidth={2} opacity={0.42} />
      ))}
      {props.live && props.live.length > 1 && (
        <polyline points={poly(props.live)} fill="none" stroke="#f97316" strokeWidth={2.6} strokeLinejoin="round" />
      )}
    </svg>
  );
}

// ---- canvas drawing helpers (pure shapes — no text on the scene canvas) -------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, bright: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const grad = ctx.createLinearGradient(0, 0, len, 0);
  if (bright) {
    grad.addColorStop(0, '#4c8a4f');
    grad.addColorStop(1, '#6fae5f');
  } else {
    grad.addColorStop(0, '#2f5a3a');
    grad.addColorStop(1, '#47734c');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.36, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.36, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,64,38,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.restore();
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  baseX: number, baseY: number, topY: number,
  count: number, sway: number, t: number, k: number, bright: boolean,
) {
  const hpx = Math.max(40, baseY - topY);
  const bend = Math.sin(t * 0.9) * sway * 42 * k;
  // stem — a gentle sway curve
  ctx.strokeStyle = bright ? '#3f7a46' : '#2c5636';
  ctx.lineWidth = 3.2 * k + 1;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(baseX + bend * 0.4, baseY - hpx * 0.55, baseX + bend, topY);
  ctx.stroke();
  // leaves along the stem
  const n = Math.max(1, count);
  for (let i = 0; i < n; i += 1) {
    const f = (i + 0.6) / (n + 0.4);
    const ly = baseY - hpx * f;
    const lx = baseX + bend * f * f;
    const side = i % 2 === 0 ? 1 : -1;
    const wob = Math.sin(t * 1.6 + i * 1.7) * sway * 1.6;
    const ang = side * (0.5 + (i % 3) * 0.13) + wob;
    const len = (24 + (i % 4) * 5) * k + 4;
    drawLeaf(ctx, lx, ly, ang, len, bright);
  }
  // growing tip
  ctx.fillStyle = bright ? '#5c9b58' : '#3a5f43';
  ctx.beginPath();
  ctx.ellipse(baseX + bend, topY, 4 * k + 2, 8 * k + 3, bend * 0.02, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrough(
  ctx: CanvasRenderingContext2D,
  cx: number, benchY: number, w: number, h: number, surfY: number, t: number, k: number,
) {
  const x0 = cx - w / 2;
  const y0 = benchY - h;
  ctx.fillStyle = 'rgba(200,220,232,0.55)';
  roundRect(ctx, x0, y0, w, h, 6);
  ctx.fill();
  const water = ctx.createLinearGradient(0, surfY, 0, benchY);
  water.addColorStop(0, 'rgba(120,170,205,0.75)');
  water.addColorStop(1, 'rgba(70,120,165,0.85)');
  ctx.fillStyle = water;
  roundRect(ctx, x0 + 3, surfY, w - 6, benchY - surfY - 3, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 5, surfY + 2 + Math.sin(t * 2.2) * 1.2);
  ctx.quadraticCurveTo(cx, surfY - 1.5 + Math.sin(t * 2.8 + 1) * 1.8, x0 + w - 5, surfY + 2 + Math.sin(t * 2.2 + 2) * 1.2);
  ctx.stroke();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  roundRect(ctx, x0, y0, w, h, 6);
  ctx.stroke();
  // little air bubbles clinging from the underwater cut
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = 'rgba(235,245,252,0.8)';
    ctx.beginPath();
    ctx.arc(cx - 10 * k + i * 9 * k, surfY + 10 + Math.sin(t * 3 + i) * 2, 1.4 + (i % 2), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawReservoir(
  ctx: CanvasRenderingContext2D,
  g: { resX: number; resW: number; resH: number; resTop: number },
  t: number, flushT: number,
) {
  const x0 = g.resX - g.resW / 2;
  const y0 = g.resTop;
  const body = ctx.createLinearGradient(x0, 0, x0 + g.resW, 0);
  body.addColorStop(0, 'rgba(190,212,226,0.5)');
  body.addColorStop(0.5, 'rgba(222,236,245,0.42)');
  body.addColorStop(1, 'rgba(180,205,220,0.55)');
  ctx.fillStyle = body;
  roundRect(ctx, x0, y0, g.resW, g.resH, 8);
  ctx.fill();
  const wy = y0 + g.resH * 0.3;
  const water = ctx.createLinearGradient(0, wy, 0, y0 + g.resH);
  water.addColorStop(0, 'rgba(110,165,205,0.8)');
  water.addColorStop(1, 'rgba(60,115,160,0.9)');
  ctx.fillStyle = water;
  roundRect(ctx, x0 + 3, wy, g.resW - 6, y0 + g.resH - wy - 3, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 6, wy + 1 + Math.sin(t * 2) * 1.1);
  ctx.quadraticCurveTo(g.resX, wy - 2 + Math.sin(t * 2.6 + 1) * 1.6, x0 + g.resW - 6, wy + 1 + Math.sin(t * 2 + 2) * 1.1);
  ctx.stroke();
  if (flushT > 0) {
    for (let i = 0; i < 7; i += 1) {
      const bx = x0 + 8 + ((t * 60 + i * 29) % (g.resW - 16));
      const by = y0 + g.resH - 8 - ((t * 90 + i * 40) % (g.resH - 20));
      ctx.fillStyle = `rgba(235,245,252,${0.5 * flushT})`;
      ctx.beginPath();
      ctx.arc(bx, by, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  roundRect(ctx, x0, y0, g.resW, g.resH, 8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 6, y0 + 12);
  ctx.lineTo(x0 + 6, y0 + g.resH - 14);
  ctx.stroke();
  ctx.fillStyle = 'rgba(23,35,52,0.10)';
  ctx.beginPath();
  ctx.ellipse(g.resX, y0 + g.resH + 3, g.resW * 0.62, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBung(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number, smear: number) {
  const x0 = cx - w / 2;
  const y0 = y - h / 2;
  const rubber = ctx.createLinearGradient(0, y0, 0, y0 + h);
  rubber.addColorStop(0, '#5a4a52');
  rubber.addColorStop(0.5, '#3f3540');
  rubber.addColorStop(1, '#2c2530');
  ctx.fillStyle = rubber;
  roundRect(ctx, x0, y0, w, h, 5);
  ctx.fill();
  ctx.fillStyle = '#332b38';
  roundRect(ctx, x0 - 4, y0 + h * 0.62, w + 8, h * 0.3, 3);
  ctx.fill();
  // centre bore — the stem passes through
  ctx.fillStyle = 'rgba(20,28,38,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx, y0 + h / 2, 4.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (smear > 0) {
    ctx.fillStyle = `rgba(217,164,65,${0.28 + smear * 0.3})`;
    roundRect(ctx, x0 - 4, y0 + h * 0.55, w + 8, h * 0.45, 4);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 5, y0 + 4);
  ctx.lineTo(x0 + 5, y0 + h - 5);
  ctx.stroke();
}

function drawCapillary(
  ctx: CanvasRenderingContext2D,
  g: { tubeX0: number; tubeX1: number; tubeLen: number; tubeY: number; mmX: (mm: number) => number },
  pos: number, t: number, airLock: boolean, running: boolean,
) {
  const y = g.tubeY;
  const half = 5;
  const water = ctx.createLinearGradient(0, y - half, 0, y + half);
  water.addColorStop(0, 'rgba(150,195,225,0.85)');
  water.addColorStop(1, 'rgba(95,150,195,0.9)');
  ctx.fillStyle = water;
  ctx.fillRect(g.tubeX0, y - half, g.tubeLen, half * 2);
  // trapped air pocket near the reservoir while the air lock persists
  if (airLock) {
    ctx.fillStyle = 'rgba(232,240,246,0.95)';
    ctx.fillRect(g.tubeX0 + 2, y - half, g.tubeLen * 0.12, half * 2);
  }
  // the travelling bubble — 6 mm of air with menisci and a glint
  const jitter = airLock ? Math.sin(t * 22) * 0.25 : 0;
  const bx0 = g.mmX(pos + jitter);
  const bx1 = g.mmX(pos + jitter + 6);
  ctx.fillStyle = 'rgba(240,246,250,0.96)';
  ctx.fillRect(bx0, y - half, Math.max(2, bx1 - bx0), half * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(bx0 + half, y, half, Math.PI * 0.5, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx1 - half, y, half, Math.PI * 1.5, Math.PI * 0.5);
  ctx.stroke();
  const gx = bx0 + (bx1 - bx0) * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.1)));
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(gx, y - 1, 2.6, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // glass walls and open tip
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.tubeX0, y - half - 2);
  ctx.lineTo(g.tubeX1 + 6, y - half - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(g.tubeX0, y + half + 2);
  ctx.lineTo(g.tubeX1 + 6, y + half + 2);
  ctx.stroke();
  ctx.strokeStyle = '#7e98a9';
  ctx.beginPath();
  ctx.moveTo(g.tubeX1 + 6, y - half - 2);
  ctx.quadraticCurveTo(g.tubeX1 + 13, y, g.tubeX1 + 6, y + half + 2);
  ctx.stroke();
  // joint into the reservoir wall
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.tubeX0 - 2, y - half - 2);
  ctx.lineTo(g.tubeX0 - 2, y + half + 2);
  ctx.stroke();
  // the ruler: tick marks only — all numerals live in the sidebar
  const ry = y + half + 12;
  ctx.strokeStyle = '#b6c1cc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(g.tubeX0, ry);
  ctx.lineTo(g.tubeX1, ry);
  ctx.stroke();
  for (let mm = 0; mm <= CAPILLARY_MM; mm += 2) {
    const x = g.tubeX0 + (mm / CAPILLARY_MM) * g.tubeLen;
    const long = mm % 10 === 0;
    ctx.strokeStyle = long ? '#98a4b0' : '#c0cad3';
    ctx.lineWidth = long ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x, ry + (long ? 12 : mm % 5 === 0 ? 8 : 5));
    ctx.stroke();
  }
  // live marker under the bubble
  const mx = g.mmX(clamp(pos, 0, CAPILLARY_MM));
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(mx, ry + 2);
  ctx.lineTo(mx - 6, ry + 10);
  ctx.lineTo(mx + 6, ry + 10);
  ctx.closePath();
  ctx.fill();
  // shimmer of flow while the run is live
  if (running) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    const sx = g.tubeX0 + ((t * 40) % g.tubeLen);
    ctx.beginPath();
    ctx.moveTo(sx, y - half + 1);
    ctx.lineTo(sx + 8, y - half + 1);
    ctx.stroke();
  }
}

function drawBeaker(ctx: CanvasRenderingContext2D, x: number, benchY: number, k: number, t: number) {
  const w = 34 * k + 6;
  const h = 26 * k + 5;
  const x0 = x - w / 2;
  const y0 = benchY - h;
  ctx.fillStyle = 'rgba(200,220,232,0.5)';
  roundRect(ctx, x0, y0, w, h, 4);
  ctx.fill();
  const wy = benchY - h * 0.45;
  ctx.fillStyle = 'rgba(110,165,205,0.8)';
  roundRect(ctx, x0 + 3, wy, w - 6, benchY - wy - 3, 3);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, benchY);
  ctx.lineTo(x0 + w, benchY);
  ctx.lineTo(x0 + w, y0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0 + 4, wy + Math.sin(t * 2.4) * 0.8);
  ctx.lineTo(x0 + w - 4, wy + Math.sin(t * 2.4 + 1) * 0.8);
  ctx.stroke();
}

function drawTap(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, charged: boolean, flushT: number, t: number) {
  ctx.fillStyle = '#d9a441';
  roundRect(ctx, x - 7 * k - 2, y - 5, 14 * k + 4, 12, 3);
  ctx.fill();
  ctx.strokeStyle = '#8a6420';
  ctx.lineWidth = 1.4;
  roundRect(ctx, x - 7 * k - 2, y - 5, 14 * k + 4, 12, 3);
  ctx.stroke();
  const ang = -Math.PI / 2 + flushT * 1.8 + (charged ? 0.35 : 0);
  ctx.strokeStyle = '#6e5019';
  ctx.lineWidth = 3.5 * k + 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ang) * 12 * k, y + Math.sin(ang) * 12 * k);
  ctx.stroke();
  ctx.fillStyle = '#f6d27c';
  ctx.beginPath();
  ctx.arc(x, y, 4.5 * k + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6420';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (flushT > 0.05) {
    ctx.fillStyle = `rgba(110,165,205,${flushT})`;
    ctx.beginPath();
    ctx.ellipse(x - 10 * k, y + 12 + (1 - flushT) * 8, 1.8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  void t;
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean, k: number) {
  ctx.strokeStyle = '#435062';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 60 * k, -4);
  ctx.lineTo(x - 8, y + 4);
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.5);
  const shade = ctx.createLinearGradient(-20, -10, 20, 16);
  shade.addColorStop(0, '#5d6a79');
  shade.addColorStop(1, '#3a4656');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(-16 * k - 6, -10 * k - 4);
  ctx.lineTo(16 * k + 6, -10 * k - 4);
  ctx.lineTo(24 * k + 8, 12 * k + 6);
  ctx.lineTo(-24 * k - 8, 12 * k + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = on ? '#ffe9b0' : '#8e99a6';
  ctx.beginPath();
  ctx.ellipse(0, 12 * k + 8, 12 * k + 3, 5 * k + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFan(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, k: number, spinning: boolean) {
  ctx.fillStyle = '#435062';
  roundRect(ctx, x - 22 * k - 4, y + 62 * k, 44 * k + 8, 8, 3);
  ctx.fill();
  ctx.fillStyle = '#5d6a79';
  roundRect(ctx, x - 3, y + 18 * k, 6, 46 * k, 3);
  ctx.fill();
  const r = 34 * k + 4;
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 3; i += 1) {
    const a = angle + (i * Math.PI * 2) / 3;
    ctx.save();
    ctx.rotate(a);
    const blade = ctx.createLinearGradient(0, 0, r * 0.86, 0);
    blade.addColorStop(0, 'rgba(200,214,224,0.95)');
    blade.addColorStop(1, 'rgba(150,168,182,0.9)');
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(r * 0.5, -r * 0.42, r * 0.86, -r * 0.16);
    ctx.quadraticCurveTo(r * 0.6, 0, r * 0.86, r * 0.16);
    ctx.quadraticCurveTo(r * 0.5, r * 0.42, 4, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#313d4d';
  ctx.beginPath();
  ctx.arc(0, 0, 6 * k + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,104,120,0.85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
  if (spinning) {
    ctx.strokeStyle = 'rgba(150,170,190,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, angle, angle + 1.1);
    ctx.stroke();
  }
}

function drawScissors(ctx: CanvasRenderingContext2D, x: number, y: number, open: number, k: number) {
  const L = 30 * k + 6;
  const a = open * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.strokeStyle = '#e8632a';
  ctx.lineWidth = 3.4 * k + 1;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-L * 0.55, sgn * 6 * k, 7 * k + 2, 4.5 * k + 1, sgn * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#9aa4b1';
  ctx.lineWidth = 2.6 * k + 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(L, -L * Math.tan(a) * 0.5 - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(L, L * Math.tan(a) * 0.5 + 2);
  ctx.stroke();
  ctx.fillStyle = '#6e7a88';
  ctx.beginPath();
  ctx.arc(0, 0, 2.6 * k + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
