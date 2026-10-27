import { useEffect, useMemo, useState } from 'react';
import { LABS, LIVE_LABS, SUBJECT_ORDER } from '../engine/catalog';
import type { LabSubject } from '../engine/types';
import { useSEO } from '../engine/seo';
import './home.css';

const principles = [
  { number: '01', title: 'Learn by doing', description: 'Explore ideas through direct interaction, not just diagrams and descriptions.' },
  { number: '02', title: 'A mentor at your shoulder', description: 'Every lab watches your hands — when you stall or misstep, it shows you exactly what to do next.' },
  { number: '03', title: 'Made for real devices', description: 'Built touch-first for phones and tablets, with sound and guidance that work everywhere.' },
];

/** HomePage — the Soren Labs catalog: live labs, filters and the roadmap. */
export function HomePage() {
  useSEO({
    title: 'Soren Labs — Free Interactive Virtual Science Labs',
    description:
      'Fifty-plus hands-on virtual science labs across physics, chemistry, biology, maths and ICT. Hold real instruments in your browser: titrations, pendulums, circuits and more — with a mentor that guides you as you work. Free, no sign-up.',
    keywords: [
      'virtual science lab',
      'interactive physics simulation',
      'online chemistry lab',
      'virtual biology lab',
      'free science experiments online',
      'virtual lab for students',
    ],
    path: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Soren Labs',
      description: 'Interactive virtual science labs for students.',
    },
  });

  const params = new URLSearchParams(window.location.search);
  const initialSubject = params.get('subject');
  const [subject, setSubject] = useState<LabSubject | 'All'>(
    initialSubject && SUBJECT_ORDER.includes(initialSubject as LabSubject) ? (initialSubject as LabSubject) : 'All',
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const visible = useMemo(
    () => (subject === 'All' ? LIVE_LABS : LIVE_LABS.filter((l) => l.subject === subject)),
    [subject],
  );
  const roadmap = useMemo(
    () => (subject === 'All' ? LABS.filter((l) => l.status === 'roadmap') : LABS.filter((l) => l.status === 'roadmap' && l.subject === subject)),
    [subject],
  );
  const roadmapBySubject = useMemo(() => {
    const groups: { subject: LabSubject; labs: typeof roadmap }[] = [];
    for (const s of SUBJECT_ORDER) {
      const labs = roadmap.filter((l) => l.subject === s);
      if (labs.length) groups.push({ subject: s, labs });
    }
    return groups;
  }, [roadmap]);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Soren Labs home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand-name">soren<span>labs</span></span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <nav className={menuOpen ? 'nav nav-open' : 'nav'} aria-label="Main navigation">
          <a href="#catalog" onClick={() => setMenuOpen(false)}>All labs</a>
          <a href="/docs" onClick={() => setMenuOpen(false)}>Guides</a>
          <a href="#roadmap" onClick={() => setMenuOpen(false)}>Roadmap</a>
          <a className="nav-cta" href="https://sorenchat.com/">Explore Soren Chat <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="hero" id="approach">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> SCIENCE, MEET CURIOSITY</div>
          <h1>Don&apos;t just read about it.<br /><span>Try it yourself.</span></h1>
          <p className="hero-description">
            A growing catalog of hands-on virtual laboratories — physics, chemistry, biology and beyond.
            Hold the instruments, hear the bench, and let a mentor guide your hands while the data piles up.
          </p>
          <a className="primary-button" href="#catalog">Browse the labs <span aria-hidden="true">↗</span></a>
          <p className="hero-note"><span aria-hidden="true">✳</span> {LABS.length} experiments planned · {LIVE_LABS.length} live today · free and no sign-up.</p>
        </div>

        <div className="hero-visual" aria-label="Illustration of a virtual science laboratory">
          <div className="visual-grid" />
          <div className="visual-label label-top"><span className="tiny-dot" /> EXPLORE / OBSERVE / UNDERSTAND</div>
          <div className="lab-orbit orbit-one" />
          <div className="lab-orbit orbit-two" />
          <div className="glass-card beaker-card">
            <div className="beaker-tag">LAB NOTE <span>001</span></div>
            <svg className="beaker-art" viewBox="0 0 260 260" role="img" aria-label="Stylized beaker with orange liquid">
              <defs>
                <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#d7e5ed" stopOpacity=".18" />
                  <stop offset=".48" stopColor="#ffffff" stopOpacity=".68" />
                  <stop offset="1" stopColor="#b8cbd8" stopOpacity=".24" />
                </linearGradient>
                <linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffb15c" stopOpacity=".9" />
                  <stop offset="1" stopColor="#f97316" stopOpacity=".78" />
                </linearGradient>
              </defs>
              <ellipse cx="130" cy="220" rx="62" ry="10" fill="#64748b" opacity=".13" />
              <path d="M94 35 L94 59 L72 172 Q69 193 91 198 L169 198 Q191 193 188 172 L166 59 L166 35" fill="url(#glass)" stroke="#8da8b9" strokeWidth="2.5" />
              <path d="M78 145 L182 145 L188 172 Q191 193 169 198 L91 198 Q69 193 72 172 Z" fill="url(#liquid)" />
              <path d="M77 145 Q130 139 183 145" fill="none" stroke="#f97316" strokeWidth="2" />
              <path d="M94 35 L166 35 M89 59 L171 59" stroke="#8da8b9" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M102 82 L118 82 M99 103 L116 103 M95 124 L113 124 M145 82 L161 82 M148 103 L165 103 M151 124 L169 124" stroke="#8da8b9" strokeWidth="1.5" opacity=".8" />
              <path d="M105 45 L105 65 L88 158" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
              <circle cx="145" cy="161" r="4" fill="#fff1df" opacity=".8" />
              <circle cx="125" cy="178" r="3" fill="#fff1df" opacity=".7" />
            </svg>
            <div className="beaker-caption"><span>OBSERVATION</span><strong>Every action reveals something.</strong></div>
          </div>
          <div className="floating-note note-left"><span className="note-icon">↗</span><span><strong>Change a variable</strong><small>See what changes</small></span></div>
          <div className="floating-note note-right"><span className="note-icon note-icon-blue">◉</span><span><strong>Learn by testing</strong><small>Not just watching</small></span></div>
          <div className="visual-index">S / LABS <span>— 001</span></div>
        </div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <div>
            <div className="eyebrow">THE LAB CATALOG</div>
            <h2>Pick a bench.<br />Start experimenting.</h2>
          </div>
          <p>Every lab is hands-on: real controls, live instruments, synthesized sound and a mentor that steps in
            the moment you look lost. Guides explain the science — the labs let you feel it.</p>
        </div>

        <div className="filter-row" role="group" aria-label="Filter labs by subject">
          {(['All', ...SUBJECT_ORDER] as (LabSubject | 'All')[]).map((s) => (
            <button
              key={s}
              type="button"
              className={subject === s ? 'filter-chip active' : 'filter-chip'}
              aria-pressed={subject === s}
              onClick={() => setSubject(s)}
            >
              {s}
              <span>{s === 'All' ? LIVE_LABS.length : LIVE_LABS.filter((l) => l.subject === s).length}</span>
            </button>
          ))}
        </div>

        <div className="catalog-grid">
          {visible.map((m) => (
            <article className="lab-card" key={m.slug}>
              <div className="lab-card-top">
                <span className="lab-card-subject">{m.subject}</span>
                <span className={`lab-card-tier tier-${m.tier.toLowerCase()}`}>{m.tier}</span>
              </div>
              <h3>{m.title}</h3>
              <p>{m.tagline}</p>
              <div className="lab-card-actions">
                <a className="primary-button" href={`/labs/${m.slug}`}>Open the lab <span aria-hidden="true">↗</span></a>
                <a className="lab-card-guide" href={`/docs/${m.docsSlug}`}>Read the guide</a>
              </div>
            </article>
          ))}
        </div>

        {roadmapBySubject.length > 0 && (
          <div className="roadmap" id="roadmap">
            <div className="roadmap-heading">
              <strong>In the workshop</strong>
              <p>The rest of the {LABS.length}-experiment catalog is being built in batches — physics first, then
                chemistry, biology and beyond. This is what is on the bench.</p>
            </div>
            {roadmapBySubject.map((g) => (
              <div className="roadmap-group" key={g.subject}>
                <h3>{g.subject} <span>{g.labs.length} in development</span></h3>
                <ul>
                  {g.labs.map((m) => (
                    <li key={m.slug}>
                      <strong>{m.title}</strong>
                      <span>{m.tagline}</span>
                      <em className="roadmap-pill">{m.tier}</em>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="principles-section" id="principles">
        <div className="section-heading">
          <div>
            <div className="eyebrow">THE THINKING BEHIND THE LAB</div>
            <h2>Curiosity deserves<br />more than a textbook.</h2>
          </div>
          <p>Good science learning happens when students can ask a question, test an idea, and see the result for themselves.</p>
        </div>
        <div className="principle-grid">
          {principles.map((principle) => (
            <article className="principle-card" key={principle.number}>
              <span className="principle-number">{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.description}</p>
              <span className="card-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-section">
        <div className="closing-mark" aria-hidden="true">S</div>
        <div>
          <div className="eyebrow">THE FOUNDATION</div>
          <h2>Ready to run your first experiment?</h2>
          <p>The labs are open — pick any bench and put your hands on it.</p>
        </div>
        <a className="closing-coordinate" href="#catalog">BROWSE ALL {LIVE_LABS.length} LIVE LABS ↗<br />MORE ON THE WAY</a>
      </section>

      <footer className="site-footer">
        <a className="footer-brand" href="/"><span className="brand-mark">S</span><span>sorenlabs</span></a>
        <span>Interactive science, made accessible.</span>
        <span>© {new Date().getFullYear()} Soren Labs</span>
      </footer>
    </main>
  );
}
