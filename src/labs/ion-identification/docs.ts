import type { DocsContent } from '../../engine/types';

export const ionIdentificationDocs: DocsContent = {
  h1: 'Ion Identification Virtual Lab — Flame Tests and Precipitates for Cations and Anions',
  intro:
    'Three unknown salt solutions wait in a rack, and your job is to name both ions in every one of them. Drag a platinum wire loop into a sample and roast it in a roaring Bunsen flame to read the golden-yellow of sodium or the fleeting lilac of potassium. Drip sodium hydroxide down the side and watch a light-blue, dirty-green or rust-brown precipitate settle out. Catch the ammonium ion with nothing but a strip of damp red litmus, and settle the anion with silver nitrate, barium chloride or dilute acid. Every completed test writes its observation and inference into an evidence table — a deduction engine, not a memory test.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with three unknown solutions taped amber, teal and violet, plus one checkered reference tube holding a known sodium carbonate you can compare against at any time. You pick an unknown with the selector — or by tapping its tube on the bench — and a pulsing ring marks your working sample. The tools are all real bench tools: a platinum loop hanging by the burner, four dropper bottles on the shelf, and a damp red litmus strip on its stand.',
        'Every test is a genuine gesture. Drag the loop into a tube and it dips, loads a film of solution and rides into the hottest part of the flame, painting it with that cation’s colour. Drag a bottle over a tube and it tips and drips three drops, one by one, before the reaction plays out in front of you. Drag the litmus strip to the mouth of a tube you have already made alkaline and watch it warm, fizz gently and turn blue if ammonia is escaping.',
        'Each completed test automatically becomes a row in your evidence table — the test, the exact observation, and the inference it supports. When the pattern is clear, you name the cation and the anion for that tube from dropdowns and close the case. A correct call earns a milestone and reveals the salt’s full name; a wrong call never tells you off — it points you at the strongest evidence you have not used yet.',
      ],
    },
    {
      h2: 'The science of flame tests',
      body: [
        'Hold a metal ion in a flame hot enough and its outer electrons absorb energy and jump to higher levels; when they fall back they emit light of very specific wavelengths. Because each element’s energy levels are its own, each cation paints the flame a characteristic colour — and the colour, not the brightness, is what identifies it. Sodium’s electrons emit a golden-yellow so intense that a trace of contamination paints the whole flame, which is why the loop must be clean and why potassium’s delicate lilac is so easily buried.',
        'Potassium’s colour is famously fleeting — gone almost as you see it — so chemists view it through a piece of cobalt-blue glass that filters away sodium’s yellow glare and lets the lilac show. This bench slides the cobalt glass in for you whenever a potassium flame burns. Iron and ammonium ions give no distinctive flame colour at all, and that silence is itself evidence: it sends you to the hydroxide and gas tests instead.',
      ],
      bullets: [
        'Na⁺ — persistent golden-yellow flame (hard to miss, harder to wash off the loop)',
        'K⁺ — lilac flame, fleeting, classically viewed through cobalt glass',
        'Ca²⁺ — brick-red flame',
        'Cu²⁺ — blue-green flame',
        'Fe²⁺, Fe³⁺ and NH₄⁺ — no characteristic flame colour',
      ],
    },
    {
      h2: 'Wet tests: precipitates and the gas you cannot see',
      body: [
        'Adding sodium hydroxide dropwise hands hydroxide ions to the solution, and any cation that forms an insoluble hydroxide drops out of solution as a precipitate you can name by colour: copper(II) gives a light-blue gel, iron(II) a dirty-green one, iron(III) a rust-brown one. Sodium, potassium and calcium hydroxides stay dissolved, so those ions stay silent — and ammonium never precipitates at all.',
        'Ammonium ions do something better than precipitate: in the warm alkaline mixture they convert quietly into ammonia gas, the only common alkaline gas. Damp red litmus paper held at the mouth of the tube turns blue as the ammonia reaches it. That is why the order matters — NaOH first to make the mixture alkaline, then warmth, then the paper at the mouth where the gas escapes. The bench enforces the order gently and explains it when you try to skip ahead.',
        'The anion tests finish the story. Dilute hydrochloric acid warmed with a carbonate gives brisk effervescence, and the escaping carbon dioxide clouds lime water as insoluble calcium carbonate — the reference tube shows you both. Barium chloride catches sulfate as a dense white precipitate of barium sulfate. Silver nitrate, acidified with nitric acid, catches chloride as a curdy white precipitate of silver chloride that visibly greys in the light as the salt decomposes to silver.',
      ],
      bullets: [
        'Cu²⁺ + 2OH⁻ → Cu(OH)₂(s) — light-blue precipitate',
        'Fe²⁺ + 2OH⁻ → Fe(OH)₂(s) — dirty-green precipitate',
        'Fe³⁺ + 3OH⁻ → Fe(OH)₃(s) — rust-brown precipitate',
        'NH₄⁺ + OH⁻ → NH₃(g) + H₂O — ammonia turns damp red litmus blue on warming',
        'CO₃²⁻ + 2H⁺ → H₂O + CO₂(g) — the gas turns lime water milky',
        'Ba²⁺ + SO₄²⁻ → BaSO₄(s) — dense white precipitate',
        'Ag⁺ + Cl⁻ → AgCl(s) — curdy white precipitate, darkening in light',
      ],
    },
    {
      h2: 'Working like a qualitative analyst',
      body: [
        'Real qualitative analysis is a logic tree, and the order of the branches is not decoration. Acid comes first among the anion tests because acid destroys carbonate: until carbonate has been ruled out, a white precipitate with barium could be barium carbonate rather than barium sulfate. Silver nitrate is kept acidified with nitric acid for the same reason. Cross-checks matter just as much for cations — a blue-green flame agrees with a light-blue precipitate, and two independent confirmations before you name an ion is the professional habit this bench trains.',
        'The evidence table is your case file, and it fills itself as you work: every completed test writes its observation and its inference, with a colour swatch for flames and precipitates. Negatives are recorded as faithfully as positives — “no effervescence on warming” is a real row that eliminates carbonate, and “no characteristic flame colour” steers you toward the iron and ammonium tests. When you close a case wrongly, the coach does not hand over the answer; it points at the test you skipped or the row you under-read.',
      ],
    },
    {
      h2: 'Technique, cross-checks and classic errors',
      body: [
        'The errors this lab models are the ones that trip up real benches. A flame test on a loop that has not been heated clean paints every sample sodium-gold — the bench keeps its loop honest, but the reference tube demonstrates how total sodium’s glare can be, which is exactly why cobalt glass exists for potassium. Potassium’s colour vanishes in about a second, so the bench lets you replay the test as often as you like; watching for it twice is good practice, not cheating.',
        'Skipping the NaOH step makes the litmus test meaningless, and adding barium chloride before acid would let carbonate masquerade as sulfate — the bench blocks the first and teaches the second through the reference. The gentlest error of all is closing a case on a single test: one observation identifies nothing on its own, and the mentor keeps nudging you back to the table until your two ion names each stand on more than one row of evidence.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This is a Master-tier bench for anyone meeting qualitative analysis for the first time and for anyone revising it who wants their hands back on the tools. Nothing is corrosive, nothing is hot, and the only casualty of a wrong call is a dropdown — which is exactly what makes it safe to guess, check and guess again. The mentor walks newcomers through six steps, from choosing an unknown to closing all three cases, while the evidence table and the deduction hints give confident learners something to sharpen against.',
        'Everything runs in the browser on a phone, tablet or desktop with touch-first gestures — drag the bottles, the loop and the litmus strip with a finger — synthesized sound for drips, fizzing, glassware and the burner’s soft roar, and no downloads or accounts. Resetting the bench deals three fresh unknowns from a pool of seven salts, so every session asks the question again.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I identify an unknown salt in qualitative analysis?',
      a: 'Work both halves of the salt separately. For the cation: run a flame test (Na⁺ golden-yellow, K⁺ lilac, Ca²⁺ brick-red, Cu²⁺ blue-green), then add NaOH dropwise and read the precipitate colour (Cu²⁺ light blue, Fe²⁺ dirty green, Fe³⁺ rust brown; no precipitate points to Na⁺, K⁺, Ca²⁺ or NH₄⁺). For the anion: AgNO₃ acidified with HNO₃ gives a curdy white precipitate for Cl⁻, BaCl₂ gives a dense white precipitate for SO₄²⁻, and dilute HCl warmed gives effervescence for CO₃²⁻. Confirm with a second test before you name the salt.',
    },
    {
      q: 'Why is potassium’s flame colour viewed through cobalt glass?',
      a: 'Potassium’s lilac is faint and vanishes in about a second, while even a trace of sodium contamination paints the flame a strong golden-yellow that hides it. Cobalt-blue glass absorbs the yellow sodium light and passes the lilac, so the potassium colour becomes visible. The virtual lab slides a cobalt pane in front of the flame automatically whenever a potassium sample burns.',
    },
    {
      q: 'Why does the silver chloride precipitate turn grey in the light?',
      a: 'Light decomposes silver chloride into tiny particles of metallic silver, which look grey-violet next to the white precipitate. It is the same chemistry that made photographic film work. In this lab the curdy white precipitate from the AgNO₃ test visibly darkens over a few seconds — a nice confirmation that the precipitate really is AgCl, and therefore that chloride is present.',
    },
    {
      q: 'Why do I have to add NaOH before the litmus test for ammonium?',
      a: 'Ammonium ions only release ammonia gas when the mixture is alkaline and warm: NH₄⁺ + OH⁻ → NH₃ + H₂O. Without NaOH the ions stay quietly in solution and the damp red litmus at the mouth stays red no matter how long you warm it. The lab asks you to add NaOH first, then hold the litmus at the tube mouth while the mixture warms — the strip turns blue only if ammonia is actually escaping.',
    },
    {
      q: 'Can I use this ion identification lab on my phone or tablet?',
      a: 'Yes. The bench is touch-first: drag the dropper bottles, the platinum loop and the litmus strip with a finger, tap tubes to select them and tap the burner to light it. Every control is sized for touch, and the buttons below the scene run any test for you if dragging is awkward. It works equally well with a mouse and keyboard — Space adds NaOH to the working tube and keys 1 to 4 switch samples.',
    },
  ],
};
