'use client';

import { Copy } from '@ap/copy';
import { Info } from 'lucide-react';
import { useRolloverEntitled } from '@/components/dashboard/over-limit-note';

/**
 * The ambient publishing fact that closes both the Overview and Channels tabs —
 * same component, same "has any announcement channel" guard, so the two tabs can
 * never state it differently. The enable guide repeats it where it is
 * decision-relevant.
 */
export function HowPublishingWorks({ hasSubscription }: { hasSubscription: boolean }) {
  const entitled = useRolloverEntitled(hasSubscription);

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-sm text-slate-400">
        <Info className="size-4 shrink-0 text-slate-500" />
        Disclaimer
      </h2>
      <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
        {Copy.publishing.overLimit.body(entitled)}
      </p>
    </section>
  );
}
