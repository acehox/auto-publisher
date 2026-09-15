import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Dashed-outline empty state. The CTA is optional on purpose: "no announcement
 * channels exist" has no button, because the fix is in Discord and a button
 * that only explains is worse than a sentence that does.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-slate-700/60 border-dashed px-5 py-7 text-center">
      <Icon className="size-6 text-slate-600" />
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="max-w-90 text-xs leading-relaxed text-slate-400">{children}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
