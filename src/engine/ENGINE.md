# Soren Lab Engine — build guide for new labs

Every new lab is a small folder under `src/labs/{slug}/` that plugs into the shared
engine. The pendulum lab (`src/labs/pendulum/`) is the reference implementation —
**read it in full before writing any code**.

## The deal

A lab delivers exactly four files and touches NOTHING else:

```
src/labs/{slug}/
  {Name}Lab.tsx    — default-export React component (the whole lab)
  {slug}.css       — small custom styles only (shared styles live in engine.css)
  docs.ts          — export const {slug}Docs: DocsContent (SEO guide page content)
```

The catalog entry (slug, title, subject, tier, SEO strings, route) ALREADY EXISTS in
`src/engine/catalog.ts` — do not edit it. The main agent wires routing and docs
registry after your labs pass typecheck.

**Never edit shared files**: `src/engine/*`, `src/App.tsx`, `src/docs/*`,
`src/pages/*`, `src/labs/pendulum/*`, `src/labs/titration/*`, `index.html`,
`index.css`, `package.json`. If an engine bug blocks you, report it in your final
message instead of patching it.

## Engine API (import from `../../engine/...`)

```ts
import { LabShell } from '../../engine/LabShell';
import { useLabLoop } from '../../engine/useLabLoop';
import { NudgeLayer, useNudge } from '../../engine/nudge';
import type { NudgePlan } from '../../engine/nudge';
import { labSound } from '../../engine/audio';
import { Plot } from '../../engine/Plot';
import { linearFit, clamp, fmtClock } from '../../engine/math';
import { getLabBySlug } from '../../engine/catalog';
import type { BadgeDef, CoachTone, MentorStepDef } from '../../engine/types';
import './{slug}.css'; // your small custom stylesheet
```

### `useLabLoop({ canvasRef, step, draw })`
- The `<canvas>` you render becomes the direct child of LabShell's `.scene-frame`
  (pass it as the `scene` prop — see pendulum).
- Owns DPR sizing + rAF loop. `step(dtSeconds)` advances physics (dt clamped to
  50 ms — sub-step anything stiff at your own fixed h, like the pendulum's 1/240).
- `draw(ctx, w, h)` receives logical CSS pixels; the transform is pre-scaled.
- Canvas CSS is 100%×100% via engine.css — never set width/height styles.

### `LabShell` props (see pendulum usage)
`meta, statusText, statusTone, toolbarExtra, scene, captionChip, legend, coach,
mentor {steps,index,done,ack?}, controls, sidebarTop, notes {procedure,
observations, theory}, badges, earned, nudgeLayer, toast, onReset, onTab`.
- Coach bar, notes tabs, badges card, report card, sound toggle, responsive
  layout — all come free. LabShell calls `labSound.stopLoop()` on unmount.
- `data-nudge` targets already present: `scene`, `reset`, `observations`.
  Add your own (e.g. `data-nudge="record"` on a record button) for the nudge.

### `useNudge({ getPlan })`
- `notePointer(productive)` on every meaningful interaction (productive = it
  advances the experiment; bare random taps = non-productive).
- `getPlan()` returns the plan for the current mentor step or null.
- Render `<NudgeLayer key={nudge.token} plan={nudge.plan} onDismiss={...}/>`
  from the returned `nudge` when it is non-null, via LabShell's `nudgeLayer`.

### `labSound` events
`tick()` UI, `click()` firm, `thunk(soft)` landing, `slide(strength)` dragging,
`ping(freq,gain)` metallic, `drip(fine)` liquid, `slosh(strength)`, `glassClink(soft)`,
`creak(strength)` flex, `startLoop('pour'|'hum')`/`stopLoop()` continuous,
`step()` mentor completion, `milestone()` big win, `badge()`, `warn()`, `reset()`.

### `Plot` (analysis graph)
`<Plot points xLabel yLabel fitLine livePoint? height? />` — auto axes/grid/
least-squares line; use with `linearFit` for slope-based conclusions.

## Lab pattern (copy from pendulum)

1. **Sim state in a `useRef`**, React state only for a throttled UI snapshot
   (sync at ~10 Hz) plus student controls. Never setState per frame.
2. **Physics in `step`** with fixed sub-steps; integrate honestly (the pendulum
   uses semi-implicit Euler at 1/240 — accuracy is a feature, students measure
   real numbers off your simulation).
3. **Draw the bench beautifully**: warm neutral palette (#eef2f6→#e2e8ee bg),
   ink #172334, accent #f97316, brass #d9a441, glass #8da8b9 strokes. Rounded
   rects, gradients on 3D-ish objects, subtle shadows. NO text drawn on the
   canvas — all readings live in the sidebar/control panel.
4. **Pointer interaction**: pointerdown near the draggable object (≤26 px slop),
   `setPointerCapture` in try/catch, move updates sim refs, up commits. Guard
   releasePointerCapture with try/catch. Call `notePointer(true/false)`.
5. **Mentor**: 4–6 steps; `done[]` booleans derived from real flags; index
   advances in an effect. First step can carry an `ack` button like the pendulum.
6. **Badges**: 4–6, earned through genuine behaviour, `labSound.badge()` + toast.
7. **Toast**: state + 3.6 s auto-clear (copy pendulum's effect).
8. **Coach**: a `useMemo` returning `{tone, line}` from live state — contextual,
   encouraging, occasionally warning. Never mention grades or curricula.
9. **Controls**: use `.action-button`, `.lab-slider-row`, `.record-button`,
   `.reading-main/.reading-grid` classes from engine.css. Add `.hint-row` tips.
10. **Speed control** where the phenomenon is slow (select 1×/2×/4×/8× in
    `toolbarExtra`); stopwatch/clock must count SIMULATED time so measurement
    stays consistent at any speed.
11. **Reset** (`onReset`) returns the bench to its opening state, keeps badges
    from this session only if that matches the pendulum's behaviour (it clears).
12. **Accessibility**: canvas `tabIndex={0}` + `role="application"` + aria-label,
    keyboard alternative for the main gesture (Space/Enter), aria-labels on
    sliders/selects.

## docs.ts content requirements

`DocsContent` = `{ h1, intro, sections: [{h2, body: string[], bullets?}], faq: [{q,a}] }`.

- h1 is keyword-rich (matches the docsSlug).
- 4–6 sections × 2–3 substantial paragraphs (150+ words per section total),
  plus a bullets block for the core formulas/facts.
- 4–5 FAQ entries targeting real student searches ("How do I …", "Why does …",
  "Can I use this on my phone?").
- **NEVER mention classes, grades, exam boards or curricula.** Say "introductory",
  "first time", "revising" instead. Write in clear, warm English.
- Explain what the student does, the science, technique/precision, and errors.

## Verification you must run before finishing

```bash
cd /home/z/my-project/work/soren-labs-main
./node_modules/.bin/tsc --noEmit -p tsconfig.app.json   # must be silent
```

Fix every error in YOUR files. Report engine problems instead of patching.

## Quality bar (what gets your lab rejected)

- Interaction must be the real gesture (drag the object, hold the button), not a
  menu that says "run".
- The scene must animate continuously (rAF), including idle states.
- Data recording + table + graph where the experiment is quantitative.
- Sound on every interaction + milestone events.
- Mobile works: 38 px+ touch targets, sliders with `touch-action` (engine.css
  handles it via `.lab-slider-row input`).
- Zero console errors, no unused variables (TS strict), no class/grade mentions.
