import { useEffect } from 'react';
import { useSEO } from '../engine/seo';
import { DOCS_REGISTRY } from './registry';
import { SUBJECT_ORDER } from '../engine/catalog';
import './docs.css';

/** /docs — the guides index: every live lab's guide grouped by subject. */
export function DocsIndexPage() {
  useSEO({
    title: 'Science Lab Guides & Experiment Explainers — Soren Labs',
    description:
      'Readable, search-friendly guides for every Soren virtual lab: what you do, the science behind it, technique and FAQs. Then run the experiment yourself in the browser.',
    keywords: ['virtual lab guides', 'science experiment explainers', 'physics chemistry biology lab help', 'how to do science experiments online'],
    path: '/docs',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Soren Labs guides',
      description: 'Guides for every Soren virtual science lab.',
    },
  });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const metas = Object.values(DOCS_REGISTRY).map((e) => e.meta);

  return (
    <main className="docs-page">
      <header className="lab-topbar">
        <a className="lab-brand" href="/"><span className="lab-brand-mark" aria-hidden="true">S</span><span>soren<span>labs</span></span></a>
        <nav className="lab-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><strong>Guides</strong></nav>
        <a className="lab-exit" href="/">All labs <span>↗</span></a>
      </header>

      <div className="docs-index">
        <div className="eyebrow"><span className="status-dot" /> LAB GUIDES</div>
        <h1>Read the why, then run the how.</h1>
        <p className="docs-index-lead">
          Each guide explains one virtual lab in plain language — what you will do with your hands, the science
          underneath it, the technique that makes measurements honest, and the questions students ask most.
          Every guide links straight into the live experiment.
        </p>

        {SUBJECT_ORDER.map((subject) => {
          const labs = metas.filter((m) => m.subject === subject);
          if (!labs.length) return null;
          return (
            <div className="docs-index-group" key={subject}>
              <h2>{subject} <span>{labs.length} guide{labs.length > 1 ? 's' : ''}</span></h2>
              <div className="docs-index-grid">
                {labs.map((m) => (
                  <a key={m.slug} className="docs-index-card" href={`/docs/${m.docsSlug}`}>
                    <span className="kicker">EXPERIMENT {String(m.experimentNo).padStart(3, '0')} · {m.tier.toUpperCase()}</span>
                    <strong>{m.title}</strong>
                    <p>{m.tagline}</p>
                    <span className="open">Read the guide →</span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}

        <p className="docs-index-lead" style={{ marginTop: 30 }}>
          New labs ship in batches — Physics first, then Chemistry, Biology and beyond. Guides appear here the
          moment each lab goes live.
        </p>
      </div>
    </main>
  );
}
