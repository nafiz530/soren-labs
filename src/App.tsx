import { useState } from 'react';

const principles = [
  {
    number: '01',
    title: 'Learn by doing',
    description: 'Explore ideas through direct interaction, not just diagrams and descriptions.',
  },
  {
    number: '02',
    title: 'Time that makes sense',
    description: 'Observe an experiment at its natural pace or accelerate it when appropriate.',
  },
  {
    number: '03',
    title: 'Made for real devices',
    description: 'Designed around responsive controls and performance on a wide range of phones.',
  },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

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
          <a href="#approach" onClick={() => setMenuOpen(false)}>Our approach</a>
          <a href="#principles" onClick={() => setMenuOpen(false)}>What matters</a>
          <a className="nav-cta" href="https://sorenchat.com/">Explore Soren Chat <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="hero" id="approach">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> SCIENCE, MEET CURIOSITY</div>
          <h1>Don't just read about it.<br /><span>Try it yourself.</span></h1>
          <p className="hero-description">
            A new way to explore science through hands-on virtual laboratories.
            Make a change, observe what happens, and discover the why behind it.
          </p>
          <a className="primary-button" href="#principles">Discover our approach <span aria-hidden="true">↘</span></a>
          <p className="hero-note"><span aria-hidden="true">✳</span> Built for students. Designed for everyday devices.</p>
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
          <h2>Built for every curious mind.</h2>
          <p>The foundation is taking shape. The experiments will come next.</p>
        </div>
        <span className="closing-coordinate">RAJSHAHI · BANGLADESH<br />MADE FOR LEARNING</span>
      </section>

      <footer className="site-footer">
        <a className="footer-brand" href="/"><span className="brand-mark">S</span><span>sorenlabs</span></a>
        <span>Interactive science, made accessible.</span>
        <span>© {new Date().getFullYear()} Soren Labs</span>
      </footer>
    </main>
  );
}
