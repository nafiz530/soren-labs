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

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { endpointRef.current = endpoint; }, [endpoint]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { qualityRef.current = quality; }, [quality]);

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
    app.scene.gammaCorrection = pc.GAMMA_SRGB;
    app.scene.toneMapping = pc.TONEMAP_ACES;

    const camera = new pc.Entity('Camera');
    camera.addComponent('camera', { clearColor: new pc.Color(0.91, 0.94, 0.97), fov: 38, nearClip: 0.1, farClip: 100 });
    camera.setPosition(0, 3.2, 8.8);
    camera.lookAt(0, 1.2, 0);
    app.root.addChild(camera);

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
    const addShape = (name: string, type: 'box' | 'cylinder' | 'sphere' | 'cone', pos: [number, number, number], scale: [number, number, number], mat: pc.StandardMaterial, rot?: [number, number, number]) => {
      const entity = new pc.Entity(name);
      entity.addComponent('render', { type, material: mat, castShadows: true, receiveShadows: true });
      entity.setPosition(...pos);
      entity.setLocalScale(...scale);
      if (rot) entity.setEulerAngles(...rot);
      app.root.addChild(entity);
      return entity;
    };

    const benchMat = material(new pc.Color(0.83, 0.86, 0.89), { gloss: 0.25 });
    const steelMat = material(new pc.Color(0.53, 0.60, 0.67), { metalness: 0.72, gloss: 0.82 });
    const glassMat = material(new pc.Color(0.77, 0.88, 0.94), { gloss: 0.95, opacity: 0.24 });
    const liquidMat = material(new pc.Color(0.91, 0.40, 0.20), { gloss: 0.78, opacity: 0.88 });
    const flaskLiquidMat = material(new pc.Color(0.92, 0.78, 0.93), { gloss: 0.72, opacity: 0.72 });
    const darkMat = material(new pc.Color(0.18, 0.23, 0.29), { metalness: 0.25 });
    const whiteMat = material(new pc.Color(0.97, 0.98, 0.99), { gloss: 0.3 });

    addShape('Laboratory worktop', 'box', [0, -0.16, 0], [8, 0.32, 4.6], benchMat);
    addShape('Front bench edge', 'box', [0, -0.36, 2.15], [8, 0.12, 0.12], whiteMat);

    // Burette stand, clamp and graduated glass tube.
    addShape('Stand base', 'box', [-1.45, 0.08, -0.28], [1.05, 0.15, 0.75], steelMat);
    addShape('Stand rod', 'cylinder', [-1.45, 1.55, -0.28], [0.055, 3.0, 0.055], steelMat);
    addShape('Clamp arm', 'box', [-0.96, 2.52, -0.28], [1.05, 0.09, 0.12], darkMat);
    addShape('Burette glass', 'cylinder', [-0.42, 1.74, -0.28], [0.14, 1.9, 0.14], glassMat);
    const buretteSolution = addShape('Burette solution', 'cylinder', [-0.42, 1.78, -0.28], [0.088, 1.58, 0.088], liquidMat);
    for (let i = 0; i <= 10; i++) {
      addShape('Burette graduation ' + i, 'box', [-0.32, 2.48 - i * 0.145, -0.195], [i % 5 === 0 ? 0.11 : 0.06, 0.012, 0.012], darkMat);
    }
    addShape('Stopcock body', 'box', [-0.42, 0.73, -0.28], [0.28, 0.09, 0.12], steelMat);
    addShape('Stopcock handle', 'box', [-0.42, 0.73, -0.18], [0.08, 0.28, 0.07], darkMat);
    addShape('Burette tip', 'cone', [-0.42, 0.53, -0.28], [0.065, 0.27, 0.065], glassMat);

    // Conical flask: glass body, neck, solution and rim.
    addShape('Flask base', 'cylinder', [0.45, 0.12, 0.18], [1.0, 0.12, 0.82], glassMat);
    addShape('Flask body', 'cone', [0.45, 0.67, 0.18], [1.08, 1.12, 0.9], glassMat, [0, 0, 0]);
    addShape('Flask neck', 'cylinder', [0.45, 1.38, 0.18], [0.27, 0.48, 0.27], glassMat);
    addShape('Flask rim', 'cylinder', [0.45, 1.63, 0.18], [0.34, 0.07, 0.34], glassMat);
    const flaskSolution = addShape('Flask solution', 'cylinder', [0.45, 0.42, 0.18], [0.70, 0.12, 0.58], flaskLiquidMat);
    addShape('Flask foot', 'cylinder', [0.45, 0.055, 0.18], [1.0, 0.08, 0.82], glassMat);

    // Small dropper and nearby reagent bottle.
    addShape('Reagent bottle', 'cylinder', [2.15, 0.48, -0.35], [0.43, 0.82, 0.43], glassMat);
    addShape('Reagent liquid', 'cylinder', [2.15, 0.32, -0.35], [0.34, 0.38, 0.34], flaskLiquidMat);
    addShape('Bottle cap', 'cylinder', [2.15, 0.94, -0.35], [0.22, 0.14, 0.22], darkMat);
    addShape('Label', 'box', [2.15, 0.53, -0.125], [0.29, 0.25, 0.012], whiteMat);

    // Worktop measurement card and gentle backdrop.
    addShape('Back wall', 'box', [0, 2.05, -2.15], [8, 4.4, 0.12], whiteMat);
    addShape('Back panel', 'box', [0, 2.3, -2.06], [7.8, 2.8, 0.035], material(new pc.Color(0.91, 0.94, 0.97)));
    addShape('Digital scale', 'box', [2.0, 0.03, 1.1], [1.15, 0.12, 0.72], darkMat);
    addShape('Scale display', 'box', [2.0, 0.105, 1.1], [0.66, 0.025, 0.2], material(new pc.Color(0.70, 0.86, 0.77)));

    let time = 0;
    const onUpdate = (dt: number) => {
      time += dt;
      const delivered = volumeRef.current;
      const remaining = Math.max(0.18, 1.58 - delivered / 30 * 1.35);
      buretteSolution.setLocalScale(0.088, remaining, 0.088);
      buretteSolution.setPosition(-0.42, 2.52 - remaining / 2, -0.28);
      flaskLiquidMat.diffuse = endpointRef.current ? new pc.Color(0.89, 0.34, 0.65) : new pc.Color(0.92, 0.78, 0.93);
      flaskLiquidMat.update();
      flaskSolution.setPosition(0.45, 0.42, 0.18);
      // Animate a single falling drop only while the student is dispensing.
      const drop = app.root.findByName('Falling drop');
      if (runningRef.current && volumeRef.current > 0 && !endpointRef.current) {
        if (!drop) {
          const d = addShape('Falling drop', 'sphere', [-0.42, 0.43, -0.28], [0.045, 0.07, 0.045], liquidMat);
          d.enabled = true;
        } else {
          const phase = (time * 1.8) % 1;
          drop.setPosition(-0.42, 0.49 - phase * 0.38, -0.12 + phase * 0.15);
        }
      } else if (drop) {
        drop.enabled = false;
      }
      // Gentle camera breathing is intentionally omitted for accessibility and battery life.
    };
    app.on('update', onUpdate);
    app.start();

    let lastWidth = 0;
    let lastHeight = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width !== lastWidth || rect.height !== lastHeight) {
        lastWidth = rect.width;
        lastHeight = rect.height;
        app.resizeCanvas(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    return () => {
      observer.disconnect();
      app.off('update', onUpdate);
      app.destroy();
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const canvas = hostRef.current;
    if (!canvas) return;
    const scale = quality === 'high' ? 1 : quality === 'balanced' ? 0.85 : quality === 'low' ? 0.68 : 0.9;
    const apply = () => {
      const rect = canvas.getBoundingClientRect();
      app.graphicsDevice.maxPixelRatio = scale * (window.devicePixelRatio || 1);
      app.resizeCanvas(Math.max(1, Math.round(rect.width * scale)), Math.max(1, Math.round(rect.height * scale)));
    };
    apply();
  }, [quality]);

  return <canvas ref={hostRef} className="titration-canvas" aria-label="Interactive 3D titration laboratory scene" />;
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
              <div className="burette-instructions"><strong>Stopcock control</strong><p>Tap to add titrant. Near the endpoint, dispense smaller drops for more accurate results.</p><div className="drop-row"><span>{drops} drops added</span><span>{volume.toFixed(2)} mL delivered</span></div></div>
              <button className={endpoint ? 'dispense-button disabled' : 'dispense-button'} disabled={endpoint} onPointerDown={(e) => { e.preventDefault(); addDrop(); }}><span className="dispense-icon">＋</span><span>{endpoint ? 'Endpoint reached' : 'Add titrant'}</span><small>{volume >= 20 ? '0.1 mL per drop' : '0.5 mL per drop'}</small></button>
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
            {tab === 'observations' && <div className="notes-content"><h3>Your observation log</h3><div className="observation-row"><span>Volume added</span><strong>{volume.toFixed(2)} mL</strong></div><div className="observation-row"><span>Observed colour</span><strong>{endpoint ? 'Pink' : ph >= 8.2 ? 'Faint pink' : 'Colourless'}</strong></div><div className="observation-row"><span>Drop count</span><strong>{drops}</strong></div><p className="observation-note">Record the endpoint volume and compare repeated trials for accuracy.</p></div>}
            {tab === 'theory' && <div className="notes-content"><h3>Why it works</h3><p>Titration determines an unknown concentration by reacting a measured volume of one solution with a solution of known concentration.</p><div className="equation">HCl + NaOH → NaCl + H₂O</div><p>For a 1:1 acid–base reaction, the equivalence point occurs when the reacting amounts are stoichiometrically equal. The equivalence point is near 25.00 mL for these equal-concentration solutions. The visible phenolphthalein endpoint appears just after equivalence, when the solution becomes faint pink.</p></div>}
          </section>

          <section className="report-card"><div className="report-icon">↗</div><div><strong>Experiment report</strong><p>{endpoint ? 'Endpoint recorded. Review your readings and write a conclusion.' : 'Reach the endpoint to complete your observation.'}</p></div><button onClick={() => setTab('observations')} aria-label="Open observations">→</button></section>
        </aside>
      </section>
      <footer className="lab-footer"><span><strong>SOREN LABS</strong> · Built for learning by doing</span><span>Experiment 001 · Chemistry</span><a href="/">Back to all labs ↑</a></footer>
    </main>
  );
}
