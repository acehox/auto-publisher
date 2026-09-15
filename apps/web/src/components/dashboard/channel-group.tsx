import type { ReactNode } from 'react';

/**
 * Group heading for the Channels tab: a label, a hairline, and an optional
 * note. No count — the rows underneath already are the count.
 */
export function ChannelGroup({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
        <span className="h-px flex-1 bg-slate-800" />
        {meta && <span className="text-xs text-slate-500">{meta}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
