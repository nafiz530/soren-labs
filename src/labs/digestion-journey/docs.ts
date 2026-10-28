import type { DocsContent } from '../../engine/types';

/**
 * SEO guide page for the digestion-journey lab (docsSlug: digestive-system-virtual-lab).
 */
export const digestionDocs: DocsContent = {
  h1: 'Digestive System Virtual Lab — Follow a Sandwich from Mouth to Intestine',
  intro: 'Eat a sandwich, then steer it through the whole human digestive system with your own hands. Chew with salivary amylase, ride a peristalsis animation down the esophagus, acidify the stomach to pH 2 so pepsin can carve protein, emulsify fats with bile, and finish every nutrient with pancreatic juice — all while a live percentage table records what actually got digested, region by region. This digestion simulation is fully interactive, runs in your browser, and works on phones.',
  sections: [
    {
      h2: 'What you do in the digestion simulation',
      body: [
        'The lab opens with a friendly side-view cutaway of a person holding a sandwich — bread starch, protein and fat droplets bundled into one bolus. Nothing happens until you act. You drag a saliva token onto the mouth to switch salivary amylase on, then chew by tapping the lips or pressing the Chew button; the teeth visibly grind while starch squares begin splitting into smaller glucose-bound fragments. Only when you are satisfied do you swallow, and the bolus drops into the esophagus.',
        'From there the journey is a sequence of genuine gestures. Gastric juice is dragged onto the stomach — twice, usually, because pepsin only switches on near pH 2, and the live pH readout tells you exactly where you stand. Churning sloshes the chyme and speeds the chemical attack. In the small intestine you drag bile straight from the gall bladder and watch fat droplets shatter into a fine mist, then add pancreatic juice so amylase, protease and lipase finish all three nutrients. Tapping the intestinal wall opens a villi magnifier where you literally watch glucose being absorbed into capillary blood. The journey ends in the colon, where water is reclaimed and the leftover fibre firms up on its way to the rectum.',
        'Every action has a keyboard and button duplicate, so the whole experiment can be run without a mouse. Each enzyme token also glows on its target organ while you drag, which makes the anatomy self-explanatory without a single label cluttering the scene — all organ names live in the side panel.',
      ],
      bullets: [
        'Drag saliva, gastric juice, bile and pancreatic juice onto the correct organ.',
        'Tap the mouth to chew; tap the intestine wall to open the villi magnifier.',
        'Live pH readout, nutrient percentage meters and a per-region observation table.',
        'Space / Enter always performs the next sensible action on the journey.',
      ],
    },
    {
      h2: 'How enzymes in digestion really work',
      body: [
        'The scientific heart of this lab is enzyme specificity. An enzyme is a protein with an active site shaped to fit one substrate — the lock-and-key idea. Salivary and pancreatic amylase grip starch and split it into glucose fragments; pepsin and pancreatic protease grip protein and carve it into peptides and then amino acids; lipase grips fat and dismantles it into fatty acids and glycerol. In the simulation, each particle class only responds to its own enzyme, so if you never add bile, fat visibly survives the entire tract while starch and protein disappear around it.',
        'Conditions matter as much as shapes. Pepsin is unusual: it evolved for the stomach acid, with an optimum around pH 2, and it stops working once the alkaline pancreatic juice arrives in the small intestine. The lab honours that — add pepsin-containing gastric juice and the pH readout falls until the protein attack begins; release the chyme and a coach note explains that the enzyme cast has changed. It is a small moment, but it is the difference between memorising a table and understanding one.',
        'Bile is the other honest subtlety. Bile salts are not enzymes and never digest anything: they are detergents that shatter big fat droplets into a micro-mist, multiplying the surface area lipase can attack. The lab makes the consequence measurable — run lipase without bile and fat crawls downhill at a trickle; add bile and the same enzyme races through the same amount of work. Surface area, not chemistry, is what changed.',
      ],
      bullets: [
        'Amylase → starch → glucose (salivary glands and pancreas).',
        'Pepsin → protein → peptide fragments (stomach, pH ≈ 2 only).',
        'Protease → peptides → amino acids (pancreas, alkaline).',
        'Lipase → emulsified fat → fatty acids + glycerol (pancreas, fast only after bile).',
      ],
    },
    {
      h2: 'The peristalsis animation and the rest of the journey',
      body: [
        'Swallowing in this lab is not a fade-out between scenes. The esophagus is drawn as a living tube: a ring of muscle contracts behind the bolus and the visible bulge travels downward, with the wall squeezed narrow behind it — an honest slow wave, not a video loop. The same peristaltic shimmer idles along the intestine all the time, so the tract always looks alive even before you act.',
        'The stomach is a J-shaped pouch with rugae folds and a sloshing acid pool whose wobble follows your churning. The small intestine is a long coiled tube with a dashed flow shimmer, framed by the large intestine drawn with haustra bulges — ascending, transverse and descending colon — before the sigmoid and rectum finish the route. Accessory organs sit where anatomy puts them: liver and gall bladder feeding bile down a duct, the pancreas peeking from behind the stomach.',
        'The finale is absorption. Tap the coiled intestine and a magnifier inset appears: finger-shaped villi with a red capillary weaving behind them. Glucose squares, amino-acid triangles and fatty-acid droplets drift out of the lumen, cross the villi and vanish — each with a small flash and a soft ping. The counter in the side panel totals every particle absorbed, so absorption becomes a number, not a vague arrow on a poster.',
      ],
    },
    {
      h2: 'Reading your data: the observation table and curves',
      body: [
        'Digestion is quantitative in this lab. The moment food leaves each region, a row is recorded: region, enzymes you actually added, the pH there, and the percentage of starch, protein and fat still undigested. Skip a secretion and the table says so for the rest of the journey — 100% fat remaining in the small intestine line is a permanent record that bile never arrived.',
        'Once two or more regions are recorded, a chart draws the three nutrient curves along the journey. Healthy runs bend downward in the mouth (starch), the stomach (protein) and the small intestine (everything); broken runs keep one line stubbornly high, and the shape of the line points straight at the missing enzyme. An enzyme reference card sits beside it — enzyme, source, substrate, end-product, optimum conditions — and each row lights up the first time you use that secretion, building the reference from your own experiment.',
        'The lab closes with two conclusion questions: why enzymes are specific, and why fat needs bile. Answer both correctly and a milestone fires — the lab’s way of checking that the data you generated has turned into an idea you can state in your own words.',
      ],
      bullets: [
        'Per-region rows: region · enzymes added · pH · starch % · protein % · fat % remaining.',
        'Nutrient curve chart drawn from your own recorded rows.',
        'Enzyme reference card that highlights each enzyme as you use it.',
        'Conclusion questions unlock the final milestone and badge.',
      ],
    },
    {
      h2: 'Technique: how to run a clean experiment',
      body: [
        'Treat the journey like a controlled experiment. Chew fully before swallowing — the thorough-chewer badge lands when starch is at least 40% broken down in the mouth, and mechanical breakdown speeds every later enzyme by giving it more surface. Add gastric juice twice and watch the pH meter rather than guessing; pepsin at pH 4 is pepsin asleep. Churn a few times while protein digests, and release the chyme once protein is well carved rather than rushing.',
        'In the small intestine, order matters for the lesson even though the journey allows either: add bile before pancreatic juice and lipase visibly races; do it the other way and you get the coach moment about lipase crawling on big droplets. Open the villi magnifier while glucose is actively being absorbed — the absorb-watcher badge only counts if you watched. Finally, read the table before answering the conclusion; every wrong skip is visible in it.',
        'The playback control (1×, 2×, 4×) changes the speed of the whole simulation, including the journey clock, so the recorded numbers stay consistent however fast you travel. Reset returns the sandwich to the mouth untouched and clears the table for a fresh comparison run.',
      ],
    },
    {
      h2: 'Who this is for and how it fits real biology',
      body: [
        'This lab is written for anyone meeting digestion for the first time — no prior biology needed. Every term (bolus, chyme, emulsification, villi) appears first as something you do or watch, then as a word in the notes. Because the model is honest about enzyme specificity, pH optima and surface area, what you learn here transfers directly to textbooks and laboratory work on enzymes and nutrition.',
        'The scene is deliberately diagrammatic rather than gory: a clean, warm-coloured cutaway of a person, with organs drawn as friendly shapes and all names kept in the side panel. Sound is synthesised live — chews, sloshes, drips and a soft ping per absorbed particle — and can be muted from the toolbar. The whole thing is a single web page: no accounts, no downloads, and touch targets sized for phones.',
        'One honest simplification: the timeline is compressed. A real sandwich spends hours in the stomach and the small intestine; here the same chemistry runs in minutes so a full experiment fits in one sitting. The percentages, the pH values and the enzyme behaviours are the parts that stay true.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I add enzymes in the digestive system virtual lab?',
      a: 'Drag the coloured token from the tray at the bottom of the scene onto the matching organ — saliva to the mouth, gastric juice to the stomach, bile and pancreatic juice to the small intestine. You can also drag bile directly from the gall bladder. Every gesture has a button duplicate in the control panel, and Space or Enter performs the next sensible action.',
    },
    {
      q: 'Why is fat not digesting in my run?',
      a: 'Almost always because bile is missing. Lipase only attacks the surface of fat droplets, and big droplets have very little surface. Drag bile from the gall bladder onto the small intestine first: the droplets visibly emulsify into a fine mist and lipase immediately speeds up. Skipping bile is allowed — the observation table will record fat surviving the whole journey.',
    },
    {
      q: 'Why does pepsin stop working after the stomach?',
      a: 'Pepsin is specialised for acid, with an optimum around pH 2. When chyme enters the small intestine, alkaline pancreatic juice neutralises it and pepsin is switched off — a new protease from the pancreas takes over. The lab shows this with the live pH readout and a coach note the moment it happens.',
    },
    {
      q: 'Can I use this digestion simulation on my phone?',
      a: 'Yes. The canvas, controls and observation tables are responsive; the token tray sits at the bottom of the scene with finger-sized hit areas, and all buttons are at least 38 px tall. It runs in any modern browser with no installation.',
    },
    {
      q: 'What do the badges mean?',
      a: 'They record genuine technique: thorough chewer (starch ≥ 40% broken down before swallowing), acid mixer (stomach at pH ≈ 2 with pepsin active), emulsifier (bile added and droplets visibly misted), absorb watcher (villi magnifier open while glucose was being absorbed), and journey complete (mouth to rectum with all three nutrients at least 90% digested).',
    },
  ],
};
