import type { DocsContent } from '../../engine/types';

export const specificHeatDocs: DocsContent = {
  h1: 'Specific Heat Capacity Virtual Lab — Calorimeter & Method of Mixtures',
  intro:
    'Heat a metal block to 100 °C, plunge it into a stirred calorimeter of cool water, and watch two temperature curves race toward each other on a live graph. The temperature where they meet is the mixture temperature — and from that single reading you can compute the metal’s specific heat capacity. This is the classic method of mixtures experiment, rebuilt so your hands do the transfer: drag the block across yourself, wait for true equilibrium, and read the answer off your own curve.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench holds two stations. On the left, an oven keeps a 100 g metal block pinned at exactly 100 °C — copper, aluminium or iron, your choice. On the right, a copper calorimeter holds 200 g of water at 25.0 °C with a lid, a dipping thermometer and a stirrer that turns continuously. You transfer the block by pressing the transfer button, or by grabbing the glowing block and dragging it into the calorimeter yourself — it plunges in with a satisfying thunk.',
        'The moment the block lands, a live temperature-versus-time graph begins drawing in the lower third of the scene. One trace shows the block cooling; the other shows the water warming. They approach each other fast at first, then more and more slowly — the signature of exponential relaxation — until both flatten onto a single stable temperature: the mixture temperature. You read that settled value, record the run, and the observation table instantly computes the specific heat capacity.',
        'Repeat the whole experiment with each metal. Copper drags the water barely three degrees; aluminium lifts it more than seven degrees and takes noticeably longer to settle. Two or three runs later, the pattern is unmistakable: the metal that stores the most heat per degree produces both the highest mixture temperature and the slowest convergence.',
      ],
    },
    {
      h2: 'The physics behind the method of mixtures',
      body: [
        'A calorimeter is designed to trap heat. Whatever energy the hot block loses, the cool water gains — assuming nothing escapes through the walls, the lid or the air. Writing heat lost by the block equal to heat gained by the water produces the central equation of the experiment:',
      ],
      bullets: [
        'm_c c_c (T_c − T_mix) = m_w c_w (T_mix − T_w) — heat lost equals heat gained',
        'Solving for the metal: c_c = m_w c_w (T_mix − T_w) / (m_c (T_c − T_mix))',
        'T_mix = (m_c c_c T_c + m_w c_w T_w) / (m_c c_c + m_w c_w) — an energy-weighted average',
        'With water at 25 °C and a 100 °C block: a large c_c pulls T_mix further from 25 °C',
      ],
    },
    {
      h2: 'Reading the mixing curve',
      body: [
        'The two traces on the live graph are not decoration — they are the measurement. The block cools and the water warms at rates proportional to their instantaneous temperature difference (Newton’s law of cooling), which is why the gap between the curves shrinks exponentially rather than linearly. In this simulation the pair of temperatures is integrated with exact energy conservation at every step, so the final settling point is the true mixture temperature, not a rounded guess.',
        'Waiting for equilibrium is the whole game. If you record early, the water has not yet absorbed all the heat the block still holds, so T_mix reads low and the computed specific heat comes out too small. The stirrer matters for the same reason: without stirring, water near the block heats while water at the thermometer stays cool, and the reading lags the true average. Watch the curves flatten completely before you press record.',
        'Playback speeds of 4× and 8× compress the waiting without touching the physics — the simulated clock, the curves and the final temperature all stay consistent, so measurements made at any speed agree.',
      ],
    },
    {
      h2: 'Sources of error and how the lab handles them',
      body: [
        'In a real calorimetry session the biggest thief is the vessel itself: heat leaks out through the walls, the calorimeter’s own heat capacity soaks up a share of the energy, and the thermometer lags behind the liquid. This simulation models the idealised bench — a perfectly insulated vessel with negligible heat capacity — so your dominant remaining error is entirely under your control: recording before the curves have truly met.',
        'There is a second, subtler error worth hunting. The mixture temperature moves only a few degrees for copper, so a small misreading of T_mix translates into a noticeable error in the computed specific heat — the denominator (100 − T_mix) is large while the numerator (T_mix − 25) is small. Aluminium, which swings the water further, is far more forgiving. Try computing all three metals and notice how the same patience buys different precision.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'The experiment is a cornerstone of introductory thermal physics — measuring specific heat capacity, practising energy accounting, and learning why calorimeters are stirred and lidded. It is built for anyone meeting the method of mixtures for the first time, and for learners revising measurement technique who want to feel how waiting for equilibrium converts directly into accuracy. The mentor walks newcomers through copper step by step, while the badge for landing within 3% of the accepted value gives careful students something to chase.',
        'Everything runs in the browser on a phone, tablet or desktop. The sounds — the thunk of the block, the soft slosh of stirring, the ticks as the curve samples — are synthesized live, so the lab works offline with nothing to download.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I measure specific heat capacity by the method of mixtures?',
      a: 'Heat a known mass of metal to a known temperature (here 100 g at 100 °C), transfer it into a known mass of water at a known starting temperature (200 g at 25 °C), stir, and wait for the shared temperature to stabilise. Then compute c = m_w c_w (T_mix − T_w) / (m_c (T_c − T_mix)). The virtual lab draws the whole mixing curve so you can see exactly when equilibrium is reached.',
    },
    {
      q: 'Why do the water and block temperatures converge instead of meeting in the middle?',
      a: 'They converge on the mixture temperature, which sits much closer to the water’s starting value. The water has both a larger mass (200 g versus 100 g) and a much larger specific heat (4186 J/kg·K versus a few hundred for the metal), so its heat capacity is more than twenty times bigger. It takes far more energy to move the water one degree than the block.',
    },
    {
      q: 'Why does the aluminium run take longer to settle than copper?',
      a: 'Aluminium’s specific heat capacity (900 J/kg·K) is more than double copper’s (385 J/kg·K), so the block holds more energy that must trickle across before equilibrium. The relaxation is exponential in both cases, but the time constant grows with the heat capacities involved.',
    },
    {
      q: 'Why must the calorimeter be stirred?',
      a: 'Without stirring, the water touching the block heats quickly while the water around the thermometer stays cool, so the thermometer reads below the true average temperature. Stirring keeps the water uniform, which both speeds up the exchange and makes the single thermometer reading trustworthy.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is built touch-first: drag the block with a finger, use the material selector and the level slider, and every control is sized for touch. It also works with a mouse and keyboard on desktop — you can even transfer the block with the Space bar.',
    },
  ],
};
