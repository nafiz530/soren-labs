import { DocsPage } from './docs/DocsPage';
import { DocsIndexPage } from './docs/DocsIndexPage';
import { HomePage } from './pages/HomePage';
import { LabPage } from './pages/LabPage';
import { getLabBySlug } from './engine/catalog';
import { useSEO } from './engine/seo';
import { DOCS_REGISTRY } from './docs/registry';
import type { LabMeta } from './engine/types';
import { lazy, Suspense } from 'react';

/** Lab components are code-split so the homepage stays light. */
const LAB_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  titration: lazy(() => import('./labs/titration/TitrationLab')),
  pendulum: lazy(() => import('./labs/pendulum/PendulumLab')),
  'hookes-law-spring': lazy(() => import('./labs/hookes-law-spring/HookesLawLab')),
  'ohms-law': lazy(() => import('./labs/ohms-law/OhmsLawLab')),
  'series-parallel-circuits': lazy(() => import('./labs/series-parallel-circuits/SeriesParallelLab')),
  'refraction-glass-slab': lazy(() => import('./labs/refraction-glass-slab/RefractionLab')),
  'convex-lens-bench': lazy(() => import('./labs/convex-lens-bench/LensBenchLab')),
  'density-archimedes': lazy(() => import('./labs/density-archimedes/DensityLab')),
  'specific-heat': lazy(() => import('./labs/specific-heat/SpecificHeatLab')),
  'heating-curve': lazy(() => import('./labs/heating-curve/HeatingCurveLab')),
  'resonance-tube': lazy(() => import('./labs/resonance-tube/ResonanceTubeLab')),
  'magnetic-field-mapping': lazy(() => import('./labs/magnetic-field-mapping/MagneticFieldLab')),
  'electromagnetic-induction': lazy(() => import('./labs/electromagnetic-induction/InductionLab')),
  'diode-rectifier': lazy(() => import('./labs/diode-rectifier/DiodeLab')),
};

export default function App() {
  const rawPath = window.location.pathname;
  const path = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  const segments = path.split('/').filter(Boolean);

  // /  → catalog home
  if (segments.length === 0) return <HomePage />;

  // /docs  → docs index
  if (segments.length === 1 && segments[0] === 'docs') return <DocsIndexPage />;

  // /docs/{docsSlug}  → lab guide page
  if (segments.length === 2 && segments[0] === 'docs') {
    const entry = DOCS_REGISTRY[segments[1]];
    if (entry) return <DocsPage meta={entry.meta} content={entry.docs} />;
    return <NotFound kind="guide" />;
  }

  // /labs/{slug}  → the lab itself (or its "in development" page)
  if (segments.length === 2 && segments[0] === 'labs') {
    const meta = getLabBySlug(segments[1]);
    if (!meta) return <NotFound kind="lab" />;
    if (meta.status !== 'live') return <LabPage meta={meta} />;
    const Lab = LAB_COMPONENTS[meta.slug];
    return (
      <Suspense fallback={<LabFallback name={meta.title} />}>
        <LabSEO meta={meta} />
        <Lab />
      </Suspense>
    );
  }

  return <NotFound kind="page" />;
}

function LabSEO({ meta }: { meta: LabMeta }) {
  useSEO({
    title: meta.seo.title,
    description: meta.seo.description,
    keywords: meta.seo.keywords,
    path: `/labs/${meta.slug}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: meta.seo.title,
      description: meta.seo.description,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any modern browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  });
  return null;
}

function LabFallback({ name }: { name: string }) {
  return (
    <main className="lab-page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="lab-brand" style={{ justifyContent: 'center' }}><span className="lab-brand-mark">S</span><span>soren<span>labs</span></span></div>
        <p style={{ color: '#6e7b8b', fontSize: 13, marginTop: 14 }}>Warming up the {name} bench…</p>
      </div>
    </main>
  );
}

function NotFound({ kind }: { kind: 'lab' | 'guide' | 'page' }) {
  useSEO({
    title: 'Not found — Soren Labs',
    description: 'That page does not exist yet. Browse the full catalog of interactive virtual science labs.',
    path: '/not-found',
  });
  return (
    <main className="lab-page" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div className="lab-brand" style={{ justifyContent: 'center' }}><span className="lab-brand-mark">S</span><span>soren<span>labs</span></span></div>
        <h1 style={{ fontFamily: 'Manrope, sans-serif', fontSize: 30, letterSpacing: -1.4, margin: '18px 0 8px' }}>This {kind} is not on the shelf</h1>
        <p style={{ color: '#6e7b8b', fontSize: 13, lineHeight: 1.7 }}>It may still be in development — the catalog shows everything that is live today.</p>
        <a className="primary-button" href="/" style={{ display: 'inline-flex', marginTop: 18 }}>Back to all labs ↗</a>
      </div>
    </main>
  );
}
