import type { DocsContent } from '../../engine/types';

export const densityDocs: DocsContent = {
  h1: 'Density & Archimedes Principle Virtual Lab — Buoyancy Experiment Online',
  intro:
    'Weigh brass, aluminium, ice and wood blocks on a spring balance in air, then lower them into a brim-full overflow can and watch the balance drop as water spills into a measuring cylinder. Every number you need — density, upthrust, displaced volume — comes from your own hands. This is the classic density-and-buoyancy experiment, rebuilt so the overflow can never spills on the floor.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'A material block hangs from a spring balance that reads its weight in air. You hold the Lower button and the block descends into an overflow can filled exactly to the brim; the moment it touches, water streams through the spout into a graduated cylinder, and the balance reading falls as buoyancy grows.',
        'When the block settles — fully submerged for the heavy materials, floating at its natural depth for wood and ice — you record the run. The observation table fills with weight in air, weight in water, displaced volume, computed density, upthrust, and the weight of the displaced water side by side.',
        'Switch materials and repeat. Brass displaces a full 100 cm³ and loses almost a newton of apparent weight; wood stops sinking when only 60% of it is submerged and the balance reads exactly zero. Every row of your table should end with two nearly identical numbers — upthrust beside displaced-water weight — which is the whole point.',
      ],
    },
    {
      h2: 'The physics behind the experiment',
      body: [
        'Water pushes up on anything immersed in it, and the strength of that push follows a rule so simple it feels like a magic trick:',
      ],
      bullets: [
        'Upthrust (buoyancy) = ρ_water · g · V_displaced — Archimedes\u2019 principle',
        'Apparent weight in water: W_water = W_air − upthrust',
        'Density from measurements: ρ = W_air / (g · V_displaced)',
        'A floater submerges exactly the fraction ρ_block/ρ_water of its volume',
      ],
    },
    {
      h2: 'Why the overflow can makes displacement honest',
      body: [
        'The overflow can is filled to the very brim, so any object pushed into it spills out exactly the volume it occupies below the water line — the cylinder catches all of it and none of it twice. That single piece of glassware turns "volume of an irregular object", usually a frustrating measurement, into simple reading of a scale.',
        'The spring balance tells the other half of the story. Its reading in air minus its reading while submerged is the upthrust, measured directly in newtons. Comparing that with the weight of the spilled water — one newton-scale number against another — is the cleanest verification of Archimedes\u2019 principle a bench can offer.',
      ],
    },
    {
      h2: 'What the floating block teaches',
      body: [
        'Lower wood or ice and something different happens: the block stops by itself. It sinks only until the displaced water weighs exactly as much as the block does — from that moment, buoyancy equals weight, the balance reads zero, and the block floats at rest. The submerged fraction is the density ratio: wood at 600 kg/m³ floats with 60% under water, ice at 920 kg/m³ with 92%.',
        'That is why icebergs show only a tenth above the surface, why a steel ship floats while a steel cube sinks, and why the "loss of weight" method still works for floaters: the displaced volume is smaller, but smaller by exactly the right amount to keep ρ = W_air/(g·V) true.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'Anyone meeting density, upthrust or floating and sinking for the first time, revising buoyancy problems, or preparing for a real practical where the overflow can is genuinely full of drama. The mentor walks through weighing, lowering and recording; the live comparison columns give confident students a precision target of their own. It runs in any modern browser on phone, tablet or desktop.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do you measure the density of a solid using Archimedes principle?',
      a: 'Weigh the object in air (W_air) to get its mass, then lower it into a brim-full overflow can and collect the displaced water to get its volume. Density = W_air/(g·V_displaced). The virtual lab computes this from your recorded runs automatically.',
    },
    {
      q: 'Why does the block weigh less when submerged in water?',
      a: 'Water pushes up on it with a force equal to the weight of the water it displaces. The balance feels that push as a reduction: reading in water = weight in air − upthrust. Your table shows the two sides matching row by row.',
    },
    {
      q: 'Why does the wood block stop sinking on its own?',
      a: 'It sinks only until the displaced water weighs exactly as much as the block. At that depth, buoyancy equals weight and the forces balance — the block floats with the submerged fraction equal to its density divided by water\u2019s (wood: 600/1000 = 60%).',
    },
    {
      q: 'Does the floating block break the density measurement?',
      a: 'No — it makes it. A floater displaces less volume, but less by exactly the right amount, so ρ = W_air/(g·V_displaced) still gives the true density. Try wood: the reading comes out at 600 kg/m³, not the 1000 of the water.',
    },
    {
      q: 'Can I use this lab on a phone or tablet?',
      a: 'Yes — hold the Lower button with your thumb and every control is touch-sized. Keyboard and mouse work on desktop too.',
    },
  ],
};
