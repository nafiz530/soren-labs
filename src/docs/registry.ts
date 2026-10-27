import type { DocsContent, LabMeta } from '../engine/types';
import { titrationDocs } from '../labs/titration/docs';
import { pendulumDocs } from '../labs/pendulum/docs';
import { hookesLawDocs } from '../labs/hookes-law-spring/docs';
import { ohmsLawDocs } from '../labs/ohms-law/docs';
import { seriesParallelDocs } from '../labs/series-parallel-circuits/docs';
import { refractionDocs } from '../labs/refraction-glass-slab/docs';
import { lensBenchDocs } from '../labs/convex-lens-bench/docs';
import { densityDocs } from '../labs/density-archimedes/docs';
import { specificHeatDocs } from '../labs/specific-heat/docs';
import { heatingCurveDocs } from '../labs/heating-curve/docs';
import { resonanceTubeDocs } from '../labs/resonance-tube/docs';
import { magneticFieldDocs } from '../labs/magnetic-field-mapping/docs';
import { inductionDocs } from '../labs/electromagnetic-induction/docs';
import { diodeDocs } from '../labs/diode-rectifier/docs';
import { getLabByDocsSlug } from '../engine/catalog';

/**
 * The docs registry — every live lab's SEO guide page.
 * Keys are the /docs/{docsSlug} routes. When a new lab goes live, add
 * `docsSlug: { meta: getLabByDocsSlug(docsSlug)!, docs: itsDocs }` here.
 */

function entry(docsSlug: string, docs: DocsContent) {
  const meta = getLabByDocsSlug(docsSlug);
  if (!meta) throw new Error(`No catalog entry for docsSlug ${docsSlug}`);
  return { meta, docs };
}

export const DOCS_REGISTRY: Record<string, { meta: LabMeta; docs: DocsContent }> = {
  'acid-base-titration-virtual-lab': entry('acid-base-titration-virtual-lab', titrationDocs),
  'simple-pendulum-virtual-lab': entry('simple-pendulum-virtual-lab', pendulumDocs),
  'hookes-law-spring-virtual-lab': entry('hookes-law-spring-virtual-lab', hookesLawDocs),
  'ohms-law-virtual-lab': entry('ohms-law-virtual-lab', ohmsLawDocs),
  'series-and-parallel-resistance-virtual-lab': entry('series-and-parallel-resistance-virtual-lab', seriesParallelDocs),
  'refraction-of-light-glass-slab-virtual-lab': entry('refraction-of-light-glass-slab-virtual-lab', refractionDocs),
  'convex-lens-focal-length-virtual-lab': entry('convex-lens-focal-length-virtual-lab', lensBenchDocs),
  'density-and-archimedes-principle-virtual-lab': entry('density-and-archimedes-principle-virtual-lab', densityDocs),
  'specific-heat-capacity-virtual-lab': entry('specific-heat-capacity-virtual-lab', specificHeatDocs),
  'heating-curve-of-water-virtual-lab': entry('heating-curve-of-water-virtual-lab', heatingCurveDocs),
  'resonance-tube-speed-of-sound-virtual-lab': entry('resonance-tube-speed-of-sound-virtual-lab', resonanceTubeDocs),
  'magnetic-field-lines-bar-magnet-virtual-lab': entry('magnetic-field-lines-bar-magnet-virtual-lab', magneticFieldDocs),
  'electromagnetic-induction-virtual-lab': entry('electromagnetic-induction-virtual-lab', inductionDocs),
  'semiconductor-diode-characteristics-virtual-lab': entry('semiconductor-diode-characteristics-virtual-lab', diodeDocs),
};
