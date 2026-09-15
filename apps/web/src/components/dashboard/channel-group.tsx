import type { ReactNode } from 'react';

/**
 * One group on the Channels tab, shaped like the Overview status card: a header
 * strip, then hairline-divided rows inside a single bordered surface. Separate
 * bordered tiles per row read as a list of cards; this reads as a list.
 */
export function ChannelGroup({
  label,
  count,
  meta,
  children,
}: {
  label: string;
  count?: number;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-baseline gap-2 px-4 py-3.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
        {count !== undefined && (
          <span className="text-[11px] text-slate-500">&middot; {count}</span>
        )}
        {meta && <span className="ml-auto text-xs text-slate-500">{meta}</span>}
      </div>
      {children}
    </section>
  );
}
