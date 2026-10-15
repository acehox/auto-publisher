import type { Metadata } from 'next';

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** `YYYY-MM-DD`, set by hand when the content changes. Sitemap only, never rendered. */
  updated: string;
}

/**
 * The one list of published guides: the index, the sitemap and each page's metadata
 * read it, so a title lives in one place. Order is the index order.
 */
export const guides = [
  {
    slug: 'auto-publish-discord-announcements',
    title: 'How to auto-publish announcement channel messages in Discord',
    description:
      'Set up Auto Publisher, a Discord bot that automatically publishes (crossposts) the messages in your announcement channels to every server that follows them.',
    updated: '2026-10-15',
  },
] as const satisfies readonly Guide[];

export type GuideSlug = (typeof guides)[number]['slug'];

export const guidePath = (slug: string): string => `/guides/${slug}`;

export function getGuide(slug: GuideSlug): Guide {
  const guide = guides.find(entry => entry.slug === slug);
  if (!guide) throw new Error(`Unknown guide: ${slug}`);
  return guide;
}

export function guideMetadata(guide: Guide): Metadata {
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: guidePath(guide.slug) },
    // A page's `openGraph` replaces the root one whole, so `siteName` is restated.
    openGraph: {
      type: 'article',
      siteName: 'Auto Publisher',
      title: guide.title,
      description: guide.description,
    },
  };
}
