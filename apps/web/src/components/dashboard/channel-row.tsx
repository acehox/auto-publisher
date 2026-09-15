import type { ReactNode } from 'react';
import { StatusDot, type Tone } from '@/components/dashboard/notice-strip';
import { channelLabel, cn } from '@/lib/utils';

/**
 * One channel line. Rows never carry their own border or fill — they are
 * hairline-divided children of a card (the Overview status card, a Channels
 * group), which is why both tabs read as one list rather than a stack of tiles.
 * Severity is a bare dot rather than an icon — a list of identical megaphones
 * states nothing a row doesn't already say. The status label is added only where
 * nothing else on the row states it (Channels rows carry a toggle, which does).
 *
 * `name` is the bare channel name; the row applies the `#` itself.
 */
export function ChannelRow({
  name,
  tone = 'slate',
  status,
  sub,
  pill,
  actions,
  muted,
}: {
  name: string;
  /** Colours the dot. */
  tone?: Tone;
  status?: ReactNode;
  sub?: ReactNode;
  pill?: ReactNode;
  actions?: ReactNode;
  /** Dimmed until hovered — an off channel is still readable on purpose. */
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-slate-800/70 border-t px-4 py-3',
        muted && 'opacity-60 transition-opacity hover:opacity-100'
      )}
    >
      <StatusDot tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-100">{channelLabel(name)}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
      {pill}
      {status}
      {actions}
    </div>
  );
}

const STATUS = {
  publishing: { label: 'Publishing', className: 'text-green-500/90' },
  blocked: { label: 'Not publishing', className: 'text-red-400' },
  paused: { label: 'Paused', className: 'text-yellow-400/90' },
} as const;

/** Right-hand publishing state, for rows that carry no control of their own. */
export function ChannelStatusLabel({ kind }: { kind: keyof typeof STATUS }) {
  const { label, className } = STATUS[kind];
  return <span className={cn('shrink-0 text-xs', className)}>{label}</span>;
}
