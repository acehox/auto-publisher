import { isPublicInstance } from '@ap/config';
import type { Metadata } from 'next';
import { FinalCta } from '@/components/marketing/final-cta';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Stats } from '@/components/marketing/stats';
import { listingUrls } from '@/lib/constants';
import { getSiteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD, `<` escaped
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export default function Home() {
  const siteUrl = getSiteUrl();
  const homeUrl = new URL('/', siteUrl).href;
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Auto Publisher',
    url: homeUrl,
  };
  // A self-hosted copy is not the organisation behind these listings.
  const organizationJsonLd = isPublicInstance && {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Auto Publisher',
    url: homeUrl,
    logo: new URL('/auto-publisher.png', siteUrl).href,
    sameAs: listingUrls,
  };

  return (
    <>
      <JsonLd data={websiteJsonLd} />
      {organizationJsonLd && <JsonLd data={organizationJsonLd} />}
      <Hero />
      <Stats />
      <HowItWorks showGuideCta />
      <FinalCta />
    </>
  );
}
