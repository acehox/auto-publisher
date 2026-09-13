'use client';

import { Check, Loader2, Megaphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PublishDelayNote } from '@/components/dashboard/publish-delay-note';
import { useIsPublicInstance, useLegacySunsetLabel } from '@/components/site-config-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { migrateGuild } from '@/lib/api/actions';
import { signInOnAuthExpired } from '@/lib/api/client-auth';
import type { GuildChannel } from '@/lib/api/types';

// MIGRATION: Remove this component after migration period (6 months)

interface LegacyMigrateModalProps {
  guildId: string;
  channels: GuildChannel[];
  /** Max selectable channels, or null for unlimited (premium) */
  limit: number | null;
  hasSubscription: boolean;
  onClose: () => void;
}

/**
 * Over-limit guidance. No "upgrade now" here: on a legacy guild the upgrade is
 * gated behind finishing migration, so the CTA is "migrate now, upgrade right
 * after". An entitled guild is never capped, so it never sees this.
 */
function overSelectedMessage(limit: number): string {
  return `You can enable up to ${limit} channels now. Deselect some to migrate — right after, you can upgrade to Premium to add unlimited channels.`;
}

export function LegacyMigrateModal({
  guildId,
  channels,
  limit,
  hasSubscription,
  onClose,
}: LegacyMigrateModalProps) {
  const router = useRouter();
  // A self-hosted instance has no billing, so it never caps a guild (`limit` is
  // null) and this copy would name a plan that doesn't exist there.
  const isPublicInstance = useIsPublicInstance();
  const sunsetLabel = useLegacySunsetLabel();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const publishableCount = channels.filter(c => c.canPublish).length;
  const overLimit = limit !== null && publishableCount > limit;

  // Preselect all currently-publishing channels when they fit the plan limit
  // (migration is then a behavioral no-op); otherwise force an explicit choice
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(overLimit ? [] : channels.filter(c => c.canPublish).map(c => c.channelId))
  );

  const toggleChannel = (channelId: string) => {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  const overSelected = limit !== null && selected.size > limit;

  const handleConfirm = () => {
    setError(false);
    startTransition(async () => {
      const result = await migrateGuild(guildId, [...selected]);
      if (result.ok) {
        onClose();
        toast.success("You're all set", { description: 'Channel setup saved.' });
        router.refresh();
        return;
      }
      // Dead Discord token: re-login instead of a generic failure (ADR 0010).
      if (signInOnAuthExpired(result.status)) return;
      setError(true);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={open => {
        // Don't let a stray ESC close mid-migration.
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0"
        // Migration is a deliberate action — a backdrop click must not dismiss it.
        onInteractOutside={event => event.preventDefault()}
      >
        <DialogHeader className="p-6 pb-4 pr-10">
          <DialogTitle>Migrate to the new system</DialogTitle>
          <DialogDescription>
            {overLimit
              ? `${publishableCount} channels currently auto-publish. Only ${limit} can keep publishing right now — choose which ones.`
              : 'Channels the bot currently publishes in are preselected. Unselected channels will stop publishing.'}
          </DialogDescription>
          <p className="text-slate-400 text-sm mt-2">
            Legacy mode ends on <span className="text-white font-semibold">{sunsetLabel}</span>.
          </p>
        </DialogHeader>

        {channels.length > 0 && (
          <div className="px-6 pb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Channels
            </span>
            <span
              className={`text-sm font-medium ${overSelected ? 'text-amber-400' : 'text-slate-300'}`}
            >
              {limit !== null ? `${selected.size}/${limit} selected` : `${selected.size} selected`}
            </span>
          </div>
        )}

        <div className="px-6 space-y-2 overflow-y-auto flex-1">
          {channels.map(channel => {
            const checked = selected.has(channel.channelId);
            return (
              <button
                key={channel.channelId}
                type="button"
                onClick={() => toggleChannel(channel.channelId)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  checked
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                }`}
              >
                <span
                  className={`size-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checked ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-500'
                  }`}
                >
                  {checked && <Check className="size-3.5" />}
                </span>
                <Megaphone className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-white truncate">{channel.name}</span>
                {!channel.canPublish && (
                  <Badge className="ml-auto shrink-0 bg-slate-800/50 text-slate-500 border-slate-700">
                    Missing permissions
                  </Badge>
                )}
              </button>
            );
          })}
          {channels.length === 0 && (
            <p className="text-slate-500 text-sm py-4 text-center">
              No announcement channels found. You can still migrate now and enable channels later.
            </p>
          )}
        </div>

        <div className="p-6 pt-4 space-y-3">
          <PublishDelayNote hasSubscription={hasSubscription} />
          {overSelected && limit !== null && isPublicInstance && (
            <p className="text-amber-400 text-sm">{overSelectedMessage(limit)}</p>
          )}
          {error && <p className="text-red-400 text-sm">Migration failed. Please try again.</p>}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isPending || overSelected}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Migrate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
