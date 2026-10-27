import type { DocsContent } from '../../engine/types';

export const resonanceTubeDocs: DocsContent = {
  h1: 'Resonance Tube Virtual Lab — Measure the Speed of Sound in Air',
  intro:
    'Strike a tuning fork, hold it over a water column, and sweep the water level until the tube suddenly sings back. At each resonance the air column locks onto the fork with a standing wave — mark those lengths, and a few multiplications hand you the speed of sound in air. This is the classic resonance tube experiment, rebuilt with a live loudness meter, visible standing waves and forks you can actually hear.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench shows a vertical tube whose lower section connects to a water reservoir. Dragging the reservoir (or the level slider) raises and lowers the water inside, setting the air-column length from a few centimetres up to a full metre. A tuning fork waits at the side — choose 512 Hz, 440 Hz or 341 Hz, strike it, and it rings at its true pitch through your speakers.',
        'With the fork held over the tube mouth, drag the water level slowly and watch the loudness meter. It stays quiet through most of the sweep — then swells to a peak as the column passes through resonance, the moment the air\'s natural standing wave matches the fork. Faint nodes and antinodes become visible inside the tube at near-resonance, growing with the loudness.',
        'Mark each peak as you find it: first resonance, then the second deeper one. The observation table turns your marked lengths into wavelengths — λ = 4L for the first resonance, 4L/3 for the second — and then into the speed of sound, v = f·λ. Repeat with the other forks and watch the three independent measurements agree on about 343 m/s.',
      ],
    },
    {
      h2: 'The physics behind the experiment',
      body: [
        'A closed-end tube resonates when its air column fits a quarter-wavelength standing wave: the water surface acts as a node (air cannot move there) and the open mouth as an antinode (air swings freely). Resonance lengths form an odd-harmonic series:',
      ],
      bullets: [
        'First resonance: L₁ = λ/4 = v/(4f)',
        'Second resonance: L₂ = 3λ/4 = 3v/(4f)',
        'So λ = 4L₁ (or 4L₂/3) and v = f·λ',
        'The distance between successive resonances equals λ/2 — a built-in cross-check',
      ],
    },
    {
      h2: 'Why the second resonance matters',
      body: [
        'A single resonance length is not enough, because the effective end of the tube is not exactly at its mouth: the air just outside also vibrates, an effect called the end correction, roughly 0.6 times the tube radius. It shifts every resonance length slightly, which would bias a one-point measurement of v.',
        'The classic cure is to use the distance between the first and second resonances — the end correction cancels out of the subtraction, leaving exactly λ/2. The lab keeps the simple 4L formulae in the table for clarity but explains the end correction in the theory tab, and the agreement between your first-resonance and second-resonance speeds shows the small residual it leaves behind.',
      ],
    },
    {
      h2: 'What your ears are doing',
      body: [
        'Resonance is the tube choosing which sounds to amplify. The fork vibrates the air at the mouth across a whole range of tiny amplitudes, but only frequencies whose standing wave fits the column build up constructively — everything else dies away quickly. When the fork\'s frequency fits, the column stores energy cycle after cycle and the sound swells: the same physics that makes an organ pipe speak in one voice and a bottle hum when you blow across it.',
        'The peaks are narrow, which is exactly why the experiment works — sweep too fast and you will slide past one. The mentor suggests slow drags near quarter-metre lengths, just as a real bench demands a patient hand on the reservoir.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'Anyone studying waves and sound for the first time, revising standing waves, or wanting to measure the speed of sound without a river of water on the floor. The mentor walks through striking, sweeping and marking; the agreement across three forks gives confident students a real precision target. It runs in any modern browser on phone, tablet or desktop — with synthesized forks you can genuinely hear.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do you measure the speed of sound with a resonance tube?',
      a: 'Strike a tuning fork of known frequency f and find the water levels where the tube resonates. The first resonance length gives λ = 4L (or use L₂ − L₁ = λ/2 between the first two). Then v = f·λ. In this lab, mark the resonances and the table computes v for you.',
    },
    {
      q: 'Why does the loudness peak only at certain water levels?',
      a: 'The air column resonates only when a quarter-wavelength standing wave fits between the water (node) and the mouth (antinode). At those lengths the column stores the fork\'s energy and sounds loud; everywhere else the vibrations die away quickly.',
    },
    {
      q: 'What is the end correction and does it affect my result?',
      a: 'The antinode sits slightly outside the tube mouth — about 0.6 tube radii — so every measured resonance length is a little short. Using the distance between two successive resonances cancels the effect; the lab\'s single-length formulae show it as a small residual you can read about in the theory tab.',
    },
    {
      q: 'Why do the 512 Hz, 440 Hz and 341 Hz forks give the same speed?',
      a: 'The speed of sound in air depends on the air itself — mainly its temperature — not on the fork. Each fork resonates at different column lengths, but v = f·λ comes out the same, which is the experiment\'s built-in proof that you are measuring a property of air.',
    },
    {
      q: 'Can I run this lab on a phone?',
      a: 'Yes — drag the reservoir with your finger and every control is touch-sized. Headphones make the fork pitches easier to distinguish, but the loudness meter works silently too.',
    },
  ],
};
