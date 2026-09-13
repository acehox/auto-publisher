'use client';

import {
  Check,
  CheckCircle2,
  type LucideIcon,
  Megaphone,
  PauseCircle,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChannelFixButton, channelStatusStyle } from '@/components/dashboard/channel-fix';
import { useGuild } from '@/components/dashboard/guild-context';
import { PublishDelayNote } from '@/components/dashboard/publish-delay-note';
import { PublishLimitNote } from '@/components/dashboard/publish-limit-note';
import { useGuildAttention } from '@/components/dashboard/use-guild-attention';
import { useLegacySunsetLabel } from '@/components/site-config-context';
import { Card } from '@/components/ui/card';
import type { GuildChannel } from '@/lib/api/types';

/**
 * Read-only channel status on the Overview tab. Permission-derived from the
 * publish-state cache (ADR 0008) — no publish-activity feed or rate-limit
 * counters are plumbed to the web. Acting on channels stays on the Channels tab;
 * flagged rows link there. Migrated guilds get an itemized list; legacy guilds
 * get a minimal summary (the prominent migrate banner above steers them to
 * migrate before per-channel detail). See CONTEXT "Guild Overview tab".
 */
export function ChannelStatus() {
  const { guild, data } = useGuild();
  return data.migrated ? (
    <MigratedStatus
      guildId={guild.id}
      channels={data.channels}
      hasSubscription={guild.hasSubscription}
    />
  ) : (
    <LegacyStatus channels={data.channels} hasSubscription={guild.hasSubscription} />
  );
}

interface HeaderState {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: ReactNode;
}

/**
 * The channel-status header, driven by channel publishing health ONLY —
 * deliberately decoupled from the attention badge so an unrelated banner (paused,
 * premium-pending) never demotes it. Precedence: Welcome → Issues → Complete
 * Premium setup → All good. Paused channels never drive it (their sole purpose is
 * preserving setup for a later re-upgrade — surfaced as muted rows + the
 * dismissible banner, never a header nag). See CONTEXT "Guild Overview tab".
 */
function StatusHeader({ icon: Icon, iconColor, title, subtitle }: HeaderState) {
  return (
    <div className="flex items-start gap-3">
      <Icon className={`w-7 h-7 ${iconColor} shrink-0`} />
      <div>
        <h2 className="text-2xl text-white">{title}</h2>
        <p className="text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

// Overview sort key: broken (red) first, then healthy (green).
function statusRank(channel: GuildChannel): number {
  return channel.canPublish === false ? 0 : 1;
}

function MigratedStatus({
  guildId,
  channels,
  hasSubscription,
}: {
  guildId: string;
  channels: GuildChannel[];
  hasSubscription: boolean;
}) {
  const { needsFixingCount } = useGuildAttention();

  const enabled = channels.filter(c => c.enabled).sort((a, b) => statusRank(a) - statusRank(b));
  const paused = channels.filter(c => c.hasSavedSetup);

  const header: HeaderState =
    enabled.length === 0
      ? {
          icon: Sparkles,
          iconColor: 'text-blue-400',
          title: 'Ready to get started?',
          subtitle:
            channels.length > 0 ? (
              <>
                Enable an announcement channel in the{' '}
                <Link
                  href={`/dashboard/${guildId}/channels`}
                  className="text-blue-400 hover:underline"
                >
                  Channels tab
                </Link>{' '}
                to start auto-publishing.
              </>
            ) : (
              'This server has no announcement channels yet. Create one in Discord, then enable it here.'
            ),
        }
      : needsFixingCount > 0
        ? {
            icon: TriangleAlert,
            iconColor: 'text-red-400',
            title:
              needsFixingCount === 1
                ? "1 channel isn't publishing"
                : `${needsFixingCount} channels aren't publishing`,
            subtitle: 'Grant the missing permissions — see the list below.',
          }
        : {
            icon: CheckCircle2,
            iconColor: 'text-green-500',
            title: 'All good',
            subtitle: `Publishing in ${enabled.length} channel${enabled.length !== 1 ? 's' : ''}`,
          };

  return (
    <div className="space-y-6">
      <StatusHeader {...header} />

      <div className="space-y-1.5">
        <PublishLimitNote />
        <PublishDelayNote hasSubscription={hasSubscription} />
      </div>

      {enabled.length === 0 && paused.length === 0 ? null : (
        <div className="space-y-3">
          {/* Status order — the Overview is an attention surface, so it regroups
              by health (broken → healthy) rather than mirroring the
              Channels tab's sidebar order. Sidebar order is preserved within each
              status group (stable sort over the pre-sorted array). The row color
              signals status; canPublish === false is the only "broken" state
              (undefined = unknown, treated as publishing). Retained/paused config
              trails, matching the Channels tab's Disabled column. */}
          {enabled.map(channel =>
            channel.canPublish === false ? (
              <BlockedRow key={channel.channelId} channel={channel} />
            ) : (
              <PublishingRow key={channel.channelId} channel={channel} />
            )
          )}
          {paused.map(channel => (
            <PausedRow key={channel.channelId} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}

// Publishing row — green when healthy, red when the bot can't publish here. Card
// color is shared with the Channels tab so a channel reads the same on both.
function PublishingRow({ channel }: { channel: GuildChannel }) {
  const style = channelStatusStyle(channel);
  return (
    <Card className={`${style.card} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Megaphone className={`w-5 h-5 ${style.icon} shrink-0`} />
          <span className="text-white text-md truncate">{channel.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-green-500/80 text-sm">
            <Check className="w-4 h-4" />
            Publishing
          </span>
          <ChannelFixButton channel={channel} />
        </div>
      </div>
    </Card>
  );
}

function BlockedRow({ channel }: { channel: GuildChannel }) {
  const style = channelStatusStyle(channel);
  return (
    <Card className={`${style.card} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Megaphone className={`w-5 h-5 ${style.icon} shrink-0`} />
          <span className="text-white text-md truncate">{channel.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-red-400 text-sm">
            <X className="w-4 h-4" />
            Not publishing
          </span>
          <ChannelFixButton channel={channel} />
        </div>
      </div>
    </Card>
  );
}

function PausedRow({ channel }: { channel: GuildChannel }) {
  return (
    <Card className="bg-slate-900/30 border-slate-800/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PauseCircle className="w-5 h-5 text-slate-600 shrink-0" />
          <span className="text-slate-400 text-md truncate">{channel.name}</span>
        </div>
        <span className="text-slate-500 text-sm shrink-0">Paused</span>
      </div>
    </Card>
  );
}

/**
 * MIGRATION: Legacy guilds auto-publish every announcement channel — there is no
 * allowlist to itemize. Show a minimal summary; the migrate banner above does the
 * steering. Remove with the rest of the migration UX at sunset.
 */
function LegacyStatus({
  channels,
  hasSubscription,
}: {
  channels: GuildChannel[];
  hasSubscription: boolean;
}) {
  const publishing = channels.filter(c => c.canPublish !== false).length;
  const total = channels.length;
  const sunsetLabel = useLegacySunsetLabel();

  return (
    <div className="space-y-6">
      <StatusHeader
        icon={TriangleAlert}
        iconColor="text-amber-400"
        title="Legacy mode"
        subtitle={
          <>
            Every announcement channel is published automatically. Legacy mode ends on{' '}
            <span className="text-white font-semibold">{sunsetLabel}</span>.
          </>
        }
      />

      <div className="space-y-1.5">
        <PublishLimitNote />
        <PublishDelayNote hasSubscription={hasSubscription} />
      </div>

      <Card className="bg-slate-900/50 border-slate-800 p-6">
        {total > 0 ? (
          <p className="text-slate-300">
            Publishing in <span className="text-white">{publishing}</span> of {total} announcement
            channel{total !== 1 ? 's' : ''}.
          </p>
        ) : (
          <p className="text-slate-400">This server doesn&apos;t have any announcement channels.</p>
        )}
      </Card>
    </div>
  );
}
