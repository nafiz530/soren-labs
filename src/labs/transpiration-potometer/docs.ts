import type { DocsContent } from '../../engine/types';

/**
 * SEO guide page for the transpiration potometer lab.
 * Warm, plain-English, keyword-rich — written for someone meeting a
 * potometer for the first time or revising how transpiration is measured.
 */
export const transpirationDocs: DocsContent = {
  h1: 'Transpiration Virtual Lab — Bubble Potometer Experiment Online',
  intro:
    'Measure the rate of transpiration with a bubble potometer you operate yourself: cut the shoot under water, seal it through the bung with vaseline, charge the air bubble to zero with the tap, and then race it along the capillary tube while you change the fan, the mist, the lamp and the warmth — one factor at a time. This interactive transpiration simulation records your real readings, wobble and all, so the numbers you tabulate are genuinely yours.',
  sections: [
    {
      h2: 'What a potometer is and why this experiment works',
      body: [
        'A potometer is a device that measures how much water a plant takes up — and, at steady state, that uptake matches the water the plant loses as vapour through its leaves. That loss is transpiration, and it is normally invisible: water evaporates quietly inside the leaf and drifts away through tiny pores called stomata. The potometer makes it visible by sealing a freshly cut leafy shoot into a water-filled system with a long, thin capillary tube. As the shoot drinks, water is pulled through the tube, and a small air bubble introduced at the open end slides backwards along the scale.',
        'Because the tube is narrow, even a tiny volume of moving water shifts the bubble a measurable distance. Read the bubble position in millimetres against the ruler, note the time, and you have a rate in millimetres per minute — a direct, honest measurement of how fast the plant is transpiring. The instrument does not estimate anything for you: the clock counts simulated minutes while you work, and every reading in your table comes from a bubble you charged and watched yourself.',
        'In this virtual version the whole bench is yours. You choose how many leaves the shoot carries, you decide whether the desk fan blows gently or hard, you spray mist, you switch the lamp between bright and dim, and you warm the room from 20 °C to 30 °C. The plant responds the way a real one does — including the small, living wobble that means no two minutes ever repeat exactly.',
      ],
      bullets: [
        'A bubble potometer measures water uptake, which equals transpiration at steady state.',
        'Rate = bubble distance (mm) ÷ simulated time (min), read straight off the capillary ruler.',
        'The air bubble moves because transpiration pulls water through the shoot by cohesion.',
        'One condition change per run keeps every comparison honest.',
      ],
    },
    {
      h2: 'How to use the bubble potometer interactive, step by step',
      body: [
        'The lab opens with a leafy shoot standing in a trough of water and a pair of scissors on the bench. Your first job is the cut — and where you cut matters. Drag the scissors sideways through the stem while it is still under the water line and the water column stays whole. Use the tempting quick-cut button instead, and the stem is severed in air: an air lock creeps into the system, the bubble refuses to travel, and you will have to press the tap to flush the column before any run works. It is the classic potometer mistake, recreated honestly so the lesson sticks.',
        'Next, drag the rubber bung down into the reservoir mouth so the shoot seals the system, and smear vaseline from the jar around the joint with a slow drag. Skip the vaseline and the apparatus still runs — but a tiny leak keeps adding a small false bias to every reading, and the coach will flag it. Sealing well is what separates tidy data from drifted data.',
        'Press the tap and the bubble charges to zero as the clock starts. Let a simulated minute or more pass, watch the smoothed rate settle, and press Record: the condition set, leaf count, elapsed minutes, bubble position and rate all land in your table. Between runs, press the tap again to reset the bubble, change exactly one condition, and repeat. The playback control runs at real time or four times faster, so a slow, thirsty run never keeps you waiting.',
      ],
    },
    {
      h2: 'The factors affecting transpiration you can test here',
      body: [
        'Transpiration is driven by the difference between how damp the air inside the leaf is and how dry the air outside is — anything that widens that difference speeds the water loss, and anything that narrows it slows the flow. Moving air is the biggest accelerator in this lab: a strong fan sweeps the humid blanket away from the leaf surface roughly three times faster than a gentle breeze, and both clearly beat still air. Warmth helps too, because warmer air can hold more vapour and warmer molecules escape more energetically — at 30 °C the rate climbs noticeably above the 20 °C baseline.',
        'Light works through the stomata. In bright light the pores open wide and vapour pours out; switch the lamp off for the dim-room control and the stomata mostly close, so the rate collapses to a small fraction of the baseline. Leaf area matters in the simplest way of all: more leaves mean more evaporating surface, which is why the shoot selector offers 4, 8 or 12 leaves and why the rate scales with your choice.',
        'Mist is the brake. Spraying droplets around the shoot raises the humidity of the surrounding air, shrinking the vapour gradient that drives evaporation, and the bubble slows to less than half its still-air pace. Test each factor against a baseline taken at the same leaf count, and the multipliers emerge from your own table — moving air, light, warmth and leaf area on one side; mist and dim rooms on the other.',
      ],
      bullets: [
        'Moving air: strong fan ≈ 2.8× the still-air rate, gentle breeze ≈ 1.8×.',
        'Dim room: stomata mostly close — around 0.12× the bright-lamp rate.',
        'Warmth: 30 °C multiplies the rate by roughly 1.6 compared with 20 °C.',
        'Humidity: mist cuts the rate to about 0.45× by shrinking the vapour gradient.',
        'Leaf area: rate scales with leaf count — 4, 8 or 12 leaves.',
      ],
    },
    {
      h2: 'Reading your results: tables, travel curves and rates',
      body: [
        'Every recorded run adds a row to your observation table with the full condition set, the leaf count, the elapsed simulated minutes, the final bubble position and the rate averaged over the last simulated minute. Because the plant wobbles like a living thing — a few percent either way, minute by minute — repeated runs under identical conditions give slightly different numbers, exactly as repeat trials should. That wobble is not noise to be feared; it is the reason we take averages and compare like with like.',
        'The Observations tab also draws every run as a travel curve: bubble position against simulated minutes, with the live run highlighted and earlier runs faded. Steep lines are thirsty conditions, gentle slopes are humid ones, and a nearly flat line is your dim-room control. Reading the slopes against each other is the fastest way to see the whole story of the experiment at a glance.',
        'A second graph plots recorded rate against leaf count, with a fitted line. If you vary the number of leaves across your runs, the line shows how the rate scales with transpiring area — the steeper the slope, the thirstier each leaf. Together the table, the curves and the rate graph are everything a write-up needs: apparatus, method, results and a conclusion drawn from your own measurements.',
      ],
    },
    {
      h2: 'Technique, precision and the classic potometer errors',
      body: [
        'The potometer is famous for its failure modes, and this simulation reproduces the important ones on purpose. Cutting the shoot in air is the first: the severed vessels draw in an air pocket that blocks the water column, and nothing moves until you flush it out through the tap. The second is the unsealed joint: without vaseline around the bung, air sneaks in at the seam, tiny leak trails appear, and every reading drifts slightly fast — a small false bias that quietly spoils a comparison between runs.',
        'Changing two conditions at once is the third error, and the lab guards against it by marking any run affected by a mid-run change with an asterisk, so your table stays honest about which comparisons are clean. The fourth is impatience: recording after only a few seconds of simulated time gives the wobble too much influence. Let at least a simulated minute pass — longer is better — and the averaged rate settles into something you can trust.',
        'Good technique here is the same as at a real bench: cut fresh and under water, seal every joint, reset the bubble to zero before each run, keep the leaf count fixed while you compare conditions, and take a baseline before you change anything. Follow those habits and your table will tell one clean story; break each one once, meet the consequence, and you will never forget why the habit exists.',
      ],
    },
    {
      h2: 'Where transpiration sits in the bigger picture',
      body: [
        'Transpiration is not just water loss — it is the plant\u2019s plumbing in action. The evaporation from the leaves pulls the whole column of water up from the roots, molecule tugging on molecule by cohesion, in the transport stream that also carries dissolved mineral ions to every green cell. A thirsty plant in moving air is, in effect, running its own irrigation system upside-down: the leaves are the pump, the stem is the pipe, and the sun supplies the energy.',
        'The same physics explains the world outside the lab. Sheltered, humid glasshouses slow water loss; a hot, windy field multiplies it; and land plants have evolved waxy cuticles, rolled leaves and responsive stomata precisely because uncontrolled transpiration can drain a plant faster than its roots can refill it. When you watch the bubble crawl under mist and race under the fan, you are watching the balance every land plant negotiates every day.',
        'By the end of this experiment you should be able to look at any potometer reading and explain it: which factor moved it, roughly how far, and why. Better still, you will have felt the technique in your own hands — the underwater cut, the sealed bung, the charged bubble — which is the part of practical work that no description can substitute for.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I measure the rate of transpiration in this simulation?',
      a: 'Press the tap to charge the bubble to zero — the clock starts with the charge. Let at least one simulated minute pass, then press Record. The rate is the bubble\u2019s distance travelled in millimetres divided by the elapsed simulated minutes, averaged over the last minute so the plant\u2019s natural wobble does not dominate a short reading. Your recorded rates appear in the Observations table.',
    },
    {
      q: 'Why is my bubble not moving at all?',
      a: 'Almost always an air lock from a dry cut. If you cut the shoot above the water line — or used the quick-cut button — an air pocket blocks the water column. Press the tap to flush the lock out, then charge the bubble again. Cutting under water from the start avoids the whole problem.',
    },
    {
      q: 'Which factors increase the rate of transpiration?',
      a: 'Moving air (a strong fan is the biggest boost), bright light, warmth around 30 °C, and more leaves on the shoot. Mist and dim rooms lower the rate: mist raises the humidity around the leaves and shrinks the vapour gradient, while dim light makes the stomata mostly close. Test each against a baseline at the same leaf count.',
    },
    {
      q: 'Does the simulation measure water uptake or water loss?',
      a: 'The bubble measures water uptake through the shoot — but at steady state, when uptake and loss balance, the two are equal, which is exactly why a potometer is a trusted instrument for transpiration. The conclusion card asks about the factors, and your own table is the evidence either way.',
    },
    {
      q: 'Can I use this potometer experiment online on my phone?',
      a: 'Yes. The bench, the drag gestures and every control are built for touch as well as mouse, with comfortably sized buttons and selects on narrow screens. Every gesture also has a button or keyboard equivalent — Space or Enter on the canvas performs the next sensible step — so nothing depends on precise dragging alone.',
    },
  ],
};
