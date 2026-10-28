import type { DocsContent } from '../../engine/types';

export const phSpectrumDocs: DocsContent = {
  h1: 'pH Scale Virtual Lab — Universal Indicator Colours and Household Solutions',
  intro:
    'Squeeze universal indicator into nine everyday solutions — lemon juice, vinegar, apple juice, black coffee, rainwater, distilled water, baking soda solution, soap solution and milk of magnesia — and watch each liquid swirl to its own colour across the 0–14 scale. Drag a digital probe in for the exact pH, then stand every tube on a rainbow strip at the bottom of the bench until you have built the complete pH spectrum with your own hands. The colour is your evidence, the probe is your confirmation, and the scale you assemble yourself is the lesson.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with a wooden rack of nine test tubes, a glass dropper of universal indicator resting by the left wall, and a digital pH probe clipped to its holder on the right. You pick the dropper up with your pointer or finger, carry it over any tube and simply hold it there: a drop swells at the tip, detaches, falls in, and the liquid swirls through its own colour as the dye mixes. Lemon juice blooms red-orange, apple juice settles to orange, distilled water turns the classic green.',
        'When you want numbers instead of colours, drag the probe into a tube and keep it still. The reading settles in the live instrument panel beside the bench — an exact pH such as 2.4 for lemon juice or 9.5 for soap solution — together with the solution name and whether it is acidic, neutral or alkaline. The canvas itself stays free of text on purpose: every reading lives in the panel, the way a real meter sits beside your hands.',
        'The placement step is where the scale gets built. Drag each coloured tube down onto the rainbow strip and stand it in the colour band that matches its liquid. A true match snaps in with a soft glass clink and records a row in your observations table — solution, indicator colour, matched pH and acid, neutral or alkali. A mismatch simply sways gently on the strip until you compare the colours again and re-place it; the lab never tells you the answer outright, because the colour in the tube and the number on the probe are your evidence.',
      ],
    },
    {
      h2: 'The chemistry of universal indicator',
      body: [
        'Acids release hydrogen ions into water and alkalis accept them, so chemists describe how acidic or alkaline a solution is by its hydrogen ion concentration. Because that concentration swings over an enormous range, it is compressed into a single convenient number: the pH. Universal indicator is a mixture of several dyes, each of which changes colour at a different pH, so the blend gives one smooth spectrum of colours across the whole scale instead of a single abrupt change.',
        'In this lab every tube is computed from realistic pH values for the household solutions: lemon juice about 2.4, vinegar about 2.9, apple juice about 3.5, black coffee about 5.0, rainwater about 5.6, distilled water 7.0, baking soda solution about 8.3, soap solution about 9.5 and milk of magnesia about 10.5. The colour that appears in each tube is exactly the colour universal indicator gives at that pH.',
      ],
      bullets: [
        'pH = −log₁₀[H⁺] — the negative logarithm (base 10) of the hydrogen ion concentration',
        'Universal indicator is a mixture of dyes, each changing colour at a different pH',
        'Colour key: red pH 1–2 · orange 3–4 · yellow 5–6 · green 7 · blue 8–9 · indigo 10–11 · violet 12–14',
        'Every step of one pH unit means a tenfold change in hydrogen ion concentration',
        'Acidic solutions have pH below 7, neutral solutions sit at 7, alkaline solutions sit above 7',
      ],
    },
    {
      h2: 'Why the pH scale is logarithmic',
      body: [
        'The logarithm is what makes the scale usable. Lemon juice at pH 2.4 and distilled water at pH 7 look like neighbours on the strip, but the lemon juice carries about one hundred thousand times more hydrogen ions per litre — five pH units means ten to the power five. That is why a lemon can sting a paper cut that water cannot touch, and why "a little more acidic" in pH language is a huge change in chemistry.',
        'The same logic works in the other direction. Baking soda solution at pH 8.3 holds roughly twenty times fewer hydrogen ions than pure water, so it is a genuinely alkaline liquid even though its colour is a gentle blue-green rather than a dramatic violet. Only strongly alkaline cleaners, around pH 12 to 14, push the indicator into the violet end of the strip — and deliberately, none of the nine household solutions in this rack goes that far, which is why the violet band stays empty.',
        'Working with the log scale also explains a habit every chemist keeps: quoting pH to one decimal place, the way the digital probe does. One decimal in pH is already a factor of about 1.26 in hydrogen ion concentration, so extra digits would be pretending to a precision the measurement never had.',
      ],
    },
    {
      h2: 'Reading colour like a chemist: technique and honest errors',
      body: [
        'A colour band is a coarser instrument than a probe. Universal indicator tells you a band — orange means pH 3–4, blue means 8–9 — so two solutions in the same band, such as vinegar at 2.9 and apple juice at 3.5, can look very similar. The probe resolves them instantly. In the lab, the natural workflow is the professional one: identify the band by colour first, then confirm the exact value with the instrument before you commit to a placement.',
        'Technique matters too. Drag the dropper cleanly from tube to tube rather than swirling it inside them, because a dropper that carries one solution into the next is a real source of contamination. Judge colours by holding the tube over the strip and comparing the liquid with the band beneath it, side by side. And if you try to place a tube you have never tested, the mentor will send it straight back — an untested liquid is colourless evidence, and guessing is not measurement.',
        'If telling certain colours apart is difficult for your eyes, the probe is your friend: it gives every tube a number, and the observation table records the reading alongside the colour name. A wrong placement never breaks anything — the tube simply sways on its slot until you lift it again, so trial, comparison and re-placement are all part of the method.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This experiment is the friendliest possible entrance to acids and alkalis: nothing is hot, nothing is dangerous, and every solution comes from a kitchen or bathroom cupboard. It is built for anyone meeting the pH scale for the first time, for students revising what the indicator colours mean, and for anyone who wants to feel why the scale is logarithmic rather than just memorise it.',
        'The whole lab runs in the browser on a phone, tablet or desktop, with touch-first gestures — drag with a finger, hold to squeeze — synthesized sound for drips, swirls and glass clinks, and a mentor that walks newcomers through five steps while leaving every judgement to you. No downloads, no accounts, no setup: pick up the dropper and the spectrum is yours to build.',
      ],
    },
  ],
  faq: [
    {
      q: 'What colour does universal indicator show at each pH?',
      a: 'Red for strong acids at pH 1–2, orange at 3–4, yellow at 5–6, green at exactly neutral pH 7, blue at 8–9, indigo at 10–11 and violet for strong alkalis at 12–14. Between these anchor colours the indicator blends continuously — that is why the rainbow strip in the lab is a smooth gradient rather than seven flat blocks.',
    },
    {
      q: 'How do I test the pH of a household solution?',
      a: 'Drag the universal indicator dropper over the tube and hold it still: a drop swells, falls in and the liquid swirls to its colour. That colour gives the pH band. For the exact value, drag the digital probe into the same tube and hold until the reading locks in the side panel. Then stand the tube on the matching band of the 0–14 strip to record it in your observations table.',
    },
    {
      q: 'Which household solutions are acids and which are alkalis?',
      a: 'In this rack the acids are lemon juice (about pH 2.4), vinegar (2.9), apple juice (3.5), black coffee (5.0) and rainwater (5.6). Distilled water is neutral at 7.0. The alkalis are baking soda solution (8.3), soap solution (9.5) and milk of magnesia (10.5). Anything below 7 is acidic, anything above 7 is alkaline.',
    },
    {
      q: 'Why is rainwater slightly acidic while distilled water is neutral?',
      a: 'Rain dissolves carbon dioxide from the air as it falls, and the CO₂ forms a weak carbonic acid solution, which settles rainwater at about pH 5.6. Distilled water has nothing dissolved in it, so it sits at exactly 7.0 — which is also why the distilled water tube turns the purest green of the whole rack.',
    },
    {
      q: 'Can I use this virtual pH lab on my phone?',
      a: 'Yes. The lab is touch-first: drag the dropper, the probe and the tubes with your finger, and every control is sized for touch. It also works with a mouse and keyboard on desktop — the Space key squeezes the dropper over the next untested tube for you.',
    },
  ],
};
