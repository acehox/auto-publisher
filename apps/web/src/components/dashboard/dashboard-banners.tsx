'use client';

import {
  Check,
  Clock,
  Loader2,
  Megaphone,
  PauseCircle,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useGuild } from '@/components/dashboard/guild-context';
import { LegacyMigrateModal } from '@/components/dashboard/legacy-migrate-modal';
import { useGuildAttention } from '@/components/dashboard/use-guild-attention';
import {
  useIsPublicInstance,
  useLegacySunsetLabel,
  useSiteConfig,
} from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { GuildChannel } from '@/lib/api/types';
import { links } from '@/lib/constants';
import { useActivationPoll } from '@/lib/use-activation-poll';

/**
 * Guild-level banner stack, rendered inside the Overview tab (CONTEXT "Overview
 * banner stack"). Order: checkout activation → misconfigured channels → legacy
 * migration → paused channels. Misconfigured (red) is the only current outage, so
 * it leads the warnings. The first three are not dismissible — they nag until the
 * state resolves; the paused-channels banner is the lone dismissible exception
 * (ADR 0009). The checkout-activation banner sits at the very top and is
 * query-param-scoped (`?success=true`, set only by the post-checkout redirect to
 * this tab); it is self-resolving — it polls for the webhook-written subscription
 * and confirms once active (see `CheckoutActivationBanner`), so it never
 * dead-ends on "activating…".
 *
 * Upgrading no longer moves a guild between bots, so there is no invite-the-
 * premium-bot or waiting-to-take-over state to nag about: the subscription
 * webhook lands and the guild's channels are un-paused in place.
 *
 * Off this tab, the sidebar's Overview attention badge is the only persistent
 * signal, kept in sync via the shared `useGuildAttention` hook.
 */
export function DashboardBanners() {
  const { guild, data } = useGuild();
  const searchParams = useSearchParams();
  const _router = useRouter();
  const _pathname = usePathname();
  const {
    showMisconfigured,
    needsFixingCount,
    showMigration,
    showPaused,
    pausedCount,
    dismissPaused,
  } = useGuildAttention();

  // Checkout-activation card: query-param-armed, but its variant is driven by
  // real subscription state, not the param. `active` = the webhook has written
  // an entitled subscription row (guild.hasSubscription, live from Postgres).
  // A self-hosted instance has no checkout, so a stray `?success=true` must not
  // arm the card (nor its 3s poller) — the paused banner is already gated
  // inside useGuildAttention.
  const isPublicInstance = useIsPublicInstance();
  const isCheckoutReturn = isPublicInstance && searchParams.get('success') === 'true';
  const active = guild.hasSubscription;
  const phase = useActivationPoll(isCheckoutReturn && !active, active);

  const showActivating = isCheckoutReturn && !active; // Card 1 (activating) / Card 3 (gaveUp)
  const showActivatedConfirm = isCheckoutReturn && active; // Card 2
  const showCheckoutCard = showActivating || showActivatedConfirm;

  if (!showCheckoutCard && !showMisconfigured && !showMigration && !showPaused) {
    return null;
  }

  return (
    <div className="space-y-6">
      {showCheckoutCard && (
        <CheckoutActivationBanner variant={showActivatedConfirm ? 'confirmed' : phase} />
      )}
      {showMisconfigured && <MisconfiguredChannelsBanner count={needsFixingCount} />}
      {showMigration && (
        <LegacyMigrationBanner
          guildId={guild.id}
          channels={data.channels}
          channelLimit={data.channelLimit}
          hasSubscription={guild.hasSubscription}
        />
      )}
      {showPaused && (
        <PausedChannelsBanner
          guildId={guild.id}
          pausedCount={pausedCount}
          onDismiss={dismissPaused}
        />
      )}
    </div>
  );
}

/**
 * Post-checkout activation card, top of the stack while `?success=true` is on
 * the URL. Three variants (see `DashboardBanners`):
 *   - `activating`: the poller (`useActivationPoll`) is soft-refreshing every 3s
 *     waiting for the webhook to write the subscription row. No CTA — there is
 *     nothing for the admin to do; the guild's channels un-pause on their own.
 *   - `gaveUp`: the 60s ceiling passed with no activation → calm manual-refresh
 *     fallback (amber, not red — checkout succeeded, nothing is broken).
 *   - `confirmed`: activated → a one-time positive confirmation so the flow
 *     never ends on a silent empty state.
 *
 * None of the three may claim a payment was taken: a trial checkout completes at
 * $0.00, so "payment received" is false for every trial signup.
 */
function CheckoutActivationBanner({ variant }: { variant: 'activating' | 'gaveUp' | 'confirmed' }) {
  if (variant === 'gaveUp') {
    return <CheckoutActivationFallback />;
  }

  if (variant === 'confirmed') {
    return (
      <Card className="bg-green-500/10 border-green-500/30 p-6">
        <div className="flex items-start gap-4">
          <Check className="w-6 h-6 text-green-400 shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-white text-lg mb-1">Premium is now active</h3>
            <p className="text-slate-300 text-sm">
              Your subscription is active and everything&apos;s already set up for this server.
              Thanks for upgrading!
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-blue-500/10 border-blue-500/30 p-6">
      <div className="flex items-start gap-4">
        <Loader2 className="w-6 h-6 text-blue-400 shrink-0 mt-1 animate-spin" />
        <div className="flex-1">
          <h3 className="text-white text-lg mb-1">Checkout complete! Activating Premium</h3>
          <p className="text-slate-300 text-sm">
            We&apos;re setting up your Premium subscription. This usually takes a few seconds — the
            page will update automatically.
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Shown once activation exceeds the 60s poll ceiling. Amber (not red): checkout
 * succeeded, so this is a "hang tight" state, not an outage. The Refresh button is
 * a single soft `router.refresh()` — the poller has stopped.
 */
function CheckoutActivationFallback() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="bg-amber-500/10 border-amber-500/30 p-6">
      <div className="flex items-start gap-4">
        <Clock className="w-6 h-6 text-amber-400 shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-white text-lg mb-1">Still activating your Premium</h3>
          <p className="text-slate-300 text-sm mb-4">
            Your checkout went through, but activation is taking longer than usual — it can
            occasionally take a few minutes. Try refreshing below, and if Premium still doesn&apos;t
            appear, reach out and we&apos;ll sort it out right away.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              className="bg-amber-500 hover:bg-amber-400 text-slate-950"
              onClick={() => startTransition(() => router.refresh())}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
            <p className="text-slate-400 text-sm">
              Email{' '}
              <a href={`mailto:${links.supportEmail}`} className="text-blue-400 hover:underline">
                {links.supportEmail}
              </a>{' '}
              &middot;{' '}
              <a
                href={links.discordSupportServer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Join our support server
              </a>
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Nag for a migrated guild with ≥1 enabled channel the managing bot can't publish
 * in (`canPublish === false`). Red — the only current outage in the stack, so it
 * leads the warnings. Any number of broken channels collapse into this one banner;
 * the per-channel detail + Fix affordance lives in the channel list below on the
 * same tab. Not dismissible — it clears when permissions are restored.
 */
function MisconfiguredChannelsBanner({ count }: { count: number }) {
  return (
    <Card className="bg-red-500/10 border-red-500/30 p-6">
      <div className="flex items-start gap-4">
        <TriangleAlert className="w-6 h-6 text-red-400 shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-white text-lg mb-1">
            {count === 1 ? "A channel isn't publishing" : "Some channels aren't publishing"}
          </h3>
          <p className="text-slate-300 text-sm">
            {count === 1 ? 'One of your enabled channels is' : 'One or more enabled channels are'}{' '}
            missing the permissions the bot needs. See the channel list below to fix{' '}
            {count === 1 ? 'it' : 'them'}.
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Dismissible nag for a free guild sitting over the 3-channel limit with paused
 * (retained) channels. Yellow (warning family). ADR 0009.
 */
function PausedChannelsBanner({
  guildId,
  pausedCount,
  onDismiss,
}: {
  guildId: string;
  pausedCount: number;
  onDismiss: () => void;
}) {
  const { freeChannelLimit } = useSiteConfig();

  return (
    <Card className="bg-yellow-500/10 border-yellow-500/30 p-6 relative">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-4">
        <PauseCircle className="w-6 h-6 text-yellow-400 shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-white text-lg mb-1">
            {pausedCount} channel{pausedCount !== 1 ? 's are' : ' is'} paused
          </h3>
          <p className="text-slate-300 text-sm mb-4">
            This server is over the free limit of {freeChannelLimit} channels. Their setup is saved
            and returns if you upgrade to Premium.
          </p>
          <div className="flex items-center gap-4">
            {/* Names the destination, not the outcome: the Subscription page
                still asks for a deliberate upgrade press. */}
            <Button className="bg-yellow-500 hover:bg-yellow-400 text-slate-950" asChild>
              <Link href={`/dashboard/${guildId}/subscription`}>See Premium plans</Link>
            </Button>
            <Link
              href={`/dashboard/${guildId}/channels`}
              className="text-blue-400 hover:underline text-sm"
            >
              Manage channels
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

// MIGRATION: Remove this banner after migration period (6 months)
function LegacyMigrationBanner({
  guildId,
  channels,
  channelLimit,
  hasSubscription,
}: {
  guildId: string;
  channels: GuildChannel[];
  channelLimit: number;
  hasSubscription: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const sunsetLabel = useLegacySunsetLabel();

  return (
    <>
      <Card className="bg-amber-500/10 border-amber-500/30 p-6">
        <div className="flex items-start gap-4">
          <Megaphone className="w-6 h-6 text-amber-400 shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="text-white text-lg mb-1">This server runs in legacy mode</h3>
            <p className="text-slate-300 text-sm mb-2">
              Every announcement channel is published automatically. Legacy mode will be
              discontinued, and the bot may stop publishing in this server once it is retired.
              Migrate now to keep publishing without interruption, choose exactly which channels
              publish, and unlock new features.
            </p>
            <p className="text-amber-300 text-base font-semibold mb-4">
              Legacy mode ends on {sunsetLabel}.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                onClick={() => setModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950"
              >
                Migrate now
              </Button>
              <Link
                href="/migration"
                target="_blank"
                className="text-sm text-amber-300 hover:text-amber-200 transition-colors"
              >
                Learn what is changing
              </Link>
            </div>
          </div>
        </div>
      </Card>
      {modalOpen && (
        <LegacyMigrateModal
          guildId={guildId}
          channels={channels}
          limit={channelLimit === 0 ? null : channelLimit}
          hasSubscription={hasSubscription}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
