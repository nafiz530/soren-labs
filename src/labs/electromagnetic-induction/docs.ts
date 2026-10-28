import type { DocsContent } from '../../engine/types';

export const inductionDocs: DocsContent = {
  h1: 'Electromagnetic Induction Virtual Lab — Faraday & Lenz Law With a Magnet and Coil',
  intro:
    'Grab a bar magnet and push it through a coil of wire while a centre-zero galvanometer keeps score. Every kick of the needle is Faraday’s law happening in your hand: EMF = −N·dΦ/dt, so only a changing flux produces anything. Push slowly for a gentle kick, hold still for none at all, yank it out for a big one on the opposite side — then flip the polarity and triple the loops to see both laws of induction at work.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench shows a coil of wire drawn as stacked copper loops, wired to an analogue galvanometer whose needle sits at zero until you earn a deflection. The bar magnet is yours to drag along the coil axis — and because it keeps its momentum when you let go, you can throw it, slide it, or creep it through one centimetre at a time.',
        'Push the magnet slowly into the coil and the needle kicks, overshoots, and settles back as you stop. Hold it perfectly still — anywhere, even inside the coil — and nothing flows at all, no matter how much flux is present. Pull it out fast and the needle slams the other way. Each completed kick is banked into your observation table with its peak EMF, direction, speed and the settings that produced it.',
        'Two controls sharpen the lesson. “Flip magnet polarity” swaps N and S so the very same motion induces current the opposite way — the coach explains the Lenz’s-law reasoning each time. And switching the coil between 20 and 60 loops makes identical strokes kick roughly three times as hard, because the EMF is proportional to the number of turns.',
      ],
    },
    {
      h2: 'The physics behind the experiment',
      body: [
        'A magnet passing through a coil changes the magnetic flux Φ threading the loops. Michael Faraday’s discovery is that only the rate of that change matters — a stationery magnet, however strong and however close, induces nothing. The lab computes the coil flux from the exact dipole-flux formula, differences it 240 times a second, and drives the meter from the result:',
      ],
      bullets: [
        'EMF = −N · dΦ/dt — Faraday’s law of induction (N = number of loops)',
        'The minus sign is Lenz’s law: induced current opposes the change in flux that made it',
        'Deflection ∝ speed: a fast pull can kick more than twice a slow push',
        'Holding the magnet still gives dΦ/dt = 0 — zero EMF at any flux',
        'Tripling the loops (20 → 60) triples the EMF for the same motion',
      ],
    },
    {
      h2: 'Why speed and direction both matter',
      body: [
        'The flux through the coil depends on where the magnet is; the EMF depends on how fast that flux is changing. The steepest change happens while the magnet is sweeping through the coil’s plane, which is exactly where you will feel the needle respond hardest. Double your hand speed and you double dΦ/dt — the peak EMF versus speed graph in your observations plots as a straight line through the origin.',
        'Direction shows up twice. Reverse the motion (push in versus pull out) and dΦ/dt changes sign, so the needle swings to the opposite side. Reverse the magnet’s polarity and the flux itself changes sign — the same physical stroke now induces the opposite current. When both reverse at once (flip the magnet and pull instead of push), the needle deflection returns to its original side, a subtlety worth testing deliberately.',
        'The galvanometer is modelled honestly too: its needle has inertia and a return spring, so it kicks, overshoots slightly and settles. Read it at rest for the true value — a real centre-zero meter behaves exactly the same way, and part of good technique is not reporting a still-swinging needle.',
      ],
    },
    {
      h2: 'Technique, precision and what to measure',
      body: [
        'For quantitative work, repeat the same stroke at deliberately different speeds and let the lab bank the kicks; the table records the speed at each peak so the EMF-versus-speed proportionality comes from your own data, not a textbook claim. Compare 20-loop and 60-loop strokes at matched speeds and the points should separate into two bands with almost exactly a factor of three between them.',
        'The stillness test is the control experiment of the whole lab: park the magnet dead centre in the coil, where flux is largest, and watch the needle sit at zero for as long as you like. It is the cleanest possible demonstration that induction rewards change, not presence. If your needle never fully settles, you are drifting — steady the hand and try again.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is the classic introduction to electromagnetic induction — the experiment that connects magnets, motion and current in one gesture. It is built for a first meeting with Faraday’s and Lenz’s laws, and for revising them later: the mentor walks through slow-in, still, fast-out, flip, loops and data-reading step by step, while the kick table and fitted graph reward careful repetition. Everything runs in the browser on a phone, tablet or desktop with synthesized sound and no downloads.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I induce current in the coil?',
      a: 'Move the magnet. Drag it along the coil axis so the flux through the loops changes — pushing in, pulling out, or sliding it past all work. The faster the motion, the larger the induced EMF and the bigger the galvanometer kick.',
    },
    {
      q: 'Why does holding the magnet still give zero current?',
      a: 'Because EMF = −N·dΦ/dt depends on the rate of change of flux, not the amount of flux. A stationary magnet, even sitting dead centre in the coil, changes nothing — so nothing is induced. Park it and watch the needle stay at zero.',
    },
    {
      q: 'What happens when I increase the number of loops?',
      a: 'The EMF is proportional to N, so going from 20 loops to 60 loops triples the deflection for the identical stroke. Repeat a stroke at both settings and compare the banked peak EMFs — they separate by almost exactly a factor of three.',
    },
    {
      q: 'What does flipping the magnet’s polarity do?',
      a: 'It reverses the flux through the coil, so the same motion now induces current in the opposite direction — the needle swings the other way for the very same push. This is Lenz’s law showing its face: the induced current always opposes the change producing it.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes. Drag (or fling) the magnet with your finger, and every control is sized for touch. On desktop you can also nudge the magnet with the arrow keys and fire it through the coil with the space bar.',
    },
  ],
};
