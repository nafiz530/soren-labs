import type { DocsContent } from '../../engine/types';

export const germinationDocs: DocsContent = {
  h1: 'Seed Germination Virtual Lab — What Seeds Really Need to Sprout',
  intro:
    'Six petri dishes sit on a sunny bench: one perfectly moist control, one bone-dry, one drowned under an oil-sealed lid, one in the fridge, one flooded with the lid off, and one hidden under a dark hood. You set the day/night clock running, watch beans swell and split and sprout in honest time-lapse, record the germinated count day by day, and finish by dissecting a magnified seed to name the radicle and plumule yourself. This is the classic seed germination experiment online — rebuilt so the timing is real, the seeds behave individually, and the light myth gets busted by your own data.',
  sections: [
    {
      h2: 'What you will do in the seed germination virtual lab',
      body: [
        'The lab opens with a classic comparison already laid out across six dishes. Each dish holds ten bean seeds on paper. Before the clock starts you can change any condition with real actions: hold the watering can over a dish to pour (dry paper becomes moist, moist becomes standing water), tap the air chips to drop a sealed lid with an oil film over the water, drag a dish into the drawn fridge compartment to chill it to 5 °C, or pop a dark hood over a dish to shut out the light entirely.',
        'Then you set the clock running. One simulated day passes in about ten seconds at 1× playback, and you can speed up to 4× or 16× once the first swelling appears. The window in the scene shows the sun travelling through a genuine day/night cycle — and the seeds keep germinating straight through the dark, which is the first hint at the myth this lab exists to bust.',
        'As the days pass you tap any dish to open a magnified seed dissection, record the germinated count for all six dishes with the “Record day” button, and build a six-series germination curve. The experiment ends with a conclusion card that asks the one question the whole bench was built to answer: what do seeds actually need to germinate?',
      ],
    },
    {
      h2: 'What seeds need to germinate — and the light myth',
      body: [
        'Three factors do the work in every honest germination experiment: water, air (specifically oxygen) and warmth. Water is the trigger — a dry seed is alive but paused, sometimes for years, because without water its enzymes cannot dissolve and mobilise the food stored in its cotyledons. Oxygen feeds respiration, the process that turns that food into usable energy for the embryo to grow. Warmth sets the speed of every enzyme-driven reaction, which is why the fridge dish crawls along at roughly one sixth of the bench pace.',
        'Light is the myth, and this lab lets you bust it with your own numbers. The dark dish sits under a hood with everything else perfect — and it germinates just as fast and just as completely as the control. Tap the hood to peek if you want to watch it happen. Seeds simply do not need light to germinate: in the wild a seed is usually buried in soil, in complete darkness, and it germinates anyway. Light only becomes essential later, once the first leaves unfold and photosynthesis begins.',
        'Standing water is the subtle case that catches many people out. The flooded dish with its lid off has plenty of water — but water crowds out oxygen, so only about half the seeds manage a slow, weak germination. That is exactly why the moist-paper control, which offers both water and air in generous supply, is the control.',
      ],
      bullets: [
        'Water — starts imbibition and switches on the enzymes that unlock the food store',
        'Air (oxygen) — fuels respiration; sealed seeds swell, then rot',
        'Warmth — sets the enzyme pace; 5 °C is about six times slower than 25 °C',
        'Light — not needed for germination; the dark dish sprouts normally',
        'A seed counts as germinated once its radicle (baby root) is visible, about 2 mm',
      ],
    },
    {
      h2: 'Radicle and plumule: reading the sprout',
      body: [
        'The first structure to break through the seed coat is always the radicle — the baby root. It emerges from the hilum side of the bean and grows downward no matter how the seed lies, because roots sense gravity (a behaviour called gravitropism). In the lab you can watch each radicle lengthen, thicken and sprout root hairs while the clock runs. When you record a day, a seed is counted as germinated once its radicle is visible at around two millimetres — that is the standard botanists use, and it is why germination is measured before any shoot appears.',
        'Only after the root is established does the plumule — the baby shoot — curve upward and unfold its first green leaves, while the two cotyledons ride up like a packed lunch. Tap any dish in the scene to open the magnified dissection and see the whole plan laid out: the testa (the coat), the two cotyledons (the food store), and the tiny embryo curled between them with the radicle at one end and the plumule at the other. Hover the label chips to light each part up.',
        'Learning to name these parts turns a blurry sprout into a story with a cast. The seed coat splits, the root anchors and draws water, the shoot reaches for light it does not yet need, and the cotyledons quietly pay for it all until the first leaves can photosynthesise.',
      ],
    },
    {
      h2: 'Seed structure dissection — what you are looking at',
      body: [
        'A bean is a near-perfect teaching object because almost everything is visible to the naked eye. The testa is the thin, tough coat that protects the embryo and controls water entry through its micropyle and hilum scar. Soak it and the testa wrinkles, swells and finally splits — the moment you look for in dish 1 around day one or two. Inside, the two cotyledons make up almost all of the seed&apos;s bulk, stuffed with starch and protein for the embryo to spend on its first week of life.',
        'The embryo itself is small and easy to miss until someone points at it, which is exactly what the hover-highlighted dissection view does. Its radicle end sits at the hilum; its plumule end nestles between the cotyledons. Once you can find the embryo in a split bean, every later stage in the dishes makes instant sense: the radicle becomes the root system, the plumule becomes stem and leaves, and the cotyledons wither once their food store is spent.',
        'Because the dissection view is drawn from the same simulation that grows the dish, the magnified “live seed” on the left shows the actual current stage of the most-developed seed in that dish — swelling, split, rooted or leafed — while the cutaway on the right shows the timeless anatomy.',
      ],
    },
    {
      h2: 'Recording honest data and reading your curves',
      body: [
        'Germination experiments are counting experiments, and counting has rules. A seed is scored once its radicle is visible — not when it swells, not when it is merely soaked, and not once leaves appear. The lab applies that rule automatically: each recorded day banks the count of seeds whose radicle has broken through, for all six dishes at once, into your observation table.',
        'Record early and often. A day-one row of zeros is not empty data; it is your baseline, and curves that start honestly at zero are the ones worth trusting. Three or more different days give the germination-curve chart its shape: percentage germinated against day, one line per dish, with the live day plotted as an open marker so you can see where you are heading. The flat line at zero for the dry dish is as informative as the steep rise of the control — a flat line is a result.',
        'Alongside the curves, a water-comparison plot isolates one variable at a time: dry, moist and flooded-open dishes that differ in nothing but water. Notice how the moist point sits on top while the flooded point droops — standing water buys hydration at the cost of oxygen. Reading a graph where you collected every point yourself is the whole point of the exercise.',
      ],
    },
    {
      h2: 'Where germination goes wrong — and why that is useful',
      body: [
        'Every “failed” dish on the bench is deliberate evidence. The dry dish holds dormant, wrinkled seeds that stay alive but paused — add water at any time, even mid-experiment, and they wake up, which is one of the most satisfying things to try. The oil-sealed dish shows the oxygen story in three acts: seeds swell normally for a day or two, then stall, then grey-brown fuzz of rot and anaerobic decay spreads across them. The fridge dish never fails — it just runs at about one sixth speed, teaching that cold delays rather than prevents.',
        'The flooded dish with the lid open splits the difference: roughly half the seeds manage a slow, feeble germination while the rest sit waterlogged and eventually spoil, because a water film resists the diffusion of oxygen. Comparing it with the oil-sealed dish sharpens the distinction between “some air” and “no air”.',
        'For anyone meeting germination for the first time, these failures are the fastest teachers. Watching a control dish race ahead while a dry dish does absolutely nothing for a week makes the role of water unforgettable — far more than any list of requirements read aloud.',
      ],
    },
  ],
  faq: [
    {
      q: 'Do seeds need light to germinate?',
      a: 'Most do not. In this lab the dark-hooded dish has ideal water, air and warmth, and it germinates just as well as the control — check its curve in Observations. Seeds are usually buried in soil, in complete darkness, so germination evolved to ignore light. Light becomes important after germination, when the first leaves unfold and start photosynthesising.',
    },
    {
      q: 'What counts as a seed having germinated?',
      a: 'The standard rule is the visible radicle: once the baby root has broken through the seed coat and reached about two millimetres, the seed is scored as germinated. Swelling and splitting do not count on their own — they are preparation, not germination. The lab applies this rule automatically when you record a day.',
    },
    {
      q: 'Why did the oil-sealed seeds swell and then rot?',
      a: 'Water still gets in, so imbibition happens and the seeds fatten normally. But the oil film blocks oxygen from the water, and without oxygen the embryo cannot respire — there is no energy to grow. After a couple of wet days, fungi and anaerobic decay take over, which you see as grey-brown fuzz. That rot is your evidence that air is a genuine germination requirement.',
    },
    {
      q: 'How fast does the virtual experiment run?',
      a: 'One simulated day passes in about ten seconds at 1× playback, and you can switch to 4× or 16× in the toolbar. The control dish shows its first radicles around day two to three, and the first true leaves arrive a few days later. All timings are stochastic and condition-driven — every seed has its own thresholds, so no two runs are identical.',
    },
    {
      q: 'Can I use this germination experiment online on my phone?',
      a: 'Yes. The lab runs entirely in the browser — no downloads, no accounts — and the controls are built for touch: hold the watering can over a dish, drag dishes into the fridge, and tap a dish to open the dissection. Every button and chip is at least a comfortable finger-target in size, and the layout reflows for narrow screens.',
    },
    {
      q: 'Can I change a dish mid-experiment?',
      a: 'Absolutely — that is the honest part of the model. Water a dry dish on day five and those dormant seeds start imbibition from that moment. Move a dish into the fridge mid-run and everything slows by about six times. Conditions are read live by the simulation, so late changes have exactly the consequences you would expect.',
    },
  ],
};
