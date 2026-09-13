'use client';

import { Loader2, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ChannelEnableGuideModal } from '@/components/dashboard/channel-enable-guide';
import { ChannelFixButton, channelStatusStyle } from '@/components/dashboard/channel-fix';
import { ChannelLimitModal } from '@/components/dashboard/channel-limit-upsell';
import { PublishDelayNote } from '@/components/dashboard/publish-delay-note';
import { PublishLimitNote } from '@/components/dashboard/publish-limit-note';
import { useIsPublicInstance } from '@/components/site-config-context';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { disableChannel, enableChannel } from '@/lib/api/actions';
import { signInOnAuthExpired } from '@/lib/api/client-auth';
import type { ChannelLimitReason, GuildChannel } from '@/lib/api/types';

interface ChannelConfigProps {
  guildId: string;
  channels: GuildChannel[];
  hasSubscription: boolean;
  /** Max enabled channels for the guild's plan; 0 = unlimited (Premium) */
  channelLimit: number;
  /** MIGRATION: false = legacy guild. Removed at sunset. */
  migrated: boolean;
}

/**
 * MIGRATION: Legacy-guild view — read-only channel list with disabled toggles.
 * The legacy-mode banner + migrate modal live in the shell's banner stack
 * (dashboard-banners.tsx). Remove after migration period (6 months).
 */
function LegacyChannelView({
  channels,
  hasSubscription,
}: {
  channels: GuildChannel[];
  hasSubscription: boolean;
}) {
  // Legacy has no allowlist — "enabled" is derived from Discord permissions:
  // channels the bot can publish in publish automatically, the rest can't.
  const enabledChannels = channels.filter(c => c.canPublish);
  const disabledChannels = channels.filter(c => !c.canPublish);

  const renderCard = (channel: GuildChannel, publishing: boolean) => (
    <Card
      key={channel.channelId}
      className={
        publishing
          ? 'bg-green-500/2 border-green-500/40 p-4'
          : 'bg-slate-900/30 border-slate-800/50 p-4'
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className={`w-5 h-5 ${publishing ? 'text-green-500' : 'text-slate-600'}`} />
          <span className={`text-md ${publishing ? 'text-white' : 'text-slate-400'}`}>
            {channel.name}
          </span>
          {publishing && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              Auto (legacy)
            </Badge>
          )}
        </div>
        <Switch checked={publishing} disabled />
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl text-white mb-2">Channel Configuration</h2>
        <p className="text-slate-400 mb-3">Manage Auto Publisher for your announcement channels</p>
        <div className="space-y-1.5">
          <PublishLimitNote />
          <PublishDelayNote hasSubscription={hasSubscription} />
        </div>
      </div>

      {channels.length > 0 && (
        <div className="grid md:grid-cols-2 md:divide-x divide-slate-800 gap-6 md:gap-0">
          <div className="space-y-3 md:pr-6 order-2 md:order-1">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Disabled<span className="ml-3 text-slate-600">{disabledChannels.length}</span>
            </h3>
            {disabledChannels.length > 0 ? (
              <div className="space-y-3">{disabledChannels.map(c => renderCard(c, false))}</div>
            ) : (
              <p className="text-slate-600 text-sm py-4">No disabled channels</p>
            )}
          </div>
          <div className="space-y-3 md:pl-6 order-1 md:order-2">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Enabled<span className="ml-3 text-slate-600">{enabledChannels.length}</span>
            </h3>
            {enabledChannels.length > 0 ? (
              <div className="space-y-3">{enabledChannels.map(c => renderCard(c, true))}</div>
            ) : (
              <p className="text-slate-600 text-sm py-4">No enabled channels</p>
            )}
          </div>
        </div>
      )}

      {channels.length === 0 && (
        <Card className="bg-slate-900/50 border-slate-800 p-12 text-center">
          <Megaphone className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">No announcement channels</p>
          <p className="text-slate-500 text-sm">
            This server doesn&apos;t have any announcement channels
          </p>
        </Card>
      )}
    </div>
  );
}

export function ChannelConfig({
  guildId,
  channels,
  hasSubscription,
  channelLimit,
  migrated,
}: ChannelConfigProps) {
  const router = useRouter();
  // A self-hosted instance has no billing, so there is no plan to name in the
  // channel-count caption.
  const isPublicInstance = useIsPublicInstance();
  const [isPending, startTransition] = useTransition();
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const [limitReason, setLimitReason] = useState<ChannelLimitReason | null>(null);
  // Channel awaiting the enable guide acknowledgment (null = no guide open).
  const [guideChannel, setGuideChannel] = useState<GuildChannel | null>(null);

  // MIGRATION: hooks above must run unconditionally; early return only after
  if (!migrated) {
    return <LegacyChannelView channels={channels} hasSubscription={hasSubscription} />;
  }

  const handleToggleChannel = (channelId: string, enabled: boolean) => {
    setPendingChannelId(channelId);
    startTransition(async () => {
      try {
        const result = enabled
          ? await disableChannel(guildId, channelId)
          : await enableChannel(guildId, channelId);
        if (result.ok) {
          if (enabled) {
            toast.success('Channel disabled');
          } else {
            const channel = channels.find(c => c.channelId === channelId);
            // Enabled, but the bot still can't publish here — nudge to the Fix
            // button (now on the channel's card) instead of a false "all good".
            if (channel?.canPublish === false) {
              toast.warning('Channel enabled — but not publishing', {
                description: `#${channel.name} is missing permissions. Click "Fix" to grant them.`,
              });
            } else {
              toast.success('Channel enabled', {
                description: channel ? `#${channel.name} will now auto-publish.` : undefined,
              });
            }
          }
          router.refresh();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        // Dead Discord token: re-login instead of a generic failure (ADR 0010).
        if (signInOnAuthExpired(result.status)) return;
        // Disable never hits the channel cap, so a non-auth failure there is a
        // transient error — a refresh re-syncs the toggle to server truth.
        if (enabled) {
          toast.error("Couldn't update the channel", { description: 'Please try again.' });
          router.refresh();
          return;
        }
        // Already registered — enabled from `/ap enable` or another tab while
        // this list was open. Carries no `code`, so without this branch it fell
        // into the cap fallback below and rendered as "channel limit reached".
        if (result.status === 409) {
          toast.info('Channel already enabled', {
            description: 'It was enabled elsewhere. Refreshing the channel list.',
          });
          router.refresh();
          return;
        }
        // Demoted since this list rendered — a stale list, not a cap hit. Must
        // precede the cap branch below, which treats any code as a limit reason.
        if (result.code === 'NOT_ANNOUNCEMENT_CHANNEL') {
          toast.error('That is no longer an announcement channel', {
            description: 'Its type changed in Discord. Refreshing the channel list.',
          });
          router.refresh();
          return;
        }
        // Cap hit: show the reason-appropriate upsell instead of a hard failure.
        // Scoped to 400 — the route's only other statuses are handled above, and
        // a 5xx rendered as an upsell is the bug this guard prevents.
        if (result.status === 400) {
          setLimitReason((result.code as ChannelLimitReason | undefined) ?? 'LIMIT_FREE');
          return;
        }
        toast.error("Couldn't enable the channel", { description: 'Please try again.' });
      } finally {
        setPendingChannelId(null);
      }
    });
  };

  // Enabling always goes through the guide gate. The channel is only registered
  // on "I granted the permissions"; aborting leaves it disabled.
  const requestEnable = (channel: GuildChannel) => {
    setGuideChannel(channel);
  };

  const confirmEnableFromGuide = () => {
    const channel = guideChannel;
    setGuideChannel(null);
    if (channel) handleToggleChannel(channel.channelId, false);
  };

  const enabledChannels = channels.filter(c => c.enabled);
  const disabledChannels = channels.filter(c => !c.enabled);

  const renderEnabledCard = (channel: GuildChannel) => {
    const style = channelStatusStyle(channel);
    return (
      <Card key={channel.channelId} className={`${style.card} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className={`w-5 h-5 ${style.icon}`} />
            <span className="text-white text-md">{channel.name}</span>
            {channel.filters.length > 0 && (
              <Link
                href={`/dashboard/${guildId}/filters?channel=${channel.channelId}`}
                aria-label={`Edit filters for ${channel.name}`}
              >
                <Badge className="cursor-pointer border-blue-500/30 bg-blue-500/20 text-blue-400 transition-colors hover:bg-blue-500/30">
                  {channel.filters.length} filter
                  {channel.filters.length !== 1 && 's'}
                </Badge>
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ChannelFixButton channel={channel} />
            {isPending && pendingChannelId === channel.channelId && (
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            )}
            <Switch
              checked={true}
              disabled={isPending && pendingChannelId === channel.channelId}
              onCheckedChange={() => handleToggleChannel(channel.channelId, true)}
            />
          </div>
        </div>
      </Card>
    );
  };

  const renderDisabledCard = (channel: GuildChannel) => (
    <Card key={channel.channelId} className="bg-slate-900/30 border-slate-800/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-slate-600" />
          <span className="text-slate-400 text-md">{channel.name}</span>
          {/* Retained config from an over-limit pause (ADR 0009) — subtle, not a managed state */}
          {channel.hasSavedSetup && (
            <Badge className="bg-slate-800/50 text-slate-500 border-slate-700">Saved setup</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPending && pendingChannelId === channel.channelId && (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          )}
          <Switch
            checked={false}
            disabled={isPending && pendingChannelId === channel.channelId}
            onCheckedChange={() => requestEnable(channel)}
          />
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl text-white mb-2">Channel Configuration</h2>
        <p className="text-slate-400 mb-3">
          Manage Auto Publisher for your announcement channels
          {isPublicInstance &&
            !hasSubscription &&
            channelLimit !== 0 &&
            ` (Free plan: up to ${channelLimit} channels)`}
        </p>
        <div className="space-y-1.5">
          <PublishLimitNote />
          <PublishDelayNote hasSubscription={hasSubscription} />
        </div>
      </div>

      {channels.length > 0 && (
        <div className="grid md:grid-cols-2 md:divide-x divide-slate-800 gap-6 md:gap-0">
          <div className="space-y-3 md:pr-6 order-2 md:order-1">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Disabled<span className="ml-3 text-slate-600">{disabledChannels.length}</span>
            </h3>
            {disabledChannels.length > 0 ? (
              <div className="space-y-3">{disabledChannels.map(renderDisabledCard)}</div>
            ) : (
              <p className="text-slate-600 text-sm py-4">No disabled channels</p>
            )}
          </div>
          <div className="space-y-3 md:pl-6 order-1 md:order-2">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Enabled<span className="ml-3 text-slate-600">{enabledChannels.length}</span>
            </h3>
            {enabledChannels.length > 0 ? (
              <div className="space-y-3">{enabledChannels.map(renderEnabledCard)}</div>
            ) : (
              <p className="text-slate-600 text-sm py-4">No enabled channels</p>
            )}
          </div>
        </div>
      )}

      {channels.length === 0 && (
        <Card className="bg-slate-900/50 border-slate-800 p-12 text-center">
          <Megaphone className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">No announcement channels</p>
          <p className="text-slate-500 text-sm">
            This server doesn&apos;t have any announcement channels
          </p>
        </Card>
      )}

      {limitReason && (
        <ChannelLimitModal
          reason={limitReason}
          guildId={guildId}
          onClose={() => setLimitReason(null)}
        />
      )}

      {guideChannel && (
        <ChannelEnableGuideModal
          channelName={guideChannel.name}
          hasSubscription={hasSubscription}
          onConfirm={confirmEnableFromGuide}
          onCancel={() => setGuideChannel(null)}
        />
      )}
    </div>
  );
}
