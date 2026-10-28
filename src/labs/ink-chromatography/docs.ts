import type { DocsContent } from '../../engine/types';

export const inkChromatographyDocs: DocsContent = {
  h1: 'Ink Chromatography Virtual Lab — Separate Ink Pigments and Calculate Rf Values',
  intro:
    'Spot black, blue and green inks onto a strip of chromatography paper, lower it into a beaker of solvent, and watch capillary action drag the liquid up the paper while each pigment climbs at its own pace. Lift the strip at the right moment, click the baseline, the solvent front and every band, and the bench turns your clicks into millimetres and Rf values — exactly the way a forensic chemist compares a questioned ink against its references. One of the pens on the tray is an unknown mixture, and its identity is yours to prove.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with a tray of four pens — black ink, a blue reference pen, a green reference pen and an unknown — beside a tall beaker of solvent on a retort stand. You drag a pen down to the pencil baseline near the bottom of the hanging strip and release: a round spot appears where the felt tip lands. Spot as many inks as you like along the baseline; running the references beside the unknown on one strip is the professional habit this bench is built to teach.',
        'Next you lower the paper itself. Grab the strip and drag it down into the beaker until the baseline sits just above the liquid — a few millimetres clear, never touching. Too shallow and the solvent never reaches the paper; too deep and the spots dissolve straight into the beaker, ruining the strip. Once the paper drinks, the solvent front climbs fast at first and then slows, and the pigments sort themselves into a ladder of coloured bands.',
        'When the front has risen about eighty millimetres, you lift — dragging the strip up or pressing the lift control — before the front overruns the top of the paper. Then comes the measuring: click the pencil baseline, click the front mark, and click each band in turn. The ruler panel in the sidebar converts every click into a distance, the observation table fills with pigment colours, millimetres and Rf values, and the final step is to name the unknown by comparing its Rf set with the references.',
      ],
    },
    {
      h2: 'The science of paper chromatography',
      body: [
        'Chromatography separates a mixture because its components disagree about where they would rather live. The damp cellulose fibres of the paper are the stationary phase; the creeping solvent is the mobile phase. A pigment that forms strong attractions to the wet fibres spends most of its time held still, so it barely leaves the baseline. A pigment that dissolves readily in the solvent travels almost as fast as the front. Black ink is a blend of four such pigments, which is why a single run splays it into violet, royal blue, teal and yellow bands.',
        'The height a band reaches is always reported as a fraction of the height the solvent front reached, and that fraction is the Rf value. Because it is a ratio of two distances measured from the same baseline, Rf is self-correcting: a slightly shorter run pulls every band down in proportion and leaves every Rf untouched. That is why chemists trust Rf values far more than raw band heights when comparing one chromatogram with another.',
      ],
      bullets: [
        'Rf = distance moved by the pigment ÷ distance moved by the solvent front',
        'Both distances are measured from the pencil baseline, so Rf always lies between 0 and 1',
        'Strongly paper-loving pigments have low Rf (the violet band sits near 0.15); solvent-friendly ones approach 0.9',
        'The solvent front rises by capillary action — fast at first, slowing as the wet column grows, with height climbing roughly as the square root of time',
        'Ethanol climbs the same paper about 1.8 times faster than water, so ethanol runs finish sooner',
        'The baseline must start above the liquid: submerged spots dissolve into the reservoir instead of developing',
      ],
    },
    {
      h2: 'Measuring like a forensic chemist',
      body: [
        'Real identification work stands on comparison, not memory. The unknown ink in this bench is a mixture whose pigment set matches one of the two reference pens, and the only honest way to name it is to run the references on the same strip, in the same solvent, and match Rf values pair by pair. Identical dyes travel identical distances; two Rf values within about five hundredths of each other are strong evidence of the same pigment.',
        'The measuring workflow mirrors what you would do with a real ruler. First the baseline is clicked to zero the scale, then the solvent-front mark sets the full distance, and then each band is clicked in turn — the active ink in the selector decides which lane you are measuring, because bands from different inks can sit at the same height. Every reading carries a small jitter of a few tenths of a millimetre, the way a real eye on a real ruler does, so a tolerance of about ±0.05 is the professional rule when judging a match.',
        'The observation table records the ink, the pigment colour, the distance moved and the Rf value for every band you measure, and the analysis graph plots band distance against Rf for the current strip. All the points from one strip should fall on a single straight line through the origin — distance equals Rf times the front distance — so the fitted slope is your solvent-front distance in millimetres and a stray point is a sure sign of a mis-clicked band.',
      ],
    },
    {
      h2: 'Errors and how the bench punishes them',
      body: [
        'Paper chromatography has two classic ways to fail, and this lab models both honestly. Dip the strip too deep and the baseline — spots and all — drops below the liquid surface: the pigments dissolve straight into the reservoir, the strip is stained and finished, and the only cure is a fresh strip and a more careful hand. Leave the strip in too long and the solvent front runs off the top of the paper: the bands cram against the upper edge, the front can no longer be marked, and the run is ruined. Lifting while the front is near eighty millimetres keeps you comfortably clear of both failure modes.',
        'The gentler errors are the instructive ones. Lifting very early still gives usable numbers — Rf values are ratios, after all — but the bands sit close together and the measurement jitter matters more, so identifications get shakier. And because the front slows as it climbs, the last ten millimetres take longer than the first thirty; impatient students can raise the playback speed, which speeds the simulated clock and the front together so every measurement stays consistent.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is a friendly first encounter with separation techniques and with the idea of a retention factor, and a satisfying one for anyone revising chromatography who wants their hands back on the strip. Nothing is hot, nothing is corrosive, and the only casualty of a mistake is a paper strip — which is exactly what makes the failure modes safe to explore. The mentor walks newcomers through six steps, from spotting to the final identification, while the measurement table, the Rf ruler and the analysis graph give confident learners something to sharpen.',
        'Everything runs in the browser on a phone, tablet or desktop, with touch-first gestures — drag the pens, drag the strip, tap the bands — synthesized sound for spots, slides and the soft drip of a developing chromatogram, and no downloads or accounts. Reset the bench and the unknown is quietly re-chosen between the two references, so every fresh session asks the question again.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I calculate an Rf value in chromatography?',
      a: 'Measure the distance from the pencil baseline to the centre of the pigment band, and the distance from the same baseline to the solvent-front mark. Divide the first by the second: Rf = pigment distance ÷ solvent distance. In this lab you click the baseline, the front mark and each band in turn, and the ruler panel fills the table with both distances and the resulting Rf, rounded to two decimal places.',
    },
    {
      q: 'Why does black ink separate into different colours?',
      a: 'Because "black" is not one dye but a recipe of several pigments chosen to absorb different parts of the spectrum. On the strip they stop agreeing: the violet pigment clings hardest to the damp paper and barely leaves the baseline (Rf about 0.15), while the yellow pigment dissolves freely in the solvent and chases the front (Rf about 0.9). The blue and teal pigments settle in between, and the once-black spot opens into a ladder.',
    },
    {
      q: 'Why must the baseline stay above the solvent?',
      a: 'Development only works while the spots sit above the liquid surface, waiting for the creeping front to reach and dissolve them. If the baseline drops below the surface, the pigments dissolve directly into the whole reservoir of solvent instead of being carried up the paper — the spots wash away and the strip is ruined. Aim for the baseline hovering a few millimetres above the liquid.',
    },
    {
      q: 'Does ethanol give different Rf values from water?',
      a: 'In a real laboratory, yes — changing the solvent changes how willingly each pigment travels, so Rf values shift and comparisons are only valid within one solvent. This teaching model keeps each pigment at its own fixed Rf in either solvent, so the visible difference is pure speed: ethanol climbs the same paper about 1.8 times faster, and the same bands arrive sooner. The professional habit still applies — compare chromatograms run in the same solvent, which this bench always does.',
    },
    {
      q: 'Can I use this chromatography lab on my phone or tablet?',
      a: 'Yes. The lab is touch-first: drag pens to the baseline with a finger, drag the strip into the beaker, and tap bands to measure them, with every control sized for touch. It works equally well with a mouse and keyboard on desktop — the Space key spots the selected ink, lifts the strip, or measures the next band, whichever the moment calls for.',
    },
  ],
};
