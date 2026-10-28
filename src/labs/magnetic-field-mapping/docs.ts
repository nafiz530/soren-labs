import type { DocsContent } from '../../engine/types';

export const magneticFieldDocs: DocsContent = {
  h1: 'Magnetic Field Lines Virtual Lab — Map a Bar Magnet With a Plotting Compass',
  intro:
    'Place bar magnets on virtual plotting paper, carry a small compass anywhere with your pointer, and stamp its needle direction wherever you like — exactly the way the classic field-mapping exercise is done on a real bench. Then reveal the integrated field lines to check the map you drew by hand, flip polarities to watch every needle turn tail, and hunt the neutral point where two like poles cancel each other out.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens on a sheet of plotting paper with a wooden tray holding two bar magnets. You drag a magnet from the tray onto the paper — or drop it anywhere you like — and a small plotting compass sits waiting. Grab the compass and carry it around the magnet: the red (north) end of the needle swings to point along the local magnetic field, snapping round quickly near the poles and drifting lazily when you wander far away.',
        'With Trace mode on, tapping the paper stamps a tiny compass needle at that spot, pointing the way the field points right there. Stamp a trail of needles curving from the N pole around to the S pole and you have drawn a field line the honest way — one measurement at a time, just like the real classroom exercise with a compass and a pencil.',
        'When your map has enough stamps, switch on Reveal field lines and the lab integrates faint streamlines through the very same field your compass obeys, so you can compare the drawn answer with the calculated one. Tap any placed magnet to flip its polarity and every needle on the paper reverses — proof that the field belongs to the magnet, not the paper.',
      ],
    },
    {
      h2: 'The physics of the field you are mapping',
      body: [
        'A bar magnet seen from any distance behaves like a magnetic dipole: a moment m pointing from the S pole to the N pole. The field it produces grows sharply as you approach it, and points in different directions depending on where you stand relative to that moment. The lab computes this field exactly and adds the contributions of every magnet on the paper — superposition.',
      ],
      bullets: [
        'B ∝ (3(m·r̂)r̂ − m) / r³ — the dipole field at displacement r from the magnet’s centre',
        'On the magnet’s axis the field points along m (out of N); on its equator it points backwards (into S)',
        'The compass needle settles along the net field — the vector sum of every magnet’s contribution',
        'Neutral point: between two like poles the fields oppose, and at one spot B ≈ 0 — the needle cannot decide',
        'Field lines run N → S outside a magnet and crowd together near the poles, where the field is strongest',
      ],
    },
    {
      h2: 'Why needle stamps beat a finished picture',
      body: [
        'You could look up a picture of a dipole field in a moment, but drawing it yourself teaches something a picture cannot: the field is a local instruction, not a global shape. Each stamp records what the field says at one exact point, and the curves only appear when you join many stamps with your eye. That is why real field-mapping exercises ask for a trail of compass readings rather than a photograph.',
        'The technique rewards good spacing. Near the poles the field direction changes fast, so stamps belong close together there; far from the magnet the direction barely changes between two centimetres, and wide spacing is fine. If your revealed lines disagree with your stamps, it is almost always a spacing problem — the field curved between your marks.',
        'Two magnets make the exercise genuinely exploratory. Place them with opposite poles facing and the lines run straight from one magnet into the other, dense and direct between the poles. Flip one magnet so like poles face each other and a neutral point appears in the middle: drag the compass there and watch the needle wander aimlessly, because neither magnet wins the tug-of-war.',
      ],
    },
    {
      h2: 'Sources of confusion and how the lab handles them',
      body: [
        'A real plotting compass has inertia: yank it sideways and the needle overshoots and oscillates before settling. The simulated needle does the same, so give it a fraction of a second at each position before you trust (or stamp) its direction — stamps always record the true field direction, not the swinging needle. Close to a pole the field is so strong that the mathematical model clamps it, which is exactly why real exercises never try to plot within a few millimetres of a pole.',
        'At a neutral point there is essentially nothing to measure, and that is the lesson rather than a failure. The wandering needle is the honest signature of a place where two equal and opposite fields cancel; hunt it by watching for the point where the needle is slowest to make up its mind, then park the compass right on it.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This experiment is usually the first meeting with magnetism as a field rather than a pair of poles, and the lab is built for exactly that first meeting — as well as for anyone revising the ideas later. The mentor walks newcomers through placing, carrying, stamping, revealing, flipping and neutral-hunting step by step, while the stamp table with positions and bearings gives careful learners a record to analyse. Everything runs in the browser on a phone, tablet or desktop, with synthesized sound and no downloads.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I map magnetic field lines with a compass?',
      a: 'Place a bar magnet on the paper, put the compass next to it, and note the direction the red (N) end points. Tap to stamp a needle there, move the compass so its N end points at the previous stamp, and repeat. Stamping point-to-point this way walks you along one field line from N to S; start again elsewhere to draw the family.',
    },
    {
      q: 'Where is the neutral point between two bar magnets?',
      a: 'Place two magnets with like poles facing (N-to-N or S-to-S — tap a magnet to flip it). Halfway between the facing poles the two fields point in opposite directions and cancel almost exactly. Drag the compass into that gap: the needle becomes confused and drifts, which is the classic sign you have found it.',
    },
    {
      q: 'Why does the compass needle wander near the neutral point?',
      a: 'Because there is almost no net field left for it to obey. Each magnet still pulls the needle its own way, but the two contributions cancel, so the needle has no preferred direction and drifts aimlessly — exactly what a real compass does there.',
    },
    {
      q: 'What happens if I flip the magnet’s polarity?',
      a: 'The moment m reverses, so the dipole field reverses everywhere — not just beside the magnet. Every needle stamp you made would point the opposite way, which you can verify by stamping a fresh trail after flipping and comparing it with the old one.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes. Drag magnets and the compass with your finger, and tap the paper to stamp needles. All controls are sized for touch, and it works with a mouse and keyboard on desktop too.',
    },
  ],
};
