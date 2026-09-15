import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TONE_ICON, type Tone } from '@/components/dashboard/notice-strip';
import { cn } from '@/lib/utils';

const HEADLINE: Record<Tone, string> = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  amber: 'text-amber-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  slate: 'text-slate-300',
};

/**
 * The Overview's channel surface. Severity is carried by the tone-coloured
 * icon and `headline` only — the card has no coloured top edge, because the
 * misconfigured banner above it (`guild-notices.tsx`) already states the
 * problem in full and two red edges on one screen read as two problems.
 *
 * The header is two-part on purpose: `title` names the surface in white and
 * never changes, `headline` carries the severity in the tone colour. Both sit at
 * the rows' own `text-sm` — weight and colour separate them, not size, so the
 * header reads as the list's first line rather than a title bar. A card whose
 * whole heading recoloured read as a different card every time the state
 * flipped.
 */
export function StatusCard({
  tone,
  title,
  headline,
  sub,
  action,
  footer,
  icon: Icon = TONE_ICON[tone],
  children,
}: {
  tone: Tone;
  /** Constant white label for the surface, e.g. "Channels". */
  title: string;
  /** Severity line, tone-coloured and set beside the title. */
  headline: string;
  sub?: ReactNode;
  /** Header-right navigation, e.g. the Manage link. */
  action?: ReactNode;
  /** Muted closing line; carries no control. */
  footer?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-4">
        <Icon className={cn('size-4 shrink-0', HEADLINE[tone])} />
        <div className="flex min-w-47 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="font-semibold text-sm text-white">{title}</h2>
          <p className={cn('text-sm', HEADLINE[tone])}>{headline}</p>
        </div>
        {action}
        {sub && <p className="w-full text-xs leading-snug text-slate-400">{sub}</p>}
      </div>
      {children}
      {footer && (
        <div className="border-slate-800/70 border-t bg-slate-950/25 px-4 py-3 text-xs text-slate-500">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Header-right link out of a read-only card into the tab that can act. */
export function StatusCardAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 whitespace-nowrap font-medium text-blue-400 text-xs transition-colors hover:text-blue-300"
    >
      {children} <span aria-hidden>&rarr;</span>
    </Link>
  );
}
