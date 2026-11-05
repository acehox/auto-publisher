'use client';

import { Copy } from '@ap/copy';
import { Zap } from 'lucide-react';
import { useOverLimitState } from '@/components/dashboard/use-over-limit-state';

/**
 * Footer form of the short copy. The Zap is Premium's one mark across the
 * product, so it rides only the line where Rollover is on — on the other two it
 * would decorate something not in effect.
 */
export function OverLimitFooter() {
  const state = useOverLimitState();
  return (
    <span className="flex items-center gap-1.5">
      {state === 'on' && <Zap className="size-3.5 shrink-0" />}
      {Copy.publishing.overLimit.short(state)}
    </span>
  );
}
