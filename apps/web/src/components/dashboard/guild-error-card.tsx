'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

/**
 * In-place manual retry for a transient load failure, instead of ejecting to the
 * server list (ADR 0010). Two words and a button — the cause is never the user's
 * business, and there is no auto-retry loop once this is showing: the user
 * decides when to re-hit the backend while Discord is down.
 *
 * The default "Try again" runs `router.refresh()`, which is enough for the
 * guild-LIST path. The guild-DETAIL path passes `onRetry` + `isPending`: there
 * the latched error boundary must also reset to re-consume the fresh promise, so
 * the boundary orchestrator owns the retry and drives this button.
 */
export function GuildErrorCard({
  title = 'Temporary issue',
  description,
  onRetry,
  isPending: isPendingProp,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  isPending?: boolean;
}) {
  const router = useRouter();
  const [isPendingInternal, startTransition] = useTransition();
  const isPending = isPendingProp ?? isPendingInternal;

  return (
    <div className="max-w-110 space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="font-semibold text-sm text-white">{title}</p>
      {description && <p className="text-xs leading-relaxed text-slate-400">{description}</p>}
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => (onRetry ? onRetry() : startTransition(() => router.refresh()))}
      >
        Try again
      </Button>
    </div>
  );
}
