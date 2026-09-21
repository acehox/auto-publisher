'use client';

import { Copy } from '@ap/copy';
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

/**
 * A choice rather than a flat error: the Filters tab that would let an admin
 * clear the rule by hand is itself Premium-locked, so refusing alone strands
 * them. Mirrors the bot's `/ap enable` prompt; both must state the same
 * consequence.
 *
 * The destructive way out sits outside the footer: three buttons on one row
 * overflow a dialog, and an irreversible action should not sit a thumb-width
 * from the dismiss button.
 */
export function ChannelFiltersPremiumModal({
  guildId,
  channelName,
  filterCount,
  onClear,
  onClose,
}: {
  guildId: string;
  /** The channel that was refused; null for a hidden one, which has no name. */
  channelName: string | null;
  filterCount: number;
  /** Re-runs the enable with the admin's consent to drop the rule. */
  onClear: () => void;
  onClose: () => void;
}) {
  const subject = channelName ?? 'That channel';

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{Copy.channels.filtersPremium.title}</DialogTitle>
          <DialogDescription>
            {Copy.channels.filtersPremium.body(subject, filterCount)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-sm text-slate-300">
            {Copy.channels.filtersPremium.clearOffer(filterCount)}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>
            {Copy.channels.filtersPremium.clearAction(filterCount)}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {Copy.channels.filtersPremium.keepOff}
          </Button>
          <Button asChild>
            <Link href={`/dashboard/${guildId}/subscription`}>Upgrade to Premium</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
