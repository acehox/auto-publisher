'use client';

import { ANNOUNCEMENT_CHANNEL_TYPE } from '@ap/api-types';
import { Copy } from '@ap/copy';
import { CircleX, ExternalLink, EyeOff } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { AnnouncementSteps, PermissionSteps } from '@/components/dashboard/channel-fix-steps';
import { CHIP_CLASS } from '@/components/dashboard/chip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { GuildChannel } from '@/lib/api/types';
import { channelLabel, cn } from '@/lib/utils';

/**
 * Whether the bot can't publish in a channel — the one "broken" state there is
 * (`canPublish === false`; undefined means unknown and reads as publishing).
 */
export function channelIsBroken(channel: GuildChannel): boolean {
  return channel.canPublish === false;
}

/**
 * A registered channel Discord no longer returns. Always broken too (the backend
 * sets `canPublish: false` by construction), so it needs no separate bucket in
 * the counts, the strip or the badge.
 */
export function channelIsHidden(channel: GuildChannel): boolean {
  return channel.name === null;
}

/**
 * A registered channel converted to a text channel. Shares the broken bucket;
 * unlike a hidden one, its cause is known.
 */
export function channelIsConverted(channel: GuildChannel): boolean {
  return channel.name !== null && channel.type !== ANNOUNCEMENT_CHANNEL_TYPE;
}

/**
 * Instructional only, and freely dismissible — the publish-state cache is
 * bot-pushed and self-heals once permissions change, so a recheck
 * button would either lie or burn Discord REST.
 */
export function ChannelFixButton({
  guildId,
  channel,
  icon,
  onRemove,
}: {
  guildId: string;
  channel: GuildChannel;
  /**
   * Severity icon, for Channels rows — the row states each channel's state in
   * its own right there. Overview rows sit inside a status card that already
   * carries the severity, so a second icon would be noise.
   */
  icon?: boolean;
  onRemove?: () => void;
}) {
  return (
    <ChannelFixDialog
      guildId={guildId}
      channel={channel}
      onRemove={onRemove}
      trigger={
        <button
          type="button"
          className={cn(
            CHIP_CLASS,
            'cursor-pointer bg-red-500/10 font-medium text-red-300 hover:bg-red-500/20'
          )}
        >
          {icon && <CircleX aria-hidden className="size-3" />}
          Fix
        </button>
      }
    />
  );
}

/**
 * The permission steps behind any trigger — the row's Fix button, or the
 * Overview banner's "Fix now" link. One dialog so the two entry points cannot
 * drift apart.
 *
 * A hidden channel gets the same steps plus the two things its row can't carry:
 * the channel id and a deep link. The link is unconditional — an admin who also
 * can't see the channel lands on nothing, not worth gating for. A converted
 * channel gets the steps back to Announcement instead.
 */
export function ChannelFixDialog({
  guildId,
  channel,
  trigger,
  onRemove,
}: {
  guildId: string;
  channel: GuildChannel;
  trigger: ReactNode;
  /** Channels tab only — Overview is read-only by contract and shares this dialog. */
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!channelIsBroken(channel)) return null;

  const hidden = channelIsHidden(channel);
  const converted = channelIsConverted(channel);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hidden && <EyeOff aria-hidden className="size-4 shrink-0 text-slate-400" />}
            {hidden
              ? 'This channel is hidden'
              : converted
                ? `${channelLabel(channel.name)} is not an announcement channel`
                : `${channelLabel(channel.name)} cannot auto-publish`}
          </DialogTitle>
          <DialogDescription>
            {hidden
              ? 'Discord does not show this channel to Auto Publisher. Auto Publisher is missing the View Channel permission, or the channel no longer exists.'
              : converted
                ? Copy.channels.notAnnouncement.reason
                : 'Auto Publisher is missing Discord permissions in this channel.'}
          </DialogDescription>
        </DialogHeader>

        {hidden && (
          <div className="space-y-3 rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <div className="space-y-1">
              <p className="text-slate-400 text-xs">Channel ID</p>
              <p className="select-all break-all font-mono text-slate-200 text-xs">
                {channel.channelId}
              </p>
            </div>
            <a
              href={`https://discord.com/channels/${guildId}/${channel.channelId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-slate-300 text-xs transition-colors hover:text-white"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              Open in Discord
            </a>
          </div>
        )}

        {converted ? <AnnouncementSteps /> : <PermissionSteps />}

        <DialogFooter className="sm:justify-end">
          {(hidden || converted) && onRemove && (
            <Button
              variant="ghost"
              className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
            >
              Disable
            </Button>
          )}
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
