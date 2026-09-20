'use client';

import { CircleX, Loader2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { ChannelFixDialog } from '@/components/dashboard/channel-fix';
import { useGuild } from '@/components/dashboard/guild-context';
import { LegacyMigrateModal } from '@/components/dashboard/legacy-migrate-modal';
import { NoticeAction, NoticeStrip } from '@/components/dashboard/notice-strip';
import { PremiumWelcomeModal } from '@/components/dashboard/premium-welcome-modal';
import { useGuildAttention } from '@/components/dashboard/use-guild-attention';
import {
  useIsPublicInstance,
  useLegacySunsetLabel,
  useSiteConfig,
} from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import type { GuildChannel } from '@/lib/api/types';
import { links } from '@/lib/constants';
import { type ActivationPhase, useActivationPoll } from '@/lib/use-activation-poll';
import { channelLabel } from '@/lib/utils';

/**
 * Everything the Overview says outside the channel list. One line each, with
 * two exceptions: legacy mode, which carries a deadline and so gets a heading,
 * a date and a button inside the same strip geometry, and the misconfigured
 * banner, which is the one filled strip — a broken channel is the only state
 * that must be readable before the card below it is.
 *
 * Priority runs top to bottom — checkout, misconfigured, legacy, paused — with
 * one reordering rule: while a channel is broken the paused strip moves BELOW
 * the status card (`position="below"`), so a yellow line can never push a red
 * one down the page. Legacy guilds never surface the broken banner, so paused is
 * the only notice the rule can move.
 *
 * Activation outranks even a broken channel: it is the only strip that resolves
 * on its own within a minute, and burying it under a permissions failure reads
 * as the checkout having silently done nothing.
 *
 * A COMPLETED checkout is the one exception to the one-line rule: it leaves the
 * stack entirely for `PremiumWelcomeModal`. The strip stays for the two states
 * that are still waiting on the webhook, which are status, not reward.
 *
 * Off this tab the sidebar's Overview badge is the only persistent signal, kept
 * in step via the shared `useGuildAttention`.
 */
export function GuildNotices({ position }: { position: 'above' | 'below' }) {
  const { guild, data } = useGuild();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showMigration, showPaused, pausedCount, showMisconfigured, dismissPaused } =
    useGuildAttention();

  // Query-param-armed, but the variant is driven by real subscription state:
  // `hasSubscription` is live from Postgres once the webhook lands. A self-hosted
  // instance has no checkout, so a stray ?success=true must not arm the poller.
  const isPublicInstance = useIsPublicInstance();
  const isCheckoutReturn = isPublicInstance && searchParams.get('success') === 'true';
  const active = guild.hasSubscription;
  const phase = useActivationPoll(isCheckoutReturn && !active, active);
  // Covers the gap before the param-stripping replace lands, and survives the
  // `router.refresh()` the activation poller may still have in flight.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('success');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // The status card outranks strips only when it is in error; that is the sole
  // condition that moves the paused strip below it.
  const pausedBelow = showMisconfigured;
  const showPausedHere = showPaused && (position === 'below') === pausedBelow;
  const showCheckout = isCheckoutReturn && !active && position === 'above';
  const showWelcome = isCheckoutReturn && active && !welcomeDismissed && position === 'above';
  const showLegacy = showMigration && position === 'above';
  const showBroken = showMisconfigured && position === 'above';

  const strips = showCheckout || showLegacy || showPausedHere || showBroken;
  if (!strips && !showWelcome) return null;

  return (
    <>
      {showWelcome && (
        <PremiumWelcomeModal
          guildName={guild.name}
          trialing={data.subscription?.status === 'trialing'}
          onClose={dismissWelcome}
        />
      )}
      {strips && (
        <div className="space-y-3">
          {showCheckout && <CheckoutStrip variant={phase} />}
          {showBroken && <MisconfiguredStrip guildId={guild.id} channels={data.channels} />}
          {showLegacy && (
            <LegacyCard
              guildId={guild.id}
              channels={data.channels}
              channelLimit={data.channelLimit}
            />
          )}
          {showPausedHere && (
            <PausedStrip guildId={guild.id} pausedCount={pausedCount} onDismiss={dismissPaused} />
          )}
        </div>
      )}
    </>
  );
}

/**
 * The one filled strip. A channel the bot cannot publish in is the only failure
 * the admin has to act on in Discord rather than here, so it names the channel
 * and opens the permission steps directly. With one channel broken "Fix now"
 * triggers that channel's dialog; past one the channels tab is the only place
 * that can show them all, so it links there instead.
 */
function MisconfiguredStrip({ guildId, channels }: { guildId: string; channels: GuildChannel[] }) {
  const broken = channels.filter(c => c.enabled && c.canPublish === false);
  const only = broken.length === 1 ? broken[0] : undefined;

  return (
    <NoticeStrip
      tone="red"
      filled
      icon={CircleX}
      actions={
        only ? (
          <ChannelFixDialog
            guildId={guildId}
            channel={only}
            trigger={
              <button
                type="button"
                className="cursor-pointer whitespace-nowrap font-medium text-red-300 text-xs transition-colors hover:text-red-200"
              >
                Fix now &rarr;
              </button>
            }
          />
        ) : (
          <NoticeAction href={`/dashboard/${guildId}/channels`}>Fix now &rarr;</NoticeAction>
        )
      }
    >
      {only ? (
        <>
          <span className="font-medium text-white">{channelLabel(only.name)}</span> is missing
          Discord permissions and isn&apos;t publishing.
        </>
      ) : (
        <>
          <span className="font-medium text-white">{broken.length} channels</span> are missing
          Discord permissions and aren&apos;t publishing.
        </>
      )}
    </NoticeStrip>
  );
}

/**
 * Post-checkout activation WHILE the webhook is still outstanding — the success
 * state left for `PremiumWelcomeModal`. Never counted by the attention badge; it
 * is self-resolving. Neither variant may claim a payment was taken: a trial
 * checkout completes at $0.00.
 */
function CheckoutStrip({ variant }: { variant: ActivationPhase }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (variant === 'activating') {
    return (
      <NoticeStrip tone="blue" icon={Loader2} spin>
        Activating Premium&hellip;
      </NoticeStrip>
    );
  }
  return (
    <NoticeStrip
      tone="amber"
      actions={
        <>
          <NoticeAction onClick={() => startTransition(() => router.refresh())}>
            {isPending ? 'Refreshing…' : 'Refresh'}
          </NoticeAction>
          <NoticeAction href={`mailto:${links.supportEmail}`} muted>
            Contact support
          </NoticeAction>
        </>
      }
    >
      This is taking longer than usual. Your payment went through.
    </NoticeStrip>
  );
}

// MIGRATION: delete this card, the legacy status line and the migrate modal
// together at sunset; no other screen changes.
//
// The one message on the dashboard with a deadline attached, so it is the one
// message that gets more than a line. It keeps the strip's exact geometry —
// same padding, same amber left edge, same icon size — and spends its extra
// weight on three things only: a heading, the date, and a filled button. A card
// with its own amber fill read as a different design system on a page where
// everything else is a slate surface with a coloured edge.
function LegacyCard({
  guildId,
  channels,
  channelLimit,
}: {
  guildId: string;
  channels: GuildChannel[];
  channelLimit: number;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const sunsetLabel = useLegacySunsetLabel();

  return (
    <>
      <section className="flex items-start gap-3.5 rounded-lg border border-slate-800 border-l-2 border-l-amber-400 bg-slate-900 px-3.5 py-3.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <div className="min-w-42 flex-1">
          <h2 className="font-semibold text-sm text-white">This server runs in legacy mode</h2>
          <p className="mt-1 text-sm leading-snug text-slate-300">
            You must migrate to keep publishing without interruption, by{' '}
            <span className="mt-1.5 font-medium text-amber-300">{sunsetLabel}.</span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button
              size="sm"
              onClick={() => setModalOpen(true)}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            >
              Migrate now
            </Button>
            <Link
              href="/migration"
              target="_blank"
              className="text-slate-400 text-xs transition-colors hover:text-slate-200"
            >
              Learn what is changing
            </Link>
          </div>
        </div>
      </section>
      {modalOpen && (
        <LegacyMigrateModal
          guildId={guildId}
          channels={channels}
          limit={channelLimit === 0 ? null : channelLimit}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

/** The only dismissible strip, remembered per browser (ADR 0009). */
function PausedStrip({
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
    <NoticeStrip
      tone="yellow"
      onDismiss={onDismiss}
      actions={
        <>
          <NoticeAction href={`/dashboard/${guildId}/subscription`}>See Premium</NoticeAction>
          <NoticeAction href={`/dashboard/${guildId}/channels`} muted>
            Manage channels
          </NoticeAction>
        </>
      }
    >
      {pausedCount} more channel{pausedCount !== 1 ? 's are' : ' is'} set up but paused — the Free
      plan publishes {freeChannelLimit}.
    </NoticeStrip>
  );
}
