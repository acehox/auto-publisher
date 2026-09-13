'use client';

import {
  AlertCircle,
  Calendar,
  Check,
  Crown,
  ExternalLink,
  Loader2,
  Lock,
  PauseCircle,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useGuild } from '@/components/dashboard/guild-context';
import { LegacyMigrateModal } from '@/components/dashboard/legacy-migrate-modal';
import { shouldOfferWithdrawal, WithdrawalPanel } from '@/components/dashboard/withdrawal-panel';
import { PlanComparisonTable } from '@/components/plan-comparison-table';
import { useLegacySunsetLabel, useSiteConfig } from '@/components/site-config-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  PREMIUM_YEARLY_SAVINGS_USD,
} from '@/lib/pricing';
import { useSubscriptionDetail } from '@/lib/use-subscription-detail';

interface SubscriptionPanelProps {
  guildId: string;
  guildName: string;
  subscription: SubscriptionData | null;
}

// Honest feature list shared with the public /premium page so paid value reads
// the same everywhere (@/lib/plans is the single source). The free state doesn't
// use it — it renders PLAN_COMPARISON, which states both sides of every row.
const premiumBenefits = PREMIUM_PLAN_FEATURES;

const statusLabels: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  trialing: {
    label: 'Trial',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  past_due: {
    label: 'Past Due',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  canceled: {
    label: 'Cancelled',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  paused: {
    label: 'Paused',
    className: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  },
};

const intervalLabels: Record<string, string> = {
  month: 'Monthly',
  year: 'Yearly',
};

export function SubscriptionPanel({ guildId, guildName, subscription }: SubscriptionPanelProps) {
  // Narrowed rather than a boolean flag so the entitled branch keeps a non-null
  // subscription without an assertion.
  const entitledSubscription =
    subscription &&
    (subscription.status === 'active' ||
      subscription.status === 'trialing' ||
      subscription.status === 'past_due')
      ? subscription
      : null;

  // Above the entitled/free branch: the withdrawal control renders for non-entitled
  // statuses too.
  const { detail, failed } = useSubscriptionDetail(guildId, !!subscription);
  const withdrawal = detail?.withdrawal ?? null;

  return (
    <div className="space-y-6">
      {/* Register follows state: a free server is being offered something, an
          entitled one is administering something. The nav label stays
          "Subscription" either way — renaming a tab per plan state would make
          the same nav item mean different things to different users. */}
      <div>
        <h2 className="text-2xl text-white mb-2">{entitledSubscription ? 'Billing' : 'Premium'}</h2>
        <p className="text-slate-400">
          {entitledSubscription
            ? `Manage Premium for ${guildName}`
            : `Unlock unlimited channels and per-channel filters for ${guildName}`}
        </p>
      </div>

      {/* Left-aligned rather than centred: a centred max-w-md card under a
          left-aligned heading reads as a different page width per plan state.
          max-w-2xl keeps the one card from stretching to the full content
          column. */}
      {entitledSubscription ? (
        <div className="max-w-2xl">
          <ActiveSubscription subscription={entitledSubscription} detail={detail} failed={failed} />
        </div>
      ) : (
        <FreeSubscription guildId={guildId} guildName={guildName} />
      )}

      {/* Statutory withdrawal (ZZP čl. 81.a / CRD Art 11a), outside the entitled/free
          branch on purpose: availability is the 14-day window and nothing else, so a
          day-3 cancellation still finds it. `shouldOfferWithdrawal` owns the predicate. */}
      {shouldOfferWithdrawal(withdrawal) && withdrawal && (
        <div className="max-w-2xl">
          <WithdrawalPanel guildId={guildId} withdrawal={withdrawal} />
        </div>
      )}
    </div>
  );
}

// Paid IS working: one bot serves both plans, so an entitled subscription
// un-pauses the guild's channels in place — nothing has to be invited or handed
// over first, which is why this card no longer has an "activating" state.
function ActiveSubscription({
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

  // The branch (manage button vs "managed by @X") is known at first paint from
  // the aggregate's isSubscriber flag; `detail` arrives as a prop and resolves
  // into skeletons that hold their footprint until the fetch lands.
  const statusInfo = statusLabels[subscription.status] ?? statusLabels.active;
  const intervalLabel = subscription.billingInterval
    ? intervalLabels[subscription.billingInterval]
    : null;

  return (
    <div className="space-y-6">
      <Card className="bg-linear-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30 p-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-linear-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Crown className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-2xl text-white">Premium Plan</h3>
                <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                {intervalLabel && (
                  <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                    {intervalLabel}
                  </Badge>
                )}
              </div>
              <p className="text-slate-400">All premium features active</p>
            </div>
          </div>
        </div>

        {pastDue && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-white text-sm mb-1">Payment failed</p>
              <p className="text-slate-300 text-sm">
                Update your payment method to keep Premium. Publishing continues in the meantime.
              </p>
            </div>
          </div>
        )}

        {(() => {
          const dateValue = cancelScheduled
            ? subscription.scheduledChange?.effectiveAt
            : subscription.currentPeriodEndsAt;
          if (!dateValue) return null;
          // A trialing subscription has not been billed yet, so the same date is the FIRST
          // charge, not the next one. Labelled as such: this card is where a trial user
          // decides whether to cancel before paying, and "Next Billing Date" implies a
          // payment already went through. Paddle populates current_billing_period during a
          // trial (it is null only for paused/canceled), and for a trial that period ends
          // on the first bill date.
          const trialing = !cancelScheduled && subscription.status === 'trialing';
          return (
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 mb-6">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
                <Calendar className="w-4 h-4" />
                <span>
                  {cancelScheduled || subscription.status === 'canceled'
                    ? 'Access Until'
                    : trialing
                      ? 'First Billing Date'
                      : 'Next Billing Date'}
                </span>
              </div>
              <p className="text-2xl text-white">
                {new Date(dateValue).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              {trialing && (
                <p className="text-slate-400 text-sm mt-2">Your free trial runs until then.</p>
              )}
              {cancelScheduled && (
                <p className="text-slate-400 text-sm mt-2">
                  Your subscription is set to cancel at the end of the billing period.
                </p>
              )}
            </div>
          );
        })()}

        <ul className="space-y-3 mb-6">
          {premiumBenefits.map(benefit => (
            <li key={benefit} className="flex items-center gap-3 text-slate-300">
              <Check className="w-5 h-5 shrink-0 text-green-400" />
              {benefit}
            </li>
          ))}
        </ul>

        {subscription.isSubscriber ? (
          failed || (detail && !detail.portalUrl) ? (
            <div className="flex h-9 w-full items-center">
              <p className="text-slate-500 text-sm">Couldn&apos;t load billing controls.</p>
            </div>
          ) : detail?.portalUrl ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200"
                  asChild
                >
                  <a href={detail.portalUrl} target="_blank" rel="noopener noreferrer">
                    {/* portalUrl is the subscription-scoped
                        updateSubscriptionPaymentMethod deep link, so this label is
                        literal, not a euphemism, when the card has failed. */}
                    {pastDue ? 'Update payment method' : 'Manage subscription'}
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
                {/* Cancellation gets its own button rather than staying buried one
                    hop inside the portal. Hidden once a cancellation is already
                    scheduled — Paddle's deep link degrades to an account overview in
                    that state, so the button would stop doing what it says.
                    Deliberately not styled as the primary action, and deliberately
                    NOT labelled as a withdrawal: it schedules the subscription to end
                    at period close and refunds nothing. */}
                {detail.cancelUrl && !cancelScheduled && (
                  <Button
                    variant="outline"
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-200"
                    asChild
                  >
                    <a href={detail.cancelUrl} target="_blank" rel="noopener noreferrer">
                      Cancel subscription
                      <ExternalLink className="w-3 h-3 ml-2" />
                    </a>
                  </Button>
                )}
              </div>
              {/* States what the button does and where refunds live. No statute requires
                  a "this is not a refund" disclaimer, and stating the effect positively
                  beats denying a refund — a disclaimer has to raise the idea in order to
                  rule it out. It matters here because until the withdrawal control exists
                  this is the only control a subscriber inside the 14 days can see, and it
                  stops the renewal without refunding anything. */}
              {detail.cancelUrl && !cancelScheduled && (
                <p className="text-slate-500 text-sm">
                  Cancelling stops renewals at the end of the billing period. See{' '}
                  <Link href="/refunds" target="_blank" className="text-slate-400 hover:underline">
                    Refunds &amp; Withdrawal
                  </Link>{' '}
                  for refund information.
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-9 w-full items-center justify-center">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
          )
        ) : (
          <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-900/50 rounded-lg p-4 border border-slate-800">
            <UserRound className="w-4 h-4 shrink-0" />
            <span className="flex items-center gap-1">
              Billing is managed by{' '}
              {failed ? (
                <span className="text-slate-300">another member</span>
              ) : detail ? (
                <span className="text-slate-300">
                  @{detail.subscriber.username ?? detail.subscriber.id}
                </span>
              ) : (
                <Skeleton className="inline-block h-4 w-24 bg-slate-800" />
              )}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Live channel usage for a migrated free guild — the one fact on this page that
 * is about THIS server rather than about the plans, and the reason the cap is
 * worth paying to remove. Reads `data.channelLimit` (the guild's own resolved
 * cap) rather than the FREE_CHANNEL_LIMIT display constant.
 *
 * Paused channels are surfaced here because the paused banner's CTA lands on
 * this page (ADR 0009): without the echo, the setup that banner promised is
 * "saved" is invisible at the moment of deciding whether to pay for it.
 */
function ChannelUsage() {
  const { guild, data } = useGuild();
  const enabled = data.channels.filter(channel => channel.enabled).length;
  const paused = data.channels.filter(channel => channel.hasSavedSetup).length;
  const limit = data.channelLimit;
  // channelLimit 0 = unlimited; unreachable in the free state today, but a bar
  // with no denominator would be a divide-by-zero rather than a design choice.
  const percentage = limit === 0 ? 0 : Math.min(100, (enabled / limit) * 100);
  const atLimit = limit !== 0 && enabled >= limit;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-slate-400 text-sm">Channels in use</span>
        <span className="text-sm">
          <span className={atLimit ? 'text-yellow-400' : 'text-white'}>{enabled}</span>
          {limit !== 0 && <span className="text-slate-500"> of {limit}</span>}
        </span>
      </div>
      {limit !== 0 && (
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all ${atLimit ? 'bg-yellow-500' : 'bg-blue-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {paused > 0 && (
        <p className="text-slate-400 text-sm mt-3 flex items-start gap-2">
          <PauseCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <span>
            {paused} channel{paused !== 1 ? 's are' : ' is'} paused over the limit. Their setup is
            saved and returns with Premium &mdash;{' '}
            <Link
              href={`/dashboard/${guild.id}/channels`}
              className="text-blue-400 hover:underline"
            >
              review channels
            </Link>
            .
          </span>
        </p>
      )}
    </div>
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
        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
          Save {PREMIUM_YEARLY_SAVINGS_PERCENT}%
        </span>
      </>
    ),
  },
];

function FreeSubscription({ guildId, guildName }: { guildId: string; guildName: string }) {
  const { guild, data } = useGuild();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  // Preselect the interval the user picked on the public /premium page
  // (?upgrade=month|year, forwarded by the server selector); default to yearly,
  // which matches the "from $4.17/mo" framing shown everywhere else.
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    searchParams.get('upgrade') === 'month' ? 'month' : 'year'
  );
  const [migrateOpen, setMigrateOpen] = useState(false);
  const sunsetLabel = useLegacySunsetLabel();
  const { freeChannelLimit } = useSiteConfig();
  // Unticked by default and never pre-ticked: Paddle requires the buyer to accept the
  // terms and refund policy before purchase, and a pre-ticked box is not acceptance.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // A guild must be migrated (allowlist model) before it can buy Premium —
  // Premium configures per-channel filters, which need registered channels.
  // MIGRATION: Remove this gate after migration period (6 months)
  const migrated = data.migrated;

  // Server-decided (one trial per guild ever, and trial prices configured), from the same
  // predicate the checkout route picks the price with. Never re-derive it here from
  // `subscription === null` — this component also renders for a cancelled subscription,
  // which is trial-ineligible, and a trial claim the checkout contradicts hands the buyer a
  // second 14-day full-refund right over a real charge.
  const trialAvailable = data.trialAvailable;

  const router = useRouter();

  const handleUpgrade = useCallback(() => {
    if (!migrated) return;
    // The button stays live and explains the blocker on press, rather than sitting
    // disabled — same reasoning as the legacy branch below. A disabled control makes
    // the obstacle discoverable only by hovering it, which never happens on touch.
    // A toast rather than inline text, which grew the card and pushed the CTA down under
    // the cursor mid-click. Fixed `id` so repeated presses replace one toast.
    if (!acceptedTerms) {
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
        // Unified checkout: the /checkout page loads Paddle.js and auto-opens the overlay
        // from _ptxn. Only the guild name and icon ride along, to orient the page sitting
        // behind the overlay — nothing about price or plan, since the customer can edit the
        // query string and the overlay is the authority on both. The guild itself is bound
        // in the transaction's server-set custom_data, not here.
        const params = new URLSearchParams({
          _ptxn: transactionId,
          g: guildName,
        });
        const iconUrl = guildIconUrl(guild.id, guild.icon);
        if (iconUrl) params.set('icon', iconUrl);
        router.push(`/checkout?${params.toString()}`);
      } catch {
        setError(true);
      }
    });
  }, [guild.id, guild.icon, guildName, billingInterval, migrated, acceptedTerms, router]);

  // Hoisted out of the JSX: three independent conditions (migration gate, in-flight,
  // trial) crossed into one label read worse inline than the icon triple below does.
  const ctaLabel = !migrated
    ? 'Set up channels first'
    : isPending
      ? trialAvailable
        ? 'Starting trial...'
        : 'Upgrading...'
      : trialAvailable
        ? `Start ${PREMIUM_TRIAL_DAYS}-day free trial`
        : 'Upgrade to Premium';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Left column: what you have now + migration gate. The comparison renders
          for legacy guilds too (they can still weigh the upgrade) — only the live
          channel usage is withheld, since a legacy guild publishes from every
          announcement channel and has no enabled-channel count to report. */}
      {/* flex-col gap rather than space-y: the first child is display:none below
          md, and space-y would leave its margin behind as a gap at the top of the
          column. Flex gap ignores hidden children. */}
      <div className="flex flex-col gap-6">
        {/* md and up only. Stacked on a phone this card sits between the heading
            and the price, pushing the CTA — the reason the page exists — off
            screen; the comparison is reference material, not the primary action.
            Live channel usage and the paused-channels echo ride inside it, so
            they're desktop-only too; both are also on Overview and Channels. */}
        <Card className="hidden lg:block bg-slate-900/50 border-slate-800 p-6">
          <h3 className="text-white text-lg mb-1">You&apos;re on the Free plan</h3>
          <p className="text-slate-400 text-sm">
            Here&apos;s what changes with Premium for {guildName}.
          </p>
          {migrated && <ChannelUsage />}
          <PlanComparisonTable className="mt-5" freeChannelLimit={freeChannelLimit} />
        </Card>

        {error && (
          <Card className="bg-red-500/10 border-red-500/30 p-4">
            <p className="text-red-400 text-sm">Failed to create checkout. Please try again.</p>
          </Card>
        )}

        {/* MIGRATION: Remove this setup gate after migration period (6 months) */}
        {!migrated && (
          <Card className="bg-amber-500/10 border-amber-500/30 p-6">
            <div className="flex items-start gap-4">
              <Lock className="w-6 h-6 text-amber-400 shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-white text-lg mb-1">Finish channel setup to unlock Premium</h3>
                <p className="text-slate-300 text-sm mb-2">
                  Auto Publisher is currently running in legacy mode, and migration is required to
                  unlock Premium features. Premium adds per-channel filters and control &mdash;
                  which start from choosing which channels to manage.
                </p>
                <p className="text-amber-300 text-sm mb-4">
                  Legacy mode ends on{' '}
                  <span className="text-white font-semibold">{sunsetLabel}</span>.
                </p>
                <Button
                  onClick={() => setMigrateOpen(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950"
                >
                  Set up channels
                </Button>
                <p className="text-slate-500 text-sm mt-3">
                  Takes a few seconds. You can upgrade right after.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {migrateOpen && (
        <LegacyMigrateModal
          guildId={guildId}
          channels={data.channels}
          limit={data.channelLimit === 0 ? null : data.channelLimit}
          hasSubscription={guild.hasSubscription}
          onClose={() => setMigrateOpen(false)}
        />
      )}

      {/* Right column: upgrade */}
      <div className="relative">
        <div className="absolute inset-0 bg-linear-to-r from-blue-500/20 to-purple-500/20 blur-3xl" />
        <Card className="relative bg-linear-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-linear-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-3xl text-white mb-2">Upgrade to Premium</h3>
            <p className="text-slate-400 mb-6">Unlock all features for {guildName}</p>

            {/* Billing interval toggle — the shared control, so this reads and
                behaves like the filter match-mode toggle and inherits its
                aria-pressed (the hand-rolled pair announced nothing). */}
            <SegmentedControl
              options={BILLING_INTERVAL_OPTIONS}
              value={billingInterval}
              onChange={setBillingInterval}
              className="mb-6"
            />

            {/* Price display */}
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-5xl text-white">
                {billingInterval === 'month'
                  ? formatUsd(PREMIUM_PRICE_MONTHLY_USD)
                  : formatUsd(PREMIUM_YEARLY_PER_MONTH_USD)}
              </span>
              <span className="text-slate-400 text-xl">/month</span>
            </div>
            {billingInterval === 'year' && (
              <p className="text-slate-500 text-sm mt-2">
                Billed annually at {formatUsd(PREMIUM_PRICE_YEARLY_USD)}
                <span className="text-green-400 ml-2">
                  (save {formatUsd(PREMIUM_YEARLY_SAVINGS_USD)}/year)
                </span>
              </p>
            )}

            {/* The pre-contractual trial disclosure, and the reason the trial could not ship
                without it: the 14-day withdrawal right stays a one-time right only if the
                buyer is told at the point of purchase that payment follows the free period.
                Absent that, a second right attaches to the first real charge — a full refund
                for every buyer. This is the last screen we own before Paddle takes over, so
                it belongs here, beside the price and above the CTA, not on /terms. Reasoning
                in .claude/CLAUDE.md.

                It states four facts and no more: payment follows, when, how much, and that it
                recurs. No first-charge DATE — this component server-renders first, so a
                `Date.now() + 14d` label would hydrate to a different string, and Paddle's
                overlay shows the exact date on the next screen. "Free today" is left to
                `ctaLabel`, now the only prominent carrier of it on this screen: a label that
                loses the word "free" takes that fact with it. */}
            {trialAvailable && (
              <p className="text-slate-400 text-sm mt-4 text-left">
                After the {PREMIUM_TRIAL_DAYS}-day trial,{' '}
                {billingInterval === 'year'
                  ? `${formatUsd(PREMIUM_PRICE_YEARLY_USD)} per year`
                  : `${formatUsd(PREMIUM_PRICE_MONTHLY_USD)} per month`}{' '}
                is charged automatically and renews until you cancel.
              </p>
            )}
          </div>

          {/* No feature list here on purpose: it used to repeat
              PREMIUM_PLAN_FEATURES verbatim beside the comparison table, which
              said the same things with the free side attached. Dropping it also
              shrinks this card away from being a pixel-twin of the locked tab's
              hero, which is what made arriving here read as a no-op. */}

          {/* Legacy guilds get a LIVE button into the thing that unlocks
              checkout, not a dead one. A disabled control plus a native
              title tooltip made the blocker discoverable only by hovering the
              obstacle — and only on a mouse, since :hover tooltips don't exist
              on touch. Pressing it opens the same migrate modal the amber gate
              opens, so the dead end becomes the next step.
              MIGRATION: collapse back to a single handleUpgrade button after the
              migration period (6 months). */}
          {/* Terms acceptance. Paddle's seller policy requires the buyer to accept
              the terms and refund policy BEFORE purchase, and the overlay has no
              field of its own for it — so the gate has to live here, on the last
              screen we own before Paddle takes over. The server requires it too;
              this checkbox is the disclosure, not the enforcement.
              Rendered only for migrated guilds: a legacy guild's button opens the
              migrate modal rather than a checkout, so there is nothing to accept
              yet. Links open in a new tab so reading them doesn't discard the
              chosen interval or the tick. */}
          {migrated && (
            <div className="mb-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="accept-terms"
                  checked={acceptedTerms}
                  onCheckedChange={checked => setAcceptedTerms(checked === true)}
                  className="mt-0.5"
                />
                <label htmlFor="accept-terms" className="text-slate-300 text-sm cursor-pointer">
                  I have read and agree to the{' '}
                  <Link href="/terms" target="_blank" className="text-blue-400 hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and the{' '}
                  <Link href="/refunds" target="_blank" className="text-blue-400 hover:underline">
                    Refunds &amp; Withdrawal policy
                  </Link>
                  .
                </label>
              </div>
              {/* ZZP čl. 60 st. 9's Croatian notice, linked from the surface the
                  "before the consumer is bound" duty actually attaches to.
                  Deliberately OUTSIDE the label: that sentence is simultaneously
                  the Paddle seller-policy acceptance disclosure and must not be
                  re-worded. */}
              <Link
                href="/refunds#obavijest-na-hrvatskom-jeziku"
                target="_blank"
                hrefLang="hr"
                lang="hr"
                className="mt-2 ml-8 block text-slate-500 text-xs hover:underline"
              >
                hrvatski
              </Link>
            </div>
          )}

          <Button
            className="w-full bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-lg py-6"
            onClick={migrated ? handleUpgrade : () => setMigrateOpen(true)}
            disabled={isPending}
          >
            {!migrated ? (
              <Lock className="w-5 h-5 mr-2" />
            ) : (
              isPending && <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            )}
            {ctaLabel}
          </Button>

          {migrated ? (
            <p className="text-slate-500 text-sm text-center mt-4">
              Secure payment via Paddle &bull; Cancel anytime
            </p>
          ) : (
            <p className="text-amber-400/80 text-sm text-center mt-4">
              Takes a few seconds, then you can upgrade.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
