import { Check } from 'lucide-react';
import Link from 'next/link';
import { PlanFeatureText } from '@/components/plan-feature-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CANCEL_PLAN_FEATURE, PREMIUM_PLAN_FEATURES, REFUND_PLAN_FEATURE } from '@/lib/plans';
import {
  formatUsd,
  PREMIUM_PRICE_MONTHLY_USD,
  PREMIUM_PRICE_YEARLY_USD,
  PREMIUM_TRIAL_DAYS,
  PREMIUM_YEARLY_PER_MONTH_USD,
  PREMIUM_YEARLY_SAVINGS_PERCENT,
} from '@/lib/pricing';
import { cn } from '@/lib/utils';

const CARD_FEATURES = [REFUND_PLAN_FEATURE, ...PREMIUM_PLAN_FEATURES, CANCEL_PLAN_FEATURE];

/**
 * The public /premium pricing: the two Premium billing options, Monthly and
 * Annual. Neither CTA checks out — checkout is guild-scoped, so both
 * funnel into /dashboard?upgrade=<interval>: the flag's presence routes a free
 * guild straight to its subscription tab, and the value (month|year) preselects
 * that interval there.
 *
 * `trialOffered` comes from the server (`premiumTrialEnabled`), never a build constant, so
 * unsetting a trial price id removes every trial claim here in the same move that stops
 * checkout issuing one. The trial is stated once, under the cards: beside the refund line, a
 * "Free for 14 days" clause on each card read as the same promise twice.
 *
 * This page is not guild-scoped and the visitor may not be logged in, so the copy says
 * "once per server" rather than asserting the reader still has one. The per-server truth is
 * on the subscription panel, which reads `trialAvailable` for the actual guild.
 */
export function PricingPlans({ trialOffered }: { trialOffered: boolean }) {
  const billingLine = (amount: number, cadence: 'annually' | 'monthly'): string =>
    `Billed ${cadence} at ${formatUsd(amount)}.`;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto items-stretch">
        {/* Annual first at every width: the first card read anchors the price. */}
        <PlanCard
          name="Annual"
          band="Best Value"
          badge={`Save ${PREMIUM_YEARLY_SAVINGS_PERCENT}%`}
          pricePerMonth={PREMIUM_YEARLY_PER_MONTH_USD}
          billing={billingLine(PREMIUM_PRICE_YEARLY_USD, 'annually')}
          cta="Choose Annual"
          href="/dashboard?upgrade=year"
        />
        <PlanCard
          name="Monthly"
          pricePerMonth={PREMIUM_PRICE_MONTHLY_USD}
          billing={billingLine(PREMIUM_PRICE_MONTHLY_USD, 'monthly')}
          cta="Choose Monthly"
          href="/dashboard?upgrade=month"
        />
      </div>

      {/* The payment-required statement, once, under both cards rather than duplicated in
          each. It belongs at the point of purchase rather than on the legal pages: the
          14-day withdrawal right stays a one-time right only if the buyer was told here
          that payment follows the free period, and otherwise a second right attaches to
          the first real charge. Reasoning in .claude/CLAUDE.md. */}
      {trialOffered && (
        <p className="mx-auto mt-6 max-w-3xl text-pretty text-center text-sm text-slate-400">
          Premium starts with a {PREMIUM_TRIAL_DAYS}-day free trial, once per server. A payment
          method is required to start it.{' '}
          <span className="sm:block">
            When the trial ends, payment is required and Premium renews each period until you
            cancel.
          </span>
        </p>
      )}
    </>
  );
}

/** `band` marks the highlighted plan: a coloured strip on top and the gradient CTA. */
function PlanCard({
  name,
  band,
  badge,
  pricePerMonth,
  billing,
  cta,
  href,
}: {
  name: string;
  band?: string;
  badge?: string;
  pricePerMonth: number;
  billing: string;
  cta: string;
  href: string;
}) {
  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden py-0',
        // Same border width on both, or the lists wrap differently. md:mt-9 = the band's
        // height, so both card bodies start on one line.
        'border-2',
        band ? 'border-blue-500' : 'border-slate-800 md:mt-9'
      )}
    >
      {band && (
        <div className="bg-linear-to-r from-blue-500 to-blue-600 py-2.5 text-center text-xs leading-4 font-semibold tracking-widest text-white uppercase">
          {band}
        </div>
      )}
      <div className="flex flex-1 flex-col p-8">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-2xl font-bold text-white">{name}</h3>
          {badge && (
            <span className="rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-semibold text-green-400">
              {badge}
            </span>
          )}
        </div>

        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="bg-linear-to-r from-blue-300 to-blue-500 bg-clip-text text-4xl font-bold text-transparent">
            {formatUsd(pricePerMonth)}
          </span>
          <span className="text-slate-400">/month</span>
        </div>
        <p className="mt-2 text-sm text-slate-400">{billing}</p>

        <ul className="mt-6 mb-8 flex-1 space-y-3 text-slate-400">
          {CARD_FEATURES.map(feature => (
            <li key={feature.id} className="flex items-start gap-3">
              <Check className="mt-0.5 size-5 shrink-0 text-green-400" aria-hidden="true" />
              <PlanFeatureText feature={feature} />
            </li>
          ))}
        </ul>

        <Button
          size="lg"
          className={cn(
            'w-full border-0 text-white',
            band
              ? 'bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
              : 'bg-slate-800 hover:bg-slate-700'
          )}
          asChild
        >
          <Link href={href}>{cta}</Link>
        </Button>
      </div>
    </Card>
  );
}
