import type { DocsContent } from '../../engine/types';

/**
 * SEO guide page for the osmosis-in-potato virtual lab.
 * Keywords: osmosis virtual lab, potato osmosis experiment, isotonic point
 * potato, turgid and flaccid cells, water potential simulation.
 */
export const osmosisDocs: DocsContent = {
  h1: 'Osmosis in Potato Cells — Virtual Lab: Find the Isotonic Point',
  intro:
    'Bore real cylinders out of a potato, weigh them on a digital balance, and bathe them in six salt solutions from distilled water up to 1.0 mol/dm³. This osmosis virtual lab compresses a full day of soaking into minutes, so you can watch turgid cylinders plump up, flaccid ones shrivel, and plot your own percentage mass changes to find the isotonic point of potato tissue — the concentration at which water neither enters nor leaves the cells.',
  sections: [
    {
      h2: 'What you do in this potato osmosis experiment',
      body: [
        'The bench gives you a fresh potato, a cork borer, a digital balance with a caliper readout, and six labelled beakers of sodium chloride solution. Your first job is cutting: drag the cork borer across the potato and hold it there, exactly as you would press a real borer through the flesh, and a cylinder extrudes into the tray. Six cylinders is a full set, and each one is cut with honest millimetre-level variation in length and mass, because no two real cylinders are ever identical.',
        'Next you weigh. Dragging each cylinder onto the balance makes the digits flicker and settle the way a real top-pan balance does, and the reading is banked into your observation table — starting mass in grams, starting length in millimetres, with the same ±0.1 g and ±0.5 mm jitter you would fight on a laboratory bench. Only weighed cylinders may enter a beaker, one per concentration, which forces the full spread of water potentials that the final graph needs.',
        'Then the soak runs on a simulated clock: ten compressed sim-minutes bring every cylinder to osmotic equilibrium. Finally you drag each soaked cylinder back onto the balance, and the lab computes percentage mass change, percentage length change, and an honest appearance label — turgid, firm, or flaccid — for every concentration you tested.',
      ],
      bullets: [
        'Bore six potato cylinders with a real drag-and-hold gesture',
        'Weigh each cylinder on a flickering digital balance (±0.1 g honesty)',
        'One cylinder per beaker: 0.0, 0.2, 0.4, 0.6, 0.8 and 1.0 mol/dm³ NaCl',
        'Run the compressed soak clock and watch cells change visibly',
        'Reweigh, plot % mass change against concentration, and read the x-intercept',
      ],
    },
    {
      h2: 'The science: water potential, turgid and flaccid cells',
      body: [
        'Osmosis is the movement of water across a partially permeable membrane, from a region of higher water potential to a region of lower water potential. Adding salt to water lowers its water potential, so a 1.0 mol/dm³ solution is far more “thirsty” than pure water. A potato cylinder is thousands of plant cells in a row, each wrapped in a membrane that water can cross but salt cannot — which makes the whole cylinder an osmometer.',
        'In distilled water the outside has the higher water potential, so water flows into the cells. Each cell’s protoplast swells until it presses hard against its cellulose wall: the cells are turgid, and the cylinder gains mass, lengthens slightly, and looks plump, glossy, and rigid. In concentrated salt solution the gradient reverses; water leaves, the protoplasts pull inward from the walls, and the cylinder loses mass, wrinkles, dulls, and goes floppy — flaccid. Between the two extremes the responses shift smoothly, and near one special concentration nothing net happens at all.',
        'Open the lens view on any cylinder and the simulation magnifies the tissue to cell level: turgid cells show protoplasts filling their walls with large bright vacuoles, while flaccid cells show protoplasts pulled inward with visible gaps. Water particles stream through the membranes in whichever direction the water potential gradient points, with chevrons marking the flow — the cell-level picture of what your balance is measuring as mass change.',
      ],
    },
    {
      h2: 'Finding the isotonic point of potato tissue',
      body: [
        'The isotonic point is the concentration at which the solution and the potato tissue have equal water potential, so water crosses the membrane equally in both directions and the cylinder’s mass stays flat. In this lab you locate it graphically. Percentage mass change is plotted against concentration for your six cylinders, and a least-squares line is fitted through your own points. Because the response is close to linear over this range, the line crosses zero not far from the true value for potato tissue — around 0.3 to 0.4 mol/dm³.',
        'The intercept is computed live in the Observations tab, and the conclusion card asks you to pick the matching range yourself before the lab confirms it. The measurement noise is genuinely random — masses jitter ±0.1 g, lengths ±0.5 mm — so your personal x-intercept will wobble a little around 0.33 mol/dm³ from run to run. That is not a flaw; it is the point. Scatter around a trend is exactly what real data looks like, and averaging through it with a fitted line is the honest way to report a value.',
        'A second concept question checks the direction of water movement below the isotonic point, where solutions are hypotonic to the tissue. If you can say both where the line crosses zero and which way the water was moving on either side of it, you understand osmosis as a two-way traffic controlled by gradients, not a one-way “sucking” force.',
      ],
      bullets: [
        '% mass change = 100 × (final mass − initial mass) / initial mass',
        'Isotonic point = the x-intercept of the % mass change versus concentration line',
        'Below it: hypotonic bath, water enters, cells turn turgid',
        'Above it: hypertonic bath, water leaves, cells turn flaccid',
        'Potato tissue lands near 0.33 mol/dm³ NaCl in this simulation',
      ],
    },
    {
      h2: 'Why length changes less than mass',
      body: [
        'Students are often surprised that a cylinder which loses a fifth of its mass loses only a few percent of its length. The reason is mechanical. Mass tracks the water volume directly, so a 22% mass loss at 1.0 mol/dm³ means roughly a fifth of the water left the tissue. Length, though, is held up by the cellulose cell walls, which are stiff in tension and compression and barely deform when the water inside them departs.',
        'In this simulation length responds at about a third of the strength of mass, which mirrors the classical potato osmosis experiment results: distilled water gives a few percent gain in length, while the strongest salt solution shortens the cylinder only slightly, even as it wrinkles visibly. The visual storytelling follows the same physics. A turgid cylinder is straight, glossy, and plump; a flaccid one keeps most of its length but droops, dulls, and creases because the walls stay roughly in place while the protoplasts shrink inside them.',
        'Watching the lens view while the soak runs makes the mechanism explicit: the wall rectangles stay fixed while the green protoplasts swell to fill them or shrink away from them. Percentage length change and percentage mass change are therefore two different windows onto the same event — one measuring how much water moved, the other measuring how little the scaffolding bent.',
      ],
    },
    {
      h2: 'Technique, precision, and honest errors',
      body: [
        'Good osmosis data comes from disciplined technique, and the virtual bench enforces the same habits a real one demands. Cut all six cylinders from the same potato, because tissue water potential varies between tubers. Keep the cylinders comparable in size — the cork borer does this for you. Weigh before and after with the same balance routine, and give the digits time to settle; a rushed reading is a wrong reading. One cylinder per concentration keeps every point independent.',
        'The deliberate measurement noise deserves respect rather than frustration. Because the ±0.1 g jitter is random, it scatters your points evenly around the true line instead of dragging them all one way, which is precisely why fitting a line through several points beats trusting any single measurement. Notice how the distilled-water and 1.0 M points sit far from zero, where signal is large relative to noise, while the point near the isotonic concentration is the least trustworthy of the six — the truth of a graph is rarely uniform across its span.',
        'Classic systematic errors are worth hunting for in your own technique, too. Evaporation concentrates a real solution over a long soak; a cylinder left blotted unevenly carries surface water that inflates its mass; and mixing up which cylinder came from which beaker wrecks the entire data set. The virtual lab removes those particular traps but keeps the random ones, so the discipline you build here transfers straight to the physical bench.',
      ],
    },
    {
      h2: 'Running the lab on any device',
      body: [
        'This water potential simulation runs entirely in your browser — no installation, no download, and no account. On a phone or tablet every gesture is a touch gesture: press the cork borer and drag it onto the potato, then hold; pick cylinders up with a fingertip and drop them on the balance pan or into a beaker. Touch targets are comfortably large, and the beaker labels sit in a strip below the bench so concentrations are always readable.',
        'On a desktop the same interactions work with a mouse, and the bench is fully keyboard-operable: focus the canvas and press Space or Enter at any moment, and the next sensible step — boring, weighing, bathing, starting the soak, or reweighing — happens on its own, with the same honest numbers the drag gestures produce. Escape drops whatever you are carrying, and every control button has a visible keyboard-duplicate in the panel.',
        'Sound is synthesized live: cork creaks as the borer presses, a slosh and drip as each cylinder enters its bath, a hum while the soak clock runs, and a settle-ping when the balance locks a reading. Headphones make it nicer, but they are never required. The whole experiment — six cylinders, six beakers, one graph, two conclusions — takes about ten minutes at one-times speed, and the reset button instantly lays out a fresh potato for another run.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I find the isotonic point in the potato osmosis experiment?',
      a: 'Weigh every cylinder before and after its soak, compute the percentage mass change for each concentration, and plot % mass change against concentration. Fit a straight line through your points; the concentration where the line crosses 0% is the isotonic point — the bath that is neither hypotonic nor hypertonic to the tissue. For potato tissue that crossing lands near 0.3–0.4 mol/dm³ NaCl. In this virtual lab the fitted line and its x-intercept are computed for you in the Observations tab once you have reweighed at least two cylinders.',
    },
    {
      q: 'Why does the potato cylinder gain mass in distilled water but lose mass in salt solution?',
      a: 'Water moves from higher water potential to lower water potential across the partially permeable membranes of the potato cells. Distilled water has the highest possible water potential, so water flows into the cells and the cylinder gains mass, becoming turgid. Dissolved salt lowers the water potential of the bath; at 1.0 mol/dm³ the bath is far thirstier than the tissue, so water flows out and the cylinder loses mass, becoming flaccid. Somewhere in between — near 0.33 mol/dm³ — the two water potentials match and nothing net happens.',
    },
    {
      q: 'What is the difference between turgid and flaccid cells?',
      a: 'A turgid cell’s protoplast is swollen with water and pressed firmly against its cellulose wall; the vacuole is large, the tissue is firm and glossy, and the cylinder resists bending. A flaccid cell has lost water, so its protoplast has shrunk and pulled inward from the wall, leaving visible gaps; the tissue dulls, wrinkles, and goes floppy. Turgor is what keeps non-woody plants upright, which is why a thirsty plant wilts — millions of cells going flaccid together. The lens view in this lab shows both states side by side at cell level.',
    },
    {
      q: 'Can I use this osmosis virtual lab on my phone?',
      a: 'Yes. The lab is built touch-first: every interaction — dragging the cork borer, carrying cylinders, dropping them into beakers — works with a fingertip, touch targets are 38 pixels or larger, and the layout adapts to narrow screens. It also runs offline once loaded, since all the physics and sound are generated locally in your browser with no downloads or accounts.',
    },
    {
      q: 'Why don’t the length changes match the mass changes?',
      a: 'Mass tracks the water volume that entered or left, so it moves a lot: about +11% in distilled water and −23% at 1.0 mol/dm³ in this simulation. Length is resisted by the stiff cellulose cell walls, which barely deform when water departs, so the same event produces only about a third as much change in length. That mismatch is a genuine feature of plant tissue, and comparing the two columns of your table is a good way to see the cell wall doing its job.',
    },
  ],
};
