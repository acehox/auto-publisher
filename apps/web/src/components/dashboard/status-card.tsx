import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { TONE_ICON, type Tone } from '@/components/dashboard/notice-strip';
import { cn } from '@/lib/utils';

const TOP: Record<Tone, string> = {
  blue: 'border-t-blue-400',
  green: 'border-t-green-400',
  amber: 'border-t-amber-400',
  yellow: 'border-t-yellow-400',
  red: 'border-t-red-400',
  slate: 'border-t-slate-600',
};

const HEADLINE: Record<Tone, string> = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  amber: 'text-amber-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  slate: 'text-slate-300',
};

/**
 * The Overview's single surface: it IS the alert. Severity rides the top edge,
 * the headline icon and the headline itself, and the offending channel sits in
 * the same card with its Fix control — one card instead of a coloured banner
 * plus a list restating it. That is why there is no banner stack (see
 * `guild-notices.tsx` for what survived).
 */
export function StatusCard({
  tone,
  headline,
  sub,
  action,
  icon: Icon = TONE_ICON[tone],
  children,
}: {
  tone: Tone;
  headline: string;
  sub?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-slate-800 border-t-2 bg-slate-900/40',
        TOP[tone]
      )}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <Icon className={cn('size-5.5 shrink-0', HEADLINE[tone])} />
        <div className="min-w-47 flex-1">
          <h2 className={cn('text-base font-semibold', HEADLINE[tone])}>{headline}</h2>
          {sub && <p className="mt-1 text-xs leading-snug text-slate-400">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
