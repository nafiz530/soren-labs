import type { DocsContent } from '../../engine/types';

/**
 * SEO guide page for the photosynthesis starch-test lab.
 * Keyword targets: photosynthesis virtual lab, starch test in leaves,
 * iodine test for starch, variegated leaf experiment, destarched plant.
 */
export const photosynthesisDocs: DocsContent = {
  h1: 'Photosynthesis Virtual Lab — the Starch Test in Leaves, Step by Step',
  intro: 'Run the classic iodine test for starch in leaves with your own hands: pick leaves from a bright windowsill plant and a destarched plant kept 48 hours in a dark cupboard, boil them, decolorize them in an ethanol water-bath, rinse them, and watch iodine paint the map of where photosynthesis actually happened. This photosynthesis virtual lab works on any phone, tablet or desktop — no kit, no fume cupboard, no burned fingers.',
  sections: [
    {
      h2: 'What you do in this photosynthesis virtual lab',
      body: [
        'You start on a bench between two potted geraniums. One grows on a bright windowsill, its variegated leaves showing a green rim around a cream centre, with one fully green leaf beside them. The other plant sits inside a dark cupboard that you can slide open — it has spent 48 simulated hours without light, so it is a destarched plant: green, but with its starch stores used up. A simulated clock runs at 1×, 4× or 16× speed so slow steps take seconds instead of minutes.',
        'The protocol is performed gesture by gesture, not by pressing a single "run" button. You drag a leaf off its stem, hold it in boiling water on a tripod above a Bunsen flame, drop it into a slim tube of ethanol standing in a hot-water bath, rinse it in cold water, spread it flat on a white tile, and finally drag the iodine dropper over it and let a drop fall. Each stage runs on honest timers, with live temperatures for the boiling water and the water bath in the instrument panel.',
        'Every result is earned from what you actually did. Pick a variegated leaf from the windowsill and iodine will turn its green rim blue-black while the cream centre stays orange-brown. Pick the all-green windowsill leaf and the whole blade goes blue-black. Pick a cupboard leaf and the whole blade stays orange-brown. Your table, your starch-area bar chart and your conclusion card are built only from leaves you personally walked through the test.',
      ],
    },
    {
      h2: 'Why the starch test in leaves proves photosynthesis happened',
      body: [
        'Photosynthesis is the process where a leaf uses light energy, captured by the green pigment chlorophyll, to build sugar from carbon dioxide and water. When a leaf makes more sugar than it immediately needs, it converts the surplus into starch and stores it inside its green tissue. Finding starch is therefore a memory of photosynthesis: evidence that the leaf was actively capturing light in the hours before you tested it.',
        'The iodine test for starch is beautifully direct. Iodine solution on its own is orange-brown, but when iodine molecules slide inside the long coiled chains of starch they form a complex that swings to a deep blue-black. So a region of leaf that turns blue-black contained starch; a region that stays orange-brown did not. No colour change, no starch — the leaf is telling you where it was working.',
        'That is why the test needs the right leaf material. A leaf that has just spent two sunny days on a windowsill is packed with starch. A leaf from a destarched plant — one kept in darkness long enough to use up its stores — contains almost none, even though it is still green. Comparing those two leaves side by side is the whole argument of the experiment.',
      ],
      bullets: [
        'Photosynthesis: 6 CO₂ + 6 H₂O —light + chlorophyll→ C₆H₁₂O₆ + 6 O₂',
        'Spare glucose is converted to starch and stored in the leaf',
        'Iodine + starch → blue-black colour; iodine alone stays orange-brown',
        'Starch in a leaf = photosynthesis happened there, in the light, in green tissue',
      ],
    },
    {
      h2: 'The iodine protocol, step by step — and why each step exists',
      body: [
        'First, the boiling water. Dropping the leaf into water at a rolling boil for about two minutes kills the cells and destroys the enzymes, freezing the leaf\u2019s chemistry so nothing changes while you work. It also softens the leaf and bursts cell walls so the iodine can penetrate evenly later. In this virtual lab the water must genuinely reach about 95 °C before the leaf will go in — patience is part of the technique.',
        'Second, the ethanol. Green chlorophyll would hide or fake colour changes, so the leaf is moved into a tube of hot ethanol, which dissolves the chlorophyll out of the tissue. The leaf turns pale and brittle while the ethanol turns green. Ethanol is flammable, so it is warmed only in a tube standing in a beaker of hot water — never over a direct flame. This virtual lab enforces that honestly: drag the ethanol tube near the Bunsen flame and you get a warning and a flammability lesson rather than a quiet pass.',
        'Third, the cold-water rinse, which washes the ethanol out and makes the brittle leaf lie flat again. Fourth, the white tile: the leaf is spread out so every region faces up and takes the iodine evenly. Finally the iodine drop itself. Watch it spread — the colour crawls outward from the landing point over a few simulated seconds, exactly as a real drop wicks across wet leaf tissue.',
      ],
    },
    {
      h2: 'The variegated leaf experiment: a leaf that maps its own chlorophyll',
      body: [
        'A variegated leaf is a ready-made controlled experiment. Its green rim contains chlorophyll; its cream centre does not. Both regions grew on the same plant, in the same soil, with the same water and the same hours of light — the only difference between them is the green pigment. When iodine is dropped on a tested variegated leaf from the windowsill, the green rim turns blue-black and the cream centre stays orange-brown.',
        'That single leaf therefore separates the two requirements by itself. Whatever made the starch in the rim was present in the rim but missing from the centre, and the visible difference between the two regions is chlorophyll. Light was equally available to both halves, so the cream centre\u2019s failure to make starch points at the missing pigment, not the missing light.',
        'In the observations tab, each tested variegated leaf contributes two table rows — one for the rim, one for the centre — plus a starch-area bar showing roughly the half of the blade that stored starch. Map both regions on the same leaf and the lab recognises the achievement: reading rim and centre verdicts together is the heart of honest evidence-reading here.',
      ],
    },
    {
      h2: 'The destarched plant: darkness as the second control',
      body: [
        'The cupboard plant is fully green — plenty of chlorophyll — but it has spent 48 simulated hours in the dark. Without light, photosynthesis stops, and the leaf slowly consumes the starch it had banked earlier. By the time you open the cupboard door, its leaves hold essentially no starch. Boil one, decolorize it, rinse it, drop iodine on it: the whole blade stays orange-brown.',
        'This is the mirror image of the variegated leaf experiment. There, chlorophyll varied while light was constant. Here, light varied while chlorophyll was constant. Two leaves, two comparisons, one conclusion that neither can reach alone: a leaf needs both light and chlorophyll to make starch.',
        'Opening the cupboard is a small moment of its own — the door slides back with a creak to reveal the dim interior and the plant waiting inside. Take one leaf at a time and walk it through the full protocol; shortcuts are not available, because the destarched control only counts if it receives exactly the same treatment as the windowsill leaves.',
      ],
    },
    {
      h2: 'Reading your results honestly: colours, errors and safety',
      body: [
        'Blue-black means starch; orange-brown means none — but honest reading goes further. Ask why each region came out the way it did. The windowsill green rim had light and chlorophyll, so blue-black. Its cream centre had light but no pigment, so orange-brown. The cupboard leaf had pigment but no light, so orange-brown again. Two different failures, one shared success. The conclusion card asks you to pick the pair of conditions that mattered, and if you choose wrongly it points you back to specific rows of your own table rather than handing you the answer.',
        'Real benches add sources of error worth knowing about. A leaf that was never boiled may not take iodine evenly. Chlorophyll left in the leaf can make a faint colour hard to judge. Ethanol carried near a flame is genuinely dangerous — which is why the water bath exists. A curled leaf hides regions from the drop. This simulation keeps every one of those lessons intact: the temperatures, timers and safety warnings all behave as the real apparatus would.',
        'On the technical side, everything runs locally in your browser: the leaves, steam, bubbling water and flickering flame are drawn live on a 2D canvas, and every sound — the creak of the cupboard door, the slosh of water, the clink of glass — is synthesized on the spot. Nothing is downloaded, nothing is uploaded, and the whole experiment fits comfortably on a phone screen.',
      ],
    },
  ],
  faq: [
    {
      q: 'What colour shows that starch is present in a leaf?',
      a: 'Blue-black. Iodine solution is orange-brown on its own, but when it meets starch the two form a complex with a deep blue-black colour. In this virtual lab you will see the drop spread across the leaf and stain each region: green tissue that made starch goes blue-black, while regions without starch — the cream centre of a variegated leaf, or leaves from the dark cupboard — stay orange-brown.',
    },
    {
      q: 'Why is the leaf boiled in water and then soaked in ethanol?',
      a: 'Boiling water kills the leaf and stops its internal chemistry, and it softens the tissue so reagents can enter. Hot ethanol then dissolves the green chlorophyll out of the leaf — chlorophyll would otherwise mask or imitate the iodine colour. Because ethanol is flammable, it is warmed in a tube standing in a beaker of hot water, never over a direct flame; the lab will warn you if you drag the tube toward the Bunsen burner.',
    },
    {
      q: 'Why must a plant be destarched before the experiment?',
      a: 'A destarched plant has been kept in darkness for about two days, long enough to use up the starch stored in its leaves. Without destarching, even a leaf kept in the dark for a few hours might still show old starch and turn blue-black, ruining the comparison. Starting from empty leaves means any starch you find at the end was made during the experiment — in the light, in green tissue.',
    },
    {
      q: 'What does a variegated leaf show that a green leaf cannot?',
      a: 'A variegated leaf has a green rim with chlorophyll and a cream centre without it, on the same blade, in the same light. When iodine stains the rim blue-black but the centre orange-brown, you see directly that chlorophyll — not just light — was required. An all-green leaf can only tell you about the whole blade at once; the variegated one runs the comparison inside a single leaf.',
    },
    {
      q: 'Can I use this photosynthesis virtual lab on my phone?',
      a: 'Yes. The bench, the plants, the apparatus and all the drag gestures are built for touch as well as mouse, with touch targets comfortably larger than a fingertip. Every gesture also has a button and keyboard equivalent — press Space on the bench to perform the next sensible step — and the simulated clock runs at up to 16× speed so the two-minute boil never tests your patience.',
    },
  ],
};
