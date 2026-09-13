'use client';

import { Clock } from 'lucide-react';
import { useIsPublicInstance } from '@/components/site-config-context';

/**
 * Copy explaining that publishing may be delayed. Free callers get the delay
 * note plus a soft Premium upsell; entitled callers get the priority message.
 * Neither promises delivery: the proxy gate drops on Discord's 10/hour/channel
 * sublimit. Mirrors `notes.publishDelay*` in the bot.
 *
 * Says "priority", not "dedicated capacity": there is one publishing queue and
 * Premium is a tier within it (ADR 0011). čl. 60 st. 2 makes this a contract
 * term, so it has to describe what actually runs.
 *
 * `hasSubscription` is the whole of the condition — an entitled guild is served
 * at Premium priority the moment the webhook lands.
 */
export function publishDelayCopy(hasSubscription: boolean): string {
  return hasSubscription
    ? "Your messages are published at Premium priority — they go ahead of the free queue whenever there's a backlog."
    : "Messages may be delayed during busy periods to respect Discord's rate limits. Upgrade to Premium and your messages move to the front of the queue.";
}

/**
 * Which copy this deployment shows. A self-hosted instance has no billing and
 * no free tier to be queued behind, so it always reads as entitled — otherwise
 * the note would upsell a plan that doesn't exist.
 */
export function usePublishDelayEntitled(hasSubscription: boolean): boolean {
  const isPublicInstance = useIsPublicInstance();
  return hasSubscription || !isPublicInstance;
}

/**
 * Ambient delay note. Mirrors PublishLimitNote's markup so the two read as a
 * pair on the Channels tab and Overview.
 */
export function PublishDelayNote({ hasSubscription }: { hasSubscription: boolean }) {
  const entitled = usePublishDelayEntitled(hasSubscription);
  return (
    <p className="flex items-center gap-2 text-slate-500 text-sm">
      <Clock className="w-4 h-4 shrink-0" />
      {publishDelayCopy(entitled)}
    </p>
  );
}
