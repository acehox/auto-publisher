import { isPublicInstance } from '@ap/config';
import type { Metadata } from 'next';
import { FinalCta } from '@/components/marketing/final-cta';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Stats } from '@/components/marketing/stats';
import { listingUrls } from '@/lib/constants';
import { getDiscordEmbedUrl } from '@/lib/discord-embed';
import { getLogoUrl, getSiteUrl } from '@/lib/site-config';

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
  const homeUrl = new URL('/', getSiteUrl()).href;
  const discordEmbedUrl = getDiscordEmbedUrl();
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
    logo: getLogoUrl(),
    sameAs: listingUrls,
  };

  return (
    <>
      {/* Discord reads this only from <head>, which a page can reach with a <link> (React hoists
          it) but not an inline <script>. Hoisting lands it in <head> only while the page renders
          in one pass: a loading.tsx or <Suspense> above it moves it into <body>, and the preview
          falls back to Open Graph without an error. */}
      {discordEmbedUrl && (
        <link rel="discord:component-embed" type="application/json" href={discordEmbedUrl} />
      )}
      <JsonLd data={websiteJsonLd} />
      {organizationJsonLd && <JsonLd data={organizationJsonLd} />}
      <Hero />
      <Stats />
      <HowItWorks showGuideCta />
      <FinalCta />
    </>
  );
}
