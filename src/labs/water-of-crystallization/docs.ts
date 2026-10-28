import type { DocsContent } from '../../engine/types';

export const crystallizationDocs: DocsContent = {
  h1: 'Water of Crystallisation Virtual Lab — Copper Sulfate Dehydration and Finding x in CuSO₄·xH₂O',
  intro:
    'Blue copper(II) sulfate crystals hide a secret you can weigh: five water molecules locked inside every formula unit of the crystal lattice. Set a 5.00 g charge of the hydrate in a crucible, light the Bunsen burner, keep the lid just slightly ajar, and watch the analytical balance slide downward as steam escapes and the colour marches from deep blue to pale blue to pure white. Lock the final mass, work out how many waters left, and the arithmetic hands you x in CuSO₄·xH₂O — then squeeze water back onto the white dust and feel the reaction run in reverse, hissing heat and flashing blue. This is the classic water-of-crystallisation experiment, rebuilt so your hands do the heating, the weighing and the calculating.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens on a porcelain crucible sitting in a pipe-clay triangle on a tripod, a Bunsen burner waiting underneath with its valve closed, and an analytical balance beside the bench reading the crucible contents live — tared so it shows exactly 5.00 g of blue copper(II) sulfate pentahydrate crystals. A lid rests on the bench, and a glass water dropper stands by on its stand for later.',
        'Lighting the burner is a real gesture: tap the valve on the burner to open it gently, or keep holding the valve and the flame steps up to its hotter roar. Heat is not a switch but a dial — the gentle flame settles the crucible near 250 °C, enough to drive every water out, while the hot flame rockets past 400 °C and starts destroying your results. Drag the lid in the scene to any of its three rests: fully on, slightly ajar, or off on the bench.',
        'The experiment itself is watching, deciding and stopping. Steam wisps pour from the gap while the balance slides down and the colour turns; the moment the powder is truly white you press “Stop heating · lock final mass”, and your two weighings become the calculation. Afterwards the dropper gives you the encore: drag it over the crucible, hold to squeeze, and watch the white dust grab the water back, heat flashing out of it as the vivid blue returns.',
      ],
    },
    {
      h2: 'The chemistry: why blue crystals bake to white powder',
      body: [
        'Many salts trap a fixed number of water molecules inside their crystal lattice — not puddles of damp, but water locked into exact structural positions that help hold the crystal together. These are waters of crystallisation, and the salt carrying them is a hydrate. Copper(II) sulfate is the textbook example: each formula unit carries five waters, written CuSO₄·5H₂O and called the pentahydrate. Those waters are part of why the crystals are blue; strip every one of them out and the remaining CuSO₄ lattice is a white powder.',
        'Heating drives the waters off one stage at a time. The first four let go slowly around 100 °C, taking the colour only part of the way to pale blue, while the last one clings until roughly 250 °C — which is why the whitening is the slow part and why patience near the end matters. Because the count is fixed by the formula, the lost mass is a chemical measurement of the formula itself, and two weighings are all the arithmetic needs.',
      ],
      bullets: [
        'Molar masses: CuSO₄·5H₂O = 249.7 g/mol · CuSO₄ = 159.6 g/mol · H₂O = 18.0 g/mol',
        'Equation: CuSO₄·5H₂O (blue) → CuSO₄ (white) + 5H₂O (steam)',
        'Water fraction by mass: (249.7 − 159.6) / 249.7 = 0.361 → 36.1% of the hydrate is water',
        'A 5.00 g charge should lose 5.00 × 0.361 ≈ 1.80 g, leaving about 3.20 g of anhydrous CuSO₄',
        'The general calculation: x = (Δm / 18.0) ÷ (m₂ / 159.6), where Δm is the mass lost and m₂ the final mass',
      ],
    },
    {
      h2: 'Working out x from your two masses',
      body: [
        'The calculation card in the lab fills itself in from your own readings, and the working is worth following line by line. Start with the charge mass m₁ (5.00 g on the tared balance) and the final mass m₂ you locked when the powder turned white. The difference Δm = m₁ − m₂ is the water that left, so dividing by 18.0 gives its amount in moles; dividing m₂ by 159.6 gives the amount of copper(II) sulfate that remains. The ratio of the two is x.',
        'With careful heating the numbers land like this: Δm = 5.00 − 3.20 = 1.80 g of water, which is 1.80 / 18.0 = 0.100 mol, against 3.20 / 159.6 = 0.0201 mol of CuSO₄. Divide and x = 0.100 / 0.0201 ≈ 5.0 — five waters per formula unit, so the crystals were copper(II) sulfate pentahydrate all along. The lab awards its sharp-chemist badge when your own x lands within ±0.1 of 5.0, which careful bench technique makes straightforward.',
        'The same arithmetic generalises to any hydrate. Weigh the hydrate, heat it to constant mass, weigh the residue, convert both to moles, divide — and the ratio is the water count in the formula. That is why this experiment appears wherever unknown hydrates are identified: the balance does the identification.',
      ],
    },
    {
      h2: 'Technique: the lid, the spitting and the decomposition trap',
      body: [
        'The crucible lid is the whole craft of this experiment, and the lab makes you learn it with your hands. Rest the lid fully on and steam cannot escape: it condenses on the underside and drips straight back, so the mass barely falls and your run stalls. Take the lid fully off and the escaping steam carries tiny crystals with it — spitting — so the balance loses copper(II) sulfate as well as water, the reading jumps erratically, and Δm comes out too big, pushing x above 5. The working compromise is the lid slightly ajar: a small gap lets water vapour out but keeps the solid in.',
        'The second trap is heat itself. Push the flame too hot for too long and the white anhydrous salt begins to decompose — CuSO₄ → CuO + SO₃ — turning the powder black, venting mass away as sulfur trioxide and dragging the reading below 3.20 g. When that happens no arithmetic can rescue the run; the lab warns you as the darkening starts and the honest answer is to reset and redo with gentler heat. Stopping the moment the powder is white, with the gentle flame that never crossed 300 °C, keeps both your x and the gentle-heater badge intact.',
        'One more habit the bench teaches: stop heating at white, and if you want the classic discipline, heat again briefly and check that the mass no longer moves — heating to constant mass is the professional’s confirmation that every last water has gone. Recording a stage line at each colour change builds an observations table that shows the mass falling continuously as the temperature climbs, with no flat plateau anywhere: water leaves this hydrate steadily, not all at once.',
      ],
    },
    {
      h2: 'Bringing the blue back — rehydration',
      body: [
        'Run the reaction in reverse and it rewards you with one of the most satisfying moments in introductory chemistry. Drag the water dropper over the white powder and squeeze: drops fall, the crucible hisses, steam wisps curl up, the temperature spikes — and the white dust flashes back to vivid blue, water slotting straight back into its lattice positions to rebuild CuSO₄·5H₂O. The balance climbs as the water returns, roughly recovering the mass you drove off.',
        'That hiss is exothermic chemistry. Hydrating anhydrous copper(II) sulfate releases a substantial pulse of heat — enough that on a real bench the crucible grows uncomfortably warm in your fingers. It is the same eagerness for water that makes anhydrous copper(II) sulfate useful as a drying agent and as the test for water in liquids: a few white grains turn blue the moment water touches them, because forming the hydrate is that favourable.',
        'The rehydration is also the honest end of the mass story. Two weighings took the water out and counted it; the dropper puts back about what left, and the cycle closes — blue to white to blue again, with nothing but heat and steam exchanged in between.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This bench is built for anyone meeting hydrates and water of crystallisation for the first time, and for anyone revising quantitative chemistry who wants the arithmetic to come from their own hands rather than a worksheet. A lab mentor walks newcomers through the procedure step by step — weigh the charge, light the burner gently, heat with the lid ajar, lock the final mass, compute x, rehydrate — while badges quietly reward the habits that make the numbers honest: first steam, steady lid control, gentle heat, a sharp x and the blue returned.',
        'Everything runs in the browser on a phone, tablet or desktop. Tap or hold the burner valve, drag the lid and the dropper with a finger or a mouse, and hear every roar, sizzle, drip and rehydration hiss synthesized live — nothing to install, no headphones required. Keyboard alternatives (Space for the flame, H for hot, L for the lid, D for a drop) are there for desktop users, and every reading lives in the sidebar where it is easy to read and record.',
        'Pacing is the one place the simulation bends time, and it says so openly: the full dehydration takes a couple of minutes of simulated heating, so a speed selector runs the bench at 1×, 2× or 4× while the simulated clock, the chemistry and the balance all stay consistent. However fast you play it, the mass lost is still 36% of the charge and x still comes from your own two weighings — the physics never bends, only your patience.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I calculate x in CuSO₄·xH₂O from a mass change?',
      a: 'Weigh the hydrate before heating (m₁), heat until the powder is white, weigh again (m₂), then convert both differences to moles. Δm = m₁ − m₂ is the mass of water driven off, so n(H₂O) = Δm / 18.0; the residue is CuSO₄, so n(CuSO₄) = m₂ / 159.6. Then x = n(H₂O) ÷ n(CuSO₄). Worked example: m₁ = 5.00 g, m₂ = 3.20 g → Δm = 1.80 g → 0.100 mol water against 0.0201 mol CuSO₄, so x ≈ 5 and the salt is the pentahydrate. The lab’s calculation card shows this working from your own locked readings.',
    },
    {
      q: 'Why does the mass of copper sulfate fall from 5.00 g to about 3.20 g on heating?',
      a: 'Because water is leaving the crystals, and it has mass. Blue copper(II) sulfate pentahydrate is CuSO₄·5H₂O — five water molecules trapped in the lattice for every formula unit. Water makes up (5 × 18.0) / 249.7 ≈ 36% of the hydrate’s mass, so a 5.00 g charge holds about 1.80 g of water. Drive every water off and 5.00 − 1.80 = 3.20 g of white anhydrous CuSO₄ remains. If your final mass drifts below that, something other than water left — spitted crystals or decomposition.',
    },
    {
      q: 'Why should the crucible lid be slightly ajar while heating copper sulfate?',
      a: 'Two failure modes sit on either side of the right technique. With the lid fully on, steam condenses on its underside and drips back into the crucible, so the water never leaves and the mass barely falls. With the lid fully off, escaping steam carries tiny crystals out with it — spitting — so you lose copper(II) sulfate as well as water, the balance reading jumps about, and Δm comes out too large. A lid slightly ajar is the compromise: water vapour escapes freely while the solid stays in the crucible.',
    },
    {
      q: 'Why did my white copper sulfate turn black when I kept heating it?',
      a: 'You crossed the decomposition threshold. Past roughly 300–400 °C, anhydrous copper(II) sulfate breaks down further: CuSO₄ → CuO + SO₃. The powder darkens to black copper(II) oxide and sulfur trioxide gas escapes, dragging the mass below the true anhydrous value — so Δm is now wrong and x no longer computes to 5. The lab warns you as the darkening starts; the fix is to reset and redo with the gentle flame, stopping the moment the powder turns white.',
    },
    {
      q: 'Can I use this virtual lab on my phone or tablet?',
      a: 'Yes. The bench is built touch-first: tap or press-and-hold the Bunsen valve with a finger, drag the crucible lid and the water dropper directly in the scene, and use the large control-panel buttons with a thumb. Everything — balance readout, temperature, hydration curve, observations table and the x calculation card — adapts to a narrow screen. Desktop users additionally get keyboard shortcuts (Space for the flame, H for hot, L for the lid, D for a drop), and all sound is synthesized live in the browser with nothing to install.',
    },
  ],
};
