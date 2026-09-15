'use client';

import Link from 'next/link';
import { useSiteConfig } from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChannelLimitReason } from '@/lib/api/types';

/**
 * Shown when enabling a channel is rejected for hitting the cap. No plan
 * comparison here — the Subscription tab owns that, and repeating it is what
 * made pressing the CTA read as a no-op.
 *
 * `reason` is the backend's error `code`. One member today, kept as a named type
 * so both clients branch on the code: `NOT_ANNOUNCEMENT_CHANNEL` is the other
 * 400 from this route, and rendering it as a cap hit is the bug the type
 * prevents.
 */
export function ChannelLimitModal({
  reason,
  guildId,
  channelName,
  onClose,
}: {
  reason: ChannelLimitReason;
  guildId: string;
  /** The channel that was just refused, when known. */
  channelName: string | null;
  onClose: () => void;
}) {
  const { freeChannelLimit } = useSiteConfig();
  void reason;

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>The Free plan publishes {freeChannelLimit} channels</DialogTitle>
          <DialogDescription>
            {channelName ? `${channelName} keeps` : 'That channel keeps'} the setup you just made
            and stays paused. Premium publishes every channel, with filters and priority in the
            queue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Not now
          </Button>
          <Button asChild>
            <Link href={`/dashboard/${guildId}/subscription`}>Upgrade to Premium</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
