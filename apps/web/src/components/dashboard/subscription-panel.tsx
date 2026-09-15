'use client';

import { Check, Clock, ExternalLink, Loader2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useGuild } from '@/components/dashboard/guild-context';
import { LegacyMigrateModal } from '@/components/dashboard/legacy-migrate-modal';
import { NoticeStrip } from '@/components/dashboard/notice-strip';
import { PageHeader } from '@/components/dashboard/page-header';
import { shouldOfferWithdrawal, WithdrawalPanel } from '@/components/dashboard/withdrawal-panel';
import { PlanComparisonTable } from '@/components/plan-comparison-table';
import { useLegacySunsetLabel, useSiteConfig } from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { createCheckout } from '@/lib/api/actions';
import type { SubscriptionData, SubscriptionDetail } from '@/lib/api/types';
import { guildIconUrl } from '@/lib/discord';
import { PREMIUM_PLAN_FEATURES } from '@/lib/plans';
import {
  formatUsd,
  PREMIUM_PRICE_MONTHLY_USD,
  PREMIUM_PRICE_YEARLY_USD,
  PREMIUM_TRIAL_DAYS,
  PREMIUM_YEARLY_PER_MONTH_USD,
  PREMIUM_YEARLY_SAVINGS_PERCENT,
} from '@/lib/pricing';
import { useSubscriptionDetail } from '@/lib/use-subscription-detail';
import { cn } from '@/lib/utils';

interface SubscriptionPanelProps {
  guildId: string;
  guildName: string;
  subscription: SubscriptionData | null;
}

const statusBadges: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-green-500/40 bg-green-500/10 text-green-400' },
  trialing: { label: 'Trial', className: 'border-blue-500/40 bg-blue-500/10 text-blue-300' },
  past_due: { label: 'Past due', className: 'border-red-500/40 bg-red-500/10 text-red-400' },
  canceled: { label: 'Cancelled', className: 'border-slate-700 bg-slate-800/60 text-slate-400' },
  paused: { label: 'Paused', className: 'border-slate-700 bg-slate-800/60 text-slate-400' },
};

const badgeBase =
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium';

const intervalLabels: Record<string, string> = { month: 'Monthly', year: 'Yearly' };

/**
 * One column and one card at every breakpoint. Dropping the desktop two-column
 * split removed the reason the mobile layout was hiding its left column, and it
 * keeps the CTA the last thing on screen at every width.
 */
export function SubscriptionPanel({ guildId, guildName, subscription }: SubscriptionPanelProps) {
  // Narrowed rather than a boolean so the entitled branch keeps a non-null
  // subscription without an assertion.
  const entitled =
    subscription && ['active', 'trialing', 'past_due'].includes(subscription.status)
      ? subscription
      : null;

  // Above the entitled/free branch: the withdrawal control renders for
  // non-entitled statuses too.
  const { detail, failed } = useSubscriptionDetail(guildId, !!subscription);
  const withdrawal = detail?.withdrawal ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Subscription"
        meta={entitled ? undefined : 'Each server is billed separately.'}
      />

      {entitled ? (
        <BillingCard subscription={entitled} detail={detail} failed={failed} />
      ) : (
        <UpgradeCard guildId={guildId} guildName={guildName} />
      )}

      {/* Statutory withdrawal (ZZP čl. 81.a / CRD Art 11a), outside the
          entitled/free branch on purpose: availability is the 14-day window and
          nothing else, so a day-3 cancellation still finds it. */}
      {shouldOfferWithdrawal(withdrawal) && withdrawal && (
        <WithdrawalPanel guildId={guildId} withdrawal={withdrawal} />
      )}
    </div>
  );
}

/** Shared card chrome: the blue→purple hairline is the Premium marker. */
function PremiumCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="h-0.5 bg-linear-to-r from-blue-500 to-purple-500" />
      <div className="space-y-4 p-5">{children}</div>
    </div>
  );
}

/**
 * The entitled state. Features come from PREMIUM_PLAN_FEATURES so this card and
 * /premium cannot describe the same plan differently.
 */
function BillingCard({
  subscription,
  detail,
  failed,
}: {
  subscription: SubscriptionData;
  detail: SubscriptionDetail | null;
  failed: boolean;
}) {
  const pastDue = subscription.status === 'past_due';
  const cancelScheduled = subscription.scheduledChange?.action === 'cancel';
  const badge = statusBadges[subscription.status] ?? statusBadges.active;
  const intervalLabel = subscription.billingInterval
    ? intervalLabels[subscription.billingInterval]
    : null;

  const dateValue = cancelScheduled
    ? subscription.scheduledChange?.effectiveAt
    : subscription.currentPeriodEndsAt;
  // A trialing subscription has not been billed, so the same date is the FIRST
  // charge, not the next one — "Next billing date" would imply a payment went
  // through, on the very card where a trial user decides whether to cancel first.
  const trialing = !cancelScheduled && subscription.status === 'trialing';
  const dateLabel =
    cancelScheduled || subscription.status === 'canceled'
      ? 'Access until'
      : trialing
        ? 'First billing date'
        : 'Next billing date';

  return (
    <PremiumCard>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-white">
          <Zap className="size-4" aria-hidden="true" />
          Premium
        </h2>
        <span className={cn(badgeBase, badge.className)}>{badge.label}</span>
        {intervalLabel && (
          <span className={cn(badgeBase, 'border-slate-700 text-slate-400')}>{intervalLabel}</span>
        )}
      </div>

      {pastDue && (
        <NoticeStrip tone="red">
          Your last payment failed. Publishing continues for now — update your payment method to
          keep Premium.
        </NoticeStrip>
      )}

      <ul className="space-y-2">
        {PREMIUM_PLAN_FEATURES.map(feature => (
          <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-200">
            <Check className="size-4 shrink-0 text-green-400" aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>

      {dateValue && (
        <div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            {dateLabel}:
            <span className="font-medium text-white">
              {new Date(dateValue).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </p>
          {trialing && (
            <p className="mt-1 pl-6.5 text-xs text-slate-400">Your free trial runs until then.</p>
          )}
          {cancelScheduled && (
            <p className="mt-1 pl-6.5 text-xs text-slate-400">
              Channels keep publishing until then, and settings are kept after.
            </p>
          )}
        </div>
      )}

      {subscription.isSubscriber ? (
        failed || (detail && !detail.portalUrl) ? (
          // Paddle deep links are fetched, so they can fail to load. One quiet
          // sentence where the buttons would be, never a dead button.
          <p className="text-xs text-amber-400">
            Billing controls didn&apos;t load. Try again in a moment.
          </p>
        ) : detail?.portalUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant={pastDue ? 'default' : 'secondary'}>
              <a href={detail.portalUrl} target="_blank" rel="noopener noreferrer">
                {/* portalUrl is the subscription-scoped payment-method deep link,
                    so this label is literal, not a euphemism, when past due. */}
                {pastDue ? 'Update payment method' : 'Manage subscription'}
                <ExternalLink className="size-3" />
              </a>
            </Button>
            {/* Deliberately not the primary action, and deliberately NOT labelled
                as a withdrawal: it ends the renewal at period close and refunds
                nothing. Hidden once a cancellation is scheduled — Paddle's deep
                link degrades to an account overview there, so the button would
                stop doing what it says. */}
            {detail.cancelUrl && !cancelScheduled && (
              <a
                href={detail.cancelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 transition-colors hover:text-slate-200"
              >
                Cancel subscription
              </a>
            )}
          </div>
        ) : (
          <Skeleton className="h-9 w-45 bg-slate-800" />
        )
      ) : (
        <div className="rounded-lg border border-slate-800 px-3.5 py-3 text-xs text-slate-300">
          Billing is managed by{' '}
          {failed ? (
            'another member'
          ) : detail ? (
            `@${detail.subscriber.username ?? detail.subscriber.id}`
          ) : (
            <Skeleton className="inline-block h-3.5 w-24 bg-slate-800 align-middle" />
          )}
          .
        </div>
      )}

      {/* States the effect positively rather than denying a refund — a
          disclaimer has to raise the idea in order to rule it out. */}
      <p className="text-xs leading-relaxed text-slate-500">
        Cancelling stops renewals at the end of the period.{' '}
        <Link href="/refunds" target="_blank" className="text-slate-400 hover:underline">
          Refunds policy
        </Link>
      </p>
    </PremiumCard>
  );
}

type BillingInterval = 'month' | 'year';

const BILLING_INTERVAL_OPTIONS: SegmentedOption<BillingInterval>[] = [
  { value: 'month', label: 'Monthly' },
  {
    value: 'year',
    ariaLabel: `Yearly, save ${PREMIUM_YEARLY_SAVINGS_PERCENT} percent`,
    label: (
      <>
        Yearly
        <span className="text-green-400">&minus;{PREMIUM_YEARLY_SAVINGS_PERCENT}%</span>
      </>
    ),
  },
];

/**
 * The free state. Legal items keep a fixed order — price, trial disclosure,
 * comparison, terms checkbox, hrvatski notice, CTA, payment reassurance — and
 * the CTA stays pressable when the box is unticked, stating the blocker
 * underneath: a disabled button hides its reason, especially on touch.
 */
function UpgradeCard({ guildId, guildName }: { guildId: string; guildName: string }) {
  const { guild, data } = useGuild();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { freeChannelLimit } = useSiteConfig();
  const sunsetLabel = useLegacySunsetLabel();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  // Unticked by default and never pre-ticked: a pre-ticked box is not acceptance.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Preselect the interval picked on /premium (?upgrade=month|year, forwarded by
  // the server selector); default yearly, matching the "from $4.17/mo" framing.
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    searchParams.get('upgrade') === 'month' ? 'month' : 'year'
  );

  // MIGRATION: Premium's value lives on registered channel rows that only exist
  // post-migration, so checkout is gated on it. Removed at sunset.
  const migrated = data.migrated;
  // Server-decided, from the same predicate the checkout route picks the price
  // with. Never re-derive from `subscription === null` — this also renders for a
  // cancelled subscription, and a trial claim the checkout contradicts hands the
  // buyer a second 14-day full-refund right over a real charge.
  const trialAvailable = data.trialAvailable;

  const handleUpgrade = useCallback(() => {
    if (!migrated) {
      setMigrateOpen(true);
      return;
    }
    if (!acceptedTerms) {
      // A toast, not inline text: inline grew the card and pushed the CTA down
      // under the cursor mid-click. Fixed id so repeats replace one toast.
      toast.warning('Accept the terms to continue', {
        id: 'accept-terms',
        description: 'Check the box to agree to the Terms and the Refunds & Withdrawal policy.',
      });
      return;
    }
    setError(false);
    startTransition(async () => {
      try {
        const { transactionId } = await createCheckout(guild.id, billingInterval);
        // Only the guild name and icon ride along, to orient the page behind the
        // overlay — nothing about price or plan, since the customer can edit the
        // query string and the overlay is the authority on both.
        const params = new URLSearchParams({ _ptxn: transactionId, g: guildName });
        const iconUrl = guildIconUrl(guild.id, guild.icon);
        if (iconUrl) params.set('icon', iconUrl);
        router.push(`/checkout?${params.toString()}`);
      } catch {
        setError(true);
      }
    });
  }, [guild.id, guild.icon, guildName, billingInterval, migrated, acceptedTerms, router]);

  const enabled = data.channels.filter(channel => channel.enabled).length;
  const paused = data.channels.filter(channel => channel.hasSavedSetup).length;
  const limit = data.channelLimit;
  const atLimit = limit !== 0 && enabled >= limit;

  return (
    <div className="space-y-3.5">
      {/* The one fact on this page about THIS server rather than about the
          plans, and the reason the cap is worth paying to remove. */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-3">
        <p className="text-xs text-slate-300">
          {migrated
            ? `${enabled} of ${limit} channels used`
            : `Legacy mode — ${data.channels.length} channels publishing`}
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn('h-full', !migrated || atLimit ? 'bg-amber-400' : 'bg-blue-500')}
            style={{
              width:
                migrated && limit !== 0 ? `${Math.min(100, (enabled / limit) * 100)}%` : '100%',
            }}
          />
        </div>
        {/* MIGRATION: a legacy guild has no allowlist, so nothing can be paused
            over the cap — the echo would name a state it cannot be in. */}
        {migrated && paused > 0 && (
          <p className="mt-2 text-[11px] text-yellow-400">
            {paused} channel{paused !== 1 ? 's are' : ' is'} paused over the limit — setup kept.
          </p>
        )}
      </div>

      {error && (
        <NoticeStrip tone="red">Couldn&apos;t start checkout. Please try again.</NoticeStrip>
      )}

      <PremiumCard>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-base font-semibold text-white">Premium</h2>
          <SegmentedControl
            options={BILLING_INTERVAL_OPTIONS}
            value={billingInterval}
            onChange={setBillingInterval}
            size="sm"
          />
        </div>

        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight text-white">
              {formatUsd(
                billingInterval === 'month'
                  ? PREMIUM_PRICE_MONTHLY_USD
                  : PREMIUM_YEARLY_PER_MONTH_USD
              )}
            </span>
            <span className="text-xs text-slate-400">/ month</span>
          </p>
          {billingInterval === 'year' && (
            <p className="mt-1.5 text-xs text-slate-500">
              Billed annually at {formatUsd(PREMIUM_PRICE_YEARLY_USD)}.
            </p>
          )}
          {/* The pre-contractual trial disclosure, and the reason the trial could
              not ship without it: the 14-day withdrawal right stays a one-time
              right only if the buyer is told at the point of purchase that
              payment follows the free period. Absent that, a second right
              attaches to the first real charge — a full refund for every buyer.
              This is the last screen we own before Paddle takes over, so it
              belongs beside the price and above the CTA, not on /terms.

              No first-charge DATE: this component server-renders first, so a
              `Date.now() + 14d` label would hydrate to a different string, and
              Paddle's overlay shows the exact date on the next screen. */}
          {trialAvailable && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              After the {PREMIUM_TRIAL_DAYS}-day trial,{' '}
              {billingInterval === 'year'
                ? `${formatUsd(PREMIUM_PRICE_YEARLY_USD)} per year`
                : `${formatUsd(PREMIUM_PRICE_MONTHLY_USD)} per month`}{' '}
              is charged automatically and renews until you cancel.
            </p>
          )}
        </div>

        <PlanComparisonTable compact freeChannelLimit={freeChannelLimit} />

        {/* MIGRATION: said once, in the card that is blocked, with the step as
            its button. Removed at sunset. */}
        {!migrated && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/35 bg-amber-500/5 px-3.5 py-3">
            <p className="min-w-42 flex-1 text-xs leading-snug text-slate-200">
              One step first: choose which channels publish. Legacy mode ends {sunsetLabel}.
            </p>
            <Button
              size="sm"
              onClick={() => setMigrateOpen(true)}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            >
              Set up channels
            </Button>
          </div>
        )}

        {/* Paddle's seller policy requires acceptance BEFORE purchase and the
            overlay has no field for it, so the gate lives here. The server
            requires it too; this checkbox is the disclosure, not the
            enforcement. Absent while unmigrated — there is nothing to accept
            until checkout is reachable. Links open in a new tab so reading them
            doesn't discard the chosen interval or the tick. */}
        {migrated && (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="accept-terms"
                checked={acceptedTerms}
                onCheckedChange={checked => setAcceptedTerms(checked === true)}
                className="mt-0.5"
              />
              <label
                htmlFor="accept-terms"
                className="cursor-pointer text-xs leading-relaxed text-slate-300"
              >
                I have read and agree to the{' '}
                <Link href="/terms" target="_blank" className="text-blue-400 hover:underline">
                  Terms of Service
                </Link>{' '}
                and the{' '}
                <Link href="/refunds" target="_blank" className="text-blue-400 hover:underline">
                  Refunds &amp; Withdrawal policy
                </Link>
              </label>
            </div>
            {/* ZZP čl. 60 st. 9's Croatian notice, given a labelled home of its
                own so the statutory language link no longer collides with the
                two policy links. Deliberately OUTSIDE the checkbox label: that
                sentence is simultaneously the Paddle acceptance disclosure and
                must not be re-worded. */}
            <p className="pl-6.5 text-[11px] text-slate-500">
              Croatian-language withdrawal notice:{' '}
              <Link
                href="/refunds#obavijest-na-hrvatskom-jeziku"
                target="_blank"
                hrefLang="hr"
                lang="hr"
                className="hover:underline"
              >
                hrvatski
              </Link>
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Button
            className="w-full"
            size="lg"
            onClick={handleUpgrade}
            disabled={isPending || !migrated}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {trialAvailable ? `Start ${PREMIUM_TRIAL_DAYS}-day free trial` : 'Upgrade to Premium'}
          </Button>
          {!migrated && (
            <p className="text-center text-[11px] text-red-300">
              Premium plan is only available for migrated servers.
            </p>
          )}
          <p className="text-center text-[11px] text-slate-500">Secure payment via Paddle</p>
        </div>
      </PremiumCard>

      {migrateOpen && (
        <LegacyMigrateModal
          guildId={guildId}
          channels={data.channels}
          limit={data.channelLimit === 0 ? null : data.channelLimit}
          onClose={() => setMigrateOpen(false)}
        />
      )}
    </div>
  );
}
