import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { BadgeDef, CoachTone, LabMeta, MentorStepDef } from './types';
import { labSound } from './audio';
import './engine.css';

/**
 * LabShell — the shared page skeleton for every Soren lab.
 *
 * Renders the whole lab page: topbar, heading, scene card (toolbar → canvas →
 * caption row → coach strip), control panel, sidebar (mentor / readings /
 * notes / badges), footer, toast — plus the sound toggle and nudge layer.
 * Labs fill the slots; the shell guarantees consistent structure, keyboard
 * support and responsive PC / tablet / phone behaviour.
 */
export function LabShell(props: {
  meta: LabMeta;
  statusText: string;
  statusTone?: 'ready' | 'active' | 'complete' | 'warn';
  /** Extra controls for the scene toolbar (inserted before sound). */
  toolbarExtra?: ReactNode;
  /** The interactive area — one element filling .scene-frame (usually a canvas). */
  scene: ReactNode;
  /** Small caption chip text under the scene, e.g. "Student-controlled experiment". */
  captionChip?: string;
  legend?: { color: string; label: string }[];
  coach: { tone: CoachTone; line: string };
  mentor: {
    steps: MentorStepDef[];
    index: number;
    done: boolean[];
    ack?: { label: string; onClick: () => void };
  };
  /** Control panel body under the scene — operating the apparatus. */
  controls: ReactNode;
  /** Sidebar content ABOVE the notes card (readings etc.). */
  sidebarTop?: ReactNode;
  /** Sidebar content BELOW the notes card (badges etc.). */
  sidebarBottom?: ReactNode;
  notes: { procedure: ReactNode; theory: ReactNode; observations: ReactNode };
  /** Notified when the notes tab changes (labs use it for mentor completion). */
  onTab?: (tab: 'procedure' | 'observations' | 'theory') => void;
  badges: BadgeDef[];
  earned: string[];
  nudgeLayer?: ReactNode;
  toast?: { tone: 'good' | 'warn' | 'info'; icon: string; msg: string } | null;
  onReset: () => void;
}) {
  const [soundOn, setSoundOn] = useState(true);
  const [soundLevel, setSoundLevel] = useState(0.75);
  const [tab, setTab] = useState<'procedure' | 'observations' | 'theory'>('procedure');
  const { meta } = props;

  useEffect(() => () => labSound.stopLoop(), []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    labSound.setEnabled(next);
    if (next) labSound.tick();
  };

  const activeStep = props.mentor.steps[props.mentor.index];

  return (
    <main className="lab-page" data-lab={meta.slug}>
      <header className="lab-topbar">
        <a className="lab-brand" href="/">
          <span className="lab-brand-mark" aria-hidden="true">S</span>
          <span>soren<span>labs</span></span>
        </a>
        <nav className="lab-breadcrumb" aria-label="Breadcrumb">
          <a href="/">All labs</a>
          <span>/</span>
          <a href={`/?subject=${encodeURIComponent(meta.subject)}`}>{meta.subject}</a>
          <span>/</span>
          <strong>Experiment {String(meta.experimentNo).padStart(3, '0')}</strong>
        </nav>
        <a className="lab-exit" href={`/docs/${meta.docsSlug}`}>Read the guide <span>↗</span></a>
      </header>

      <section className="lab-heading">
        <div>
          <div className="eyebrow"><span className="status-dot" /> VIRTUAL {meta.subject.toUpperCase()} · EXPERIMENT {String(meta.experimentNo).padStart(3, '0')}</div>
          <h1>{titleParts(meta.title).head} <span>{titleParts(meta.title).accent}</span></h1>
          <p>{meta.tagline}</p>
        </div>
        <div className={`lab-status tone-${props.statusTone ?? 'ready'}`}>
          <span className={`status-light${props.statusTone === 'complete' ? ' complete' : ''}`} />
          {props.statusText}
        </div>
      </section>

      <section className="lab-workspace">
        <div className="scene-column">
          <div className="scene-toolbar">
            <div><span className="live-dot" /> LIVE SIMULATION</div>
            <div className="toolbar-right">
              {props.toolbarExtra}
              <div className="sound-cluster" role="group" aria-label="Sound controls">
                <button
                  className={`sound-button${soundOn ? '' : ' muted'}`}
                  type="button"
                  onClick={toggleSound}
                  aria-pressed={soundOn}
                  title={soundOn ? 'Mute the lab' : 'Unmute the lab'}
                >
                  <span aria-hidden="true">{soundOn ? '🔊' : '🔇'}</span>
                </button>
                <input
                  className="sound-slider"
                  type="range" min="0" max="1" step="0.05" value={soundLevel}
                  aria-label="Lab volume"
                  onChange={(e) => { const v = Number(e.target.value); setSoundLevel(v); labSound.setLevel(v); }}
                />
              </div>
            </div>
          </div>

          <div className="scene-frame" data-nudge="scene">{props.scene}</div>

          {(props.captionChip || props.legend?.length) && (
            <div className="scene-caption-row">
              {props.captionChip && <div className="scene-chip"><span>●</span> {props.captionChip}</div>}
              {props.legend?.length ? (
                <div className="scene-legend">
                  {props.legend.map((l) => (
                    <span key={l.label}><i style={{ background: l.color }} /> {l.label}</span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          <div className={`coach-bar tone-${props.coach.tone}`} aria-live="polite">
            <span className="coach-icon" aria-hidden="true">{props.coach.tone === 'warn' ? '⚠' : props.coach.tone === 'good' ? '◉' : '✦'}</span>
            <p>{props.coach.line}</p>
            <span className="coach-step">{Math.min(props.mentor.index + 1, props.mentor.steps.length)}/{props.mentor.steps.length}</span>
          </div>

          <div className="scene-footnote">
            <span>ⓘ</span> The simulation is a faithful teaching model; measurements are recorded from your own actions. Sound is synthesized live — no headphones required, but they help.
          </div>

          <div className="control-panel">
            <div className="panel-title">
              <div><span className="panel-kicker">YOUR HANDS, YOUR EXPERIMENT</span><h2>Operate the apparatus</h2></div>
              <button className="text-button" data-nudge="reset" onClick={() => { labSound.reset(); props.onReset(); }}>Reset experiment ↺</button>
            </div>
            {props.controls}
          </div>
        </div>

        <aside className="lab-sidebar">
          {props.sidebarTop}

          <section className="mentor-card">
            <div className="instrument-header">
              <div><span className="panel-kicker">LAB MENTOR · TEACHES AS YOU WORK</span><h2>Guided procedure</h2></div>
              <span className="instrument-live">{Math.min(props.mentor.index + 1, props.mentor.steps.length)}/{props.mentor.steps.length}</span>
            </div>
            <ol className="mentor-steps">
              {props.mentor.steps.map((step, i) => {
                const done = props.mentor.done[i];
                const active = i === props.mentor.index;
                return (
                  <li key={step.id} className={done ? 'done' : active ? 'active' : ''}>
                    <span className="step-check" aria-hidden="true">{done ? '✓' : i + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      {active && <p>{step.detail}</p>}
                      {active && step.hint && <em>{step.hint}</em>}
                      {active && props.mentor.ack && !done && (
                        <button className="mentor-ack" type="button" onClick={() => { labSound.tick(); props.mentor.ack?.onClick(); }}>
                          {props.mentor.ack.label}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="notes-card">
            <div className="notes-tabs" role="tablist" aria-label="Lab information">
              <button className={tab === 'procedure' ? 'active' : ''} onClick={() => { setTab('procedure'); labSound.tick(); props.onTab?.('procedure'); }}>Procedure</button>
              <button className={tab === 'observations' ? 'active' : ''} data-nudge="observations" onClick={() => { setTab('observations'); labSound.tick(); props.onTab?.('observations'); }}>Observations</button>
              <button className={tab === 'theory' ? 'active' : ''} onClick={() => { setTab('theory'); labSound.tick(); props.onTab?.('theory'); }}>Theory</button>
            </div>
            {tab === 'procedure' && <div className="notes-content">{props.notes.procedure}</div>}
            {tab === 'observations' && <div className="notes-content">{props.notes.observations}</div>}
            {tab === 'theory' && <div className="notes-content">{props.notes.theory}</div>}
          </section>

          {props.sidebarBottom}

          <section className="badges-card">
            <div className="instrument-header"><div><span className="panel-kicker">LAB SKILLS EARNED</span><h2>Badges</h2></div></div>
            <div className="badge-row">
              {props.badges.map((b) => {
                const earned = props.earned.includes(b.id);
                return (
                  <span key={b.id} className={earned ? 'badge earned' : 'badge'} title={b.detail}>
                    <span aria-hidden="true">{b.icon}</span>{b.title}
                  </span>
                );
              })}
            </div>
          </section>

          <section className="report-card">
            <div className="report-icon">↗</div>
            <div><strong>Experiment report</strong><p>{activeStep ? `Next: ${activeStep.title}` : 'All steps complete — nice work.'}</p></div>
            <button onClick={() => { setTab('observations'); labSound.tick(); }} aria-label="Open observations">→</button>
          </section>
        </aside>
      </section>

      <footer className="lab-footer">
        <span><strong>SOREN LABS</strong> · Built for learning by doing</span>
        <span>Experiment {String(meta.experimentNo).padStart(3, '0')} · {meta.subject} · {meta.tier}</span>
        <a href={`/docs/${meta.docsSlug}`}>Read the full guide ↑</a>
      </footer>

      {props.nudgeLayer}
      {props.toast && (
        <div className={`toast tone-${toastTone(props.toast.tone)}`} role="status" aria-live="assertive">
          <span aria-hidden="true">{props.toast.icon}</span><p>{props.toast.msg}</p>
        </div>
      )}
    </main>
  );
}

function toastTone(t: 'good' | 'warn' | 'info') {
  return t === 'good' ? 'good' : t === 'warn' ? 'warn' : 'info';
}

function titleParts(title: string): { head: string; accent: string } {
  const words = title.split(' ');
  if (words.length < 2) return { head: title, accent: '' };
  return { head: words.slice(0, -1).join(' '), accent: words[words.length - 1] };
}
