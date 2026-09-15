import type { ReactNode } from 'react';

/**
 * Tab header: title on the left, one optional fact on the right. The right slot
 * carries only what the shell cannot say — the Channels tab's plan cap — because
 * the plan name already lives in the server switcher.
 */
export function PageHeader({
  title,
  meta,
  aside,
}: {
  title: string;
  meta?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-45 flex-1">
        <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h1>
        {meta && <p className="mt-1 text-xs text-slate-500">{meta}</p>}
      </div>
      {aside && <div className="pt-1.5 font-mono text-xs text-slate-400">{aside}</div>}
    </div>
  );
}
