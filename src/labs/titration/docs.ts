import type { DocsContent } from '../../engine/types';

export const titrationDocs: DocsContent = {
  h1: 'Acid–Base Titration Virtual Lab — Interactive Endpoint Experiment',
  intro:
    'Take charge of a real burette: hold the stopcock open with your finger, swirl the flask between additions, and chase the single drop that turns phenolphthalein faintly pink for good. This virtual titration walks you from setup to recorded endpoint with live pH readings, a growing titration curve and synthesized bench sound — the closest thing to standing at the bench.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'You start with 25 mL of hydrochloric acid of unknown concentration in a conical flask, a few drops of phenolphthalein, and a burette loaded with 0.1 M sodium hydroxide. The stopcock is spring-loaded like the real thing: titrant flows only while you keep the button pressed, and it stops the instant you let go.',
        'The mentor asks you to run a fast stream to about 20 mL, then switch to drop-by-drop additions while swirling the flask in circles on the swirl pad. Near the equivalence point each drop produces a local pink bloom that fades as you swirl — the classic flash that every titration student learns to read. The first drop whose pink survives the swirl is your endpoint.',
        'Record the endpoint volume, check it against the equivalence volume of 25.00 mL, then reset and repeat. The lab logs every trial — endpoint volume, pH, drop count and elapsed time — and marks which runs landed inside the ±0.2 mL accuracy window that real chemists aim for.',
      ],
    },
    {
      h2: 'The chemistry behind the experiment',
      body: [
        'Titration finds an unknown concentration by reacting a measured volume of it with a solution of known concentration. Hydrochloric acid and sodium hydroxide neutralise one-to-one:',
      ],
      bullets: [
        'HCl + NaOH → NaCl + H₂O',
        'At equivalence: moles of NaOH added = moles of HCl present',
        'Phenolphthalein is colourless below pH 8.2 and pink above pH 10',
        'The first lasting pink marks the endpoint, just past equivalence',
      ],
    },
    {
      h2: 'Why the curve turns vertical',
      body: [
        'Plot pH against volume delivered and the curve barely moves for the first 20 mL — the acid simply absorbs each addition of base. But as remaining acid runs out, a single 0.1 mL drop swings the pH by several units, which is exactly why the curve turns vertical at equivalence and why careful workers slow to single drops there.',
        'Because the indicator changes colour across pH 8.2–10, the endpoint lands a whisker past the equivalence point. Overshooting to a deep magenta means you have blown past the answer — the lab lets you do it once so you can see it, then coaches you to land within ±0.2 mL on repeat trials.',
      ],
    },
    {
      h2: 'Technique the lab teaches',
      body: [
        'Real titration skill is mostly rhythm: swirl constantly, deliver fast while far from the endpoint, creep drop-by-drop near it, and read the burette at eye level to the bottom of the meniscus. The virtual bench reinforces each habit — the swirl pad demands circular motion before the colour will distribute, the stopcock punishes a heavy hand with an immediate overshoot, and the trial table rewards repeatability the way a lab notebook would.',
        'A white tile under the flask, the standard practice for spotting faint colours, sits under the virtual flask too — a detail that matters most in the last five drops.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'Anyone meeting volumetric analysis for the first time, revising acid–base chemistry, or teaching it. The mentor scales to the student: it narrates the strategy early, then goes quiet and only warns when the endpoint is about to be overshot. The lab runs in any modern browser on phone, tablet or desktop, with synthesized sound and no downloads.',
      ],
    },
  ],
  faq: [
    {
      q: 'What is the endpoint of a titration and how do I spot it here?',
      a: 'The endpoint is the first drop of titrant whose colour change survives swirling — a faint pink that stays. In this lab the pre-endpoint pink blooms fade as you swirl; when one persists, stop immediately and record the volume.',
    },
    {
      q: 'Why does the pink colour disappear when I swirl the flask?',
      a: 'Each drop creates a local pocket of excess base that turns the indicator pink. Swirling mixes it with remaining acid, which neutralises it back below the indicator range — so the colour vanishes. When no acid is left to consume it, the pink stays: that is the endpoint signal.',
    },
    {
      q: 'What happens if I overshoot the endpoint?',
      a: 'The flask turns deep magenta and your volume reading is too high. The lab marks the trial as overshot in your observation table. Reset and repeat — the target window is the true equivalence volume of 25.00 mL within ±0.2 mL.',
    },
    {
      q: 'How does this virtual titration compare with a school practical?',
      a: 'The glassware, technique steps, colour behaviour and endpoint judgement follow the real procedure closely, and the pH model produces the classic S-shaped curve. It is a teaching model of a standard strong-acid/strong-base titration, designed so the hand skills and the judgement transfer to the bench.',
    },
    {
      q: 'Can I run a titration on my phone?',
      a: 'Yes — the lab is touch-first. Hold the dispense button with your thumb, swirl with the dedicated pad, and every control is sized for fingers. It also works with keyboard and mouse on desktop.',
    },
  ],
};
