'use client';

import { Copy } from '@ap/copy';
import { Loader2, Megaphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ChannelDisableFiltersModal } from '@/components/dashboard/channel-disable-confirm';
import { ChannelEnableGuideModal } from '@/components/dashboard/channel-enable-guide';
import { ChannelFiltersPremiumModal } from '@/components/dashboard/channel-filters-premium';
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
  const [isPending, startTransition] = useTransition();
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  // Label, not name: the modal says which setup was kept, and a hidden channel
  // has no name to render.
  const [limitHit, setLimitHit] = useState<{
    reason: ChannelLimitReason;
    label: string | null;
  } | null>(null);
  // Channel awaiting the enable guide acknowledgment (null = no guide open).
  // Carries the filter consent so the guide stays the last step before the write.
  const [guideChannel, setGuideChannel] = useState<{
    channel: GuildChannel;
    clearFilters: boolean;
  } | null>(null);
  const [filtersBlocked, setFiltersBlocked] = useState<GuildChannel | null>(null);
  // Disabling deletes the row, rule included — the warning `/ap disable` has
  // always shown.
  const [disableChannelWithFilters, setDisableChannelWithFilters] = useState<GuildChannel | null>(
    null
  );
  // MIGRATION: removed at sunset with the legacy strip.
  const [migrateOpen, setMigrateOpen] = useState(false);

  const handleToggleChannel = (
    channelId: string,
    enabled: boolean,
    options: { clearFilters?: boolean } = {}
  ) => {
    setPendingChannelId(channelId);
    startTransition(async () => {
      try {
        const result = enabled
          ? await disableChannel(guildId, channelId)
          : await enableChannel(guildId, channelId, options);
        const channel = channels.find(c => c.channelId === channelId);
        // Wording shared with the bot's `/ap enable` and `/ap disable` replies —
        // a toast has no title/body split, so the channel name rides the sentence.
        const subject = channel ? channelLabel(channel.name) : 'this channel';
        if (result.ok) {
          if (enabled) {
            toast.success(`${Copy.channels.outcome.disabled} in ${subject}.`);
          } else if (channel?.canPublish === false) {
            // Enabled, but the bot still can't publish here — point at the Fix
            // control on its row rather than claim a false "all good".
            toast.warning(
              `${Copy.channels.outcome.enabled} in ${subject}, but it isn't publishing yet.`,
              {
                description: 'Grant the missing permissions in Discord to fix it.',
              }
            );
          } else {
            toast.success(`${Copy.channels.outcome.enabled} in ${subject}.`);
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
          toast.info(Copy.channels.outcome.alreadyEnabled);
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
        // Like the branch above, must precede the cap fallback, which treats
        // any 400 as a limit hit.
        if (result.code === 'FILTERS_PREMIUM') {
          if (channel) setFiltersBlocked(channel);
          else toast.error('That channel keeps filters that only run on Premium.');
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
    const pending = guideChannel;
    setGuideChannel(null);
    if (pending) {
      handleToggleChannel(pending.channel.channelId, false, {
        clearFilters: pending.clearFilters,
      });
    }
  };

  // `channelLimit !== 0` IS the free plan (`Plans.channelLimit` returns 0 only
  // for Premium). Asked before the guide so a free guild is not walked through
  // permissions for a channel the backend will refuse; the FILTERS_PREMIUM
  // branch above stays the authority for a stale list.
  const requestEnable = (channel: GuildChannel) => {
    if (channelLimit !== 0 && channel.filters.length > 0) return setFiltersBlocked(channel);
    setGuideChannel({ channel, clearFilters: false });
  };

  const enabled = channels.filter(c => c.enabled);
  const disabled = channels.filter(c => !c.enabled);

  const toggleFor = (channel: GuildChannel, on: boolean) => (
    <div className="flex shrink-0 items-center gap-2">
      {isPending && pendingChannelId === channel.channelId && (
        <Loader2 className="size-4 animate-spin text-slate-400" />
      )}
      <Switch
        checked={on}
        aria-label={`${on ? 'Disable' : 'Enable'} ${channelLabel(channel.name)}`}
        disabled={isPending && pendingChannelId === channel.channelId}
        onCheckedChange={() => {
          if (!on) return requestEnable(channel);
          if (channel.filters.length > 0) return setDisableChannelWithFilters(channel);
          handleToggleChannel(channel.channelId, true);
        }}
      />
    </div>
  );

  // Stated by cause: `hasSavedSetup` is merely "paused", so keying the filter
  // copy off it told a channel paused purely for the cap that it held a rule.
  const pausedSub = (channel: GuildChannel): string | undefined => {
    if (!channel.hasSavedSetup) return undefined;
    const n = channel.filters.length;
    if (n > 0) return Copy.channels.paused.rowFilters(n);
    return channelLimit === 0
      ? 'Paused'
      : `Paused. ${Copy.channels.paused.capReason(channelLimit)}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Channels" />

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
                          // dead-token handling, confirm included.
                          onRemove={() =>
                            channel.filters.length > 0
                              ? setDisableChannelWithFilters(channel)
                              : handleToggleChannel(channel.channelId, true)
                          }
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
                  sub={pausedSub(channel)}
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

      {filtersBlocked && (
        <ChannelFiltersPremiumModal
          guildId={guildId}
          channelName={filtersBlocked.name ? channelLabel(filtersBlocked.name) : null}
          filterCount={filtersBlocked.filters.length}
          onClear={() => {
            const channel = filtersBlocked;
            setFiltersBlocked(null);
            setGuideChannel({ channel, clearFilters: true });
          }}
          onClose={() => setFiltersBlocked(null)}
        />
      )}

      {disableChannelWithFilters && (
        <ChannelDisableFiltersModal
          channelName={channelLabel(disableChannelWithFilters.name)}
          filterCount={disableChannelWithFilters.filters.length}
          onConfirm={() => {
            const channel = disableChannelWithFilters;
            setDisableChannelWithFilters(null);
            handleToggleChannel(channel.channelId, true);
          }}
          onCancel={() => setDisableChannelWithFilters(null)}
        />
      )}

      {guideChannel && (
        <ChannelEnableGuideModal
          channelName={channelLabel(guideChannel.channel.name)}
          hasSubscription={hasSubscription}
          onConfirm={confirmEnableFromGuide}
          onCancel={() => setGuideChannel(null)}
        />
      )}
    </div>
  );
}
