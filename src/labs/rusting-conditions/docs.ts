import type { DocsContent } from '../../engine/types';

export const rustingConditionsDocs: DocsContent = {
  h1: 'Rusting of Iron Virtual Lab — Conditions for Rusting Experiment Online',
  intro:
    'Prepare four iron nails with your own hands — one in dry air, one under boiled water sealed with oil, one half-dipped in ordinary water and one half-dipped in salt water — then let a day/night clock decide their fate. Watch orange-brown rust creep along the nails day by day, worst exactly at the waterline, and finish with a recorded table that answers the classic question: what does iron actually need to rust?',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The lab opens on a bench rack holding four test tubes, each standing an iron nail, with a shelf of real tools above: a kettle, a water jug, an oil bottle, a jar of anhydrous calcium chloride and a salt cellar. Nothing is prepared for you. You drag the calcium chloride jar over tube 1 to bury the nail in a drying agent, hold the kettle over tube 2 until its water boils clear for several minutes, then pour a thin oil layer to seal the fresh air out. Tubes 3 and 4 get a half-dip of tap water from the jug, and the salt cellar finishes tube 4.',
        'Then the experiment becomes about time. A simulated day/night clock advances — one day takes about fifteen seconds at normal playback, and a speed control runs at 1×, 4× or 16× — while rust spreads along each nail at its own honest rate. The window light shifts from morning to night, dust motes drift through the room, and the rust monitor reports the percentage of each nail converted, live. Click any tube to look at its nail through a magnifier and see where the rust actually grows.',
        'You record a row of readings each day: all four rust percentages land in one table row, and the Observations tab graphs every tube on the same axes so the four conditions can be compared at a glance. Three recorded days unlock the conclusion, where you tell the lab what the evidence says iron needs.',
      ],
    },
    {
      h2: 'The chemistry of rusting',
      body: [
        'Rust is not iron simply "wearing out" — it is an electrochemical reaction. Iron atoms give up electrons, oxygen accepts them, and water provides the bridge that lets ions move between the two. All three participants must meet for anything to happen, which is why the classic word equation is iron + oxygen + water → hydrated iron(III) oxide. The orange-brown product is written with a variable amount of water built into its structure:',
      ],
      bullets: [
        '4Fe + 3O₂ + 2xH₂O → 2Fe₂O₃·xH₂O (hydrated iron(III) oxide)',
        'Both oxygen AND water are required — remove either one and rusting stops',
        'Salt does not cause rust — dissolved salt is an electrolyte that speeds the electron transfer',
        'Rust is weakest deep underwater (little oxygen) and just above the surface (little water) — worst exactly at the waterline',
      ],
    },
    {
      h2: 'Why each tube is prepared that way',
      body: [
        'Tube 1 is the air-without-water control. Anhydrous calcium chloride is a drying agent: it absorbs moisture from the trapped air, so the nail sits in oxygen that carries almost no water. The nail stays bright indefinitely — air alone cannot rust iron.',
        'Tube 2 is the water-without-oxygen control. Tap water holds dissolved air, so the lab boils it for several minutes first; boiling drives the dissolved gases out. A thin layer of oil poured on top stops fresh air from dissolving back in. The nail is fully submerged beneath the seal, and it too stays bright — water alone cannot rust iron either. Skipping the boil, or forgetting the oil, lets a little oxygen creep back and the simulation will show you the difference honestly.',
        'Tube 3 is the honest experiment: a nail half in tap water, half in open air, with both players present. Tube 4 is identical except for sprinkled salt. Because everything else is kept the same, any difference between 3 and 4 is the salt talking — and it talks loudly, roughly two and a half times faster in this model.',
      ],
    },
    {
      h2: 'The waterline effect and the salt accelerator',
      body: [
        'Look closely at tube 3 after a day or two and the rust is not evenly spread. Deep below the surface the water is plentiful but oxygen is scarce — it must dissolve and slowly diffuse down. Above the surface oxygen is everywhere but there is almost no water to carry the ions. Exactly at the waterline both are abundant, so the thickest band of rust forms where the nail crosses the surface. The magnifier in the lab shows this band clearly, and it is one of the most memorable sights in introductory chemistry.',
        'The salt in tube 4 adds a second lesson. Dissolved salt makes the water a far better electrolyte — it conducts the tiny ionic currents that corrosion relies on, so the same air and the same water attack the nail much faster. This is why cars rust fastest where roads are gritted with salt in winter, and why ships worry more about seawater than rain. In the lab you can watch tube 4 pull visibly ahead of tube 3 on the same graph, then compare the fitted slopes in percent per day.',
      ],
    },
    {
      h2: 'Recording data and reading your graph',
      body: [
        'One press of the record button banks a full row: the day number plus the rust percentage of every nail, all measured at the same moment so the comparison stays fair. Recording several different days turns the table into trends — flat lines for tubes 1 and 2, a rising curve for tube 3 and a steeper one for tube 4. The single-tube plot fits a straight line through your recorded points and reports its slope, the rusting rate in percent per day.',
        'You will notice the curves bend over as days pass. That is honest science, not a glitch: the growing rust crust partially protects the iron beneath, so the attack slows — real nails behave the same way. The early days give the truest rate, which is exactly when the 2.5× gap between salt water and tap water is widest.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is the classic conditions-for-rusting investigation, rebuilt for anyone meeting corrosion for the first time as well as students revising it. The mentor walks newcomers through every preparation gesture, while confident learners can experiment with the controls: skip the boil and see the seal leak oxygen, leave the drying agent out and watch a slow haze creep in, or race playback at 16× and log a fortnight in minutes. It runs entirely in the browser on a phone, tablet or desktop, with synthesized sound and no downloads.',
      ],
    },
  ],
  faq: [
    {
      q: 'What are the conditions needed for iron to rust?',
      a: 'Both oxygen (from air) and water must be present at the same time. In the virtual lab, the nail in dry air and the nail under boiled, oil-sealed water both stay clean, while the nails with air and water together rust steadily. The conclusion card asks you exactly this once three days are recorded.',
    },
    {
      q: 'Why is the water in tube 2 boiled and covered with oil?',
      a: 'Boiling for several minutes expels the air dissolved in the water, and the oil layer floating on top stops fresh air from dissolving back in. Together they leave the nail wet but starved of oxygen — the water-only condition. Skip either step in the lab and the difference shows up honestly in your rust readings.',
    },
    {
      q: 'Why is rust worst at the waterline on the nail?',
      a: 'Below the surface there is plenty of water but little dissolved oxygen; above it there is plenty of oxygen but almost no water. At the waterline both are abundant, so the reaction runs fastest exactly there. Inspect tube 3 or tube 4 through the magnifier after a day or two and the thickest orange band sits right on the surface line.',
    },
    {
      q: 'Does salt cause iron to rust?',
      a: 'No — salt is an accelerator, not an ingredient. Dissolved salt makes water a better electrolyte, letting the electrochemical corrosion proceed faster. In the lab the salty nail runs close to 2.5× the tap-water rate while its graph rises on the same axes, which is the cleanest way to see the effect.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. Every preparation is a touch gesture: drag tools from the shelf with a finger, hold the kettle over tube 2 until it boils, tap a tube to inspect its nail. There is also a one-press button that performs the next preparation step, and the playback speed control lets you watch whole days pass in seconds on any device.',
    },
  ],
};
