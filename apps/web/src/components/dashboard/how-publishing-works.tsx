'use client';

import { Info } from 'lucide-react';
import {
  publishDelayCopy,
  usePublishDelayEntitled,
} from '@/components/dashboard/publish-delay-note';

/**
 * The three ambient facts, always on screen, in the one place that can act on
 * them. They appear exactly twice in the product — here and inside the enable
 * guide, where they are decision-relevant — and nowhere on Overview.
 */
export function HowPublishingWorks({ hasSubscription }: { hasSubscription: boolean }) {
  const entitled = usePublishDelayEntitled(hasSubscription);

  return (
    <section className="rounded-xl border border-slate-800/80 px-3.5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm text-slate-300">
        <Info className="size-4 shrink-0 text-slate-500" />
        How publishing works
      </h2>
      <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-400">
        <p>Only channels set as Announcement channels in Discord can publish here.</p>
        <p>
          Discord publishes at most 10 messages per hour, per channel. We can&apos;t raise that
          limit.
        </p>
        <p>{publishDelayCopy(entitled)}</p>
      </div>
    </section>
  );
}
