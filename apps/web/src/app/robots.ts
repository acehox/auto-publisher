import { isPublicInstance } from '@ap/config';
import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // A self-hosted copy should not be indexed.
  if (!isPublicInstance) return { rules: { userAgent: '*', disallow: '/' } };

  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: new URL('/sitemap.xml', getSiteUrl()).href,
  };
}
