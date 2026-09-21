'use client';

import { Copy } from '@ap/copy';
import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChannelFixButton } from '@/components/dashboard/channel-fix';
import { ChannelRow, ChannelStatusLabel } from '@/components/dashboard/channel-row';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useGuild } from '@/components/dashboard/guild-context';
import { PublishDelayFooter } from '@/components/dashboard/publish-delay-note';
import { StatusCard, StatusCardAction } from '@/components/dashboard/status-card';
import { useGuildAttention } from '@/components/dashboard/use-guild-attention';
import { Button } from '@/components/ui/button';
import type { GuildChannel } from '@/lib/api/types';

/**
 * The Overview's answer to "is it working". Read-only by contract: Overview
 * never carries a control that changes state — the header's Manage link and the
 * Fix dialog navigate, they don't write — and Channels never carries a summary.
 * The card's footer states the queue-delay fact in its short form, because it is
 * what "publishing" on this card actually promises; the long form and the
 * 10/hour limit sit below in `HowPublishingWorks`, shared with Channels.
 *
 * The card is the alert, so a broken channel needs no banner above it: severity
 * is on the card's top edge, icon and headline, and the Fix control sits on the
 * row that names the problem. Permission-derived from the publish-state cache
 * (ADR 0008) — no activity feed or rate-limit counter is plumbed to the web.
 */
export function ChannelStatus() {
  const { guild, data } = useGuild();
  const footer = <PublishDelayFooter hasSubscription={guild.hasSubscription} />;
  return data.migrated ? (
    <MigratedStatus guildId={guild.id} channels={data.channels} footer={footer} />
  ) : (
    <LegacyStatus guildId={guild.id} channels={data.channels} footer={footer} />
  );
}

/** Broken (red) first, then healthy — sidebar order survives inside each group. */
function statusRank(channel: GuildChannel): number {
  return channel.canPublish === false ? 0 : 1;
}

/**
 * One publishing row, identical on the migrated and legacy branches. A broken
 * row carries the Fix control and no label: the control names the state and acts
 * on it, and the card's own headline already counts the broken channels.
 */
function PublishRow({ guildId, channel }: { guildId: string; channel: GuildChannel }) {
  const broken = channel.canPublish === false;
  return (
    <ChannelRow
      name={channel.name}
      tone={broken ? 'red' : 'green'}
      status={broken ? undefined : <ChannelStatusLabel kind="publishing" />}
      // No onRemove — Overview is read-only by contract.
      actions={<ChannelFixButton guildId={guildId} channel={channel} />}
    />
  );
}

function MigratedStatus({
  guildId,
  channels,
  footer,
}: {
  guildId: string;
  channels: GuildChannel[];
  footer: ReactNode;
}) {
  const { needsFixingCount } = useGuildAttention();
  const enabled = channels.filter(c => c.enabled).sort((a, b) => statusRank(a) - statusRank(b));
  const paused = channels.filter(c => c.hasSavedSetup);

  if (enabled.length === 0 && paused.length === 0) {
    return channels.length > 0 ? (
      <EmptyState
        icon={Megaphone}
        title={Copy.channels.empty.getStarted}
        action={
          <Button asChild size="sm">
            <Link href={`/dashboard/${guildId}/channels`}>Choose channels</Link>
          </Button>
        }
      >
        {Copy.channels.empty.getStartedBody}
      </EmptyState>
    ) : (
      <NoAnnouncementChannels />
    );
  }

  return (
    <StatusCard
      tone={needsFixingCount > 0 ? 'red' : 'green'}
      title="Channels"
      headline={
        needsFixingCount > 0
          ? Copy.channels.health.notPublishing(needsFixingCount)
          : Copy.channels.health.allGood(enabled.length)
      }
      action={<StatusCardAction href={`/dashboard/${guildId}/channels`}>Manage</StatusCardAction>}
      footer={footer}
    >
      {enabled.map(channel => (
        <PublishRow key={channel.channelId} guildId={guildId} channel={channel} />
      ))}
      {paused.map(channel => (
        <ChannelRow
          key={channel.channelId}
          name={channel.name}
          tone="yellow"
          status={<ChannelStatusLabel kind="paused" />}
          muted
        />
      ))}
    </StatusCard>
  );
}

function NoAnnouncementChannels() {
  return (
    <EmptyState icon={Megaphone} title={Copy.channels.empty.noAnnouncement}>
      {Copy.channels.empty.noAnnouncementBody}
    </EmptyState>
  );
}

/**
 * MIGRATION: a legacy guild has no allowlist, so every announcement channel is
 * a publishing channel — itemized the same way, minus the paused group it cannot
 * have. The legacy card above does the steering. Removed at sunset.
 */
function LegacyStatus({
  guildId,
  channels,
  footer,
}: {
  guildId: string;
  channels: GuildChannel[];
  footer: ReactNode;
}) {
  const total = channels.length;
  if (total === 0) return <NoAnnouncementChannels />;

  const broken = channels.filter(c => c.canPublish === false).length;

  return (
    <StatusCard
      tone={broken > 0 ? 'red' : 'green'}
      title="Channels"
      headline={
        broken > 0
          ? Copy.channels.health.notPublishing(broken)
          : Copy.channels.health.allGood(total, 'announcement channel')
      }
      action={<StatusCardAction href={`/dashboard/${guildId}/channels`}>Manage</StatusCardAction>}
      footer={footer}
    >
      {[...channels]
        .sort((a, b) => statusRank(a) - statusRank(b))
        .map(channel => (
          <PublishRow key={channel.channelId} guildId={guildId} channel={channel} />
        ))}
    </StatusCard>
  );
}
