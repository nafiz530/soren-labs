import type { DocsContent } from '../../engine/types';

export const separationMethodsDocs: DocsContent = {
  h1: 'Separation of Mixtures Virtual Lab — Filtration, Evaporation, Distillation and Sublimation',
  intro:
    'One muddy work beaker holds sand, iron filings and dissolved salt in water; a second little bowl holds two white powders — ammonium chloride mixed with salt — that look identical. Pick a separation goal, then drag the matching apparatus from the tray onto the sample and watch it really happen: the bar magnet comets the black filings out of the liquid, the funnel and filter paper trap the sand as residue while the salt water threads through, the evaporating dish boils its share dry and grows white cubic salt crystals, the distillation rig drips pure condensate into its receiver while a thermometer holds at about 100 °C, and the hot plate under a cold watch-glass dome sublimes the ammonium chloride onto the glass. Every technique works for exactly one reason — a single property difference — and by the end of the bench you will have used all five.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with the work beaker on the left, a rack of five pieces of apparatus along the bottom, and the little dry bowl of white powders on the right. You start by choosing a separation goal from the selector: remove the iron filings, remove the sand, recover the salt, collect pure water, or separate the ammonium chloride. Each goal hides a different property difference, and the coach line quietly tells you which property is about to do the work.',
        'Then comes the hands-on part. Press on any piece of apparatus in the tray — magnet, funnel with filter paper, evaporating dish on a Bunsen burner, distillation flask with Liebig condenser, or the hot plate with its cold dome — and drag it up onto the beaker or the bowl. A glowing ring shows which station you are hovering over, and when you let go the animation takes over: the beaker tilts and pours, the burner lights, the condenser drips. You can also pick a tool with keys 1 to 5 and press Space, but the drag is the real gesture, exactly as you would carry glassware on a bench.',
        'While a technique runs, its whole story plays out in the canvas: filings stream to the magnet pole in a comet trail and rain onto a watch glass, the sand mound builds on the filter paper while clear filtrate collects beneath, steam wisps rise as the dish boils down and cubic crystals appear, the receiver flask slowly fills with clear water, and white vapour curls up inside the cold dome to freeze back into a crust. Each completed technique banks a row in your observations table and lights one more lamp on the five-goal checklist.',
      ],
    },
    {
      h2: 'The science: one property difference per technique',
      body: [
        'A mixture is not a compound. Nothing in the beaker is chemically bonded to anything else, so you never need a chemical reaction to take it apart — you only need a reason for the components to go different ways. Every classic separation technique is built on exactly one such reason: a property that the substances you want apart simply do not share. That is the whole intellectual game of this bench, and the observations table spells it out row by row: which technique you used, which property it exploited, what was separated and what remained.',
        'Iron comes out by magnetism because iron is ferromagnetic and sand, salt and water are not. Sand comes out by insolubility because it will not dissolve, so filter paper can hold it back while the liquid and everything dissolved in it passes through. Salt and water part company because of their wildly different behaviour at the boiling point: water turns to vapour at about 100 °C, while salt stays solid far beyond any temperature a bench burner reaches. Ammonium chloride leaves its bowl by sublimation, skipping the liquid stage entirely, while salt has no such shortcut.',
        'Notice the shape of that list — five techniques, five properties, none repeated. When you meet a new mixture, the professional habit this lab trains is to ask the property question first: what do these two substances disagree about? Magnetism, solubility, boiling point, or the ability to sublime? The answer names the apparatus.',
      ],
      bullets: [
        'Magnetic separation — iron is ferromagnetic, the rest of the mixture is not',
        'Filtration — sand is insoluble; dissolved salt travels through with the water (the filtrate)',
        'Evaporation — the solvent boils away (about 100 °C) and the dissolved salt cannot follow',
        'Distillation — the solvent boils, then condenses back to pure liquid; every impurity stays behind',
        'Sublimation — ammonium chloride goes solid → gas → solid, re-crystallising on the cold dome',
        'Residue = what the filter traps; filtrate = the liquid that passed through',
      ],
    },
    {
      h2: 'Magnet and filter: taking the solids apart first',
      body: [
        'Do the magnet before the filter. Iron filings and sand are both insoluble solids, so filtration alone cannot tell them apart — both would sit together on the filter paper, mixed. The magnet separates them cleanly because only one of them responds to it. If you drag the funnel over a beaker that still has iron in it, the lab lets it happen and the filings land on the paper with the sand — the observation table records the muddle, and the coach points out that the magnet first would have kept them apart. Nothing breaks; you just learn the ordering.',
        'Filtration itself is insolubility doing the work. Watch the pour: the muddy mixture runs onto the paper cone, the liquid threads through the pores, and a mound of sand builds as residue. A filter cannot separate dissolved things — the salt is in the liquid, particle by particle, far too small for any paper — so what drips through is a clear salt solution. If you try to filter again after the sand is already gone, the coach gently warns that the paper caught nothing, because there is no insoluble solid left to trap. That warning is the lab being honest with you: a technique only works while the property difference it exploits still exists in the sample.',
        'The magnet has its own honest failure mode too. Once the filings are out, dragging the magnet again does nothing — nothing magnetic remains. These small refusals are the point: they teach you to look at what is actually in the beaker before choosing a tool, which is precisely how a real bench scientist thinks.',
      ],
    },
    {
      h2: 'Evaporation and distillation: the boiling point splits the filtrate',
      body: [
        'After filtering, the beaker holds a clear salt solution. The lab splits it in the way real bench work does: the dish takes half, and the still can take half of what is left, so both products survive. In the evaporating dish, the Bunsen burner brings the water to the boil — bubbles, steam wisps, a falling water level — and when the last of the liquid goes, white cubic salt crystals are sitting in the dish. The salt never left because it cannot evaporate: only the solvent can cross from liquid to gas at these temperatures.',
        'Distillation goes one step further and rescues the water as well. The round flask boils the solution, but instead of letting the steam escape, a side arm leads it into the Liebig condenser — a sloped glass jacket with cold water flowing through — where the vapour turns back into liquid and drips, drop by drop, into the receiver. The small thermometer at the still head is the instrument that proves what is happening: it climbs through the twenties and seventies, then pins at about 100 °C, water’s boiling point, and holds there while pure condensate collects. Every dissolved and insoluble impurity stays in the flask.',
        'One honest trap is built in. If you send unfiltered, muddy water to the evaporating dish, the crystals come out grey — the insoluble solids were still in the liquid and baked right into the product. Distillation shrugs the same mistake off completely: even muddy water distils to perfectly clean condensate, because nothing but the vapour makes the journey. Comparing those two outcomes teaches you when each boiling technique forgives a shortcut and when it does not.',
      ],
    },
    {
      h2: 'Sublimation: the separator you cannot see',
      body: [
        'The little bowl on the right holds the subtlest pair on the bench: ammonium chloride and salt, two white crystalline powders that no amount of staring will tell apart. Their secret difference is that ammonium chloride sublimes — warmed gently, it leaves the solid state and becomes vapour directly, never melting into a liquid. Salt has no such behaviour; heat it on a bench hot plate and it simply stays put.',
        'The apparatus makes the invisible visible. The bowl sits on the hot plate and a cold watch-glass dome covers it. As the ammonium chloride vaporises, white curls of vapour rise inside the dome, touch the cold glass, and instantly re-crystallise as a frosty crust on its inner face — collected, pure, and effortlessly separated from the salt that never left the dish. Warm the bowl again after lifting the dome and nothing more happens: the sublimable solid is already gone.',
        'Sublimation is all around once you know its name. Dry ice fogs because frozen carbon dioxide sublimes straight to gas at room temperature. Iodine crystals turn into a beautiful violet vapour over a gentle heat. Mothballs in a wardrobe slowly vanish over months, and frost patterns form when water vapour deposits directly as ice. In every case the same rule holds: only the substance with the special relationship between its solid and gaseous states makes the trip.',
      ],
    },
    {
      h2: 'Technique, honest mistakes and your observation table',
      body: [
        'Every technique you complete writes one row into the observations table: the technique, the property it exploited, what was separated, and what remained. Read the table sideways and a pattern emerges — every row is the same idea wearing different glassware. That table, plus the five-goal checklist in the side panel, is the record of your work; the "Sample splitter" reward lands only if you plan ahead enough to recover both the salt and the pure water from one filtrate.',
        'The bench also keeps score of your judgement. Drag the wrong apparatus onto a sample — a magnet with no iron left, a filter with nothing to catch, the hot plate under the liquid beaker — and the coach explains in one warm line why that technique could not help, without scolding. Pick a useless technique twice in a row and one badge is quietly off the table for the session. It is a gentle way of practising the real skill: matching apparatus to property before you lift it.',
        'The boils are the slow parts, so a playback selector lets you run the bench at 1×, 2× or 4× while the simulated clock stays consistent — no measurement is distorted by speeding up. The lab is built for anyone meeting these techniques for the first time, for anyone revising what residue and filtrate mean, and for anyone who wants the "why" behind the glassware rather than a recipe to memorise. It runs in the browser on a phone, tablet or desktop, with touch-first drags and synthesized sound for the pours, drips and bubbles.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I separate sand from a mixture of sand and water?',
      a: 'Stir it up and pour it through a funnel lined with filter paper. The sand will not dissolve, so the paper traps it as residue while the water (and anything dissolved in it, such as salt) passes through as the filtrate. In this lab you drag the funnel from the tray onto the work beaker and watch the pour happen. If iron filings are also present, use the bar magnet first — filtration cannot tell two insoluble solids apart.',
    },
    {
      q: 'How do I separate salt from water — evaporation or distillation?',
      a: 'It depends on which substance you want to keep. To recover the salt, boil the solution dry in an evaporating dish: the water leaves as steam and the salt stays behind as crystals. To keep the water, use distillation: boil it, then condense the steam back to liquid in a cold condenser so it drips into a receiver as pure water while the salt stays in the flask. This lab splits your filtrate so you can honestly do both.',
    },
    {
      q: 'Why does ammonium chloride sublime but salt does not?',
      a: 'Sublimation happens when a solid’s vapour pressure at everyday temperatures is high enough that it can pass straight to gas below its melting point. Ammonium chloride is built that way — warm it gently and it vaporises without ever melting, then re-crystallises the moment it touches something cold, like the watch-glass dome in this lab. Sodium chloride’s particles are held in a far stronger crystal lattice, so on a bench hot plate it simply stays solid while its neighbour vanishes.',
    },
    {
      q: 'What is the difference between evaporation and distillation?',
      a: 'Both use the same property difference — water boils at about 100 °C and dissolved salt does not — but evaporation lets the vapour escape into the air, so you keep what is left behind, while distillation routes the vapour through a condenser so it turns back into liquid and is collected. Evaporation collects the solute; distillation collects the pure solvent. The thermometer at the still head holding at about 100 °C is your evidence that only water is making the journey.',
    },
    {
      q: 'Can I use this separation lab on my phone?',
      a: 'Yes. The bench is touch-first: press and drag the apparatus from the tray with a finger and drop it on the beaker or the bowl, with glowing rings confirming your aim. On a desktop you can use the mouse, or pick a tool with keys 1 to 5 and apply it with Space. Sounds — pours, drips, bubbles and the clink of glassware — are synthesized live, so nothing needs downloading.',
    },
  ],
};
