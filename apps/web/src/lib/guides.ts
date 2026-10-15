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
  {
    slug: 'discord-crossposting-explained',
    title: 'Discord crossposting explained: Publish, Follow and announcement channels',
    description:
      'What Discord announcement channels, the Publish button and crossposting are, how other servers follow a channel, and why messages from bots and webhooks stay unpublished.',
    updated: '2026-10-15',
  },
  {
    slug: 'filter-which-announcements-publish',
    title: 'How to auto-publish only some messages in Discord',
    description:
      'Use Auto Publisher filters to publish (crosspost) only the announcement channel messages you choose, by text, author, mention or webhook, including RSS and news feed embeds.',
    updated: '2026-10-15',
  },
  {
    slug: 'discord-publish-limit',
    title: "How to publish messages past Discord's limit of 10 per hour",
    description:
      'Discord lets each announcement channel publish (crosspost) 10 messages per hour. How to get the messages past that limit published once it resets, and how to use less of it.',
    updated: '2026-10-15',
  },
  {
    slug: 'announcement-not-publishing',
    title: "Why isn't my Discord announcement being published?",
    description:
      'A checklist for announcement channel messages that are not published (crossposted) to following servers: enabled channels, the three permissions, paused channels, filters and the hourly limit.',
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
