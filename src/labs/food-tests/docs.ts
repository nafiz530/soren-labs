import type { DocsContent } from '../../engine/types';

export const foodTestsDocs: DocsContent = {
  h1: 'Food Test Virtual Lab — Benedict’s, Iodine, Biuret and Emulsion Tests',
  intro:
    'Welcome to a food test virtual lab you actually run with your own hands. Drag a potato, glucose, egg white, oil, milk or bread into a test tube, pour iodine, Benedict’s, biuret or ethanol with real drag-and-drop gestures, give Benedict’s its full thirty-second hot-water-bath trip, shake the ethanol charge and pour it into the water beaker. Every verdict in your results table comes from the colour you personally watched develop — and one masked mystery sample per session turns the four classic food tests into a genuine deduction.',
  sections: [
    {
      h2: 'What you do in the food test virtual lab',
      body: [
        'The bench opens with a shelf of food jars, a rack of reagent bottles, one clean test tube in a stand, a water beaker, and a tripod with a hot water bath over a lit Bunsen burner. You grab a food jar and drop it over the tube’s mouth to load it. Then you drag a reagent bottle over the tube and watch a real pour: the bottle tips, a stream falls, the liquid level rises, and the colour story begins.',
        'Each test asks for honest technique. Benedict’s reagent stays stubbornly blue at bench temperature — you must drag the tube into the hot water bath and hold it there for roughly thirty simulated seconds while the colour climbs from blue through green and yellow to brick-red. The ethanol emulsion test needs a firm shake (drag the tube side-to-side) before you pour it into the water beaker. Skip a step and the bench records exactly what you saw: a faint wisp instead of a proper white emulsion, or a weak yellow from a Benedict’s tube lifted out of the bath too early.',
        'There is also one masked mystery sample on the shelf every session — secretly honey, rice water, sunflower-seed extract or lean-meat broth. Its nutrient matrix row starts completely blank and only fills from colours you produce yourself. When your panel is finished, you name the mystery food from four chips; a wrong pick gets coaching that points at the tests you skipped or under-read, never the answer.',
      ],
    },
    {
      h2: 'The iodine test for starch',
      body: [
        'Iodine solution is an orange-brown liquid in the bottle. Drop it onto a sample containing starch — potato or bread are the classic positives — and it slips inside the coiled amylose chains to form a deep blue-black complex. Drop it onto a starch-free sample and the tube simply stays orange-brown, which is why a negative result looks exactly like the reagent itself.',
        'In the lab the colour settles over about two seconds and then the row banks itself into your observations table: sample, test, reagent, colour observed, and a verdict derived only from that colour. The nutrient matrix ticks starch “present” or “absent” for the sample you tested. Because the bench insists on settled colours, a tube you rinse mid-development banks as inconclusive — the same discipline a careful experimenter keeps at a real bench.',
      ],
      bullets: [
        'Iodine + starch → blue-black complex (positive)',
        'Iodine alone stays orange-brown (negative)',
        'Potato and bread are classic starch positives; glucose, egg white and oil are negatives',
      ],
    },
    {
      h2: 'The Benedict’s test for reducing sugar — and why it needs heat',
      body: [
        'The Benedict’s test for sugar is the one food test that refuses to work cold. The reagent is blue because of dissolved copper(II); a reducing sugar such as glucose converts that copper down to insoluble copper(I) oxide, but the reaction needs a hot water bath to proceed at a useful pace. In this virtual lab you pour the blue reagent onto your sample, drag the tube into the bath, and hold it for about thirty simulated seconds while the transformation runs.',
        'The reward for patience is a graded colour scale that reflects sugar concentration. Blue means no reducing sugar. Green means a trace — milk lands here, honestly, because it carries a little lactose. Yellow is a weak positive, which is exactly what bread gives: mostly starch with a little sugar. Orange is moderate and brick-red with a settling precipitate means concentrated reducing sugar — glucose solution and honey end here. Lift the tube out of the bath early and you bank the paler colour you actually earned, not the one a full trip would have given.',
      ],
      bullets: [
        'Benedict’s + reducing sugar + heat → green → yellow → orange → brick-red precipitate',
        'Benedict’s + no reducing sugar (or no heat) → stays blue',
        'Colour depth tracks sugar concentration: milk a trace, bread weak, glucose brick-red',
      ],
    },
    {
      h2: 'The biuret test for protein and the ethanol emulsion test for fats',
      body: [
        'The biuret test for protein is gloriously quick: pour the pale-blue reagent and wait a few seconds. If peptide bonds are present — egg white and milk are the classics — copper(II) binds them in alkaline solution and the mixture shifts to violet or lilac. No protein, and the tube just stays pale blue, the colour of the reagent itself.',
        'The emulsion test for fats works on solubility rather than colour chemistry. Fats dissolve in ethanol but not in water, so you shake the sample with ethanol, pour the mixture into a beaker of cold water, and watch the fat come out of solution as microscopic droplets that scatter light — a cloudy white emulsion. No fat, and the water stays clear. The shake matters: an unshaken pour leaves most of the fat behind and produces only a faint wisp, which this bench honestly records as inconclusive rather than negative. Cooking oil is the classic positive; sunflower-seed extract hides fat in the mystery round.',
      ],
      bullets: [
        'Biuret + protein → violet / lilac; biuret alone → pale blue',
        'Fat dissolved in ethanol + water → cloudy white emulsion (positive)',
        'Emulsion test without a proper shake → faint cloud, recorded as inconclusive',
      ],
    },
    {
      h2: 'Reading your results like a scientist',
      body: [
        'Every settled colour banks a row: which sample, which test, which reagent, the colour you observed with a swatch, and the verdict that colour supports. Those rows build a nutrient matrix — seven samples against starch, sugar, protein and fat — where each cell ticks only from a definitive observation. The masked sample’s row starts blank so the deduction is genuinely yours; re-running a sloppy test properly fills the gap.',
        'The Observations tab also plots your Benedict’s results as colour grade against seconds of heating, turning the qualitative bench quietly quantitative: weak sugars plateau low even at full heat, while concentrated glucose climbs to grade four. When you finally name the mystery food, you are effectively defending an argument from evidence you generated yourself — the same habit that makes a food test meaningful in any real kitchen or laboratory.',
      ],
    },
    {
      h2: 'Technique, honest errors and who this is for',
      body: [
        'This bench models the classic sources of error instead of hiding them. Reading a colour before it settles, running a second reagent on a tube that was never rinsed, skipping the bath trip for Benedict’s, or forgetting the shake before an emulsion pour — each one leaves a visible, honest trace in your data rather than a silent wrong answer. The coach bar points at the technique, the mentor walks you through the full panel, and five badges reward real milestones: first positive, patient heater, full reagent panel, complete matrix and the solved mystery.',
        'The lab is built for anyone meeting food tests for the first time as well as learners revising the four classic procedures. It runs entirely in the browser on a phone, tablet or desktop — every control is sized for touch, the drag gestures work with a finger or a mouse, and Space or Enter performs the next sensible step for keyboard users. No downloads, no setup, just a bench that answers honestly.',
      ],
    },
  ],
  faq: [
    {
      q: 'What colour does Benedict’s reagent turn with sugar?',
      a: 'With a reducing sugar and enough heat, Benedict’s steps from its original blue to green (trace), yellow (weak), orange (moderate) and finally brick-red with a precipitate (concentrated). Without sugar — or without the hot water bath — it simply stays blue. In this lab you drag the tube into the bath and hold about thirty simulated seconds to see the full scale.',
    },
    {
      q: 'How do I test a food for starch with iodine?',
      a: 'Load a sample into the test tube, drag the iodine bottle over the mouth to pour, and watch: blue-black means starch is present, while orange-brown (the colour of iodine itself) means none. Potato and bread turn blue-black; glucose solution, egg white and cooking oil do not.',
    },
    {
      q: 'Why did my ethanol test stay clear even though fat was present?',
      a: 'The fat must first dissolve into the ethanol, and that needs a firm shake. Drag the tube side-to-side (or press “Shake the tube”) until the mixture turns opalescent, then pour it into the water beaker — only then does the cloudy white emulsion form. An unshaken pour gives a faint wisp that the bench records as inconclusive, not negative.',
    },
    {
      q: 'Can I use this food test virtual lab on my phone?',
      a: 'Yes. The bench is touch-first: jars, bottles and the tube are all dragged with a finger, targets are comfortably large, and the layout reflows for narrow screens. A mouse and keyboard work just as well on desktop, with Space or Enter performing the next sensible step.',
    },
    {
      q: 'How does the mystery sample work?',
      a: 'Each session the bench secretly picks one of four foods — honey (heavy reducing sugar), rice water (starch), sunflower-seed extract (fat) or lean-meat broth (protein) — and masks its jar. Its matrix row fills only from colours you produce. When you pick a chip in Observations, a wrong answer earns coaching about the tests you skipped or under-read; a right answer earns the milestone. Resetting the bench deals a fresh mystery.',
    },
  ],
};
