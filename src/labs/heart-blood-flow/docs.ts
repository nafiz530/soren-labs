import type { DocsContent } from '../../engine/types';

/**
 * SEO guide page content for the Journey of blood lab.
 * Warm, plain English for anyone meeting the heart for the first time.
 */
export const heartDocs: DocsContent = {
  h1: 'Heart Structure and Blood Flow Virtual Lab — Trace the Journey of Blood',
  intro: 'Open a beating, cross-section heart and follow a single blood cell around its whole journey: in through the vena cava, down through the right atrium and right ventricle, out to the lungs where it turns scarlet with oxygen, back through the left atrium and the powerful left ventricle, and away down the aorta to the body. You label every chamber and valve yourself, trace the route step by step, and finish with a heart-rate experiment that compares resting and exercising cardiac output — all in an interactive heart virtual lab that runs right in your browser.',
  sections: [
    {
      h2: 'What this blood flow through the heart interactive does',
      body: [
        'This virtual lab replaces the static textbook diagram with something you can operate. The heart beats continuously on the bench — atrial systole, ventricular systole, diastole — while sixty animated blood cells flow through the full double circuit. You hear the lub-dub of the valves closing on every beat, watch chambers visibly squeeze smaller, and see valves flap open and shut in the correct sequence.',
        'The colour of each cell is its honest oxygenation state: blue-purple while it carries oxygen-poor blood on the right side of the heart, scarlet once it has loaded oxygen in the lungs, and back to blue-purple after the body’s cells have taken their share. Nothing is decorative — every colour change happens exactly where the real gas exchange happens.',
        'Three modes keep your hands busy. In Explore mode you click any chamber, valve or vessel and its name and job appear in the sidebar. In Label mode you drag name chips onto the structures yourself — wrong drops wobble and earn a hint about the part’s job, never its name. In Trace mode the lab quizzes you, stop by stop, on the next vessel in the blood’s journey until you have clicked the entire double circuit from the vena cava to the aorta and home again.',
      ],
    },
    {
      h2: 'The four chambers and valves — a heart structure labelled by you',
      body: [
        'The heart’s four chambers appear in cross-section. The right atrium receives tired blood from the body; the right ventricle pumps it to the lungs. The left atrium receives bright blood from the lungs; the left ventricle — the powerhouse with the thickest wall of all — drives it around the whole body. Between the two sides runs the septum, the muscular wall that keeps oxygen-rich and oxygen-poor blood from ever mixing.',
        'Four valves guard the doorways, and in this heart structure labelled simulation each one flaps in time with the beat. The tricuspid valve (three flaps) and the mitral, or bicuspid, valve (two flaps) sit between the atria and the ventricles — they slam shut with the first heart sound, the “lub”. The pulmonary and aortic semilunar valves sit at the two exits — they close with the softer “dub”, stopping blood from draining backwards between beats.',
        'The great vessels complete the picture: the vena cava bringing dark blood in, the pulmonary artery carrying it to the lungs (the only artery with oxygen-poor blood), the pulmonary vein bringing scarlet blood back (the only vein with oxygen-rich blood), and the aorta arching over the top to feed the body. Clicking any one of them fills your structure table in the Observations tab — structure, side of the heart, blood oxygenation and role — so the labelled diagram is one you build yourself.',
      ],
    },
    {
      h2: 'Blood flow through the heart, step by step',
      body: [
        'The order never changes, and the Trace mode makes you prove you know it. Blood returning from the body enters the right atrium through the vena cava, crosses the open tricuspid valve into the right ventricle, and is pumped out through the pulmonary valve into the pulmonary artery. In the lungs the blood releases carbon dioxide and binds oxygen, turning from blue-purple to scarlet.',
        'The now-bright blood returns through the pulmonary vein to the left atrium, crosses the mitral valve into the left ventricle, and is fired through the aortic valve into the aorta — the body’s largest artery. Around the body loop, cells unload their oxygen and hand over carbon dioxide, so the blood darkens again on its way back to the vena cava. One complete lap of that loop passes through the heart twice: that is the double circulation.',
        'The spotlight tool is the best way to feel it. Press “Spotlight a blood cell” and one cell is ringed in orange with a fading trail. Ride with it through the right heart, watch it blush scarlet inside the lungs loop, feel the left ventricle launch it down the aorta, and watch it dim again in the body loop — a full circuit takes under a minute at a resting heart rate, and every step of it is drawn from the same flow model that drives the simulation.',
      ],
      bullets: [
        'Body → vena cava → right atrium',
        'Right atrium → tricuspid valve → right ventricle',
        'Right ventricle → pulmonary valve → pulmonary artery → lungs (blood turns scarlet)',
        'Lungs → pulmonary vein → left atrium',
        'Left atrium → mitral valve → left ventricle',
        'Left ventricle → aortic valve → aorta → body (blood turns blue-purple) → back to the vena cava',
      ],
    },
    {
      h2: 'Double circulation simulation: why blood passes through the heart twice',
      body: [
        'A fish manages with a single circuit — heart to gills to body and back. Mammals and birds went one better: our hearts are two pumps in series, and this double circulation simulation lets you watch both pumps work in the same chest. The right pump is a short-haul courier: it only has to push blood next door to the lungs, at low pressure, to be oxygenated. The left pump is long-haul: it must maintain high pressure to push blood to the top of your head and the tips of your toes.',
        'Why not send blood to the lungs and the body in one loop? Because passing through the delicate lung capillaries drops the pressure so much that the blood would arrive at the body barely moving. By routing blood back to the heart after the lungs, the left ventricle can re-pressurise it before the long journey. The payoff is warm-blooded life: fast, high-pressure delivery of oxygen to every cell.',
        'In the lab, the conclusion card asks you exactly this question, and the trace quiz makes the two pumps tangible: fourteen stops, passing through the heart at two of them. Complete the journey without a single wrong click and you earn the double circulation badge — proof that the circuit lives in your fingers, not just on the page.',
      ],
    },
    {
      h2: 'Why the left ventricle’s wall is thicker',
      body: [
        'Look at the cross-section and the left ventricle’s wall is visibly — dramatically — thicker than the right’s. It is the single most telling observation in heart anatomy, and the reason is pure plumbing. The right ventricle pumps blood to the lungs, which sit centimetres away and accept blood at low pressure; the left ventricle pumps the same volume of blood through the aorta to the entire body, which needs high pressure to drive it through miles of narrow capillaries.',
        'More work demands more muscle. The left ventricular wall is typically about three times the thickness of the right, and in this simulation that thickness is drawn to scale in the chamber walls — you can pause the beat mid-systole and compare the two pumps side by side. The lab’s first conclusion card asks you to choose between volume, pressure and distance; answering it correctly is what unlocks the conclusion champion badge.',
        'The same logic explains the whole architecture. Atria are thin-walled because they only nudge blood downstairs into the ventricles. Vessel walls differ too: the aorta is thick and elastic to smooth out the pressure pulses, while the vena cava is a wide, floppy, low-pressure return pipe. Once you see the heart as two pumps built to two different job descriptions, every thickness in the cross-section makes sense.',
      ],
    },
    {
      h2: 'Heart rate, stroke volume and cardiac output',
      body: [
        'The heart-rate control swings between 40 and 180 beats per minute, with one-tap presets for a resting 72 bpm and an exercising 150 bpm. Faster beats speed up the blood cells honestly — the flow model scales directly with the rate — and the beat sound quickens with it. Pause the heart at any moment to study a frozen systole or diastole.',
        'The rate study in the Observations tab turns this into real numbers. Cardiac output — the litres of blood pushed per minute — is stroke volume multiplied by heart rate. The lab models stroke volume honestly: it rises modestly as the rate climbs, because a faster heart fills and squeezes more strongly, and it is capped at 110 mL per beat. Record a resting rate and an exercising one and the comparison card computes the difference: around 5 litres per minute at rest rising towards 14 or more during hard effort, close to a threefold increase.',
        'Notice what the graph tells you: cardiac output rises faster than the heart rate alone, because both factors climb together. That is also why an over-fast heart becomes inefficient — past a certain rate there is too little filling time and the stroke volume falls. Set the slider to its extremes, record a few points, and read the trend off the fitted line yourself.',
      ],
    },
  ],
  faq: [
    {
      q: 'How does blood flow through the heart in the correct order?',
      a: 'Body → vena cava → right atrium → tricuspid valve → right ventricle → pulmonary valve → pulmonary artery → lungs → pulmonary vein → left atrium → mitral valve → left ventricle → aortic valve → aorta → body. The Trace mode in this lab walks you through exactly this sequence, one click per stop, with hints whenever you take a wrong turning.',
    },
    {
      q: 'Why is the left ventricle’s wall thicker than the right’s?',
      a: 'The left ventricle must pump blood around the entire body at high pressure, while the right ventricle only pumps blood the short distance to the lungs at low pressure. More pressure needs more muscle, so the left wall is roughly three times thicker. You can see the difference drawn to scale in the cross-section, and the first conclusion card checks that you can explain it.',
    },
    {
      q: 'What is double circulation and why does blood pass through the heart twice?',
      a: 'Double circulation means the heart works as two pumps in series. The right side first sends blood to the lungs to collect oxygen; the left side then re-pressurises that bright blood and delivers it around the body. Passing through the heart twice lets the blood be oxygenated at low pressure in the lungs and then driven to every cell at high pressure.',
    },
    {
      q: 'Can I use this heart virtual lab on my phone?',
      a: 'Yes. The scene, controls, label tray and quiz cards all reflow for narrow screens, touch targets are at least 38 pixels, and you can drag label chips with a finger. Sound is synthesized live in the browser, so no downloads or headphones are needed — though they make the lub-dub nicer.',
    },
    {
      q: 'Are the heart sounds and the heart-rate numbers realistic?',
      a: 'The lub-dub is synthesized live: the “lub” plays as the atrio-ventricular valves slam shut and the “dub” as the semilunar valves close, exactly as in a real cardiac cycle. The rate study uses an honest model — stroke volume of roughly 66 mL at a resting 72 bpm giving about 4.8 litres per minute of cardiac output, rising to around 14 litres per minute at 150 bpm as stroke volume climbs to about 93 mL.',
    },
  ],
};
