import { useEffect } from 'react';

/**
 * useSEO — per-page <head> management for the SPA (no router lib).
 * Sets title, description, keywords, canonical, Open Graph tags and a
 * JSON-LD block; cleans everything up on unmount so pages never leak
 * each other's metadata.
 */
export function useSEO(opts: {
  title: string;
  description: string;
  keywords?: string[];
  /** Absolute path such as "/docs/simple-pendulum-virtual-lab". */
  path: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}) {
  useEffect(() => {
    const created: HTMLElement[] = [];
    document.title = opts.title;

    const existingDesc = document.head.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const originalDesc = existingDesc?.getAttribute('content') ?? '';
    if (existingDesc) {
      existingDesc.setAttribute('content', opts.description);
    } else {
      const m = document.createElement('meta');
      m.setAttribute('name', 'description');
      m.setAttribute('content', opts.description);
      document.head.appendChild(m);
      created.push(m);
    }
    const addMeta = (attrs: Record<string, string>) => {
      const m = document.createElement('meta');
      Object.entries(attrs).forEach(([k, v]) => m.setAttribute(k, v));
      document.head.appendChild(m);
      created.push(m);
    };

    if (opts.keywords?.length) {
      const m = document.createElement('meta');
      m.setAttribute('name', 'keywords');
      m.setAttribute('content', opts.keywords.join(', '));
      document.head.appendChild(m);
      created.push(m);
    }

    addMeta({ property: 'og:title', content: opts.title });
    addMeta({ property: 'og:description', content: opts.description });
    addMeta({ property: 'og:type', content: 'website' });
    addMeta({ property: 'og:url', content: `https://sorenlabs.app${opts.path}` });
    addMeta({ name: 'twitter:card', content: 'summary_large_image' });
    addMeta({ name: 'twitter:title', content: opts.title });
    addMeta({ name: 'twitter:description', content: opts.description });

    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', `https://sorenlabs.app${opts.path}`);
    document.head.appendChild(link);
    created.push(link);

    let jsonLdEl: HTMLScriptElement | null = null;
    if (opts.jsonLd) {
      jsonLdEl = document.createElement('script');
      jsonLdEl.type = 'application/ld+json';
      jsonLdEl.textContent = JSON.stringify(opts.jsonLd);
      document.head.appendChild(jsonLdEl);
    }

    return () => {
      created.forEach((el) => el.remove());
      if (existingDesc) existingDesc.setAttribute('content', originalDesc);
      if (jsonLdEl) jsonLdEl.remove();
      // Restore the default title.
      document.title = 'Soren Labs — Interactive virtual science labs';
    };
  }, [opts.title, opts.description, opts.keywords, opts.path, opts.jsonLd]);
}
