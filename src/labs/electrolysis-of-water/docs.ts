import type { DocsContent } from '../../engine/types';

export const electrolysisDocs: DocsContent = {
  h1: 'Electrolysis of Water Virtual Lab — Split Water Into Hydrogen and Oxygen',
  intro:
    'Close the switch on a Hofmann voltameter and watch water come apart at two platinum electrodes: a thick stream of hydrogen bubbles rising into the left tube, a thinner stream of oxygen into the right. Record the volumes as the columns build, drag a burning splint to the hydrogen outlet for its famous pop, and wake a glowing splint back into flame with the oxygen. This is electrolysis of water, rebuilt so your hands do the switching, the measuring and the flame tests — with a 2 : 1 volume ratio you can check against the equation yourself.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens on a Hofmann voltameter: a tank of water acidified with a little dilute sulfuric acid, two inverted graduated tubes standing over platinum electrodes, and a battery pack wired through an ammeter and a brass knife switch. You pick a supply voltage — 6, 9 or 12 volts — and close the switch. Within a moment, small bubbles stream off both electrodes and rise into the tubes, pushing the water levels down and building two gas columns that you read off the graduations in the side panel.',
        'As the gases collect you record volume pairs into your observations table: the simulated time, the hydrogen volume, the oxygen volume and the computed ratio. A live graph plots both volumes against time so you can watch the hydrogen line climb exactly twice as steeply as the oxygen line. Gas gathers slowly at real time, honestly slowly — the Speed selector hurries the clock without touching the chemistry, and raising the battery voltage raises the current and the collection rate together.',
        'When the columns are deep enough comes the payoff. You drag the burning splint from its stand to the left tube’s gas outlet and release it: a bright flash and a loud pop confirm hydrogen. Then you drag the glowing splint to the right outlet and watch its dull ember burst back into open flame — the classic proof of oxygen. Both tests consume a little of the gas, exactly as opening a real tap would.',
      ],
    },
    {
      h2: 'The chemistry: why water splits into two gases',
      body: [
        'Pure water is a very poor conductor, so a little dilute sulfuric acid is added as an electrolyte. The acid supplies mobile ions that carry the charge through the cell, while the water itself is the substance that gets decomposed at the platinum electrodes. The overall change is the simplest decomposition in chemistry:',
        'The electrodes are platinum on purpose. Platinum is almost perfectly inert: it happily hands electrons over to ions and takes them back without dissolving or joining in the reaction itself. A reactive metal such as copper or iron would oxidise away at the positive terminal and muddy the oxygen reading — one of the classic ways this experiment quietly goes wrong — so the inert electrodes keep the products honest and the ratio clean.',
      ],
      bullets: [
        '2H₂O(l) → 2H₂(g) + O₂(g) — the overall equation',
        'Cathode (−): 2H⁺(aq) + 2e⁻ → H₂(g) — hydrogen appears at the negative electrode',
        'Anode (+): 2H₂O(l) → O₂(g) + 4H⁺(aq) + 4e⁻ — oxygen is released at the positive electrode',
        'Equal volumes of gas contain equal numbers of molecules, so V(H₂) : V(O₂) = 2 : 1',
        'The sulfate ions only shuttle charge — the acid is not consumed',
      ],
    },
    {
      h2: 'Testing hydrogen and oxygen with splints',
      body: [
        'The two product gases are identified by their behaviour in a flame, and the lab gives you both classic tests with real gestures. Hydrogen burns extremely fast — when a burning splint meets hydrogen, the gas in the tube ignites in an instant with a sharp pop and a bright flash. That bark is the accepted test for hydrogen: hold the flame at the outlet of the tube, listen, and keep your fingers at the far end of the splint as you would on a real bench.',
        'Oxygen does not burn itself, but it dramatically feeds anything that does. A splint that has gone out but still carries a glowing ember will burst back into full flame the moment it meets oxygen — so the test for oxygen is a glowing splint, not a burning one. In the lab you will notice the distinction is forced on you: bring the burning splint to the oxygen outlet and the flame merely flares brighter; bring the glowing splint and it relights. Bring the glowing splint to hydrogen and it just fades. The right tool for each gas is part of the learning.',
        'A safe habit worth forming here: test gases one at a time, and only after a decent column has collected. A half-empty tube gives a feeble pop and an ambiguous relight, which is why the lab waits for at least a millilitre or so before it lets the tests fire properly.',
      ],
    },
    {
      h2: 'Measuring the 2 : 1 volume ratio',
      body: [
        'The heart of the experiment is a number, not a bang. Because hydrogen and oxygen molecules take up essentially the same volume each under the same conditions, the equation’s 2 : 2 : 1 split shows up directly in the tubes: for every millilitre of oxygen, two millilitres of hydrogen appear. The observation table computes the ratio from your own recorded volumes, and the graph draws both volume–time lines so the two-to-one gap is something you see, not just something you are told.',
        'The rate at which the columns grow is honest electrolysis physics. Current equals voltage divided by the cell’s resistance, and Faraday’s law converts current straight into gas: every two coulombs of charge liberates one hydrogen-volume equivalent at the cathode, four coulombs per oxygen at the anode. That is why doubling the battery voltage doubles the bubbles and the slope of your graph — while the ratio between the two lines never moves. Record a run at 6 V and another at 12 V and the comparison writes itself.',
      ],
    },
    {
      h2: 'Errors, accuracy and what the simulation models',
      body: [
        'On a real bench this experiment collects a bundle of small errors. Oxygen is noticeably more soluble in water than hydrogen, so the oxygen column lags slightly at the start; gas collected over water is damp, so volumes read a touch high; and reading a wobbling meniscus against a graduation invites a judgement error of a fraction of a millilitre. Reading too early is the biggest trap of all — at one millilitre of oxygen, a tenth-millilitre reading error shifts the ratio by ten percent, while at ten millilitres the same error is one percent.',
        'The simulation keeps the parts that teach and quietly repairs the rest. Volumes follow Faraday’s law with no more than about one percent of jitter, so the 2 : 1 ratio is always there to be measured but never given away for free; the display rounds to a tenth of a millilitre exactly like a real graduation, so recording early still punishes you with a ragged ratio; and when a tube finally fills, the bench opens the switch by itself so a capped column can never quietly spoil the pair. Collect past a few millilitres, record, and your ratio will settle within a few percent of 2.00 : 1 — which is precisely the accuracy a careful pair of hands achieves with glassware.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This experiment is a cornerstone of introductory electrochemistry everywhere, and the virtual bench is built for anyone meeting electrolysis for the first time as well as students revising it. A lab mentor walks newcomers through the procedure step by step — inspect the apparatus, close the switch, watch the columns, record, then run both flame tests — while the data table, the dual-series graph and the live ratio readout give confident learners something to probe: change the voltage mid-run and watch the graph kink, or chase the cleanest 2.00 : 1 they can record.',
        'Everything runs in the browser on a phone, tablet or desktop: drag the splints with a finger or a mouse, click the switch, and hear every pop, ping and click synthesized live with no downloads. If you can close a switch and hold a splint, you can split water.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I test for hydrogen in the electrolysis of water?',
      a: 'Collect a decent column of the gas, then hold a burning splint at the tube’s outlet. Hydrogen ignites instantly with a loud pop and a bright flash — that bark is the positive result. In this lab you drag the burning splint to the left tube’s outlet and release it to run the test.',
    },
    {
      q: 'Why is hydrogen collected at the cathode and oxygen at the anode?',
      a: 'The cathode is the negative electrode, and hydrogen ions (H⁺) are positive — they migrate to it, gain electrons and leave as hydrogen gas. The anode is positive, and there water molecules lose electrons and release oxygen. So hydrogen always collects over the negative electrode, oxygen over the positive one.',
    },
    {
      q: 'Why is twice as much hydrogen produced as oxygen?',
      a: 'The equation 2H₂O → 2H₂ + O₂ makes two molecules of hydrogen for every one of oxygen. Because equal gas volumes contain equal numbers of molecules at the same conditions, the volumes come out in the same 2 : 1 proportion — two millilitres of hydrogen for every one of oxygen, whatever the voltage or how long you run it.',
    },
    {
      q: 'What does the sulfuric acid do — is it consumed?',
      a: 'Pure water conducts far too poorly to carry a useful current, so dilute sulfuric acid is added as an electrolyte: it supplies the ions that carry the charge. The sulfate ions just shuttle around the loop and are not discharged, so the acid is not used up — water is the only substance being split.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is built touch-first: tap the switch, drag the splints with a finger, and use the record button with a thumb. It works equally well with a mouse and keyboard on desktop, and all the sound is synthesized live in the browser — nothing to install.',
    },
  ],
};
