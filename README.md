# Soren Labs

Interactive virtual science laboratories — built for learning by doing. Students hold real instruments in the browser: stopcocks, pendulums, springs, circuits and optics benches, with a lab mentor that watches their hands and steps in when they stall.

**Live catalog:** 27 experiments (Chemistry 14 + Physics 13) out of 51 planned, each with a keyword-rich guide page for search at `/docs/{lab-name}`.

## Stack

- React 19 + TypeScript + Vite (no router library — path-based rendering)
- PlayCanvas for the 3D titration scene; hand-drawn Canvas2D for the physics benches
- Web Audio synthesis for every sound (zero audio assets)
- Plain CSS, mobile-first responsive (phone / tablet / desktop)

## Architecture

```
src/
  engine/           The Soren Lab Engine — shared by every lab
    LabShell.tsx      page skeleton: toolbar → scene → caption → coach strip,
                      control panel, mentor/readings/notes/badges sidebar
    useLabLoop.ts     DPR-aware canvas sizing + rAF loop (stale-closure safe)
    nudge.tsx         smart guidance: idle/wrong-click detection → pulsing
                      ring + demonstrating hand + bubble over the real control
    audio.ts          LabSound: synthesized ticks, clicks, pings, drips, loops
    Plot.tsx          live scatter + least-squares fit for analysis graphs
    math.ts           linearFit, clamp, fmtClock helpers
    seo.ts            per-page <head> management (title/meta/OG/JSON-LD)
    catalog.ts        all 51 labs: slug, docsSlug, subject, tier, SEO strings
    ENGINE.md         the build contract for adding a new lab
  labs/{slug}/       one folder per experiment:
                      {Name}Lab.tsx + {slug}.css + docs.ts (SEO guide content)
  docs/              DocsPage renderer + registry (/docs/{docsSlug} routes)
  pages/             catalog homepage + "in development" pages
scripts/
  gen-sitemap.mjs    regenerates public/sitemap.xml + robots.txt from catalog
```

### Adding a lab

1. Add its entry to `src/engine/catalog.ts` (slug, docsSlug, subject, tier, tagline, SEO).
2. Create `src/labs/{slug}/` with the component, CSS and `docs.ts` following `ENGINE.md` — copy the pendulum lab as a starting point.
3. Register the lazy component in `src/App.tsx` (`LAB_COMPONENTS`) and the docs export in `src/docs/registry.ts`.
4. Run `node scripts/gen-sitemap.mjs` and set `SITE_ORIGIN` in it to the production domain.

Every lab inherits sound, mentor, nudge guidance, responsive layout and SEO automatically from the engine.

## Features

- Hands-on controls: hold-to-dispense stopcocks, draggable bobs/wipers/screens/magnets/dividers/splints/reagents
- Lab mentor with self-completing guided steps and contextual coaching
- Smart guidance: if the student clicks wrongly or goes idle, an animated hand demonstrates the exact next gesture on the exact control
- Real measurements: data tables, live plots, least-squares analysis, badges
- Honest physics and chemistry: Maxwell-Boltzmann molecular dynamics, Faraday-law plating, Newton cooling, limiting reagents, hydrate stoichiometry
- Zoom (wheel/pinch/buttons) and orbit camera on the 3D titration scene
- Synthesized sound with mute + volume, haptics on mobile
- Per-lab SEO guide pages, JSON-LD, Open Graph, sitemap and robots.txt
- Works on phone, tablet and desktop (safe-area aware, touch-first)

## Run locally

```bash
npm install
npm run dev        # develop
npm run build      # type-check + production build
npm run preview    # serve the build
```

## Notes

The 3D titration scene is an interactive visual prototype; its pH/endpoint values are an illustrative teaching model. The 2D physics labs are numerically honest simulations — students measure real values off them (e.g. g from the pendulum, k from the spring, n from the glass slab).
