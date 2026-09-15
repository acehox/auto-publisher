'use client';

import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import { ChannelFixButton } from '@/components/dashboard/channel-fix';
import { ChannelRow, ChannelStatusLabel } from '@/components/dashboard/channel-row';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useGuild } from '@/components/dashboard/guild-context';
import { StatusCard } from '@/components/dashboard/status-card';
import { useGuildAttention } from '@/components/dashboard/use-guild-attention';
import { Button } from '@/components/ui/button';
import type { GuildChannel } from '@/lib/api/types';

/**
 * The Overview's answer to "is it working". Read-only by contract: Overview
 * never carries a control that changes state, Channels never carries a summary
 * — so there is no toggle here and no ambient publishing note either (the
 * 10/hour limit and the queue-delay note live once on Channels, and once inside
 * the enable guide where they are decision-relevant).
 *
 * The card is the alert, so a broken channel needs no banner above it: severity
 * is on the card's top edge, icon and headline, and the Fix control sits on the
 * row that names the problem. Permission-derived from the publish-state cache
 * (ADR 0008) — no activity feed or rate-limit counter is plumbed to the web.
 */
export function ChannelStatus() {
  const { guild, data } = useGuild();
  return data.migrated ? (
    <MigratedStatus guildId={guild.id} channels={data.channels} />
  ) : (
    <LegacyStatus channels={data.channels} />
  );
}

/** Broken (red) first, then healthy — sidebar order survives inside each group. */
function statusRank(channel: GuildChannel): number {
  return channel.canPublish === false ? 0 : 1;
}

/** One publishing row, identical on the migrated and legacy branches. */
function PublishRow({ channel, pill }: { channel: GuildChannel; pill?: React.ReactNode }) {
  const broken = channel.canPublish === false;
  return (
    <ChannelRow
      name={channel.name}
      tone={broken ? 'red' : 'green'}
      sub={broken ? 'Missing permissions' : undefined}
      pill={pill}
      status={<ChannelStatusLabel kind={broken ? 'blocked' : 'publishing'} />}
      actions={<ChannelFixButton channel={channel} />}
    />
  );
}

function MigratedStatus({ guildId, channels }: { guildId: string; channels: GuildChannel[] }) {
  const { needsFixingCount } = useGuildAttention();
  const enabled = channels.filter(c => c.enabled).sort((a, b) => statusRank(a) - statusRank(b));
  const paused = channels.filter(c => c.hasSavedSetup);

  if (enabled.length === 0 && paused.length === 0) {
    return channels.length > 0 ? (
      <EmptyState
        icon={Megaphone}
        title="Ready to get started"
        action={
          <Button asChild size="sm">
            <Link href={`/dashboard/${guildId}/channels`}>Choose channels</Link>
          </Button>
        }
      >
        Pick the announcement channels that should publish automatically. You can change this any
        time.
      </EmptyState>
    ) : (
      <NoAnnouncementChannels />
    );
  }

  return (
    <StatusCard
      tone={needsFixingCount > 0 ? 'red' : 'green'}
      headline={
        needsFixingCount > 0
          ? needsFixingCount === 1
            ? "1 channel isn't publishing"
            : `${needsFixingCount} channels aren't publishing`
          : `Publishing in ${enabled.length} channel${enabled.length !== 1 ? 's' : ''}`
      }
    >
      {enabled.map(channel => (
        <PublishRow
          key={channel.channelId}
          channel={channel}
          pill={channel.filters.length > 0 ? <FilterPill count={channel.filters.length} /> : null}
        />
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

/** Read-only echo of the Channels tab's pill; acting on filters happens there. */
function FilterPill({ count }: { count: number }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
      {count} filter{count !== 1 ? 's' : ''}
    </span>
  );
}

function NoAnnouncementChannels() {
  return (
    <EmptyState icon={Megaphone} title="No announcement channels in this server">
      In Discord, open a channel&apos;s settings and turn on &ldquo;Announcement channel&rdquo;,
      then come back here.
    </EmptyState>
  );
}

/**
 * MIGRATION: a legacy guild has no allowlist, so every announcement channel is
 * a publishing channel — itemized the same way, minus the paused group it cannot
 * have. The legacy card above does the steering. Removed at sunset.
 */
function LegacyStatus({ channels }: { channels: GuildChannel[] }) {
  const total = channels.length;
  if (total === 0) return <NoAnnouncementChannels />;

  const broken = channels.filter(c => c.canPublish === false).length;

  return (
    <StatusCard
      tone={broken > 0 ? 'red' : 'green'}
      headline={
        broken > 0
          ? broken === 1
            ? "1 channel isn't publishing"
            : `${broken} channels aren't publishing`
          : `Publishing in ${total} announcement channel${total !== 1 ? 's' : ''}`
      }
    >
      {[...channels]
        .sort((a, b) => statusRank(a) - statusRank(b))
        .map(channel => (
          <PublishRow key={channel.channelId} channel={channel} />
        ))}
    </StatusCard>
  );
}
