import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import * as pc from 'playcanvas';
import { labSound } from './audio';
import TitrationCurve from './pHChart';
import type { CurvePoint } from './pHChart';
import { BADGES, MENTOR_STEPS, coachLine, fmtClock, nudgePlan } from './mentor';
import type { NudgeGesture, NudgePlan, TrialRecord } from './mentor';
import './titration.css';

type SceneQuality = 'auto' | 'high' | 'balanced' | 'low';

type CameraCmd = 'in' | 'out' | 'home';

/** Live experiment values the 3D scene reads every frame (kept out of React re-renders). */
interface LiveState {
  volume: number;
  endpoint: boolean;
  overshot: boolean;
  dispensing: boolean;
  pinkBlend: number;
  /** Swirl energy 0..1, fed by the swirl pad and decayed inside the scene. */
  swirl: number;
  /** Increments each time a dispense pulse fires — the scene spawns a falling drop. */
  dropTick: number;
}

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function TitrationScene({
  live,
  quality,
  onInteract,
  cameraCmd,
  onZoom,
}: {
  live: { current: LiveState };
  quality: SceneQuality;
  onInteract: () => void;
  cameraCmd: { current: (cmd: CameraCmd) => void };
  onZoom: (pct: number) => void;
}) {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<pc.Application | null>(null);
  const qualityRef = useRef(quality);
  const interactRef = useRef(onInteract);
  const onZoomRef = useRef(onZoom);
  const scaleRef = useRef(0.85);
  const resizerRef = useRef<(() => void) | null>(null);
  const [autoScale, setAutoScale] = useState(() =>
    typeof window === 'undefined' ? 0.85 : window.devicePixelRatio > 2 ? 0.72 : 0.88,
  );

  useEffect(() => { qualityRef.current = quality; }, [quality]);
  useEffect(() => { interactRef.current = onInteract; }, [onInteract]);
  useEffect(() => { onZoomRef.current = onZoom; }, [onZoom]);
  useEffect(() => { scaleRef.current = autoScale; }, [autoScale]);

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;

    let app: pc.Application;
    try {
      app = new pc.Application(canvas, {
        graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: 'low-power' },
      });
    } catch {
      return;
    }
    appRef.current = app;
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    app.scene.ambientLight = new pc.Color(0.55, 0.59, 0.66);

    // --- camera: hand-driven orbit + wheel / pinch / button zoom -------------
    const HOME_PITCH = 0.21;
    const MIN_DIST = 4.6;
    const MAX_DIST = 15;
    const HOME_DIST = 9;
    const camTarget = new pc.Vec3(0, 1.5, 0);
    let yaw = 0;
    let pitch = HOME_PITCH;
    let targetYaw = 0;
    let targetPitch = HOME_PITCH;
    let dist = HOME_DIST;
    let targetDist = HOME_DIST;

    const camera = new pc.Entity('Camera');
    camera.addComponent('camera', { clearColor: new pc.Color(0.91, 0.94, 0.97), fov: 38, nearClip: 0.1, farClip: 100 });
    app.root.addChild(camera);

    const applyCamera = () => {
      const x = camTarget.x + dist * Math.sin(yaw) * Math.cos(pitch);
      const y = camTarget.y + dist * Math.sin(pitch);
      const z = camTarget.z + dist * Math.cos(yaw) * Math.cos(pitch);
      camera.setPosition(x, y, z);
      camera.lookAt(camTarget);
    };
    applyCamera();

    const resetView = () => {
      targetYaw = 0;
      targetPitch = HOME_PITCH;
      targetDist = HOME_DIST;
      interactRef.current();
    };

    // One pointer orbits the camera; two pointers pinch-zoom. A bare tap
    // (no drag) deliberately does not count as "inspecting the apparatus".
    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let dragTravel = 0;
    let lastX = 0;
    let lastY = 0;
    let pinchPrev = 0;

    const pinchDistance = () => {
      const pts = [...pointers.values()];
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        dragging = false;
        pinchPrev = pinchDistance();
      } else if (pointers.size === 1) {
        dragging = true;
        dragTravel = 0;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer not active (synthetic events) */ }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const span = pinchDistance();
        if (pinchPrev > 0 && span > 0) {
          const factor = span / pinchPrev;
          targetDist = clamp(targetDist / factor, MIN_DIST, MAX_DIST);
        }
        pinchPrev = span;
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      dragTravel += Math.abs(dx) + Math.abs(dy);
      if (dragTravel > 14) interactRef.current();
      targetYaw = clamp(targetYaw - dx * 0.0045, -0.85, 0.85);
      targetPitch = clamp(targetPitch + dy * 0.0035, 0.08, 0.55);
    };
    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
        // Pinch ended but a finger is still down — resume orbiting from it.
        const rest = [...pointers.values()][0];
        dragging = true;
        lastX = rest.x;
        lastY = rest.y;
        pinchPrev = 0;
      } else if (pointers.size === 0) {
        dragging = false;
      }
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33
        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? e.deltaY * 300
        : e.deltaY;
      targetDist = clamp(targetDist * (1 + d * 0.0011), MIN_DIST, MAX_DIST);
      interactRef.current();
    };
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      resetView();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') targetDist = clamp(targetDist - 0.9, MIN_DIST, MAX_DIST);
      else if (e.key === '-' || e.key === '_') targetDist = clamp(targetDist + 0.9, MIN_DIST, MAX_DIST);
      else if (e.key === '0') resetView();
      else return;
      e.preventDefault();
      interactRef.current();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('keydown', onKeyDown);

    // Toolbar zoom buttons drive the same camera through this command hook.
    cameraCmd.current = (cmd: CameraCmd) => {
      if (cmd === 'in') targetDist = clamp(targetDist - 1.3, MIN_DIST, MAX_DIST);
      else if (cmd === 'out') targetDist = clamp(targetDist + 1.3, MIN_DIST, MAX_DIST);
      else resetView();
    };

    const addLight = (name: string, type: 'directional' | 'omni', position: [number, number, number], intensity: number, color: pc.Color) => {
      const light = new pc.Entity(name);
      light.addComponent('light', { type, intensity, color, castShadows: qualityRef.current === 'high', range: 18 });
      light.setPosition(...position);
      if (type === 'directional') light.lookAt(0, 0, 0);
      app.root.addChild(light);
    };
    addLight('Key light', 'directional', [-3, 7, 4], 1.35, new pc.Color(1, 0.91, 0.79));
    addLight('Fill light', 'omni', [4, 4, 2], 0.75, new pc.Color(0.73, 0.84, 1));

    const material = (color: pc.Color, opts: { metalness?: number; gloss?: number; opacity?: number } = {}) => {
      const mat = new pc.StandardMaterial();
      mat.diffuse = color;
      mat.metalness = opts.metalness ?? 0;
      mat.gloss = opts.gloss ?? 0.45;
      if (opts.opacity !== undefined) {
        mat.opacity = opts.opacity;
        mat.blendType = pc.BLEND_NORMAL;
        mat.depthWrite = false;
      }
      mat.update();
      return mat;
    };
    const addShape = (name: string, type: 'box' | 'cylinder' | 'sphere' | 'cone', pos: [number, number, number], scale: [number, number, number], mat: pc.StandardMaterial, rot?: [number, number, number], parent?: pc.Entity) => {
      const entity = new pc.Entity(name);
      entity.addComponent('render', { type, material: mat, castShadows: true, receiveShadows: true });
      if (parent) {
        parent.addChild(entity);
        entity.setLocalPosition(...pos);
      } else {
        app.root.addChild(entity);
        entity.setPosition(...pos);
      }
      entity.setLocalScale(...scale);
      if (rot) entity.setEulerAngles(...rot);
      return entity;
    };

    const benchMat = material(new pc.Color(0.83, 0.86, 0.89), { gloss: 0.25 });
    const steelMat = material(new pc.Color(0.53, 0.60, 0.67), { metalness: 0.72, gloss: 0.82 });
    const glassMat = material(new pc.Color(0.77, 0.88, 0.94), { gloss: 0.95, opacity: 0.24 });
    const titrantMat = material(new pc.Color(0.91, 0.40, 0.20), { gloss: 0.78, opacity: 0.88 });
    const darkMat = material(new pc.Color(0.18, 0.23, 0.29), { metalness: 0.25 });
    const whiteMat = material(new pc.Color(0.97, 0.98, 0.99), { gloss: 0.3 });
    const tileMat = material(new pc.Color(0.99, 0.99, 1.0), { gloss: 0.55 });

    addShape('Laboratory worktop', 'box', [0, -0.16, 0], [8, 0.32, 4.6], benchMat);
    addShape('Front bench edge', 'box', [0, -0.36, 2.15], [8, 0.12, 0.12], whiteMat);

    // --- burette stand: raised so the tip hangs just above the flask mouth --
    addShape('Stand base', 'box', [-1.45, 0.08, -0.28], [1.05, 0.15, 0.75], steelMat);
    addShape('Stand rod', 'cylinder', [-1.45, 2.87, -0.28], [0.055, 3.0, 0.055], steelMat);
    addShape('Clamp arm', 'box', [-0.96, 3.84, -0.28], [1.05, 0.09, 0.12], darkMat);
    addShape('Burette glass', 'cylinder', [-0.42, 3.06, -0.28], [0.14, 1.9, 0.14], glassMat);
    const buretteSolution = addShape('Burette solution', 'cylinder', [-0.42, 3.10, -0.28], [0.088, 1.58, 0.088], titrantMat);
    for (let i = 0; i <= 10; i += 1) {
      addShape('Burette graduation ' + i, 'box', [-0.32, 3.80 - i * 0.145, -0.195], [i % 5 === 0 ? 0.11 : 0.06, 0.012, 0.012], darkMat);
    }
    addShape('Stopcock body', 'box', [-0.42, 2.05, -0.28], [0.28, 0.09, 0.12], steelMat);
    const stopcockHandle = addShape('Stopcock handle', 'box', [-0.42, 2.05, -0.18], [0.08, 0.28, 0.07], darkMat);
    addShape('Burette tip', 'cone', [-0.42, 1.85, -0.28], [0.065, 0.27, 0.065], glassMat);

    // --- the conical flask lives in its own group so it can wobble and spin -
    const flaskGroup = new pc.Entity('FlaskGroup');
    flaskGroup.setPosition(-0.42, 0, -0.28);
    app.root.addChild(flaskGroup);
    addShape('Flask base', 'cylinder', [0, 0.12, 0], [1.0, 0.12, 0.82], glassMat, undefined, flaskGroup);
    addShape('Flask body', 'cone', [0, 0.67, 0], [1.08, 1.12, 0.9], glassMat, [0, 0, 0], flaskGroup);
    addShape('Flask neck', 'cylinder', [0, 1.38, 0], [0.27, 0.48, 0.27], glassMat, undefined, flaskGroup);
    addShape('Flask rim', 'cylinder', [0, 1.63, 0], [0.34, 0.07, 0.34], glassMat, undefined, flaskGroup);
    addShape('Flask foot', 'cylinder', [0, 0.055, 0], [1.0, 0.08, 0.82], glassMat, undefined, flaskGroup);
    // The white tile: a real bench detail that makes the colour change readable.
    addShape('White tile', 'box', [-0.42, 0.0, -0.28], [1.5, 0.028, 1.3], tileMat);

    const flaskLiquidMat = material(new pc.Color(0.87, 0.91, 0.95), { gloss: 0.72, opacity: 0.38 });
    const flaskSolution = addShape('Flask solution', 'cylinder', [0, 0.42, 0], [0.70, 0.12, 0.58], flaskLiquidMat, undefined, flaskGroup);

    // --- reagents and bench props -------------------------------------------
    addShape('Reagent bottle', 'cylinder', [2.15, 0.48, -0.35], [0.43, 0.82, 0.43], glassMat);
    addShape('Reagent liquid', 'cylinder', [2.15, 0.32, -0.35], [0.34, 0.38, 0.34], material(new pc.Color(0.92, 0.78, 0.93), { gloss: 0.72, opacity: 0.72 }));
    addShape('Bottle cap', 'cylinder', [2.15, 0.94, -0.35], [0.22, 0.14, 0.22], darkMat);
    addShape('Label', 'box', [2.15, 0.53, -0.125], [0.29, 0.25, 0.012], whiteMat);
    addShape('Back wall', 'box', [0, 2.05, -2.15], [8, 4.4, 0.12], whiteMat);
    addShape('Back panel', 'box', [0, 2.3, -2.06], [7.8, 2.8, 0.035], material(new pc.Color(0.91, 0.94, 0.97)));
    addShape('Digital scale', 'box', [2.0, 0.03, 1.1], [1.15, 0.12, 0.72], darkMat);
    addShape('Scale display', 'box', [2.0, 0.105, 1.1], [0.66, 0.025, 0.2], material(new pc.Color(0.70, 0.86, 0.77)));

    // --- pooled effect entities: drops, splash rings and indicator blooms ---
    const dropMat = material(new pc.Color(0.86, 0.90, 0.94), { gloss: 0.85, opacity: 0.8 });
    const mkPooled = (name: string, type: 'sphere' | 'cylinder', mat: pc.StandardMaterial) => {
      const e = new pc.Entity(name);
      e.addComponent('render', { type, material: mat, castShadows: false, receiveShadows: false });
      flaskGroup.addChild(e);
      e.enabled = false;
      return e;
    };

    interface Drop { entity: pc.Entity; t: number; active: boolean; landX: number; landZ: number; }
    const drops: Drop[] = [];
    for (let i = 0; i < 8; i += 1) drops.push({ entity: mkPooled('Drop ' + i, 'sphere', dropMat), t: 0, active: false, landX: 0, landZ: 0 });

    interface Ripple { entity: pc.Entity; mat: pc.StandardMaterial; t: number; active: boolean; }
    const ripples: Ripple[] = [];
    for (let i = 0; i < 8; i += 1) {
      const mat = material(new pc.Color(0.95, 0.97, 1.0), { gloss: 0.9, opacity: 0.5 });
      ripples.push({ entity: mkPooled('Ripple ' + i, 'cylinder', mat), mat, t: 0, active: false });
    }

    interface Bloom { entity: pc.Entity; mat: pc.StandardMaterial; t: number; life: number; strength: number; angle: number; active: boolean; }
    const blooms: Bloom[] = [];
    for (let i = 0; i < 10; i += 1) {
      const mat = material(new pc.Color(0.90, 0.40, 0.68), { gloss: 0.8, opacity: 0.0 });
      blooms.push({ entity: mkPooled('Bloom ' + i, 'sphere', mat), mat, t: 0, life: 2.0, strength: 0, angle: 0, active: false });
    }

    const surfaceY = () => 0.48 + live.current.volume / 30 * 0.14;

    const spawnDrop = () => {
      const drop = drops.find((d) => !d.active);
      if (!drop) return;
      drop.active = true;
      drop.t = 0;
      // Land slightly off-centre so each drop produces its own little splash.
      const a = Math.random() * Math.PI * 2;
      const r = 0.05 + Math.random() * 0.14;
      drop.landX = Math.cos(a) * r;
      drop.landZ = Math.sin(a) * r * 0.85;
      drop.entity.enabled = true;
    };

    const spawnRipple = (x: number, z: number) => {
      const ripple = ripples.find((r2) => !r2.active);
      if (!ripple) return;
      ripple.active = true;
      ripple.t = 0;
      ripple.entity.enabled = true;
      ripple.entity.setLocalPosition(x, surfaceY() + 0.01, z);
    };

    const spawnBloom = (strength: number, life: number) => {
      const bloom = blooms.find((b) => !b.active);
      if (!bloom || strength <= 0.02) return;
      bloom.active = true;
      bloom.t = 0;
      bloom.life = life;
      bloom.strength = strength;
      bloom.angle = Math.random() * Math.PI * 2;
      bloom.entity.enabled = true;
    };

    let time = 0;
    let frameCount = 0;
    let sampleTime = 0;
    let lastDropTick = 0;
    let streamClock = 0;
    let flaskSpin = 0;
    let stopcockOpen = false;
    let lastZoomPct = 100;

    const colourless = new pc.Color(0.87, 0.91, 0.95);
    const pink = new pc.Color(0.90, 0.36, 0.66);
    const deepPink = new pc.Color(0.80, 0.20, 0.52);
    const scratch = new pc.Color();

    const onUpdate = (dt: number) => {
      time += dt;
      frameCount += 1;
      sampleTime += dt;
      if (sampleTime >= 2) {
        const fps = frameCount / sampleTime;
        if (qualityRef.current === 'auto') {
          if (fps < 28) setAutoScale((value) => Math.max(0.58, Number((value - 0.08).toFixed(2))));
          else if (fps > 52) setAutoScale((value) => Math.min(1, Number((value + 0.03).toFixed(2))));
        }
        frameCount = 0;
        sampleTime = 0;
      }

      const state = live.current;
      const delivered = state.volume;

      // Burette column drains as titrant is delivered.
      const remaining = Math.max(0.18, 1.58 - delivered / 30 * 1.35);
      buretteSolution.setLocalScale(0.088, remaining, 0.088);
      buretteSolution.setPosition(-0.42, 2.26 + remaining / 2, -0.28);

      // Flask liquid: level rises, colour drifts toward pink near the endpoint.
      const liquidH = 0.12 + delivered / 30 * 0.1;
      flaskSolution.setLocalScale(0.70, liquidH, 0.58);
      flaskSolution.setLocalPosition(0, 0.36 + liquidH / 2, 0);
      const blend = Math.max(state.pinkBlend, state.endpoint ? 1 : 0);
      const deep = state.overshot ? clamp((delivered - 25.1) / 1.4, 0, 1) : 0;
      scratch.lerp(colourless, pink, blend);
      if (deep > 0) scratch.lerp(scratch, deepPink, deep);
      flaskLiquidMat.diffuse = scratch;
      flaskLiquidMat.opacity = 0.38 + 0.42 * blend;
      flaskLiquidMat.update();

      // Stopcock handle rotates open/closed with a satisfying snap.
      if (stopcockOpen !== state.dispensing) {
        stopcockOpen = state.dispensing;
        stopcockHandle.setLocalEulerAngles(0, 0, stopcockOpen ? 68 : 0);
      }

      // Flask wobble + spin driven by swirl energy from the swirl pad.
      const swirl = state.swirl;
      flaskSpin += swirl * dt * 16;
      const wobble = swirl * 0.055;
      flaskGroup.setLocalEulerAngles(
        Math.sin(time * 11) * wobble,
        flaskSpin,
        Math.cos(time * 9.3) * wobble,
      );
      state.swirl = Math.max(0, swirl - dt * 1.5);

      // Falling drops: one per dispense pulse plus a steady stream while held.
      if (state.dropTick !== lastDropTick) {
        lastDropTick = state.dropTick;
        spawnDrop();
      }
      if (state.dispensing) {
        streamClock += dt;
        if (streamClock > 0.19) { streamClock = 0; spawnDrop(); }
      }

      const landY = surfaceY();
      for (const drop of drops) {
        if (!drop.active) continue;
        drop.t += dt / 0.5;
        if (drop.t >= 1) {
          drop.active = false;
          drop.entity.enabled = false;
          spawnRipple(drop.landX, drop.landZ);
          // Pre-endpoint drops flash pink locally, then fade as they mix.
          // Past 25.10 mL the flash no longer fades — the permanent endpoint.
          const proximity = clamp(delivered / 25, 0, 1);
          if (state.endpoint) spawnBloom(0.85, 3.4);
          else if (delivered >= 25) spawnBloom(0.75, 1.6);
          else spawnBloom(0.1 + 0.5 * proximity * proximity, 1.9);
          continue;
        }
        const t = drop.t;
        const y = 1.68 - (1.68 - landY) * Math.pow(t, 1.6);
        drop.entity.setLocalPosition(drop.landX * t * 0.25, y, drop.landZ * t * 0.25);
        drop.entity.setLocalScale(0.05, 0.075 + t * 0.05, 0.05);
      }

      for (const ripple of ripples) {
        if (!ripple.active) continue;
        ripple.t += dt;
        if (ripple.t >= 0.5) { ripple.active = false; ripple.entity.enabled = false; continue; }
        const s = 0.16 + ripple.t * 1.1;
        ripple.entity.setLocalScale(s, 0.012, s * 0.85);
        ripple.mat.opacity = 0.5 * (1 - ripple.t / 0.5);
        ripple.mat.update();
      }

      for (const bloom of blooms) {
        if (!bloom.active) continue;
        // Swirling mixes the drop into the bulk — blooms orbit and fade faster.
        bloom.t += dt * (1 + state.swirl * 2.6);
        if (bloom.t >= bloom.life) { bloom.active = false; bloom.entity.enabled = false; continue; }
        bloom.angle += dt * (0.9 + state.swirl * 7);
        const radius = 0.14 + bloom.t * 0.16;
        const fade = Math.pow(1 - bloom.t / bloom.life, 1.4);
        bloom.entity.setLocalPosition(
          Math.cos(bloom.angle) * radius,
          landY - 0.08,
          Math.sin(bloom.angle) * radius * 0.8,
        );
        bloom.entity.setLocalScale(0.09 + bloom.t * 0.07, 0.07, 0.09 + bloom.t * 0.07);
        bloom.mat.opacity = bloom.strength * fade;
        bloom.mat.update();
      }

      // Smoothly follow the hand-driven orbit target and zoom level.
      yaw += (targetYaw - yaw) * Math.min(1, dt * 7);
      pitch += (targetPitch - pitch) * Math.min(1, dt * 7);
      dist += (targetDist - dist) * Math.min(1, dt * 6);
      applyCamera();
      // Report magnification (zoom-in = larger %) once it changes by ~4%.
      const pct = Math.round((HOME_DIST / dist) * 100);
      if (Math.abs(pct - lastZoomPct) >= 4) {
        lastZoomPct = pct;
        onZoomRef.current(pct);
      }
    };
    app.on('update', onUpdate);
    app.start();

    // --- responsive buffer sizing (the shrink fix) ---------------------------
    // Resize ONLY the drawing buffer via graphicsDevice. The Application-level
    // app.resizeCanvas() pins inline px styles onto the canvas, which used to
    // shrink the scene every time auto-quality lowered the render scale: the
    // ResizeObserver then locked the smaller size in. The canvas keeps its
    // stylesheet size (100% of the scene frame) and we observe the frame.
    const frame = canvas.parentElement ?? canvas;
    const qualityScale = () =>
      qualityRef.current === 'high' ? 1
      : qualityRef.current === 'balanced' ? 0.85
      : qualityRef.current === 'low' ? 0.62
      : scaleRef.current;
    const applyBuffer = () => {
      const rect = frame.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      app.graphicsDevice.maxPixelRatio = qualityScale() * (window.devicePixelRatio || 1);
      app.graphicsDevice.resizeCanvas(w, h);
    };
    resizerRef.current = applyBuffer;
    const observer = new ResizeObserver(() => applyBuffer());
    observer.observe(frame);
    // Browser zoom / device pixel ratio changes (also fires on rotation).
    let dprDebounce = 0;
    const onWindowResize = () => {
      window.clearTimeout(dprDebounce);
      dprDebounce = window.setTimeout(applyBuffer, 120);
    };
    window.addEventListener('resize', onWindowResize);
    applyBuffer();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.clearTimeout(dprDebounce);
      resizerRef.current = null;
      cameraCmd.current = () => { /* scene unmounted */ };
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('keydown', onKeyDown);
      app.off('update', onUpdate);
      app.destroy();
      appRef.current = null;
    };
  }, []);

  // Quality / auto-scale changes only affect the buffer resolution — never
  // the CSS size of the canvas, so the scene can no longer shrink itself.
  useEffect(() => {
    resizerRef.current?.();
  }, [quality, autoScale]);

  return (
    <canvas
      ref={hostRef}
      className="titration-canvas"
      tabIndex={0}
      aria-label="Interactive 3D titration laboratory scene — drag to orbit, scroll or pinch to zoom, double-tap to reset the view"
    />
  );
}

/* ========================================================================== *
 * NudgeLayer: an animated pointing hand that demonstrates the exact gesture
 * the student should perform, over the exact control they should use. It
 * re-anchors itself every animation frame, so it survives scrolling and
 * layout changes (mobile keyboard, rotating the device, tab switches).
 * ========================================================================== */

const GESTURE_HAND: Record<NudgeGesture, string> = {
  press: '👇',
  tap: '👇',
  circle: '👉',
  drag: '👉',
  point: '👉',
};

function NudgeLayer({
  plan,
  getTarget,
  onDismiss,
}: {
  plan: NudgePlan;
  getTarget: () => HTMLElement | null;
  onDismiss: () => void;
}) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    const place = () => {
      const el = getTarget();
      if (el) {
        const r = el.getBoundingClientRect();
        if (!scrolledRef.current) {
          scrolledRef.current = true;
          const inView = r.top >= 0 && r.bottom <= window.innerHeight;
          if (!inView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const ring = ringRef.current;
        if (ring) {
          ring.style.left = `${r.left - 6}px`;
          ring.style.top = `${r.top - 6}px`;
          ring.style.width = `${Math.max(36, r.width + 12)}px`;
          ring.style.height = `${Math.max(36, r.height + 12)}px`;
        }
        const hand = handRef.current;
        if (hand) {
          hand.style.left = `${r.left + r.width / 2 - 24}px`;
          hand.style.top = `${r.top + r.height / 2 - 24}px`;
        }
        const bubble = bubbleRef.current;
        if (bubble) {
          const bw = bubble.offsetWidth || 230;
          const bh = bubble.offsetHeight || 96;
          const left = clamp(r.left + r.width / 2 - bw / 2, 10, Math.max(10, window.innerWidth - bw - 10));
          let top = r.bottom + 14;
          if (top + bh > window.innerHeight - 12) top = r.top - bh - 14;
          if (top < 10) top = Math.min(window.innerHeight - bh - 12, r.bottom + 14);
          bubble.style.left = `${left}px`;
          bubble.style.top = `${Math.max(10, top)}px`;
        }
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [getTarget]);

  return (
    <div className="nudge-layer" role="status" aria-live="polite">
      <div className="nudge-ring" ref={ringRef} aria-hidden="true" />
      <div className={`nudge-hand gesture-${plan.gesture}`} ref={handRef} aria-hidden="true">
        <span>{GESTURE_HAND[plan.gesture]}</span>
      </div>
      <div className="nudge-bubble" ref={bubbleRef}>
        <strong>{plan.title}</strong>
        <p>{plan.line}</p>
        <button type="button" className="nudge-dismiss" onClick={onDismiss}>Got it — dismiss</button>
      </div>
    </div>
  );
}

const readPref = (key: string, fallback: boolean) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
};

const writePref = (key: string, value: boolean) => {
  try { window.localStorage.setItem(key, value ? '1' : '0'); } catch { /* private mode */ }
};

export default function TitrationLab() {
  const [volume, setVolume] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [dispensing, setDispensing] = useState(false);
  const [quality, setQuality] = useState<SceneQuality>('auto');
  const [elapsed, setElapsed] = useState(0);
  const [realElapsed, setRealElapsed] = useState(0);
  const [drops, setDrops] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [tab, setTab] = useState<'procedure' | 'observations' | 'theory'>('procedure');
  const [swirlTurns, setSwirlTurns] = useState(0);
  const [trials, setTrials] = useState<TrialRecord[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [toast, setToast] = useState<{ icon: string; msg: string; tone: 'info' | 'good' | 'warn' } | null>(null);
  const [cameraMoved, setCameraMoved] = useState(false);
  const [mentorAck, setMentorAck] = useState(false);
  const [padActive, setPadActive] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readPref('sorenlab-sound', true));
  const [soundLevel, setSoundLevel] = useState(0.75);
  const [history, setHistory] = useState<CurvePoint[]>([{ v: 0, ph: 1.0 }]);
  const [zoomPct, setZoomPct] = useState(100);
  const [nudge, setNudge] = useState<{ plan: NudgePlan; token: number } | null>(null);

  const timerRef = useRef<number | null>(null);
  const holdRef = useRef<number | null>(null);
  const volumeRef = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const awardedRef = useRef<Set<string>>(new Set());
  const prevEndpoint = useRef(false);
  const prevOvershot = useRef(false);
  const prevMentor = useRef(-1);
  const padRef = useRef<HTMLDivElement | null>(null);
  const swirlState = useRef({ angle: null as number | null, accum: 0, turns: 0, lastSlosh: 0, lastMove: 0 });

  // --- camera command hook + zoom readout for the toolbar buttons ----------
  const cameraCmd = useRef<(cmd: CameraCmd) => void>(() => {});
  const handleZoomReport = useCallback((pct: number) => setZoomPct(pct), []);

  // --- smart guidance bookkeeping ("is the student stuck?") -----------------
  const mountAtRef = useRef(performance.now());
  const lastProgressRef = useRef(performance.now());
  const wrongClicksRef = useRef<number[]>([]);
  const cooldownUntilRef = useRef(0);
  const nudgeTokenRef = useRef(0);
  const nudgeActiveRef = useRef(false);
  const nudgePlanRef = useRef<NudgePlan | null>(null);
  const nudgeSnapRef = useRef({ volume: 0, swirlTurns: 0, trials: 0 });

  /** Any meaningful interaction resets the "stuck" timers. */
  const markProgress = useCallback(() => {
    lastProgressRef.current = performance.now();
    wrongClicksRef.current.length = 0;
  }, []);

  const endpoint = volume >= 25.1;
  const overshot = volume >= 26;
  // Strong-acid/strong-base model: 25 mL of 0.1 M HCl titrated with 0.1 M NaOH.
  const ph = volume < 25
    ? -Math.log10(0.1 * (25 - volume) / (25 + volume))
    : volume === 25
      ? 7
      : 14 + Math.log10(0.1 * (volume - 25) / (25 + volume));
  const pinkBlend = clamp((ph - 8.2) / 1.8, 0, 1);
  const fineMode = volume >= 20;

  const live = useRef<LiveState>({
    volume: 0, endpoint: false, overshot: false, dispensing: false, pinkBlend: 0, swirl: 0, dropTick: 0,
  });
  useEffect(() => {
    live.current.volume = volume;
    live.current.endpoint = endpoint;
    live.current.overshot = overshot;
    live.current.dispensing = dispensing;
    live.current.pinkBlend = pinkBlend;
  });

  const coach = coachLine({
    volume, endpoint, overshot, drops, swirlTurns, hasSwirledEver: swirlTurns > 0, trials: trials.length,
  });

  const mentorDone = [
    cameraMoved || mentorAck,
    volume >= 5,
    swirlTurns >= 1,
    volume >= 20,
    volume >= 24.5,
    endpoint,
    endpoint && trials.length >= 1,
  ];
  const firstUndone = mentorDone.findIndex((done) => !done);
  const mentorIndex = firstUndone === -1 ? MENTOR_STEPS.length : firstUndone;

  // --- toast helper ---------------------------------------------------------
  const showToast = useCallback((icon: string, msg: string, tone: 'info' | 'good' | 'warn') => {
    setToast({ icon, msg, tone });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // --- audio unlock on the very first interaction ---------------------------
  useEffect(() => {
    labSound.setEnabled(soundOn);
    labSound.setLevel(soundLevel);
  }, [soundOn, soundLevel]);

  useEffect(() => {
    const unlock = () => { labSound.unlock(); };
    window.addEventListener('pointerdown', unlock, { capture: true, once: true });
    return () => window.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  // --- the stopcock: press and HOLD, like keeping a real valve open -----------
  const stopHold = useCallback(() => {
    if (holdRef.current !== null) {
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
    labSound.stopcock(false);
    labSound.stopPour();
    setDispensing(false);
  }, []);

  const pulse = useCallback(() => {
    const v = volumeRef.current;
    if (v >= 30) { stopHold(); return; }
    const inc = v >= 20 ? 0.1 : 0.5;
    const next = Math.min(30, Number((v + inc).toFixed(2)));
    volumeRef.current = next;
    setVolume(next);
    setDrops((d) => d + 1);
    live.current.dropTick += 1;
    markProgress();
    // The drop is heard a beat after it is released — when it lands.
    window.setTimeout(() => labSound.drip(next >= 20), 240);
    vibrate(8);
  }, [stopHold, markProgress]);

  const startHold = useCallback(() => {
    if (holdRef.current !== null || volumeRef.current >= 30) return;
    labSound.unlock();
    labSound.stopcock(true);
    labSound.startPour();
    setDispensing(true);
    pulse();
    const period = Math.max(90, 300 / speed);
    holdRef.current = window.setInterval(pulse, period);
  }, [pulse, speed]);

  useEffect(() => () => {
    if (holdRef.current !== null) window.clearInterval(holdRef.current);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    labSound.stopPour();
  }, []);

  // --- simulated experiment clock (runs while the stopcock is open) ---------
  useEffect(() => {
    if (!dispensing) return;
    timerRef.current = window.setInterval(() => {
      setRealElapsed((v) => v + 1);
      setElapsed((v) => Math.min(600, v + speed));
    }, 1000);
    return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); };
  }, [dispensing, speed]);

  useEffect(() => {
    if (elapsed >= 600) stopHold();
  }, [elapsed, stopHold]);

  // --- live pH curve history -------------------------------------------------
  useEffect(() => {
    setHistory((h) => (h.length && h[h.length - 1].v === volume ? h : [...h.slice(-400), { v: volume, ph }]));
  }, [volume, ph]);

  // --- milestone sounds: endpoint, overshoot, mentor steps -------------------
  useEffect(() => {
    if (endpoint && !prevEndpoint.current) {
      labSound.endpoint();
      vibrate([18, 40, 18]);
      showToast('◉', 'Endpoint — the pink is permanent. Record your volume!', 'good');
    }
    prevEndpoint.current = endpoint;
    if (overshot && !prevOvershot.current) {
      labSound.warn();
      vibrate([30, 30, 30]);
      showToast('⚠', 'Overshot — deep pink. Reset and try stopping one drop earlier.', 'warn');
    }
    prevOvershot.current = overshot;
  }, [endpoint, overshot, showToast]);

  useEffect(() => {
    if (prevMentor.current >= 0 && mentorIndex > prevMentor.current && mentorIndex <= MENTOR_STEPS.length) {
      const finished = MENTOR_STEPS[mentorIndex - 1];
      if (finished) {
        labSound.step();
        showToast('✓', `Step complete — ${finished.title}`, 'good');
      }
    }
    prevMentor.current = mentorIndex;
  }, [mentorIndex, showToast]);

  // --- badges -----------------------------------------------------------------
  useEffect(() => {
    const earned: string[] = [];
    if (drops >= 1) earned.push('first-drop');
    if (swirlTurns >= 10) earned.push('swirl-master');
    if (volume >= 24.5 && drops >= 15) earned.push('steady-hands');
    if (endpoint && volume <= 25.3) earned.push('sharp-eye');
    if (trials.length >= 2 && Math.abs(trials[trials.length - 1].volume - trials[trials.length - 2].volume) <= 0.2) earned.push('repetition');
    if (mentorIndex >= MENTOR_STEPS.length) earned.push('complete');
    for (const id of earned) {
      if (awardedRef.current.has(id)) continue;
      awardedRef.current.add(id);
      const def = BADGES.find((b) => b.id === id);
      labSound.badge();
      if (def) showToast(def.icon, `Badge earned — ${def.title}`, 'good');
      setBadges((b) => [...b, id]);
    }
  }, [drops, swirlTurns, volume, endpoint, trials, mentorIndex, showToast]);

  // --- the swirl pad: drag in circles to rotate the flask ---------------------
  const padAngle = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2));
  };

  const onPadDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer not active (synthetic events) */ }
    labSound.unlock();
    swirlState.current.angle = padAngle(e.clientX, e.clientY);
    swirlState.current.lastMove = performance.now();
    setPadActive(true);
  };

  const onPadMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swirlState.current;
    if (s.angle === null) return;
    const a = padAngle(e.clientX, e.clientY);
    let d = a - s.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.angle = a;
    const ad = Math.abs(d);
    if (ad < 0.03) return;
    s.accum += ad;
    live.current.swirl = Math.min(1, live.current.swirl + ad * 0.16);
    const now = performance.now();
    const dt = Math.max(8, now - s.lastMove) / 1000;
    s.lastMove = now;
    if (now - s.lastSlosh > 190) {
      s.lastSlosh = now;
      labSound.slosh(Math.min(1, (ad / dt) * 0.32));
    }
    const turns = Math.floor(s.accum / (Math.PI * 2));
    if (turns > s.turns) {
      s.turns = turns;
      setSwirlTurns(turns);
      markProgress();
      vibrate(6);
      labSound.glassClink(true);
    }
  };

  const onPadUp = () => {
    swirlState.current.angle = null;
    setPadActive(false);
  };

  // --- experiment lifecycle ----------------------------------------------------
  const reset = () => {
    stopHold();
    labSound.reset();
    vibrate(12);
    setVolume(0);
    volumeRef.current = 0;
    setSpeed(1);
    setElapsed(0);
    setRealElapsed(0);
    setDrops(0);
    setSwirlTurns(0);
    setHistory([{ v: 0, ph: 1.0 }]);
    swirlState.current.accum = 0;
    swirlState.current.turns = 0;
    prevEndpoint.current = false;
    prevOvershot.current = false;
    prevMentor.current = cameraMoved || mentorAck ? 1 : 0;
  };

  const recordTrial = () => {
    if (!endpoint) return;
    const record: TrialRecord = {
      id: trials.length + 1,
      volume,
      ph,
      drops,
      seconds: elapsed,
      swirlTurns,
      accurate: Math.abs(volume - 25) <= 0.2,
    };
    setTrials((ts) => [...ts, record]);
    labSound.glassClink(false);
    vibrate(15);
    showToast('✎', `Trial ${record.id} recorded — endpoint at ${volume.toFixed(2)} mL`, 'good');
    setTab('observations');
  };

  const onSceneInteract = useCallback(() => {
    setCameraMoved(true);
    markProgress();
  }, [markProgress]);

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      labSound.setEnabled(next);
      writePref('sorenlab-sound', next);
      if (next) labSound.tick();
      return next;
    });
  };

  // --- smart guidance: notice a stuck student, then demonstrate the action ---
  const stateRef = useRef({
    volume: 0,
    mentorIndex: 0,
    endpoint: false,
    overshot: false,
    trials: 0,
    dispensing: false,
    cameraMoved: false,
    swirlTurns: 0,
    tab: 'procedure' as 'procedure' | 'observations' | 'theory',
  });
  useEffect(() => {
    stateRef.current = {
      volume, mentorIndex, endpoint, overshot, trials: trials.length, dispensing,
      cameraMoved, swirlTurns, tab,
    };
  });

  const dismissNudge = useCallback((reason: 'manual' | 'timeout' | 'satisfied') => {
    if (!nudgeActiveRef.current) return;
    nudgeActiveRef.current = false;
    nudgePlanRef.current = null;
    setNudge(null);
    // The cooldown stops the lab from nagging; how long depends on why it hid.
    cooldownUntilRef.current = performance.now() + (reason === 'timeout' ? 45000 : reason === 'satisfied' ? 20000 : 32000);
    lastProgressRef.current = performance.now();
  }, []);

  /** Resolve which DOM element the animated hand should point at right now. */
  const getNudgeTarget = useCallback((): HTMLElement | null => {
    const plan = nudgePlanRef.current;
    if (!plan) return null;
    if (plan.target === 'observations' || plan.target === 'record') {
      if (stateRef.current.tab === 'observations') {
        return document.querySelector<HTMLElement>('[data-nudge="record"]')
          ?? document.querySelector<HTMLElement>('[data-nudge="observations"]');
      }
      return document.querySelector<HTMLElement>('[data-nudge="observations"]');
    }
    return document.querySelector<HTMLElement>(`[data-nudge="${plan.target}"]`);
  }, []);

  // Classify every press: productive, neutral, or a sign of confusion.
  useEffect(() => {
    const EFFECTIVE = [
      '.dispense-button', '.swirl-pad', '.sound-button', '.sound-slider', '.zoom-button',
      '.scene-toolbar select', '.speed-control input', '.notes-tabs button',
      '.record-button', '.text-button', '.mentor-ack', '.report-card button',
    ].join(',');
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('.nudge-layer')) return; // dismissing guidance is neutral
      if (target.closest('.titration-canvas')) {
        // A bare tap on the 3D scene never orbits the camera — it only counts
        // as confusion when the mentor is waiting for something else.
        const st = stateRef.current;
        const waitingElsewhere = !(st.mentorIndex === 0 && !st.cameraMoved);
        if (waitingElsewhere) wrongClicksRef.current.push(performance.now());
        return;
      }
      const el = target.closest(EFFECTIVE);
      if (!el) {
        wrongClicksRef.current.push(performance.now());
        return;
      }
      // Reset with nothing to reset is a no-op flail, not progress.
      const resetNoop = el.classList.contains('text-button')
        && stateRef.current.volume < 0.5 && stateRef.current.trials === 0;
      if (resetNoop) wrongClicksRef.current.push(performance.now());
      else markProgress();
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [markProgress]);

  // Watch for "stuck": several wrong presses, or a long stretch of nothing.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (nudgeActiveRef.current || now < cooldownUntilRef.current) return;
      if (now - mountAtRef.current < 4000) return;
      const st = stateRef.current;
      if (st.dispensing) return; // actively working — leave them be
      if (st.mentorIndex >= MENTOR_STEPS.length && !st.overshot) return; // finished
      const wrongs = wrongClicksRef.current.filter((t) => now - t < 15000);
      wrongClicksRef.current = wrongs;
      const idle = now - lastProgressRef.current;
      const confused = wrongs.length >= 3 || idle > 20000 || (idle > 12000 && wrongs.length >= 1);
      if (!confused) return;
      const plan = nudgePlan(st);
      if (!plan) return;
      nudgeTokenRef.current += 1;
      nudgeActiveRef.current = true;
      nudgePlanRef.current = plan;
      nudgeSnapRef.current = { volume: st.volume, swirlTurns: st.swirlTurns, trials: st.trials };
      setNudge({ plan, token: nudgeTokenRef.current });
      labSound.step();
      vibrate(10);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // The guidance dissolves the moment the student does the demonstrated thing.
  useEffect(() => {
    if (!nudge || !nudgeActiveRef.current) return;
    const t = nudge.plan.target;
    const snap = nudgeSnapRef.current;
    const ok =
      (t === 'scene' && cameraMoved) ||
      (t === 'dispense' && (dispensing || volume > snap.volume)) ||
      (t === 'swirl' && swirlTurns > snap.swirlTurns) ||
      ((t === 'observations' || t === 'record') && trials.length > snap.trials) ||
      (t === 'reset' && volume < snap.volume);
    if (ok) {
      labSound.tick();
      dismissNudge('satisfied');
    }
  }, [nudge, cameraMoved, dispensing, volume, swirlTurns, trials, dismissNudge]);

  // If they still do nothing, quietly step back after a while.
  useEffect(() => {
    if (!nudge) return;
    const id = window.setTimeout(() => dismissNudge('timeout'), 16000);
    return () => window.clearTimeout(id);
  }, [nudge, dismissNudge]);

  const indicatorLabel = endpoint ? (overshot ? 'Deep pink' : 'Pink') : ph >= 8.2 ? 'Faint pink' : 'Colourless';

  return (
    <main className="titration-page">
      <header className="lab-topbar">
        <a className="lab-brand" href="/"><span className="brand-mark">S</span><span>soren<span>labs</span></span></a>
        <div className="lab-breadcrumb"><a href="/">Labs</a><span>/</span><span>Chemistry</span><span>/</span><strong>Acid–base titration</strong></div>
        <a className="lab-exit" href="/">Exit lab <span aria-hidden="true">↗</span></a>
      </header>

      <section className="lab-heading">
        <div>
          <div className="eyebrow"><span className="status-dot" /> VIRTUAL CHEMISTRY · EXPERIMENT 001</div>
          <h1>Acid–base <span>titration</span></h1>
          <p>Hold the stopcock open with your finger, swirl the flask, and listen — the bench responds to your hands while the mentor guides you to the endpoint.</p>
        </div>
        <div className="lab-status"><span className={endpoint ? 'status-light complete' : 'status-light'} />{endpoint ? (overshot ? 'Endpoint overshot' : 'Endpoint reached') : 'Experiment ready'}</div>
      </section>

      <section className="lab-workspace">
        <div className="scene-column">
          <div className="scene-toolbar">
            <div><span className="live-dot" /> LIVE 3D SCENE <span className="toolbar-divider">/</span> <span className="toolbar-hint">DRAG TO ORBIT · SCROLL OR PINCH TO ZOOM</span></div>
            <div className="toolbar-right">
              <div className="zoom-cluster" role="group" aria-label="Camera zoom" data-zoom={zoomPct}>
                <button className="zoom-button" type="button" onClick={() => { cameraCmd.current('in'); labSound.tick(); }} title="Zoom in" aria-label={`Zoom in — camera at ${zoomPct}%`}>+</button>
                <button className="zoom-button" type="button" onClick={() => { cameraCmd.current('out'); labSound.tick(); }} title="Zoom out" aria-label={`Zoom out — camera at ${zoomPct}%`}>−</button>
                <button className="zoom-button" type="button" onClick={() => { cameraCmd.current('home'); labSound.tick(); }} title="Reset view" aria-label="Reset the camera view">⤢</button>
              </div>
              <div className="sound-cluster" role="group" aria-label="Sound controls">
                <button className={`sound-button${soundOn ? '' : ' muted'}`} type="button" onClick={toggleSound} aria-pressed={soundOn} title={soundOn ? 'Mute the lab' : 'Unmute the lab'}>
                  <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
                </button>
                <input
                  className="sound-slider"
                  type="range" min="0" max="1" step="0.05" value={soundLevel}
                  aria-label="Lab volume"
                  onChange={(e) => { const v = Number(e.target.value); setSoundLevel(v); labSound.setLevel(v); }}
                />
              </div>
              <label>Visual quality
                <select value={quality} onChange={(e) => { setQuality(e.target.value as SceneQuality); labSound.tick(); }}>
                  <option value="auto">Auto</option><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low-end</option>
                </select>
              </label>
            </div>
          </div>

          <div className="scene-frame" data-nudge="scene">
            <TitrationScene live={live} quality={quality} onInteract={onSceneInteract} cameraCmd={cameraCmd} onZoom={handleZoomReport} />
          </div>
          <div className="scene-caption-row">
            <div className="scene-chip"><span>●</span> Student-controlled experiment</div>
            <div className="scene-legend"><span><i className="legend-orange" /> Titrant</span><span><i className="legend-purple" /> Indicator solution</span><span><i className="legend-pink" /> Pink flash</span></div>
          </div>
          <div className={`coach-bar tone-${coach.tone}`} aria-live="polite">
            <span className="coach-icon" aria-hidden="true">{coach.tone === 'warn' ? '⚠' : coach.tone === 'good' ? '◉' : '✦'}</span>
            <p>{coach.line}</p>
            <span className="coach-step">{Math.min(mentorIndex + 1, MENTOR_STEPS.length)}/{MENTOR_STEPS.length}</span>
          </div>
          <div className="scene-footnote"><span>ⓘ</span> 3D scene is a visual model; measurements follow the experiment's teaching model. Sound is synthesized live — no headphones required, but they help.</div>

          <div className="control-panel">
            <div className="panel-title">
              <div><span className="panel-kicker">YOUR HANDS, YOUR EXPERIMENT</span><h2>Operate the burette</h2></div>
              <button className="text-button" data-nudge="reset" onClick={() => { reset(); }}>Reset experiment ↺</button>
            </div>
            <div className="hands-grid">
              <div className="burette-control">
                <div className="valve-illustration" aria-hidden="true">
                  <div className="valve-track"><div className="valve-fill" style={{ height: `${Math.min(100, volume / 30 * 100)}%` }} /></div>
                  <div className={`valve-handle${dispensing ? ' open' : ''}`} />
                </div>
                <div className="burette-instructions">
                  <strong>Stopcock control</strong>
                  <p>Press and <em>hold</em> — titrant flows only while you keep the valve open, just like the real thing. Release to stop instantly.</p>
                  <div className="drop-row"><span>{drops} drops</span><span>{volume.toFixed(2)} mL delivered</span><span>{swirlTurns} swirl turns</span></div>
                </div>
                <button
                  className={`dispense-button${dispensing ? ' holding' : ''}${volume >= 30 ? ' disabled' : ''}`}
                  data-nudge="dispense"
                  disabled={volume >= 30}
                  aria-pressed={dispensing}
                  onPointerDown={(e) => { e.preventDefault(); startHold(); }}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  onPointerCancel={stopHold}
                  onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } }}
                  onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stopHold(); }}
                >
                  <span className="dispense-icon" aria-hidden="true">{dispensing ? '≈' : volume >= 30 ? '✓' : '＋'}</span>
                  <span>{dispensing ? 'Stopcock open' : volume >= 30 ? 'Burette empty' : endpoint ? 'Add more (overshoot)' : 'Hold to dispense'}</span>
                  <small>{fineMode ? '0.1 mL per drop' : '0.5 mL per pulse'}</small>
                </button>
              </div>

              <div className="swirl-control">
                <div
                  ref={padRef}
                  className={`swirl-pad${padActive ? ' active' : ''}`}
                  data-nudge="swirl"
                  role="application"
                  aria-label="Swirl pad — drag in circles to swirl the flask"
                  onPointerDown={onPadDown}
                  onPointerMove={onPadMove}
                  onPointerUp={onPadUp}
                  onPointerCancel={onPadUp}
                >
                  <span className="pad-flask" aria-hidden="true">↻</span>
                  <span className="pad-ring" aria-hidden="true" />
                  <span className="pad-ring delay" aria-hidden="true" />
                </div>
                <p><strong>Swirl the flask</strong>Drag in circles to mix after each addition. Listen to the liquid roll around the glass.</p>
              </div>
            </div>
          </div>
        </div>

        <aside className="lab-sidebar">
          <section className="mentor-card">
            <div className="instrument-header">
              <div><span className="panel-kicker">LAB MENTOR · TEACHES AS YOU WORK</span><h2>Guided procedure</h2></div>
              <span className="instrument-live">{Math.min(mentorIndex + 1, MENTOR_STEPS.length)}/{MENTOR_STEPS.length}</span>
            </div>
            <ol className="mentor-steps">
              {MENTOR_STEPS.map((step, i) => {
                const done = mentorDone[i];
                const active = i === mentorIndex;
                return (
                  <li key={step.id} className={done ? 'done' : active ? 'active' : ''}>
                    <span className="step-check" aria-hidden="true">{done ? '✓' : i + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      {active && <p>{step.detail}</p>}
                      {active && step.hint && <em>{step.hint}</em>}
                      {active && step.id === 'inspect' && !done && (
                        <button className="mentor-ack" type="button" onClick={() => { setMentorAck(true); labSound.tick(); }}>Got it — start the experiment</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="instrument-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Experiment readings</h2></div><span className="instrument-live">LIVE</span></div>
            <div className="reading-main"><span>Volume delivered</span><strong>{volume.toFixed(2)} <small>mL</small></strong><div className="reading-track"><span style={{ width: `${Math.min(100, volume / 30 * 100)}%` }} /></div><div className="reading-scale"><span>0 mL</span><span>30 mL</span></div></div>
            <div className="reading-grid"><div><span>Estimated pH</span><strong>{ph.toFixed(2)}</strong></div><div><span>Indicator</span><strong className={endpoint ? 'pink-value' : ''}>{indicatorLabel}</strong></div><div><span>Elapsed time</span><strong>{fmtClock(elapsed)}</strong></div><div><span>Playback speed</span><strong>{speed}×</strong></div></div>
            <div className="speed-control"><div className="speed-label"><span>Simulation playback</span><strong>{speed}×</strong></div><input aria-label="Simulation speed" type="range" min="1" max="10" step="1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /><div className="speed-marks"><span>Real time</span><span>10× faster</span></div><p>Experiment clock: {elapsed} simulated seconds · {realElapsed} real seconds elapsed</p></div>
          </section>

          <section className="chart-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE PLOT · pH VS VOLUME</span><h2>Titration curve</h2></div></div>
            <TitrationCurve history={history} endpoint={endpoint} liveVolume={volume} livePh={ph} />
            <div className="chart-legend"><span><i className="legend-curve" /> your curve</span><span><i className="legend-eq" /> equivalence 25 mL</span><span><i className="legend-range" /> indicator range 8.2–10</span></div>
          </section>

          <section className="notes-card">
            <div className="notes-tabs" role="tablist" aria-label="Lab information">
              <button className={tab === 'procedure' ? 'active' : ''} onClick={() => { setTab('procedure'); labSound.tick(); }}>Procedure</button><button className={tab === 'observations' ? 'active' : ''} data-nudge="observations" onClick={() => { setTab('observations'); labSound.tick(); }}>Observations</button><button className={tab === 'theory' ? 'active' : ''} onClick={() => { setTab('theory'); labSound.tick(); }}>Theory</button>
            </div>
            {tab === 'procedure' && (
              <div className="notes-content">
                <h3>What to do</h3>
                <ol>
                  <li>Drag the 3D scene to inspect the burette, flask and white tile.</li>
                  <li>Hold the stopcock control to let titrant flow; release to pause.</li>
                  <li>Swirl the flask in circles after each addition to mix.</li>
                  <li>After 20 mL, work drop by drop — 0.1 mL per tap.</li>
                  <li>Stop when a faint pink survives swirling; record the trial.</li>
                </ol>
                {showGuide && (
                  <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Real endpoint judgement is all about the swirl: pink that vanishes when you swirl means "not yet"; pink that stays means "stop now". Watch for the flash, then swirl.</p></div>
                )}
                <button className="guide-toggle" onClick={() => setShowGuide((v) => !v)}>{showGuide ? 'Hide lab tip' : 'Show lab tip'}</button>
              </div>
            )}
            {tab === 'observations' && (
              <div className="notes-content">
                <h3>Your observation log</h3>
                <div className="observation-row"><span>Volume added</span><strong>{volume.toFixed(2)} mL</strong></div>
                <div className="observation-row"><span>Observed colour</span><strong className={endpoint ? 'pink-value' : ''}>{indicatorLabel}</strong></div>
                <div className="observation-row"><span>Drop count</span><strong>{drops}</strong></div>
                <div className="observation-row"><span>Swirl turns</span><strong>{swirlTurns}</strong></div>
                {endpoint ? (
                  <>
                    <button className="record-button" type="button" data-nudge="record" onClick={recordTrial}>✎ Record this trial</button>
                    {trials.length > 0 && (
                      <table className="trial-table">
                        <thead><tr><th>#</th><th>Endpoint</th><th>pH</th><th>Drops</th><th>Time</th><th>±0.2 mL</th></tr></thead>
                        <tbody>
                          {trials.map((t) => (
                            <tr key={t.id}><td>{t.id}</td><td>{t.volume.toFixed(2)} mL</td><td>{t.ph.toFixed(1)}</td><td>{t.drops}</td><td>{fmtClock(t.seconds)}</td><td className={t.accurate ? 'ok' : 'off'}>{t.accurate ? 'yes' : 'no'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p className="observation-note">Compare repeated trials — real chemists average at least three endpoint volumes and report the spread.</p>
                  </>
                ) : (
                  <p className="observation-note">Reach the endpoint to record your first trial. Then reset and try to repeat it more precisely.</p>
                )}
              </div>
            )}
            {tab === 'theory' && (
              <div className="notes-content">
                <h3>Why it works</h3>
                <p>Titration determines an unknown concentration by reacting a measured volume of one solution with a solution of known concentration.</p>
                <div className="equation">HCl + NaOH → NaCl + H₂O</div>
                <p>For a 1:1 acid–base reaction, the equivalence point occurs when the reacting amounts are stoichiometrically equal — 25.00 mL here. Near equivalence a single 0.1 mL drop swings the pH by several units, which is why the curve turns vertical and why you must slow down: the pink flash that fades on swirling is local excess being consumed by remaining acid.</p>
                <p>Phenolphthalein is colourless below pH 8.2 and pink above 10. The first drop whose colour survives the swirl marks the endpoint — just past equivalence.</p>
              </div>
            )}
          </section>

          <section className="badges-card">
            <div className="instrument-header"><div><span className="panel-kicker">LAB SKILLS EARNED</span><h2>Badges</h2></div></div>
            <div className="badge-row">
              {BADGES.map((b) => {
                const earned = badges.includes(b.id);
                return (
                  <span key={b.id} className={earned ? 'badge earned' : 'badge'} title={b.detail}>
                    <span aria-hidden="true">{b.icon}</span>{b.title}
                  </span>
                );
              })}
            </div>
          </section>

          <section className="report-card"><div className="report-icon">↗</div><div><strong>Experiment report</strong><p>{endpoint ? 'Endpoint recorded. Record the trial, then repeat for accuracy.' : 'Follow the mentor steps to reach your first endpoint.'}</p></div><button onClick={() => { setTab('observations'); labSound.tick(); }} aria-label="Open observations">→</button></section>
        </aside>
      </section>
      <footer className="lab-footer"><span><strong>SOREN LABS</strong> · Built for learning by doing</span><span>Experiment 001 · Chemistry</span><a href="/">Back to all labs ↑</a></footer>

      {nudge && (
        <NudgeLayer key={nudge.token} plan={nudge.plan} getTarget={getNudgeTarget} onDismiss={() => dismissNudge('manual')} />
      )}

      {toast && (
        <div className={`toast tone-${toast.tone}`} role="status" aria-live="assertive">
          <span aria-hidden="true">{toast.icon}</span><p>{toast.msg}</p>
        </div>
      )}
    </main>
  );
}
