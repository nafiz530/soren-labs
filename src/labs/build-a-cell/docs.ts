import type { DocsContent } from '../../engine/types';

export const cellBuilderDocs: DocsContent = {
  h1: 'Plant and Animal Cell Virtual Lab — Drag and Drop Cell Organelles Interactive',
  intro:
    'Two empty cells wait on the bench: a plant cell drawn as a rigid rectangle and an animal cell as a soft, gently undulating blob. Your job is to build both from a tray of realistic organelles — hang the cell wall, lay the membrane, pour the shimmering cytoplasm, settle the nucleus near the middle, scatter the drifting mitochondria, green the plant with chloroplasts, fill its big central vacuole, sprinkle ribosomes like salt, and give the animal cell its tiny vesicles. Then label every part by dragging name chips onto the scene, pass a function quiz by tapping the organelle each question describes, and finish by naming the three differences your own bench just proved. Nothing is pre-filled: the comparison table grows only from what you actually place, and every ribosome you sprinkle is counted honestly.',
  sections: [
    {
      h2: 'What you will do in this plant and animal cell virtual lab',
      body: [
        'The lab opens on a construction bench. A selector (or a tap on the small live preview in the corner of the scene) switches between the two target cells. The plant cell appears as a dashed, crate-like rectangle waiting for its wall; the animal cell appears as a pale, softly breathing blob waiting for its membrane. Below both sits a wooden tray holding nine draggable parts, each drawn as an accurate, friendly 2D representation: the crate with corner brackets for the wall, the double-line skin for the membrane, a jar of jelly for the cytoplasm, a sphere with a darker nucleolus for the nucleus, beans with folded inner membranes for the mitochondria, green lenses with stacked grana for the chloroplasts, a big watery sac for the vacuole, a trio of tiny sacs for the vesicles, and a shaker for the ribosomes.',
        'Building is a real drag-and-drop gesture. Pick a part up — the tray creaks — carry it over the cell, and watch the interior glow as the drop zone accepts it. Release, and the part settles into a sensible spot with a soft snap and a glassy clink: the nucleus centres itself, chloroplasts hug the edge where the light is, mitochondria scatter and then keep drifting, because they are alive. Pour the cytoplasm and it spreads through the interior like jelly finding its level, then shimmers forever after. Ribosomes are a sprinkle gesture: hold the shaker inside the cell and dots rain out, each one counted in the sidebar.',
        'Mistakes are caught honestly and gently. Drag the cell wall or a chloroplast to the animal cell and the coach explains that animal cells have no wall — they would be locked in a box — while the part flies home to the tray. Try to float organelles in before the cytoplasm exists, hang a second nucleus, or hand the plant cell a fistful of vesicles, and the bench refuses with the reason why. A completeness meter fills part by part, and the plant cell simply refuses to be complete without its wall and its vacuole.',
      ],
    },
    {
      h2: 'Every organelle and its job',
      body: [
        'Each structure in the tray earns its place by doing something for the cell, and the lab keeps repeating those jobs until they stick. The cell membrane is the gatekeeper: a thin, choosy skin that controls what enters and leaves. The cytoplasm is the living jelly in which every chemical reaction of the cell happens — and in which every other organelle floats. The nucleus is the control centre, holding the genetic material and directing the cell’s activities; you can spot it instantly by the dark nucleolus nested inside.',
        'The mitochondria are the power parts: bean-shaped organelles whose folded inner membranes release energy from food, which is why the lab lets them drift restlessly in the cytoplasm. Ribosomes are the protein factories — specks so small that real cells pack thousands of them, which is exactly why this lab asks you to sprinkle thirty rather than place one. Chloroplasts, green lenses stacked with grana, absorb light energy and make food; the big central vacuole stores water and keeps a plant cell firm; and vesicles are the tiny sacs animal cells use to store and move materials instead of one giant reservoir.',
        'In the label phase you drag a name chip onto each of these parts and a leader line draws itself from the chip to the organelle, building a labelled diagram of your own making. A wrong chip never tells you the answer: the organelle wobbles, and the coach offers only its job — this bean-shaped powerhouse releases energy from food — leaving you to work out which part that must be.',
      ],
      bullets: [
        'Cell membrane — controls what enters and leaves the cell',
        'Cytoplasm — the living jelly where the cell’s reactions happen',
        'Nucleus — controls the cell’s activities; holds the genetic material',
        'Mitochondria — release energy from food',
        'Ribosomes — build proteins',
        'Chloroplasts — absorb light energy to make food (plants only)',
        'Central vacuole — stores water and keeps the cell firm (plants only)',
        'Cell wall — the rigid outer box that protects and supports (plants only)',
        'Vesicles — tiny sacs that store and move materials (animal storage)',
      ],
    },
    {
      h2: 'The differences between plant and animal cells',
      body: [
        'Build both cells back to back and the differences stop being a list to memorise and start being something you can see on your own bench. Three structures belong to plants alone: the rigid cell wall outside the membrane, the green chloroplasts, and the large central vacuole. Animal cells carry none of these — their storage needs are met by small vesicles, their energy comes from food rather than sunlight, and their shape is held by the membrane alone.',
        'Everything else is shared, and that shared core is the deeper lesson: membrane, cytoplasm, nucleus, mitochondria and ribosomes appear in both cells because both are living things doing the same basic chemistry. The Observations tab makes this concrete with a comparison table that auto-fills from your actual placements — structure by structure, plant cell, animal cell, function — plus a tally card counting what you found only in plants, only in animals, and in both. Nothing appears in that table until your own hands put it there.',
        'The final conclusion asks you to name three key differences from a short list of statements, some true and some deliberately backwards. It unlocks only after both function quizzes are passed, and a wrong set sends you back to your own tally card rather than to a textbook. Getting it right — wall, chloroplasts, central vacuole — earns the finishing milestone.',
      ],
      bullets: [
        'Plant cells have a cell wall; animal cells do not',
        'Plant cells have chloroplasts; animal cells do not',
        'Plant cells have a large central vacuole; animal cells have only small vesicles',
        'Both cells share: membrane, cytoplasm, nucleus, mitochondria, ribosomes',
      ],
    },
    {
      h2: 'Why the cell wall matters so much',
      body: [
        'A plant cannot chase food, shelter or light the way an animal can — it has to stand in one place and make the best of it. So plant cells build their own scaffold. The wall is a rigid outer layer that boxes the membrane in, keeps the cell’s shape even when water rushes in or out, and lets a leaf hold itself up into the sunlight. It is the reason a crisp lettuce leaf is crisp, and the reason a wilted one droops: the wall holds the shape, but the water pressure inside it comes from the vacuole.',
        'The lab draws the wall honestly as a crate-like boundary with plank seams and corner brackets, and the membrane as a double line hugging its inside — a reminder that even plant cells keep their membrane, because the wall is dead scaffolding while the membrane is the living gatekeeper that still decides what passes in and out. When you drag the wall to the animal cell, the coach’s refusal carries the biology with it: an animal cell would be locked in a box, unable to change shape, swallow food or move.',
        'The function quiz reinforces the distinction by asking, for the plant cell, which part is the rigid outer layer that supports and protects — a question you answer by tapping the wall band itself, not a corner of the membrane. Precision like that is the difference between recognising a picture and understanding a structure.',
      ],
    },
    {
      h2: 'Labels, quizzes and honest recorded data',
      body: [
        'A completed cell unlocks its label phase: name chips appear in a sidebar list, and you drag each one onto the matching organelle in the scene. Correct chips snap with a tick and draw their leader lines; wrong chips wobble the part and hint only at its function. Label both cells with no wrong drops and the steady-namer badge is yours.',
        'Each labelled cell then opens a five-question function quiz answered by tapping organelles in the scene — which part controls the cell’s activities, which releases energy from food, which absorbs light energy to make food. A correct tap pings and advances; a wrong one restates the function and lets you try again, with every tap counted. The Observations tab keeps the full record: your comparison table, the plant-only, animal-only and both tally, and a quiz log showing exactly how many taps each question took you.',
        'That honesty runs through the whole lab. The ribosome count in the sidebar is the real number of dots on your bench, not a rounded story; the completeness meter shows part-by-part progress you could not have skipped; and the conclusion card will not accept a set of differences your own table does not support. Resetting the bench deals a fresh pair of cells and clears the session — nothing carries over that you did not earn again.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is an Explorer-tier bench written for anyone meeting cells for the first time — and for anyone revising them who wants their hands back on the parts instead of their eyes on a diagram. No prior knowledge is assumed: the mentor walks you through six steps, from choosing your first cell to concluding the differences, and every wrong move teaches rather than punishes. Confident learners can ignore the assist button, race both quizzes, and chase the first-try labelling badge.',
        'Everything runs in the browser on a phone, tablet or desktop. The gestures are touch-first — drag organelles with a finger, sprinkle ribosomes by holding the shaker, tap quiz answers, drag label chips from the sidebar onto the scene — and every control is sized for touch. Sound is synthesized live: creaks for tray pickups, slides for drags, glassy clinks for settling parts, sloshes for the cytoplasm pour, pings for correct answers. Keyboard users get a full parallel path: Space performs the next sensible action for the current phase, number keys answer quiz questions, and P or A switches cells.',
      ],
    },
  ],
  faq: [
    {
      q: 'What are the main differences between plant and animal cells?',
      a: 'Three structures belong to plant cells only: a rigid cell wall outside the membrane, green chloroplasts that absorb light energy to make food, and a large central vacuole that stores water and keeps the cell firm. Animal cells have none of these — they store and transport materials in small vesicles instead. Everything else is shared: both cells have a cell membrane, cytoplasm, a nucleus containing the genetic material, mitochondria that release energy from food, and ribosomes that build proteins.',
    },
    {
      q: 'Which organelles are found only in plant cells?',
      a: 'The cell wall, the chloroplasts and the large central vacuole. In this virtual lab you discover that by hand: drag any of the three onto the animal cell and the coach gently refuses — an animal cell would be locked in a box — while the part flies home. The Observations tab then tallies what you found only in plants, only in animals (the vesicles), and in both.',
    },
    {
      q: 'Do animal cells have a vacuole?',
      a: 'Animal cells do have vacuoles, but they are tiny, temporary sacs called vesicles, used to store and move materials — nothing like the single giant reservoir that fills a plant cell and keeps it firm. The lab makes the contrast physical: the plant cell demands one big central vacuole before it counts as complete, while the animal cell takes three small vesicles and refuses the big sac outright, because one giant watery vacuole would crowd everything else out.',
    },
    {
      q: 'Can I get a labelled cell diagram online from this lab?',
      a: 'Yes — you build it yourself. Once a cell is assembled, its name chips appear in the sidebar and you drag each onto the matching organelle; correct labels stay on the scene as chips with leader lines drawn to their parts, producing a labelled cell diagram of your own making. Because you placed every organelle and attached every label, the finished diagram is one you genuinely understand rather than one you merely looked at.',
    },
    {
      q: 'Can I use this drag and drop cell structure lab on my phone or tablet?',
      a: 'Yes. The bench is touch-first: drag organelles from the tray with a finger, hold the ribosome shaker inside the cell to sprinkle, tap organelles to answer quiz questions, and drag the label chips from the sidebar onto the scene. On narrow screens the tray folds into two rows and every touch target stays comfortably large. Keyboard users get Space for the next sensible action, number keys for quiz answers, and P/A to switch cells.',
    },
  ],
};
