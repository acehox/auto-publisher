'use client';

import { Clock, Zap } from 'lucide-react';
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
    ? 'Your messages are published at Premium priority. They go ahead of the free queue during busy periods.'
    : "Messages may be delayed during busy periods to respect Discord's rate limits. Upgrade to Premium to prioritize your messages.";
}

/**
 * The same fact compressed to one line, for the Overview card's footer where it
 * sits under a channel list rather than in a prose block. Same `entitled`
 * predicate as the long form, so the two can never disagree.
 */
export function publishDelayShortCopy(entitled: boolean): string {
  return entitled
    ? 'Messages are published at priority.'
    : 'Messages may be delayed. Upgrade to prioritize your messages.';
}

/**
 * Footer form of the short copy. The Zap is Premium's one mark across the
 * product (it replaced the crown), so it rides only the entitled line — on the
 * free line it would decorate the thing being upsold.
 */
export function PublishDelayFooter({ hasSubscription }: { hasSubscription: boolean }) {
  const entitled = usePublishDelayEntitled(hasSubscription);
  return (
    <span className="flex items-center gap-1.5">
      {entitled && <Zap className="size-3.5 shrink-0" />}
      {publishDelayShortCopy(entitled)}
    </span>
  );
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
