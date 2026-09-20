'use client';

import { Loader2, Megaphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ChannelEnableGuideModal } from '@/components/dashboard/channel-enable-guide';
import { ChannelFixButton } from '@/components/dashboard/channel-fix';
import { ChannelGroup } from '@/components/dashboard/channel-group';
import { ChannelLimitModal } from '@/components/dashboard/channel-limit-upsell';
import {
  ChannelFilterPill,
  ChannelRow,
  ChannelStatusLabel,
} from '@/components/dashboard/channel-row';
import { EmptyState } from '@/components/dashboard/empty-state';
import { HowPublishingWorks } from '@/components/dashboard/how-publishing-works';
import { LegacyMigrateModal } from '@/components/dashboard/legacy-migrate-modal';
import { NoticeAction, NoticeStrip } from '@/components/dashboard/notice-strip';
import { PageHeader } from '@/components/dashboard/page-header';
import { useIsPublicInstance } from '@/components/site-config-context';
import { Switch } from '@/components/ui/switch';
import { disableChannel, enableChannel } from '@/lib/api/actions';
import { signInOnAuthExpired } from '@/lib/api/client-auth';
import type { ChannelLimitReason, GuildChannel } from '@/lib/api/types';
import { channelLabel } from '@/lib/utils';

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
 * The action surface. Hard split of duties with Overview: this tab never
 * carries a summary, and Overview never carries a toggle. The header states the
 * plan cap and nothing else — the plan name is already in the server switcher.
 */
export function ChannelConfig({
  guildId,
  channels,
  hasSubscription,
  channelLimit,
  migrated,
}: ChannelConfigProps) {
  const router = useRouter();
  const isPublicInstance = useIsPublicInstance();
  const [isPending, startTransition] = useTransition();
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  // Label, not name: the modal says which setup was kept, and a hidden channel
  // has no name to render.
  const [limitHit, setLimitHit] = useState<{
    reason: ChannelLimitReason;
    label: string | null;
  } | null>(null);
  // Channel awaiting the enable guide acknowledgment (null = no guide open).
  const [guideChannel, setGuideChannel] = useState<GuildChannel | null>(null);
  // MIGRATION: removed at sunset with the legacy strip.
  const [migrateOpen, setMigrateOpen] = useState(false);

  const handleToggleChannel = (channelId: string, enabled: boolean) => {
    setPendingChannelId(channelId);
    startTransition(async () => {
      try {
        const result = enabled
          ? await disableChannel(guildId, channelId)
          : await enableChannel(guildId, channelId);
        const channel = channels.find(c => c.channelId === channelId);
        if (result.ok) {
          if (enabled) {
            toast.success(
              `${channel ? channelLabel(channel.name) : 'Channel'} is no longer publishing.`
            );
          } else if (channel?.canPublish === false) {
            // Enabled, but the bot still can't publish here — point at the Fix
            // control on its row rather than claim a false "all good".
            toast.warning(`${channelLabel(channel.name)} is enabled but not publishing.`, {
              description: 'Grant the missing permissions in Discord to fix it.',
            });
          } else {
            toast.success(`${channel ? channelLabel(channel.name) : 'Channel'} is now publishing.`);
          }
          router.refresh();
          return;
        }
        // Dead Discord token: re-login instead of a generic failure (ADR 0010).
        if (signInOnAuthExpired(result.status)) return;
        // Disable never hits the channel cap, so a non-auth failure there is
        // transient — a refresh re-syncs the toggle to server truth.
        if (enabled) {
          toast.error("Couldn't update the channel. Nothing was changed.");
          router.refresh();
          return;
        }
        // Already registered — enabled from `/ap enable` or another tab while
        // this list was open. Carries no `code`, so without this branch it falls
        // into the cap fallback and renders as "channel limit reached".
        if (result.status === 409) {
          toast.info('That channel was already enabled elsewhere.');
          router.refresh();
          return;
        }
        // Demoted since this list rendered — a stale list, not a cap hit. Must
        // precede the cap branch, which treats any code as a limit reason.
        if (result.code === 'NOT_ANNOUNCEMENT_CHANNEL') {
          toast.error('That is no longer an announcement channel.');
          router.refresh();
          return;
        }
        // Cap hit. Scoped to 400 — every other status is handled above, and a
        // 5xx rendered as an upsell is the bug this guard prevents.
        if (result.status === 400) {
          setLimitHit({
            reason: (result.code as ChannelLimitReason | undefined) ?? 'LIMIT_FREE',
            label: channel ? channelLabel(channel.name) : null,
          });
          return;
        }
        toast.error("Couldn't enable the channel. Nothing was changed.");
      } finally {
        setPendingChannelId(null);
      }
    });
  };

  // Enabling always passes through the guide: permissions are a prerequisite,
  // not an afterthought. Aborting leaves the channel disabled.
  const confirmEnableFromGuide = () => {
    const channel = guideChannel;
    setGuideChannel(null);
    if (channel) handleToggleChannel(channel.channelId, false);
  };

  const enabled = channels.filter(c => c.enabled);
  const disabled = channels.filter(c => !c.enabled);
  // MIGRATION: a legacy guild has no allowlist, so it has no count to cap —
  // stating a limit it isn't subject to is worse than stating nothing.
  const capped =
    migrated && channels.length > 0 && isPublicInstance && !hasSubscription && channelLimit !== 0;

  const toggleFor = (channel: GuildChannel, on: boolean) => (
    <div className="flex shrink-0 items-center gap-2">
      {isPending && pendingChannelId === channel.channelId && (
        <Loader2 className="size-4 animate-spin text-slate-400" />
      )}
      <Switch
        checked={on}
        aria-label={`${on ? 'Disable' : 'Enable'} ${channelLabel(channel.name)}`}
        disabled={isPending && pendingChannelId === channel.channelId}
        onCheckedChange={() =>
          on ? handleToggleChannel(channel.channelId, true) : setGuideChannel(channel)
        }
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Channels"
        aside={capped ? `Plan limit: ${enabled.length} of ${channelLimit}` : undefined}
      />

      {/* MIGRATION: removed at sunset, along with the read-only branch below. */}
      {!migrated && (
        <NoticeStrip
          tone="amber"
          actions={<NoticeAction onClick={() => setMigrateOpen(true)}>Migrate now</NoticeAction>}
        >
          Legacy mode publishes every announcement channel. Migrate to control channels one by one.
        </NoticeStrip>
      )}

      {channels.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcement channels here yet">
          In Discord, open a channel&apos;s settings and turn on &ldquo;Announcement channel&rdquo;.
          It appears here right away.
        </EmptyState>
      ) : !migrated ? (
        // MIGRATION: a read-only picture until they migrate. One note on the
        // heading rather than a repeated "legacy" tag on every row.
        <ChannelGroup label="Channels" count={channels.length} meta="Migration needed">
          {channels.map(channel => (
            <ChannelRow
              key={channel.channelId}
              name={channel.name}
              tone={channel.canPublish === false ? 'red' : 'green'}
              muted
              actions={<Switch checked={channel.canPublish !== false} disabled />}
            />
          ))}
        </ChannelGroup>
      ) : (
        <div className="space-y-4">
          {enabled.length > 0 && (
            <ChannelGroup label="Enabled" count={enabled.length}>
              {enabled.map(channel => {
                const broken = channel.canPublish === false;
                return (
                  <ChannelRow
                    key={channel.channelId}
                    name={channel.name}
                    tone={broken ? 'red' : 'green'}
                    // A broken row states itself through the Fix control.
                    status={broken ? undefined : <ChannelStatusLabel icon kind="publishing" />}
                    actions={
                      <>
                        {channel.filters.length > 0 && (
                          <ChannelFilterPill
                            count={channel.filters.length}
                            href={`/dashboard/${guildId}/filters?channel=${channel.channelId}`}
                            name={channel.name}
                          />
                        )}
                        <ChannelFixButton
                          guildId={guildId}
                          channel={channel}
                          icon
                          // Reuses the disable path for its toast, refresh and
                          // dead-token handling.
                          onRemove={() => handleToggleChannel(channel.channelId, true)}
                        />
                        {toggleFor(channel, true)}
                      </>
                    }
                  />
                );
              })}
            </ChannelGroup>
          )}

          {disabled.length > 0 && (
            <ChannelGroup label="Disabled" count={disabled.length}>
              {disabled.map(channel => (
                <ChannelRow
                  key={channel.channelId}
                  name={channel.name}
                  muted
                  // Retained config from an over-limit pause (ADR 0009), stated
                  // only on the row it applies to.
                  sub={channel.hasSavedSetup ? 'Filters retained from Premium plan' : undefined}
                  actions={toggleFor(channel, false)}
                />
              ))}
            </ChannelGroup>
          )}
        </div>
      )}

      {channels.length > 0 && <HowPublishingWorks hasSubscription={hasSubscription} />}

      {limitHit && (
        <ChannelLimitModal
          reason={limitHit.reason}
          guildId={guildId}
          channelName={limitHit.label}
          onClose={() => setLimitHit(null)}
        />
      )}

      {migrateOpen && (
        <LegacyMigrateModal
          guildId={guildId}
          channels={channels}
          limit={channelLimit === 0 ? null : channelLimit}
          onClose={() => setMigrateOpen(false)}
        />
      )}

      {guideChannel && (
        <ChannelEnableGuideModal
          channelName={channelLabel(guideChannel.name)}
          hasSubscription={hasSubscription}
          onConfirm={confirmEnableFromGuide}
          onCancel={() => setGuideChannel(null)}
        />
      )}
    </div>
  );
}
