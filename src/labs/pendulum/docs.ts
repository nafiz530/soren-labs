import type { DocsContent } from '../../engine/types';

export const pendulumDocs: DocsContent = {
  h1: 'Simple Pendulum Virtual Lab — Measure Gravity With a Stopwatch',
  intro:
    'Drag a brass bob aside, let it swing, and time twenty full oscillations with a live stopwatch. Change the string length, record each run, and watch your own T²-versus-L graph lean into a straight line whose slope is the pull of gravity. This is the classic simple pendulum experiment, rebuilt so your hands do the timing — the photogate counts with you, and a lab mentor nudges you if you drift.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The lab opens on a rigid support with a light string and a brass bob hanging from it. You grab the bob with your pointer or finger, pull it aside to a small angle — the protractor arc at the pivot shows you how far — and release it. The instant you let go, a stopwatch starts and a photogate at the bottom of the swing counts every full oscillation as the bob sweeps past centre.',
        'When the counter reaches twenty, the watch stops by itself with a soft chime, and you record the run: string length, total time, period and period squared land in your observation table. Then you move the length slider and repeat. Four different lengths later, the analysis graph plots period-squared against length, fits the best straight line through your points, and converts its slope into a measured value of g.',
        'A mass slider lets you change the bob from 50 g to 200 g. Do it mid-experiment and you will notice something that surprises many students first time: the period does not budge, because mass simply is not in the formula for a small-angle pendulum.',
      ],
    },
    {
      h2: 'The physics behind the experiment',
      body: [
        'A simple pendulum is a mass on a light string swinging under gravity. When the angle from the vertical is small — roughly 15 degrees or less — the restoring force is very nearly proportional to the displacement, which makes the motion simple harmonic. The period then depends only on the string length and the local gravitational acceleration:',
      ],
      bullets: [
        'T = 2π √(L / g) — period of a small-angle simple pendulum',
        'Squaring both sides gives T² = (4π² / g) · L — a straight line through the origin',
        'Slope of the T²–L graph = 4π² / g, so g = 4π² / slope',
        'Mass and (for small swings) amplitude do not appear in the formula at all',
      ],
    },
    {
      h2: 'Why time twenty swings instead of one',
      body: [
        'A single oscillation of a 60 cm pendulum lasts about one and a half seconds — far too brief to time accurately by hand, where starting and stopping the watch each eats a fraction of a second. Timing twenty oscillations stretches the measurement to half a minute, so the same human reaction error is divided by twenty, and the period you compute is twenty times more precise. This is a general laboratory technique called accumulating multiple cycles, and it is exactly why the lab stops itself at twenty rather than one.',
        'The length is measured from the underside of the pivot to the centre of the bob, because that is the effective length of the pendulum — the point where the mass acts. Shortening the string makes the bob snap back and forth faster; lengthening it slows everything down in exactly the way the square-root predicts.',
      ],
    },
    {
      h2: 'Sources of error and how the lab handles them',
      body: [
        'In a real school lab, the pendulum experiment suffers from a drifting swing plane, air resistance, a flexible string, timing errors and an ambiguous length measurement. The simulation models the useful ones honestly: a whisper of air damping slowly shrinks the amplitude (without touching the period), the protractor keeps your release angle honest, and the photogate removes human counting mistakes while the stopwatch still starts with your release.',
        'Release the bob beyond about twenty degrees and the mentor will warn you: at large angles the restoring force is no longer proportional to displacement, the motion is not simple harmonic, and the textbook formula progressively under-reports the true period. Keep the release between five and fifteen degrees and your measured g will land within about one percent of 9.81 m/s².',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'The experiment is a staple of introductory mechanics everywhere — measuring g, testing simple harmonic motion, and practising graph-based analysis. It is built for anyone meeting the pendulum for the first time as well as students revising measurement technique: the mentor walks newcomers through the procedure step by step, while the data table, fitted line and live error-versus-9.81 readout give confident learners something to optimise. It runs entirely in the browser on a phone, tablet or desktop, with synthesized sound and no downloads.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I measure g using a simple pendulum?',
      a: 'Record the length L and the time for twenty full swings t₂₀ for at least four different lengths. Compute T = t₂₀/20 for each, plot T² against L, fit a straight line and divide 4π² (about 39.48) by the slope. The virtual lab does the plotting and fitting for you as you record runs.',
    },
    {
      q: 'Does the mass of the bob affect the period of a pendulum?',
      a: 'No. For small swings the period is T = 2π√(L/g), which contains no mass term. The virtual lab lets you slide the bob from 50 g to 200 g mid-experiment so you can watch the period refuse to change.',
    },
    {
      q: 'Why should the amplitude be kept small in this experiment?',
      a: 'The simple formula assumes the restoring force is proportional to displacement, which is only true for small angles. Beyond about 15 degrees the true period grows slightly longer than the formula predicts, which biases your measured g. The protractor arc in the lab helps you release at a safe angle.',
    },
    {
      q: 'Is the virtual pendulum accurate enough to replace a school experiment?',
      a: 'It is a faithful teaching model: the motion is integrated from the exact differential equation (not the small-angle shortcut), so with careful technique you can measure g to well under one percent error. It is designed to teach the method and the reasoning; nothing replaces holding the stopwatch yourself — which is exactly what you still do here.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes. The lab is built touch-first: drag the bob with your finger, use the length slider, and every control is sized for touch. It also works with a mouse and keyboard on desktop.',
    },
  ],
};
