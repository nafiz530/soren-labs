import { useEffect } from 'react';
import type { LabMeta } from '../engine/types';
import { useSEO } from '../engine/seo';
import { LIVE_LABS } from '../engine/catalog';
import './labpage.css';

/** LabPage — shown for catalog entries still in development. */
export function LabPage({ meta }: { meta: LabMeta }) {
  useSEO({
    title: `${meta.title} virtual lab — coming to Soren Labs`,
    description: `${meta.tagline} This lab is in development and will open here soon. Explore the live labs available today.`,
    keywords: meta.seo.keywords,
    path: `/labs/${meta.slug}`,
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="lab-page coming-page">
      <header className="lab-topbar">
        <a className="lab-brand" href="/"><span className="lab-brand-mark" aria-hidden="true">S</span><span>soren<span>labs</span></span></a>
        <nav className="lab-breadcrumb" aria-label="Breadcrumb"><a href="/">All labs</a><span>/</span><strong>{meta.subject}</strong></nav>
        <a className="lab-exit" href="/docs">Guides <span>↗</span></a>
      </header>

      <section className="coming-hero">
        <div className="eyebrow"><span className="status-dot" /> IN DEVELOPMENT · {meta.subject.toUpperCase()}</div>
        <h1>{meta.title}</h1>
        <p>{meta.tagline}</p>
        <p className="coming-status">The bench for this experiment is being built. It opens here the moment it is ready —
          same hands-on controls, same lab mentor, same sound and guidance as every Soren lab.</p>
        <a className="primary-button" href="/">Try the live labs today <span aria-hidden="true">↗</span></a>
      </section>

      <section className="coming-live">
        <h2>Live right now</h2>
        <div className="coming-grid">
          {LIVE_LABS.map((m) => (
            <a key={m.slug} className="coming-card" href={`/labs/${m.slug}`}>
              <span className="kicker">{m.subject} · {m.tier}</span>
              <strong>{m.title}</strong>
              <p>{m.tagline}</p>
              <span className="open">Open the lab →</span>
            </a>
          ))}
        </div>
      </section>

      <footer className="lab-footer">
        <span><strong>SOREN LABS</strong> · Built for learning by doing</span>
        <span>Experiment {String(meta.experimentNo).padStart(3, '0')} · {meta.subject}</span>
        <a href="/">Back to all labs ↑</a>
      </footer>
    </main>
  );
}
