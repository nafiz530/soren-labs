import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { clamp, fmtClock, lerp } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './specific-heat.css';

/**
 * Specific heat of a metal — method of mixtures on a calorimeter bench.
 *
 * A 100 g metal block (copper / aluminium / iron) waits in an oven at 100 °C.
 * The student transfers it — by button or by dragging the block across — into
 * a stirred calorimeter holding 200 g of water at 25 °C. Both temperatures
 * relax exponentially toward the mixture temperature, and a live T–t curve
 * (lower third of the scene) shows the two traces meeting. The student reads
 * the stable T_mix, records the run, and the observation table computes
 * c = m_w·c_w·(T_mix − T_w) / (m_c·(T_c − T_mix)).
 */

const CW = 4186; // specific heat of water, J/kg·K
const MW = 0.2; // calorimeter water mass, kg
const MC = 0.1; // metal block mass, kg
const T_OVEN = 100; // oven / initial block temperature, °C
const T_WATER0 = 25; // initial water temperature, °C
const K_MIX = 2.2; // block–water thermal conductance with stirring, W/K

interface MaterialDef { id: string; name: string; c: number; face: string; edge: string; lite: string }
const MATERIALS: MaterialDef[] = [
  { id: 'copper', name: 'Copper', c: 385, face: '#cf8955', edge: '#8a4a2b', lite: '#f0b489' },
  { id: 'aluminium', name: 'Aluminium', c: 900, face: '#c4ccd5', edge: '#78828e', lite: '#eaeff4' },
  { id: 'iron', name: 'Iron', c: 450, face: '#707a87', edge: '#3d444e', lite: '#9aa3ae' },
];

/** Equilibrium temperature of the block + water system (method of mixtures). */
const mixTemp = (c: number) => (MC * c * T_OVEN + MW * CW * T_WATER0) / (MC * c + MW * CW);
/** Invert the mixture equation for the block's specific heat from a measured T_mix. */
const cFromMix = (tMix: number) => (MW * CW * (tMix - T_WATER0)) / (MC * (T_OVEN - tMix));

const MENTOR_STEPS: MentorStepDef[] = [
  { id: 'pick', title: 'Pick copper', detail: 'Set the block material to copper. The oven holds it at a steady 100 °C until you are ready.', hint: 'The calorimeter already holds 200 g of water at 25.0 °C.' },
  { id: 'transfer', title: 'Transfer the block', detail: 'Press “Transfer block to calorimeter” — or drag the hot block across yourself. It plunges in with a thunk.', hint: 'Playback speeds of 4× and 8× shorten the wait without touching the physics.' },
  { id: 'watch', title: 'Watch the curves meet', detail: 'The live curve plots water and block temperatures together. Stirring carries heat across until both settle at the mixture temperature.', hint: 'The block cools fastest at first — the relaxation flattens as the gap narrows.' },
  { id: 'record', title: 'Record T_mix', detail: 'Once the thermometer is stable, record the run. The table turns your T_mix into a specific heat capacity.', hint: 'c = m_w·c_w·(T_mix − 25) / (m_c·(100 − T_mix)).' },
  { id: 'compare', title: 'Compare with 385', detail: 'Open Observations: your computed c sits beside copper’s accepted 385 J/kg·K. How close did you land?', hint: 'Waiting for true equilibrium is what buys accuracy here.' },
  { id: 'repeat', title: 'Repeat for aluminium', detail: 'Switch the material to aluminium and run the whole experiment again. Its curve tells a different story.', hint: 'Aluminium stores more heat per degree — watch how the mixture temperature moves.' },
];

const BADGES: BadgeDef[] = [
  { id: 'first-mixing', title: 'First Mixing', icon: '♨', detail: 'Plunged the first hot block into the stirred calorimeter.' },
  { id: 'copper-done', title: 'Copper Done', icon: '◆', detail: 'Recorded a full copper run and computed its specific heat.' },
  { id: 'two-metals', title: 'Two Metals', icon: '⇄', detail: 'Recorded complete runs for two different metals.' },
  { id: 'calorimetry-pro', title: 'Calorimetry Pro', icon: '🎯', detail: 'Computed a specific heat capacity within 3% of the accepted value.' },
];

interface TrialRow { id: number; material: string; name: string; tMix: number; cComputed: number }

interface UiSnap { waterT: number; blockT: number; t: number; transferred: boolean; stable: boolean }

const meta = getLabBySlug('specific-heat')!;

export default function SpecificHeatLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    blockT: T_OVEN,
    waterT: T_WATER0,
    phase: 'oven' as 'oven' | 'drag' | 'fall' | 'water',
    t: 0,
    acc: 0,
    uiAcc: 0,
    sampleAcc: 0,
    tickN: 0,
    samples: [{ t: 0, w: T_WATER0, b: T_OVEN }] as { t: number; w: number; b: number }[],
    stable: false,
    pendingStable: false,
    entered: false,
    fallT: 0,
    dragX: 0,
    dragY: 0,
    stir: 0,
    sloshAt: 0,
    idle: 0,
    splash: [] as { x: number; y: number; r: number; a: number }[],
    levelAnim: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ----------------------------------------------------
  const [material, setMaterial] = useState('copper');
  const [speed, setSpeed] = useState(1);
  const [rows, setRows] = useState<TrialRow[]>([]);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [everCopper, setEverCopper] = useState(false);
  const [everStable, setEverStable] = useState(false);
  const [sawObs, setSawObs] = useState(false);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>({ waterT: T_WATER0, blockT: T_OVEN, t: 0, transferred: false, stable: false });

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
    setUi({ waterT: s.waterT, blockT: s.blockT, t: s.t, transferred: s.phase !== 'oven', stable: s.stable });
  }, []);

  // ---- mentor completion flags ---------------------------------------------
  const testedMaterials = new Set(rows.map((r) => r.material));
  const done = [
    everCopper,
    badges.includes('first-mixing'),
    everStable || rows.length > 0,
    rows.length >= 1,
    sawObs && rows.length >= 1,
    testedMaterials.has('aluminium'),
  ];

  useEffect(() => {
    if (material === 'copper') setEverCopper(true);
  }, [material]);

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
      case 'pick': return { target: 'material', gesture: 'tap', title: 'Pick copper', body: 'Open the material selector and choose copper — the mentor starts you on the classic metal.' };
      case 'transfer': return { target: 'transfer', gesture: 'press', title: 'Transfer the block', body: 'Press the transfer button — or drag the glowing block from the oven into the calorimeter.' };
      case 'watch': return { target: 'scene', gesture: 'point', title: 'Let it stir', body: 'Watch the two curves in the lower panel run toward each other — the stirrer keeps heat moving.' };
      case 'record': return { target: 'record', gesture: 'press', title: 'Record the run', body: 'The thermometer has settled — press “Record” to bank T_mix and compute the specific heat.' };
      case 'compare': return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your computed c lives in the Observations tab, beside copper’s accepted 385 J/kg·K.' };
      case 'repeat': return { target: 'material', gesture: 'tap', title: 'Switch to aluminium', body: 'Choose aluminium in the selector and transfer the new block — a second metal doubles the evidence.' };
      default: return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- geometry ---------------------------------------------------------------
  const geom = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 800;
    const h = canvas?.clientHeight ?? 500;
    const appB = h * 0.64;
    const ow = clamp(w * 0.21, 128, 205);
    const oh = clamp(appB * 0.6, 104, 158);
    const ox = 22;
    const oy = appB - oh;
    const blockHome = { x: ox + ow / 2, y: oy + 24 + 29 };
    const cwv = clamp(w * 0.27, 132, 185);
    const chh = clamp(appB * 0.52, 100, 152);
    const ccx = clamp(w * 0.6, ow + cwv / 2 + 46, w - cwv / 2 - 18);
    const cty = appB - chh;
    const mouth = { x0: ccx - cwv / 2 + 12, x1: ccx + cwv / 2 - 12, y0: cty - 34, y1: cty + 22 };
    return { w, h, appB, ox, oy, ow, oh, blockHome, ccx, cty, cwv, chh, mouth };
  }, []);

  // ---- physics + loop step ------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const mat = MATERIALS.find((m) => m.id === material)!;
    s.idle += dt;

    const mixing = s.phase === 'water';
    s.stir += (mixing ? 2.8 : 0.5) * dt * speed;

    s.acc += dt * speed;
    const h = 1 / 120;
    while (s.acc >= h) {
      s.acc -= h;
      if (s.phase === 'water') {
        // Newton exchange: q = K·(T_block − T_water). The pair conserves energy
        // exactly, so both temperatures relax exponentially onto T_mix.
        const d = s.blockT - s.waterT;
        s.blockT -= ((K_MIX * d) / (MC * mat.c)) * h;
        s.waterT += ((K_MIX * d) / (MW * CW)) * h;
        s.t += h;
        s.sampleAcc += h;
        if (s.sampleAcc >= 0.5) {
          s.sampleAcc -= 0.5;
          s.samples.push({ t: s.t, w: s.waterT, b: s.blockT });
          if (s.samples.length > 3200) s.samples.shift();
          s.tickN += 1;
          if (s.tickN % 5 === 0) labSound.tick();
        }
        if (!s.stable && Math.abs(s.blockT - s.waterT) < 0.05) {
          s.stable = true;
          s.pendingStable = true;
        }
        if (!s.stable && s.t - s.sloshAt > 2.4) {
          s.sloshAt = s.t;
          labSound.slosh(0.16);
        }
      }
    }

    // falling-block plunge (real time — it is an animation, not a measurement)
    if (s.phase === 'fall') {
      s.fallT += dt;
      if (!s.entered && s.fallT >= 0.42) {
        s.entered = true;
        labSound.thunk(false);
        const g = geom();
        const surfaceY = g.cty + 20 + (g.appB - 10 - (g.cty + 20)) * 0.38 - s.levelAnim * 8;
        s.splash.push({ x: g.ccx, y: surfaceY, r: 5, a: 0.85 }, { x: g.ccx, y: surfaceY, r: 13, a: 0.55 });
        earn('first-mixing');
      }
      if (s.fallT >= 0.78) s.phase = 'water';
    }

    // water-level bump after the block enters
    s.levelAnim += ((s.entered ? 1 : 0) - s.levelAnim) * Math.min(1, dt * 3.2);

    for (const sp of s.splash) {
      sp.r += 62 * dt;
      sp.a -= 1.5 * dt;
    }
    s.splash = s.splash.filter((sp) => sp.a > 0);

    if (s.pendingStable) {
      s.pendingStable = false;
      labSound.step();
      setEverStable(true);
      pushToast('info', '≈', `The curves have met — the mixture has settled at ${s.waterT.toFixed(2)} °C. Read T_mix and record the run.`);
    }

    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [material, speed, earn, pushToast, syncUi, geom]);

  // ---- drawing -------------------------------------------------------------------
  const drawFn = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = sim.current;
    const mat = MATERIALS.find((m) => m.id === material)!;
    const tMix = mixTemp(mat.c);
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

    const drawBlock = (bx: number, by: number, rot = 0, dim = false) => {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot);
      const sz = 26;
      const grad = ctx.createLinearGradient(-sz / 2, -sz / 2, sz / 2, sz / 2);
      grad.addColorStop(0, mat.lite);
      grad.addColorStop(0.55, mat.face);
      grad.addColorStop(1, mat.edge);
      ctx.fillStyle = grad;
      if (dim) ctx.globalAlpha = 0.9;
      roundRect(ctx, -sz / 2, -sz / 2, sz, sz, 5);
      ctx.fill();
      ctx.strokeStyle = mat.edge;
      ctx.lineWidth = 1.5;
      roundRect(ctx, -sz / 2, -sz / 2, sz, sz, 5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      roundRect(ctx, -sz / 2 + 4, -sz / 2 + 4, sz * 0.35, sz * 0.2, 2);
      ctx.fill();
      ctx.restore();
    };

    // ---------------- oven (left) ----------------
    const glow = 0.8 + 0.2 * Math.sin(s.idle * 2.2);
    const bodyG = ctx.createLinearGradient(0, g.oy, 0, g.oy + g.oh);
    bodyG.addColorStop(0, '#4d5a68');
    bodyG.addColorStop(1, '#39434f');
    ctx.fillStyle = bodyG;
    roundRect(ctx, g.ox, g.oy, g.ow, g.oh, 10);
    ctx.fill();
    ctx.fillStyle = '#2e3742';
    roundRect(ctx, g.ox + 12, g.oy + g.oh - 2, 14, 8, 3); ctx.fill();
    roundRect(ctx, g.ox + g.ow - 26, g.oy + g.oh - 2, 14, 8, 3); ctx.fill();
    ctx.strokeStyle = '#2b333d';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(g.ox + 18 + i * 12, g.oy + 10);
      ctx.lineTo(g.ox + 24 + i * 12, g.oy + 10);
      ctx.stroke();
    }
    const wwx = g.ox + g.ow / 2 - 34, wwy = g.oy + 24, www = 68, wwh = 58;
    const winG = ctx.createRadialGradient(wwx + www / 2, wwy + wwh / 2, 6, wwx + www / 2, wwy + wwh / 2, 52);
    winG.addColorStop(0, `rgba(249,164,106,${0.95 * glow})`);
    winG.addColorStop(1, `rgba(232,99,42,${0.55 * glow})`);
    ctx.fillStyle = winG;
    roundRect(ctx, wwx, wwy, www, wwh, 8);
    ctx.fill();
    ctx.strokeStyle = '#242c35';
    ctx.lineWidth = 2.5;
    roundRect(ctx, wwx, wwy, www, wwh, 8);
    ctx.stroke();

    // heat shimmer above the oven
    ctx.strokeStyle = 'rgba(232,99,42,0.26)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      for (let px = 0; px <= 30; px += 6) {
        const yy = g.oy - 4 - px * 0.5 + Math.sin(s.idle * 3 + px * 0.4 + i * 2) * 3;
        if (px === 0) ctx.moveTo(g.ox + g.ow / 2 - 15 + px, yy);
        else ctx.lineTo(g.ox + g.ow / 2 - 15 + px, yy);
      }
      ctx.stroke();
    }

    if (s.phase === 'oven') drawBlock(wwx + www / 2, wwy + wwh / 2);

    // drag affordance: dashed arc from oven toward the calorimeter
    if (s.phase === 'oven' && w > 520) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = 'rgba(232,99,42,0.38)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(g.ox + g.ow + 10, g.oy + g.oh / 2);
      ctx.quadraticCurveTo((g.ox + g.ow + g.ccx) / 2, g.oy - 6, g.ccx - g.cwv / 2 - 8, g.cty + 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---------------- calorimeter (right) ----------------
    const innerL = g.ccx - g.cwv / 2 + 10;
    const innerR = g.ccx + g.cwv / 2 - 10;
    const innerT = g.cty + 20;
    const innerB = g.appB - 10;
    const jacket = ctx.createLinearGradient(0, g.cty, 0, innerB);
    jacket.addColorStop(0, '#e3b45c');
    jacket.addColorStop(0.5, '#c8913b');
    jacket.addColorStop(1, '#9a6d26');
    ctx.fillStyle = jacket;
    roundRect(ctx, g.ccx - g.cwv / 2, g.cty, g.cwv, innerB - g.cty, 12);
    ctx.fill();
    ctx.strokeStyle = '#7c5a1e';
    ctx.lineWidth = 1.5;
    roundRect(ctx, g.ccx - g.cwv / 2, g.cty, g.cwv, innerB - g.cty, 12);
    ctx.stroke();
    ctx.fillStyle = '#f6ecd8';
    roundRect(ctx, innerL - 4, innerT - 4, innerR - innerL + 8, innerB - innerT + 8, 8);
    ctx.fill();

    // water (level bumps up slightly once the block is in)
    const waterH = (innerB - innerT) * 0.62 + s.levelAnim * 8;
    const waterY = innerB - waterH;
    const wgrad = ctx.createLinearGradient(0, waterY, 0, innerB);
    wgrad.addColorStop(0, '#d7e9f5');
    wgrad.addColorStop(1, '#a9cfe8');
    ctx.fillStyle = wgrad;
    roundRect(ctx, innerL, waterY, innerR - innerL, innerB - waterY, 6);
    ctx.fill();

    const restX = (innerL + innerR) / 2 - 16;
    const restY = innerB - 17;

    if (s.phase === 'water') {
      drawBlock(restX, restY + Math.sin(s.idle * 2) * 0.6, 0.06, true);
      // water tint over the submerged block
      ctx.fillStyle = 'rgba(169,207,232,0.28)';
      roundRect(ctx, innerL, waterY, innerR - innerL, innerB - waterY, 6);
      ctx.fill();
    }

    // surface highlight (wobbles while stirring)
    const wob = s.phase === 'water' ? Math.sin(s.idle * 3) : 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(innerL + 3, waterY + wob);
    ctx.quadraticCurveTo(g.ccx, waterY - 2 + wob, innerR - 3, waterY + wob);
    ctx.stroke();

    // splash rings
    for (const sp of s.splash) {
      ctx.strokeStyle = `rgba(214,235,248,${clamp(sp.a, 0, 1)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // lid (brass, with holes the rods pass through)
    const lidG = ctx.createLinearGradient(0, g.cty - 8, 0, g.cty + 12);
    lidG.addColorStop(0, '#e8bf63');
    lidG.addColorStop(1, '#b98a33');
    ctx.fillStyle = lidG;
    roundRect(ctx, g.ccx - g.cwv / 2 - 4, g.cty - 8, g.cwv + 8, 16, 6);
    ctx.fill();
    ctx.strokeStyle = '#8a6420';
    ctx.lineWidth = 1.5;
    roundRect(ctx, g.ccx - g.cwv / 2 - 4, g.cty - 8, g.cwv + 8, 16, 6);
    ctx.stroke();
    ctx.fillStyle = '#8a6420';
    roundRect(ctx, g.ccx + g.cwv * 0.34, g.cty - 14, 16, 7, 3);
    ctx.fill();

    // stirrer (rotating)
    const rodX = g.ccx - g.cwv * 0.17;
    const sway = Math.sin(s.stir) * 1.5;
    ctx.strokeStyle = '#aab6c2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rodX + sway, g.cty - 42);
    ctx.lineTo(rodX, innerB - 16);
    ctx.stroke();
    ctx.fillStyle = '#5d6a79';
    ctx.beginPath();
    ctx.arc(rodX + sway, g.cty - 44, 5, 0, Math.PI * 2);
    ctx.fill();
    const bl = Math.abs(Math.cos(s.stir)) * 15 + 3;
    ctx.strokeStyle = '#8d99a6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rodX - bl, innerB - 14);
    ctx.lineTo(rodX + bl, innerB - 14);
    ctx.stroke();
    ctx.strokeStyle = '#77828e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(rodX - bl * 0.7, innerB - 8);
    ctx.lineTo(rodX + bl * 0.7, innerB - 8);
    ctx.stroke();

    // thermometer (reads the water)
    const thx = g.ccx + g.cwv * 0.2;
    const thTop = g.cty - 48;
    const bulbY = innerB - 24;
    ctx.fillStyle = '#f4f7fa';
    roundRect(ctx, thx - 4, thTop, 8, bulbY - thTop + 8, 4);
    ctx.fill();
    ctx.strokeStyle = '#9fb0bd';
    ctx.lineWidth = 1.25;
    roundRect(ctx, thx - 4, thTop, 8, bulbY - thTop + 8, 4);
    ctx.stroke();
    ctx.strokeStyle = '#b9c4cf';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const ty = thTop + 6 + (i / 5) * (bulbY - thTop - 10);
      ctx.beginPath();
      ctx.moveTo(thx - 4, ty);
      ctx.lineTo(thx - 1, ty);
      ctx.stroke();
    }
    const frac = clamp((s.waterT - 20) / 85, 0.02, 1);
    const colTop = bulbY - 5 - frac * (bulbY - thTop - 14);
    ctx.fillStyle = s.stable ? '#e8443a' : '#e8632a';
    roundRect(ctx, thx - 1.75, colTop, 3.5, bulbY - 5 - colTop + 5, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(thx, bulbY + 2, 5.5, 0, Math.PI * 2);
    ctx.fill();
    if (s.stable) {
      ctx.strokeStyle = 'rgba(232,68,58,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(thx, bulbY + 2, 8 + Math.sin(s.idle * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // falling / dragged block
    if (s.phase === 'fall') {
      const startX = wwx + www / 2;
      const startY = wwy + wwh / 2;
      const midX = g.ccx;
      const midY = waterY + 2;
      if (s.fallT < 0.42) {
        const k = s.fallT / 0.42;
        drawBlock(lerp(startX, midX, k), lerp(startY, midY, k * k), s.fallT * 1.1);
      } else {
        const k = clamp((s.fallT - 0.42) / 0.36, 0, 1);
        drawBlock(lerp(midX, restX, k), lerp(midY, restY, k), 0.06 + (1 - k) * 0.2, true);
      }
    } else if (s.phase === 'drag') {
      drawBlock(s.dragX, s.dragY, 0.12);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(232,99,42,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.dragX, s.dragY);
      ctx.lineTo(g.ccx, g.cty - 6);
      ctx.stroke();
      ctx.setLineDash([]);
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
    const ty = (T: number) => ay1 - ((T - 20) / 85) * (ay1 - ay0);
    const xMax = Math.max(90, s.t * 1.12);
    const tx = (t: number) => ax0 + (t / xMax) * (ax1 - ax0);

    // grid
    ctx.strokeStyle = '#e6ebf1';
    ctx.lineWidth = 1;
    for (const T of [25, 50, 75, 100]) {
      ctx.beginPath();
      ctx.moveTo(ax0, ty(T));
      ctx.lineTo(ax1, ty(T));
      ctx.stroke();
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
    // axes
    ctx.strokeStyle = '#c5cdd6';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(ax0, ay0);
    ctx.lineTo(ax0, ay1);
    ctx.lineTo(ax1, ay1);
    ctx.stroke();

    // mixture-temperature guide once stable
    if (s.stable) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(249,115,22,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax0, ty(tMix));
      ctx.lineTo(ax1, ty(tMix));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // the two traces
    if (s.samples.length > 1) {
      const stride = Math.max(1, Math.ceil(s.samples.length / 700));
      const trace = (key: 'w' | 'b', color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.25;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < s.samples.length; i += stride) {
          const p = s.samples[i];
          const x = tx(p.t);
          const y = ty(key === 'w' ? p.w : p.b);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.lineTo(tx(s.t), ty(key === 'w' ? s.waterT : s.blockT));
        ctx.stroke();
      };
      trace('w', '#3f7fbf');
      trace('b', '#e8632a');
      // live dots
      const dot = (T: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(tx(s.t), ty(T), 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      };
      dot(s.waterT, '#3f7fbf');
      dot(s.blockT, '#e8632a');
    }
  }, [material, geom]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFn });

  // ---- controls -----------------------------------------------------------------
  const resetRun = useCallback(() => {
    const s = sim.current;
    s.phase = 'oven';
    s.blockT = T_OVEN;
    s.waterT = T_WATER0;
    s.t = 0;
    s.acc = 0;
    s.sampleAcc = 0;
    s.stable = false;
    s.entered = false;
    s.fallT = 0;
    s.splash = [];
    s.samples = [{ t: 0, w: T_WATER0, b: T_OVEN }];
    syncUi();
  }, [syncUi]);

  const transferBlock = useCallback(() => {
    const s = sim.current;
    if (s.phase !== 'oven') return;
    s.phase = 'fall';
    s.fallT = 0;
    s.entered = false;
    s.stable = false;
    s.t = 0;
    s.samples = [{ t: 0, w: s.waterT, b: s.blockT }];
    labSound.slide(0.7);
    notePointer(true);
    syncUi();
  }, [notePointer, syncUi]);

  // ---- pointer interaction -----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (s.phase !== 'oven') { notePointer(false); return; }
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const g = geom();
    if (Math.hypot(px - g.blockHome.x, py - g.blockHome.y) < 30) {
      s.phase = 'drag';
      s.dragX = px;
      s.dragY = py;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.35);
      notePointer(true);
    } else {
      notePointer(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (s.phase !== 'drag') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    s.dragX = clamp(e.clientX - rect.left, 14, (canvas.clientWidth || 800) - 14);
    s.dragY = clamp(e.clientY - rect.top, 14, geom().appB - 18);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (s.phase !== 'drag') return;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const g = geom();
    if (s.dragX > g.mouth.x0 && s.dragX < g.mouth.x1 && s.dragY > g.mouth.y0 && s.dragY < g.mouth.y1) {
      transferBlock();
    } else {
      s.phase = 'oven';
      labSound.slide(0.4);
      syncUi();
    }
  };

  const changeMaterial = (id: string) => {
    if (id === material) return;
    setMaterial(id);
    resetRun();
    labSound.tick();
    notePointer(true);
  };

  const recordRun = () => {
    const s = sim.current;
    if (!s.stable) return;
    const mat = MATERIALS.find((m) => m.id === material)!;
    const tMix = s.waterT;
    const cComp = cFromMix(tMix);
    const row: TrialRow = { id: rows.length + 1, material: mat.id, name: mat.name, tMix, cComputed: cComp };
    setRows((cur) => [...cur, row]);
    labSound.milestone();
    pushToast('good', '✎', `Recorded ${mat.name.toLowerCase()}: T_mix = ${tMix.toFixed(2)} °C → c = ${Math.round(cComp)} J/kg·K`);
    if (mat.id === 'copper') earn('copper-done');
    if (new Set([...rows.map((r) => r.material), mat.id]).size >= 2) earn('two-metals');
    if (Math.abs(cComp - mat.c) / mat.c <= 0.03) earn('calorimetry-pro');
    resetRun();
    notePointer(true);
  };

  const resetAll = () => {
    resetRun();
    setRows([]);
    setMentorIndex(0);
    setBadges([]);
    setEverStable(false);
    setSawObs(false);
  };

  // ---- coach ---------------------------------------------------------------------------
  const lastRow = rows.length ? rows[rows.length - 1] : null;
  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    const mat = MATERIALS.find((m) => m.id === material)!;
    if (!ui.transferred) {
      return { tone: 'info', line: `The ${mat.name.toLowerCase()} block waits in the oven at 100 °C, and 200 g of water sits at 25.0 °C. Transfer the block when you are ready.` };
    }
    if (!ui.stable) {
      return { tone: 'info', line: `Block ${ui.blockT.toFixed(1)} °C · water ${ui.waterT.toFixed(2)} °C — heat flows until the curves meet. Stirring keeps the exchange quick.` };
    }
    if (rows.length === 0) {
      return { tone: 'good', line: `The curves have met at T_mix = ${ui.waterT.toFixed(2)} °C. Record it — the table computes c from your reading.` };
    }
    if (lastRow) {
      const acc = MATERIALS.find((m) => m.id === lastRow.material)!.c;
      const err = ((lastRow.cComputed - acc) / acc) * 100;
      if (testedMaterials.size < 2) {
        return { tone: 'good', line: `c = ${Math.round(lastRow.cComputed)} J/kg·K for ${lastRow.name.toLowerCase()} — ${Math.abs(err).toFixed(1)}% from the accepted value. Switch metals and repeat.` };
      }
      return { tone: 'good', line: `${testedMaterials.size} metals measured. Copper 385, aluminium 900, iron 450 J/kg·K — your table shows how close calorimetry can get.` };
    }
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [material, ui, rows.length, lastRow, testedMaterials.size]);

  // ---- status ----------------------------------------------------------------------------
  const complete = done[done.length - 1];
  const statusText = complete
    ? 'Experiment complete'
    : ui.transferred
      ? ui.stable
        ? rows.length ? 'Run recorded — next metal' : 'Temperature stable — record it'
        : 'Mixing in progress'
      : 'Experiment ready';

  // ---- render ------------------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={complete ? 'complete' : ui.transferred ? 'active' : 'ready'}
      captionChip="Method of mixtures"
      legend={[
        { color: '#3f7fbf', label: 'Water temperature' },
        { color: '#e8632a', label: 'Block temperature' },
        { color: '#d9a441', label: 'Calorimeter' },
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
            <option value={8}>8× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Calorimeter bench — transfer the hot metal block into the stirred water and watch the mixing curve"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); transferBlock(); }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      }
      controls={
        <div>
          <div className="sh-layout">
            <div className="sh-actions">
              <div className="sh-material" data-nudge="material">
                <span>BLOCK MATERIAL · 100 g</span>
                <select value={material} onChange={(e) => changeMaterial(e.target.value)} aria-label="Block material">
                  {MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <small>The oven holds the block at 100 °C. Switching metals restarts the run.</small>
              </div>
              <button
                className="action-button"
                type="button"
                data-nudge="transfer"
                onClick={() => { transferBlock(); }}
                disabled={ui.transferred}
              >
                <span className="dispense-icon" aria-hidden="true">⬇</span>
                <span>{ui.transferred ? 'Block in the calorimeter' : 'Transfer block to calorimeter'}</span>
                <small>or drag the block across yourself</small>
              </button>
            </div>
            <div className="sh-temp">
              <span>CALORIMETER THERMOMETER · LIVE</span>
              <div className="sh-main">
                <strong>{ui.waterT.toFixed(2)}</strong>
                <em>°C water</em>
              </div>
              <div className="sh-sub">
                <span>block <b>{ui.blockT.toFixed(1)} °C</b></span>
                <span>{fmtClock(ui.t)}</span>
              </div>
              <div className="sh-converge" title="Curve convergence">
                <span style={{ width: `${clamp(100 - (Math.abs(ui.blockT - ui.waterT) / 75) * 100, 0, 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="hint-row"><span>✦</span><p style={{ margin: 0 }}>Whatever heat the block loses, the water gains: m<sub>c</sub>c<sub>c</sub>(100 − T<sub>mix</sub>) = m<sub>w</sub>c<sub>w</sub>(T<sub>mix</sub> − 25). Read T<sub>mix</sub> off the settled thermometer, and the table solves for c.</p></div>
          <button
            className="record-button"
            type="button"
            data-nudge="record"
            onClick={() => { recordRun(); }}
            disabled={!ui.stable}
          >
            {ui.stable ? `✎ Record T_mix = ${ui.waterT.toFixed(2)} °C → compute c` : 'Record unlocks when the curves have met'}
          </button>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Calorimeter bench</h2></div><span className="instrument-live">LIVE</span></div>
          <div className="reading-main"><span>Water temperature (thermometer)</span><strong>{ui.waterT.toFixed(2)} <small>°C</small></strong>
            <div className="reading-track"><span style={{ width: `${clamp(((ui.waterT - 20) / 85) * 100, 0, 100)}%` }} /></div>
            <div className="reading-scale"><span>20 °C</span><span>105 °C</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Block temperature</span><strong>{ui.blockT.toFixed(1)} <small>°C</small></strong></div>
            <div><span>Oven setpoint</span><strong>100.0 <small>°C</small></strong></div>
            <div><span>Water start</span><strong>25.00 <small>°C</small></strong></div>
            <div><span>Mixing clock</span><strong>{fmtClock(ui.t)}</strong></div>
            <div><span>Stirrer</span><strong>{ui.transferred ? 'Stirring' : 'Idle'}</strong></div>
            <div><span>Mixture status</span><strong>{ui.stable ? 'Stable' : ui.transferred ? 'Equilibrating' : 'Waiting'}</strong></div>
          </div>
          <div className="c-readout">
            <span>Computed specific heat — last record</span>
            <strong>{lastRow ? <>{Math.round(lastRow.cComputed)} <small>J/kg·K</small></> : <small style={{ fontSize: 13 }}>record a run to compute c</small>}</strong>
            {lastRow && (
              <p>{lastRow.name} · T_mix = {lastRow.tMix.toFixed(2)} °C · accepted {MATERIALS.find((m) => m.id === lastRow.material)!.c} J/kg·K · error {(((lastRow.cComputed - MATERIALS.find((m) => m.id === lastRow.material)!.c) / MATERIALS.find((m) => m.id === lastRow.material)!.c) * 100).toFixed(1)}%</p>
            )}
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Choose copper as the block material — the oven keeps it at 100 °C.</li>
              <li>Transfer the block into the stirred calorimeter (button, or drag it across).</li>
              <li>Watch the two temperature curves run together; wait for the thermometer to settle.</li>
              <li>Record the run — the stable T<sub>mix</sub> becomes a specific heat capacity in the table.</li>
              <li>Repeat with aluminium and iron, and compare each computed c with the accepted value.</li>
            </ol>
            <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>The last fraction of a degree is the slowest — that is the physics of exponential relaxation, not a glitch. Use the 4× or 8× playback speed to hurry the wait, then record only when the mixture is stable.</p></div>
          </>
        ),
        observations: (
          <>
            <h3>Your measurement table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">Transfer a block, let the curves meet, then record your first T<sub>mix</sub>. The table computes c for every run.</p>
            ) : (
              <table className="trial-table">
                <thead><tr><th>#</th><th>Metal</th><th>T<sub>block</sub> (°C)</th><th>T<sub>water</sub> (°C)</th><th>T<sub>mix</sub> (°C)</th><th>c (J/kg·K)</th><th>Error</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const acc = MATERIALS.find((m) => m.id === r.material)!.c;
                    return (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td>{r.name}</td>
                        <td>100.0</td>
                        <td>25.00</td>
                        <td>{r.tMix.toFixed(2)}</td>
                        <td>{Math.round(r.cComputed)}</td>
                        <td>{(((r.cComputed - acc) / acc) * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="observation-note">Accepted values: copper 385, aluminium 900, iron 450 J/kg·K. Each row solves c = m<sub>w</sub>c<sub>w</sub>(T<sub>mix</sub> − 25) / (m<sub>c</sub>(100 − T<sub>mix</sub>)) with m<sub>w</sub> = 200 g and m<sub>c</sub> = 100 g.</p>
            <p className="observation-note">A run recorded before the mixture settles lands low — the water has not yet caught all the heat the block still holds.</p>
          </>
        ),
        theory: (
          <>
            <h3>Why it works</h3>
            <p>Hot metal plunged into cool water loses exactly the energy the water gains — a calorimeter is built to keep that exchange inside the vessel. Writing heat lost equal to heat gained gives the method of mixtures:</p>
            <div className="equation">m<sub>c</sub> c<sub>c</sub> (T<sub>c</sub> − T<sub>mix</sub>) = m<sub>w</sub> c<sub>w</sub> (T<sub>mix</sub> − T<sub>w</sub>)</div>
            <p>Solving for the unknown specific heat of the metal:</p>
            <div className="equation">c<sub>c</sub> = m<sub>w</sub> c<sub>w</sub> (T<sub>mix</sub> − T<sub>w</sub>) / (m<sub>c</sub> (T<sub>c</sub> − T<sub>mix</sub>))</div>
            <p>The mixture temperature is an energy-weighted average, so metals with a large heat capacity drag it further from the water’s starting point — which is exactly why aluminium produces both a higher T<sub>mix</sub> and a slower convergence than copper. In this simulation the exchange follows Newton’s law of cooling with stirring, so the traces relax exponentially while conserving energy exactly.</p>
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
