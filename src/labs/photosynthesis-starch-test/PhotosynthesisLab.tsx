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
import './photosynthesis-starch-test.css';

/**
 * Photosynthesis: starch test — Biology, Builder tier (Experiment 030).
 *
 * Two potted geraniums grow on the back wall: one on a bright windowsill
 * (variegated leaves plus one all-green leaf) and one inside a dark cupboard,
 * destarched by 48 simulated hours without light. The student picks leaves by
 * dragging, then walks each one through the classic iodine protocol at the
 * bench: kill in boiling water, decolorize in an ethanol tube standing in a
 * hot-water bath (never near the flame — ethanol is flammable), rinse in cold
 * water, spread flat on a white tile and drop iodine on it. Regions that made
 * starch turn blue-black; regions that lacked light or chlorophyll stay
 * orange-brown. The observation table, starch-area bars and the conclusion
 * card are earned from what the student actually did — never given.
 */

const BOIL_SECS = 120; // simulated seconds held in boiling water
const ETHANOL_SECS = 90; // simulated seconds decolorizing in the ethanol tube
const RINSE_SECS = 30; // simulated seconds in the cold rinse
const FLAT_SECS = 2; // simulated seconds spreading flat on the tile
const DEV_SECS = 3; // simulated seconds for the iodine colour to develop
const BOIL_READY_TEMP = 95; // °C before a leaf may enter the boiling water
const BATH_MIN_TEMP = 55; // °C the water bath needs to keep working

type LeafKind = 'variegated-light' | 'green-light' | 'green-dark';

type LeafStage =
  | 'plant' | 'boiling' | 'boiled'
  | 'ethanol' | 'decolorized'
  | 'rinsing' | 'rinsed'
  | 'tile' | 'testing' | 'tested';

interface LeafState {
  id: number;
  kind: LeafKind;
  stage: LeafStage;
  slot: number; // home slot on its plant
  tileSlot: number; // position on the white tile once placed
  timer: number; // simulated seconds inside the current timed stage
  paleness: number; // 0 = green, 1 = fully bleached by ethanol
  flat: number; // 0..1 flattening on the tile
  iodine: number; // 0..1 colour development
  dropLocalX: number; // iodine stain centre, leaf-local
  dropLocalY: number;
  fx: number; // current draw position (logical px)
  fy: number;
}

interface ObsRow {
  id: number;
  leaf: string;
  treatment: string;
  region: string;
  colour: string;
  verdict: string;
  starch: boolean;
}

interface LeafSnap {
  id: number;
  kind: LeafKind;
  stage: LeafStage;
  timer: number;
  paleness: number;
  flat: number;
  iodine: number;
}

interface UiSnap {
  clock: number;
  boilTemp: number;
  bathTemp: number;
  doorOpen: number;
  flameOn: boolean;
  ethanolGreen: number;
  dangerCount: number;
  lastDangerAt: number;
  leaves: LeafSnap[];
  tested: number;
}

interface DragState {
  kind: 'leaf' | 'tube' | 'iodine';
  leafId?: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
}

const KIND_INFO: Record<LeafKind, {
  label: string; short: string; variegated: boolean;
  rimStarch: boolean; centreStarch: boolean; chloro: number; starchArea: number;
}> = {
  'variegated-light': {
    label: 'Variegated leaf — bright windowsill', short: 'Variegated · light',
    variegated: true, rimStarch: true, centreStarch: false, chloro: 55, starchArea: 55,
  },
  'green-light': {
    label: 'All-green leaf — bright windowsill', short: 'Green · light',
    variegated: false, rimStarch: true, centreStarch: true, chloro: 100, starchArea: 100,
  },
  'green-dark': {
    label: 'All-green leaf — dark cupboard, 48 h', short: 'Green · dark',
    variegated: false, rimStarch: false, centreStarch: false, chloro: 100, starchArea: 0,
  },
};

const STAGE_LABEL: Record<LeafStage, string> = {
  plant: 'On the plant',
  boiling: 'Killing in boiling water',
  boiled: 'Killed — ready for ethanol',
  ethanol: 'Decolorizing in ethanol',
  decolorized: 'Pale — ready to rinse',
  rinsing: 'Rinsing in cold water',
  rinsed: 'Rinsed — ready for the tile',
  tile: 'Spreading flat on the tile',
  testing: 'Iodine colour developing',
  tested: 'Result on the tile',
};

const TIMED_SECS: Partial<Record<LeafStage, number>> = {
  boiling: BOIL_SECS,
  ethanol: ETHANOL_SECS,
  rinsing: RINSE_SECS,
  testing: DEV_SECS,
};

const MENTOR_STEPS: MentorStepDef[] = [
  {
    id: 'pick', title: 'Pick a leaf',
    detail: 'Drag a leaf off one of the plants — start with a variegated leaf from the bright windowsill. You can also open the dark cupboard and take one of its green leaves later.',
    hint: 'Drag with a finger or mouse — or press “Next step” / Space to do it by button.',
  },
  {
    id: 'boil', title: 'Kill and soften it',
    detail: 'Drop the leaf into the beaker of boiling water on the tripod and hold it there for about two simulated minutes. Heat kills the cells and stops all chemistry inside the leaf.',
    hint: 'The flame must be lit and the water near 100 °C before the leaf goes in.',
  },
  {
    id: 'ethanol', title: 'Wash out the green',
    detail: 'Drag the killed leaf into the ethanol tube standing in the hot-water bath. Chlorophyll bleeds into the ethanol and the leaf turns pale — you cannot see a fair colour through green.',
    hint: 'Ethanol is flammable: keep the tube in its water bath, never near the Bunsen flame.',
  },
  {
    id: 'rinse', title: 'Rinse and spread',
    detail: 'Move the pale leaf to the beaker of cold water for a short rinse, then spread it flat on the white tile so every region is exposed.',
    hint: 'A flat, wet leaf takes the iodine evenly — curling hides regions.',
  },
  {
    id: 'iodine', title: 'Drop the iodine',
    detail: 'Drag the iodine dropper over the flattened leaf and let a drop fall. Watch the colour spread: blue-black means starch is there, orange-brown means it is not.',
    hint: 'One drop is plenty — let it spread across the whole leaf.',
  },
  {
    id: 'conclude', title: 'Read the map and conclude',
    detail: 'Test leaves from both plants, then open Observations: your table, the starch-area bars and the conclusion card wait on real evidence from your own hands.',
    hint: 'Compare the cupboard leaf with the windowsill leaf — and the cream centre with the green rim.',
  },
];

const BADGES: BadgeDef[] = [
  { id: 'first-clear', title: 'First pale leaf', icon: '🍃', detail: 'Decolorized a leaf in the ethanol water-bath.' },
  { id: 'safety-first', title: 'Safety first', icon: '🛡', detail: 'Kept the ethanol away from the flame for the whole run.' },
  { id: 'iodine-reader', title: 'Iodine reader', icon: '🟦', detail: 'Saw your first blue-black starch region develop.' },
  { id: 'light-dark', title: 'Light vs dark', icon: '🌗', detail: 'Concluded with evidence from both a light leaf and a dark-cupboard leaf.' },
  { id: 'variegation-mapped', title: 'Variegation mapped', icon: '🎯', detail: 'Read both rim and centre verdicts on one variegated leaf.' },
];

const CONCL_OPTS: { id: string; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'chloro', label: 'Chlorophyll in the green tissue' },
  { id: 'warm', label: 'Warm water' },
  { id: 'sugar', label: 'Sugar in the soil' },
];

// ---------------------------------------------------------------- scene layout

interface SceneLayout {
  s: number;
  benchY: number;
  win: { x: number; y: number; w: number; h: number; cx: number; sillY: number };
  lightPlant: { x: number; y: number; top: number };
  cup: { x: number; y: number; w: number; h: number };
  darkPlant: { x: number; y: number; top: number };
  bunsen: { cx: number; baseY: number; topY: number };
  boil: { cx: number; bottomY: number; mouthY: number; waterY: number; w: number; h: number };
  bath: { cx: number; bottomY: number; mouthY: number; waterY: number; w: number; h: number };
  tube: { cx: number; bottomY: number; mouthY: number; liquidY: number; w: number; h: number };
  rinse: { cx: number; bottomY: number; mouthY: number; waterY: number; w: number; h: number };
  tile: { x: number; y: number; w: number; h: number };
  iodineB: { cx: number; bottomY: number };
  dangerR: number;
}

function computeLayout(w: number, h: number): SceneLayout {
  const s = clamp(w / 900, 0.56, 1.05);
  const benchY = Math.round(h * 0.60);

  const winW = clamp(w * 0.20, 92, 200);
  const winH = clamp(h * 0.30, 92, 185);
  const win = { x: 14, y: 12, w: winW, h: winH, cx: 14 + winW / 2, sillY: 12 + winH };
  const lightPlant = { x: win.cx, y: win.sillY + 12, top: win.sillY + 12 - 64 * s };

  const cupW = clamp(w * 0.22, 106, 225);
  const cupH = clamp(h * 0.34, 126, 225);
  const cup = { x: w - 12 - cupW, y: 12, w: cupW, h: cupH };
  const darkPlant = { x: cup.x + cupW / 2, y: cup.y + cupH - 10, top: cup.y + cupH - 10 - 44 * s };

  const bunsen = { cx: Math.round(w * 0.24), baseY: benchY, topY: benchY - 44 * s };

  const tripodH = 62 * s;
  const boilH = 80 * s;
  const boilBottom = benchY - tripodH;
  const boil = {
    cx: bunsen.cx, bottomY: boilBottom, mouthY: boilBottom - boilH,
    waterY: boilBottom - boilH + 16 * s, w: 76 * s, h: boilH,
  };

  const bathH = 90 * s;
  const bath = {
    cx: Math.round(w * 0.45), bottomY: benchY, mouthY: benchY - bathH,
    waterY: benchY - bathH + 17 * s, w: 102 * s, h: bathH,
  };

  const tubeH = 124 * s;
  const tube = {
    cx: bath.cx, bottomY: bath.bottomY - 8 * s, mouthY: bath.bottomY - 8 * s - tubeH,
    liquidY: bath.bottomY - 8 * s - 78 * s, w: 24 * s, h: tubeH,
  };

  const rinseH = 76 * s;
  const rinse = {
    cx: Math.round(w * 0.615), bottomY: benchY, mouthY: benchY - rinseH,
    waterY: benchY - rinseH + 15 * s, w: 78 * s, h: rinseH,
  };

  const tileW = clamp(w * 0.30, 112, 250);
  const tileH = clamp(h - benchY - 28, 92, 205);
  const tile = { x: w - 14 - tileW, y: benchY + 14, w: tileW, h: tileH };

  const iodineB = { cx: Math.round(w * 0.10), bottomY: benchY };

  return {
    s, benchY, win, lightPlant, cup, darkPlant, bunsen, boil, bath, tube, rinse, tile, iodineB,
    dangerR: clamp(96 * s, 58, 108),
  };
}

function tileSlotPos(L: SceneLayout, slot: number): { x: number; y: number } {
  const cols = 3;
  const cellW = (L.tile.w - 22) / cols;
  const cellH = (L.tile.h - 18) / 2;
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  return { x: L.tile.x + 13 + col * cellW + cellW / 2, y: L.tile.y + 11 + row * cellH + cellH / 2 };
}

function leafAnchor(lf: LeafState, L: SceneLayout, animT: number): { x: number; y: number } {
  const sway = Math.sin(animT * 1.3 + lf.id * 1.7) * 2.4;
  switch (lf.stage) {
    case 'plant': {
      if (lf.kind === 'green-dark') {
        const offs = [[-17, -6], [15, -15]];
        const o = offs[lf.slot % 2];
        return { x: L.darkPlant.x + o[0] * L.s + sway * 0.4, y: L.darkPlant.top + 12 * L.s + o[1] * L.s };
      }
      const offs = [[-30, -16], [2, -38], [30, -8]];
      const o = offs[lf.slot % 3];
      return { x: L.lightPlant.x + o[0] * L.s + sway, y: L.lightPlant.top + 18 * L.s + o[1] * L.s };
    }
    case 'boiling':
      return { x: L.boil.cx + Math.sin(animT * 2.1 + lf.id) * 3, y: (L.boil.waterY + L.boil.bottomY) / 2 };
    case 'boiled':
      return { x: L.boil.cx + L.boil.w / 2 + 9 * L.s, y: L.boil.mouthY - 4 };
    case 'ethanol':
      return { x: L.tube.cx + Math.sin(animT * 1.6 + lf.id) * 1.5, y: L.tube.liquidY + 30 * L.s };
    case 'decolorized':
      return { x: L.tube.cx + L.tube.w / 2 + 8 * L.s, y: L.tube.mouthY - 2 };
    case 'rinsing':
      return { x: L.rinse.cx + Math.sin(animT * 1.8 + lf.id) * 2, y: (L.rinse.waterY + L.rinse.bottomY) / 2 };
    case 'rinsed':
      return { x: L.rinse.cx + L.rinse.w / 2 + 8 * L.s, y: L.rinse.mouthY - 4 };
    default:
      return tileSlotPos(L, lf.tileSlot);
  }
}

function makeLeaves(): LeafState[] {
  const specs: { kind: LeafKind; slot: number }[] = [
    { kind: 'variegated-light', slot: 0 },
    { kind: 'variegated-light', slot: 1 },
    { kind: 'green-light', slot: 2 },
    { kind: 'green-dark', slot: 0 },
    { kind: 'green-dark', slot: 1 },
  ];
  return specs.map((sp, i) => ({
    id: i + 1,
    kind: sp.kind,
    stage: 'plant' as LeafStage,
    slot: sp.slot,
    tileSlot: 0,
    timer: 0,
    paleness: 0,
    flat: 0,
    iodine: 0,
    dropLocalX: 0,
    dropLocalY: 0,
    fx: 0,
    fy: 0,
  }));
}

const INITIAL_UI: UiSnap = {
  clock: 0, boilTemp: 92, bathTemp: 80, doorOpen: 0, flameOn: true,
  ethanolGreen: 0, dangerCount: 0, lastDangerAt: -100, leaves: [], tested: 0,
};

const meta = getLabBySlug('photosynthesis-starch-test')!;

export default function PhotosynthesisLab() {
  // ---- simulation state (refs — the canvas loop owns the physics) ----------
  const sim = useRef({
    simTime: 0,
    animT: 0,
    doorOpen: 0,
    doorTarget: 0,
    flameOn: true,
    boilTemp: 92,
    bathTemp: 80,
    ethanolGreen: 0,
    leaves: makeLeaves(),
    drag: null as DragState | null,
    tubeFx: 0,
    tubeFy: 0,
    tubeInit: false,
    iodineFx: 0,
    iodineFy: 0,
    iodineInit: false,
    dangerCount: 0,
    lastDangerAt: -100,
    lastDangerReal: -100,
    dangerFlash: 0,
    dropAnim: null as null | { x: number; y: number; tx: number; ty: number; t: number },
    steam: [] as { x: number; y: number; r: number; life: number; max: number; seed: number }[],
    bubbles: [] as { x: number; y: number; r: number; v: number; seed: number }[],
    steamAcc: 0,
    bubbleAcc: 0,
    loopMode: '' as '' | 'pour' | 'hum',
    testOrder: 0,
    rowSeq: 0,
    uiAcc: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ---- student controls ---------------------------------------------------
  const [speed, setSpeed] = useState(1);
  const [mentorIndex, setMentorIndex] = useState(0);
  const [mentorAcked, setMentorAcked] = useState(false);
  const [rows, setRows] = useState<ObsRow[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null>(null);
  const [ui, setUi] = useState<UiSnap>(INITIAL_UI);
  const [dropNote, setDropNote] = useState<{ tone: CoachTone; line: string } | null>(null);
  const [conclSel, setConclSel] = useState<string[]>([]);
  const [conclusion, setConclusion] = useState<null | 'correct' | 'wrong'>(null);
  const [conclNote, setConclNote] = useState('');

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

  useEffect(() => {
    if (!dropNote) return;
    const t = window.setTimeout(() => setDropNote(null), 5600);
    return () => window.clearTimeout(t);
  }, [dropNote]);

  const syncUi = useCallback(() => {
    const s = sim.current;
    setUi({
      clock: s.simTime,
      boilTemp: s.boilTemp,
      bathTemp: s.bathTemp,
      doorOpen: s.doorOpen,
      flameOn: s.flameOn,
      ethanolGreen: s.ethanolGreen,
      dangerCount: s.dangerCount,
      lastDangerAt: s.lastDangerAt,
      tested: s.leaves.filter((l) => l.stage === 'tested').length,
      leaves: s.leaves.map((l) => ({
        id: l.id, kind: l.kind, stage: l.stage, timer: l.timer,
        paleness: l.paleness, flat: l.flat, iodine: l.iodine,
      })),
    });
  }, []);

  // ---- mentor completion flags ---------------------------------------------
  const stageSet = (stages: LeafStage[]) => ui.leaves.some((l) => stages.includes(l.stage));
  const done = [
    stageSet(['boiling', 'boiled', 'ethanol', 'decolorized', 'rinsing', 'rinsed', 'tile', 'testing', 'tested']),
    stageSet(['boiled', 'ethanol', 'decolorized', 'rinsing', 'rinsed', 'tile', 'testing', 'tested']),
    stageSet(['decolorized', 'rinsing', 'rinsed', 'tile', 'testing', 'tested']),
    stageSet(['tile', 'testing', 'tested']),
    stageSet(['tested']),
    conclusion === 'correct',
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
    const s = sim.current;
    const timedLeaf = s.leaves.find((l) => l.stage in TIMED_SECS);
    if (timedLeaf) {
      return { target: 'scene', gesture: 'point', title: 'Let it work', body: `${STAGE_LABEL[timedLeaf.stage]} — the simulated clock is running. Speed playback up in the toolbar if you are impatient.` };
    }
    switch (MENTOR_STEPS[mentorIndex]?.id) {
      case 'pick':
        return { target: 'scene', gesture: 'drag', title: 'Pick a leaf', body: 'Drag a variegated leaf off the windowsill plant — grab it near the blade and pull it away.' };
      case 'boil':
        return { target: 'scene', gesture: 'drag', title: 'Into the boiling water', body: 'Drag your leaf over the beaker on the tripod, above the Bunsen flame, and let go.' };
      case 'ethanol':
        return { target: 'scene', gesture: 'drag', title: 'Into the ethanol tube', body: 'Drag the killed leaf into the slim tube standing in the hot-water bath — never near the flame.' };
      case 'rinse':
        return { target: 'scene', gesture: 'drag', title: 'Rinse, then the tile', body: 'Drag the pale leaf into the cold-water beaker, then onto the white tile on the right.' };
      case 'iodine':
        return { target: 'scene', gesture: 'drag', title: 'Drop the iodine', body: 'Drag the amber iodine dropper over the flattened leaf on the tile and release.' };
      case 'conclude':
        return { target: 'observations', gesture: 'tap', title: 'Open Observations', body: 'Your table, starch bars and the conclusion card live in the Observations tab.' };
      default:
        return null;
    }
  }, [mentorAcked, mentorIndex]);

  const { nudge, notePointer, dismiss } = useNudge({ getPlan });

  // ---- finishing a tested leaf: rows, badges, sounds --------------------------
  const finishLeaf = useCallback((lf: LeafState) => {
    const info = KIND_INFO[lf.kind];
    const treatment = 'Boiled 2 min · ethanol bath · rinsed';
    const newRows: ObsRow[] = [];
    const s = sim.current;
    if (info.variegated) {
      newRows.push(
        {
          id: s.rowSeq + 1, leaf: info.label, treatment, region: 'Green rim (chlorophyll)',
          colour: 'Blue-black', verdict: 'Starch present', starch: true,
        },
        {
          id: s.rowSeq + 2, leaf: info.label, treatment, region: 'Cream centre (no chlorophyll)',
          colour: 'Orange-brown', verdict: 'No starch', starch: false,
        },
      );
      s.rowSeq += 2;
    } else {
      newRows.push({
        id: s.rowSeq + 1, leaf: info.label, treatment,
        region: 'Whole blade', colour: info.rimStarch ? 'Blue-black' : 'Orange-brown',
        verdict: info.rimStarch ? 'Starch present' : 'No starch', starch: info.rimStarch,
      });
      s.rowSeq += 1;
    }
    setRows((cur) => [...cur, ...newRows]);
    labSound.ping(620, 0.09);
    if (info.rimStarch) {
      earn('iodine-reader');
      pushToast('good', '🟦', 'Blue-black — that region made starch. The table has your rows.');
    } else {
      pushToast('info', '🟫', 'Orange-brown — no starch stored there. The table has your rows.');
    }
    if (info.variegated) earn('variegation-mapped');
  }, [earn, pushToast]);

  // ---- simulation step ---------------------------------------------------------
  const stepFn = useCallback((dt: number) => {
    const s = sim.current;
    const dts = dt * speed;
    s.animT += dt;
    s.simTime += dts;

    // cupboard door glide (real time — it is a hinge, not chemistry)
    const doorRate = 2.6 * dt;
    s.doorOpen = s.doorOpen + clamp(s.doorTarget - s.doorOpen, -doorRate, doorRate);

    // temperatures
    if (s.flameOn) s.boilTemp = Math.min(100, s.boilTemp + 0.55 * dts);
    else s.boilTemp = Math.max(22, s.boilTemp - 0.22 * dts);
    s.bathTemp = Math.max(22, s.bathTemp - 0.011 * dts);

    const canvas = canvasRef.current;
    const w = canvas?.clientWidth ?? 820;
    const h = canvas?.clientHeight ?? 540;
    const L = computeLayout(w, h);

    // leaves: timers + motion
    for (const lf of s.leaves) {
      if (lf.fx === 0 && lf.fy === 0) {
        const a0 = leafAnchor(lf, L, s.animT);
        lf.fx = a0.x;
        lf.fy = a0.y;
      }
      if (lf.stage === 'boiling') {
        lf.timer += dts;
        if (lf.timer >= BOIL_SECS) {
          lf.timer = BOIL_SECS;
          lf.stage = 'boiled';
          labSound.thunk(false);
          pushToast('good', '🌿', 'Killed and softened — the leaf is ready for the ethanol bath.');
        }
      } else if (lf.stage === 'ethanol') {
        lf.timer += dts;
        lf.paleness = clamp(lf.timer / ETHANOL_SECS, 0, 1);
        s.ethanolGreen = Math.max(s.ethanolGreen, lf.paleness);
        if (lf.timer >= ETHANOL_SECS) {
          lf.timer = ETHANOL_SECS;
          lf.stage = 'decolorized';
          labSound.glassClink(true);
          pushToast('good', '🍃', 'Chlorophyll out — the leaf is pale and the ethanol is green.');
          earn('first-clear');
        }
      } else if (lf.stage === 'rinsing') {
        lf.timer += dts;
        if (lf.timer >= RINSE_SECS) {
          lf.timer = RINSE_SECS;
          lf.stage = 'rinsed';
          labSound.slosh(0.45);
        }
      } else if (lf.stage === 'tile') {
        lf.flat = clamp(lf.flat + dts / FLAT_SECS, 0, 1);
      } else if (lf.stage === 'testing') {
        lf.iodine = clamp(lf.iodine + dts / DEV_SECS, 0, 1);
        if (lf.iodine >= 1) {
          lf.stage = 'tested';
          finishLeaf(lf);
        }
      }

      if (s.drag?.kind === 'leaf' && s.drag.leafId === lf.id) {
        lf.fx = s.drag.x;
        lf.fy = s.drag.y;
        continue;
      }
      const a = leafAnchor(lf, L, s.animT);
      const k = 1 - Math.exp(-9 * dt);
      lf.fx += (a.x - lf.fx) * k;
      lf.fy += (a.y - lf.fy) * k;
    }

    // ethanol tube + iodine dropper motion
    if (!s.tubeInit) { s.tubeFx = L.tube.cx; s.tubeFy = (L.tube.mouthY + L.tube.bottomY) / 2; s.tubeInit = true; }
    if (!s.iodineInit) { s.iodineFx = L.iodineB.cx; s.iodineFy = L.iodineB.bottomY - 34 * L.s; s.iodineInit = true; }
    if (s.drag?.kind === 'tube') {
      s.tubeFx = s.drag.x;
      s.tubeFy = s.drag.y;
      // flammable liquid near a naked flame?
      const fx = L.bunsen.cx;
      const fy = L.bunsen.topY - 12 * L.s;
      if (Math.hypot(s.drag.x - fx, s.drag.y - fy) < L.dangerR && s.animT - s.lastDangerReal > 1.6) {
        s.lastDangerAt = s.simTime;
        s.lastDangerReal = s.animT;
        s.dangerCount += 1;
        s.dangerFlash = 1;
        labSound.warn();
        pushToast('warn', '🔥', 'Ethanol is flammable — keep the tube in its warm-water bath, never near the flame.');
      }
    } else {
      const tk = 1 - Math.exp(-8 * dt);
      s.tubeFx += (L.tube.cx - s.tubeFx) * tk;
      s.tubeFy += ((L.tube.mouthY + L.tube.bottomY) / 2 - s.tubeFy) * tk;
    }
    if (s.drag?.kind === 'iodine') {
      s.iodineFx = s.drag.x;
      s.iodineFy = s.drag.y;
    } else {
      const ik = 1 - Math.exp(-8 * dt);
      s.iodineFx += (L.iodineB.cx - s.iodineFx) * ik;
      s.iodineFy += (L.iodineB.bottomY - 34 * L.s - s.iodineFy) * ik;
    }
    s.dangerFlash = Math.max(0, s.dangerFlash - dt * 1.3);

    // falling iodine droplet
    if (s.dropAnim) {
      s.dropAnim.t += dt * 4.5;
      if (s.dropAnim.t >= 1) s.dropAnim = null;
    }

    // steam wisps
    const boilSteam = s.boilTemp > 96 ? 13 : s.boilTemp > 80 ? 4 : 0;
    const bathSteam = s.bathTemp > 62 ? 5 : 0;
    s.steamAcc += (boilSteam + bathSteam) * dt;
    while (s.steamAcc >= 1) {
      s.steamAcc -= 1;
      const fromBath = bathSteam > 0 && Math.random() < bathSteam / (boilSteam + bathSteam + 0.001);
      const src = fromBath ? L.bath : L.boil;
      s.steam.push({
        x: src.cx + (Math.random() - 0.5) * src.w * 0.45,
        y: src.waterY - 2,
        r: 4 + Math.random() * 5,
        life: 0,
        max: 1.5 + Math.random() * 0.9,
        seed: Math.random() * 6.283,
      });
    }
    for (const p of s.steam) {
      p.life += dt;
      p.y -= (20 + p.seed * 3.5) * dt;
      p.x += Math.sin(p.life * 2.2 + p.seed) * 9 * dt;
      p.r += 9 * dt;
    }
    if (s.steam.length > 110) s.steam.splice(0, s.steam.length - 110);
    s.steam = s.steam.filter((p) => p.life < p.max);

    // boiling bubbles
    if (s.boilTemp > 97) {
      s.bubbleAcc += 16 * dt;
      while (s.bubbleAcc >= 1) {
        s.bubbleAcc -= 1;
        s.bubbles.push({
          x: L.boil.cx + (Math.random() - 0.5) * (L.boil.w - 14),
          y: L.boil.bottomY - 6,
          r: 1.2 + Math.random() * 2.2,
          v: 26 + Math.random() * 30,
          seed: Math.random() * 6.283,
        });
      }
    }
    for (const b of s.bubbles) {
      b.y -= b.v * dt;
      b.x += Math.sin(b.y * 0.35 + b.seed) * 5 * dt;
    }
    s.bubbles = s.bubbles.filter((b) => b.y > L.boil.waterY + 3);

    // continuous sound: boiling water pours, otherwise the burner hums
    const anyBoiling = s.leaves.some((l) => l.stage === 'boiling') || s.boilTemp > 99.4;
    const want: '' | 'pour' | 'hum' = anyBoiling ? 'pour' : s.flameOn ? 'hum' : '';
    if (want !== s.loopMode) {
      if (s.loopMode) labSound.stopLoop();
      if (want) labSound.startLoop(want);
      s.loopMode = want;
    }

    // UI snapshot at ~10 Hz
    s.uiAcc += dt;
    if (s.uiAcc > 0.1) {
      s.uiAcc = 0;
      syncUi();
    }
  }, [speed, earn, pushToast, syncUi, finishLeaf]);

  useLabLoop({ canvasRef, step: stepFn, draw: drawFnBuiltin });

  // ---- bench toggles ------------------------------------------------------------
  const toggleFlame = useCallback(() => {
    const s = sim.current;
    s.flameOn = !s.flameOn;
    labSound.click();
    syncUi();
  }, [syncUi]);

  const toggleDoor = useCallback(() => {
    const s = sim.current;
    s.doorTarget = s.doorTarget > 0.5 ? 0 : 1;
    labSound.creak(s.doorTarget > 0.5 ? 0.8 : 0.5);
    syncUi();
  }, [syncUi]);

  const startTest = useCallback((lf: LeafState) => {
    const s = sim.current;
    lf.stage = 'testing';
    lf.iodine = 0;
    lf.dropLocalX = (Math.random() - 0.5) * 18;
    lf.dropLocalY = (Math.random() - 0.5) * 18;
    s.dropAnim = { x: s.iodineFx, y: s.iodineFy + 42, tx: lf.fx, ty: lf.fy, t: 0 };
    labSound.drip(true);
    pushToast('info', '💧', 'Iodine on — watch the colour crawl across the leaf.');
  }, [pushToast]);

  const placeOnTile = useCallback((lf: LeafState) => {
    const s = sim.current;
    lf.stage = 'tile';
    lf.flat = 0;
    lf.tileSlot = s.testOrder;
    s.testOrder += 1;
    labSound.thunk(true);
  }, []);

  const zoneAt = (px: number, py: number, L: SceneLayout): 'boil' | 'tube' | 'rinse' | 'tile' | null => {
    const r = Math.max(44, 58 * L.s);
    if (Math.hypot(px - L.boil.cx, py - (L.boil.mouthY + 6)) < r) return 'boil';
    if (Math.hypot(px - L.tube.cx, py - (L.tube.mouthY + 6)) < r) return 'tube';
    if (Math.hypot(px - L.rinse.cx, py - (L.rinse.mouthY + 6)) < r) return 'rinse';
    if (px > L.tile.x - 14 && px < L.tile.x + L.tile.w + 14 && py > L.tile.y - 14 && py < L.tile.y + L.tile.h + 14) return 'tile';
    return null;
  };

  // ---- pointer interaction ---------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = sim.current;
    if (s.drag) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const L = computeLayout(canvas.clientWidth, canvas.clientHeight);

    // cupboard door (face or handle) — opens and closes the dark home
    const doorW = L.cup.w - 8;
    const doorX = L.cup.x + 4 - s.doorOpen * doorW * 0.86;
    if (px > doorX - 8 && px < doorX + doorW + 8 && py > L.cup.y && py < L.cup.y + L.cup.h) {
      toggleDoor();
      notePointer(true);
      return;
    }

    // Bunsen burner body — tap to light / snuff the flame
    if (Math.hypot(px - L.bunsen.cx, py - (L.bunsen.baseY - 15 * L.s)) < 34 * L.s) {
      toggleFlame();
      notePointer(true);
      return;
    }

    // iodine dropper
    if (Math.hypot(px - s.iodineFx, py - s.iodineFy) < 30 * L.s + 12) {
      s.drag = { kind: 'iodine', x: px, y: py, sx: px, sy: py };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.glassClink(true);
      notePointer(true);
      return;
    }

    // pickable leaves first (a pale leaf parked at the tube mouth beats the tube)
    const grabbable = ['plant', 'boiled', 'decolorized', 'rinsed'];
    let best: LeafState | null = null;
    let bestD = 38 * L.s + 14;
    for (const lf of s.leaves) {
      if (!grabbable.includes(lf.stage)) continue;
      if (lf.stage === 'plant' && lf.kind === 'green-dark' && s.doorOpen < 0.75) continue;
      const d = Math.hypot(px - lf.fx, py - lf.fy);
      if (d < bestD) { bestD = d; best = lf; }
    }
    if (best) {
      s.drag = { kind: 'leaf', leafId: best.id, x: px, y: py, sx: px, sy: py };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.creak(0.35);
      notePointer(true);
      return;
    }

    // ethanol tube — grab it low, away from any pale leaf parked at its mouth
    const tubeLowerY = s.tubeFy + 30 * L.s;
    if (Math.hypot(px - s.tubeFx, py - tubeLowerY) < 26 * L.s + 10) {
      if (s.leaves.some((l) => l.stage === 'ethanol')) {
        setDropNote({ tone: 'info', line: 'The leaf is mid-decolorization — let the ethanol finish its work before you move the tube.' });
        notePointer(false);
        return;
      }
      s.drag = { kind: 'tube', x: px, y: py, sx: px, sy: py };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      labSound.glassClink(false);
      notePointer(true);
      return;
    }

    notePointer(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    s.drag.x = e.clientX - rect.left;
    s.drag.y = e.clientY - rect.top;
    if (s.drag.kind === 'leaf') {
      const lf = s.leaves.find((l) => l.id === s.drag?.leafId);
      if (lf) { lf.fx = s.drag.x; lf.fy = s.drag.y; }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s.drag) return;
    const canvas = canvasRef.current;
    try { canvas?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const drag = s.drag;
    s.drag = null;
    const L = computeLayout(canvas?.clientWidth ?? 820, canvas?.clientHeight ?? 540);

    if (drag.kind === 'tube') {
      // tube glides home on its own; any flame proximity already triggered the warn
      labSound.thunk(true);
      return;
    }

    if (drag.kind === 'iodine') {
      let hit: LeafState | null = null;
      let hd = 34 * L.s + 12;
      for (const lf of s.leaves) {
        if (lf.stage !== 'tile' || lf.flat < 0.85) continue;
        const d = Math.hypot(drag.x - lf.fx, drag.y - lf.fy);
        if (d < hd) { hd = d; hit = lf; }
      }
      if (hit) {
        startTest(hit);
        notePointer(true);
      } else {
        setDropNote({ tone: 'info', line: 'Drop the iodine onto a rinsed leaf lying flat on the white tile — drag the amber dropper right over it.' });
        notePointer(false);
      }
      return;
    }

    // a leaf was released — which vessel did it land on?
    const lf = s.leaves.find((l) => l.id === drag.leafId);
    if (!lf) return;
    const zone = zoneAt(drag.x, drag.y, L);
    const nextHint: Partial<Record<LeafStage, string>> = {
      plant: 'it needs the boiling water on the tripod first',
      boiled: 'it goes into the ethanol tube in the hot-water bath next',
      decolorized: 'it needs the cold-water rinse next',
      rinsed: 'it is ready for the white tile',
    };

    if (zone === 'boil') {
      if (lf.stage !== 'plant') {
        labSound.thunk(true);
        setDropNote({ tone: 'info', line: `Not the boiling water again — ${nextHint[lf.stage] ?? 'that step is already done'}.` });
        notePointer(false);
        return;
      }
      if (s.boilTemp < BOIL_READY_TEMP) {
        labSound.thunk(true);
        setDropNote({ tone: 'warn', line: `The water is only ${Math.round(s.boilTemp)} °C — wait for a rolling boil (95 °C and up) before the leaf goes in.` });
        notePointer(false);
        return;
      }
      lf.stage = 'boiling';
      lf.timer = 0;
      labSound.drip(false);
      labSound.slosh(0.6);
      pushToast('good', '♨', 'Leaf in the boiling water — heat kills the cells and stops the chemistry inside.');
      notePointer(true);
      return;
    }

    if (zone === 'tube') {
      if (lf.stage !== 'boiled') {
        labSound.thunk(true);
        setDropNote({ tone: 'info', line: `The ethanol tube takes a killed leaf — ${nextHint[lf.stage] ?? 'boil it first'}.` });
        notePointer(false);
        return;
      }
      if (s.bathTemp < BATH_MIN_TEMP) {
        labSound.thunk(true);
        setDropNote({ tone: 'warn', line: `The water bath has cooled to ${Math.round(s.bathTemp)} °C — it needs about 55 °C to warm the ethanol safely.` });
        notePointer(false);
        return;
      }
      lf.stage = 'ethanol';
      lf.timer = 0;
      labSound.glassClink(true);
      labSound.slosh(0.4);
      pushToast('good', '🧪', 'Leaf in the ethanol — chlorophyll will bleed out and the leaf will turn pale.');
      notePointer(true);
      return;
    }

    if (zone === 'rinse') {
      if (lf.stage !== 'decolorized') {
        labSound.thunk(true);
        setDropNote({ tone: 'info', line: `Rinse comes after the ethanol bath — ${nextHint[lf.stage] ?? 'decolorize it first'}.` });
        notePointer(false);
        return;
      }
      lf.stage = 'rinsing';
      lf.timer = 0;
      labSound.drip(false);
      labSound.slosh(0.5);
      notePointer(true);
      return;
    }

    if (zone === 'tile') {
      if (lf.stage !== 'rinsed') {
        labSound.thunk(true);
        setDropNote({ tone: 'info', line: `Only a rinsed, pale leaf lies on the tile — ${nextHint[lf.stage] ?? 'keep going with the protocol'}.` });
        notePointer(false);
        return;
      }
      placeOnTile(lf);
      notePointer(true);
      return;
    }

    // released over nothing — the leaf glides back to where it was
    labSound.thunk(true);
  };

  // ---- keyboard / button duplicate of the gestures ----------------------------------
  const advance = useCallback(() => {
    const s = sim.current;
    const timed = s.leaves.find((l) => l.stage in TIMED_SECS);
    if (timed) {
      pushToast('info', '⏳', `${KIND_INFO[timed.kind].short}: ${STAGE_LABEL[timed.stage]} — let the simulated clock run.`);
      return;
    }
    const flatReady = s.leaves.find((l) => l.stage === 'tile' && l.flat >= 0.9);
    if (flatReady) { startTest(flatReady); return; }
    const spreading = s.leaves.find((l) => l.stage === 'tile');
    if (spreading) { pushToast('info', '🖐', 'The leaf is flattening on the tile — one more moment.'); return; }
    const rinsedLf = s.leaves.find((l) => l.stage === 'rinsed');
    if (rinsedLf) { placeOnTile(rinsedLf); return; }
    const decol = s.leaves.find((l) => l.stage === 'decolorized');
    if (decol) {
      decol.stage = 'rinsing';
      decol.timer = 0;
      labSound.slosh(0.5);
      labSound.drip(false);
      return;
    }
    const boiledLf = s.leaves.find((l) => l.stage === 'boiled');
    if (boiledLf) {
      if (s.bathTemp < BATH_MIN_TEMP) {
        pushToast('warn', '🌡', `The water bath is down to ${Math.round(s.bathTemp)} °C — it cools only slowly, so it should still work.`);
      }
      boiledLf.stage = 'ethanol';
      boiledLf.timer = 0;
      labSound.glassClink(true);
      labSound.slosh(0.4);
      return;
    }
    const order: LeafKind[] = ['variegated-light', 'green-light', 'green-dark'];
    let pick: LeafState | null = null;
    for (const k of order) {
      const c = s.leaves.find((l) => l.kind === k && l.stage === 'plant');
      if (c) { pick = c; break; }
    }
    if (!pick) {
      pushToast('info', '✎', 'Every leaf is read — open Observations for your table, the starch bars and the conclusion card.');
      return;
    }
    if (pick.kind === 'green-dark' && s.doorOpen < 0.75) {
      if (s.doorTarget < 0.5) {
        toggleDoor();
        pushToast('info', '🚪', 'Opening the dark cupboard — this plant has spent 48 simulated hours without light.');
        return;
      }
      pushToast('info', '🚪', 'The cupboard door is still opening — a second.');
      return;
    }
    if (s.boilTemp < BOIL_READY_TEMP) {
      pushToast('warn', '♨', `The water is at ${Math.round(s.boilTemp)} °C — wait for a rolling boil (95 °C and up).`);
      return;
    }
    pick.stage = 'boiling';
    pick.timer = 0;
    labSound.creak(0.3);
    labSound.drip(false);
    labSound.slosh(0.6);
  }, [pushToast, startTest, placeOnTile, toggleDoor]);

  // ---- conclusion card --------------------------------------------------------------
  const submitConclusion = () => {
    const has = (id: string) => conclSel.includes(id);
    const correct = has('light') && has('chloro') && !has('warm') && !has('sugar');
    const lightTested = ui.leaves.some((l) => l.stage === 'tested' && l.kind !== 'green-dark');
    const darkTested = ui.leaves.some((l) => l.stage === 'tested' && l.kind === 'green-dark');
    if (correct) {
      setConclusion('correct');
      setConclNote('');
      labSound.milestone();
      pushToast('good', '✅', 'Concluded: a leaf makes starch only where light and chlorophyll both were.');
      if (lightTested && darkTested) earn('light-dark');
      if (sim.current.dangerCount === 0) earn('safety-first');
      return;
    }
    setConclusion('wrong');
    labSound.warn();
    let line: string;
    if (has('warm')) {
      line = 'Check your table: the cupboard leaf went through the same hot water and the same warm ethanol bath as the windowsill leaf — and stayed orange-brown. Heat alone stored no starch.';
    } else if (has('sugar')) {
      line = 'Nothing on this bench fed the leaves sugar — and the cream centre of the variegated leaf shared the same soil as its green rim, yet stored nothing. Compare the regions within that one leaf.';
    } else if (!has('light')) {
      line = 'One of your tested leaves was fully green yet stored no starch. Look at which plant it came from, and what that plant missed for 48 simulated hours.';
    } else {
      line = 'One region of the variegated leaf had plenty of light but still stored no starch — what was missing from that cream-coloured tissue?';
    }
    setConclNote(line);
  };

  const toggleConcl = (id: string) => {
    labSound.tick();
    setConclSel((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  };

  // ---- reset -----------------------------------------------------------------------
  const resetAll = () => {
    const s = sim.current;
    s.simTime = 0;
    s.doorOpen = 0;
    s.doorTarget = 0;
    s.flameOn = true;
    s.boilTemp = 92;
    s.bathTemp = 80;
    s.ethanolGreen = 0;
    s.leaves = makeLeaves();
    s.drag = null;
    s.tubeInit = false;
    s.iodineInit = false;
    s.dangerCount = 0;
    s.lastDangerAt = -100;
    s.lastDangerReal = -100;
    s.dangerFlash = 0;
    s.dropAnim = null;
    s.steam = [];
    s.bubbles = [];
    s.testOrder = 0;
    s.rowSeq = 0;
    setRows([]);
    setMentorIndex(0);
    setMentorAcked(false);
    setBadges([]);
    setConclSel([]);
    setConclusion(null);
    setConclNote('');
    setDropNote(null);
    syncUi();
  };

  // ---- coach / status / next action ----------------------------------------------
  const timedLeaf = ui.leaves.find((l) => l.stage in TIMED_SECS);
  const stageTotal = timedLeaf ? TIMED_SECS[timedLeaf.stage] ?? 1 : 0;
  const stagePct = timedLeaf ? Math.min(100, (timedLeaf.timer / stageTotal) * 100) : 0;
  const testedLeaves = ui.leaves.filter((l) => l.stage === 'tested');
  const testedKey = testedLeaves.map((l) => l.kind).join('|');
  const plotPoints = useMemo(
    () => testedLeaves.map((l) => ({ x: KIND_INFO[l.kind].chloro, y: KIND_INFO[l.kind].starchArea })),
    [testedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const coach = useMemo<{ tone: CoachTone; line: string }>(() => {
    if (dropNote) return dropNote;
    if (ui.dangerCount > 0 && ui.clock - ui.lastDangerAt < 9) {
      return { tone: 'warn', line: 'Ethanol and naked flames do not mix — keep the tube standing in its warm-water bath. That is exactly what the bath is for.' };
    }
    const tl = ui.leaves.find((l) => l.stage in TIMED_SECS);
    if (tl) {
      const total = TIMED_SECS[tl.stage] ?? 1;
      return { tone: 'info', line: `${KIND_INFO[tl.kind].short}: ${STAGE_LABEL[tl.stage].toLowerCase()} — ${Math.round((tl.timer / total) * 100)}% through on the simulated clock.` };
    }
    if (ui.leaves.some((l) => l.stage === 'tile' && l.flat >= 0.9)) {
      return { tone: 'info', line: 'Flat, pale and waiting — drag the amber iodine dropper right over it and let one drop fall.' };
    }
    if (ui.leaves.some((l) => l.stage === 'tile')) {
      return { tone: 'info', line: 'The leaf is relaxing flat on the tile — a wet, flat leaf takes the iodine evenly.' };
    }
    if (ui.leaves.some((l) => l.stage === 'rinsed')) {
      return { tone: 'good', line: 'Rinsed and soft — spread it flat on the white tile so every region faces up.' };
    }
    if (ui.leaves.some((l) => l.stage === 'decolorized')) {
      return { tone: 'good', line: 'Pale at last — the ethanol carried the green away. Cold-water rinse next, then the tile.' };
    }
    if (ui.leaves.some((l) => l.stage === 'boiled')) {
      return { tone: 'info', line: 'Killed and softened — drag it into the ethanol tube standing in the hot-water bath. Keep that tube away from the flame.' };
    }
    if (ui.tested > 0 && ui.leaves.some((l) => l.stage === 'plant')) {
      return { tone: 'good', line: `One leaf read (${ui.tested} tested). Pick the next — the all-green windowsill leaf, then a cupboard leaf for the dark part of the story.` };
    }
    if (ui.tested > 0 && conclusion === null) {
      return { tone: 'good', line: 'Leaves read — open Observations and answer the conclusion card with your own evidence.' };
    }
    if (conclusion === 'wrong') {
      return { tone: 'warn', line: conclNote || 'Not quite — reread your table rows and try the conclusion again.' };
    }
    if (conclusion === 'correct') {
      return { tone: 'good', line: 'Light and chlorophyll together — that is where the starch appeared. Nicely concluded.' };
    }
    if (!ui.leaves.some((l) => l.stage !== 'plant')) {
      return { tone: 'info', line: 'Two geraniums grow behind you — one on a bright windowsill, one shut in a dark cupboard for 48 simulated hours. Drag a leaf off a plant to begin.' };
    }
    return { tone: 'info', line: 'Keep going — the mentor is watching your hands.' };
  }, [dropNote, ui, conclusion, conclNote]);

  const complete = conclusion === 'correct';
  const statusText = complete ? 'Experiment complete' : timedLeaf ? STAGE_LABEL[timedLeaf.stage] : ui.tested > 0 ? 'Protocol under way' : 'Experiment ready';
  const statusTone: 'ready' | 'active' | 'complete' = complete ? 'complete' : timedLeaf ? 'active' : 'ready';

  const nextAction = useMemo(() => {
    const tl = ui.leaves.find((l) => l.stage in TIMED_SECS);
    if (tl) return { label: `Working: ${STAGE_LABEL[tl.stage]}`, disabled: false };
    if (ui.leaves.some((l) => l.stage === 'tile' && l.flat >= 0.9)) return { label: 'Drop iodine on the leaf', disabled: false };
    if (ui.leaves.some((l) => l.stage === 'tile')) return { label: 'Flattening on the tile…', disabled: true };
    if (ui.leaves.some((l) => l.stage === 'rinsed')) return { label: 'Spread the leaf on the tile', disabled: false };
    if (ui.leaves.some((l) => l.stage === 'decolorized')) return { label: 'Rinse the pale leaf', disabled: false };
    if (ui.leaves.some((l) => l.stage === 'boiled')) return { label: 'Move leaf to the ethanol bath', disabled: false };
    const plantLeft = ui.leaves.filter((l) => l.stage === 'plant');
    if (plantLeft.length > 0) {
      const darkOnly = plantLeft.every((l) => l.kind === 'green-dark');
      if (darkOnly && ui.doorOpen < 0.75) return { label: 'Open the dark cupboard', disabled: false };
      return { label: plantLeft.some((l) => l.kind === 'variegated-light') ? 'Pick a variegated leaf' : 'Pick the next leaf', disabled: false };
    }
    if (ui.tested > 0) return { label: 'Conclude in Observations', disabled: false };
    return { label: 'Pick a leaf', disabled: false };
  }, [ui]);

  const clockLabel = useMemo(() => {
    const total = 9 * 3600 + Math.floor(ui.clock);
    const hh = Math.floor(total / 3600) % 24;
    const mm = Math.floor((total % 3600) / 60);
    const day = Math.floor(Math.floor(ui.clock) / 86400) + 1;
    return `Day ${day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }, [ui.clock]);

  // ---- scene drawing (pure shapes; every number lives in the sidebar) --------------
  function drawFnBuiltin(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const s = sim.current;
    const L = computeLayout(w, h);
    const t = s.animT;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#eef2f6');
    bg.addColorStop(1, '#e2e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // warm daylight wash on the back wall
    const wall = ctx.createLinearGradient(0, 0, 0, L.benchY);
    wall.addColorStop(0, 'rgba(255,236,196,0.5)');
    wall.addColorStop(1, 'rgba(255,236,196,0)');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, L.benchY);

    drawWindow(ctx, L, t);

    const lightAnchors = s.leaves.filter((l) => l.stage === 'plant' && l.kind !== 'green-dark').map((l) => ({ x: l.fx, y: l.fy }));
    const darkAnchors = s.leaves.filter((l) => l.stage === 'plant' && l.kind === 'green-dark').map((l) => ({ x: l.fx, y: l.fy }));
    drawCupboard(ctx, L, s.doorOpen, t, darkAnchors);
    drawPlant(ctx, L.lightPlant.x, L.lightPlant.y, L.s, false, t, lightAnchors);

    drawBench(ctx, L, w, h);

    ctx.fillStyle = 'rgba(23,35,52,0.10)';
    const shadow = (cx: number, rw: number) => {
      ctx.beginPath();
      ctx.ellipse(cx, L.benchY + 3, rw, 5 * L.s, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    shadow(L.iodineB.cx, 16 * L.s);
    shadow(L.bunsen.cx, 26 * L.s);
    shadow(L.boil.cx, 34 * L.s);
    shadow(L.bath.cx, 44 * L.s);
    shadow(L.rinse.cx, 34 * L.s);

    drawBunsen(ctx, L, t, s.flameOn);
    drawTripod(ctx, L);
    drawBeaker(ctx, L.boil.cx, L.boil.bottomY, L.boil.w, L.boil.h, L.boil.waterY, t, 0.4, 'rgba(158,198,226,0.62)');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const b of s.bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#cfd6d2';
    roundRect(ctx, L.bath.cx - L.bath.w / 2 - 8, L.bath.bottomY - 4, L.bath.w + 16, 8, 3);
    ctx.fill();
    drawBeaker(ctx, L.bath.cx, L.bath.bottomY, L.bath.w, L.bath.h, L.bath.waterY, t, 1.7, 'rgba(168,205,230,0.55)');
    drawTube(ctx, L, s.tubeFx, s.tubeFy, s.ethanolGreen, s.drag?.kind === 'tube' ? s.drag.x - s.drag.sx : 0);

    drawBeaker(ctx, L.rinse.cx, L.rinse.bottomY, L.rinse.w, L.rinse.h, L.rinse.waterY, t, 3.1, 'rgba(150,192,222,0.5)');

    const carryingRinsed = s.drag?.kind === 'leaf'
      && s.leaves.some((l) => l.id === s.drag?.leafId && l.stage === 'rinsed');
    drawTile(ctx, L, carryingRinsed);

    const draggedId = s.drag?.kind === 'leaf' ? s.drag.leafId : undefined;
    for (const lf of s.leaves) {
      if (lf.stage === 'plant' && lf.kind === 'green-dark' && s.doorOpen <= 0.02) continue;
      const fade = lf.stage === 'plant' && lf.kind === 'green-dark' ? s.doorOpen : 1;
      drawSceneLeaf(ctx, L, lf, t, draggedId === lf.id, fade);
    }

    drawIodineBottle(ctx, s.iodineFx, s.iodineFy, L.s, s.drag?.kind === 'iodine', t);
    if (s.dropAnim) {
      const d = s.dropAnim;
      const dx = d.x + (d.tx - d.x) * d.t;
      const dy = d.y + (d.ty - d.y) * d.t * d.t;
      ctx.fillStyle = 'rgba(176,106,34,0.9)';
      ctx.beginPath();
      ctx.arc(dx, dy, 3.4 * L.s, 0, Math.PI * 2);
      ctx.fill();
    }

    drawSteam(ctx, s.steam);

    if (s.drag?.kind === 'leaf') {
      const lf = s.leaves.find((l) => l.id === s.drag?.leafId);
      if (lf) {
        if (lf.stage === 'plant') drawTargetRing(ctx, L.boil.cx, L.boil.mouthY + 4, 44 * L.s, t);
        else if (lf.stage === 'boiled') drawTargetRing(ctx, L.tube.cx, L.tube.mouthY + 4, 40 * L.s, t);
        else if (lf.stage === 'decolorized') drawTargetRing(ctx, L.rinse.cx, L.rinse.mouthY + 4, 44 * L.s, t);
        else if (lf.stage === 'rinsed') drawTargetRing(ctx, L.tile.x + L.tile.w / 2, L.tile.y + L.tile.h / 2, 52 * L.s, t);
      }
    }
    if (s.drag?.kind === 'iodine') {
      for (const lf of s.leaves) {
        if (lf.stage === 'tile' && lf.flat >= 0.85) drawTargetRing(ctx, lf.fx, lf.fy, 26 * L.s + 8, t);
      }
    }

    if (s.dangerFlash > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(198,53,32,0)');
      g.addColorStop(1, `rgba(198,53,32,${0.34 * s.dangerFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---- render -----------------------------------------------------------------------
  return (
    <LabShell
      meta={meta}
      statusText={statusText}
      statusTone={statusTone}
      captionChip="Classic iodine protocol, gesture by gesture"
      legend={[
        { color: '#4c8a3f', label: 'Chlorophyll tissue' },
        { color: '#ece5c3', label: 'No chlorophyll' },
        { color: '#232b47', label: 'Starch — blue-black' },
        { color: '#b06a22', label: 'No starch — orange-brown' },
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
          <select value={speed} onChange={(e) => { setSpeed(Number(e.target.value)); labSound.tick(); }} aria-label="Playback speed of the simulated clock">
            <option value={1}>1× real time</option>
            <option value={4}>4× faster</option>
            <option value={16}>16× faster</option>
          </select>
        </label>
      }
      scene={
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Photosynthesis bench — drag leaves through boiling water, the ethanol water-bath and the cold rinse, then drop iodine on flattened leaves"
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              advance();
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
          <div className="photo-controls">
            <div className="photo-main">
              <button
                className="action-button"
                type="button"
                data-nudge="advance"
                onClick={() => { advance(); notePointer(true); }}
                disabled={nextAction.disabled}
              >
                <span className="dispense-icon" aria-hidden="true">🍃</span>
                <span>{nextAction.label}</span>
                <small>or press Space on the bench</small>
              </button>
              <div className="photo-mini">
                <button className="text-button" type="button" onClick={toggleFlame}>
                  {ui.flameOn ? 'Bunsen: lit 🔥' : 'Bunsen: flame out'}
                </button>
                <button className="text-button" type="button" onClick={toggleDoor}>
                  {ui.doorOpen > 0.5 ? 'Cupboard: open' : 'Cupboard: shut'}
                </button>
              </div>
            </div>
            <div className="photo-clock">
              <span>SIMULATED CLOCK · {speed}×</span>
              <strong>{clockLabel}</strong>
              <div className="photo-progress"><span style={{ width: `${stagePct}%` }} /></div>
              <p className="photo-stage">{timedLeaf ? `${KIND_INFO[timedLeaf.kind].short} · ${STAGE_LABEL[timedLeaf.stage]}` : nextAction.label}</p>
            </div>
          </div>
          <div className="photo-inv" aria-label="Leaf inventory">
            {ui.leaves.map((l) => (
              <span
                key={l.id}
                className={`photo-inv-chip k-${l.kind} ${l.stage === 'tested' ? 'tested' : l.stage === 'plant' ? 'fresh' : 'busy'}`}
              >
                <i aria-hidden="true" />
                {KIND_INFO[l.kind].short}
                {l.stage === 'tested' && <b>{KIND_INFO[l.kind].starchArea}% starch</b>}
              </span>
            ))}
          </div>
          <div className="hint-row">
            <span>⚠</span>
            <p style={{ margin: 0 }}>
              Ethanol is flammable: it stays in the slim tube standing in its water bath. Drag that tube near the
              flame and the bench will warn you — honestly, and loudly.
            </p>
          </div>
        </div>
      }
      sidebarTop={
        <section className="instrument-card">
          <div className="instrument-header">
            <div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Bench readings</h2></div>
            <span className="instrument-live">LIVE</span>
          </div>
          <div className="reading-main">
            <span>Current treatment</span>
            <strong>{timedLeaf ? STAGE_LABEL[timedLeaf.stage] : 'Bench idle'}</strong>
            <div className="reading-track"><span style={{ width: `${stagePct}%` }} /></div>
            <div className="reading-scale"><span>start</span><span>{timedLeaf ? `${Math.round(stageTotal)} sim-s` : 'pick a leaf'}</span></div>
          </div>
          <div className="reading-grid">
            <div><span>Boiling water</span><strong>{Math.round(ui.boilTemp)}<small> °C</small></strong></div>
            <div><span>Water bath</span><strong>{Math.round(ui.bathTemp)}<small> °C</small></strong></div>
            <div><span>Ethanol colour</span><strong>{Math.round(ui.ethanolGreen * 100)}<small>% green</small></strong></div>
            <div><span>Leaves tested</span><strong>{ui.tested}<small> / 5</small></strong></div>
            <div><span>Cupboard door</span><strong>{ui.doorOpen > 0.5 ? 'open' : 'shut'}</strong></div>
            <div><span>Bunsen flame</span><strong>{ui.flameOn ? 'lit' : 'out'}</strong></div>
          </div>
        </section>
      }
      notes={{
        procedure: (
          <>
            <h3>What to do</h3>
            <ol>
              <li>Pick a leaf — drag one off the windowsill plant (a variegated one first). Later, open the dark cupboard and take one of its green leaves.</li>
              <li>Drop it into the boiling water on the tripod and hold it there about two simulated minutes — heat kills the leaf and stops its chemistry.</li>
              <li>Drag it into the ethanol tube standing in the hot-water bath until it turns pale. Never carry that tube near the flame.</li>
              <li>Rinse it in the cold-water beaker, then spread it flat on the white tile.</li>
              <li>Drag the iodine dropper over the flattened leaf and let one drop fall. Blue-black means starch; orange-brown means none.</li>
              <li>Repeat with the other leaves, then answer the conclusion card in Observations from your own table.</li>
            </ol>
            <div className="hint-box">
              <span>⚠</span>
              <p><strong>Safety.</strong>Ethanol catches fire easily. On this bench it lives in a tube standing in hot water — the bath warms it safely. Carry it over the Bunsen flame and you will hear about it.</p>
            </div>
          </>
        ),
        observations: (
          <>
            <h3>Iodine-test table</h3>
            {rows.length === 0 ? (
              <p className="observation-note">No leaf has met the iodine yet. Walk one through the protocol — your rows appear here the moment the colour settles.</p>
            ) : (
              <table className="trial-table">
                <thead>
                  <tr><th>#</th><th>Leaf</th><th>Treatment</th><th>Region</th><th>Colour</th><th>Verdict</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.leaf}</td>
                      <td>{r.treatment}</td>
                      <td>{r.region}</td>
                      <td><span className={`photo-swatch ${r.starch ? 'sw-blue' : 'sw-brown'}`} aria-hidden="true" /> {r.colour}</td>
                      <td>{r.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 style={{ marginTop: 16 }}>Starch area per leaf</h3>
            {testedLeaves.length === 0 ? (
              <p className="observation-note">Test a leaf and its starch-area bar appears here — rim only for variegated leaves, the whole blade for all-green ones.</p>
            ) : (
              <div className="photo-bars">
                {testedLeaves.map((l) => (
                  <div className="photo-bar-row" key={l.id}>
                    <span>{KIND_INFO[l.kind].short}</span>
                    <div className="photo-bar-track"><span style={{ width: `${KIND_INFO[l.kind].starchArea}%` }} /></div>
                    <strong>{KIND_INFO[l.kind].starchArea}%</strong>
                  </div>
                ))}
              </div>
            )}

            {plotPoints.length >= 2 && (
              <>
                <h3 style={{ marginTop: 16 }}>Chlorophyll vs starch storage</h3>
                <Plot points={plotPoints} xLabel="Chlorophyll coverage (%)" yLabel="Starch area (%)" height={210} />
                <p className="observation-note">
                  Windowsill leaves sit on the diagonal — starch filled only the green tissue that also had light. The
                  cupboard leaf (fully green, 48 simulated hours dark) sits on the floor of the graph: chlorophyll alone
                  stored nothing.
                </p>
              </>
            )}

            <h3 style={{ marginTop: 16 }}>Where did the leaf make starch?</h3>
            <div className="photo-concl">
              <p>Two of these worked together. Pick the pair, then check your answer against your own table.</p>
              <div className="photo-concl-chips">
                {CONCL_OPTS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={conclSel.includes(o.id) ? 'on' : ''}
                    onClick={() => toggleConcl(o.id)}
                    aria-pressed={conclSel.includes(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <button className="record-button" type="button" onClick={submitConclusion} disabled={conclSel.length === 0}>
                {conclSel.length === 0 ? 'Pick two conditions first' : 'Check my conclusion'}
              </button>
              {conclusion === 'correct' && (
                <p className="photo-concl-ok">
                  ✔ Your evidence supports it: wherever light and chlorophyll were together — the green rim, the all-green
                  windowsill leaf — iodine went blue-black. Where either was missing — the cream centre, the cupboard leaf —
                  orange-brown.
                </p>
              )}
              {conclusion === 'wrong' && <p className="photo-concl-bad">✎ {conclNote}</p>}
            </div>
          </>
        ),
        theory: (
          <>
            <h3>Why test leaves for starch</h3>
            <p>
              Photosynthesis uses light energy captured by the green pigment chlorophyll to build sugar from carbon
              dioxide and water. A leaf with spare sugar converts it to starch and banks it — so finding starch in a
              leaf is evidence that photosynthesis actually happened there, hours before you touched it.
            </p>
            <div className="equation">6 CO₂ + 6 H₂O —light + chlorophyll→ C₆H₁₂O₆ + 6 O₂</div>
            <p>
              Iodine solution is the classic starch probe: iodine molecules slip inside the coiled starch chain and the
              complex swings to a deep blue-black. No starch, and the iodine simply stays its own orange-brown.
            </p>
            <h3>Why every step of the protocol exists</h3>
            <p>
              Boiling water kills the leaf and its enzymes, freezing the chemistry in place. Hot ethanol dissolves the
              chlorophyll out of the leaf so the green cannot fake or mask a colour change. The cold rinse washes the
              ethanol away and softens the brittle leaf so it lies flat. Only then is the leaf an honest page for the
              iodine to write on.
            </p>
            <p>
              The variegated leaf maps chlorophyll for you — green rim, cream centre, same leaf, same light. The
              cupboard plant maps light — same green pigment, but 48 simulated hours of darkness used up its stored
              starch. Put the two maps together and the conclusion is yours, not the bench&apos;s.
            </p>
          </>
        ),
      }}
      badges={BADGES}
      earned={badges}
      nudgeLayer={nudge ? <NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={() => dismiss('manual')} /> : undefined}
      toast={toast}
      onReset={resetAll}
      onTab={() => { /* observations are pure DOM state; nothing to unlock here */ }}
    />
  );
}

// ===========================================================================
// Module-level drawing helpers — pure shapes, zero text on the scene canvas.
// ===========================================================================

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function leafPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.78, -s * 0.5, s * 0.72, s * 0.5, 0, s);
  ctx.bezierCurveTo(-s * 0.72, s * 0.5, -s * 0.78, -s * 0.5, 0, -s);
  ctx.closePath();
}

function blendHex(a: string, b: string, t: number): string {
  const k = clamp(t, 0, 1);
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

interface LeafDrawOpts {
  outer: string;
  inner: string | null;
  flat: number;
  dev: number;
  rimStain: string | null;
  centreStain: string | null;
  dropX: number;
  dropY: number;
  dragged: boolean;
  alpha: number;
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number, ang: number, o: LeafDrawOpts,
) {
  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(1 + o.flat * 0.4, 1 - o.flat * 0.28);
  if (o.dragged) {
    ctx.shadowColor = 'rgba(23,35,52,0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 10;
  }
  leafPath(ctx, size);
  ctx.fillStyle = o.outer;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (o.inner) {
    leafPath(ctx, size * 0.55);
    ctx.fillStyle = o.inner;
    ctx.fill();
  }
  // midrib + side veins
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = Math.max(0.8, size * 0.055);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.9);
  ctx.lineTo(0, size * 0.9);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(0.6, size * 0.04);
  for (let vi = -2; vi <= 2; vi += 1) {
    if (vi === 0) continue;
    const dir = vi > 0 ? 1 : -1;
    const vy = vi * size * 0.3;
    ctx.beginPath();
    ctx.moveTo(0, vy);
    ctx.quadraticCurveTo(size * 0.35 * dir, vy + size * 0.12, size * 0.55 * dir, vy + size * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, vy);
    ctx.quadraticCurveTo(-size * 0.35 * dir, vy + size * 0.12, -size * 0.55 * dir, vy + size * 0.3);
    ctx.stroke();
  }
  // iodine stains, spreading radially from where the drop landed
  if (o.dev > 0 && o.rimStain) {
    const r = Math.max(1, o.dev * size * 3);
    ctx.save();
    leafPath(ctx, size);
    ctx.clip();
    const g = ctx.createRadialGradient(o.dropX, o.dropY, 0, o.dropX, o.dropY, r);
    g.addColorStop(0, o.rimStain);
    g.addColorStop(0.7, o.rimStain);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3);
    ctx.restore();
    if (o.centreStain) {
      ctx.save();
      leafPath(ctx, size * 0.55);
      ctx.clip();
      const g2 = ctx.createRadialGradient(o.dropX, o.dropY, 0, o.dropX, o.dropY, r);
      g2.addColorStop(0, o.centreStain);
      g2.addColorStop(0.7, o.centreStain);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3);
      ctx.restore();
    }
  }
  // stalk
  ctx.strokeStyle = '#6d8f52';
  ctx.lineWidth = Math.max(1, size * 0.12);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.92);
  ctx.lineTo(0, size * 1.22);
  ctx.stroke();
  ctx.restore();
}

function drawSceneLeaf(
  ctx: CanvasRenderingContext2D,
  L: SceneLayout, lf: LeafState, t: number, dragged: boolean, fade: number,
) {
  const info = KIND_INFO[lf.kind];
  let size = 21 * L.s;
  let ang = 0;
  let alpha = fade;
  const sway = Math.sin(t * 1.3 + lf.id * 1.7);
  if (lf.stage === 'plant') {
    const angs = lf.kind === 'green-dark' ? [-0.35, 0.5] : [-0.55, 0.05, 0.6];
    ang = angs[lf.slot % angs.length] + sway * 0.05 + (lf.kind === 'green-dark' ? 0.22 : 0);
  } else if (lf.stage === 'boiling') {
    size = 13 * L.s;
    ang = Math.sin(t * 2.4 + lf.id) * 0.5;
    alpha *= 0.88;
  } else if (lf.stage === 'boiled') {
    size = 19 * L.s;
    ang = 1.05;
  } else if (lf.stage === 'ethanol') {
    size = 10 * L.s;
    ang = Math.sin(t * 1.6 + lf.id) * 0.35;
    alpha *= 0.92;
  } else if (lf.stage === 'decolorized') {
    size = 18 * L.s;
    ang = -0.28;
  } else if (lf.stage === 'rinsing') {
    size = 13 * L.s;
    ang = Math.sin(t * 1.9 + lf.id) * 0.4;
    alpha *= 0.88;
  } else if (lf.stage === 'rinsed') {
    size = 19 * L.s;
    ang = 0.95;
  } else {
    size = 25 * L.s;
    const tAngs = [-0.16, 0.1, -0.04, 0.18, -0.12];
    ang = tAngs[lf.tileSlot % 5];
  }

  const fresh = lf.kind === 'green-dark' ? '#3c7434' : '#4c8a3f';
  let outer = lf.stage === 'plant' ? fresh : blendHex(fresh, '#2f5a2a', 0.3);
  outer = blendHex(outer, '#e8e4d4', lf.paleness);
  const inner = blendHex('#ece5c3', '#efeee6', lf.paleness);
  const dev = lf.iodine;
  const rimStain = dev > 0 ? (info.rimStarch ? 'rgba(35,43,71,0.95)' : 'rgba(176,106,34,0.92)') : null;
  const centreStain = dev > 0 && info.variegated ? 'rgba(176,106,34,0.92)' : null;

  drawLeaf(ctx, lf.fx, lf.fy, size, ang, {
    outer,
    inner: info.variegated ? inner : null,
    flat: lf.flat,
    dev,
    rimStain,
    centreStain,
    dropX: lf.dropLocalX,
    dropY: lf.dropLocalY,
    dragged,
    alpha,
  });
}

function drawTargetRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  ctx.save();
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -t * 26;
  ctx.strokeStyle = 'rgba(249,115,22,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r + Math.sin(t * 4) * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWindow(ctx: CanvasRenderingContext2D, L: SceneLayout, t: number) {
  const { x, y, w, h } = L.win;
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#a8d4ec');
  sky.addColorStop(0.6, '#cfe6f4');
  sky.addColorStop(1, '#f6e7c4');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  const sx = x + w * 0.3;
  const sy = y + h * 0.32;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(t * 0.12);
  ctx.fillStyle = 'rgba(255,214,120,0.22)';
  for (let i = 0; i < 8; i += 1) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, -w * 0.52);
    ctx.lineTo(-7, -w * 0.52);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, w * 0.3);
  glow.addColorStop(0, 'rgba(255,236,170,0.95)');
  glow.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffdf94';
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(7, w * 0.085), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d3dae0';
  ctx.lineWidth = 6;
  ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.fillStyle = '#c8ced4';
  roundRect(ctx, x - 10, y + h, w + 20, 9, 3);
  ctx.fill();
  // spill of daylight toward the windowsill plant
  ctx.fillStyle = `rgba(255,225,150,${0.13 + Math.sin(t * 0.8) * 0.03})`;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.15, y + h);
  ctx.lineTo(x + w * 0.9, y + h);
  ctx.lineTo(x + w * 1.5, L.benchY - 6);
  ctx.lineTo(x - w * 0.35, L.benchY - 6);
  ctx.closePath();
  ctx.fill();
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, s: number, dark: boolean, t: number,
  anchors: { x: number; y: number }[],
) {
  // stems toward each leaf still attached
  ctx.strokeStyle = dark ? '#33502e' : '#3f7034';
  ctx.lineWidth = Math.max(2, 3 * s);
  for (const a of anchors) {
    const bend = Math.sin(t * 1.1 + a.x * 0.05) * 3 * s;
    ctx.beginPath();
    ctx.moveTo(x, y - 26 * s);
    ctx.quadraticCurveTo((a.x + x) / 2 + bend, (a.y + y - 26 * s) / 2, a.x, a.y + 9 * s);
    ctx.stroke();
  }
  // pot
  const potH = 34 * s;
  const potTop = 30 * s;
  ctx.fillStyle = dark ? '#6d4f3a' : '#b06a3f';
  ctx.beginPath();
  ctx.moveTo(x - potTop / 2, y - potH);
  ctx.lineTo(x + potTop / 2, y - potH);
  ctx.lineTo(x + potTop / 2 - 5 * s, y);
  ctx.lineTo(x - potTop / 2 + 5 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark ? '#5c3f2d' : '#94562f';
  roundRect(ctx, x - potTop / 2 - 3 * s, y - potH - 7 * s, potTop + 6 * s, 9 * s, 3);
  ctx.fill();
  ctx.fillStyle = '#4a3626';
  ctx.beginPath();
  ctx.ellipse(x, y - potH - 3 * s, potTop / 2 - 2 * s, 3.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCupboard(
  ctx: CanvasRenderingContext2D, L: SceneLayout, open: number, t: number,
  darkAnchors: { x: number; y: number }[],
) {
  const c = L.cup;
  // interior — always drawn; the door hides it when closed
  ctx.fillStyle = '#2a231d';
  roundRect(ctx, c.x + 5, c.y + 6, c.w - 10, c.h - 14, 6);
  ctx.fill();
  const shade = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
  shade.addColorStop(0, 'rgba(0,0,0,0.34)');
  shade.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = shade;
  roundRect(ctx, c.x + 5, c.y + 6, c.w - 10, c.h - 14, 6);
  ctx.fill();
  // a whisper of light leaking in as the door opens
  if (open > 0.05) {
    ctx.fillStyle = `rgba(240,236,220,${0.08 * open + Math.sin(t * 0.9) * 0.01 * open})`;
    roundRect(ctx, c.x + 5, c.y + 6, (c.w - 10) * 0.4, c.h - 14, 6);
    ctx.fill();
  }
  drawPlant(ctx, L.darkPlant.x, L.darkPlant.y, L.s * 0.72, true, t, darkAnchors);
  // frame + feet
  ctx.strokeStyle = '#4a3a2c';
  ctx.lineWidth = 5;
  roundRect(ctx, c.x, c.y, c.w, c.h, 8);
  ctx.stroke();
  ctx.fillStyle = '#4a3a2c';
  roundRect(ctx, c.x + 6, c.y + c.h - 4, 12, 10, 2);
  ctx.fill();
  roundRect(ctx, c.x + c.w - 18, c.y + c.h - 4, 12, 10, 2);
  ctx.fill();
  // sliding door
  const doorW = c.w - 8;
  const doorX = c.x + 4 - open * doorW * 0.86;
  const dg = ctx.createLinearGradient(doorX, 0, doorX + doorW, 0);
  dg.addColorStop(0, '#6f5138');
  dg.addColorStop(0.5, '#7d5c40');
  dg.addColorStop(1, '#5f4530');
  ctx.fillStyle = dg;
  roundRect(ctx, doorX, c.y + 6, doorW, c.h - 12, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(46,33,22,0.5)';
  ctx.lineWidth = 2;
  roundRect(ctx, doorX + 10, c.y + 16, doorW - 20, c.h * 0.38, 4);
  ctx.stroke();
  roundRect(ctx, doorX + 10, c.y + c.h * 0.52, doorW - 20, c.h * 0.34, 4);
  ctx.stroke();
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.arc(doorX + doorW - 16, c.y + c.h / 2, Math.max(4, 5 * L.s), 0, Math.PI * 2);
  ctx.fill();
}

function drawBench(ctx: CanvasRenderingContext2D, L: SceneLayout, w: number, h: number) {
  const g = ctx.createLinearGradient(0, L.benchY, 0, h);
  g.addColorStop(0, '#e2d7c3');
  g.addColorStop(0.12, '#d9cdb7');
  g.addColorStop(1, '#c4b7a0');
  ctx.fillStyle = g;
  ctx.fillRect(0, L.benchY, w, h - L.benchY);
  ctx.strokeStyle = '#efe7d6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, L.benchY + 1.5);
  ctx.lineTo(w, L.benchY + 1.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(23,35,52,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, L.benchY - 1);
  ctx.lineTo(w, L.benchY - 1);
  ctx.stroke();
  ctx.fillStyle = '#b7ab94';
  ctx.fillRect(0, h - 14, w, 14);
}

function drawFlame(ctx: CanvasRenderingContext2D, cx: number, baseY: number, hMax: number, t: number) {
  const flick = 0.86 + Math.sin(t * 13.7) * 0.07 + Math.sin(t * 7.3 + 1.2) * 0.07;
  const fh = hMax * flick;
  const w = fh * 0.42;
  const tipX = cx + Math.sin(t * 11) * 1.6;
  const halo = ctx.createRadialGradient(cx, baseY - fh * 0.5, 2, cx, baseY - fh * 0.5, fh * 1.6);
  halo.addColorStop(0, 'rgba(255,170,80,0.22)');
  halo.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, baseY - fh * 0.5, fh * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(72,140,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(cx - w, baseY);
  ctx.quadraticCurveTo(cx - w * 0.9, baseY - fh * 0.5, tipX, baseY - fh);
  ctx.quadraticCurveTo(cx + w * 0.9, baseY - fh * 0.5, cx + w, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(158,208,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.45, baseY);
  ctx.quadraticCurveTo(cx - w * 0.4, baseY - fh * 0.28, tipX, baseY - fh * 0.55);
  ctx.quadraticCurveTo(cx + w * 0.4, baseY - fh * 0.28, cx + w * 0.45, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawBunsen(ctx: CanvasRenderingContext2D, L: SceneLayout, t: number, on: boolean) {
  const b = L.bunsen;
  const s = L.s;
  ctx.strokeStyle = '#7c6a55';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(b.cx - 10 * s, b.baseY - 4 * s);
  ctx.quadraticCurveTo(b.cx - 44 * s, b.baseY + 4 * s, b.cx - 60 * s, b.baseY - 8 * s);
  ctx.stroke();
  ctx.fillStyle = '#333a44';
  roundRect(ctx, b.cx - 24 * s, b.baseY - 9 * s, 48 * s, 9 * s, 3);
  ctx.fill();
  const bg = ctx.createLinearGradient(b.cx - 7 * s, 0, b.cx + 7 * s, 0);
  bg.addColorStop(0, '#9aa7b4');
  bg.addColorStop(0.5, '#7b8996');
  bg.addColorStop(1, '#596674');
  ctx.fillStyle = bg;
  roundRect(ctx, b.cx - 7 * s, b.topY, 14 * s, b.baseY - 9 * s - b.topY, 3);
  ctx.fill();
  ctx.fillStyle = '#4b5666';
  roundRect(ctx, b.cx - 9 * s, b.baseY - 26 * s, 18 * s, 10 * s, 2);
  ctx.fill();
  if (on) drawFlame(ctx, b.cx, b.topY, 20 * s, t);
}

function drawTripod(ctx: CanvasRenderingContext2D, L: SceneLayout) {
  const s = L.s;
  const topY = L.boil.bottomY - 2;
  ctx.strokeStyle = '#6b7683';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(L.boil.cx - L.boil.w / 2 - 8 * s, L.benchY - 2);
  ctx.lineTo(L.boil.cx - L.boil.w / 2 - 2 * s, topY);
  ctx.moveTo(L.boil.cx + L.boil.w / 2 + 8 * s, L.benchY - 2);
  ctx.lineTo(L.boil.cx + L.boil.w / 2 + 2 * s, topY);
  ctx.moveTo(L.boil.cx + 3 * s, L.benchY - 2);
  ctx.lineTo(L.boil.cx - 2 * s, topY);
  ctx.stroke();
  ctx.fillStyle = '#b9c2ca';
  roundRect(ctx, L.boil.cx - L.boil.w / 2 - 6 * s, topY - 3, L.boil.w + 12 * s, 4, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,102,116,0.6)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i += 1) {
    const gx = L.boil.cx - L.boil.w / 2 - 6 * s + (i * (L.boil.w + 12 * s)) / 6;
    ctx.beginPath();
    ctx.moveTo(gx, topY - 3);
    ctx.lineTo(gx, topY + 1);
    ctx.stroke();
  }
}

function drawBeaker(
  ctx: CanvasRenderingContext2D,
  cx: number, bottomY: number, w: number, h: number, waterY: number,
  t: number, seed: number, waterFill: string,
) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  ctx.fillStyle = waterFill;
  ctx.fillRect(x0 + 2, waterY, w - 4, bottomY - waterY - 3);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + Math.sin(t * 0.8 + seed) * w * 0.14, waterY + 1.5, w * 0.3, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 3, bottomY - h);
  ctx.lineTo(x0, bottomY - h + 5);
  ctx.lineTo(x0, bottomY - 3);
  ctx.quadraticCurveTo(x0, bottomY, x0 + 3, bottomY);
  ctx.lineTo(x1 - 3, bottomY);
  ctx.quadraticCurveTo(x1, bottomY, x1, bottomY - 3);
  ctx.lineTo(x1, bottomY - h + 5);
  ctx.lineTo(x1 + 3, bottomY - h);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 4, bottomY - h + 10);
  ctx.lineTo(x0 + 4, bottomY - 8);
  ctx.stroke();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, bottomY - h + 4);
  ctx.lineTo(x1 + 4, bottomY - h - 2);
  ctx.stroke();
}

function drawTube(
  ctx: CanvasRenderingContext2D, L: SceneLayout,
  fx: number, fy: number, greenness: number, dragDX: number,
) {
  const s = L.s;
  const w = 24 * s;
  const h = 124 * s;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(clamp(dragDX * 0.004, -0.35, 0.35));
  const top = -h / 2;
  const bot = h / 2;
  const x0 = -w / 2;
  const x1 = w / 2;
  const liquidTop = bot - 78 * s;
  ctx.fillStyle = `rgba(88,150,70,${0.14 + 0.5 * greenness})`;
  ctx.beginPath();
  ctx.moveTo(x0 + 2, liquidTop);
  ctx.lineTo(x0 + 2, bot - 8 * s);
  ctx.quadraticCurveTo(0, bot - 2, x1 - 2, bot - 8 * s);
  ctx.lineTo(x1 - 2, liquidTop);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(140,190,110,${0.35 + 0.3 * greenness})`;
  ctx.beginPath();
  ctx.ellipse(0, liquidTop, w / 2 - 2, 2.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8da8b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 2, top);
  ctx.lineTo(x0, top + 5);
  ctx.lineTo(x0, bot - 8 * s);
  ctx.quadraticCurveTo(0, bot - 1, x1, bot - 8 * s);
  ctx.lineTo(x1, top + 5);
  ctx.lineTo(x1 + 2, top);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0 + 3, top + 8);
  ctx.lineTo(x0 + 3, bot - 12 * s);
  ctx.stroke();
  ctx.restore();
}

function drawTile(ctx: CanvasRenderingContext2D, L: SceneLayout, showSlots: boolean) {
  const T = L.tile;
  ctx.save();
  ctx.shadowColor = 'rgba(23,35,52,0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#f8f9f7';
  roundRect(ctx, T.x, T.y, T.w, T.h, 8);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#d9dde2';
  ctx.lineWidth = 2;
  roundRect(ctx, T.x, T.y, T.w, T.h, 8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,198,206,0.5)';
  ctx.lineWidth = 1;
  const cols = 3;
  const cellW = (T.w - 22) / cols;
  const cellH = (T.h - 18) / 2;
  for (let i = 1; i < cols; i += 1) {
    ctx.beginPath();
    ctx.moveTo(T.x + 11 + i * cellW, T.y + 8);
    ctx.lineTo(T.x + 11 + i * cellW, T.y + T.h - 8);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(T.x + 8, T.y + 11 + cellH);
  ctx.lineTo(T.x + T.w - 8, T.y + 11 + cellH);
  ctx.stroke();
  if (showSlots) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(249,115,22,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const p = tileSlotPos(L, i);
      roundRect(ctx, p.x - 26 * L.s, p.y - 22 * L.s, 52 * L.s, 44 * L.s, 6);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawIodineBottle(
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dragging: boolean, t: number,
) {
  ctx.save();
  ctx.translate(x, y);
  if (dragging) {
    ctx.shadowColor = 'rgba(23,35,52,0.3)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 8;
  }
  ctx.fillStyle = '#4b3a46';
  ctx.beginPath();
  ctx.arc(0, -26 * s, 7 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#33313a';
  roundRect(ctx, -6 * s, -21 * s, 12 * s, 8 * s, 2);
  ctx.fill();
  const g = ctx.createLinearGradient(-14 * s, 0, 14 * s, 0);
  g.addColorStop(0, '#d18a3a');
  g.addColorStop(0.5, '#c07a2e');
  g.addColorStop(1, '#8f5a1f');
  ctx.fillStyle = g;
  roundRect(ctx, -14 * s, -13 * s, 28 * s, 40 * s, 5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#e8c48a';
  roundRect(ctx, -11 * s, -4 * s, 22 * s, 16 * s, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,30,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-7 * s, 1 * s);
  ctx.lineTo(7 * s, 1 * s);
  ctx.moveTo(-7 * s, 5 * s);
  ctx.lineTo(7 * s, 5 * s);
  ctx.stroke();
  ctx.strokeStyle = '#a9bfcf';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, 27 * s);
  ctx.lineTo(0, 38 * s);
  ctx.stroke();
  if (dragging) {
    const bob = Math.sin(t * 3.2) * 1.6;
    ctx.fillStyle = 'rgba(176,106,34,0.95)';
    ctx.beginPath();
    ctx.arc(0, 45 * s + bob, 3.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(-1.2 * s, 44 * s + bob, 1.1 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSteam(
  ctx: CanvasRenderingContext2D,
  ps: { x: number; y: number; r: number; life: number; max: number; seed: number }[],
) {
  for (const p of ps) {
    const a = Math.max(0, 1 - p.life / p.max) * 0.16;
    const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, Math.max(1, p.r));
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, p.r), 0, Math.PI * 2);
    ctx.fill();
  }
}
