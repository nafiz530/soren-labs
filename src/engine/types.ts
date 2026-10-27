/** Shared types for every Soren lab: catalog metadata, mentor, badges, docs. */

export type LabSubject =
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'Integrated Science'
  | 'Higher Mathematics'
  | 'ICT'
  | 'Earth & Environment';

export type LabTier = 'Explorer' | 'Builder' | 'Master';

export interface LabMeta {
  /** Route slug: lab lives at /labs/{slug} */
  slug: string;
  /** Keyword-rich docs route: /docs/{docsSlug} — used as the SEO landing page. */
  docsSlug: string;
  /** Page H1 / card title, e.g. "Simple pendulum". */
  title: string;
  subject: LabSubject;
  tier: LabTier;
  /** One-line hero description of what the student does. */
  tagline: string;
  status: 'live' | 'roadmap';
  /** Continues the numbering started by the titration lab (001). */
  experimentNo: number;
  seo: { title: string; description: string; keywords: string[] };
}

export interface MentorStepDef {
  id: string;
  title: string;
  detail: string;
  hint?: string;
}

export type CoachTone = 'info' | 'good' | 'warn' | 'idle';

export interface CoachLine {
  tone: CoachTone;
  line: string;
}

export interface BadgeDef {
  id: string;
  title: string;
  icon: string;
  detail: string;
}

export interface DocsSection {
  h2: string;
  body: string[];
  bullets?: string[];
}

export interface DocsFaqItem {
  q: string;
  a: string;
}

export interface DocsContent {
  h1: string;
  /** Lead paragraph shown under the H1. */
  intro: string;
  sections: DocsSection[];
  faq: DocsFaqItem[];
}
