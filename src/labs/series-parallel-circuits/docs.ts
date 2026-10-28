import type { DocsContent } from '../../engine/types';

export const seriesParallelDocs: DocsContent = {
  h1: 'Series and Parallel Resistance Virtual Lab — Circuit Simulator',
  intro:
    'Two identical 10 Ω resistors, one battery, one toggle. Flip between series and parallel wiring and watch the circuit redraw itself, the ammeter leap from 0.30 A to 1.20 A, and the little bulbs blaze four times brighter. You measure the combined resistance both ways from your own voltmeter and ammeter readings — then set your numbers beside the formulas and watch them agree.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens wired in series: a single loop in which the current has no choice but to squeeze through one resistor and then the other. Two small bulbs glow beside the resistors with the power each one is dissipating — faint in series, because the same modest current drives both. The ammeter sits in the main line, the voltmeter across the network, and both are analog: needles swing, settle and ping before they can be trusted.',
        'With the needles still, you record the first row: the current, the voltage, and the combined resistance computed from your own V/I — never from a formula. Then you press the big PARALLEL toggle. The wires visibly re-route into two branches, each resistor now wired straight across the battery, and the current quadruples while the voltage stays put. You record the second row the same way.',
        'The Observations tab then builds a two-row comparison table: your measured resistances next to the formula predictions, with the percentage difference for each. Two equal resistors give a clean 4× ratio — 20 Ω against 5 Ω — and flipping back and forth lets you watch the bulbs, the dash-speed of the animated current, and the needle positions all change together.',
      ],
    },
    {
      h2: 'The physics: adding resistances two ways',
      body: [
        'Resistance is how stubbornly a conductor opposes current. When resistors share one path, their obstructions stack; when they offer parallel paths, the current has more ways through, so the combined resistance is smaller than any single branch. Both rules follow from Ohm’s law applied carefully to each path.',
      ],
      bullets: [
        'Series: R = R₁ + R₂ — the same current flows through both, voltages add',
        'Parallel: 1/R = 1/R₁ + 1/R₂ — the same voltage sits across both, currents add',
        'Two equal resistors R: series gives 2R, parallel gives R/2 — a factor of 4',
        'This lab: series 20 Ω → I = 6 V ÷ 20 Ω = 0.30 A; parallel 5 Ω → I = 1.20 A',
        'Power per resistor: series P = I²R (0.9 W each); parallel P = V²/R (3.6 W each)',
      ],
    },
    {
      h2: 'Measuring combined resistance with two meters',
      body: [
        'The method is the point: a combined resistance is not something you look up, it is something you measure. Divide the voltmeter reading across the network by the ammeter reading in the main line, and you have it — whatever the wiring. In this lab that readout is computed live from your meters, and the record button banks it exactly as measured.',
        'Two disciplines make the measurement honest. First, wait after every re-wire: the needles have inertia and lag behind the new current, and the lab warns you if you try to record mid-swing. Second, record in both wirings before you trust any conclusion — a single reading cannot reveal a 4× ratio, but two well-made ones make it unmistakable.',
      ],
    },
    {
      h2: 'Why parallel is smaller — and why the bulbs know',
      body: [
        'It feels counterintuitive that adding a second resistor lowers the combined resistance, but the reason is geometrical: in parallel you are widening the door. Two identical paths side by side carry twice the current for the same push, which by V = I·R means half the resistance. In series you are lengthening the corridor instead — same door, twice the distance, twice the resistance.',
        'The bulbs make this visceral because brightness tracks power. In series each resistor gets P = I²R = 0.9 W, and the total is 1.8 W. In parallel each gets the full battery voltage, P = V²/R = 3.6 W, totalling 7.2 W — four times the glow from the very same battery. When the wiring flips, watch the halos bloom: it is the ratio you are about to prove, rendered in light.',
      ],
    },
    {
      h2: 'Who this lab suits',
      body: [
        'This is the natural second step after meeting Ohm’s law: a first encounter with combined circuits that ends in a quantitative proof. Newcomers get five mentor steps, a guard that teaches patience after re-wiring, and measurements taken entirely from their own meters. Revisers can chase exact agreement — both rows within 2% of the formulas — and earn the Formula Confirmer badge.',
        'The simulation solves the honest circuit equations for each wiring, animates the wire re-route, and computes every readout from live meter values. It runs entirely in the browser on phone, tablet or desktop, with synthesized sound and nothing to install.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I calculate equivalent resistance in series and parallel?',
      a: 'In series, simply add: R = R₁ + R₂. In parallel, add reciprocals and flip: 1/R = 1/R₁ + 1/R₂. For two equal resistors that gives 2R versus R/2 — a factor of four. In the lab you verify both by dividing your measured V by your measured I, and the comparison table shows the formulas alongside.',
    },
    {
      q: 'Why is the total resistance smaller in parallel than any single resistor?',
      a: 'Because parallel wiring gives the current extra paths. Two identical branches side by side carry twice the current for the same voltage, and since R = V/I, twice the current at the same V means half the resistance. You are widening the doorway, not adding obstructions.',
    },
    {
      q: 'What happens to the current when I switch from series to parallel?',
      a: 'With the same 6 V battery and two 10 Ω resistors, the current quadruples: 0.30 A in series becomes 1.20 A in parallel. The voltage across the network stays 6 V — it is the combined resistance that drops from 20 Ω to 5 Ω. Watch the animated current dashes speed up as you flip.',
    },
    {
      q: 'Why do the bulbs glow brighter in parallel?',
      a: 'Brightness follows power. In series each resistor dissipates P = I²R = 0.9 W; in parallel each gets the full battery voltage and dissipates P = V²/R = 3.6 W. Four times the power per bulb, from the same battery — the bulbs are the ratio made visible.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes. The wiring toggle, record button and every control are touch-sized, the schematic scales to small screens, and the whole simulation runs locally in your browser. It works equally well with mouse and keyboard on desktop.',
    },
  ],
};
