import type { DocsContent } from '../../engine/types';

export const refractionDocs: DocsContent = {
  h1: 'Refraction of Light Through a Glass Slab Virtual Lab — Snell\u2019s Law & Refractive Index',
  intro:
    'Aim a ray of light through a rectangular glass slab, read the incident and refraction angles off a live protractor, and hunt down the refractive index with your own hands. Drag the light box around its arc, sweep the angle of incidence from 0° to 60°, record each pair of angles, and watch your sin i versus sin r graph assemble itself into a straight line whose slope is n — the whole classic glass slab experiment, rebuilt for your browser with honest physics and a mentor that keeps you on track.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with a rectangular glass slab sitting in the middle of an optical table. On the left, a light box emits a narrow ray aimed at the centre of the slab\u2019s left face. You grab the box — with a mouse, a finger, or the angle slider if you prefer — and drag it along its arc, sweeping the angle of incidence from perpendicular incidence up to a steep 60°. A dashed normal and a live protractor with degree ticks frame the point of incidence, so the angle you set is the angle you can actually verify.',
        'As the ray crosses into the glass it bends toward the normal, crosses the slab, and bends again at the far face. The panel reads both angles honestly: set 30° and the glass really does give 19.5°, because the simulation computes r from Snell\u2019s law rather than animating a guess. Record the pair, sweep to a fresh angle, and repeat — five recorded pairs is enough to make the analysis decisive.',
        'Meanwhile the drawing keeps teaching: the emergent ray leaves parallel to the incident ray but shifted sideways, a faint partially reflected ray brightens as the angles steepen, and travelling light pulses visibly slow down inside the glass — exactly as they should, by a factor of n.',
      ],
    },
    {
      h2: 'The physics: Snell\u2019s law and the refractive index',
      body: [
        'Refraction happens because light changes speed when it passes between materials. The refractive index n of a material is the ratio of light\u2019s speed in vacuum to its speed in that material, and the bending at a boundary follows Snell\u2019s law, with both angles measured from the normal — the line perpendicular to the surface at the point of incidence:',
      ],
      bullets: [
        'n\u2081 sin i = n\u2082 sin r — Snell\u2019s law for light crossing a boundary',
        'For air into glass (n\u2081 \u2248 1): sin i = n sin r, so n = sin i / sin r',
        'Plot sin i against sin r: a straight line through the origin whose slope is the refractive index',
        'Lateral shift through a parallel-sided slab: d = t·sin(i − r)/cos r — it grows as i grows',
        'A fraction of the light also reflects at each face, faint at small angles and stronger toward grazing incidence',
      ],
    },
    {
      h2: 'Reading the protractor like a real experimenter',
      body: [
        'The single most common mistake in this experiment is measuring angles from the surface instead of from the normal. Snell\u2019s law is defined with angles measured between the ray and the normal — which is why the lab draws the dashed normal lines at both faces and hangs its protractor arc directly on the point of incidence. When you drag the light box, the shaded wedge between the ray and the normal is exactly the angle the panel reports, so what you see is what you record.',
        'Good data needs spread. Five pairs clustered between 25° and 35° give a short, nervous line; pairs spread from near 0° up to 55° or 60° anchor the line across its whole range and pin the slope down tightly. The 0° reading is quietly powerful: at normal incidence the ray passes straight through unbent, which forces the fitted line through the origin and makes the slope — your n — far harder to fool.',
        'Steep angles earn their keep twice over. The lateral shift of the emergent ray grows rapidly with angle, which the bench marks with a small bracket you can watch widen, and the faint reflected ray at the entry face brightens as the incidence steepens — a first glimpse of why a window glints more when you view it at a slant.',
      ],
    },
    {
      h2: 'Why the emergent ray stays parallel — and what the slab teaches',
      body: [
        'A rectangular slab is deliberately chosen over a prism for this experiment because its two faces are parallel. Whatever bending the first face introduces, the second face exactly undoes: the ray inside the glass travels at angle r to the normal, and on leaving it bends back to the original angle i. The emergent ray therefore emerges parallel to the incident ray, only displaced sideways by the lateral shift — a geometry you can check directly on the bench with a ruler, and one the lab draws honestly at every angle.',
        'That sideways shift is not a defect; it is a measurement. Because d = t·sin(i − r)/cos r depends on both the slab thickness and the refractive index, careful readings of the shift at known angles offer a second, independent route to n. Watching the shift balloon between 40° and 60° builds the intuition that refraction effects are mild at small angles and dramatic at large ones — the same intuition that later makes lenses, mirages and rainbows feel inevitable rather than magical.',
        'The slab also quietly demonstrates that refraction is lossless bookkeeping: light enters, slows, bends, speeds back up, and leaves on a parallel path. The fraction that reflects instead is small but never zero, and the lab\u2019s faint reflected ray — invisible near 0°, clearly there near 60° — is the honest remainder.',
      ],
    },
    {
      h2: 'Sources of error and honest technique',
      body: [
        'In a school lab the dominant errors are reading the protractor at a slant (parallax), a protractor whose centre does not sit exactly on the point of incidence, and angles recorded from the surface rather than the normal. The virtual bench removes the first two — the protractor is pinned to the incidence point and the readouts come from the same geometry the rays are drawn from — but the discipline of measuring from the normal remains entirely yours.',
        'The simulation quantises your drag to half-degree steps, a deliberate echo of real protractor resolution, and computes every refraction angle from Snell\u2019s law with the glass set to n = 1.5. Your fitted slope should therefore land within about one percent of 1.5 with careful, well-spread angles; if it drifts further, the usual culprit is a cluster of angles all in one narrow range. The fix is the same as in any laboratory: more reach, more readings.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'This experiment is a cornerstone of introductory optics everywhere — the first place most people meet Snell\u2019s law, refractive index and the idea that angles are measured from normals. The lab is built for anyone meeting refraction for the first time as well as students revising the method before writing it up: the mentor walks newcomers through aiming, reading and recording, while the live sin table, fitted line and error-versus-1.5 readout give confident learners something to optimise.',
        'It runs entirely in the browser on a phone, tablet or desktop — no downloads, no plugins, synthesized sound and touch-first controls throughout. Drag the light box with a finger, or use the slider; every reading you record comes from the same honest geometry the rays are drawn from.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I find the refractive index of a glass slab?',
      a: 'Set five or more angles of incidence spread from near 0° up to about 60°, and for each one record the angle of incidence i and the angle of refraction r read from the normal. Plot sin i against sin r, fit the best straight line, and read the refractive index directly off the slope: n = sin i / sin r. With the lab\u2019s crown glass (n = 1.5) careful readings land within about one percent.',
    },
    {
      q: 'Why is the emergent ray parallel to the incident ray in a glass slab?',
      a: 'Because the two faces of the slab are parallel. The first face bends the ray toward the normal, taking it from angle i in air to angle r in glass; the second face bends it away from the normal by exactly the same amount, taking it from r back to i. The net effect is a parallel ray that has merely been shifted sideways.',
    },
    {
      q: 'What is lateral shift and how does it change with angle?',
      a: 'Lateral shift is the perpendicular distance between the original direction of the ray and the emergent ray. For a slab of thickness t it is d = t·sin(i − r)/cos r, so it is zero at normal incidence and grows steeply as the angle increases — try 50° or 60° on the bench and watch the bracket between the rays open up.',
    },
    {
      q: 'Why are angles measured from the normal instead of the surface?',
      a: 'Because Snell\u2019s law is defined that way: the sines in n\u2081 sin i = n\u2082 sin r refer to the angles between the ray and the normal (the line at 90° to the surface). Measuring from the surface instead silently swaps each angle for its complement and wrecks the relationship. The lab draws dashed normals at both faces so the correct angles are always the obvious ones.',
    },
    {
      q: 'Can I use this lab on my phone or tablet?',
      a: 'Yes. The bench is touch-first: drag the light box with a finger along its arc, and every control is sized for touch. The angle slider and keyboard arrows work too, and the layout adapts from desktop to phone with no downloads or plugins.',
    },
  ],
};
