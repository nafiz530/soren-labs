import { useCallback, useEffect, useRef, useState } from 'react';
import * as pc from 'playcanvas';
import './titration.css';

type SceneQuality = 'auto' | 'high' | 'balanced' | 'low';

function TitrationScene({ volume, endpoint, running, quality }: { volume: number; endpoint: boolean; running: boolean; quality: SceneQuality }) {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<pc.Application | null>(null);
  const volumeRef = useRef(volume);
  const endpointRef = useRef(endpoint);
  const runningRef = useRef(running);
  const qualityRef = useRef(quality);
  const [autoScale, setAutoScale] = useState(() => typeof window === 'undefined' ? 0.8 : (window.devicePixelRatio > 2 ? 0.64 : 0.82));
  const autoScaleRef = useRef(autoScale);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { endpointRef.current = endpoint; }, [endpoint]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { qualityRef.current = quality; }, [quality]);
  useEffect(() => { autoScaleRef.current = autoScale; }, [autoScale]);

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
    app.scene.ambientLight = new pc.Color(0.34, 0.40, 0.49);

    const target = new pc.Vec3(0, 1.02, 0);
    let cameraAngle = 0.12;
    let cameraDistance = 8.9;
    let cameraHeight = 3.5;
    const camera = new pc.Entity('Camera');
    camera.addComponent('camera', { clearColor: new pc.Color(0.075, 0.105, 0.15), fov: 34, nearClip: 0.1, farClip: 100 });
    const placeCamera = () => {
      camera.setPosition(Math.sin(cameraAngle) * cameraDistance, cameraHeight, Math.cos(cameraAngle) * cameraDistance);
      camera.lookAt(target);
    };
    placeCamera();
    app.root.addChild(camera);

    const makeMaterial = (color: pc.Color, options: { metalness?: number; gloss?: number; opacity?: number; emissive?: pc.Color } = {}) => {
      const mat = new pc.StandardMaterial();
      mat.diffuse = color;
      mat.metalness = options.metalness ?? 0;
      mat.gloss = options.gloss ?? 0.55;
      if (options.emissive) mat.emissive = options.emissive;
      if (options.opacity !== undefined) {
        mat.opacity = options.opacity;
        mat.blendType = pc.BLEND_NORMAL;
        mat.depthWrite = false;
      }
      mat.update();
      return mat;
    };
    const add = (name: string, type: 'box' | 'cylinder' | 'sphere' | 'cone', position: [number, number, number], scale: [number, number, number], mat: pc.StandardMaterial, rotation?: [number, number, number]) => {
      const entity = new pc.Entity(name);
      entity.addComponent('render', { type, material: mat, castShadows: false, receiveShadows: false });
      entity.setPosition(...position);
      entity.setLocalScale(...scale);
      if (rotation) entity.setEulerAngles(...rotation);
      app.root.addChild(entity);
      return entity;
    };
    const addLight = (name: string, type: 'directional' | 'omni', position: [number, number, number], intensity: number, color: pc.Color) => {
      const light = new pc.Entity(name);
      light.addComponent('light', { type, intensity, color, range: 18 });
      light.setPosition(...position);
      if (type === 'directional') light.lookAt(0, 0, 0);
      app.root.addChild(light);
    };
    addLight('Warm key light', 'directional', [-3.5, 7, 4.5], 1.25, new pc.Color(1, 0.83, 0.68));
    addLight('Cool fill light', 'omni', [4.5, 4.2, 2.5], 0.85, new pc.Color(0.55, 0.72, 1));
    addLight('Rim light', 'omni', [-1, 3.5, -3], 0.65, new pc.Color(0.43, 0.83, 1));

    const benchMat = makeMaterial(new pc.Color(0.17, 0.22, 0.29), { gloss: 0.32, metalness: 0.15 });
    const edgeMat = makeMaterial(new pc.Color(0.32, 0.40, 0.49), { metalness: 0.45, gloss: 0.78 });
    const steelMat = makeMaterial(new pc.Color(0.58, 0.67, 0.76), { metalness: 0.78, gloss: 0.88 });
    const darkMat = makeMaterial(new pc.Color(0.07, 0.10, 0.15), { metalness: 0.3, gloss: 0.72 });
    const glassMat = makeMaterial(new pc.Color(0.73, 0.86, 0.96), { gloss: 0.98, opacity: 0.22 });
    const glassHighlight = makeMaterial(new pc.Color(0.88, 0.96, 1), { gloss: 0.98, opacity: 0.65, emissive: new pc.Color(0.12, 0.17, 0.22) });
    const buretteLiquidMat = makeMaterial(new pc.Color(0.96, 0.43, 0.18), { gloss: 0.88, opacity: 0.92 });
    const acidLiquidMat = makeMaterial(new pc.Color(0.73, 0.78, 0.95), { gloss: 0.86, opacity: 0.88 });
    const pinkLiquidMat = makeMaterial(new pc.Color(0.97, 0.32, 0.66), { gloss: 0.88, opacity: 0.9, emissive: new pc.Color(0.08, 0.015, 0.045) });
    const labelMat = makeMaterial(new pc.Color(0.90, 0.94, 0.97), { gloss: 0.25 });
    const ledMat = makeMaterial(new pc.Color(0.22, 0.92, 0.69), { emissive: new pc.Color(0.1, 0.45, 0.25), gloss: 0.8 });

    add('Workbench slab', 'box', [0, -0.16, 0], [8.2, 0.34, 4.8], benchMat);
    add('Workbench front trim', 'box', [0, -0.34, 2.36], [8.2, 0.08, 0.08], edgeMat);
    add('Workbench side trim', 'box', [-4.06, -0.34, 0], [0.08, 0.08, 4.72], edgeMat);
    add('Back wall', 'box', [0, 2.45, -2.55], [8.2, 5.3, 0.12], darkMat);
    add('Back wall light rail', 'box', [0, 3.95, -2.46], [7.2, 0.035, 0.04], edgeMat);
    add('Wall rail left indicator', 'sphere', [-3.25, 3.95, -2.4], [0.055, 0.055, 0.055], ledMat);
    add('Wall rail right indicator', 'sphere', [3.25, 3.95, -2.4], [0.055, 0.055, 0.055], ledMat);
    for (let i = -3; i <= 3; i++) add('Bench seam ' + i, 'box', [i * 0.98, 0.013, 0.05], [0.012, 0.006, 3.9], edgeMat);

    add('Stand foot', 'box', [-1.65, 0.08, -0.38], [1.0, 0.14, 0.68], steelMat);
    add('Stand foot inset', 'box', [-1.65, 0.156, -0.38], [0.62, 0.025, 0.43], darkMat);
    add('Stand vertical rod', 'cylinder', [-1.65, 1.63, -0.38], [0.065, 3.0, 0.065], steelMat);
    add('Clamp crossbar', 'box', [-1.02, 2.55, -0.38], [1.35, 0.09, 0.14], steelMat);
    add('Clamp jaw left', 'box', [-0.59, 2.46, -0.38], [0.08, 0.18, 0.13], darkMat);
    add('Clamp jaw right', 'box', [-0.38, 2.46, -0.38], [0.08, 0.18, 0.13], darkMat);
    add('Clamp screw', 'cylinder', [-0.95, 2.55, -0.27], [0.07, 0.22, 0.07], darkMat, [0, 0, 90]);
    add('Burette glass tube', 'cylinder', [-0.48, 1.72, -0.38], [0.15, 1.95, 0.15], glassMat);
    const buretteSolution = add('Burette solution', 'cylinder', [-0.48, 1.78, -0.38], [0.083, 1.56, 0.083], buretteLiquidMat);
    add('Burette highlight', 'box', [-0.535, 1.75, -0.298], [0.018, 1.72, 0.012], glassHighlight);
    for (let i = 0; i <= 20; i++) {
      const y = 2.53 - i * 0.077;
      add('Burette graduation ' + i, 'box', [-0.37, y, -0.286], [i % 5 === 0 ? 0.105 : 0.055, 0.012, 0.012], darkMat);
    }
    add('Burette top rim', 'cylinder', [-0.48, 2.72, -0.38], [0.17, 0.035, 0.17], glassMat);
    add('Stopcock body', 'box', [-0.48, 0.68, -0.38], [0.28, 0.09, 0.14], steelMat);
    add('Stopcock handle', 'box', [-0.48, 0.68, -0.25], [0.07, 0.25, 0.07], darkMat);
    add('Burette tip', 'cone', [-0.48, 0.48, -0.38], [0.065, 0.24, 0.065], glassMat);
    add('Tip highlight', 'box', [-0.49, 0.49, -0.345], [0.012, 0.16, 0.012], glassHighlight);

    add('Flask glass body', 'cone', [0.55, 0.68, 0.16], [1.12, 1.15, 0.92], glassMat);
    add('Flask foot ring', 'cylinder', [0.55, 0.13, 0.16], [0.93, 0.08, 0.78], glassMat);
    add('Flask neck', 'cylinder', [0.55, 1.39, 0.16], [0.28, 0.48, 0.28], glassMat);
    add('Flask mouth rim', 'cylinder', [0.55, 1.65, 0.16], [0.34, 0.055, 0.34], glassMat);
    const flaskSolution = add('Flask liquid', 'cylinder', [0.55, 0.39, 0.16], [0.64, 0.13, 0.54], acidLiquidMat);
    add('Flask liquid meniscus', 'cylinder', [0.55, 0.455, 0.16], [0.61, 0.018, 0.51], acidLiquidMat);
    add('Flask left reflection', 'box', [0.23, 0.76, 0.63], [0.025, 0.72, 0.018], glassHighlight, [0, 0, -23]);
    add('Flask neck reflection', 'box', [0.48, 1.39, 0.31], [0.018, 0.34, 0.015], glassHighlight);
    add('Flask calibration mark', 'box', [0.55, 1.12, 0.315], [0.24, 0.012, 0.012], steelMat);

    add('Reagent bottle body', 'cylinder', [2.18, 0.47, -0.3], [0.43, 0.78, 0.43], glassMat);
    add('Reagent bottle solution', 'cylinder', [2.18, 0.31, -0.3], [0.34, 0.36, 0.34], buretteLiquidMat);
    add('Reagent bottle shoulder', 'cone', [2.18, 0.88, -0.3], [0.31, 0.18, 0.31], glassMat);
    add('Reagent bottle neck', 'cylinder', [2.18, 0.99, -0.3], [0.2, 0.14, 0.2], glassMat);
    add('Reagent bottle cap', 'cylinder', [2.18, 1.08, -0.3], [0.23, 0.08, 0.23], darkMat);
    add('Reagent label', 'box', [2.18, 0.51, -0.075], [0.28, 0.22, 0.012], labelMat);
    add('Balance base', 'box', [2.1, 0.025, 1.18], [1.18, 0.12, 0.78], darkMat);
    add('Balance pan', 'box', [2.1, 0.095, 1.18], [0.84, 0.025, 0.55], steelMat);
    add('Balance screen', 'box', [2.1, 0.105, 0.78], [0.56, 0.018, 0.12], ledMat);
    add('Balance display bezel', 'box', [2.1, 0.095, 0.77], [0.68, 0.04, 0.18], darkMat);

    const drop = add('Falling titrant drop', 'sphere', [-0.48, 0.4, -0.3], [0.045, 0.065, 0.045], buretteLiquidMat);
    drop.enabled = false;
    let time = 0, frameCount = 0, sampleTime = 0, lastEndpoint = false, lastVolume = -1, dropStartedAt = -10;
    const onUpdate = (dt: number) => {
      time += dt; frameCount += 1; sampleTime += dt;
      if (sampleTime >= 2) {
        const fps = frameCount / sampleTime;
        if (qualityRef.current === 'auto') {
          if (fps < 27) setAutoScale((value) => Math.max(0.52, Number((value - 0.08).toFixed(2))));
          else if (fps > 52) setAutoScale((value) => Math.min(0.92, Number((value + 0.025).toFixed(3))));
        }
        frameCount = 0; sampleTime = 0;
      }
      const delivered = volumeRef.current;
      if (delivered !== lastVolume) {
        if (lastVolume >= 0 && delivered > lastVolume) dropStartedAt = time;
        lastVolume = delivered;
      }
      const remaining = Math.max(0.12, 1.56 - delivered / 30 * 1.32);
      buretteSolution.setLocalScale(0.083, remaining, 0.083);
      buretteSolution.setPosition(-0.48, 0.94 + remaining / 2, -0.38);
      const liquidHeight = 0.13 + Math.min(0.13, delivered / 30 * 0.13);
      flaskSolution.setLocalScale(0.64, liquidHeight, 0.54);
      flaskSolution.setPosition(0.55, 0.31 + liquidHeight / 2, 0.16);
      if (lastEndpoint !== endpointRef.current) {
        lastEndpoint = endpointRef.current;
        flaskSolution.render!.meshInstances[0].material = lastEndpoint ? pinkLiquidMat : acidLiquidMat;
      }
      drop.enabled = time - dropStartedAt < 0.52 && runningRef.current;
      if (drop.enabled) {
        const phase = Math.min(1, (time - dropStartedAt) / 0.52);
        drop.setPosition(-0.48, 0.43 - phase * 0.31, -0.22 + phase * 0.14);
      }
    };
    app.on('update', onUpdate);
    app.start();

    let dragging = false, lastX = 0, lastY = 0;
    const pointerDown = (event: PointerEvent) => {
      dragging = true; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX, dy = event.clientY - lastY;
      lastX = event.clientX; lastY = event.clientY;
      cameraAngle += dx * 0.006;
      cameraHeight = Math.max(2.5, Math.min(5.0, cameraHeight + dy * 0.012));
      placeCamera();
    };
    const pointerUp = () => { dragging = false; };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      cameraDistance = Math.max(6.8, Math.min(11.2, cameraDistance + event.deltaY * 0.008));
      placeCamera();
    };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('wheel', wheel, { passive: false });

    const getScale = () => qualityRef.current === 'high' ? 1 : qualityRef.current === 'balanced' ? 0.82 : qualityRef.current === 'low' ? 0.55 : autoScaleRef.current;
    const resize = () => {
      const rect = canvas.getBoundingClientRect(), scale = getScale();
      app.graphicsDevice.maxPixelRatio = scale * (window.devicePixelRatio || 1);
      app.resizeCanvas(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('wheel', wheel);
      app.off('update', onUpdate);
      app.destroy();
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current, canvas = hostRef.current;
    if (!app || !canvas) return;
    const scale = quality === 'high' ? 1 : quality === 'balanced' ? 0.82 : quality === 'low' ? 0.55 : autoScale;
    const rect = canvas.getBoundingClientRect();
    app.graphicsDevice.maxPixelRatio = scale * (window.devicePixelRatio || 1);
    app.resizeCanvas(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
  }, [quality, autoScale]);

  return <canvas ref={hostRef} className="titration-canvas" aria-label="Interactive 3D titration laboratory scene. Drag to orbit; scroll to zoom." />;
}

export default function TitrationLab() {
  const [volume, setVolume] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [quality, setQuality] = useState<SceneQuality>('auto');
  const [elapsed, setElapsed] = useState(0);
  const [realElapsed, setRealElapsed] = useState(0);
  const [drops, setDrops] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [tab, setTab] = useState<'procedure' | 'observations' | 'theory'>('procedure');
  const timerRef = useRef<number | null>(null);
  const endpoint = volume >= 25.1;
  // Strong-acid/strong-base model: 25 mL of 0.1 M HCl titrated with 0.1 M NaOH.
  const ph = volume < 25
    ? -Math.log10(0.1 * (25 - volume) / (25 + volume))
    : volume === 25
      ? 7
      : 14 + Math.log10(0.1 * (volume - 25) / (25 + volume));

  useEffect(() => {
    if (!running) return;
    timerRef.current = window.setInterval(() => {
      setRealElapsed((v) => v + 1);
      setElapsed((v) => Math.min(600, v + speed));
    }, 1000);
    return () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); };
  }, [running, speed]);

  useEffect(() => {
    if (elapsed >= 600) setRunning(false);
  }, [elapsed]);

  const addDrop = useCallback(() => {
    if (endpoint) return;
    setVolume((v) => Math.min(30, Number((v + (v >= 20 ? 0.1 : 0.5)).toFixed(2))));
    setDrops((v) => v + 1);
    setRunning(true);
  }, [endpoint]);

  const reset = () => {
    setVolume(0);
    setSpeed(1);
    setRunning(false);
    setElapsed(0);
    setRealElapsed(0);
    setDrops(0);
  };

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
          <p>Operate the burette, add titrant drop by drop, and observe the indicator change as you approach the endpoint.</p>
        </div>
        <div className="lab-status"><span className={endpoint ? 'status-light complete' : 'status-light'} />{endpoint ? 'Endpoint reached' : 'Experiment ready'}</div>
      </section>

      <section className="lab-workspace">
        <div className="scene-column">
          <div className="scene-toolbar">
            <div><span className="live-dot" /> LIVE 3D SCENE <span className="toolbar-divider">/</span> INTERACTIVE</div>
            <label>Visual quality
              <select value={quality} onChange={(e) => setQuality(e.target.value as SceneQuality)}>
                <option value="auto">Auto</option><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low-end</option>
              </select>
            </label>
          </div>
          <div className="scene-frame"><TitrationScene volume={volume} endpoint={endpoint} running={running} quality={quality} />
            <div className="scene-chip"><span>●</span> Student-controlled experiment</div>
            <div className="scene-legend"><span><i className="legend-orange" /> Titrant</span><span><i className="legend-purple" /> Indicator solution</span></div>
          </div>
          <div className="scene-footnote"><span>ⓘ</span> 3D scene is a visual model; measurements below follow the experiment's teaching model.</div>

          <div className="control-panel">
            <div className="panel-title"><div><span className="panel-kicker">YOUR HANDS, YOUR EXPERIMENT</span><h2>Operate the burette</h2></div><button className="text-button" onClick={reset}>Reset experiment ↺</button></div>
            <div className="burette-control">
              <div className="valve-illustration" aria-hidden="true"><div className="valve-track"><div className="valve-fill" style={{ height: `${Math.min(100, volume / 30 * 100)}%` }} /></div><div className="valve-handle" /></div>
              <div className="burette-instructions"><strong>Stopcock control</strong><p>Tap to add titrant. Near the endpoint, dispense smaller drops for more accurate results.</p><div className="drop-row"><span>{drops} dispenses</span><span>{volume.toFixed(2)} mL delivered</span></div></div>
              <button className={endpoint ? 'dispense-button disabled' : 'dispense-button'} disabled={endpoint} onClick={addDrop}><span className="dispense-icon">＋</span><span>{endpoint ? 'Endpoint reached' : 'Add titrant'}</span><small>{volume >= 20 ? '0.1 mL per dispense' : '0.5 mL per dispense'}</small></button>
            </div>
          </div>
        </div>

        <aside className="lab-sidebar">
          <section className="instrument-card">
            <div className="instrument-header"><div><span className="panel-kicker">LIVE INSTRUMENT</span><h2>Experiment readings</h2></div><span className="instrument-live">LIVE</span></div>
            <div className="reading-main"><span>Volume delivered</span><strong>{volume.toFixed(2)} <small>mL</small></strong><div className="reading-track"><span style={{ width: `${Math.min(100, volume / 30 * 100)}%` }} /></div><div className="reading-scale"><span>0 mL</span><span>30 mL</span></div></div>
            <div className="reading-grid"><div><span>Estimated pH</span><strong>{ph.toFixed(2)}</strong></div><div><span>Indicator</span><strong className={endpoint ? 'pink-value' : ''}>{endpoint ? 'Pink' : ph >= 8.2 ? 'Faint pink' : 'Colourless'}</strong></div><div><span>Elapsed time</span><strong>{Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}</strong></div><div><span>Playback speed</span><strong>{speed}×</strong></div></div>
            <div className="speed-control"><div className="speed-label"><span>Simulation playback</span><strong>{speed}×</strong></div><input aria-label="Simulation speed" type="range" min="1" max="10" step="1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /><div className="speed-marks"><span>Real time</span><span>10× faster</span></div><p>Experiment clock: {elapsed} simulated seconds · {realElapsed} real seconds elapsed</p></div>
          </section>

          <section className="notes-card">
            <div className="notes-tabs" role="tablist" aria-label="Lab information">
              <button className={tab === 'procedure' ? 'active' : ''} onClick={() => setTab('procedure')}>Procedure</button><button className={tab === 'observations' ? 'active' : ''} onClick={() => setTab('observations')}>Observations</button><button className={tab === 'theory' ? 'active' : ''} onClick={() => setTab('theory')}>Theory</button>
            </div>
            {tab === 'procedure' && <div className="notes-content"><h3>What to do</h3><ol><li>Check the initial burette and flask setup.</li><li>Add titrant gradually using the control.</li><li>Watch the indicator and volume reading.</li><li>Stop when a faint pink endpoint persists.</li></ol>{showGuide && <div className="hint-box"><span>✦</span><p><strong>Lab tip</strong>Near the endpoint, add titrant in smaller amounts. In a real titration, the endpoint is judged by a persistent colour change.</p></div>}<button className="guide-toggle" onClick={() => setShowGuide((v) => !v)}>{showGuide ? 'Hide lab tip' : 'Show lab tip'}</button></div>}
            {tab === 'observations' && <div className="notes-content"><h3>Your observation log</h3><div className="observation-row"><span>Volume added</span><strong>{volume.toFixed(2)} mL</strong></div><div className="observation-row"><span>Observed colour</span><strong>{endpoint ? 'Pink' : ph >= 8.2 ? 'Faint pink' : 'Colourless'}</strong></div><div className="observation-row"><span>Dispenses</span><strong>{drops}</strong></div><p className="observation-note">Record the endpoint volume and compare repeated trials for accuracy.</p></div>}
            {tab === 'theory' && <div className="notes-content"><h3>Why it works</h3><p>Titration determines an unknown concentration by reacting a measured volume of one solution with a solution of known concentration.</p><div className="equation">HCl + NaOH → NaCl + H₂O</div><p>For a 1:1 acid–base reaction, the equivalence point occurs when the reacting amounts are stoichiometrically equal. The equivalence point is near 25.00 mL for these equal-concentration solutions. The visible phenolphthalein endpoint appears just after equivalence, when the solution becomes faint pink.</p></div>}
          </section>

          <section className="report-card"><div className="report-icon">↗</div><div><strong>Experiment report</strong><p>{endpoint ? 'Endpoint recorded. Review your readings and write a conclusion.' : 'Reach the endpoint to complete your observation.'}</p></div><button onClick={() => setTab('observations')} aria-label="Open observations">→</button></section>
        </aside>
      </section>
      <footer className="lab-footer"><span><strong>SOREN LABS</strong> · Built for learning by doing</span><span>Experiment 001 · Chemistry</span><a href="/">Back to all labs ↑</a></footer>
    </main>
  );
}
