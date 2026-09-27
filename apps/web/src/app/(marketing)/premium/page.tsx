import { isPublicInstance, premiumTrialEnabled } from '@ap/config';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PricingPlans } from '@/components/marketing/pricing-plans';
import { values } from '@/lib/constants';
import { formatNumberFull } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Premium | Auto Publisher',
  description: 'Unlock unlimited channels and advanced controls for your server.',
};

export default function PremiumPage() {
  // A self-hosted instance has no billing, so there are no plans to sell.
  if (!isPublicInstance) notFound();

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24">
      <div className="text-center mb-16">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
          Upgrade your publishing with Premium
        </h1>
        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
          Unlock unlimited channels and advanced controls for your server
        </p>
      </div>

      {/* Read on the server, so a public instance with no trial prices configured advertises
          none. Not routed through getSiteConfig() because this page and PricingPlans are
          both server components. */}
      <PricingPlans trialOffered={premiumTrialEnabled} />

      <div className="text-center mt-8">
        <p className="text-slate-500 text-sm">
          Trusted by {formatNumberFull(values.activeServers)} servers using Auto Publisher · Secure
          payment via Paddle
        </p>
      </div>
    </section>
  );
}
