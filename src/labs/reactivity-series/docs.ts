import type { DocsContent } from '../../engine/types';

export const reactivitySeriesDocs: DocsContent = {
  h1: 'Reactivity Series of Metals Virtual Lab — Fizz Test & Displacement',
  intro:
    'Drag magnesium ribbon, zinc granules, an iron nail and copper turnings into tubes of dilute hydrochloric acid and watch hydrogen fizz off each metal at its own pace. Count bubbles, read the thermometers, record the numbers, then rank the four metals yourself — and seal the order with a blue copper(II) sulfate tube that plates red-brown copper onto anything above it. The reactivity series stops being a list to memorise and becomes something your own hands measured.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with an amber bottle of dilute hydrochloric acid, four empty test tubes in a rack, a fifth tube already holding blue copper(II) sulfate solution, and a supply tray with the four metal samples. You press the bottle and watch the acid pour; then the real gesture begins — you pick a metal off the tray with your pointer or finger, drag it over a tube, and drop it in. The sample falls, lands with a soft clink, and the chemistry starts immediately.',
        'Hydrogen bubbles stream off the metal surface, rise, wobble and pop at the liquid surface — every pop counted into a live bubbles-per-10-seconds rate. A small thermometer stands beside each tube, its red column climbing as the reaction releases heat: sharply for magnesium, gently for zinc, barely at all for iron. The samples visibly thin as they react, magnesium disappearing entirely, while copper just sits there, silent.',
        'Tap any tube to select it and its live readings fill the instrument panel. Press Record while a metal works and the data table banks its peak fizz rate, its peak temperature rise and an observation line. When all four metals are tested, you rank them most reactive first and lock the order in. Finally, drag a metal into the blue copper(II) sulfate tube and watch the displacement confirmation unfold.',
      ],
    },
    {
      h2: 'The chemistry behind the fizzing',
      body: [
        'An acid is a source of hydrogen ions, and a reactive metal is generous with electrons. When the two meet, the metal hands electrons to hydrogen ions, the ions become hydrogen gas, and the bubbles you see rising are that gas leaving the solution. The metal itself dissolves into the acid as its salt — magnesium chloride, zinc chloride or iron chloride depending on the sample.',
        'How eagerly a metal gives up its electrons decides everything you observe: how fast the bubbles stream, how quickly the sample thins away, and how much heat the reaction dumps into the tube. That is why magnesium fizzes furiously while copper does nothing at all — copper holds its electrons too tightly to push hydrogen out of the acid. Metals are conventionally arranged in one descending line, the reactivity series, and the acid test places each metal on it honestly.',
      ],
      bullets: [
        'Mg + 2 HCl → MgCl₂ + H₂↑ — the general shape: metal + acid → salt + hydrogen',
        'Zn + 2 HCl → ZnCl₂ + H₂↑ and Fe + 2 HCl → FeCl₂ + H₂↑ — same pattern, weaker each time',
        'Cu + HCl → no reaction — copper sits below hydrogen in the series',
        'Reactivity series order: K > Na > Ca > Mg > Al > Zn > Fe > Pb > (H) > Cu > Ag > Au',
      ],
    },
    {
      h2: 'Reading the evidence: rate, heat and disappearing metal',
      body: [
        'One fizzing tube is a spectacle; four side by side are a measurement. The lab counts every bubble that pops at the surface over a rolling ten-second window, so the bubbles-per-10-s figure you record is a genuine reaction rate, not an impression. You should find magnesium reaching the forties, zinc in the high teens, iron managing only a handful, and copper a flat zero — the spread that ranks them.',
        'The thermometers add a second, independent channel of evidence. Each reaction is exothermic, and the peak temperature rise tracks the vigour: around eighteen degrees for magnesium, eight for zinc, three for iron, nothing for copper. The observations tab plots your temperature rises against your fizz rates, and the points line up on a straight line — brisker fizz, bigger climb. Two different measurements pointing at the same ordering is what makes a conclusion solid.',
        'Watch the samples themselves, too. Magnesium visibly shrinks and vanishes; zinc granules wear away slowly; the iron nail stays essentially intact for a very long time; copper is untouched. Speed of disappearance is a third reading of the same underlying quantity — how freely each metal lets go of its electrons. When bubble rate, heat and dissolution all agree, your ranking is not a guess.',
      ],
    },
    {
      h2: 'The displacement confirmation',
      body: [
        'The blue tube holds copper(II) sulfate solution, which is brimming with Cu²⁺ ions hoping to become copper metal again. Drop in any metal you ranked above copper — magnesium, zinc or iron — and it hands electrons directly to those ions. Blue fades from the solution, and a red-brown coating of genuine copper grows on the sample, thickening until the metal underneath is used up. With magnesium you will also see gentle fizzing, because magnesium is reactive enough to argue with the water itself.',
        'Copper dropped into copper sulfate does nothing at all: a metal cannot displace itself, and the blue stays blue. That is not a failure — it is the control that completes the argument. Displacement runs down the series, never up it, so the blue tube is an independent court where your acid-based ranking must defend itself. If magnesium beats copper in acid and also beats copper in its sulfate, the order is confirmed twice over.',
      ],
      bullets: [
        'Zn + CuSO₄ → ZnSO₄ + Cu — blue fades, red-brown copper deposits',
        'Mg + CuSO₄ → MgSO₄ + Cu (plus a little H₂ from the water)',
        'Cu + CuSO₄ → no reaction — a metal cannot displace itself',
      ],
    },
    {
      h2: 'Technique, precision and honest errors',
      body: [
        'Good comparisons are fair ones. Keep one metal per tube so each sample meets fresh acid, and pour the acid before the metals so every tube starts at the same temperature and concentration. Record while the reaction is lively — the peak fizz rate and peak temperature are captured for you, so waiting too long costs you nothing in the table, but watching the live numbers teaches you how rates fall as the metal is used up.',
        'Notice the deliberate imperfections, because they mirror real bench work. Thermometers lag behind the reaction by several seconds, temperatures drift back toward room temperature once the metal is gone, and the fizz slows as the sample thins — all true of the physical world. Copper’s empty result is the easiest to mishandle: a zero that is measured, recorded and explained is worth as much as any number on the page, and it is the zero that anchors the bottom of your series.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is the reactivity series for anyone meeting it for the first time, and a fresh set of evidence for anyone revising it. Newcomers get a mentor that walks the procedure one step at a time and a nudge that physically demonstrates the drag gesture if they go quiet; confident learners get live rates, a data table, a bubbles-versus-time chart and a fitted temperature plot to argue from. The whole experiment runs in the browser on a phone, tablet or desktop, with synthesized sound and no downloads — the fizz you hear is generated the moment you drop the metal in.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I rank metals in the reactivity series using this lab?',
      a: 'Test all four metals in separate tubes of dilute hydrochloric acid, record each one’s bubbles per 10 s and peak temperature rise, and note how fast each sample thins away. Rank by that evidence — strongest fizz and biggest heat climb on top — then lock the ranking in. The correct order from the data is magnesium > zinc > iron > copper.',
    },
    {
      q: 'Why does copper not react with dilute hydrochloric acid?',
      a: 'Copper sits below hydrogen in the reactivity series, so it is not reactive enough to push hydrogen out of the acid. There are no bubbles, no temperature rise and no change to the sample. Drop copper into the blue copper(II) sulfate tube and nothing happens there either — a metal cannot displace itself.',
    },
    {
      q: 'What is the order of reactivity of common metals?',
      a: 'The usual series runs potassium > sodium > calcium > magnesium > aluminium > zinc > iron > lead > (hydrogen) > copper > silver > gold. Everything above hydrogen displaces it from dilute acids; everything below it does not. This lab measures the magnesium, zinc, iron and copper stretch of that line with your own data.',
    },
    {
      q: 'Why does magnesium heat the acid more than iron does?',
      a: 'The metal–acid reaction is exothermic, and the heat arrives at the rate the reaction runs. Magnesium reacts so quickly that heat piles into the liquid faster than the tube can lose it, so the thermometer climbs steeply; iron reacts so slowly that its heat trickles away almost as fast as it is released. The lab plots your temperature rises against your fizz rates to show the two travelling together.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is built touch-first: drag metals with your finger, tap tubes to read their thermometers, and every button is sized for touch. It works equally well with a mouse, and the canvas supports keyboard operation — press 1 to 5 to select tubes and Space to drop the chosen metal.',
    },
  ],
};
