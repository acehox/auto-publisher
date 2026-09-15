import { ArrowRight, Check, Zap } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PREMIUM_PLAN_FEATURES } from '@/lib/plans';
import {
  formatUsd,
  PREMIUM_PRICE_MONTHLY_USD,
  PREMIUM_PRICE_YEARLY_USD,
  PREMIUM_TRIAL_DAYS,
  PREMIUM_YEARLY_PER_MONTH_USD,
  PREMIUM_YEARLY_SAVINGS_PERCENT,
} from '@/lib/pricing';

/**
 * The public /premium pricing: the two Premium billing options, Monthly and
 * Annual. Annual is the highlighted "Most Popular" plan (lower per-month price
 * + save badge). Neither CTA checks out — checkout is guild-scoped, so both
 * funnel into /dashboard?upgrade=<interval>: the flag's presence routes a free
 * guild straight to its subscription tab, and the value (month|year) preselects
 * that interval there.
 *
 * `trialOffered` comes from the server (`premiumTrialEnabled`), never a build constant, so
 * unsetting a trial price id removes every trial claim here in the same move that stops
 * checkout issuing one.
 *
 * This page is not guild-scoped and the visitor may not be logged in, so the copy says
 * "once per server" rather than asserting the reader still has one. The per-server truth is
 * on the subscription panel, which reads `trialAvailable` for the actual guild.
 */
export function PricingPlans({ trialOffered }: { trialOffered: boolean }) {
  // The trial clause opens the sentence rather than trailing it, so the two facts read in
  // the order they happen and the payment half is not a footnote to the free half.
  const billingLine = (amount: number, cadence: 'annually' | 'monthly'): string =>
    trialOffered
      ? `Free for ${PREMIUM_TRIAL_DAYS} days, then billed ${cadence} at ${formatUsd(amount)}.`
      : `Billed ${cadence} at ${formatUsd(amount)}.`;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto items-stretch">
        {/* Annual — Best Value. DOM-first so it stacks on top on mobile; ordered
          to the right on md+ via CSS order. */}
        <div className="relative md:order-2">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 text-xs font-semibold bg-linear-to-r from-blue-500 to-blue-600 text-white px-4 py-1 rounded-full shadow-lg shadow-blue-500/30 whitespace-nowrap">
            Best Value
          </span>
          <div className="absolute inset-0 bg-linear-to-r from-blue-500/20 to-purple-500/20 blur-3xl" />
          <Card className="relative bg-linear-to-br from-blue-500/10 to-purple-500/10 border-blue-500/40 p-8 flex flex-col h-full">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  <h3 className="text-white text-xl font-semibold">Annual</h3>
                </div>
                <span className="text-xs font-semibold bg-green-500/20 text-green-400 px-2.5 py-1 rounded-full">
                  Save {PREMIUM_YEARLY_SAVINGS_PERCENT}%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">
                  {formatUsd(PREMIUM_YEARLY_PER_MONTH_USD)}
                </span>
                <span className="text-slate-400">/month</span>
              </div>
              <p className="text-slate-400 text-sm mt-2">
                {billingLine(PREMIUM_PRICE_YEARLY_USD, 'annually')} Cancel anytime.
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {PREMIUM_PLAN_FEATURES.map(feature => (
                <li key={feature} className="flex items-start gap-3 text-slate-300">
                  <div className="w-5 h-5 bg-blue-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-blue-400" />
                  </div>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              size="lg"
              className="w-full bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 group"
              asChild
            >
              <Link href="/dashboard?upgrade=year">
                Choose Annual
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </Card>
        </div>

        {/* Monthly */}
        <Card className="bg-slate-900/50 border-blue-600/40 p-8 flex flex-col md:order-1">
          <div className="mb-6">
            <h3 className="text-white text-xl font-semibold mb-2">Monthly</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-white">
                {formatUsd(PREMIUM_PRICE_MONTHLY_USD)}
              </span>
              <span className="text-slate-400">/month</span>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              {billingLine(PREMIUM_PRICE_MONTHLY_USD, 'monthly')} Cancel anytime.
            </p>
          </div>

          <ul className="space-y-3 mb-8 flex-1">
            {PREMIUM_PLAN_FEATURES.map(feature => (
              <li key={feature} className="flex items-start gap-3 text-slate-300">
                <div className="w-5 h-5 bg-slate-700/50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-slate-300" />
                </div>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            size="lg"
            variant="outline"
            className="w-full bg-linear-to-r from-blue-900 to-blue-800 hover:from-blue-800 hover:to-blue-700 text-white border-0 group"
            asChild
          >
            <Link href="/dashboard?upgrade=month">Choose Monthly</Link>
          </Button>
        </Card>
      </div>

      {/* The payment-required statement, once, under both cards rather than duplicated in
          each. It belongs at the point of purchase rather than on the legal pages: the
          14-day withdrawal right stays a one-time right only if the buyer was told here
          that payment follows the free period, and otherwise a second right attaches to
          the first real charge. Reasoning in .claude/CLAUDE.md. */}
      {trialOffered && (
        <p className="text-slate-500 text-sm text-center mt-8 max-w-2xl mx-auto">
          The free trial runs for {PREMIUM_TRIAL_DAYS} days and is available once per server. A
          payment method is required to start it.{' '}
          <strong className="text-slate-400">When the trial ends, payment is required</strong> —
          your subscription continues at the price above and renews each period until you cancel.
          Cancel before the trial ends and you are never charged.
        </p>
      )}
    </>
  );
}
