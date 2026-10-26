# Soren Labs

**Interactive science laboratories for every student.**

Soren Labs is a mobile-first virtual laboratory project focused on making science practical, visual, and accessible to students — including those using low-end Android devices.

## Project status

The shared web foundation is in place, and the first benchmark experiment — an interactive acid–base titration lab — is available at `/labs/titration`.

## Technology

- **React + TypeScript** for the application interface
- **Vite** for development and production builds
- **PlayCanvas Engine** for future interactive 3D laboratory scenes
- **Cloudflare Pages** for static hosting

## Local development

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
npm run preview
```

## Cloudflare Pages

Connect this repository to Cloudflare Pages and use:

| Setting | Value |
| --- | --- |
| Framework preset | React (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

The project is a static Vite application and does not require a server-side runtime to serve the initial page.

## First experiment

Open `/labs/titration` to explore the first interactive chemistry lab. It includes a PlayCanvas 3D scene, a hold-to-operate stopcock, a swirl pad for mixing, live synthesized sound, a guided mentor with a step-by-step procedure, a live pH titration curve, an observation log with repeatable trials, achievement badges, reset controls, and adaptive rendering-resolution settings. The chemistry readings use a documented idealized strong-acid/strong-base teaching model; the 3D liquid appearance is illustrative.

### Hands-on features

- **Press and hold the stopcock** — titrant flows only while you keep the valve open, just like the real thing. Release to stop instantly.
- **Swirl pad** — drag in circles to rotate the flask; the liquid wobbles in 3D, sloshes audibly, and pink indicator flashes mix away as you swirl.
- **Realistic sound, synthesized live** — drips, stopcock clicks, sloshing, glass resonances, a stream while pouring and a quiet room tone, all generated with the Web Audio API (zero audio assets, works offline). Mute and volume controls are in the scene toolbar; haptic feedback works on supporting phones.
- **Pink flash chemistry** — near the equivalence point, each drop lands as a localized pink bloom that fades when you swirl. The first bloom that survives swirling is the endpoint, exactly like a real phenolphthalein titration.
- **Lab mentor** — a seven-step guided procedure that completes itself as you work, a contextual coach that reacts to what you do (including overshoot warnings), and badges for skills like drop-by-drop control and repeatable accuracy.
- **Live titration curve** — pH versus volume plotted in real time, with the equivalence line and the phenolphthalein transition band marked.
- **Drag to look around** — orbit the 3D bench with a drag; the scene is still fully usable on touch devices.

## Design and performance principles

- Mobile-first and responsive by default
- Prefer realistic visual quality without excluding low-end devices
- Adapt rendering cost to measured device performance
- Keep experiment logic scientifically grounded
- Respect reduced-motion preferences where relevant
- Avoid adding experiment projects until the shared foundation is ready

## License

License to be decided by the repository owner.
