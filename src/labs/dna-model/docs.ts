import type { DocsContent } from '../../engine/types';

/**
 * SEO guide page for the DNA double helix virtual lab (docsSlug:
 * dna-structure-and-replication-virtual-lab).
 */
export const dnaDocs: DocsContent = {
  h1: 'DNA Structure and Replication Virtual Lab — Build a Double Helix, Unzip It, Watch It Copy Itself',
  intro:
    'This DNA virtual lab lets anyone meeting DNA for the first time build a twelve-rung double helix with their own hands, break it open with helicase, and replicate it into two daughter molecules. Every base pair you snap in obeys the real base pairing rules — A with T through two hydrogen bonds, G with C through three — and every percentage on the results card is computed from the exact sequence you happened to build. No memorising required: you will see semi-conservative replication happen before you have to name it.',
  sections: [
    {
      h2: 'What you do in this interactive DNA model',
      body: [
        'The bench has two zones. Up above hangs the growing helix: two sugar-phosphate backbones drawn as gently twisting brass ribbons, with space for twelve rungs between them. Down below sits a tray of free nucleotides — adenine (green), thymine (red), guanine (orange) and cytosine (blue), the purines drawn as larger double-marked shapes and the pyrimidines as smaller ones. One side of every rung arrives with a fixed base already attached; your job is to drag the correct partner from the tray to the empty slot on the opposite side.',
        'The lab refuses wrong pairings honestly. Try to marry adenine to guanine and the nucleotide bounces back with a warning tone and a coach line explaining exactly why: A bonds only with T, through two hydrogen bonds, while G bonds only with C, through three. When a pair clicks in, the rung is drawn with its honest bond count — two or three little dashes between the paired bases — so the stronger G–C pairing is visible at a glance.',
        'Interaction is real gesture work, not menu-clicking. You drag nucleotides with a finger or mouse, drag the helix sideways to rotate it in its 3D-illusion twist, scroll or tap the ± buttons to zoom, and hover any finished base pair to read its position, identity and bond count in the sidebar. A keyboard duplicate of the main gesture means the whole flow also works without a pointer.',
      ],
      bullets: [
        'Build phase — drag complementary nucleotides until all twelve rungs are complete.',
        'Unzip phase — send the helicase motor down the helix and watch the hydrogen bonds pop, one rung at a time.',
        'Replication phase — feed complementary nucleotides to both template strands, by hand or with the auto-demo.',
        'Data phase — read the Chargaff percentages computed from your own sequence and answer the conclusion.',
      ],
    },
    {
      h2: 'The structure of the double helix, drawn honestly',
      body: [
        'DNA carries its information in two long backbones made of alternating sugar and phosphate groups. These backbones do not run side by side like a ladder straight on; they twist around a common axis, one full turn roughly every ten base pairs, producing the double helix shape that became the icon of modern biology. In this simulation the twist is drawn live: the helix slowly auto-rotates when idle, and you can spin it yourself by dragging.',
        'The rungs are where the information lives. Each rung is a pair of nitrogenous bases joined across the middle by weak hydrogen bonds. The backbone-and-rung architecture matters for information storage: the strong backbone protects the outside, while the easily unzipped hydrogen bonds in the middle let the molecule be opened for reading and copying without breaking the sequence itself.',
        'One more structural honesty worth noticing in the model: a purine (adenine or guanine — the bigger shapes in the tray) always faces a pyrimidine (thymine or cytosine — the smaller ones). A big-plus-big or small-plus-small rung would make the ladder bulge or pinch. Purine-plus-pyrimidine keeps every rung the same width, which is one quiet reason the pairing rules are as strict as they are.',
      ],
    },
    {
      h2: 'Base pairing rules — the simulation enforces them for real',
      body: [
        'The base pairing rules are simple to state and easy to see here: adenine pairs with thymine, guanine pairs with cytosine, and nothing else fits. The physical reason is shape and hydrogen-bond geometry. Adenine and thymine line up so that exactly two hydrogen bonds can form between them; guanine and cytosine line up for three. The model draws those bonds as two or three small dashes in the middle of each rung — count them on any rung you have built.',
        'Because this is a simulation rather than a picture, the rules are enforced rather than merely illustrated. The drop logic checks what you are carrying against what the fixed base needs. A wrong drop is refused, the attempted pair is named in the coach line, and the correct partner is stated — so a refusal is itself a teaching moment. There is no way to build a dishonest molecule: all twelve rungs in a finished helix obey the rules by construction.',
        'This strictness is what makes the Chargaff card in the Observations tab meaningful. Because every rung is an A–T or a G–C pair, counting all the bases on both strands of your molecule gives exactly equal numbers of A and T, and exactly equal numbers of G and C — whatever random sequence you built. You do not have to take the rule on trust; your own data shows it.',
      ],
      bullets: [
        'A–T: 2 hydrogen bonds (the rungs with two dashes).',
        'G–C: 3 hydrogen bonds (the rungs with three dashes — slightly stronger pairing).',
        'Purine + pyrimidine on every rung keeps the helix a constant width.',
      ],
    },
    {
      h2: 'DNA replication animation and semi-conservative replication',
      body: [
        'Replication begins with an unzip. A protein machine called helicase clamps onto the DNA and travels along it, wedging the two strands apart and breaking the hydrogen bonds between the bases. In this lab you launch helicase with one press once your helix is complete: the violet motor blob slides down your model, and each rung it passes splits with a small pop as its bond dashes burst apart. Nothing else breaks — the two old backbones stay whole, which is the crucial point.',
        'Each intact old strand now serves as a template. Because the pairing rules allow exactly one partner at every position, a template strand contains all the information needed to rebuild its missing opposite half. You add the new nucleotides yourself by dragging them onto the dashed slots, or you can switch on the auto-fill demo and watch free nucleotides snap in one by one, alternating between the two templates. A wrong choice against a template is refused with the same honest explanation as during the build.',
        'Look closely at the two finished daughters and you will notice the colour scheme doing the teaching. The original backbones stay brass; the newly built strands are drawn in teal. Each daughter molecule is therefore visibly half old and half new: one conserved parental strand paired with one freshly synthesised strand. Biologists call this semi-conservative replication, and it is the answer to the third question in the conclusion card.',
        'The mechanism explains that outcome. Unzipping does not destroy the parental strands — it only separates them, and template-guided pairing rebuilds the missing half against each one, so every daughter inherits one intact physical strand from the original molecule. Semi-conservative replication was confirmed historically by labelling experiments that tracked old versus new DNA, and the same logic is what this lab lets you watch happen under your own hands. It is also why DNA copying can be accurate enough to pass from one generation to the next: a template only accepts one correct partner at each position, so an error requires something to actively go wrong rather than the copy simply drifting.',
      ],
    },
    {
      h2: 'Reading your own data: Chargaff percentages and honest conclusions',
      body: [
        'Open the Observations tab at any point and the lab reports on the molecule you actually built. The sequence table lists every rung — position, left base, right base and hydrogen-bond count. The Chargaff card counts every base on both strands and shows the live percentages of A, T, G and C as a bar chart. Because of the pairing rules, A matches T exactly and G matches C exactly in your data, every single time, no matter which random sequence the tray dealt you.',
        'That is the honest form of Chargaff\'s rule: in double-stranded DNA the amount of adenine equals the amount of thymine, and the amount of guanine equals the amount of cytosine. Historically, chemical analysis of DNA from many organisms showed these ratios long before the helix structure explained them. Here the causality runs in front of your eyes — the equality in your counts is forced by the rungs you personally assembled.',
        'The conclusion card finishes the experiment with three short answers: which base pairs with A, how many hydrogen bonds hold a G–C pair, and why each daughter molecule keeps one old strand. Answer all three well and the final milestone unlocks. The precision note at the bottom of the tab is honest too — this is a teaching model, and the numbers on the page come from your sequence, not from a canned dataset.',
      ],
    },
    {
      h2: 'Technique, precision and what this model simplifies',
      body: [
        'Good habits transfer even to a conceptual bench. Read the fixed base before you reach for the tray — the fixed side alternates rung by rung, so a fast flick at the wrong moment pairs against the wrong template side. Watch the dashes rather than the colours when you are unsure: two dashes means A–T, three means G–C. During replication, work from the top of each template downward, which is roughly how the real machinery keeps its place.',
        'Like every model, this one simplifies. Real DNA contains millions of base pairs, not twelve; the bases are drawn as simple colour-coded shapes rather than ring structures; helicase works with a whole crew of helper proteins, and the fork moves in a coordinated, regulated way rather than one pop at a time. The twist rate, the bond counts and the semi-conservative logic, however, are faithful — those are the ideas the lab wants you to carry away.',
        'The lab is fully client-side: it runs in the browser, works on touch screens with generous drop zones and 38-pixel-plus targets, and synthesises its sounds live, so nothing is downloaded and nothing is uploaded. Resetting deals a fresh random sequence, which makes the Chargaff equality feel less like a coincidence each time you rebuild it.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I pair the bases correctly in the DNA virtual lab?',
      a: 'Look at the circled fixed base on the ladder, then drag the nucleotide it needs from the tray to the pulsing slot on the opposite side: A with T, G with C. The purines (A and G) are the larger shapes and the pyrimidines (T and C) are smaller, but colour is the fastest key — green A, red T, orange G, blue C. If you are unsure, count the dashes on a finished rung: two dashes is an A–T pair, three is G–C.',
    },
    {
      q: 'Why was my base pair refused?',
      a: 'Because the pairing rules really are enforced. A–G, T–C, A–A and every other mismatch is bounced back with a warning tone, and the coach line tells you which base the fixed one actually needs and how many hydrogen bonds join them. The refusal is the teaching moment: only A–T (two hydrogen bonds) and G–C (three hydrogen bonds) rungs can exist in a double helix, so there is no way to finish the model with a wrong pair in it.',
    },
    {
      q: 'What does semi-conservative replication actually mean?',
      a: 'It means each daughter molecule keeps (is conserved by) one intact old strand and gains one newly built strand. After helicase unzips your helix, neither old strand is broken — each becomes a template, and pairing rules guide new nucleotides into place against it. The lab draws old strands in brass and new strands in teal so you can see that both finished daughters are half original and half fresh.',
    },
    {
      q: 'Can I use this DNA structure interactive on my phone?',
      a: 'Yes. The lab is pure client-side canvas and works with touch. Drag nucleotides slowly rather than flicking — the drop zones are generous but a slow drag keeps the connector line visible. The helix itself can be rotated by dragging sideways and zoomed with the ± buttons, and every action has a button or keyboard duplicate, so nothing depends on precise hovering.',
    },
    {
      q: 'Does the replication animation copy my exact sequence?',
      a: 'Yes — that is a point of honesty in the design. The new strands are filled with the exact complementary bases your original rungs specify, so both daughter molecules duplicate your built sequence base for base. The Chargaff card likewise counts the bases of the molecule you personally assembled, which is why A equals T and G equals C in your data every time you run it, even though every reset deals a different random sequence.',
    },
  ],
};
