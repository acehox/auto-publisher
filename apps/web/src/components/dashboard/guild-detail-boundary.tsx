'use client';

import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { AuthRedirect } from '@/components/auth/auth-redirect';
import { BotAbsentCard } from './bot-absent-card';
import { ErrorBoundary, RedirectTo } from './error-redirect-boundary';
import { GuildErrorCard } from './guild-error-card';
import { TabContentSkeleton } from './skeletons';

// Silent auto-retry for a TRANSIENT guild-detail failure (proxy 504 / Discord
// 5xx / connection blip) before surfacing the manual retry card. Most blips
// outlast the backend's built-in @discordjs/rest retries by only a beat, so a
// couple of paced client retries recover them invisibly — the user never sees
// the error card for a momentary hiccup (ADR 0010). Bounded + manual-after: a
// persistent outage can't spin an unbounded refresh loop.
const MAX_AUTO_RETRIES = 3;
const BACKOFF_MS = [500, 1500, 3000, 5000];

interface GuildDetailBoundaryProps {
  guildId: string;
  children: ReactNode;
}

/**
 * Wraps the guild-detail region with recovery. The detail payload is a streamed
 * promise consumed via useGuild(); a transient failure throws a
 * TransientErrorSignal at the child, caught here. Key this by guildId (in the
 * shell) so the whole orchestrator — retry budget + timers — resets on a guild
 * switch. On a transient failure it silently auto-retries (skeleton shown) up to
 * MAX_AUTO_RETRIES, then falls back to the manual GuildErrorCard. Auth-expiry,
 * botless-guild and unavailable-guild failures are NOT retried — they route
 * straight to re-login / the invite card / the server list.
 */
export function GuildDetailBoundary({ guildId, children }: GuildDetailBoundaryProps) {
  const router = useRouter();
  // Bumped after each router.refresh() settles, to clear the latched boundary so
  // it re-consumes the freshly-streamed server promise (a class error boundary
  // never self-resets).
  const [resetKey, setResetKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [isPending, startTransition] = useTransition();
  const wasPending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When a scheduled refresh settles (pending true -> false), the new detail
  // promise is now in context; clear the boundary so children re-render and
  // re-read it. Tying the reset to the transition (not a fixed delay) means we
  // never re-read the stale, already-rejected promise.
  useEffect(() => {
    if (wasPending.current && !isPending) {
      setResetKey(key => key + 1);
    }
    wasPending.current = isPending;
  }, [isPending]);

  // Clear a pending backoff timer if the region unmounts mid-wait.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const retry = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  // Called by the transient fallback when it mounts (an error was just caught).
  // Schedules a paced auto-retry while budget remains; returns whether one was
  // scheduled so the fallback shows the skeleton (retrying) vs the manual card
  // (exhausted).
  const scheduleAutoRetry = useCallback((): boolean => {
    if (attempt >= MAX_AUTO_RETRIES) return false;
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    timer.current = setTimeout(() => {
      setAttempt(a => a + 1);
      retry();
    }, delay);
    return true;
  }, [attempt, retry]);

  return (
    <ErrorBoundary
      resetKeys={[resetKey]}
      fallback={
        <RedirectTo path="/dashboard">
          <TabContentSkeleton />
        </RedirectTo>
      }
      authFallback={<AuthRedirect callbackUrl={`/dashboard/${guildId}`} />}
      botAbsentFallback={<BotAbsentCard guildId={guildId} />}
      transientFallback={
        <TransientFallback
          canAutoRetry={attempt < MAX_AUTO_RETRIES}
          scheduleAutoRetry={scheduleAutoRetry}
          onManualRetry={retry}
          retryPending={isPending}
        />
      }
    >
      <Suspense fallback={<TabContentSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * Rendered by the boundary on a transient failure. Remounts on every boundary
 * reset (once per attempt), so a fresh auto-retry is scheduled per cycle. While
 * an auto-retry is pending it shows the ordinary loading skeleton (silent
 * recovery); once the budget is exhausted it shows the manual retry card.
 */
function TransientFallback({
  canAutoRetry,
  scheduleAutoRetry,
  onManualRetry,
  retryPending,
}: {
  canAutoRetry: boolean;
  scheduleAutoRetry: () => boolean;
  onManualRetry: () => void;
  retryPending: boolean;
}) {
  // Seed from canAutoRetry so the skeleton paints immediately when a retry is
  // about to be scheduled — no flash of the error card between attempts.
  const [retrying, setRetrying] = useState(canAutoRetry);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — this component remounts per boundary reset, so one schedule runs per attempt.
  useEffect(() => {
    setRetrying(scheduleAutoRetry());
  }, []);

  if (retrying) return <TabContentSkeleton />;
  return <GuildErrorCard onRetry={onManualRetry} isPending={retryPending} />;
}
