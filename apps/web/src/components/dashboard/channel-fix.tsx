'use client';

import { TriangleAlert } from 'lucide-react';
import { PermissionSteps } from '@/components/dashboard/channel-permission-steps';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { GuildChannel } from '@/lib/api/types';

/**
 * Whether a channel has a publish problem, surfaced identically on the Overview
 * and Channels tabs via one shared Fix button + modal (CONTEXT "Channel Fix
 * affordance"): the bot can't publish here, so nothing is being crossposted
 * (`canPublish === false`).
 */
export function channelIsBroken(channel: GuildChannel): boolean {
  return channel.canPublish === false;
}

// Enabled-channel status coloring, shared by the Overview and Channels tabs so a
// channel reads the same color on both: red = the bot can't publish, green =
// healthy. See CONTEXT "Channel Fix affordance".
const CHANNEL_STATUS_STYLES = {
  permissions: { card: 'bg-red-500/5 border-red-500/30', icon: 'text-red-400' },
  healthy: { card: 'bg-green-500/2 border-green-500/40', icon: 'text-green-500' },
} as const;

/** Card + icon classes for an enabled channel. */
export function channelStatusStyle(channel: GuildChannel) {
  return CHANNEL_STATUS_STYLES[channelIsBroken(channel) ? 'permissions' : 'healthy'];
}

/**
 * Instructional Fix button for a broken channel. Instructional only — no
 * recheck/confirm action: the publish-state cache is bot-pushed and self-updates
 * once permissions change (ADR 0008), so any action button would lie or burn
 * Discord REST. Dismissible (backdrop or corner X).
 */
export function ChannelFixButton({ channel }: { channel: GuildChannel }) {
  if (!channelIsBroken(channel)) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          // Resting severity-tinted background (not a ghost/transparent rest
          // state) so the button reads as a control at first glance. See CONTEXT.
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm shrink-0 transition-colors cursor-pointer text-red-400 bg-red-500/10 hover:bg-red-500/20"
        >
          <TriangleAlert className="w-4 h-4" />
          <span>Fix</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4 pr-6">
            <TriangleAlert className="w-6 h-6 text-red-400 shrink-0 mt-1" />
            <div>
              <DialogTitle>This channel isn’t publishing</DialogTitle>
              <DialogDescription className="mt-2">
                Auto Publisher can’t publish in this channel because it’s missing permissions. Grant
                them and publishing resumes on its own.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="pl-10">
          <PermissionSteps channelName={channel.name} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
