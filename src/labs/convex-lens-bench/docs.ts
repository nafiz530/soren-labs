import type { DocsContent } from '../../engine/types';

export const lensBenchDocs: DocsContent = {
  h1: 'Convex Lens Virtual Lab — Find the Focal Length by the u–v Method',
  intro:
    'Slide an object along a virtual optical bench, drag the screen until the inverted image snaps into focus, and record pair after pair of object and image distances. Plot 1/v against 1/u and the intercept of the line hands you the focal length — the classic bench method, rebuilt so your hands do the focusing and the ray diagram redraws itself live as you work.',
  sections: [
    {
      h2: 'What you will do in the lab',
      body: [
        'The bench opens with an orange object arrow standing on a slider track to the left of a convex lens, with a white screen further right. You drag the object along its track to set the object distance u, and three principal rays redraw themselves instantly: the parallel ray bending through the far focus, the centre ray passing straight, and the focal ray emerging parallel. Where they cross, the image forms.',
        'Your job is to drag the screen along the bench until the image is razor sharp. A live sharpness meter falls to zero blur only at the true image distance, and a soft ping confirms the moment of perfect focus. Press Record and the pair (u, v) lands in your table together with 1/u and 1/v — then move the object and do it again.',
        'Five pairs later, the Observations tab plots 1/v against 1/u. The points fall on a straight line with slope one, and its intercept is 1/f — the lab computes your focal length from your own data and compares it with the true 10 cm. Push the object inside the focal length once and the rays refuse to meet: the coach steps in to explain magnifying-glass territory, where only a virtual image exists and no screen position will ever focus it.',
      ],
    },
    {
      h2: 'The physics behind the experiment',
      body: [
        'A convex lens converges parallel rays to its focal point, and for a thin lens the object and image distances obey a simple relation. With the real-is-positive sign convention used on this bench:',
      ],
      bullets: [
        '1/v − 1/u = 1/f — the thin lens formula',
        'Plotting 1/v against 1/u gives a straight line of slope 1 with intercept 1/f',
        'Magnification m = v/u — the image is inverted and scaled by this factor',
        'Object inside f (u < f): rays diverge after the lens — virtual, upright, magnified image',
      ],
    },
    {
      h2: 'Why the bench method is honest',
      body: [
        'Measuring a focal length directly is surprisingly slippery: parallax errors, thick-lens effects and the difficulty of judging "sharpest" all conspire against a single reading. The u–v method beats them by averaging. Each object position gives an independent (u, v) pair, the graph pools them all, and the intercept is far more stable than any individual focus — a straight line through five honest points is a stronger measurement than five separate guesses.',
        'The bench teaches the behaviour as well as the number. Slide the object toward the focal point and watch the image march outward faster and faster, growing without bound as u approaches f — the geometry that makes a simple lens become a projector. Slide it beyond 2f and the image shrinks to a demure point-like patch between f and 2f on the other side.',
      ],
    },
    {
      h2: 'Reading the ray diagram like a physicist',
      body: [
        'The three principal rays are not decoration — they are the proof. Any two of them locate the image, because light leaves every point of the object in all directions and the lens bends every ray from a given point through the same image point. Watching the parallel ray kink at the lens and pass through the far focus, while the centre ray sails straight, turns the lens formula from memorised algebra into visible geometry.',
        'When the object slips inside f, the outgoing rays diverge — but extend them backwards and they still meet, on the same side as the object. That meeting point is the virtual image: upright, magnified, and unreachable by any screen. The lab draws it as a dashed arrow once you have explored the case, closing the loop between the algebra and what your eye would see looking through the lens.',
      ],
    },
    {
      h2: 'Who this lab is for',
      body: [
        'Anyone studying geometric optics for the first time, revising lens behaviour, or preparing for practical work on a real optical bench. The mentor walks newcomers through placement, focusing and recording, while the live ray diagram and the 1/v–1/u analysis give confident students the full picture. It runs in any modern browser on phone, tablet or desktop with synthesized sound and no downloads.',
      ],
    },
  ],
  faq: [
    {
      q: 'How do I find the focal length of a convex lens experimentally?',
      a: 'Place the object at several distances u from the lens, locate the sharp image on the screen at distance v for each, then plot 1/v against 1/u. The points lie on a line of slope 1 whose intercept equals 1/f — so f = 1/intercept. The virtual lab computes this from your recorded pairs automatically.',
    },
    {
      q: 'Why does the image disappear when the object is inside the focal length?',
      a: 'When u is smaller than f, rays leaving the lens diverge instead of converging, so no real image forms on any screen. Extending the rays backward shows a virtual image on the object side — upright and magnified, exactly how a magnifying glass works.',
    },
    {
      q: 'What does the sharpness meter actually measure?',
      a: 'It is the blur-circle size on the screen: how much the ray cone has spread at the screen position. It shrinks to zero exactly at the true image distance, so "meter at zero" is the same judgement as "image looks sharp" on a real bench — just with numbers instead of squinting.',
    },
    {
      q: 'Why record five different object positions instead of one?',
      a: 'A single focus judgement carries parallax and sharpness errors. Five positions give five independent (u, v) pairs, and the fitted line averages them — the intercept, and therefore your focal length, becomes far more reliable than any single reading.',
    },
    {
      q: 'Can I use this lab on a phone?',
      a: 'Yes. Drag the object and screen with your finger; every control is touch-sized. Keyboard and mouse work on desktop too.',
    },
  ],
};
