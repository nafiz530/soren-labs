import type { DocsContent } from '../../engine/types';

export const co2PreparationDocs: DocsContent = {
  h1: 'Carbon Dioxide Preparation and Tests Virtual Lab — Marble, Acid and Lime Water',
  intro:
    'Cook up carbon dioxide the classic way: pour dilute hydrochloric acid onto marble chips, watch the gas ride a delivery tube down into an upright gas jar, then prove what you made. A candle lowered deep into the jar dies with a wisp of smoke, and lime water clouds milky white the moment your gas bubbles through it — keep going and it clears again. This is the full preparation-and-tests experiment, rebuilt as a hands-on bench you drive with your own drags and holds.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens ready but quiet: a conical flask of marble chips, a thistle funnel dipping through the stopper, and a long delivery tube rising over and dipping right down to the base of a gas jar standing mouth-up on its wooden shelf. You pick up the hydrochloric acid bottle, drag it over the thistle funnel and hold it there — a stream of acid pours in, rises over the chips, and the flask starts to fizz. Bubbles stream off the marble, sweep up through the acid, race along the delivery tube and pop out of the tube’s tip at the very bottom of the jar.',
        'Because carbon dioxide is denser than air, it pools at the closed base of the mouth-up jar while the leftover air drifts out of the open top — collection by downward displacement of air. A whitish haze climbs from the bottom of the jar, a stopwatch counts simulated seconds while it rises, and when the haze reaches the mouth the clock stops itself — that number is your time to fill the jar, and it lands in your observation table together with the acid concentration you chose.',
        'Then comes the proof. Drag the burning candle down deep into the jar and hold it: the flame shrinks, flickers hard and dies with a curl of smoke. Drag the lime water bottle to the jar and hold: gas bubbles through the liquid and it turns milky. Stubbornly keep bubbling and the milkiness dissolves away again — the overcooked finale that most people never see in person.',
      ],
    },
    {
      h2: 'The chemistry of making carbon dioxide',
      body: [
        'Marble is mostly calcium carbonate, and carbonate meets acid with enthusiasm. Hydrochloric acid supplies hydrogen ions that attack the carbonate, breaking it into soluble calcium chloride, water and carbon dioxide gas. The gas leaves the liquid as a stream of bubbles — the fizz you see and hear — while the marble chips slowly wear away.',
        'Dilute acid is used deliberately. Concentrated hydrochloric acid fumes and would contaminate the collected gas; the dilute version reacts briskly but gently, giving clean, dry-enough CO₂ for the classic tests. Marble chips (rather than powder) are chosen for the same reason of control: chips present a moderate surface area, so the reaction is vigorous enough to fill a jar quickly without frothing over.',
      ],
      bullets: [
        'CaCO₃ (s) + 2HCl (aq) → CaCl₂ (aq) + H₂O (l) + CO₂ (g)↑',
        'Marble chips = calcium carbonate; the acid liberates CO₂ at the chip surfaces',
        'Dilute acid avoids fumes that would spoil the gas; chips avoid a runaway froth',
        'The fizzing rate scales with the acid concentration — double the molarity, double the bubbles',
      ],
    },
    {
      h2: 'Collecting a dense gas: downward displacement of air',
      body: [
        'Carbon dioxide has a molar mass of 44 g compared with dry air’s average of about 29 g, so a litre of CO₂ weighs roughly one and a half times a litre of air. That single fact dictates the whole collection method. Stand the jar upside-down and the heavy gas simply pours back out of the open mouth almost as fast as it arrives. Stand the jar mouth-up with the delivery tube bending down inside it, ending near the base, and the incoming CO₂ sinks to the closed bottom, accumulates, and pushes the lighter air up and out of the mouth. That is collecting by downward displacement of air, and it is the signature move of this experiment.',
        'The whitish haze in the virtual jar lets you literally watch the interface climb from the base — and it warns you about the method’s one weakness: the last pocket of air huddles near the mouth at the top, which is why lowering the candle deep into the jar matters. The gas you want sits at the bottom, underneath the leftover air. Lighter-than-air gases such as hydrogen and ammonia need the mirror-image arrangement — an inverted jar fed from below — while gases that must stay perfectly dry are collected over concentrated sulfuric acid instead.',
      ],
      bullets: [
        'Dense gas: CO₂ (44 g/mol) is about 1.5× denser than air (≈ 29 g/mol average)',
        'Mouth-up jar, tube dipping to the base: CO₂ pools underneath the air and pushes it out of the mouth — downward delivery',
        'An inverted jar fed from below would only hold a gas LIGHTER than air, like hydrogen or ammonia',
        'Collecting over water is the alternative when a dry gas is not required — CO₂ is only slightly soluble',
      ],
    },
    {
      h2: 'The two classic tests: the candle and the lime water',
      body: [
        'Carbon dioxide neither burns nor supports combustion, so a burning splint or candle lowered into it is snuffed — the flame shrinks and dies with a thread of smoke. That is a negative test: it shows what the gas will not do, which is characteristic but not unique, so chemists pair it with the positive test. Lime water is a saturated solution of calcium hydroxide; bubble CO₂ through it and an insoluble white precipitate of calcium carbonate clouds the liquid milky.',
        'The beautiful coda is what happens when you refuse to stop. More CO₂ reacts with the precipitate and water to form soluble calcium hydrogencarbonate, and the milkiness fades back to a clear liquid. In the virtual lab the lime bottle keeps bubbling for as long as you hold it at the jar, so you can ride the whole arc — clear, milky, clear again — with one gesture and watch the jar slowly empty as its gas is drawn through.',
      ],
      bullets: [
        'Burning splint: flame extinguished — CO₂ does not support combustion',
        'CO₂ (g) + Ca(OH)₂ (aq) → CaCO₃ (s)↓ + H₂O (l) — lime water turns milky',
        'CaCO₃ (s) + CO₂ (g) + H₂O (l) → Ca(HCO₃)₂ (aq) — excess CO₂ dissolves the milkiness',
        'Milky-then-clear is the fingerprint of carbon dioxide in excess',
      ],
    },
    {
      h2: 'Concentration, rate and honest measurement',
      body: [
        'The lab doubles as a small rate study. Choose 0.5 M, 1.0 M, 1.5 M or 2.0 M hydrochloric acid, fill the jar, and the stopwatch hands you a time-to-fill; the Observations tab plots every run’s jar-level curve on one graph and graphs the collection rate (100 divided by the fill time) against concentration. The points sit close to a straight line through the origin: at these conditions the rate of CO₂ production is roughly proportional to the acid concentration, which is exactly what collision theory predicts — twice the acid particles means twice the fruitful collisions per second.',
        'Honesty is designed in. The acid is consumed as the reaction runs, so refills from a half-spent flask genuinely take longer — only fills from a freshly filled flask join the rate graph, while the table keeps every run visible. The stopwatch counts simulated seconds, so speeding playback to 2× or 4× never bends your numbers. And the marble slowly shrinks: a very tired batch of chips fizz noticeably slower, just as it would at a real bench.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is an introductory gas-preparation experiment, rebuilt for anyone meeting CO₂ preparation for the first time as well as learners revising the classic tests before writing about them. The mentor walks newcomers through the apparatus check, the pour, the fill and both tests step by step, and every gesture is the real one — you hold the bottle over the funnel to pour, you lower the candle yourself, you keep the lime water at the jar for as long as you dare. Confident learners can ignore the prompts entirely and chase the rate-versus-concentration graph instead.',
        'It runs entirely in the browser on a phone, tablet or desktop — synthesized sound, no downloads, no reagents to store and nothing to clean up afterwards. That makes it a comfortable rehearsal space before trying the gentler home version with baking soda and vinegar, and a safe way to experience the moments a real bench rarely allows: watching the dense haze climb inside the jar, seeing the excess gas spill over the rim and sink, and overdoing the lime water until the milkiness beautifully clears.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I make carbon dioxide at home safely?',
      a: 'The safest home version swaps the marble for baking soda and the hydrochloric acid for vinegar — the same acid-plus-carbonate chemistry with gentler reagents. Never seal the container (pressure builds fast), work in a ventilated room, and keep flames away from the bottle. The virtual lab lets you rehearse the whole procedure, including the tests, without any reagents at all.',
    },
    {
      q: 'Why does the candle go out in carbon dioxide?',
      a: 'A flame needs oxygen from the air to keep burning. Carbon dioxide neither burns itself nor supports combustion, so when the flame is surrounded by CO₂ the oxygen supply is cut off and the flame dies — usually with a thin ribbon of smoke as the wick smoulders out. That is why CO₂ fills work in fire extinguishers.',
    },
    {
      q: 'Why did my lime water go clear again after turning milky?',
      a: 'You bubbled too much CO₂ — and it is a lovely thing to see. The initial milkiness is insoluble calcium carbonate, but excess CO₂ reacts with it and water to form soluble calcium hydrogencarbonate, which dissolves and leaves the liquid clear. It is the classic signature of carbon dioxide passed through lime water for too long.',
    },
    {
      q: 'Why does the gas jar stand mouth-up for CO₂?',
      a: 'Because CO₂ is about one and a half times denser than air. Fed into an upside-down jar, the heavy gas sinks straight back out of the open mouth. Standing mouth-up with the delivery tube dipping to its base, the incoming CO₂ pools at the closed bottom, the level climbs, and the lighter air floats out of the top — downward displacement of air. Lighter gases like hydrogen need the opposite arrangement: an inverted jar fed from below.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes. The bench is built touch-first: drag the acid bottle, the candle and the lime water with your finger, and hold them where the action should happen. Buttons duplicate every gesture for keyboard and one-handed use, and the layout reflows comfortably on small screens.',
    },
  ],
};
