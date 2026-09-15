'use client';

import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useLegacySunsetLabel } from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { migrateGuild } from '@/lib/api/actions';
import { signInOnAuthExpired } from '@/lib/api/client-auth';
import type { GuildChannel } from '@/lib/api/types';
import { cn } from '@/lib/utils';

// MIGRATION: remove this component with the rest of the legacy UX at sunset.

interface LegacyMigrateModalProps {
  guildId: string;
  channels: GuildChannel[];
  /** Max selectable channels, or null for unlimited (premium) */
  limit: number | null;
  onClose: () => void;
}

/**
 * One-time setup with nothing preselected: the person chooses, up to the plan
 * cap, and the count sits with the buttons that act on it. Permission gaps are
 * flagged but never block the migration — they are fixed in Discord afterwards.
 * A backdrop click cannot dismiss this; it is a deliberate action.
 */
export function LegacyMigrateModal({ guildId, channels, limit, onClose }: LegacyMigrateModalProps) {
  const router = useRouter();
  const sunsetLabel = useLegacySunsetLabel();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggleChannel = (channelId: string) =>
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });

  const overSelected = limit !== null && selected.size > limit;

  const handleConfirm = () => {
    setError(false);
    startTransition(async () => {
      const result = await migrateGuild(guildId, [...selected]);
      if (result.ok) {
        onClose();
        toast.success('Channel setup saved.');
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
        className="flex max-h-[85vh] flex-col"
        onInteractOutside={event => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Choose the channels that publish</DialogTitle>
          <DialogDescription>
            One-time setup. Pick the channels that keep publishing — after this, each one is yours
            to turn on and off. Legacy mode ends {sunsetLabel}.
          </DialogDescription>
        </DialogHeader>

        {channels.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-800">
            {channels.map(channel => {
              const checked = selected.has(channel.channelId);
              return (
                <button
                  key={channel.channelId}
                  type="button"
                  onClick={() => toggleChannel(channel.channelId)}
                  className="flex w-full cursor-pointer items-center gap-3 border-slate-800/70 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-slate-800/40"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                      checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-600'
                    )}
                  >
                    {checked && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-100">{channel.name}</span>
                    {channel.canPublish === false && (
                      <span className="mt-0.5 block text-[11px] text-red-300">
                        Missing permissions — fix in Discord after this
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-slate-500">
            No announcement channels found. You can still migrate now and enable channels later.
          </p>
        )}

        {error && <p className="text-xs text-red-400">Migration failed. Please try again.</p>}

        <DialogFooter className="sm:items-center sm:justify-between">
          {channels.length > 0 && (
            <span
              className={cn(
                'font-mono text-xs',
                overSelected ? 'text-yellow-400' : 'text-slate-400'
              )}
            >
              {limit !== null
                ? `${selected.size} of ${limit} selected`
                : `${selected.size} selected`}
            </span>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isPending || overSelected}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Migrate
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
