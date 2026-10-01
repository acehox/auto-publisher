import type { Metadata } from 'next';
import { FinalCta } from '@/components/marketing/final-cta';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Stats } from '@/components/marketing/stats';
import { getSiteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function Home() {
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Auto Publisher',
    url: new URL('/', getSiteUrl()).href,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD, `<` escaped
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <Hero />
      <Stats />
      <HowItWorks showGuideCta />
      <FinalCta />
    </>
  );
}
