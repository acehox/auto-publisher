import { isPublicInstance } from '@ap/config';
import type { MetadataRoute } from 'next';
import { legalDocuments } from '@/lib/legal/documents';
import { getSiteUrl } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

const marketingPaths = ['/', '/how-it-works', '/premium'];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isPublicInstance) return [];

  const siteUrl = getSiteUrl();
  const legalPaths = legalDocuments
    .filter(document => document.lang !== 'hr')
    .map(document => document.href);
  return [...marketingPaths, ...legalPaths].map(path => ({
    url: new URL(path, siteUrl).href,
  }));
}
