'use client';

import { Copy } from '@ap/copy';
import { Loader2, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useGuild } from '@/components/dashboard/guild-context';
import { StatusCardAction } from '@/components/dashboard/status-card';
import { useOverLimitState } from '@/components/dashboard/use-over-limit-state';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { setRollover } from '@/lib/api/actions';
import { signInOnAuthExpired } from '@/lib/api/client-auth';

/**
 * The guild-wide Rollover switch, heading the Channels tab. A free server sees it
 * disabled with the Zap as a badge: the maintainer wants the feature visible where
 * it would act, so this is the one free-tier surface that carries the Zap.
 */
export function RolloverCard() {
  const { guild, data } = useGuild();
  const locked = useOverLimitState() === 'upsell';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(data.rolloverEnabled);
  // Follows the server value after a refresh, or a change from `/ap rollover`.
  const [serverEnabled, setServerEnabled] = useState(data.rolloverEnabled);
  if (serverEnabled !== data.rolloverEnabled) {
    setServerEnabled(data.rolloverEnabled);
    setEnabled(data.rolloverEnabled);
  }
  const titleId = useId();
  const descriptionId = useId();
  const premiumId = useId();

  const toggle = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setRollover(guild.id, next);
      if (result.ok) {
        setEnabled(result.rolloverEnabled);
        const outcome = result.rolloverEnabled ? Copy.rollover.turnedOn : Copy.rollover.turnedOff;
        toast.success(outcome.title, { description: outcome.detail });
        router.refresh();
        return;
      }
      setEnabled(previous);
      if (signInOnAuthExpired(result.status)) return;
      // Premium ended while the page was open; the refresh relocks the card.
      if (result.code === 'PREMIUM_INACTIVE') {
        toast.error(Copy.rollover.premiumOnly);
      } else {
        toast.error(`Could not turn ${next ? 'on' : 'off'} ${Copy.rollover.name}. Try again.`);
      }
      // The write may have landed before the failure; re-sync to server truth.
      router.refresh();
    });
  };

  return (
    <section className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {locked ? (
            <PremiumBadge />
          ) : (
            <Zap className="size-4 shrink-0 text-yellow-500" aria-hidden="true" />
          )}
          <h2 id={titleId} className="font-semibold text-sm text-white">
            {Copy.rollover.name}
          </h2>
        </div>
        <p id={descriptionId} className="mt-1 text-xs leading-snug text-slate-400">
          {Copy.rollover.description}
        </p>
        {locked && (
          <span id={premiumId} className="sr-only">
            {Copy.rollover.premiumOnly}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {isPending && <Loader2 className="size-4 animate-spin text-slate-400" />}
        {locked && (
          <StatusCardAction href={`/dashboard/${guild.id}/subscription`}>Upgrade</StatusCardAction>
        )}
        <Switch
          checked={locked ? false : enabled}
          disabled={locked || isPending}
          aria-labelledby={titleId}
          aria-describedby={locked ? `${descriptionId} ${premiumId}` : descriptionId}
          onCheckedChange={toggle}
        />
      </div>
    </section>
  );
}

/**
 * Opens on hover, keyboard focus and tap. A Radix tooltip closes on click, which
 * leaves touch with no way to open it, so the click opens it instead.
 */
function PremiumBadge() {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Premium"
          onClick={event => {
            // Skips Radix's own close-on-click, which runs after this handler.
            event.preventDefault();
            setOpen(true);
          }}
          className="flex size-6 shrink-0 cursor-help items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500 outline-none transition-colors hover:bg-yellow-500/20 focus-visible:ring-2 focus-visible:ring-yellow-500/50"
        >
          <Zap className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{Copy.rollover.premiumOnly}</TooltipContent>
    </Tooltip>
  );
}
