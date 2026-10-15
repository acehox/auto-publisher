import { isPublicInstance } from '@ap/config';
import type { MetadataRoute } from 'next';
import { guidePath, guides } from '@/lib/guides';
import { legalDocuments } from '@/lib/legal/documents';
import { getSiteUrl } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

const marketingPaths = ['/', '/how-it-works', '/premium', '/migration', '/guides'];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isPublicInstance) return [];

  const siteUrl = getSiteUrl();
  const legalPaths = legalDocuments
    .filter(document => document.lang !== 'hr')
    .map(document => document.href);
  const pages = [...marketingPaths, ...legalPaths].map(path => ({
    url: new URL(path, siteUrl).href,
  }));
  const guidePages = guides.map(guide => ({
    url: new URL(guidePath(guide.slug), siteUrl).href,
    lastModified: guide.updated,
  }));
  return [...pages, ...guidePages];
}
