import type { DocsContent } from '../../engine/types';

export const heatingCurveDocs: DocsContent = {
  h1: 'Heating Curve of Water Virtual Lab — Melting & Boiling Plateaus with Latent Heat',
  intro:
    'Set a beaker of crushed ice on a hot plate and watch a thermometer draw the entire life story of water: ice warming to 0 °C, a flat melting plateau, liquid water climbing to 100 °C, an even longer flat boiling plateau, and finally dry steam. You control the heater power, you stamp the two plateaus with your own marks, and the plateau lengths hand you the latent heats of fusion and vaporisation. This is the states-of-matter experiment that makes latent heat visible.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench holds a beaker of 100 g of crushed ice at −10 °C sitting on an electric hot plate, with a thermometer dipping in from a stand. You choose the heater power — low, medium or high — and switch it on. The plate hums, the coil glows, and a live temperature-versus-time graph begins drawing itself in the lower third of the scene, one point every simulated second.',
        'The story unfolds in four acts. Ice warms quickly to 0 °C, then the curve flattens completely while the ice cubes visibly shrink into liquid — the melting plateau. The temperature climbs again through the liquid water, about twice as slowly per joule because water’s specific heat is double that of ice. At 100 °C the curve flattens a second, much longer time while bubbles stream upward, the water level falls, and steam wisps rise from the beaker mouth. When the last drop has vaporised, the curve is complete.',
        'Your job is to mark the two plateaus at the right moments. Each press of a mark button stamps the current (time, temperature) onto the curve and into your observation table — and the badge for marking both within ±0.5 °C of their plateau values rewards students who mark while the line is genuinely flat, not while it is merely near.',
      ],
    },
    {
      h2: 'The physics behind the shape of the curve',
      body: [
        'A heating curve is a staircase, and every step has a meaning. While a substance stays in one phase, added heat raises its temperature at a rate set by its specific heat capacity. While the phase itself is changing, added heat goes entirely into rearranging molecules rather than speeding them up, so the temperature cannot move at all:',
      ],
      bullets: [
        'Q = m·c·ΔT — warming within one phase (ice 2100, water 4186 J/kg·K)',
        'Q = m·L — heat absorbed during a phase change at constant temperature',
        'Latent heat of fusion of water: L_f = 334 kJ/kg at 0 °C',
        'Latent heat of vaporisation of water: L_v = 2260 kJ/kg at 100 °C',
        'Plateau length × heater power = mass × latent heat (L = P·Δt/m)',
      ],
    },
    {
      h2: 'Reading plateaus like a measurement — not a picture',
      body: [
        'The two flat stretches are not decoration; they are the measurement. If the heater delivers a known power for a known time, the energy that left nothing to show on the thermometer must have gone into the phase change. Multiply the plateau duration by the power, divide by the mass, and out comes the latent heat. In this lab the observation panel performs that bookkeeping from the actual run — including the honest complication that if you changed power mid-plateau, it is the average delivered power that matters.',
        'This is also why the boiling plateau is roughly seven times longer than the melting one for the same beaker: vaporising a kilogram of water costs 2260 kJ, while melting the same kilogram of ice costs only 334 kJ. Watch the curve proportions and the physics announces itself before you compute anything.',
        'Speed controls of 5× and 20× compress real waiting into minutes without lying: the simulated clock, the energy accounting and the plateau lengths all stay mutually consistent, so a mark made at 20× lands on exactly the same curve as one made at 1×.',
      ],
    },
    {
      h2: 'Choosing power, and the mistakes worth making',
      body: [
        'Heater power changes the slopes of the rising ramps and the lengths of the plateaus — never the plateau temperatures. That single fact is the heart of the experiment, and the lab makes you feel it: run once at low power and once at high power and the staircase is recognisably the same staircase, merely stretched or squeezed. Ice always melts at 0 °C; water always boils at 100 °C, because those temperatures are fixed by the physics of the phase change, not by how fast you push energy in.',
        'Two mistakes are worth making on purpose. Switch the heater off mid-run and the curve simply waits — heat flow stops, so temperature stops moving, a clean demonstration that the graph traces energy, not time. And mark a plateau while the curve is still climbing, and the table will show the miss plainly: the temperature column will read 41 °C or 63 °C instead of 0 or 100, and the plateau analysis quietly ignores the sloppy mark.',
        'One more subtlety the simulation keeps honest: during boiling the water level visibly drops as steam escapes. The beaker is losing mass, which is exactly why a real experiment must measure the plateau quickly or account for the water that has already left.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This experiment is a foundation of introductory thermal physics — specific heat capacity, latent heat, and the particle picture of states of matter. It suits anyone meeting phase changes for the first time, and learners revising who want to connect the flat steps of a textbook graph to actual energy bookkeeping. The mentor walks newcomers through a full medium-power run, while the Phase Master badge rewards careful marking technique.',
        'The lab runs entirely in the browser on a phone, tablet or desktop. The heater hum, the melt drips and the milestone chimes are synthesized live — nothing to download, and it works offline.',
      ],
    },
  ],
  faq: [
    {
      q: 'Why does the temperature stay constant during melting and boiling?',
      a: 'Because the heat you supply is being used to change the phase, not the temperature. While ice melts at 0 °C, every joule goes into breaking the solid structure; while water boils at 100 °C, every joule goes into turning liquid into vapour. Only when the phase change is complete does the temperature move again. The flat stretches on the curve are those pauses.',
    },
    {
      q: 'Does heater power change the boiling point or melting point?',
      a: 'No. Power changes only how fast the energy arrives, so it changes the slopes of the rising parts and the lengths of the plateaus. Ice melts at 0 °C and water boils at 100 °C at ordinary pressure no matter how fierce the heater is — try low, medium and high in the lab and compare the curves.',
    },
    {
      q: 'How do I find latent heat from a heating curve?',
      a: 'Measure how long the plateau lasts (Δt) and multiply by the heater power (P): the product P·Δt is the energy that went into the phase change. Divide by the mass to get the latent heat, L = P·Δt/m. The lab’s observation panel does this bookkeeping for your run automatically, including averaging if you changed power mid-plateau.',
    },
    {
      q: 'Why is the boiling plateau so much longer than the melting plateau?',
      a: 'Because the latent heat of vaporisation (2260 kJ/kg) is nearly seven times the latent heat of fusion (334 kJ/kg). Separating molecules completely into a gas takes far more energy than merely loosening them into a liquid, so the same heater must run about seven times as long to boil the water away.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The heater, power selector and plateau-mark buttons are all sized for touch, and the curve redraws crisply at any screen size. It also works with a mouse and keyboard — Space toggles the heater.',
    },
  ],
};
