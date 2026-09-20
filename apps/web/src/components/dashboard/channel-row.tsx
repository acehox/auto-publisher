import { CircleCheck, CirclePause, EyeOff, Filter } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CHIP_CLASS } from '@/components/dashboard/chip';
import { StatusDot, type Tone } from '@/components/dashboard/notice-strip';
import { channelLabel, cn } from '@/lib/utils';

/**
 * One channel line. Rows never carry their own border or fill — they are
 * hairline-divided children of a card (the Overview status card, a Channels
 * group), which is why both tabs read as one list rather than a stack of tiles.
 * Severity is a bare dot rather than an icon — a list of identical megaphones
 * states nothing a row doesn't already say. The status label marks a serving row
 * on both tabs; a broken one carries the Fix control instead, which names the
 * state and acts on it, so neither tab states one failure twice.
 *
 * `name` is the bare channel name; the row applies the `#` itself. Null means
 * Discord no longer returns the channel (`GuildChannel.name`) — nothing to prefix.
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
  name: string | null;
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
        <p className="flex items-center gap-1.5 text-sm text-slate-100">
          {name === null && <EyeOff aria-hidden className="size-3.5 shrink-0 text-slate-400" />}
          <span className="truncate">{channelLabel(name)}</span>
        </p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
      {pill}
      {status}
      {actions}
    </div>
  );
}

const STATUS = {
  publishing: { label: 'Publishing', icon: CircleCheck, className: 'text-green-500/90' },
  paused: { label: 'Paused', icon: CirclePause, className: 'text-yellow-400/90' },
} as const;

/**
 * Right-hand publishing state. The icon is opt-in: on Overview the label sits in
 * a card whose own icon already carries severity, so a second one is noise.
 */
export function ChannelStatusLabel({ kind, icon }: { kind: keyof typeof STATUS; icon?: boolean }) {
  const { label, icon: Icon, className } = STATUS[kind];
  return (
    <span className={cn('flex shrink-0 items-center gap-1.5 text-xs', className)}>
      {icon && <Icon aria-hidden className="size-3.5" />}
      {label}
    </span>
  );
}

/**
 * Filter count as a compact chip — icon plus number, because the word "filters"
 * only repeats what the icon says. Channels only, and always a link: Overview
 * never carries a control, so it keeps its own read-only pill.
 */
export function ChannelFilterPill({
  count,
  href,
  name,
}: {
  count: number;
  href: string;
  /** Bare channel name, for the link's accessible label. */
  name: string | null;
}) {
  return (
    <Link
      href={href}
      aria-label={`Edit ${count} filter${count !== 1 ? 's' : ''} for ${channelLabel(name)}`}
      className={cn(CHIP_CLASS, 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80')}
    >
      <Filter aria-hidden className="size-3 text-slate-400" />
      {count}
    </Link>
  );
}
