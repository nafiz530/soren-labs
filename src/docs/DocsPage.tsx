import { useEffect, useState } from 'react';
import type { DocsContent, LabMeta } from '../engine/types';
import { useSEO } from '../engine/seo';
import { DOCS_REGISTRY } from './registry';
import './docs.css';

/**
 * DocsPage — the SEO landing page for one lab.
 * Long-form guide: what you do, the science, technique, FAQ and a CTA into
 * the interactive lab. Content is data (see labs/{slug}/docs.ts) so search
 * engines get real text and students get a readable guide.
 */
export function DocsPage({ meta, content }: { meta: LabMeta; content: DocsContent }) {
  useSEO({
    title: meta.seo.title,
    description: meta.seo.description,
    keywords: meta.seo.keywords,
    path: `/docs/${meta.docsSlug}`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: content.h1,
        description: meta.seo.description,
        about: { '@type': 'Thing', name: meta.title },
        isPartOf: { '@type': 'WebSite', name: 'Soren Labs' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: content.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  });

  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="docs-page">
      <header className="lab-topbar">
        <a className="lab-brand" href="/"><span className="lab-brand-mark" aria-hidden="true">S</span><span>soren<span>labs</span></span></a>
        <nav className="lab-breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a><span>/</span><a href="/docs">Guides</a><span>/</span><strong>{meta.title}</strong>
        </nav>
        <a className="lab-exit" href={`/labs/${meta.slug}`}>Open the lab <span>↗</span></a>
      </header>

      <div className="docs-hero">
        <div className="eyebrow"><span className="status-dot" /> GUIDE · {meta.subject.toUpperCase()} · {meta.tier.toUpperCase()} TIER</div>
        <h1>{content.h1}</h1>
        <p className="docs-intro">{content.intro}</p>
        <div className="docs-cta-row">
          <a className="primary-button" href={`/labs/${meta.slug}`}>Run the interactive lab <span aria-hidden="true">↗</span></a>
          <span className="docs-cta-note">Free · No sign-up · Works on phone, tablet and desktop</span>
        </div>
      </div>

      <div className="docs-body">
        <nav className="docs-toc" aria-label="Table of contents">
          <strong>On this page</strong>
          <ol>
            {content.sections.map((s, i) => (
              <li key={s.h2}><a href={`#section-${i}`}>{s.h2}</a></li>
            ))}
            <li><a href="#faq">Frequently asked questions</a></li>
          </ol>
        </nav>

        <article className="docs-article">
          {content.sections.map((s, i) => (
            <section key={s.h2} id={`section-${i}`}>
              <h2>{s.h2}</h2>
              {s.body.map((p, j) => <p key={j}>{p}</p>)}
              {s.bullets && (
                <ul className="docs-bullets">
                  {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
            </section>
          ))}

          <section id="faq">
            <h2>Frequently asked questions</h2>
            {content.faq.map((f, i) => (
              <div className="docs-faq" key={f.q}>
                <button type="button" aria-expanded={expanded === i} onClick={() => setExpanded(expanded === i ? null : i)}>
                  <span>{f.q}</span><span aria-hidden="true">{expanded === i ? '−' : '+'}</span>
                </button>
                {expanded === i && <p>{f.a}</p>}
              </div>
            ))}
          </section>

          <aside className="docs-related">
            <strong>Keep exploring</strong>
            <div className="docs-related-row">
              {relatedLabs(meta).map((m) => (
                <a key={m.slug} href={`/docs/${m.docsSlug}`} className="docs-related-card">
                  <span className="docs-related-subject">{m.subject} · {m.tier}</span>
                  <strong>{m.title}</strong>
                  <span>{m.tagline}</span>
                </a>
              ))}
            </div>
          </aside>
        </article>
      </div>

      <footer className="lab-footer">
        <span><strong>SOREN LABS</strong> · Built for learning by doing</span>
        <span>Guide for Experiment {String(meta.experimentNo).padStart(3, '0')} · {meta.subject}</span>
        <a href={`/labs/${meta.slug}`}>Open the lab ↑</a>
      </footer>
    </main>
  );
}

function relatedLabs(meta: LabMeta) {
  const others = Object.values(DOCS_REGISTRY)
    .map((e) => e.meta)
    .filter((m) => m.slug !== meta.slug);
  const sameSubject = others.filter((m) => m.subject === meta.subject);
  const rest = others.filter((m) => m.subject !== meta.subject);
  return [...sameSubject, ...rest].slice(0, 3);
}
