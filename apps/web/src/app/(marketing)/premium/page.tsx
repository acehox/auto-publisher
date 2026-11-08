import { config, isPublicInstance, premiumTrialEnabled } from '@ap/config';
import { Filter, RotateCwFadingClock, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FeaturePoint, FeatureSection } from '@/components/marketing/premium/feature-section';
import { FiltersDemo } from '@/components/marketing/premium/filters-demo';
import { PremiumPerks } from '@/components/marketing/premium/premium-perks';
import { RolloverDemo } from '@/components/marketing/premium/rollover-demo';
import { PricingPlans } from '@/components/marketing/pricing-plans';
import { PlanComparisonTable } from '@/components/plan-comparison-table';
import { getPriceLists } from '@/lib/api/backend';
import { values } from '@/lib/constants';
import { guidePath } from '@/lib/guides';
import { getSiteConfig } from '@/lib/site-config';
import { formatNumberFull } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Premium',
  description:
    "Auto Publisher Premium gives your Discord server unlimited announcement channels and message filters for each channel, and publishes messages beyond Discord's hourly limit once it resets, for up to 24 hours.",
  alternates: { canonical: '/premium' },
};

// čl. 60 st. 2 makes every sentence on this page a contract term. Rollover is best effort
// within 24h and the queue has no priority (ADR 0001): never "instant", "guaranteed",
// "unlimited publishing", "bypass", or a support response time.
export default async function PremiumPage() {
  // A self-hosted instance has no billing, so there are no plans to sell.
  if (!isPublicInstance) notFound();

  const freeChannelLimit = config.limits.freeChannelsPerGuild;
  const { croatianVisitor } = await getSiteConfig();
  // Without the backend the page still sells, in USD only, rather than failing.
  const eurPrices = croatianVisitor
    ? await getPriceLists().then(
        ([current]) => current?.prices ?? null,
        () => null
      )
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-32 pb-24 sm:px-6 lg:px-8">
      <header className="mx-auto mb-12 max-w-4xl text-center">
        <p className="mb-3 inline-flex items-center gap-2.5 text-xl font-semibold uppercase tracking-[0.2em] text-white sm:text-2xl">
          <Zap className="size-7 fill-yellow-500 text-yellow-500" aria-hidden="true" />
          Premium
        </p>
        <h1 className="mb-4 text-balance text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-[2.75rem]">
          Get more from{' '}
          <span className="bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            your announcements.
          </span>
        </h1>
        <p className="mx-auto max-w-xl text-base text-slate-300">
          Premium publishes the messages beyond Discord&apos;s hourly limit once it resets, and adds
          message filters, unlimited channels and priority support.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Trusted by {formatNumberFull(values.activeServers)} servers
        </p>
      </header>

      {/* Read on the server, so a public instance with no trial prices configured advertises
          none. */}
      <PricingPlans
        trialOffered={premiumTrialEnabled}
        croatianVisitor={croatianVisitor}
        eurPrices={eurPrices}
      />

      <div className="mx-auto mt-20 max-w-6xl space-y-28">
        <FeatureSection
          id="rollover"
          icon={RotateCwFadingClock}
          color="blue"
          eyebrow="Rollover"
          title="Messages past the limit wait their turn"
          body="Discord limits each channel to 10 published messages per hour. Premium publishes the rest once the limit resets."
          visual={<RolloverDemo />}
        >
          <FeaturePoint>In the order they were posted</FeaturePoint>
          <FeaturePoint>For up to 24 hours</FeaturePoint>
        </FeatureSection>

        <FeatureSection
          id="filters"
          icon={Filter}
          color="purple"
          eyebrow="Message filters"
          title="Publish only what you choose"
          body={
            <>
              Give each channel a rule. Only messages that match it are published.{' '}
              <Link
                href={guidePath('filter-which-announcements-publish')}
                className="text-blue-400 underline-offset-4 hover:text-blue-300 hover:underline"
              >
                See how filters work
              </Link>
            </>
          }
          visual={<FiltersDemo />}
          reverse
        >
          <FeaturePoint>Match by content, author, mention or webhook</FeaturePoint>
          <FeaturePoint>Works on embeds from RSS, GitHub and news bots</FeaturePoint>
        </FeatureSection>

        <PremiumPerks freeChannelLimit={freeChannelLimit} />
      </div>

      <section aria-label="Plans comparison" className="mx-auto mt-28 max-w-5xl">
        <PlanComparisonTable title="Plans comparison" freeChannelLimit={freeChannelLimit} />
      </section>
    </div>
  );
}
