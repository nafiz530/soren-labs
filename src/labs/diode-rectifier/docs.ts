import type { DocsContent } from '../../engine/types';

export const diodeDocs: DocsContent = {
  h1: 'Diode Characteristics Virtual Lab — Forward Bias, Reverse Bias & Half-Wave Rectifier',
  intro:
    'Sweep a silicon diode from −5 V to +5 V, record its current at every step, and watch the I–V curve draw its own knee at 0.7 V. Then flip the bench into rectifier mode: an AC source, a live dual-trace oscilloscope, and a smoothing capacitor that turns pulsating DC into something almost steady. The one-way valve of electronics, on a bench you drive yourself.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The I–V bench wires a diode in series with a 100 Ω load across an adjustable source. Drag the bias slider below zero first: the milliammeter barely trembles — reverse bias is the diode\u2019s closed door. Every reading you take lands as a dot on the growing I–V plot, with the theoretical curve ghosted behind it.',
        'Creep the slider up through +0.7 V and the character change is dramatic: current leaps from microamps to milliamps over a fraction of a volt. Record points densely around that bend — the knee — because that is where the diode\u2019s personality lives.',
        'Then switch to rectifier mode. The source becomes a sine wave, and a dual-trace oscilloscope shows the AC input and the load output together: the negative halves simply vanish, and each surviving peak is trimmed by the diode\u2019s 0.7 V toll. Add the smoothing capacitor and the output stops collapsing to zero, riding a gentle ripple between peaks instead.',
      ],
    },
    {
      h2: 'The physics behind the experiment',
      body: [
        'A diode is a junction of two semiconductor regions, and it conducts willingly in only one direction. The numbers on this bench follow the standard silicon model:',
      ],
      bullets: [
        'Forward bias above the knee: I ≈ (V − 0.7 V) / R — the load takes whatever voltage the diode does not',
        'Reverse bias: only a microamp-scale leakage current flows',
        'Half-wave rectifier output: V_out = max(0, V_in − 0.7 V)',
        'With a capacitor: V_out sags between peaks as exp(−t/RC) — the ripple',
      ],
    },
    {
      h2: 'Reading the knee like an engineer',
      body: [
        'The I–V curve is steep, not vertical. Between about 0.6 V and 0.8 V the current multiplies many times over, which is why the diode is best thought of as a 0.7 V threshold valve rather than a perfect switch. Below the knee almost nothing flows; above it, the series load — not the diode — decides the current.',
        'That steepness is also why recording points matters. A single reading cannot show a bend; five points spread across the forward range with a cluster near 0.7 V sketch the curve honestly. The live dot on the canvas tracks your slider in real time, so you can see the current race upward as you approach the knee.',
      ],
    },
    {
      h2: 'From valve to power supply',
      body: [
        'Rectification is the one-way valve put to work. Alternating current spends half its cycle trying to flow backwards; the diode refuses, so the load receives only positive half-cycles — pulsating direct current at the same frequency as the input. The oscilloscope makes the arithmetic visible: every output peak sits exactly 0.7 V below the corresponding input peak.',
        'The capacitor then buys time. It charges at each peak, holds charge between peaks, and leaks only gradually through the load — so the output dips a little instead of crashing to zero. Shrinking that ripple (bigger capacitance, or full-wave rectification that refills twice as often) is the core engineering problem of every DC power supply, from a phone charger to a lab bench supply.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'Anyone meeting semiconductors and electronics for the first time, revising diode characteristics, or preparing for practical electronics work. The mentor walks through the reverse sweep, the knee hunt and the rectifier payoff; the live scope gives confident students a real feel for ripple and smoothing. It runs in any modern browser on phone, tablet or desktop.',
      ],
    },
  ],
  faq: [
    {
      q: 'What is the knee voltage of a diode and why is it 0.7 V?',
      a: 'The knee (or cut-in) voltage is where forward current starts to grow steeply — about 0.7 V for silicon, 0.3 V for germanium. It reflects the energy needed to push carriers across the junction; below it, only a tiny current flows.',
    },
    {
      q: 'Why does almost no current flow in reverse bias?',
      a: 'Reverse bias widens the junction\u2019s depletion region, blocking majority carriers. Only a tiny leakage — microamps — from minority carriers survives. On the I–V plot that is the flat line hugging the axis below zero.',
    },
    {
      q: 'How does a half-wave rectifier work?',
      a: 'The diode conducts only when the AC cycle tries to push current forward, so the load sees only the positive half-cycles, each reduced by the diode\u2019s 0.7 V drop. The negative halves are blocked entirely — visible side by side on the lab\u2019s dual-trace oscilloscope.',
    },
    {
      q: 'What does the smoothing capacitor do?',
      a: 'It charges at each output peak and slowly leaks through the load between peaks, so the voltage dips only slightly instead of falling to zero. The remaining dip is the ripple; bigger capacitance or more frequent peaks (full-wave rectification) shrink it further.',
    },
    {
      q: 'Can I use this lab on a phone?',
      a: 'Yes — the bias slider and mode toggles are touch-sized, and the oscilloscope redraws continuously on any screen. Keyboard and mouse work on desktop too.',
    },
  ],
};
