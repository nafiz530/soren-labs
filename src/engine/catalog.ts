import type { LabMeta } from './types';

/**
 * The Soren Labs catalog — every planned and live experiment.
 *
 * Rules:
 *  - Labs are tagged by subject and difficulty tier ONLY. Never by class,
 *    grade or exam board anywhere in the public site.
 *  - experimentNo continues the sequence started by the titration lab (001).
 *  - `status: 'live'` labs are importable from src/labs/{slug}; roadmap labs
 *    appear on the homepage roadmap until they are built.
 */

const titration: LabMeta = {
  slug: 'titration',
  docsSlug: 'acid-base-titration-virtual-lab',
  title: 'Acid–base titration',
  subject: 'Chemistry',
  tier: 'Master',
  tagline: 'Hold the stopcock open, swirl the flask and catch the faint pink endpoint with your own hands.',
  status: 'live',
  experimentNo: 1,
  seo: {
    title: 'Acid–Base Titration Virtual Lab — Interactive Titration Simulator',
    description:
      'Run a full acid–base titration online: hold the stopcock, swirl the flask, watch the pH curve and catch the phenolphthalein endpoint. Free interactive chemistry lab with guided steps and live sound.',
    keywords: ['acid base titration virtual lab', 'titration simulator online', 'phenolphthalein endpoint experiment', 'interactive chemistry lab', 'ph curve titration'],
  },
};

const physics: LabMeta[] = [
  {
    slug: 'pendulum',
    docsSlug: 'simple-pendulum-virtual-lab',
    title: 'Simple pendulum',
    subject: 'Physics',
    tier: 'Master',
    tagline: 'Drag the bob aside, time twenty full swings and measure the pull of gravity with a stopwatch.',
    status: 'live',
    experimentNo: 2,
    seo: {
      title: 'Simple Pendulum Virtual Lab — Measure Gravity g Online',
      description:
        'Interactive simple pendulum experiment: adjust the string length, release the bob, time 20 oscillations and plot T² versus L to measure g. Free physics lab simulation with stopwatch, mentor and sound.',
      keywords: ['simple pendulum virtual lab', 'pendulum experiment online', 'measure g pendulum simulation', 'T square vs L graph', 'physics lab simulator'],
    },
  },
  {
    slug: 'hookes-law-spring',
    docsSlug: 'hookes-law-spring-virtual-lab',
    title: "Hooke's law spring",
    subject: 'Physics',
    tier: 'Builder',
    tagline: 'Load a spring mass by mass, watch it stretch and read the spring constant straight off your own graph.',
    status: 'live',
    experimentNo: 3,
    seo: {
      title: "Hooke's Law Virtual Lab — Spring Constant Experiment Online",
      description:
        "Load masses onto a virtual spring, record extension and plot force versus extension to find the spring constant. Interactive Hooke's law simulation with live ruler, data table and mentor guidance.",
      keywords: ["hooke's law virtual lab", 'spring constant experiment online', 'force extension graph simulator', 'elastic limit simulation', 'physics spring lab'],
    },
  },
  {
    slug: 'ohms-law',
    docsSlug: 'ohms-law-virtual-lab',
    title: "Ohm's law bench",
    subject: 'Physics',
    tier: 'Builder',
    tagline: 'Slide the rheostat, read real meters and let the V–I line reveal the resistance for yourself.',
    status: 'live',
    experimentNo: 4,
    seo: {
      title: "Ohm's Law Virtual Lab — Voltage Current Resistance Simulator",
      description:
        "Build a live circuit, adjust a rheostat and record ammeter & voltmeter readings to verify Ohm's law. Free interactive V–I graph simulator with meters that respond to your own hands.",
      keywords: ["ohm's law virtual lab", 'voltage current graph simulator', 'rheostat experiment online', 'ammeter voltmeter simulation', 'resistance measurement virtual'],
    },
  },
  {
    slug: 'series-parallel-circuits',
    docsSlug: 'series-and-parallel-resistance-virtual-lab',
    title: 'Series & parallel resistance',
    subject: 'Physics',
    tier: 'Builder',
    tagline: 'Rewire the same resistors both ways and prove the combined-resistance formulas with your meters.',
    status: 'live',
    experimentNo: 5,
    seo: {
      title: 'Series and Parallel Resistance Virtual Lab — Circuit Simulator',
      description:
        'Switch resistors between series and parallel wiring, watch the meters change and verify the combined resistance formulas interactively. Free online circuit experiment for beginners.',
      keywords: ['series parallel circuit virtual lab', 'combined resistance simulator', 'equivalent resistance experiment', 'circuit builder online free'],
    },
  },
  {
    slug: 'refraction-glass-slab',
    docsSlug: 'refraction-of-light-glass-slab-virtual-lab',
    title: 'Refraction & Snell\u2019s law',
    subject: 'Physics',
    tier: 'Master',
    tagline: 'Steer light pins through a glass slab, measure both angles and hunt for the refractive index.',
    status: 'live',
    experimentNo: 6,
    seo: {
      title: 'Refraction of Light Virtual Lab — Glass Slab & Snell\u2019s Law',
      description:
        'Aim a light ray through a virtual glass slab, read incident and refraction angles off a live protractor and compute the refractive index with Snell\u2019s law. Interactive optics experiment online.',
      keywords: ['refraction virtual lab', 'glass slab experiment online', 'snells law simulator', 'refractive index experiment', 'light ray optics simulation'],
    },
  },
  {
    slug: 'convex-lens-bench',
    docsSlug: 'convex-lens-focal-length-virtual-lab',
    title: 'Convex lens bench',
    subject: 'Physics',
    tier: 'Master',
    tagline: 'Slide the object along an optical bench until the image is razor sharp, then graph your way to f.',
    status: 'live',
    experimentNo: 7,
    seo: {
      title: 'Convex Lens Virtual Lab — Focal Length by u–v Method',
      description:
        'Move an object along a virtual optical bench, focus a real image on the screen and plot 1/v against 1/u to find the focal length. Interactive lens experiment with live ray diagrams.',
      keywords: ['convex lens virtual lab', 'focal length experiment online', 'u v method simulation', 'lens formula simulator', 'optical bench virtual'],
    },
  },
  {
    slug: 'density-archimedes',
    docsSlug: 'density-and-archimedes-principle-virtual-lab',
    title: 'Density & Archimedes',
    subject: 'Physics',
    tier: 'Builder',
    tagline: 'Weigh solids in air and water, catch the overflow and feel buoyancy balance the numbers.',
    status: 'live',
    experimentNo: 8,
    seo: {
      title: 'Density & Archimedes Principle Virtual Lab — Buoyancy Experiment',
      description:
        'Measure density with a balance and an overflow can: weigh solids in air and in water, collect displaced liquid and verify Archimedes\u2019 principle interactively.',
      keywords: ['archimedes principle virtual lab', 'density measurement simulation', 'buoyancy experiment online', 'overflow can simulator', 'upthrust virtual lab'],
    },
  },
  {
    slug: 'specific-heat',
    docsSlug: 'specific-heat-capacity-virtual-lab',
    title: 'Specific heat of a metal',
    subject: 'Physics',
    tier: 'Master',
    tagline: 'Drop a hot metal block into cool water and read its specific heat capacity from the mixing curve.',
    status: 'live',
    experimentNo: 9,
    seo: {
      title: 'Specific Heat Capacity Virtual Lab — Calorimeter Experiment',
      description:
        'Heat a metal block, plunge it into a stirred calorimeter and watch the temperature-time mixing curve to find specific heat capacity. Interactive method of mixtures simulation.',
      keywords: ['specific heat capacity virtual lab', 'calorimeter simulation online', 'method of mixtures experiment', 'heat transfer virtual experiment'],
    },
  },
  {
    slug: 'heating-curve',
    docsSlug: 'heating-curve-of-water-virtual-lab',
    title: 'Heating curve of ice',
    subject: 'Physics',
    tier: 'Builder',
    tagline: 'Heat ice all the way to steam and let the plateaus show you where latent heat hides.',
    status: 'live',
    experimentNo: 10,
    seo: {
      title: 'Heating Curve of Water Virtual Lab — States of Matter Graph',
      description:
        'Heat ice into water and steam while a live thermometer plots the heating curve. See melting and boiling plateaus and latent heat in an interactive state-change experiment.',
      keywords: ['heating curve virtual lab', 'latent heat simulation', 'melting boiling point experiment online', 'states of matter graph', 'cooling curve simulator'],
    },
  },
  {
    slug: 'resonance-tube',
    docsSlug: 'resonance-tube-speed-of-sound-virtual-lab',
    title: 'Resonance tube',
    subject: 'Physics',
    tier: 'Master',
    tagline: 'Strike a tuning fork, hunt the water level where the tube sings and compute the speed of sound.',
    status: 'live',
    experimentNo: 11,
    seo: {
      title: 'Resonance Tube Virtual Lab — Speed of Sound Experiment',
      description:
        'Strike virtual tuning forks above an adjustable water column, find resonance lengths and calculate the speed of sound in air. Interactive acoustics experiment with real wave visuals.',
      keywords: ['resonance tube virtual lab', 'speed of sound experiment online', 'tuning fork simulation', 'acoustic resonance simulator'],
    },
  },
  {
    slug: 'magnetic-field-mapping',
    docsSlug: 'magnetic-field-lines-bar-magnet-virtual-lab',
    title: 'Magnetic field mapping',
    subject: 'Physics',
    tier: 'Explorer',
    tagline: 'Carry a compass around bar magnets and trace the invisible field lines with your own hand.',
    status: 'live',
    experimentNo: 12,
    seo: {
      title: 'Magnetic Field Lines Virtual Lab — Bar Magnet Compass Mapper',
      description:
        'Drag a compass around bar magnets, watch the needle obey the field and trace magnetic field lines interactively. See poles attract, repel and neutral points form.',
      keywords: ['magnetic field lines virtual lab', 'bar magnet simulation', 'compass field mapping', 'magnetism experiment online'],
    },
  },
  {
    slug: 'electromagnetic-induction',
    docsSlug: 'electromagnetic-induction-virtual-lab',
    title: 'Electromagnetic induction',
    subject: 'Physics',
    tier: 'Master',
    tagline: 'Plunge a magnet through a coil and watch charge appear out of nowhere on the galvanometer.',
    status: 'live',
    experimentNo: 13,
    seo: {
      title: 'Electromagnetic Induction Virtual Lab — Faraday & Lenz Law',
      description:
        'Move a bar magnet through a coil and watch the galvanometer swing. Discover Faraday\u2019s law, Lenz\u2019s law and induction current direction in an interactive electromagnetic lab.',
      keywords: ['electromagnetic induction virtual lab', 'faraday law simulation', 'lenz law experiment online', 'galvanometer simulator', 'induced emf virtual'],
    },
  },
  {
    slug: 'diode-rectifier',
    docsSlug: 'semiconductor-diode-characteristics-virtual-lab',
    title: 'Diode & rectifier',
    subject: 'Physics',
    tier: 'Master',
    tagline: 'Bias a diode both ways, trace its I–V curve, then turn alternating current into pulsing direct current.',
    status: 'live',
    experimentNo: 14,
    seo: {
      title: 'Diode Characteristics Virtual Lab — Forward Bias & Rectifier',
      description:
        'Sweep a semiconductor diode through forward and reverse bias, plot the I–V curve and build a half-wave rectifier on an interactive electronics bench with a live oscilloscope.',
      keywords: ['diode virtual lab', 'iv characteristics diode simulation', 'half wave rectifier virtual', 'forward bias reverse bias experiment', 'semiconductor electronics lab'],
    },
  },
];

const chemistry: LabMeta[] = [
  { slug: 'ph-spectrum', docsSlug: 'ph-scale-indicator-virtual-lab', title: 'pH spectrum', subject: 'Chemistry', tier: 'Explorer', tagline: 'Test household solutions with universal indicator and build the full pH scale with your own hands.', status: 'roadmap', experimentNo: 15, seo: { title: 'pH Scale Virtual Lab', description: 'Test solutions with indicators and build the pH scale interactively.', keywords: ['ph virtual lab', 'indicator simulation'] } },
  { slug: 'reactivity-series', docsSlug: 'reactivity-series-of-metals-virtual-lab', title: 'Reactivity series', subject: 'Chemistry', tier: 'Builder', tagline: 'Drop metals into acid, rank the fizzing and discover the activity order of metals.', status: 'roadmap', experimentNo: 16, seo: { title: 'Reactivity Series Virtual Lab', description: 'Compare metal reactivity with acid in an interactive bench.', keywords: ['reactivity series virtual lab'] } },
  { slug: 'electrolysis-of-water', docsSlug: 'electrolysis-of-water-virtual-lab', title: 'Electrolysis of water', subject: 'Chemistry', tier: 'Master', tagline: 'Split water into hydrogen and oxygen and test each gas with a flame.', status: 'roadmap', experimentNo: 17, seo: { title: 'Electrolysis of Water Virtual Lab', description: 'Electrolyse water and test the product gases.', keywords: ['electrolysis virtual lab'] } },
  { slug: 'separation-methods', docsSlug: 'separation-of-mixtures-virtual-lab', title: 'Separation bench', subject: 'Chemistry', tier: 'Explorer', tagline: 'Filter, evaporate, distil and sublime your way through one mixture sandbox.', status: 'roadmap', experimentNo: 18, seo: { title: 'Separation of Mixtures Virtual Lab', description: 'Practise filtration, distillation and more.', keywords: ['separation techniques virtual lab'] } },
  { slug: 'ink-chromatography', docsSlug: 'ink-chromatography-virtual-lab', title: 'Ink chromatography', subject: 'Chemistry', tier: 'Builder', tagline: 'Race pigments up paper strips and calculate Rf values like a forensic chemist.', status: 'roadmap', experimentNo: 19, seo: { title: 'Chromatography Virtual Lab', description: 'Separate ink pigments and compute Rf values.', keywords: ['chromatography virtual lab'] } },
  { slug: 'co2-preparation-tests', docsSlug: 'carbon-dioxide-preparation-and-tests-virtual-lab', title: 'Make & test CO\u2082', subject: 'Chemistry', tier: 'Builder', tagline: 'Cook up carbon dioxide from marble and acid, then prove it with lime water.', status: 'roadmap', experimentNo: 20, seo: { title: 'CO2 Preparation Virtual Lab', description: 'Prepare and test carbon dioxide.', keywords: ['co2 preparation virtual lab'] } },
  { slug: 'ion-identification', docsSlug: 'cation-anion-identification-virtual-lab', title: 'Ion detective', subject: 'Chemistry', tier: 'Master', tagline: 'Flame colours and precipitates: identify unknown ions from their reactions.', status: 'roadmap', experimentNo: 21, seo: { title: 'Ion Identification Virtual Lab', description: 'Qualitative analysis with flame tests and wet tests.', keywords: ['qualitative analysis virtual lab'] } },
  { slug: 'rusting-conditions', docsSlug: 'rusting-of-iron-conditions-virtual-lab', title: 'Rusting conditions', subject: 'Chemistry', tier: 'Explorer', tagline: 'Leave iron nails in air, water and salt water — then watch time decide.', status: 'roadmap', experimentNo: 22, seo: { title: 'Rusting of Iron Virtual Lab', description: 'Discover the conditions iron needs to rust.', keywords: ['rusting virtual lab'] } },
  { slug: 'exothermic-endothermic', docsSlug: 'exothermic-and-endothermic-reactions-virtual-lab', title: 'Exothermic vs endothermic', subject: 'Chemistry', tier: 'Builder', tagline: 'Dissolve, dilute and neutralise while live thermometers rise and fall.', status: 'roadmap', experimentNo: 23, seo: { title: 'Exothermic Endothermic Virtual Lab', description: 'Feel reactions heat up and cool down.', keywords: ['exothermic virtual lab'] } },
  { slug: 'reaction-rate', docsSlug: 'rate-of-reaction-virtual-lab', title: 'Rate of reaction', subject: 'Chemistry', tier: 'Master', tagline: 'Vary concentration, temperature and surface area — then race the curves.', status: 'roadmap', experimentNo: 24, seo: { title: 'Rate of Reaction Virtual Lab', description: 'Investigate what speeds reactions up.', keywords: ['rate of reaction virtual lab'] } },
  { slug: 'copper-plating', docsSlug: 'copper-electroplating-virtual-lab', title: 'Copper plating', subject: 'Chemistry', tier: 'Master', tagline: 'Electroplate an iron nail and watch the pink copper deposit grow.', status: 'roadmap', experimentNo: 25, seo: { title: 'Electroplating Virtual Lab', description: 'Plate copper onto iron interactively.', keywords: ['electroplating virtual lab'] } },
  { slug: 'water-of-crystallization', docsSlug: 'water-of-crystallisation-copper-sulfate-virtual-lab', title: 'Water of crystallisation', subject: 'Chemistry', tier: 'Master', tagline: 'Bake blue copper sulfate to white dust — then bring the blue back.', status: 'roadmap', experimentNo: 26, seo: { title: 'Water of Crystallisation Virtual Lab', description: 'Heat and rehydrate copper sulfate.', keywords: ['copper sulfate virtual lab'] } },
  { slug: 'particle-model-diffusion', docsSlug: 'particle-model-and-diffusion-virtual-lab', title: 'Particles & diffusion', subject: 'Chemistry', tier: 'Explorer', tagline: 'Open a divider and watch gases mix themselves, one collision at a time.', status: 'roadmap', experimentNo: 27, seo: { title: 'Diffusion Virtual Lab', description: 'Particle simulation of diffusion.', keywords: ['diffusion virtual lab'] } },
];

const biology: LabMeta[] = [
  { slug: 'virtual-microscope', docsSlug: 'virtual-microscope-lab-onion-cheek-cells', title: 'Virtual microscope', subject: 'Biology', tier: 'Explorer', tagline: 'Turn real focus knobs and examine onion and cheek cell slides.', status: 'roadmap', experimentNo: 28, seo: { title: 'Virtual Microscope Lab', description: 'Focus and examine cell slides.', keywords: ['virtual microscope lab'] } },
  { slug: 'build-a-cell', docsSlug: 'plant-and-animal-cell-virtual-lab', title: 'Build-a-cell', subject: 'Biology', tier: 'Explorer', tagline: 'Drag organelles into place and label plant and animal cells.', status: 'roadmap', experimentNo: 29, seo: { title: 'Cell Structure Virtual Lab', description: 'Assemble and label cells.', keywords: ['cell virtual lab'] } },
  { slug: 'photosynthesis-starch-test', docsSlug: 'photosynthesis-starch-test-virtual-lab', title: 'Photosynthesis: starch test', subject: 'Biology', tier: 'Builder', tagline: 'Iodine on a variegated leaf reveals exactly where light made starch.', status: 'roadmap', experimentNo: 30, seo: { title: 'Photosynthesis Virtual Lab', description: 'Test leaves for starch.', keywords: ['photosynthesis virtual lab'] } },
  { slug: 'transpiration-potometer', docsSlug: 'transpiration-potometer-virtual-lab', title: 'Transpiration', subject: 'Biology', tier: 'Master', tagline: 'Race a potometer bubble under fan, mist and still air.', status: 'roadmap', experimentNo: 31, seo: { title: 'Transpiration Virtual Lab', description: 'Measure water loss in plants.', keywords: ['transpiration virtual lab'] } },
  { slug: 'seed-germination', docsSlug: 'seed-germination-virtual-lab', title: 'Seed germination', subject: 'Biology', tier: 'Explorer', tagline: 'Toggle water, air and warmth and time-lapse the sprouting.', status: 'roadmap', experimentNo: 32, seo: { title: 'Germination Virtual Lab', description: 'Find what seeds need to grow.', keywords: ['germination virtual lab'] } },
  { slug: 'osmosis-potato', docsSlug: 'osmosis-in-potato-cells-virtual-lab', title: 'Osmosis in potato', subject: 'Biology', tier: 'Builder', tagline: 'Bathe potato cylinders in salt solutions and weigh turgid against flaccid.', status: 'roadmap', experimentNo: 33, seo: { title: 'Osmosis Virtual Lab', description: 'Osmosis in potato tissue.', keywords: ['osmosis virtual lab'] } },
  { slug: 'food-tests', docsSlug: 'food-test-virtual-lab-benedicts-iodine', title: 'Food test kitchen', subject: 'Biology', tier: 'Builder', tagline: 'Benedict\u2019s, iodine, biuret and emulsion tests on real food samples.', status: 'roadmap', experimentNo: 34, seo: { title: 'Food Tests Virtual Lab', description: 'Test foods for nutrients.', keywords: ['food test virtual lab'] } },
  { slug: 'respiration-in-seeds', docsSlug: 'respiration-in-germinating-seeds-virtual-lab', title: 'Respiration in seeds', subject: 'Biology', tier: 'Builder', tagline: 'Germinating versus boiled seeds — which one breathes out CO\u2082?', status: 'roadmap', experimentNo: 35, seo: { title: 'Respiration Virtual Lab', description: 'CO2 from germinating seeds.', keywords: ['respiration virtual lab'] } },
  { slug: 'dna-model', docsSlug: 'dna-structure-and-replication-virtual-lab', title: 'DNA double helix', subject: 'Biology', tier: 'Master', tagline: 'Assemble nucleotides with base-pairing rules, then unzip and replicate.', status: 'roadmap', experimentNo: 36, seo: { title: 'DNA Virtual Lab', description: 'Build and replicate DNA.', keywords: ['dna virtual lab'] } },
  { slug: 'heart-blood-flow', docsSlug: 'heart-structure-and-blood-flow-virtual-lab', title: 'Journey of blood', subject: 'Biology', tier: 'Builder', tagline: 'Trace blood through four chambers and valves, with heart sounds.', status: 'roadmap', experimentNo: 37, seo: { title: 'Heart Virtual Lab', description: 'Follow blood through the heart.', keywords: ['heart virtual lab'] } },
  { slug: 'digestion-journey', docsSlug: 'digestive-system-virtual-lab', title: 'Digestion journey', subject: 'Biology', tier: 'Builder', tagline: 'Follow food from mouth to intestine, adding enzymes along the way.', status: 'roadmap', experimentNo: 38, seo: { title: 'Digestion Virtual Lab', description: 'Travel the digestive system.', keywords: ['digestion virtual lab'] } },
];

const integrated: LabMeta[] = [
  { slug: 'states-of-matter', docsSlug: 'states-of-matter-particle-virtual-lab', title: 'States of matter machine', subject: 'Integrated Science', tier: 'Explorer', tagline: 'Heat and cool a particle box until solid, liquid and gas reveal themselves.', status: 'roadmap', experimentNo: 39, seo: { title: 'States of Matter Virtual Lab', description: 'Particle model of states.', keywords: ['states of matter virtual lab'] } },
  { slug: 'water-cycle', docsSlug: 'water-cycle-virtual-lab', title: 'Water cycle machine', subject: 'Integrated Science', tier: 'Explorer', tagline: 'Drive sun, sea and wind until it rains on your own landscape.', status: 'roadmap', experimentNo: 40, seo: { title: 'Water Cycle Virtual Lab', description: 'Make it rain.', keywords: ['water cycle virtual lab'] } },
  { slug: 'circuit-playground', docsSlug: 'simple-circuits-virtual-lab', title: 'Circuit playground', subject: 'Integrated Science', tier: 'Explorer', tagline: 'Batteries, bulbs, switches and fuses — build circuits that glow.', status: 'roadmap', experimentNo: 41, seo: { title: 'Simple Circuits Virtual Lab', description: 'Build bulb circuits.', keywords: ['circuit virtual lab'] } },
  { slug: 'light-and-shadows', docsSlug: 'light-and-shadows-virtual-lab', title: 'Light & shadow lab', subject: 'Integrated Science', tier: 'Explorer', tagline: 'Pinhole cameras, mirrors and shadows you can stretch with distance.', status: 'roadmap', experimentNo: 42, seo: { title: 'Light and Shadows Virtual Lab', description: 'Play with light.', keywords: ['light shadow virtual lab'] } },
  { slug: 'air-pressure', docsSlug: 'air-pressure-experiments-virtual-lab', title: 'Air pressure show', subject: 'Integrated Science', tier: 'Explorer', tagline: 'Crush a can and run a fountain with nothing but air.', status: 'roadmap', experimentNo: 43, seo: { title: 'Air Pressure Virtual Lab', description: 'Atmospheric pressure demos.', keywords: ['air pressure virtual lab'] } },
  { slug: 'simple-machines', docsSlug: 'simple-machines-lever-pulley-virtual-lab', title: 'Simple machines workshop', subject: 'Integrated Science', tier: 'Explorer', tagline: 'Levers, pulleys and ramps — measure the effort you save.', status: 'roadmap', experimentNo: 44, seo: { title: 'Simple Machines Virtual Lab', description: 'Levers and pulleys.', keywords: ['simple machines virtual lab'] } },
];

const mathLabs: LabMeta[] = [
  { slug: 'circle-theorems', docsSlug: 'circle-theorems-virtual-lab', title: 'Circle theorems, animated', subject: 'Higher Mathematics', tier: 'Master', tagline: 'Drag points on a circle and watch theorems prove themselves live.', status: 'roadmap', experimentNo: 45, seo: { title: 'Circle Theorems Virtual Lab', description: 'Interactive circle theorems.', keywords: ['circle theorems virtual lab'] } },
  { slug: 'trigonometry-unit-circle', docsSlug: 'unit-circle-trigonometry-virtual-lab', title: 'Trigonometry arm', subject: 'Higher Mathematics', tier: 'Builder', tagline: 'Rotate an arm and watch sin, cos and tan draw themselves.', status: 'roadmap', experimentNo: 46, seo: { title: 'Trigonometry Virtual Lab', description: 'Unit circle explorer.', keywords: ['trigonometry virtual lab'] } },
  { slug: 'data-and-statistics', docsSlug: 'statistics-and-data-virtual-lab', title: 'Data studio', subject: 'Higher Mathematics', tier: 'Builder', tagline: 'Toss dice, gather data and watch histograms and averages settle.', status: 'roadmap', experimentNo: 47, seo: { title: 'Statistics Virtual Lab', description: 'Data and charts explorer.', keywords: ['statistics virtual lab'] } },
];

const ict: LabMeta[] = [
  { slug: 'logic-gates', docsSlug: 'logic-gates-virtual-lab', title: 'Logic gate builder', subject: 'ICT', tier: 'Master', tagline: 'Wire AND, OR and XOR gates into truth tables and a working adder.', status: 'roadmap', experimentNo: 48, seo: { title: 'Logic Gates Virtual Lab', description: 'Build logic circuits.', keywords: ['logic gates virtual lab'] } },
  { slug: 'binary-numbers', docsSlug: 'binary-numbers-virtual-lab', title: 'Binary lab', subject: 'ICT', tier: 'Explorer', tagline: 'Flip bits, convert bases and add binary numbers by hand.', status: 'roadmap', experimentNo: 49, seo: { title: 'Binary Numbers Virtual Lab', description: 'Binary and hex practice.', keywords: ['binary virtual lab'] } },
];

const earth: LabMeta[] = [
  { slug: 'rock-cycle', docsSlug: 'rock-cycle-and-weathering-virtual-lab', title: 'Rock cycle & weathering', subject: 'Earth & Environment', tier: 'Builder', tagline: 'Transform rocks between types and speed up erosion on a cliff.', status: 'roadmap', experimentNo: 50, seo: { title: 'Rock Cycle Virtual Lab', description: 'Rock transformations.', keywords: ['rock cycle virtual lab'] } },
  { slug: 'sun-earth-moon', docsSlug: 'sun-earth-moon-model-virtual-lab', title: 'Sun–Earth–Moon model', subject: 'Earth & Environment', tier: 'Explorer', tagline: 'Spin the system: day, night, seasons, phases and tides, live.', status: 'roadmap', experimentNo: 51, seo: { title: 'Sun Earth Moon Virtual Lab', description: 'Orbital model explorer.', keywords: ['sun earth moon virtual lab'] } },
];

export const LABS: LabMeta[] = [titration, ...physics, ...chemistry, ...biology, ...integrated, ...mathLabs, ...ict, ...earth];

export const LIVE_LABS = LABS.filter((l) => l.status === 'live');

export function getLabBySlug(slug: string): LabMeta | undefined {
  return LABS.find((l) => l.slug === slug);
}

export function getLabByDocsSlug(docsSlug: string): LabMeta | undefined {
  return LABS.find((l) => l.docsSlug === docsSlug);
}

export const SUBJECT_ORDER: LabMeta['subject'][] = [
  'Physics',
  'Chemistry',
  'Biology',
  'Integrated Science',
  'Higher Mathematics',
  'ICT',
  'Earth & Environment',
];
