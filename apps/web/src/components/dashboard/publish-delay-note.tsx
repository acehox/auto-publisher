'use client';

import { Copy } from '@ap/copy';
import { Zap } from 'lucide-react';
import { useIsPublicInstance } from '@/components/site-config-context';

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
      {Copy.publishing.delayShort(entitled)}
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
