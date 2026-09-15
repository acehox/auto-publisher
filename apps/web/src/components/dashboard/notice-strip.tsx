'use client';

import { CircleCheck, CirclePause, Info, type LucideIcon, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Severity accent, carried on a strip's left edge, icon and text. */
export type Tone = 'blue' | 'green' | 'amber' | 'yellow' | 'red' | 'slate';

const EDGE: Record<Tone, string> = {
  blue: 'border-l-blue-400',
  green: 'border-l-green-400',
  amber: 'border-l-amber-400',
  yellow: 'border-l-yellow-400',
  red: 'border-l-red-400',
  slate: 'border-l-slate-600',
};

export const TONE_TEXT: Record<Tone, string> = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  amber: 'text-amber-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  slate: 'text-slate-400',
};

const DOT: Record<Tone, string> = {
  blue: 'bg-blue-400',
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
  slate: 'bg-slate-600',
};

/** Severity as a bare dot, for list rows where an icon would be noise. */
export function StatusDot({ tone = 'slate', className }: { tone?: Tone; className?: string }) {
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[tone], className)} />;
}

/** Default severity icon per tone; any strip or card may override it. */
export const TONE_ICON: Record<Tone, LucideIcon> = {
  blue: Info,
  green: CircleCheck,
  amber: TriangleAlert,
  yellow: CirclePause,
  red: TriangleAlert,
  slate: Info,
};

/**
 * One-line carrier for anything that is NOT about a channel: checkout
 * activation, legacy mode, paused-over-limit, billing blockers. A severity icon,
 * a sentence, and one or two text links — no heading, no paragraph. Channel
 * problems ride the Overview status card instead, so one problem never raises
 * two surfaces.
 */
export function NoticeStrip({
  tone,
  children,
  actions,
  onDismiss,
  icon: Icon = TONE_ICON[tone],
  spin,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  icon?: LucideIcon;
  spin?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border border-slate-800 border-l-2 bg-slate-900/50 px-3.5 py-3',
        EDGE[tone],
        className
      )}
    >
      <Icon className={cn('size-4 shrink-0', TONE_TEXT[tone], spin && 'animate-spin')} />
      <p className="min-w-42 flex-1 text-sm leading-snug text-slate-200">{children}</p>
      {(actions || onDismiss) && (
        <div className="flex items-center gap-4">
          {actions}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="cursor-pointer text-slate-500 transition-colors hover:text-slate-300"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Primary text link inside a strip. */
export function NoticeAction({
  children,
  onClick,
  href,
  muted,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  muted?: boolean;
}) {
  const className = cn(
    'cursor-pointer whitespace-nowrap text-xs transition-colors',
    muted ? 'text-slate-400 hover:text-slate-200' : 'font-medium text-blue-400 hover:text-blue-300'
  );
  if (href) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
