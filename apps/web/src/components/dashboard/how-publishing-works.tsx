'use client';

import { Copy } from '@ap/copy';
import { Info } from 'lucide-react';
import { usePublishDelayEntitled } from '@/components/dashboard/publish-delay-note';

/**
 * The three ambient facts that close both the Overview and Channels tabs — same
 * component, same "has any announcement channel" guard, so the two tabs can
 * never state them differently. The enable guide repeats the last two where they
 * are decision-relevant.
 */
export function HowPublishingWorks({ hasSubscription }: { hasSubscription: boolean }) {
  const entitled = usePublishDelayEntitled(hasSubscription);

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-sm text-slate-400">
        <Info className="size-4 shrink-0 text-slate-500" />
        Disclaimer
      </h2>
      <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-500">
        <p>{Copy.publishing.rateLimit}</p>
        <p>{Copy.publishing.delay(entitled)}</p>
      </div>
    </section>
  );
}
