import { config, isPublicInstance, premiumTrialEnabled } from '@ap/config';
import { Filter, RotateCwFadingClock } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FeaturePoint, FeatureSection } from '@/components/marketing/premium/feature-section';
import { FiltersDemo } from '@/components/marketing/premium/filters-demo';
import { PremiumPerks } from '@/components/marketing/premium/premium-perks';
import { RolloverDemo } from '@/components/marketing/premium/rollover-demo';
import { PricingPlans } from '@/components/marketing/pricing-plans';
import { PlanComparisonTable } from '@/components/plan-comparison-table';
import { values } from '@/lib/constants';
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
export default function PremiumPage() {
  // A self-hosted instance has no billing, so there are no plans to sell.
  if (!isPublicInstance) notFound();

  const freeChannelLimit = config.limits.freeChannelsPerGuild;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-32 pb-24 sm:px-6 lg:px-8">
      <header className="mx-auto mb-16 max-w-3xl text-center">
        <h1 className="mb-6 text-balance text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
          Get more from{' '}
          <span className="bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            your announcements.
          </span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-300 sm:text-xl">
          Premium publishes the messages beyond Discord&apos;s hourly limit once it resets, and adds
          message filters, unlimited channels and priority support.
        </p>
      </header>

      {/* Read on the server, so a public instance with no trial prices configured advertises
          none. Not routed through getSiteConfig() because this page and PricingPlans are
          both server components. */}
      <PricingPlans trialOffered={premiumTrialEnabled} />
      <p className="mt-8 text-center text-sm text-slate-500">
        Trusted by {formatNumberFull(values.activeServers)} servers using Auto Publisher · Secure
        payment via Paddle
      </p>

      <div className="mx-auto mt-32 max-w-6xl space-y-28">
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
          body="Give each channel a rule. Only messages that match it are published."
          visual={<FiltersDemo />}
          reverse
        >
          <FeaturePoint>Match by content, author, mention or webhook</FeaturePoint>
          <FeaturePoint>Works on embeds from RSS, GitHub and news bots</FeaturePoint>
        </FeatureSection>

        <PremiumPerks freeChannelLimit={freeChannelLimit} />
      </div>

      <section aria-labelledby="compare-title" className="mx-auto mt-28 max-w-4xl">
        <h2
          id="compare-title"
          className="mb-8 text-center text-2xl font-bold text-white sm:text-3xl"
        >
          Free vs Premium
        </h2>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <PlanComparisonTable freeChannelLimit={freeChannelLimit} />
        </div>
      </section>
    </div>
  );
}
