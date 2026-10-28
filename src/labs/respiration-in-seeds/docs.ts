import type { DocsContent } from '../../engine/types';

/**
 * SEO guide page for the respiration-in-seeds lab (Experiment 035).
 * Written for anyone meeting respiration for the first time — no assumed
 * background, no coursework references.
 */
export const seedRespirationDocs: DocsContent = {
  h1: 'Respiration in Germinating Seeds Virtual Lab — Do Seeds Breathe Out CO₂?',
  intro: 'Two flasks of soaked bean seeds sit side by side, each bubbling its air through a vial of lime water. One flask holds living, germinating seeds; the other holds seeds you boil yourself over a Bunsen burner. Start the single air pump and watch one vial turn milky while the other stays crystal clear — the cleanest possible answer to the question “do seeds respire?”. This free respiration virtual lab runs entirely in your browser, with a simulated stopwatch, live thermometers and honest, noisy data you record yourself.',
  sections: [
    {
      h2: 'What you do in the germinating seeds CO₂ experiment',
      body: [
        'The bench gives you two conical flasks. Flask A arrives loaded with soaked, sprouting bean seeds — alive and busy. Flask B starts with a second living batch, and your first job is to turn it into a proper control: light the Bunsen burner, drag the flask onto the tripod above the blue flame, and hold it there for about thirty simulated seconds until the seeds visibly cook. Then cool the flask under the running tap before returning it to its stand, because boiled glassware stays hot for a long time.',
        'With your dead control prepared, you tap the aquarium-style air pump at the centre of the bench. It pushes one slow, steady stream of air through both flasks — the same flow on both sides, which is what makes the comparison fair. The air leaves each flask through a delivery tube that dips into a vial of lime water, bubbling steadily. From that moment the experiment simply runs: you watch, time and record.',
        'Everything is a real gesture. You drag flasks with your finger or mouse, tap the burner and the pump directly in the scene, and can even drop a bag of dry dormant seeds into a flask, or park flask A inside the fridge, to test what temperature and water do to respiration. Buttons and keyboard shortcuts duplicate every move if you prefer them, and playback speeds up to ×8 so the slow chemistry never bores you.',
      ],
      bullets: [
        'Boil the control seeds yourself — light the Bunsen, hold flask B over the flame ~30 s, cool under the tap.',
        'One air pump, two tubes: identical airflow through both flasks (the fair test).',
        'Lime water detects carbon dioxide: clear means no CO₂, milky means CO₂ arrived.',
        'Record readings any time — cloudiness and temperature are banked from live values.',
        'Explore more: fridge-cold seeds (≈×6 slower) and dry dormant seeds (no respiration at all).',
      ],
    },
    {
      h2: 'The limewater test for carbon dioxide, explained',
      body: [
        'Lime water is a saturated solution of calcium hydroxide. It looks like plain water, but when carbon dioxide bubbles through it, the gas reacts to form calcium carbonate — a fine, white, insoluble solid that stays suspended and turns the whole liquid milky. Bubble ordinary air through a second vial and nothing happens, because the tiny fraction of CO₂ in fresh air is not enough to precipitate a visible cloud.',
        'That asymmetry is exactly why the limewater test for carbon dioxide works so well in this experiment. Air that has merely passed through a flask of dead seeds comes out essentially unchanged, so vial B stays crystal clear. Air that has passed through living, germinating seeds comes out enriched with the carbon dioxide those cells produced, and the vial clouds steadily over sixty to ninety simulated seconds.',
        'In the virtual lab the cloudiness is honest chemistry kinetics: it follows a saturating curve with a time constant of about forty simulated seconds, plus measurement noise, and the percentage cloudiness is read live from the vial. If you rinse the vials and refill them with fresh lime water, the milky suspension resets — just like rinsing real glassware — and you can run comparison after comparison without ever waiting for a delivery of chemicals.',
      ],
    },
    {
      h2: 'Do seeds respire? What the two flasks prove',
      body: [
        'Respiration is the quiet, universal chemistry of living cells: sugar and oxygen are broken down to release the energy that keeps cells working, and carbon dioxide with water are what is left over. A seed may look lifeless, but once it soaks up water and begins to germinate, its cells switch on energetically — they need energy to split the seed coat and push out the first root. That is why germinating seeds make such a vivid demonstration: lots of living cells, all respiring at once.',
        'The two-flask comparison turns that into evidence. The only difference between flask A and flask B is life: same seeds, same airflow, same lime water. If only the living flask clouds its vial, the carbon dioxide must come from the living cells — seeds respire. If the boiled flask also stayed cloudy, or neither did, the conclusion would be different, and the lab lets you test both cases: skip the boiling and both vials cloud, because unboiled control seeds are still alive.',
        'The conclusion card in the Observations tab asks you to commit to an answer. A wrong choice does not scold you — it points straight at your own recorded cloudiness numbers and asks where the CO₂ could have come from. Getting it right earns the milestone, and the evidence-based reasoning is the part that sticks.',
      ],
      bullets: [
        'Respiration: C₆H₁₂O₆ + 6 O₂ → 6 CO₂ + 6 H₂O + energy.',
        'Germinating seeds respire briskly — growth is energy-hungry work.',
        'Boiling kills cells (enzymes denature), so boiled seeds release no CO₂ — the control.',
        'Dry dormant seeds barely respire: enzymes need water to work.',
        'Cold slows respiration roughly ×2.5 per 10 °C — fridge seeds cloud their vial ~6× slower.',
      ],
    },
    {
      h2: 'Reading the thermometers: respiration releases heat',
      body: [
        'Each flask wears a thermometer probe in its cotton plug, and the readouts carry honest ±0.1 °C measurement jitter so you practise reading real instruments, not ideal ones. Watch the live values and a pattern emerges: the germinating flask settles around one degree above room temperature, while the boiled control tracks the room exactly, moving only as it cools after its bath.',
        'The gap is small because respiration in seeds is a slow burn, but it is real — a heap of respiring seeds in a silo can genuinely warm itself. In the lab the metabolic heat settles near 1.2 °C above room for healthy germinating seeds, scales down as their temperature falls, and vanishes entirely for dead or dormant seeds. The temperature trace chart in the Observations tab plots both flasks against room temperature, plus a zoomed close-up where the one-degree gap is easy to see.',
        'Recording a reading banks both flasks’ cloudiness and temperature at that instant. If the heat gap in your recorded row reaches 0.6 °C or more, you have captured the thermal fingerprint of respiration — evidence that the energy released by the reaction is partly escaping as heat, exactly as the equation promises.',
      ],
    },
    {
      h2: 'Controls, variables and the fair test',
      body: [
        'Good comparisons live and die by their controls. Here the fair test is built into the apparatus: a single pump drives the same airflow through both flasks, both vials hold the same lime water, and both seed batches started identical. Change one thing at a time — life, temperature or water — and the vials tell you which variable mattered.',
        'The lab rewards that discipline with badges: starting the shared airflow earns the fair-test badge, keeping the control vial clear through a full run earns the clear-control badge, and logging the heat gap earns the heat-seeker badge. If you start the pump before boiling flask B, you will see the honest consequence — the control vial clouds too, because unboiled seeds are still alive — and the mentor will nudge you back.',
        'Beyond the main comparison, two extension conditions are worth exploring. Chilling flask A in the fridge slows its respiration to about a sixth, so the milky cloud builds six times more slowly — a visible lesson in how temperature controls enzyme speed. Swapping in the bag of dry dormant seeds stops clouding altogether, no matter how long the air flows, because without water the seeds cannot germinate and their enzymes cannot work.',
      ],
    },
    {
      h2: 'Accuracy, honest errors and working like a careful scientist',
      body: [
        'Every number in this lab is a measurement, and measurements wobble. The cloudiness readout carries a percent-or-so of noise, the thermometer readouts jitter by about a tenth of a degree, and the milky endpoint is a judgement call — around ten percent cloudiness is where a human eye first notices the change. Recording several readings a little apart in time and reading the trend, not one instant, is the professional habit to build.',
        'The classic errors are yours to make safely. A control that was never boiled makes both vials cloudy. A flask left cooling too briefly keeps the thermometer reading high, exaggerating the apparent gap. Turning the pump off pauses the delivery of CO₂ to the vials, freezing the cloudiness — useful for pausing a demonstration, misleading if you forget you did it. The coach bar comments on your actual bench state, so mistakes come with an explanation rather than a verdict.',
        'For revision, the whole experiment compresses into one sentence: identical apparatus, one difference — life — and the living side alone turned lime water milky and ran a degree warm. If you can explain both observations with the word equation for respiration, you can explain this experiment.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I boil the seeds in the respiration virtual lab?',
      a: 'Press “Light the Bunsen” (or tap the burner in the scene), then drag flask B onto the tripod above the flame. Hold it there until the seeds visibly darken — about 30 simulated seconds, with a live “boil progress” percentage in the readouts. Then drag the flask under the tap on the right to cool it below 30 °C before returning it to its stand. The buttons “Set flask B on the tripod” and “Cool flask B under the tap” do the same moves, and pressing Space or Enter on the canvas advances the next sensible step.',
    },
    {
      q: 'Why does lime water turn milky?',
      a: 'Lime water is calcium hydroxide solution. Carbon dioxide bubbling through it reacts to form calcium carbonate, a fine white solid that stays suspended and clouds the whole vial. That is the standard limewater test for carbon dioxide: milky means CO₂ is present; a vial that stays clear proves no extra CO₂ arrived. In this lab the cloudiness follows real saturating kinetics, gradually building rather than snapping on.',
    },
    {
      q: 'Do boiled seeds respire at all?',
      a: 'No. Boiling kills the seeds’ cells by destroying their enzymes, and dead cells cannot carry out respiration — no oxygen is used and no carbon dioxide is released. That is why the boiled flask is the control: its vial stays crystal clear even though the same air flows through it. If you forget to boil it, you will see its vial cloud too, because those seeds are still alive.',
    },
    {
      q: 'Why is the temperature difference between the flasks so small?',
      a: 'Respiration releases energy, but seeds burn sugar slowly — nothing like a flame. A heap of germinating seeds typically runs about one degree above the surrounding air; that is the honest size of the effect, and the lab models it faithfully (about 1.2 °C at full metabolic rate). The Observations tab includes a zoomed temperature chart spanning 20.5–25.5 °C so the gap is easy to read, and the thermometer readouts carry ±0.1 °C jitter like real instruments.',
    },
    {
      q: 'Can I use this germinating seeds CO₂ experiment on my phone?',
      a: 'Yes. The lab is pure client-side HTML canvas — no install, no plugins — and works on phones, tablets and desktops. Every gesture has a touch-sized target: drag flasks with a finger, tap the burner and pump directly, and use the duplicate buttons for anything fiddly. The layout rescales to narrow screens, and a playback speed control (1× to 8×) shortens the slower waits.',
    },
  ],
};
