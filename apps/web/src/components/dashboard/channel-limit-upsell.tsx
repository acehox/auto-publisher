'use client';

import { Crown } from 'lucide-react';
import Link from 'next/link';
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
 * Copy for the one cap rejection there is. Kept as a `Record` keyed by
 * `ChannelLimitReason` so the backend's error `code` maps straight onto it —
 * both clients must branch on the code rather than assume every 400 is a cap
 * hit (`NOT_ANNOUNCEMENT_CHANNEL` is the other one).
 */
export const CHANNEL_LIMIT_COPY: Record<ChannelLimitReason, { heading: string; body: string }> = {
  LIMIT_FREE: {
    heading: 'Channel limit reached',
    body: 'The free plan publishes in up to 3 channels. Upgrade to Premium to unlock unlimited channels, message filters and priority publishing.',
  },
};

/** The action button matching a rejection reason. */
export function ChannelLimitCta({ guildId }: { guildId: string }) {
  return (
    <Button className="bg-purple-600 hover:bg-purple-500 text-white" asChild>
      <Link href={`/dashboard/${guildId}/subscription`}>Upgrade to Premium</Link>
    </Button>
  );
}

/** Modal shown when enabling a channel is rejected for hitting the cap. */
export function ChannelLimitModal({
  reason,
  guildId,
  onClose,
}: {
  reason: ChannelLimitReason;
  guildId: string;
  onClose: () => void;
}) {
  const copy = CHANNEL_LIMIT_COPY[reason];

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4 pr-6">
            <Crown className="w-6 h-6 text-purple-400 shrink-0 mt-1" />
            <div>
              <DialogTitle>{copy.heading}</DialogTitle>
              <DialogDescription className="mt-1">{copy.body}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-700 text-slate-300">
            Close
          </Button>
          <ChannelLimitCta guildId={guildId} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
