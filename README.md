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

Open `/labs/titration` to explore the first interactive chemistry lab. It includes a detailed procedural PlayCanvas scene with drag-to-orbit and scroll-to-zoom inspection, titrant dispensing controls, live readings, an observation log, theory notes, reset controls, and adaptive rendering-resolution settings. The chemistry readings use a documented idealized strong-acid/strong-base teaching model; the 3D liquid appearance is illustrative.

## Design and performance principles

- Mobile-first and responsive by default
- Prefer realistic visual quality without excluding low-end devices
- Adapt rendering cost to measured device performance
- Keep experiment logic scientifically grounded
- Respect reduced-motion preferences where relevant
- Avoid adding experiment projects until the shared foundation is ready

## License

License to be decided by the repository owner.
