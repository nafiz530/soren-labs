import type { DocsContent } from '../../engine/types';

export const reactionRateDocs: DocsContent = {
  h1: 'Rate of Reaction Virtual Lab — Marble Chips, Hydrochloric Acid and the Gas Syringe',
  intro:
    'Race the classic rate of reaction experiment: drop marble into hydrochloric acid, watch the carbon dioxide push a gas syringe plunger out, and read the volume live while a curve draws itself. Then vary the three famous factors — acid concentration, water-bath temperature and the surface area of the marble — and overlay every run to see which one sped the reaction up most. A lab mentor walks you through it the first time; the data table, overlay chart and rate graph do the analysis with you.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with a conical flask sitting in a water bath, a delivery tube rising from its stopper, and a 200 mL gas syringe mounted on a stand. A tray on the shelf holds three marble charges: one large chip, three medium chips, and a spoonful of powder. You drag one of them into the flask — a real drag with your finger or mouse — and each drag replaces whatever is in there. Every charge weighs the same 0.75 g of marble, so the only thing you have changed is the surface area the acid can attack.',
        'Set the hydrochloric acid concentration (0.5 to 2.0 M) and the bath temperature (20, 40 or 60 °C), then press Start or tap Space. Bubbles stream off the marble, race along the delivery tube, and the plunger pushes out smoothly as the gas collects. The volume reads out live in the sidebar together with the mass the flask has lost, and a volume-versus-time curve draws itself while you watch.',
        'When the fizz dies away, the run banks itself: the endpoint volume, the time to half the endpoint (t½) and the initial rate land in your observation table, and the curve joins the overlay chart. Change one factor, race again, and the newest run draws bold orange over the previous runs faded in blue — the whole point of the lab is reading those races.',
      ],
    },
    {
      h2: 'The chemistry: marble meets acid',
      body: [
        'Marble is mostly calcium carbonate. Hydrochloric acid supplies hydrogen ions that attack the carbonate, breaking it into soluble calcium chloride, water and carbon dioxide gas. The gas leaves the liquid as bubbles — the fizz you see and hear — while the solid chip slowly wears away. Because one mole of calcium carbonate releases one mole of carbon dioxide, the gas syringe is literally counting reaction events: every 24 mL of gas at room conditions is one thousandth of a mole of reaction.',
        'The model in this lab is deliberately honest about the amounts. Each run charges the flask with 25 mL of acid and a fresh 0.75 g of marble, and it consumes them stoichiometrically: two moles of acid per mole of gas made. That is why the endpoints differ. At 0.5 M the acid runs out first and the curve flattens at 150 mL with marble left over; at 1.0 M and above the 0.75 g of marble is the limiting reagent and every run ends at 180 mL no matter how fast it got there. Rate factors never change the endpoint — only the limiting reagent does.',
      ],
      bullets: [
        'CaCO₃ (s) + 2HCl (aq) → CaCl₂ (aq) + H₂O (l) + CO₂ (g)↑',
        'Charge: 0.75 g of marble (7.5 mmol) in every form; acid: 25 mL of dilute HCl per run',
        'Endpoint = whichever reagent runs out first: 150 mL when the 0.5 M acid is limiting, 180 mL when the marble is',
        'Molar volume taken as 24,000 mL per mole at room conditions, so mass lost ≈ 0.18 g per 100 mL of CO₂',
      ],
    },
    {
      h2: 'The three factors you can race',
      body: [
        'Concentration first. The model treats the reaction as approximately first order in hydrochloric acid: double the molarity and you double the rate. You can prove it with your own data — keep the charge and temperature fixed, run 0.5 M against 1.0 M against 2.0 M, and the initial-rate column doubles step by step. The lab even plots your initial rate against concentration and fits the best straight line through the points.',
        'Temperature uses a Q₁₀-style factor: about ×1.7 for every extra 10 °C of bath, so a 40 °C run goes roughly 2.9 times faster than the same run at 20 °C, and a 60 °C run roughly 8.4 times. Warmer acid means faster-moving particles, and a larger share of the collisions carries enough energy to get through the barrier — the same reason food keeps longer in a fridge and bread browns faster in a hot oven.',
        'Surface area is the drama. The three medium chips expose about three times the reacting face of the single large chip, and the powder about twelve times, from the very same 0.75 g. Drag the powder spoon in at 2.0 M and 60 °C and the model honestly produces a fountain: the syringe sweeps to its endpoint in well under a second, the curve goes nearly vertical, and the table records an initial rate past a thousand mL/s. That is the lab\'s punchline — surface area wins, though the full 40 °C bath runs it surprisingly close.',
      ],
      bullets: [
        'rate ≈ k · [HCl] — doubling the concentration doubles the initial rate',
        'Temperature: ×1.7 per extra 10 °C of bath (20 °C → ×1, 40 °C → ×2.9, 60 °C → ×8.4)',
        'Surface area multipliers in this model: large chip ×1, medium chips ×3, powder ×12',
        'Across the full ranges offered, surface area (×12) beats temperature (×8.4) and concentration (×4)',
      ],
    },
    {
      h2: 'Reading the curve: initial rate, t½ and endpoints',
      body: [
        'A rate-of-reaction graph is steep at the start and flattens toward the end, and every part of that shape means something. The steep start is the initial rate — the reaction at its fastest, when the acid is full-strength and the marble is whole. The lab measures it for you as the steepest chord of the first moments of the curve, exactly what you would do with a ruler and a pencil on a printed graph. The flattening tail is the slowdown you can explain: acid is being consumed, and the shrinking lump presents less and less surface to it.',
        'The half-time, t½, is the time the run takes to reach half its endpoint volume. It is a handy single number for comparing races — halve it and you have doubled the speed. Watch one subtlety the mentor will point at: at 0.5 M the endpoint itself drops to 150 mL because the acid is limiting, so concentration changes the destination as well as the speed, while temperature and surface area change only the speed.',
        'The syringe gives you a second measurement for free. As gas leaves the flask, the flask gets lighter: at a molar volume of 24,000 mL per mole, every 100 mL of CO₂ carries away about 0.18 g. The sidebar reports the mass loss live, the same quantity a balance would track in the mass-loss version of this experiment. As a molar bookkeeping check, 0.01 mol of CO₂ — 240 mL — has a mass of exactly 0.44 g, which is why a balance that reads to 0.01 g follows a full run clearly.',
      ],
    },
    {
      h2: 'Technique, precision and honest errors',
      body: [
        'Good rate comparisons are controlled comparisons: change one factor at a time and keep everything else fixed. The lab helps you by recharging the flask with fresh 25 mL of acid and a fresh 0.75 g charge for every run, and by locking the selectors while a run is in progress. The stopwatch counts simulated seconds, so the 2× playback speed shortens your waiting without bending a single number — speed up the boring middle, never the data.',
        'The remaining honest imprecision is the one real benches have too: the initial rate is measured from the first steep samples of the curve rather than a perfect tangent, and the last trace of fizz approaches the endpoint asymptotically, so the model closes a run when the rate falls below a visible fizz. Recorded endpoints are the stoichiometric values, while t½ and initial rate come from your own sampled curve — which is why two careful runs at identical settings agree closely but never to the last decimal. Repeat runs are the chemist\'s answer: race a condition twice and see.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is the comparative rate experiment, rebuilt for anyone meeting reaction rates for the first time as well as people revising the topic before moving deeper into kinetics. The mentor turns the whole session into six guided steps — load the marble, run a baseline, then race concentration, temperature and powder, and finally call the winner from your own data — while the table, the overlay chart and the fitted rate line give confident learners plenty to analyse. It runs entirely in the browser on a phone, tablet or desktop, with synthesized sound and no downloads; the drag gesture works with a finger, a mouse or the keyboard (keys 1–3 load charges, Space starts and stops).',
        'The bench never hurries you. Runs at 1× real time take from a few seconds (powder in a hot bath) to a couple of minutes (a single large chip in cool, dilute acid), and the 2× playback shortens the waiting without touching a single measurement — the clock counts simulated seconds. If you are working through it for the first time, follow the mentor steps in order and let the overlay chart do the comparing; if you are revising, skip straight to racing extremes — 0.5 M against 2.0 M, 20 °C against 60 °C, chip against powder — and read the multipliers straight off your initial-rate column. Every run recharges the flask with fresh acid and a fresh charge, so the comparisons stay clean however many races you bank.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I measure the rate of reaction with a gas syringe?',
      a: 'Start the clock the moment the acid meets the marble, record the gas volume at regular intervals, and plot volume against time. The initial rate is the gradient of the steep first part of the curve — in this lab it is measured for you as the steepest chord of the opening seconds and appears in the table with every banked run.',
    },
    {
      q: 'Why does the reaction slow down over time?',
      a: 'Two reagents are fading together. The acid is consumed — two moles of HCl leave for every mole of CO₂ made — so its concentration falls; and the marble lump shrinks, exposing less surface. Both effects flatten the curve until the fizz stops at the endpoint set by whichever reagent ran out first.',
    },
    {
      q: 'Does raising the temperature change the final volume of gas?',
      a: 'No. Temperature changes only how fast you get there. The endpoint is fixed by the limiting reagent: 180 mL whenever the 0.75 g of marble limits, and 150 mL at 0.5 M where the acid runs out first. Race a 20 °C run against a 60 °C run and both curves land on the same plateau — one just arrives much sooner.',
    },
    {
      q: 'What happens to the rate when I double the acid concentration?',
      a: 'It roughly doubles. The reaction is approximately first order in hydrochloric acid, so 1.0 M fizzes about twice as hard as 0.5 M. Keep the charge and temperature fixed, race the two, and check the initial-rate column — then look at the rate-versus-concentration graph, where your points sit on a straight line.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is built touch-first: drag the marble charge with a finger, tap the concentration and temperature selectors, and press Start. Everything also works with a mouse and keyboard on desktop, and keys 1–3 plus Space mirror the gestures if you prefer not to drag at all.',
    },
  ],
};
