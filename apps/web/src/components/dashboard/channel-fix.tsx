'use client';

import type { ReactNode } from 'react';
import { PermissionSteps } from '@/components/dashboard/channel-permission-steps';
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
export function ChannelFixButton({ channel }: { channel: GuildChannel }) {
  return (
    <ChannelFixDialog
      channel={channel}
      trigger={
        <button
          type="button"
          className="shrink-0 cursor-pointer whitespace-nowrap rounded-md border border-red-400/45 px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10"
        >
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
