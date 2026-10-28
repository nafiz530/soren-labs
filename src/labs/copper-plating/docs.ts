import type { DocsContent } from '../../engine/types';

export const copperPlatingDocs: DocsContent = {
  h1: 'Copper Electroplating Virtual Lab — Plate Copper Onto an Iron Nail',
  intro:
    'Wire an iron nail to the negative terminal, a thick copper strip to the positive one, dip both into blue copper(II) sulfate solution and close the switch. A pink coat of copper creeps over the nail and thickens at a rate Faraday’s law predicts exactly, while the copper anode quietly dissolves — losing gram for gram what the nail gains. Record the growth, swap the crocodile clips to watch the plating run backwards, and drag the nail out mid-run to weigh the deposit on a digital balance. This is electroplating, rebuilt so your hands do the wiring, the switching and the measuring.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens on a tall beaker of blue copper(II) sulfate solution with a wooden bridge across its mouth. An iron nail hangs through one notch and a thick copper strip through another, each waiting to be gripped by a crocodile clip. The blue clip runs from the supply’s negative terminal through an ammeter; the red clip runs from the positive terminal. Before you close anything, you check that wiring — polarity decides everything in plating.',
        'Set the current on the selector (0.2, 0.5 or 1.0 amps) and close the brass knife switch. Copper(II) ions drift across the bath to the nail, collect two electrons each, and lock on as pink metal: a coat that first appears near the tip, creeps up the immersed surface, then thickens hour by simulated hour. Meanwhile the copper strip — the anode — thins and pits as it dissolves, replenishing the bath exactly as fast as the nail drains it, so the blue colour never fades.',
        'As the coat grows you record rows into your observations table: the time, the current, the deposit mass and its thickness in micrometres. The mass–time graph climbs as a straight line whose slope is the plating rate. Then two detours deepen the picture: drag the crocodile clips to the opposite electrodes and the plating reverses before your eyes, and drag the nail out mid-run onto the balance pan to weigh the coat while the bench pauses the clock.',
      ],
    },
    {
      h2: 'The chemistry: why copper leaves the anode and coats the nail',
      body: [
        'The bath is copper(II) sulfate solution — blue because it is rich in Cu²⁺ ions. Connect the iron nail to the negative terminal and it becomes the cathode: positive ions are attracted to it, and each Cu²⁺ that arrives collects two electrons from the metal surface and settles as an atom of copper metal. Connect the copper strip to the positive terminal and it becomes the anode, where the reverse happens: copper atoms give up two electrons each and slip into the solution as fresh Cu²⁺ ions.',
        'Those two half-equations are the whole story of the cell. The anode dissolves to feed the bath; the bath feeds the cathode; the electrons that leave the anode travel through the wires and arrive at the cathode to complete the loop. Because the iron is the cathode, it never oxidises while the coat builds — being negative protects it. Swap the clips and every arrow flips: the nail’s pink coat dissolves back off while the strip, now negative, plates up.',
      ],
      bullets: [
        'Cathode (−): Cu²⁺(aq) + 2e⁻ → Cu(s) — copper plates onto the negative electrode',
        'Anode (+): Cu(s) → Cu²⁺(aq) + 2e⁻ — the copper strip dissolves to replenish the bath',
        'The anode loses exactly the mass the cathode gains — the blue of the bath stays constant',
        'A soluble anode keeps the Cu²⁺ concentration steady; an inert anode would slowly bleach the blue',
        'The iron stays safe as the cathode — reverse the polarity and the deposit (not the iron) pays first',
      ],
    },
    {
      h2: 'Faraday’s law: reading your mass–time graph',
      body: [
        'The amount of copper deposited is set by charge, and charge is current multiplied by time. Faraday’s law turns that into metal: m = M·I·t/(z·F),',
        'with M = 63.5 g/mol for copper, z = 2 electrons per ion and F = 96 485 C/mol. At 0.2 A the law promises 0.237 g per simulated hour; at 0.5 A, 0.592 g; at a full amp, 1.185 g. Your recorded rows plot as a straight line whose slope should sit close to those numbers — and because the slope is proportional to the current, running the same experiment at two settings gives you two lines, one five times steeper than the other.',
        'Divide the mass by copper’s density (8.96 g/cm³) and by the plated area and the line reads as thickness instead: half a gram spread over the nail’s 3.9 cm² of immersed surface is a coat about 143 µm thick. The balance in the lab resolves a milligram, so rows taken while the deposit is still tiny carry noticeable rounding — let the coat build past a few hundred milligrams before you trust the slope, exactly as you would let a real bench run before judging it.',
      ],
    },
    {
      h2: 'Reversing the polarity — the clip swap',
      body: [
        'Plating direction is decided by nothing but which electrode is negative. The lab makes you prove it with your own hands: drag either crocodile clip off its electrode and drop it on the other one, and the pair swap — the blue negative lead now grips the copper strip, the red positive lead grips the nail. Close the switch and the chemistry runs backwards. The nail, now the anode, gives its pink coat back to the bath ion by ion, while the strip, now the cathode, plates up a coat of its own.',
        'The bench opens the switch for you the moment you unclip a live lead — a small safety habit worth keeping on any real bench — so you close it again after the swap and watch the ammeter climb to exactly the same reading. The current does not care about polarity; the chemistry does. If you let a reversed run strip the nail completely bare, the bath itself starts paying the bill and the blue begins to fade: a visible lesson in where the copper actually comes from.',
      ],
    },
    {
      h2: 'Technique, accuracy and what the simulation models',
      body: [
        'The rate bookkeeping is exact Faraday: every coulomb in the sim moves 3.29 × 10⁻⁴ g of copper from anode to cathode, and the anode’s mass ledger mirrors the deposit to the milligram. The instrument realism sits in the readings: the balance resolves 0.001 g, the recorded mass is rounded to that resolution, and the clock only runs while current actually flows — lift the nail out and time holds still with the deposit, because a broken circuit carries no charge.',
        'The technique lesson is current density. A nail is a small cathode, and at the full amp the lab shows the classic symptom of pushing it: a whisper of hydrogen bubbles off alongside the copper, because water starts competing for the electrons. Keep the current gentle and the coat grows smooth and matte; push it and real benches grow rough, burnt-looking deposits for exactly the same reason.',
        'The honest limits are the ones you would meet with glassware in your hands. The coat grows slightly nodular rather than perfectly even, so a thickness computed from mass and area is an average — the tip, where charge crowds, runs a little thicker than the shank. Reading a mass too early punishes you with rounding noise in the slope, and a run that mixes currents or polarity swaps bends your line away from Faraday’s prediction in a way your own notebook would share.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'Electroplating is a cornerstone of introductory electrochemistry, and this bench is built for anyone meeting electrolysis beyond water for the first time as well as learners revising it. A lab mentor walks newcomers through the procedure step by step — wire the cell, close the switch, watch both electrodes, record, swap, compare slopes — while the live Faraday check, the mass–time graph and the fitted slope give confident learners something to chase: a recorded mass within five percent of the law’s prediction.',
        'Everything runs in the browser on a phone, tablet or desktop: click the switch, drag the clips and the nail with a finger or a mouse, and hear every click, hum and bubble synthesized live with nothing to install. If you can wire two crocodile clips, you can plate copper.',
        'Pacing is the one place the simulation bends time, and it says so openly: electroplating really is slow, so a speed selector runs the bench at 1×, 4× or 16× while the plating clock counts simulated seconds. The chemistry never changes with the speed — only your patience does — and every mass, slope and Faraday prediction is computed from those simulated seconds, so your numbers stay honest whichever pace you choose.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I calculate the mass of copper deposited during electroplating?',
      a: 'Use Faraday’s law: m = M·I·t/(z·F). Multiply the current by the time to get the charge passed, then divide by 96 485 C/mol and by 2 (two electrons per copper ion), and multiply by 63.5 g/mol. Worked example: 0.5 A for 10 minutes passes 300 C, which deposits 63.5 × 0.5 × 600 / (2 × 96 485) ≈ 0.099 g of copper. The lab’s graph fits the slope of your recorded masses and compares it with this prediction.',
    },
    {
      q: 'Why does the copper anode dissolve during electroplating?',
      a: 'The anode is positive, so copper atoms there lose two electrons each and enter the solution as Cu²⁺ ions — Cu → Cu²⁺ + 2e⁻. That is deliberate: a soluble anode replenishes the bath at exactly the rate the cathode drains it, keeping the blue copper(II) sulfate colour constant and the plating steady. In the lab you can watch the strip thin and pit as it loses gram for gram what the nail gains.',
    },
    {
      q: 'Why must the iron nail be the cathode (negative electrode)?',
      a: 'Copper plates onto whichever electrode is negative, because Cu²⁺ ions are positive and migrate that way. With the nail negative, copper collects on it and the iron simply carries the electrons — it never oxidises. If you reverse the clips, the nail becomes the anode and its deposit dissolves right back off; the lab lets you do exactly that and watch it happen.',
    },
    {
      q: 'Why does the blue colour of the solution stay constant?',
      a: 'The blue is the Cu²⁺ ions themselves, and the cell swaps them in a closed loop: the anode dissolves new ions into the bath at exactly the rate the cathode removes them. Only when the bath is asked to plate without a matching anode supply — a reversed run that has already stripped the nail bare — does the blue start to fade, and the lab warns you when that happens.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is built touch-first: tap the knife switch, drag the crocodile clips and the nail with a finger, and use the record button with a thumb. Keyboard shortcuts (Space for the switch, S to swap, W to weigh) and full mouse support are there on desktop, and all the sound is synthesized live in the browser — nothing to install.',
    },
  ],
};
