import type { DocsContent } from '../../engine/types';

export const hookesLawDocs: DocsContent = {
  h1: "Hooke's Law Virtual Lab — Spring Constant Experiment Online",
  intro:
    "Hang slotted masses on a virtual spring one chip at a time, watch it stretch, overshoot and settle against a millimetre ruler, and bank every force–extension pair you measure. Load by load your own F–x graph grows a straight line whose slope is the spring constant — until you push past the elastic limit and watch the line bend and the spring refuse to spring back. A lab mentor guides your hands the whole way.",
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with a spring hanging from a top clamp, an empty mass hanger, and a vertical millimetre ruler beside a sharp pointer. Before anything moves, you note where the unloaded pointer tip rests — that mark is your zero, and every extension you record is measured down from it. It is the single most important line on the bench.',
        'Then you start loading. Tapping a mass chip stacks a 50 g slotted mass onto the hanger, and the spring does what real springs do: it dips, overshoots, rings faintly, and settles. When the pointer is still, you record the pair — the mass, the force F = mg, and the extension x read off the ruler. Ten chips are available, so the load sweeps from 50 g to 500 g in honest 50 g steps.',
        'After five well-spread points the Observations tab plots force against extension, fits the best straight line through your data, and hands you its slope: your measured spring constant, compared live against the hidden true value. And when you are brave enough to stack past 450 g, the lab shows you the physics that textbooks only describe.',
      ],
    },
    {
      h2: 'The physics of a stretching spring',
      body: [
        'A spring resists being pulled out of shape with a restoring force that — while it stays elastic — grows in exact proportion to the extension. That proportionality is Hooke’s law, and the constant of proportionality is the spring constant k, a pure measure of stiffness. This experiment is fundamentally graphical: you never measure k directly, you let a straight line hand it to you.',
      ],
      bullets: [
        'F = k · x — Hooke’s law: force is proportional to extension while the spring is elastic',
        'k = F / x — the spring constant, in newtons per metre (N/m)',
        'On an F–x graph, k is the slope of the straight line through your points',
        'Doubling the load doubles the extension; mass itself never appears, only its weight F = mg',
      ],
    },
    {
      h2: 'Reading the ruler like a bench scientist',
      body: [
        'Good k values come from good reading habits, so the lab trains them deliberately. The extension is always taken from the zero line the empty pointer makes — never from the ruler’s printed end — which eliminates zero error, the sneakiest mistake in this experiment. The reading is taken at the pointer tip with your eye level with the ruler, because looking from above or below shifts the apparent position (parallax error).',
        'Timing matters too. A freshly loaded spring overshoots and oscillates before damping settles on equilibrium; recording mid-wobble banks an extension that is too small or too large. The Record button stays locked until the pointer is still, teaching the habit of waiting. Finally, spread your loads: five points clustered between 150 g and 200 g constrain a line far worse than the same five spread from 100 g to 400 g.',
      ],
    },
    {
      h2: 'The elastic limit: where the straight line bends',
      body: [
        'Hooke’s law is a law with an expiry date. Every real spring has an elastic limit — a force beyond which the metal’s internal structure starts to slip permanently. In this lab the limit sits just above the 450 g load. Stay at or below it and your graph is a razor-straight line through the origin. Push past it and two things happen, both worth seeing with your own eyes.',
        'First, the extension grows faster than the force: the effective stiffness drops, so the newest point on your F–x graph bends away below the line. Second — and more memorable — when you unload, the pointer does not come back to zero. The spring keeps roughly two centimetres of permanent stretch, called permanent set or plastic deformation. Reload after that and your new points still form a straight, parallel line: the spring is just as stiff, but it is now a longer spring. That is the difference between bending and breaking.',
      ],
    },
    {
      h2: 'Who this lab suits',
      body: [
        'This is a first-timer’s route into forces, elasticity and graphical analysis, and a reviser’s route back into them. Newcomers get step-by-step mentor guidance, a settle-and-record rhythm that models real bench discipline, and a spring constant read straight off their own hand-collected graph. Confident learners can hunt badges: measure k within 3% of the hidden value, complete a clean load–unload cycle, or deliberately witness plastic deformation and its permanent set.',
        'The simulation integrates the mass–spring motion honestly at every load, models the yield and permanent set of an overloaded spring, and reports your readings at realistic ruler resolution. It runs entirely in the browser on phone, tablet or desktop, with synthesized sound and nothing to install.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I find the spring constant in this experiment?',
      a: 'Record five or more (mass, extension) pairs at different loads, with F = mg as the force column and x measured from the zero-load pointer. Plot F against x, fit a straight line, and read the slope — that slope, in N/m, is k. The virtual lab does the plotting and fitting as you record, and compares your k with its hidden true value.',
    },
    {
      q: 'What is the elastic limit of a spring?',
      a: 'It is the maximum force a spring can take and still return to its original length. Below the limit, F = kx holds and unloading retraces the loading line exactly. Above it, the metal yields: extension grows faster than force, and unloading leaves a permanent stretch. In this lab the limit sits just past the 450 g load — load to 500 g once and watch both effects.',
    },
    {
      q: 'Why does my F–x graph bend at the top?',
      a: 'Because those last points were taken past the elastic limit. The spring has softened — its effective stiffness has dropped — so the extension grows faster than the force predicts. The bend is physics, not error: your elastic points still give an accurate k, while the yielded points tell the story of plastic deformation.',
    },
    {
      q: 'Why does the pointer not return to zero after I unload?',
      a: 'Because the spring was overloaded and has taken a permanent set — roughly 2 cm after one trip to 500 g here. The coils have plastically deformed into a new natural length. The lab flags this with a warning and tracks the permanent stretch live in the readings panel, so you can quantify it.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes. The chips, record button and every control are sized for touch, the scene adapts to small screens, and the whole simulation runs locally in your browser. It works equally well with a mouse and keyboard on desktop.',
    },
  ],
};
