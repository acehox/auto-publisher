'use client';

import { CircleX } from 'lucide-react';
import type { ReactNode } from 'react';
import { PermissionSteps } from '@/components/dashboard/channel-permission-steps';
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
import { cn } from '@/lib/utils';

/**
 * Whether the bot can't publish in a channel — the one "broken" state there is
 * (`canPublish === false`; undefined means unknown and reads as publishing).
 */
export function channelIsBroken(channel: GuildChannel): boolean {
  return channel.canPublish === false;
}

/**
 * Instructional only, and freely dismissible — the publish-state cache is
 * bot-pushed and self-heals once permissions change (ADR 0008), so a recheck
 * button would either lie or burn Discord REST.
 */
export function ChannelFixButton({
  channel,
  icon,
}: {
  channel: GuildChannel;
  /**
   * Severity icon, for Channels rows — the row states each channel's state in
   * its own right there. Overview rows sit inside a status card that already
   * carries the severity, so a second icon would be noise.
   */
  icon?: boolean;
}) {
  return (
    <ChannelFixDialog
      channel={channel}
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
 */
export function ChannelFixDialog({
  channel,
  trigger,
}: {
  channel: GuildChannel;
  trigger: ReactNode;
}) {
  if (!channelIsBroken(channel)) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>#{channel.name} stopped publishing</DialogTitle>
          <DialogDescription>A permission was removed in Discord.</DialogDescription>
        </DialogHeader>

        <PermissionSteps />

        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
