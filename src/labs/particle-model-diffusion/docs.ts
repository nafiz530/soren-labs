import type { DocsContent } from '../../engine/types';

export const diffusionDocs: DocsContent = {
  h1: 'Particles and Diffusion Virtual Lab — Watch Two Gases Mix One Collision at a Time',
  intro:
    'Open a glass divider and watch an orange-brown heavy gas spill into invisible air — not because anything pulls it, but because a few hundred particles bouncing off each other add up to mixing. This is the particle model of gases turned into a hands-on bench: you drag the divider yourself, time how long the mixing takes, change the temperature and the gas mass, and race every run on one live chart. A second bench sprays a puff of perfume from a single spot so you can watch the same physics spread from a point. A lab mentor guides the first full sweep, and the sound of soft ticks you hear is the collisions themselves.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens on a sealed transparent box split down the middle by a glass plate. The left chamber holds a heavy orange-brown gas — a stand-in for bromine, made safe — and the right chamber holds invisible, fast-moving air. Both are at the same temperature. Before you touch anything, watch the particles: the orange ones already jostle and ricochet inside their sealed half, and the sidebar reports the mean speed of each population live.',
        'The gesture is the experiment. Grab the glass plate — or its brass handle — and drag it up out of the box. The moment a gap opens, orange particles spill through, and a clock starts. From then on the gases mix themselves through honest molecular dynamics: every collision is elastic, momentum is conserved, and no force pulls anyone anywhere. A mixing index (the percentage of orange particles in the right half) climbs toward 50%, drawing itself as a live curve in the sidebar. You record the run, reset, change one condition, and race the curves.',
        'Two extra tools deepen the picture. Turn on particle trails and each orange particle leaves a fading ribbon behind it — the random walk itself, made visible. And a brass temperature probe sits parked beside the box: drag it into either chamber and it reads the simulated temperature, proving the two sides share one warmth.',
        'A second bench mode swaps the divided jar for a sealed room with a perfume bottle in the corner. Click the bottle and a burst of particles sprays from that one spot into the room\u2019s air, then spreads to every corner — radial diffusion with exactly the same collision physics as the divider experiment.',
      ],
    },
    {
      h2: 'The particle model behind the bench',
      body: [
        'Every particle in the box obeys the simplest rules that still count as chemistry: travel in a straight line, bounce off walls, and collide with other particles elastically — kinetic energy and momentum both conserved. There are no attractions and no pulling forces anywhere; this is an ideal gas done honestly. Starting speeds come from a Maxwell–Boltzmann-style distribution: each velocity component is drawn independently at random, which is precisely how thermal motion arranges itself, and the collisions keep it that way indefinitely.',
        'The masses are model masses in atomic-mass units. Air particles are 1 u. The orange gas comes in two settings: heavy at 4 u and light at 1 u. Because average speed scales inversely with the square root of mass, the heavy setting moves at half the air\u2019s speed — you can verify this yourself in the sidebar\u2019s live mean-speed readouts, and the trail ribbons make the difference unmistakable.',
        'The engine runs a few hundred particles at full frame rate using a uniform collision grid, so the bench stays smooth even on a phone. What you see is not an animation of diffusion — it is diffusion, emerging from the collisions, one tick of sound at a time.',
      ],
      bullets: [
        '⟨v⟩ ∝ √(T / m) — mean particle speed from the Maxwell–Boltzmann distribution',
        'Mass ratio 4 : 1 (heavy gas vs air) → speed ratio 1 : 2 at the same temperature',
        'Temperature choices: cold 150 K, room 300 K, hot 600 K — speeds scale with √T',
        'Collisions are perfectly elastic: momentum and kinetic energy are conserved, always',
        'Mixing index = % of orange particles in the right half; uniform mixing means 50%',
      ],
    },
    {
      h2: 'What changes the speed of diffusion',
      body: [
        'Temperature first. Raising the temperature multiplies every particle speed by the square root of the absolute-temperature ratio, so the hot setting (600 K) moves √2 ≈ 1.41× faster than room (300 K), and mixing finishes sooner — not because the particles try harder, but because they collide more often and walk further between turns. Race a hot run against a room run on one chart and you will see the same curve shape, simply squeezed onto a shorter clock.',
        'Mass second. The heavy gas crawls at half the air\u2019s speed, and its front spreads noticeably more slowly than the light gas\u2019s. One honest subtlety is worth knowing: the fast, light air keeps barging into the heavy gas and jostles it along, so the heavy gas mixes somewhat slower — not four times slower. Mutual diffusion depends on how fast the two populations move relative to each other, and the air contributes its own share of that motion. The lab keeps this honesty deliberately; it is the kind of nuance that separates a model from a cartoon.',
        'What never changes is the destination. Hot or cold, heavy or light, the mixing index always creeps toward 50% and never beyond — diffusion spreads things out until every place is equally likely, and then it keeps running with nothing left to change. The lab records the times to 25% and 45% mixing rather than waiting for a perfect 50%, because the approach to uniform is asymptotic: the last few percent would take longer than the whole experiment.',
      ],
    },
    {
      h2: 'Reading the mixing curve',
      body: [
        'The sidebar chart plots the mixing index against time since the divider opened. It rises steeply while the orange front surges through the gap, then bends over and flattens as the gas approaches uniformity — the signature shape of diffusion. Dashed guides mark the 25% and 45% levels, and the bench latches the crossing times automatically, so t₂₅ and t₄₅ arrive in your table without stopwatch squinting.',
        'Recorded runs stay on the chart, faded, while the newest run draws bold orange over them — this is where the lab becomes a comparative experiment. A hot curve reaches the guides sooner than a cold one; a light gas beats a heavy one from the same starting line. Because every curve has the same shape, your recorded points plot beautifully on one more graph: time to 45% against time to 25%. Whatever the temperature or mass, those points sit close to a single straight line — the whole lab\u2019s argument in one fit.',
        'The curve also wobbles, by a percent or three, because it is a real count of a few hundred particles. That wiggle is not noise in the machinery; it is the statistics of small numbers, the same reason a real sample of gas smells faintly stronger and weaker as molecules drift past your nose.',
      ],
    },
    {
      h2: 'Technique, precision and honest errors',
      body: [
        'Good diffusion comparisons change one thing at a time. The lab helps you: temperature and gas-mass selectors lock the moment a run begins, so a recorded row always describes honest conditions, and the simulated clock starts with the gap itself rather than with your hesitation. Playback speed of 2× or 4× shortens the waiting on a cold run without bending a single number — the clock counts simulated seconds throughout.',
        'The largest honest error is your own opening technique. How far and how fast you drag the plate is part of the experiment: a half-open plate throttles the mixing and stretches the early curve, so pull it fully out, smoothly, every time. The particle count is the other limit — with a few hundred particles the mixing index fluctuates by a few percent, which is why thresholds latch on a smoothed value rather than a single noisy sample. Repeating a run at identical settings and comparing the two rows is the sound response, exactly as on a real bench.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is the particle model and diffusion for anyone meeting them for the first time, and a forgiving place to revise them. The mentor walks a full sweep — look, open, mix, record, race it hot, race it light — in six steps, while the live readouts, raced curves and the one-line analysis give confident learners something to sharpen against. Teachers demonstrating the bromine jar will find the divider bench a faithful, fume-free stand-in, and the perfume bench carries the same idea into the everyday experience of a smell crossing a room.',
        'Everything runs in the browser on a phone, tablet or desktop, with synthesized sound and no downloads. The gestures are touch-first: drag the glass plate with a finger, tap the perfume bottle, drag the probe. A mouse and keyboard work equally well, and Space opens the divider or fires the spray if you prefer not to drag at all. Playback speed, trails and both benches are yours to combine — the physics never changes, only how quickly you watch it.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do gases mix if nothing is pulling the particles across?',
      a: 'Each particle just bounces — straight lines, elastic collisions, no forces. But a bounced particle performs a random walk, and a crowd of random walkers spreads out, because there are vastly more arrangements with the gas spread evenly than bunched on one side. Diffusion is that statistics made visible; turn on particle trails in the lab and you can watch the individual walks adding up.',
    },
    {
      q: 'Why does a gas diffuse faster at a higher temperature?',
      a: 'Particle speeds scale with the square root of absolute temperature. At the lab\u2019s hot setting (600 K) every particle moves √2 ≈ 1.41× faster than at room temperature (300 K), so collisions come more often and each random-walk step covers more ground — the same mixing curve arrives on a shorter clock. Try racing a hot run against a room run on the chart.',
    },
    {
      q: 'Why does the heavy gas spread more slowly than the light one?',
      a: 'At one temperature, mean speed scales as 1/√m, so the 4 u heavy gas moves at half the speed of the 1 u light gas — visible instantly in the sidebar\u2019s mean-speed readouts. Its mixing is measurably slower too, though not four times slower: the fast air molecules keep colliding with the heavy gas and jostle it along, because mutual diffusion depends on how fast the two populations move relative to each other.',
    },
    {
      q: 'Does diffusion ever stop or run backwards?',
      a: 'The particles never stop — they keep colliding forever. The mixing index just approaches 50% and stays there, wobbling by a few percent as bunches of particles drift back and forth. A big reverse sweep that re-gathered all the orange gas into one half is not impossible in principle, but it is so wildly improbable that you will never see it: that improbability is exactly why diffusion is reliable.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is built touch-first: drag the divider with a finger, tap the perfume bottle, drag the temperature probe. A uniform collision grid keeps a few hundred particles smooth on mobile hardware, and everything also works with a mouse and keyboard — Space opens the divider or fires the spray.',
    },
  ],
};
