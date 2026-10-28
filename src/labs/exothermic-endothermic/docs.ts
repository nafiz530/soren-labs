import type { DocsContent } from '../../engine/types';

export const exothermicEndothermicDocs: DocsContent = {
  h1: 'Exothermic and Endothermic Reactions Virtual Lab — Dissolve, Neutralise and Watch the Thermometer',
  intro:
    'Pour sodium hydroxide into a cup of water and the thermometer climbs; pour potassium nitrate and it falls until the outside of the cup fogs with condensation. This is calorimetry with your own hands: drag reagents off a shelf and hold them over a styrofoam cup to pour, stir with small circles of a glass rod, and watch a live temperature–time trace rise and fall in the sidebar. Every run ends in your observations table, where you classify each reaction as exothermic or endothermic from the sign of its ΔT — with a mentor nudging you if you drift, and a fizzing, cooling mystery mix waiting near the end.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with a shelf of seven containers — six reagents and a wash bottle — above a styrofoam cup holding 100 mL of fresh water at room temperature, 22.0 °C. A thermometer stands in the cup and a live trace waits in the sidebar. Your first job is simply to notice that starting value, because every temperature change you measure will be counted from it — ΔT means the reading minus where you began.',
        'Then you pour. Drag a jar or bottle from the shelf down over the cup and keep holding: the container tips, a stream of liquid or a rain of pellets falls in, and the reagent begins dissolving while a swirl turns on the surface. Release too early and only part of the dose lands — drag the same jar back to finish it. Stirring is yours too: select a gentle or vigorous glass-rod stirrer, or make small circles with your pointer over the cup and feel the dissolving speed up.',
        'Each run ends when the temperature peaks and starts its slow drift back toward room temperature. You record that peak ΔT into the observations table, the bench pours you a fresh cup of water, and the previous trace stays on the chart, faded, so a rising run and a falling run can sit side by side. Six reagents are waiting: sodium hydroxide, dilute sulfuric acid, potassium nitrate, ammonium chloride, a citric acid and sodium hydrogencarbonate pairing that fizzes while it cools, and an acid–alkali pair that neutralises.',
      ],
    },
    {
      h2: 'Exothermic and endothermic: the science of heat flow',
      body: [
        'Every chemical or physical change either releases energy to its surroundings or borrows energy from them. Dissolving is a perfect example because the two halves of the process fight each other: pulling ions apart from their crystal lattice costs energy, while wrapping them in water molecules pays it back. Whichever side wins decides the direction heat flows, and in a styrofoam cup the only surroundings that matter are the 100 mL of water and its thermometer.',
        'Because the cup is well insulated, nearly all of that heat exchange shows up as a temperature change you can measure with one multiplication: q = m × c × ΔT, where m is the mass of water (100 g), c its specific heat (4.18 J/g·K), and ΔT the change you read. That is the whole craft of solution calorimetry — the thermometer becomes an energy meter.',
        'Chemists write the energy story as ΔH, the enthalpy change: negative when the reaction ends up lower in energy than it started, because it paid the difference out as heat, and positive when it ends up higher, because it borrowed the difference from the water. The thermometer never sees ΔH directly — it sees the effect on 100 g of water, which is exactly what makes a calorimeter such a useful instrument.',
      ],
      bullets: [
        'Exothermic: heat leaves the reaction, the water warms, ΔT is positive, ΔH is negative',
        'Endothermic: heat enters the reaction, the water cools, ΔT is negative, ΔH is positive',
        'NaOH dissolving releases about 44.5 kJ/mol — a well-stirred cup climbs by roughly +18 °C',
        'KNO₃ dissolving absorbs about +34.9 kJ/mol — a well-stirred cup falls by roughly −15 °C',
        'NH₄Cl dissolving absorbs about +14.8 kJ/mol — a well-stirred cup falls by roughly −10 °C',
        'q = m·c·ΔT with m = 100 g and c = 4.18 J/g·K turns any reading into joules',
        'Newton cooling: T(t) = T_room + (T₀ − T_room)e^(−kt) drags every trace back toward 22 °C',
      ],
    },
    {
      h2: 'The neutralisation and the fizzing cooler',
      body: [
        'Two of the shelf’s reagents deserve a special look. The acid–alkali pair pours equal volumes of hydrochloric acid and sodium hydroxide, one after the other, into the same cup. Mixing a strong acid with a strong alkali is one of the most dependable exothermic reactions in chemistry: about 57 kJ is released for every mole of water formed, so the equal-volume mix in this bench climbs by roughly +11 °C. Watch the trace — the acid vial barely moves it, and the alkali vial does the real work as neutralisation fires.',
        'The citric acid + sodium hydrogencarbonate pot is the memorable pairing. It fizzes carbon dioxide while the temperature falls around −12 °C: gas bubbles and cooling at the same time. Many people instinctively expect a reaction this vigorous to be hot, but the chemistry says otherwise — the endothermic dissolving of the citric acid and the reaction itself absorb more energy than the forming of the new substances releases. Bubbles, in other words, tell you nothing about the direction of heat flow; only the thermometer does.',
      ],
    },
    {
      h2: 'Technique, precision and honest errors',
      body: [
        'Good calorimetry is mostly good habits, and this bench enforces the real ones. One chemistry per cup, so enthalpies never blend. Stirring, because an unstirred cup stratifies — hot water sits on top, cold sits below — and the thermometer reads only the layer it stands in; the simulation models that lag honestly, so an unstirred run responds visibly slower than a stirred one. Waiting for the peak, because Newton cooling starts reclaiming your temperature the moment dissolution finishes: the recorded ΔT is always the peak, never a late reading on the way back down.',
        'An unstirred or slow run lands under the book values, exactly as in a real cup: while the sodium hydroxide is still dissolving, the cup is already leaking heat to the room, and a slow dissolving run leaks more than a brisk one. Stir well and the peak lands right on the book number — that is the technique doing its job. The size of the shortfall is a genuine measurement — compare a stirred and an unstirred run of the same reagent and you can watch the difference. The drift back toward room temperature itself is measurable too: after recording an exothermic run, the observations tab plots the natural log of (T − 22) against time for its cooling tail, and the straight line that appears is Newton’s law of cooling made visible.',
      ],
    },
    {
      h2: 'A safety habit worth keeping: acid into water',
      body: [
        'Diluting acid has one golden rule: always add the acid to the water, never pour water onto acid. It is a matter of where the dilution heat goes. Acid tipped into a large volume of water spreads its heat through many molecules and warms gently. Water landed on top of concentrated acid sits in a thin layer above a liquid that releases its heat furiously at the mixing surface — that layer can flash to steam and spit droplets of acid out of the container.',
        'This bench teaches the rule both ways and never punishes. Pour the dilute sulfuric acid into your cup of water and the mentor praises the order; pour from the wash bottle into a cup that already contains acid and a warning appears, explaining that nothing dramatic happens with this dilute cup but the concentrated case would be dangerous. Either way, the habit — acid into water, every time — settles in before you ever meet a bottle concentrated enough to bite.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is a friendly first meeting with energy changes in reactions, and a satisfying one for anyone revising exothermic and endothermic chemistry who wants to watch the numbers move under their own hands. The mentor walks newcomers through six steps, from reading the starting temperature to the neutralisation mix, while the observations table, the classification quiz built into it, and the Newton-cooling straight line give confident learners something to sharpen.',
        'Everything runs in the browser on a phone, tablet or desktop, touch-first: drag jars with a finger, circle over the cup to stir, and tap the dropdowns to classify. Sound is synthesized live — pours, sloshes, the fizz of the citric mix, the clink of the glass rod — with no downloads and no accounts. Reset the bench any time for a fresh cup and a blank table.',
        'Playback runs at real time or twice as fast, and because the run clock counts simulated seconds, hurrying never bends the numbers — the runs simply finish sooner. Repeat a reagent with and without stirring, or record it twice, and the table quietly teaches the other half of calorimetry: the book value is a target your technique has to earn.',
      ],
    },
  ],
  faq: [
    {
      q: 'How can I tell whether a reaction is exothermic or endothermic?',
      a: 'Watch the temperature of the surroundings. If the mixture gets warmer, heat left the reaction and it is exothermic (a negative ΔH); if it gets cooler, heat went into the reaction and it is endothermic (a positive ΔH). In this lab the sign of your measured ΔT is the whole clue — the dropdown on each table row asks you to make that call yourself, and a tick confirms you read the thermometer right.',
    },
    {
      q: 'Why does dissolving potassium nitrate make the water colder?',
      a: 'Because breaking the crystal lattice apart costs more energy than the water gets back by surrounding the ions. The deficit has to come from somewhere, and the only supply nearby is the thermal energy of the water itself — so the water cools, in this bench by about −15 °C, enough to fog the outside of the cup with condensation. Sodium hydroxide does the opposite: the hydration of its ions pays out far more than the lattice costs, and the water climbs by roughly +18 °C.',
    },
    {
      q: 'Is citric acid plus sodium hydrogencarbonate exothermic or endothermic?',
      a: 'Endothermic — which is what makes it famous. The reaction between citric acid and sodium hydrogencarbonate releases carbon dioxide gas (so it fizzes) while absorbing heat overall, and the temperature falls even as the bubbles stream. The virtual lab reproduces the pairing deliberately: fizz and cooling together, about −12 °C, as a reminder that visible vigour says nothing about the direction of heat flow.',
    },
    {
      q: 'Why does the temperature drift back to 22 °C after the peak?',
      a: 'No cup is a perfect insulator. Heat leaks between the cup and the room at a rate proportional to their temperature difference, so the reading relaxes exponentially toward room temperature — Newton’s law of cooling, T(t) = T_room + (T₀ − T_room)e^(−kt). That is why you record the peak ΔT rather than a later reading, and why this lab’s cooling tail can be turned into a straight ln(T − 22) versus time line in the observations tab.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is touch-first: drag a jar from the shelf and hold it over the cup to pour, and make small circles over the cup to stir with the glass rod. Every control is sized for touch, and it works equally well with a mouse — or with the keyboard, where the Space key pours the reagent chosen in the pour-assist selector.',
    },
  ],
};
