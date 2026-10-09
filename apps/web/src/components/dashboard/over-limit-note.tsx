'use client';

import { Copy } from '@ap/copy';
import { Zap } from 'lucide-react';
import { useIsPublicInstance } from '@/components/site-config-context';

/**
 * Footer form of the short copy. The Zap is Premium's one mark across the
 * product (it replaced the crown), so it rides only the entitled line — on the
 * free line it would decorate the thing being upsold.
 */
export function OverLimitFooter({ hasSubscription }: { hasSubscription: boolean }) {
  const entitled = useRolloverEntitled(hasSubscription);
  return (
    <span className="flex items-center gap-1.5">
      {entitled && <Zap className="size-3.5 shrink-0" />}
      {Copy.publishing.overLimit.short(entitled)}
    </span>
  );
}

/**
 * Whether messages beyond Discord's hourly limit are published later. A
 * self-hosted instance has no billing, so every guild gets it — otherwise the
 * note would upsell a plan that doesn't exist.
 */
export function useRolloverEntitled(hasSubscription: boolean): boolean {
  const isPublicInstance = useIsPublicInstance();
  return hasSubscription || !isPublicInstance;
}
