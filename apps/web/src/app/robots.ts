import { isPublicInstance } from '@ap/config';
import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // A self-hosted copy should not be indexed.
  if (!isPublicInstance) return { rules: { userAgent: '*', disallow: '/' } };

  // Dashboard, login and checkout stay crawlable on purpose: their `noindex` only works if
  // Google can fetch the page and read it.
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: new URL('/sitemap.xml', getSiteUrl()).href,
  };
}
