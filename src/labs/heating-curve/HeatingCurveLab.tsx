import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp, fmtClock } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './heating-curve.css';

/**
 * Heating curve of water — ice to steam on a hot plate.
 *
 * 100 g of crushed ice starts at −10 °C. The student runs the heater
 * (low / medium / high power changes the slopes, never the plateau
 * temperatures) and a live T–t curve draws continuously: ice warms to 0 °C,
 * melts on a flat plateau (L_f = 334 kJ/kg), water warms to 100 °C, boils on
 * a second flat plateau (L_v = 2260 kJ/kg), then steam rises. Two "mark
 * plateau" buttons stamp (time, temperature) points onto the curve and the
 * observation table, where plateau length × power recovers the latent heats.
 */

const M = 0.1; // kg of ice / water
const C_ICE = 2100; // J/kg·K
const C_W = 4186; // J/kg·K
const L_F = 334000; // J/kg — latent heat of fusion
const L_V = 2260000; // J/kg — latent heat of vaporisation
const T0 = -10; // starting ice temperature, °C

const POWERS: { id: string; name: string; watts: number }[] = [
  { id: 'low', name: 'Low · 150 W', watts: 150 },
  { id: 'medium', name: 'Medium · 300 W', watts: 300 },
  { id: 'high', name: 'High · 500 W', watts: 500 },
];

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'start', title: 'Start the heater at medium', detail: 'Set the power to medium and start the heater. The plate hums and the crushed ice begins to warm from −10 °C.', hint: 'Low, medium and high change only the slopes — never the plateau temperatures.' },
  { id: 'melt', title: 'Watch the ice melt at 0 °C', detail: 'The thermometer climbs to 0 °C and then sticks there while every ice cube shrinks away — that flat stretch is the melting plateau.', hint: 'Heat is still flowing in the whole time; it is all going into the phase change.' },
  { id: 'mark-melt', title: 'Mark the melting plateau', detail: 'While the curve sits flat at 0 °C, press “Mark melting plateau” to stamp the point onto the curve and the table.', hint: 'Marks made on the flat count for the Phase Master badge (within ±0.5 °C).' },
  { id: 'boil', title: 'Watch the water boil at 100 °C', detail: 'Liquid water warms steadily to 100 °C, then pins flat again while bubbles rush and steam rises.', hint: 'The second plateau is far longer — vaporising water costs 2260 kJ per kilogram.' },
  { id: 'mark-boil', title: 'Mark the boiling plateau', detail: 'Stamp the boiling plateau while the thermometer sits at 100 °C and the beaker churns.', hint: 'Mark while it is flat — that is the whole lesson of the curve.' },
  { id: 'read', title: 'Read the plateaus', detail: 'Open Observations: plateau length × power hides the latent heat. Both plateaus stayed flat even while the heater ran — that is latent heat at work.', hint: 'Compare your L_f and L_v with 334 and 2260 kJ/kg.' },
];

const BADGES: BadgeDef[] = [
  { id: 'fire-lit', title: 'Fire Lit', icon: '🔥', detail: 'Started the heater and set the ice on its journey.' },
  { id: 'melting-marked', title: 'Melting Marked', icon: '❄', detail: 'Stamped a melting-plateau point onto the curve.' },
  { id: 'boiling-marked', title: 'Boiling Marked', icon: '♨', detail: 'Stamped a boiling-plateau point onto the curve.' },
  { id: 'phase-master', title: 'Phase Master', icon: '★', detail: 'Marked both plateaus within ±0.5 °C of 0 °C and 100 °C.' },
];

interface MarkRow { id: number; kind: 'melt' | 'boil'; t: number; T: number }

type Phase = 'ice' | 'melting' | 'water' | 'boiling' | 'done';

interface UiSnap { T: number; phase: Phase; t: number; on: boolean; meltFrac: number; vaporFrac: number }

const meta = getLabBySlug('heating-curve')!;

const ICE_CUBES = [
  { fx: -0.3, fy: 0.5, s: 1.0, r: -0.12 },
  { fx: 0.02, fy: 0.72, s: 1.15, r: 0.08 },
  { fx: 0.3, fy: 0.45, s: 0.9, r: 0.18 },
  { fx: -0.12, fy: 0.22, s: 0.8, r: -0.22 },
  { fx: 0.18, fy: 0.12, s: 0.72, r: 0.28 },
  { fx: -0.33, fy: 0.02, s: 0.62, r: -0.05 },
  { fx: 0.33, fy: 0.0, s: 0.55, r: 0.05 },
];

export default function HeatingCurveLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    phase: 'ice' as Phase,
    T: T0,
    Eph: 0,
    t: 0,
    meltFrac: 0,
    vaporFrac: 0,
    meltStart: 0,
    meltEnd: 0,
    boilStart: 0,
    boilEnd: 0,
    meltEnergy: 0,
    boilEnergy: 0,
    on: false,
    watts: 300,
    samples: [{ t: 0, T: T0 }] as { t: number; T: number }[],
    sampleAcc: 0,
    acc: 0,
    uiAcc: 0,
    idle: 0,
    bubbleAcc: 0,
    steamAcc: 0,
    dripAt: 0,
    pending: '' as '' | 'melt-start' | 'melt-end' | 'boil-start' | 'done',
    marks: [] as { kind: 'melt' | 'boil'; t: number; T: number }[],
    bubbles: [] as { x: number; y: number; r: number; vy: number; age: number }[],
    steam: [] as { x: number; y: number; r: number; age: number; life: number; wob: number }[],
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ----------------------------------------------------
  const [power, setPower] = useState('medium');
  const [speed, setSpeed] = useState(5);
  const [rows, setRows] = useState<MarkRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [startedMedium, setStartedMedium] = useState(false);
  const [sawObs, setSawObs] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ T: T0, phase: 'ice', t: 0, on: false, meltFrac: 0, vaporFrac: 0 });

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
    setUi({ T: s.T, phase: s.phase, t: s.t, on: s.on, meltFrac: s.meltFrac, vaporFrac: s.vaporFrac });
  }, []);

  // ---- mentor completion flags ---------------------------------------------
  const meltMarked = rows.some((r) => r.kind === 'melt');
  const boilMarked = rows.some((r) => r.kind === 'boil');
  const done = [
    startedMedium,
    ui.phase === 'melting' || ui.phase === 'water' || ui.phase === 'boiling' || ui.phase === 'done',
    meltMarked,
    ui.phase === 'boiling' || ui.phase === 'done',
    boilMarked,
    sawObs && meltMarked && boilMarked,
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

  // ---- nudge -----------------------------------------------------------------
  const getPlan = useCallback((): NudgePlan | null => {
    if (!mentorAcked) return null;
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'start': return { target: 'heater', gesture: 'press', title: 'Start the heater', body: 'Set the power selector to medium, then press “Start heater” — the plate hums and the ice starts warming.' };
      case 'melt': return { target: 'scene', gesture: 'point', title: 'Watch it pin at 0 °C', body: 'The thermometer will climb to 0 °C and stick there while the ice cubes shrink. Watch the curve go flat.' };
      case 'mark-melt': return { target: 'mark-melt', gesture: 'press', title: 'Mark the melting plateau', body: 'Press “Mark melting plateau” while the curve sits flat at 0 °C — the stamp lands on curve and table.' };
      case 'boil': return { target: 'scene', gesture: 'point', title: 'On to the boil', body: 'Water warms steadily now — wait for the second flat stretch at 100 °C with bubbles and steam.' };
      case 'mark-boil': return { target: 'mark-boil', gesture: 'press', title: 'Mark the boiling plateau', body: 'Press “Mark boiling plateau” while the thermometer reads 100 °C and the beaker churns.' };
      case 'read': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Plateau length × power hides the latent heat — your marks and the analysis live in Observations.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- physics + loop step ------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    s.idle += dt;

    if (s.on && s.phase !== 'done') {
      s.acc += dt * speed;
      const h = 1 / 20;
      while (s.acc >= h) {
        s.acc -= h;
        const add = s.watts * h;
        s.t += h;
        s.Eph += add;
        if (s.phase === 'ice') {
          s.T = T0 + s.Eph / (M * C_ICE);
          if (s.T >= 0) {
            s.T = 0;
            s.phase = 'melting';
            s.Eph = 0;
            s.meltStart = s.t;
            s.pending = 'melt-start';
          }
        } else if (s.phase === 'melting') {
          s.T = 0;
          s.meltFrac = s.Eph / (M * L_F);
          s.meltEnergy += add;
          if (s.meltFrac >= 1) {
            s.meltFrac = 1;
            s.phase = 'water';
            s.Eph = 0;
            s.meltEnd = s.t;
            s.pending = 'melt-end';
          }
        } else if (s.phase === 'water') {
          s.T = s.Eph / (M * C_W);
          if (s.T >= 100) {
            s.T = 100;
            s.phase = 'boiling';
            s.Eph = 0;
            s.boilStart = s.t;
            s.pending = 'boil-start';
          }
        } else if (s.phase === 'boiling') {
          s.T = 100;
          s.vaporFrac = s.Eph / (M * L_V);
          s.boilEnergy += add;
          if (s.vaporFrac >= 1) {
            s.vaporFrac = 1;
            s.phase = 'done';
            s.on = false;
            s.boilEnd = s.t;
            s.pending = 'done';
          }
        }
        s.sampleAcc += h;
        if (s.sampleAcc >= 1) {
          s.sampleAcc -= 1;
          s.samples.push({ t: s.t, T: s.T });
          if (s.samples.length > 4000) s.samples.shift();
        }
        if (s.phase === 'melting' && s.t - s.dripAt > 1.7) {
          s.dripAt = s.t;
          labSound.drip(true);
        }
      }
    }

    // bubbles + steam intensity follow the simulated rate; motion runs real-time
    if (s.phase === 'boiling') {
      s.bubbleAcc += dt * speed * 5 * (s.watts / 300);
      while (s.bubbleAcc >= 1) {
        s.bubbleAcc -= 1;
        s.bubbles.push({
          x: -0.32 + Math.random() * 0.64,
          y: 0,
          r: 1.6 + Math.random() * 2.4,
          vy: 34 + Math.random() * 40,
          age: 0,
        });
      }
      s.steamAcc += dt * speed * 1.6 * (s.watts / 300);
      while (s.steamAcc >= 1) {
        s.steamAcc -= 1;
        s.steam.push({
          x: -0.3 + Math.random() * 0.6,
          y: 0,
          r: 3 + Math.random() * 3,
          age: 0,
          life: 1.4 + Math.random() * 1.2,
          wob: Math.random() * Math.PI * 2,
        });
      }
    }
    for (const b of s.bubbles) {
      b.age += dt;
      b.y += (b.vy * dt) / 90;
      b.r += dt * 1.6;
    }
    s.bubbles = s.bubbles.filter((b) => b.y < 1.05 && b.age < 4);
    for (const p of s.steam) {
      p.age += dt;
      p.y += dt * 0.5;
      p.r += dt * 4;
    }
    s.steam = s.steam.filter((p) => p.age < p.life);

    if (s.pending) {
      const kind = s.pending;
      s.pending = '';
      if (kind === 'melt-start') {
        labSound.step();
        pushToast('info', '❄', 'The ice is melting — the thermometer holds at 0 °C while heat quietly breaks the solid apart.');
      } else if (kind === 'melt-end') {
        labSound.step();
        pushToast('info', '💧', 'All the ice has melted — the water climbs past 0 °C again.');
      } else if (kind === 'boil-start') {
        labSound.step();
        pushToast('info', '♨', 'Boiling! The thermometer pins at 100 °C while heat turns water into steam.');
      } else if (kind === 'done') {
        labSound.milestone();
        pushToast('good', '🏁', 'Every drop has boiled away — your heating curve is complete. Check the plateaus in Observations.');
      }
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, pushToast, syncUi]);

  // ---- geometry -------------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const appB = h * 0.64;
    const plateTop = appB - 24;
    const bw = clamp(w * 0.24, 120, 180);
    const bh = clamp(appB * 0.55, 128, 208);
    const bx = clamp(w * 0.42, bw / 2 + 150, w - bw / 2 - 60);
    const beakerBottom = plateTop;
    const beakerTop = plateTop - bh;
    return { w, h, appB, plateTop, bw, bh, bx, beakerBottom, beakerTop };
  }, []);

  // ---- drawing ---------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const g = geom();

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
    ctx.moveTo(0, g.appB);
    ctx.lineTo(w, g.appB);
    ctx.stroke();
    ctx.strokeStyle = '#dde4ea';
    ctx.lineWidth = 1;
    for (let x = 10; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, g.appB);
      ctx.lineTo(x - 10, g.appB + 10);
      ctx.stroke();
    }

    // ---------------- heater plate ----------------
    const pw = g.bw + 26;
    const px = g.bx - pw / 2;
    const heat = s.on ? s.watts / 500 : 0;
    const pulse = s.on ? 0.7 + 0.3 * Math.sin(s.idle * 5) : 0;
    // base
    ctx.fillStyle = '#3a4450';
    roundRect(ctx, px + 14, g.plateTop + 18, pw - 28, g.appB - g.plateTop - 16, 6);
    ctx.fill();
    // plate
    const plateG = ctx.createLinearGradient(0, g.plateTop, 0, g.plateTop + 18);
    plateG.addColorStop(0, '#5d6a79');
    plateG.addColorStop(1, '#39434f');
    ctx.fillStyle = plateG;
    roundRect(ctx, px, g.plateTop, pw, 18, 6);
    ctx.fill();
    ctx.strokeStyle = '#2b333d';
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, g.plateTop, pw, 18, 6);
    ctx.stroke();
    // coil glow
    for (let i = 0; i < 3; i++) {
      const cy = g.plateTop + 5 + i * 4.5;
      ctx.strokeStyle = heat > 0 ? `rgba(232,${100 + i * 20},42,${0.5 + 0.4 * pulse})` : '#4a545f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px + 16, cy);
      ctx.lineTo(px + pw - 16, cy);
      ctx.stroke();
    }
    if (s.on) {
      const glowG = ctx.createRadialGradient(g.bx, g.plateTop + 4, 6, g.bx, g.plateTop + 4, 70);
      glowG.addColorStop(0, `rgba(249,115,22,${0.22 * heat * pulse})`);
      glowG.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = glowG;
      ctx.fillRect(px - 40, g.plateTop - 60, pw + 80, 90);
      // shimmer
      ctx.strokeStyle = `rgba(232,99,42,${0.2 + 0.15 * pulse})`;
      ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let yy = 0; yy <= 26; yy += 5) {
          const xx = g.bx + side * (g.bw / 2 + 12) + Math.sin(s.idle * 4 + yy * 0.35) * 3;
          if (yy === 0) ctx.moveTo(xx, g.plateTop - yy);
          else ctx.lineTo(xx, g.plateTop - yy);
        }
        ctx.stroke();
      }
    }

    // ---------------- beaker ----------------
    const innerL = g.bx - g.bw / 2 + 5;
    const innerR = g.bx + g.bw / 2 - 5;
    const contentBottom = g.beakerBottom - 6;
    const contentTop = g.beakerTop + 8;
    const fullH = (contentBottom - contentTop) * 0.8;
    const levelFrac = s.phase === 'ice'
      ? 0.08
      : s.phase === 'melting'
        ? 0.08 + 0.84 * s.meltFrac
        : s.phase === 'water'
          ? 0.92
          : s.phase === 'boiling'
            ? 0.92 * (1 - s.vaporFrac) + 0.02
            : 0.02;
    const level = fullH * levelFrac;
    const surfaceY = contentBottom - level;

    // glass body
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(g.bx - g.bw / 2, g.beakerTop);
    ctx.lineTo(g.bx - g.bw / 2, g.beakerBottom - 4);
    ctx.quadraticCurveTo(g.bx - g.bw / 2, g.beakerBottom, g.bx - g.bw / 2 + 6, g.beakerBottom);
    ctx.lineTo(g.bx + g.bw / 2 - 6, g.beakerBottom);
    ctx.quadraticCurveTo(g.bx + g.bw / 2, g.beakerBottom, g.bx + g.bw / 2, g.beakerBottom - 4);
    ctx.lineTo(g.bx + g.bw / 2, g.beakerTop);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8da8b9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.bx - g.bw / 2, g.beakerTop);
    ctx.lineTo(g.bx - g.bw / 2, g.beakerBottom - 4);
    ctx.quadraticCurveTo(g.bx - g.bw / 2, g.beakerBottom, g.bx - g.bw / 2 + 6, g.beakerBottom);
    ctx.lineTo(g.bx + g.bw / 2 - 6, g.beakerBottom);
    ctx.quadraticCurveTo(g.bx + g.bw / 2, g.beakerBottom, g.bx + g.bw / 2, g.beakerBottom - 4);
    ctx.lineTo(g.bx + g.bw / 2, g.beakerTop);
    ctx.stroke();
    // lip
    ctx.strokeStyle = '#a9bfc9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.bx - g.bw / 2 - 4, g.beakerTop - 3);
    ctx.lineTo(g.bx - g.bw / 2 + 3, g.beakerTop + 2);
    ctx.moveTo(g.bx + g.bw / 2 + 4, g.beakerTop - 3);
    ctx.lineTo(g.bx + g.bw / 2 - 3, g.beakerTop + 2);
    ctx.stroke();

    // contents (clipped to the beaker interior)
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerL, contentTop, innerR - innerL, contentBottom - contentTop);
    ctx.clip();

    if (level > 1) {
      const wgrad = ctx.createLinearGradient(0, surfaceY, 0, contentBottom);
      wgrad.addColorStop(0, 'rgba(207,228,242,0.95)');
      wgrad.addColorStop(1, 'rgba(154,193,222,0.95)');
      ctx.fillStyle = wgrad;
      const wob = s.phase === 'boiling' ? Math.sin(s.idle * 9) * 1.6 : Math.sin(s.idle * 2) * 0.5;
      roundRect(ctx, innerL, surfaceY + wob, innerR - innerL, contentBottom - surfaceY, 4);
      ctx.fill();
    }

    // ice cubes (shrink as melting proceeds)
    if (s.phase === 'ice' || s.phase === 'melting') {
      for (let i = 0; i < ICE_CUBES.length; i++) {
        const c = ICE_CUBES[i];
        const scale = clamp(1 - s.meltFrac * 1.3 - i * 0.045, 0, 1);
        if (scale < 0.16) continue;
        const cx = g.bx + c.fx * g.bw;
        const cy = contentBottom - c.fy * fullH * 0.5 - 8 * scale;
        const sz = 26 * c.s * scale;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(c.r);
        const iceG = ctx.createLinearGradient(-sz / 2, -sz / 2, sz / 2, sz / 2);
        iceG.addColorStop(0, '#f2f8fc');
        iceG.addColorStop(0.6, '#dcebf5');
        iceG.addColorStop(1, '#bcd5e7');
        ctx.fillStyle = iceG;
        roundRect(ctx, -sz / 2, -sz / 2, sz, sz, 5);
        ctx.fill();
        ctx.strokeStyle = '#a9c6da';
        ctx.lineWidth = 1.5;
        roundRect(ctx, -sz / 2, -sz / 2, sz, sz, 5);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.25, -sz * 0.1);
        ctx.lineTo(sz * 0.1, sz * 0.25);
        ctx.stroke();
        ctx.restore();
      }
    }

    // boiling bubbles
    for (const b of s.bubbles) {
      const bx2 = g.bx + b.x * g.bw;
      const by2 = contentBottom - b.y * (contentBottom - surfaceY - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(bx2, by2, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.arc(bx2, by2, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // surface line
    if (level > 1) {
      const wob = s.phase === 'boiling' ? Math.sin(s.idle * 9) * 1.6 : 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(innerL + 2, surfaceY + wob);
      ctx.quadraticCurveTo(g.bx, surfaceY - 1.5 + wob, innerR - 2, surfaceY + wob);
      ctx.stroke();
    }
    ctx.restore();

    // steam wisps
    for (const p of s.steam) {
      const sx = g.bx + p.x * g.bw + Math.sin(p.wob + p.age * 3) * 7;
      const sy = g.beakerTop - 6 - p.y * 60;
      const a = clamp(0.4 * (1 - p.age / p.life), 0, 1);
      ctx.fillStyle = `rgba(215,228,236,${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---------------- thermometer on a stand ----------------
    const poleX = g.bx + g.bw / 2 + 40;
    ctx.strokeStyle = '#8d99a6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(poleX, g.appB);
    ctx.lineTo(poleX, g.beakerTop - 30);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(poleX, g.beakerTop - 26);
    ctx.lineTo(g.bx + g.bw * 0.15, g.beakerTop - 26);
    ctx.stroke();
    ctx.fillStyle = '#5d6a79';
    ctx.beginPath();
    ctx.arc(poleX, g.appB, 6, 0, Math.PI * 2);
    ctx.fill();

    const thx = g.bx + g.bw * 0.15;
    const bulbY = contentBottom - 12;
    ctx.fillStyle = '#f4f7fa';
    roundRect(ctx, thx - 4, g.beakerTop - 26, 8, bulbY - g.beakerTop + 34, 4);
    ctx.fill();
    ctx.strokeStyle = '#9fb0bd';
    ctx.lineWidth = 1.25;
    roundRect(ctx, thx - 4, g.beakerTop - 26, 8, bulbY - g.beakerTop + 34, 4);
    ctx.stroke();
    ctx.strokeStyle = '#b9c4cf';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const ty = g.beakerTop - 18 + (i / 5) * (bulbY - g.beakerTop - 26);
      ctx.beginPath();
      ctx.moveTo(thx - 4, ty);
      ctx.lineTo(thx - 1, ty);
      ctx.stroke();
    }
    const frac = clamp((s.T + 15) / 125, 0.02, 1);
    const colTop = bulbY - 5 - frac * (bulbY - g.beakerTop - 34);
    ctx.fillStyle = '#e8443a';
    roundRect(ctx, thx - 1.75, colTop, 3.5, bulbY - 5 - colTop + 5, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(thx, bulbY + 2, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (s.T >= 99) {
      ctx.strokeStyle = 'rgba(232,68,58,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(thx, bulbY + 2, 8 + Math.sin(s.idle * 5) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---------------- live temperature–time curve (lower third) ----------------
    const panelX = 12;
    const panelY = h * 0.66 + 6;
    const panelW = w - 24;
    const panelH = h * 0.3;
    ctx.fillStyle = '#f7f9fb';
    roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.fill();
    ctx.strokeStyle = '#e4e9ef';
    ctx.lineWidth = 1;
    roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.stroke();

    const ax0 = panelX + 34;
    const ax1 = panelX + panelW - 12;
    const ay0 = panelY + 12;
    const ay1 = panelY + panelH - 14;
    const ty = (T: number) => ay1 - ((T + 15) / 125) * (ay1 - ay0);
    const xMax = Math.max(120, s.t * 1.12);
    const tx = (t: number) => ax0 + (t / xMax) * (ax1 - ax0);

    // grid — the 0 °C and 100 °C plateau lines are dashed and darker
    for (const T of [-10, 0, 25, 50, 75, 100]) {
      const plateau = T === 0 || T === 100;
      ctx.setLineDash(plateau ? [6, 5] : []);
      ctx.strokeStyle = plateau ? '#c3ccd6' : '#e6ebf1';
      ctx.lineWidth = plateau ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(ax0, ty(T));
      ctx.lineTo(ax1, ty(T));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const steps = [15, 30, 60, 120, 240, 480];
    const tStep = steps.find((st) => xMax / st <= 9) ?? 960;
    ctx.strokeStyle = '#edf1f5';
    for (let t = tStep; t <= xMax; t += tStep) {
      ctx.beginPath();
      ctx.moveTo(tx(t), ay0);
      ctx.lineTo(tx(t), ay1);
      ctx.stroke();
    }
    ctx.strokeStyle = '#c5cdd6';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(ax0, ay0);
    ctx.lineTo(ax0, ay1);
    ctx.lineTo(ax1, ay1);
    ctx.stroke();

    // the curve
    if (s.samples.length > 1) {
      const stride = Math.max(1, Math.ceil(s.samples.length / 700));
      ctx.strokeStyle = '#e8632a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.samples.length; i += stride) {
        const p = s.samples[i];
        const x = tx(p.t);
        const y = ty(p.T);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.lineTo(tx(s.t), ty(s.T));
      ctx.stroke();
      // live dot
      ctx.fillStyle = '#e8632a';
      ctx.beginPath();
      ctx.arc(tx(s.t), ty(s.T), 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // plateau marks — diamonds stamped onto the curve
    for (const m of s.marks) {
      const x = tx(m.t);
      const y = ty(m.T);
      const color = m.kind === 'melt' ? '#f97316' : '#2f7fb8';
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = m.kind === 'melt' ? 'rgba(249,115,22,0.4)' : 'rgba(47,127,184,0.4)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 16);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- controls -----------------------------------------------------------------------
  const toggleHeater = () => {
    const s = sim.current;
    if (s.phase === 'done') return;
    s.on = !s.on;
    if (s.on) {
      labSound.click();
      labSound.startLoop('hum');
      earn('fire-lit');
      if (power === 'medium') setStartedMedium(true);
    } else {
      labSound.click();
      labSound.stopLoop();
    }
    notePointer(true);
    syncUi();
  };

  const changePower = (id: string) => {
    if (id === power) return;
    setPower(id);
    sim.current.watts = POWERS.find((p) => p.id === id)!.watts;
    labSound.tick();
    notePointer(true);
  };

  const markPlateau = (kind: 'melt' | 'boil') => {
    const s = sim.current;
    if (s.t <= 0) return;
    const row: MarkRow = { id: rows.length + 1, kind, t: s.t, T: s.T };
    const nextRows = [...rows, row];
    setRows(nextRows);
    s.marks.push({ kind, t: s.t, T: s.T });
    labSound.milestone();
    if (kind === 'melt') earn('melting-marked');
    else earn('boiling-marked');
    const off = kind === 'melt' ? Math.abs(s.T - 0) > 0.5 : Math.abs(s.T - 100) > 0.5;
    if (off) {
      labSound.warn();
      pushToast('warn', '⚠', `Marked at ${s.T.toFixed(1)} °C — off the plateau. Marks count when made within ±0.5 °C of 0 or 100.`);
    } else {
      pushToast('good', '✎', `Marked the ${kind === 'melt' ? 'melting' : 'boiling'} plateau at t = ${fmtClock(s.t)}, T = ${s.T.toFixed(1)} °C.`);
    }
    const meltRow = nextRows.find((r) => r.kind === 'melt');
    const boilRow = nextRows.find((r) => r.kind === 'boil');
    if (meltRow && boilRow && Math.abs(meltRow.T) <= 0.5 && Math.abs(boilRow.T - 100) <= 0.5) earn('phase-master');
    notePointer(true);
  };

  const resetAll = () => {
    const s = sim.current;
    s.phase = 'ice';
    s.T = T0;
    s.Eph = 0;
    s.t = 0;
    s.meltFrac = 0;
    s.vaporFrac = 0;
    s.meltStart = 0;
    s.meltEnd = 0;
    s.boilStart = 0;
    s.boilEnd = 0;
    s.meltEnergy = 0;
    s.boilEnergy = 0;
    s.on = false;
    s.acc = 0;
    s.sampleAcc = 0;
    s.pending = '';
    s.samples = [{ t: 0, T: T0 }];
    s.marks = [];
    s.bubbles = [];
    s.steam = [];
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setStartedMedium(false);
    setSawObs(false);
    labSound.stopLoop();
    syncUi();
  };

  // ---- coach ---------------------------------------------------------------------------
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (ui.phase === 'done') {
      return { tone: 'good', line: 'Every drop has boiled away. Both plateaus stayed flat while the heater ran — open Observations and see the latent heat they hide.' };
    }
    if (ui.t > 0 && !ui.on) {
      return { tone: 'warn', line: 'The heater is off — the curve waits with it. Start it again to continue the run.' };
    }
    if (ui.phase === 'ice') {
      return { tone: 'info', line: `Ice warming: ${ui.T.toFixed(1)} °C and climbing — ice needs only 2100 J per kg per °C, so this stretch is quick.` };
    }
    if (ui.phase === 'melting') {
      return { tone: 'good', line: `Pinned at 0 °C while the ice melts (${Math.round(ui.meltFrac * 100)}% melted). Press “Mark melting plateau” while the curve is flat.` };
    }
    if (ui.phase === 'water') {
      return { tone: 'info', line: `Liquid water at ${ui.T.toFixed(1)} °C — the slope has eased because water needs 4186 J per kg per °C, twice what ice did.` };
    }
    return { tone: 'good', line: 'Boiling at a steady 100 °C — bubbles and steam while the water boils away. Mark the boiling plateau before it ends.' };
  }, [ui]);

  // ---- status ----------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = ui.phase === 'done'
    ? 'Water boiled away — complete'
    : ui.phase === 'boiling'
      ? 'Boiling at 100 °C'
      : ui.phase === 'water'
        ? 'Heating water'
        : ui.phase === 'melting'
          ? 'Melting at 0 °C'
          : ui.on
            ? 'Heating ice'
            : ui.t > 0
              ? 'Heater off — paused'
              : 'Experiment ready';

  // ---- latent-heat analysis (read fresh from the sim on every UI sync) ---------------------
  const s = sim.current;
  const meltDur = s.meltEnd > s.meltStart ? s.meltEnd - s.meltStart : null;
  const meltAvg = meltDur && s.meltEnergy > 0 ? s.meltEnergy / meltDur : null;
  const boilDur = s.boilEnd > s.boilStart ? s.boilEnd - s.boilStart : null;
  const boilAvg = boilDur && s.boilEnergy > 0 ? s.boilEnergy / boilDur : null;
  const meltRow = rows.find((r) => r.kind === 'melt');
  const boilRow = rows.find((r) => r.kind === 'boil');

  // ---- render ------------------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.on ? 'active' : 'ready'}
      captionChip="States of matter"
      legend={[
        { color: '#e8632a', label: 'Temperature curve' },
        { color: '#f97316', label: 'Melting mark' },
        { color: '#2f7fb8', label: 'Boiling mark' },
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
            <option value={5}>5× faster</option>
            <option value={20}>20× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Heating bench — run the heater under the beaker of ice and watch the temperature curve draw itself"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); toggleHeater(); }
          }}
          onPointerDown={() => notePointer(false)}
        />
      }
      controls={
        <div>
          <div className="hc-layout">
            <div className="hc-actions">
              <div className="hc-power" data-nudge="power">
                <span>HEATER POWER</span>
                <select value={power} onChange={(e) => changePower(e.target.value)} aria-label="Heater power">
                  {POWERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <small>Power sets the slopes — the plateaus stay at 0 °C and 100 °C.</small>
              </div>
              <button
                className="action-button"
                type="button"
                data-nudge="heater"
                onClick={() => { toggleHeater(); }}
                disabled={ui.phase === 'done'}
              >
                <span className="dispense-icon" aria-hidden="true">{ui.on ? '⏹' : '🔥'}</span>
                <span>{ui.on ? 'Stop heater' : 'Start heater'}</span>
                <small>{ui.phase === 'done' ? 'the beaker is dry — reset to run again' : ui.on ? 'the plate hums while it heats' : '100 g of ice waits at −10 °C'}</small>
              </button>
            </div>
            <div className="hc-temp">
              <span>BEEKER THERMOMETER · LIVE</span>
              <div className="hc-main">
                <strong>{ui.T.toFixed(1)}</strong>
                <em>°C</em>
              </div>
              <div className="hc-sub">
                <span>{fmtClock(ui.t)} heated</span>
                <span>{ui.phase === 'ice' ? 'ice' : ui.phase === 'melting' ? `${Math.round(ui.meltFrac * 100)}% melted` : ui.phase === 'water' ? 'water' : ui.phase === 'boiling' ? `${Math.round(ui.vaporFrac * 100)}% boiled` : 'steam'}</span>
              </div>
              <div className="hc-track">
                <span style={{ width: `${clamp(((ui.T + 15) / 125) * 100, 0, 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>While ice melts or water boils, every joule from the heater goes into the phase change — so the temperature holds flat. Plateau length × power = mass × latent heat.</p></div>
          <div className="hc-marks">
            <button
              className={`mark-button${ui.phase === 'melting' ? ' armed' : ''}`}
              type="button"
              data-nudge="mark-melt"
              onClick={() => { markPlateau('melt'); }}
              disabled={ui.t <= 0 || meltMarked}
            >
              <span>❄ Mark melting plateau</span>
              <small>{meltMarked && meltRow ? `stamped at ${fmtClock(meltRow.t)} · ${meltRow.T.toFixed(1)} °C` : `stamp T = ${ui.T.toFixed(1)} °C at ${fmtClock(ui.t)}`}</small>
            </button>
            <button
              className={`mark-button boil${ui.phase === 'boiling' ? ' armed' : ''}`}
              type="button"
              data-nudge="mark-boil"
              onClick={() => { markPlateau('boil'); }}
              disabled={ui.t <= 0 || boilMarked}
            >
              <span>♨ Mark boiling plateau</span>
              <small>{boilMarked && boilRow ? `stamped at ${fmtClock(boilRow.t)} · ${boilRow.T.toFixed(1)} °C` : `stamp T = ${ui.T.toFixed(1)} °C at ${fmtClock(ui.t)}`}</small>
            </button>
          </div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Heating bench</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Beaker temperature</span><strong>{ui.T.toFixed(1)} <small>°C</small></strong>
            <div className="reading-track"><span style={{ width: `${clamp(((ui.T + 15) / 125) * 100, 0, 100)}%` }} /></div>
            <div className="reading-scale"><span>−15 °C</span><span>110 °C</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Phase</span><strong>{ui.phase === 'ice' ? 'Ice' : ui.phase === 'melting' ? 'Melting' : ui.phase === 'water' ? 'Water' : ui.phase === 'boiling' ? 'Boiling' : 'Steam'}</strong></div>
            <div><span>Heater</span><strong>{ui.on ? `${POWERS.find((p) => p.id === power)!.watts} W` : 'Off'}</strong></div>
            <div><span>Clock</span><strong>{fmtClock(ui.t)}</strong></div>
            <div><span>Melted</span><strong>{Math.round(ui.meltFrac * 100)}<small>%</small></strong></div>
            <div><span>Boiled away</span><strong>{Math.round(ui.vaporFrac * 100)}<small>%</small></strong></div>
            <div><span>Plateau</span><strong>{ui.phase === 'melting' ? 'At 0 °C' : ui.phase === 'boiling' ? 'At 100 °C' : '—'}</strong></div>
          </div>
          <div className="hc-latent">
            <span>LATENT HEAT FROM YOUR PLATEAUS</span>
            {meltDur ? (
              <p>Melting plateau: {meltDur.toFixed(0)} s{meltAvg ? ` · average power ${meltAvg.toFixed(0)} W` : ''} → L<sub>f</sub> = {(s.meltEnergy / M / 1000).toFixed(0)} kJ/kg <em>(accepted 334)</em></p>
            ) : (
              <p className="pending">Melting plateau not yet complete — keep heating.</p>
            )}
            {boilDur ? (
              <p>Boiling plateau: {boilDur.toFixed(0)} s{boilAvg ? ` · average power ${boilAvg.toFixed(0)} W` : ''} → L<sub>v</sub> = {(s.boilEnergy / M / 1000).toFixed(0)} kJ/kg <em>(accepted 2260)</em></p>
            ) : (
              <p className="pending">Boiling plateau not yet complete — keep heating.</p>
            )}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Set the heater to medium power and start it — the ice warms from −10 °C.</li>
              <li>Watch the curve flatten at 0 °C while the ice cubes melt away; mark the melting plateau.</li>
              <li>Watch the water climb to 100 °C and begin to boil; mark the boiling plateau.</li>
              <li>Let the beaker boil dry, then open Observations for the plateau analysis.</li>
              <li>Run it again at high or low power — the slopes change, the plateau temperatures never do.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Speed up playback (5× or 20×) to see the whole curve in a few minutes — the simulated clock, curve and plateau physics stay exactly consistent.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Plateau marks</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Mark the melting and boiling plateaus while the curve sits flat — the stamps land here with their (time, temperature) readings.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Plateau</th><th>Time</th><th>T (°C)</th><th>On plateau?</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const ok = r.kind === 'melt' ? Math.abs(r.T) <= 0.5 : Math.abs(r.T - 100) <= 0.5;
                    return (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.kind === 'melt' ? 'Melting' : 'Boiling'}</td>
                        <td>{fmtClock(r.t)}</td>
                        <td>{r.T.toFixed(1)}</td>
                        <td>{ok ? '✓ within ±0.5°' : '✗ off the flat'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <h3 style={{ marginTop: 16 }}>Plateau analysis</h3>
            {meltDur ? (
              <p className="observation-note">Melting lasted {meltDur.toFixed(0)} s. With average power {meltAvg?.toFixed(0)} W, the heat delivered was P·Δt — and L<sub>f</sub> = P·Δt/m = <strong>{(s.meltEnergy / M / 1000).toFixed(0)} kJ/kg</strong> against the accepted 334 kJ/kg.</p>
            ) : (
              <p className="observation-note">Complete the melting plateau to unlock its latent-heat analysis.</p>
            )}
            {boilDur ? (
              <p className="observation-note">Boiling lasted {boilDur.toFixed(0)} s at average power {boilAvg?.toFixed(0)} W, giving L<sub>v</sub> = P·Δt/m = <strong>{(s.boilEnergy / M / 1000).toFixed(0)} kJ/kg</strong> against the accepted 2260 kJ/kg.</p>
            ) : null}
            <p className="observation-note">The plateaus stayed flat even while the heater ran at full tilt — that hidden energy is the latent heat of the phase change.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why the curve has flat steps</h3>
            <p>While a substance stays in one phase, added heat raises its temperature at a steady rate governed by its specific heat capacity:</p>
            <div className="equation">Q = m·c·ΔT &nbsp;(warming ice or water)</div>
            <p>But while the phase itself is changing, added heat goes entirely into breaking or forming bonds — the temperature holds flat until the change is complete:</p>
            <div className="equation">Q = m·L &nbsp;(melting at 0 °C · boiling at 100 °C)</div>
            <p>That is why the heating curve of water is a staircase: a rising ramp for ice (c = 2100 J/kg·K), a flat step at 0 °C (L<sub>f</sub> = 334 kJ/kg), a longer ramp for water (c = 4186 J/kg·K), and a much longer flat step at 100 °C (L<sub>v</sub> = 2260 kJ/kg) before only steam remains. Heater power only changes how fast you walk the ramps and steps — never where the steps sit.</p>
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
