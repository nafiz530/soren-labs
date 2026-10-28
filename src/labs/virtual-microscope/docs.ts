import type { DocsContent } from '../../engine/types';

export const microscopeDocs: DocsContent = {
  h1: 'Virtual Microscope Lab — Onion Cells and Cheek Cells Under the Microscope Online',
  intro:
    'Sit down at a bench holding a real compound microscope: a turret with three click-selectable objectives, a big coarse knob and a tiny fine one, an illuminator with a brightness dial and a condenser diaphragm lever. Drag the onion, cheek or letter-e slide from the slide box onto the stage, hunt focus with your own hands, and watch the round ocular view come razor-sharp — or crack a cover slip if you crank the coarse knob at 40×. A calibrated eyepiece graticule turns your clicks into honest cell measurements, and the plant-versus-animal comparison concludes the experiment.',
  sections: [
    {
      h2: 'What you do in the virtual microscope lab',
      body: [
        'The lab opens on a side view of the whole instrument: a sturdy base, a curved arm carrying the stage with its slide clips, the rotating objective turret and the eyepiece tube, with a wooden slide box waiting on the bench. Three prepared slides sit in the box — onion epidermis stained with iodine, human cheek epithelial cells stained with methylene blue, and the classic printed letter-e practice slide. You drag any of them onto the stage (or press its button, or tap it once for the click-to-place assist); it settles under the clips with a glassy clink and its own focal depth, so every slide must be focused afresh.',
        'Operating the scope is genuinely hands-on. Click an objective barrel — red-ringed 4×, yellow 10× or blue 40× — and the turret swings it into position. Drag the coarse knob and it visibly turns while the image in the circular ocular view breathes from a blur toward sharpness; drag the fine knob for the last word. The illuminator dial and the diaphragm lever set how much light reaches the field, the view can be panned across the slide, and dust specks drift through the optical path exactly as they haunt real 40× objectives.',
        'Then the lab becomes an experiment. Switch on the eyepiece graticule and click both ends of a cell to measure it in micrometres; five cells on each specimen slide build two honest means, the Observations tab graphs plant against animal, and a checklist of spotted differences — cell wall, large vacuole, brick shape, bare nuclei, irregular mosaic — gates the final comparison questions.',
      ],
    },
    {
      h2: 'How a compound microscope works — and why the image inverts',
      body: [
        'A compound microscope magnifies in two stages, which is what separates it from a simple magnifying glass. The objective lens, sitting just above the specimen, projects a real, magnified image of the slide inside the tube — and a single converging lens always flips the image it projects, so this intermediate image is already upside down and left-right reversed. The eyepiece then behaves like a magnifying glass aimed at that intermediate image: it adds plenty more size but no further flipping. What reaches your eye is the specimen rotated a full half-turn.',
        'The printed letter-e slide makes the optics unmistakable. Focus it sharp and the e stands before you as ǝ — upside down AND mirrored at the same time. Pan the view and the printed glyph drifts against your hand: nudge the slide right and the image travels left, because the stage moves the specimen while the optics rotate the result. Two lenses, two flips, one unforgettable demonstration — which is exactly why the letter e has been the first slide in microscopy benches for generations.',
      ],
      bullets: [
        'Total magnification = objective × eyepiece (here 4×, 10× and 40× barrels on a 10× eyepiece → 40×, 100× and 400×)',
        'The objective forms a real inverted image inside the tube; the eyepiece magnifies it without flipping it again',
        'Net effect: the image is rotated a half-turn — upside down and left-right reversed at once',
        'Field of view shrinks as magnification grows: 5000 µm across at 4×, 2000 µm at 10×, just 500 µm at 40×',
      ],
    },
    {
      h2: 'Depth of field, and the coarse-then-fine focusing discipline',
      body: [
        'Focusing is the hunt for one exact separation between specimen and objective. The coarse knob sweeps the whole stage travel in a few turns; the fine knob creeps through a sliver of it. Which one you should be holding depends entirely on the objective, because the visible blur grows with defocus scaled by magnification — roughly proportional to stage error multiplied by the square of the magnification. At 4× the sharp window spans about 200 µm of stage travel, forgiving as a friendly guide. At 40× it collapses to barely 30 µm — a hairline — while the field of view shrinks ten-fold, so the same knob turn that was gentle at low power becomes brutal up high.',
        'That asymmetry is the whole reason the ritual exists: coarse-focus at low power where mistakes are cheap, centre the specimen, click up to the next objective, and finish with the fine knob only. This lab teaches the lesson with consequences — the 40× barrel rides a hair\'s breadth above the cover slip, and cranking the coarse knob there drives it into the glass. You hear the warn sound, watch the crack spider across the ocular view, and fetch a fresh slide from the box (your measurements are untouched). The red glint on the objective tip is your proximity warning light, and gentle hands — a razor-sharp 40× image without a single crack — earn their own badge.',
        'Depth of field also explains two familiar sights. Dust specks that drift through the optical path snap into focus at one stage height while the cells blur, then trade places a few micrometres later — real slides are never clean, and this one honours that. And when the image will not resolve at all, drop back to 4×, coarse-focus, and climb the powers again instead of grinding the fine knob through a lost field.',
      ],
    },
    {
      h2: 'Onion cells and cheek cells: a plant vs animal cell comparison',
      body: [
        'The onion epidermis is a single transparent sheet of brick-shaped plant cells, peeled from the inside of an onion scale leaf and stained with iodine. Iodine darkens the cellulose cell walls, so every cell wears thick double outlines and the rows run in a tidy running-bond mosaic like a miniature brick wall. Look closely at 40× and each cell reveals a large central vacuole — the pale inner region crowding the cytoplasm and the small nucleus out toward the walls — a water store that keeps the cell firm. Onion epidermal cells run about 150–250 µm long.',
        'The cheek slide is its animal counterpart: cells gently scraped from the inside of a cheek, smeared and stained with methylene blue. They are irregular, flattened blobs scattered across the field in a loose mosaic with no walls between them — only the thin cell membrane — and the dark nucleus dominates each cell, far more prominent than in the onion. Both cell types share nucleus, cytoplasm and cell membrane; the honest differences are the cellulose wall, the large central vacuole and the size — cheek epithelial cells measure roughly 50–80 µm, about a third the length of their plant neighbours.',
        'The lab asks you to see all of this with your own eyes before concluding. Five visual differences are tracked as a checklist, and only when every one has been genuinely observed — and five cells measured on each slide — do the three comparison questions unlock. Your own graticule means, not a textbook number, decide the size question.',
      ],
    },
    {
      h2: 'Measuring cells with the eyepiece graticule',
      body: [
        'The graticule is a ruled glass disc that sits inside the eyepiece, in the same plane as the intermediate image, so its divisions overlay whatever the current objective shows. It is calibrated per objective because the field of view itself changes with magnification: one division spans 100 µm at 4×, 40 µm at 10× and 10 µm at 40×, since the visible field shrinks from 5000 µm across to 500 µm over the same three powers. No arithmetic is demanded of you — switch the graticule on and the lab converts tick separations into micrometres using the objective in use.',
        'Measuring is a two-click gesture: focus sharp, click one end of a cell, then the other, and the length lands in your table — with a ±2% reading jitter, because real eyes judging real divisions are never perfectly exact. Five cells per slide build a true mean, and the Observations tab plots both means as bars against the typical onion and cheek ranges, so scatter and mean tell the story together. At 10× a whole onion cell spans about five divisions, a comfortable fit; at 40× the same cell overflows the field, which is itself a lesson in choosing your magnification.',
      ],
      bullets: [
        'Graticule calibration: 100 µm per division at 4× · 40 µm at 10× · 10 µm at 40×',
        'Field-of-view diameters: 5000 µm at 4× · 2000 µm at 10× · 500 µm at 40×',
        'Typical sizes: onion epidermal cells 150–250 µm · cheek epithelial cells 50–80 µm',
        'Each reading carries ±2% jitter; five cells per slide give a true mean for the comparison',
      ],
    },
    {
      h2: 'Who this virtual microscope lab is for',
      body: [
        'This is the full first microscopy practical — the one where you learn to handle the instrument before you interpret the biology — rebuilt for anyone meeting cells down a barrel for the first time, and for learners revising the plant-versus-animal comparison who want their numbers to be their own. The mentor walks newcomers through placing a slide, the coarse-then-fine ritual, the inversion demonstration and both measurement sets; confident explorers can ignore the guidance entirely, chase sharp dust specks through the 40× depth of field, close the diaphragm for contrast, or crack a cover slip on purpose and learn the recovery.',
        'Everything runs in the browser on a phone, tablet or desktop: drags are touch gestures, every control also exists as a button or slider, and the keyboard duplicates the main actions (Space or Enter performs the next sensible step, arrow keys turn focus and pan). Sound is synthesized live — knob turns, glass clinks, the crack you will hopefully never cause — with a mute toggle and volume control. No downloads, no setup, no slides to stain: just an honest bench, honest optics and honest data.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I focus a microscope properly?',
      a: 'Start at the lowest power: click the 4× objective, then turn the coarse knob until the image is almost sharp — low power forgives a wide range of stage heights. Centre what you want to see, click up to the next objective, and finish with the fine knob in tiny steps. At 40× use the fine knob only: the depth of field is barely 30 µm deep and the barrel stops a hair above the cover slip, so cranking the coarse knob there cracks the glass — the lab will let you hear exactly what that mistake sounds like.',
    },
    {
      q: 'Why does the letter e appear upside down under the microscope?',
      a: 'Because the objective lens projects a real image of the slide inside the tube, and a single converging lens always flips the image it forms — upside down and left-right reversed together. The eyepiece then magnifies that already-inverted image without flipping it again, so the printed e arrives rotated a full half-turn, reading as ǝ. Pan the slide in this lab and you can watch the glyph travel against your hand, which is the same optics felt through the stage controls.',
    },
    {
      q: 'What is the difference between plant and animal cells seen here?',
      a: 'Onion (plant) cells show thick cellulose cell walls darkened by iodine, a regular brick-shaped mosaic, and a large central vacuole crowding the cytoplasm toward the walls — and they are big, about 150–250 µm long. Cheek (animal) cells show only a thin cell membrane, an irregular flattened shape, and a very prominent dark nucleus stained by methylene blue, at roughly 50–80 µm. Both share a nucleus, cytoplasm and membrane; the wall, the vacuole and the three-fold size gap are the honest differences this lab asks you to name.',
    },
    {
      q: 'How do you measure cell size under a microscope?',
      a: 'With an eyepiece graticule — a ruled scale inside the eyepiece, calibrated for each objective. In this lab you switch the graticule on, focus sharp, then click one end of a cell and the other; the tick separation converts straight into micrometres (100 µm per division at 4×, 40 at 10×, 10 at 40×). Each reading carries a ±2% jitter exactly like a real judgement call, and measuring five cells per slide produces a trustworthy mean for the plant-versus-animal comparison.',
    },
    {
      q: 'Can I use this virtual microscope lab on my phone or tablet?',
      a: 'Yes. Every gesture works with a finger: drag slides from the box onto the stage, drag the coarse and fine knobs up and down, drag inside the round ocular view to pan, and tap to place measuring ticks. Each control is also duplicated as a button or slider for precise work, and Space or Enter performs the next sensible step if you prefer a keyboard. The bench reflows for small screens, and all sound is synthesized in the browser — no downloads needed.',
    },
  ],
};
