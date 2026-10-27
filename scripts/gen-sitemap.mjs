#!/usr/bin/env node
/**
 * gen-sitemap.mjs — regenerates public/sitemap.xml + public/robots.txt from
 * the live catalog. Run after adding labs:  node scripts/gen-sitemap.mjs
 *
 * SITE_ORIGIN is the one place to change when the production domain is known.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SITE_ORIGIN = 'https://sorenlabs.app';
const ROOT = new URL('..', import.meta.url).pathname;

// Live labs + docs are read out of the catalog source (dependency-free).
const catalogSrc = readFileSync(`${ROOT}src/engine/catalog.ts`, 'utf8');
const entries = [...catalogSrc.matchAll(/\{\s*slug:\s*'([^']+)',\s*docsSlug:\s*'([^']+)'/g)];
const live = [...catalogSrc.matchAll(/slug:\s*'([^']+)',[\s\S]{0,600}?status:\s*'live'/g)].map((m) => m[1]);

const urls = [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/docs`];
for (const e of entries) {
  if (live.includes(e[1])) {
    urls.push(`${SITE_ORIGIN}/labs/${e[1]}`);
    urls.push(`${SITE_ORIGIN}/docs/${e[2]}`);
  }
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => {
    const isGuide = u.includes('/docs/') && u !== `${SITE_ORIGIN}/docs`;
    const isLab = u.includes('/labs/');
    return `  <url>
    <loc>${u}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${isGuide ? 'monthly' : 'weekly'}</changefreq>
    <priority>${u === `${SITE_ORIGIN}/` ? '1.0' : isLab ? '0.9' : isGuide ? '0.8' : '0.7'}</priority>
  </url>`;
  })
  .join('\n')}
</urlset>
`;

writeFileSync(`${ROOT}public/sitemap.xml`, sitemap);
writeFileSync(
  `${ROOT}public/robots.txt`,
  `User-agent: *\nAllow: /\n\n# Soren Labs — every lab and guide is free content\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
);
console.log(`sitemap.xml written with ${urls.length} URLs (origin ${SITE_ORIGIN})`);
console.log(execSync(`grep -c '<loc>' ${ROOT}public/sitemap.xml`).toString());
