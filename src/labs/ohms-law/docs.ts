import type { DocsContent } from '../../engine/types';

export const ohmsLawDocs: DocsContent = {
  h1: "Ohm's Law Virtual Lab — Voltage, Current and Resistance Simulator",
  intro:
    "Slide a rheostat’s wiper with your own hand and watch analog needles swing, settle and ping while digital meters mirror them. Record ammeter and voltmeter pairs at different settings, plot voltage against current, and watch the best straight line hand you the resistance — measured, not memorised. A lab mentor walks you through every sweep, and the battery’s hidden internal resistance keeps the physics honest.",
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens as a clean schematic: a battery of cells on the left, a rheostat and a fixed 20 Ω resistor along the top, an ammeter in the bottom wire and a voltmeter wired directly across that resistor. Animated dashes run round the loop showing the direction and speed of the current — faster when you let more of it flow.',
        'Your grip is the wiper: drag its arrow left or right along the rheostat to slide the loop resistance anywhere from 0 Ω to 50 Ω. The needles take a moment to catch up — they lag and damp exactly like real analog meters — and a soft tick confirms when they have settled. Meanwhile the digital panel reads current, voltage, rheostat setting and the battery’s terminal voltage live.',
        'When the needles are still you record the (I, V) pair. Five settings spread along the track later, the Observations tab plots V against I, fits a straight line, and reports its slope as your measured resistance. You can also swap the battery EMF between 1.5 V and 6 V — and discover that every new point still lands on the very same line.',
      ],
    },
    {
      h2: 'The physics: Ohm’s law and the graph that proves it',
      body: [
        'Ohm’s law is a statement of proportionality: through a given conductor, voltage is proportional to current. The constant of proportionality is the resistance, and the whole experiment is designed to measure it graphically — one reading tells you nothing, a line tells you everything.',
      ],
      bullets: [
        'V = I · R — voltage across a conductor equals current times resistance',
        'I = E / (R + rheostat + r) — the current a real battery drives round the loop',
        'V_terminal = E − I · r — the battery’s voltage falls as it works harder',
        'On a V–I graph, the slope of the straight line is the resistance in ohms',
        'A rheostat adds adjustable series resistance: more wiper track, less current',
      ],
    },
    {
      h2: 'Reading meters like a bench scientist',
      body: [
        'Analog meters are beautiful and slightly slow: the needle has inertia, swings past the mark, and damps back onto it. Reading one mid-swing is the classic beginner’s error, so this lab locks the Record button until both needles are still — the discipline of waiting becomes muscle memory. The digital panel underneath mirrors the needles so you always have a cross-check.',
        'Spread matters even more than patience. Five rheostat settings clustered between 30 Ω and 35 Ω barely constrain a line; the same five spread from near 0 Ω to near 50 Ω pin it down tightly. And notice what the moving dashes show you: current is a flow, one value everywhere in this single loop, and its speed follows your wiper in real time.',
      ],
    },
    {
      h2: 'Internal resistance: why the battery is not perfect',
      body: [
        'Every real battery hides a small resistance of its own inside, in series with its EMF. This one hides 0.5 Ω, which is why the ammeter always reads slightly less than E divided by the external resistance — the loop total is R plus the rheostat plus r. The meter panel computes the terminal voltage V_t = E − I·r live so you can watch it sag as the current grows.',
        'The voltmeter here watches only the fixed 20 Ω resistor, so your V–I slope recovers that resistance exactly. But beware a subtlety worth meeting early: if you divide the battery’s terminal voltage by the current instead, you get R plus the rheostat — always slightly more than R, because the terminal voltage is also driving current through everything else in the loop. Knowing which voltage you are measuring is half of measurement.',
      ],
    },
    {
      h2: 'Who this lab suits',
      body: [
        'This is a first-timer’s introduction to circuits, meters and graphical resistance measurement, and a reviser’s chance to nail the V–I method properly. Newcomers get five mentor steps, a wiper that responds to the real drag gesture, and meters that behave like the ones they will meet on any bench. Confident learners can chase badges: verify Ohm’s law within 2%, sweep the wiper edge-to-edge, or measure at two different EMFs and see the line refuse to move.',
        'The simulation computes the honest circuit equations at every wiper position and animates the needles with damped second-order motion — no faked readings. It runs entirely in the browser on phone, tablet or desktop with synthesized sound and nothing to install.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I measure resistance with a voltmeter and ammeter?',
      a: 'Record five or more (I, V) pairs at different rheostat settings, waiting for the needles to settle each time. Plot V against I, fit a straight line, and read the slope — that slope, in volts per amp, is the resistance in ohms. The virtual lab does the plotting and fitting as you record.',
    },
    {
      q: 'What does a rheostat do in this circuit?',
      a: 'A rheostat is an adjustable resistor: dragging the wiper changes how much of its resistive track sits in the circuit, anywhere from 0 Ω to 50 Ω here. That changes the loop’s total resistance and therefore the current — which is exactly what lets you sweep out a whole V–I line with one battery and one resistor.',
    },
    {
      q: 'Why is the current slightly less than E divided by R?',
      a: 'Because the battery has internal resistance — 0.5 Ω here. The true current is I = E/(R + rheostat + r), so the ammeter always reads a touch under the naive E/R. You can watch the consequence live: the terminal voltage E − I·r sags as the current grows.',
    },
    {
      q: 'Does changing the battery EMF change my measured resistance?',
      a: 'No — and that is the beautiful part. A different EMF moves you to a different point on the very same V–I line, because the resistance has not changed. Record at two EMFs in the lab and you will see the new points land straight on the old line.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes. The wiper is dragged directly on the canvas with a finger or mouse, arrow keys nudge it on desktop, and every control is touch-sized. The whole simulation runs locally in your browser.',
    },
  ],
};
