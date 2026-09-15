import { Check, Minus, Zap } from 'lucide-react';
import { type PlanValue, planComparison } from '@/lib/plans';

interface PlanComparisonTableProps {
  className?: string;
  freeChannelLimit: number;
  /**
   * Dashboard variant: tighter rows, left-aligned values and no per-row detail
   * line. It sits inside the upgrade card immediately above the legal block,
   * where it is the justification read just before paying — not a marketing
   * table, which is what the full variant still is on /premium.
   */
  compact?: boolean;
}

/**
 * The row-aligned free-vs-premium comparison, shared verbatim by the marketing
 * section and the dashboard's free subscription state — the two surfaces used to
 * hold independent flat lists that could (and did) disagree in length, order and
 * wording. Rows come from `planComparison`; callers own the surrounding chrome
 * (card, section heading, CTA) and nothing else.
 *
 * A real <table> rather than a grid of divs: the value cells are ticks and
 * dashes, which only mean something in relation to their row and column, and
 * scope="row"/"col" is what makes a screen reader announce that relation.
 *
 * No "current plan" marker on a column: the dashboard card that hosts this is
 * already titled "You're on the Free plan", and a stacked CURRENT caption under
 * the Free header read as a third column header while knocking the three headers
 * out of vertical alignment. The surrounding surface says which plan is yours;
 * the table only has to say what the plans are.
 */
export function PlanComparisonTable({
  className,
  freeChannelLimit,
  compact = false,
}: PlanComparisonTableProps) {
  const align = compact ? 'text-left' : 'text-center';
  return (
    <table
      className={`w-full border-collapse text-left ${compact ? 'overflow-hidden rounded-lg border border-slate-800' : ''} ${className ?? ''}`}
    >
      <thead>
        <tr className={compact ? 'bg-slate-800/30' : 'border-b border-slate-800'}>
          <th
            scope="col"
            className={`text-xs font-normal uppercase tracking-wide text-slate-500 ${compact ? 'w-2/5 px-3 py-2' : 'pb-2'}`}
          >
            {compact ? <span className="sr-only">Feature</span> : 'Feature'}
          </th>
          <th
            scope="col"
            className={`text-xs font-normal text-slate-400 ${compact ? 'px-3 py-2 text-left uppercase tracking-wide' : 'w-18 pb-2 text-center'}`}
          >
            Free
          </th>
          <th
            scope="col"
            className={`text-xs font-normal text-blue-300 ${compact ? 'px-3 py-2 text-left uppercase tracking-wide' : 'w-24 pb-2 text-center'}`}
          >
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3" aria-hidden="true" />
              Premium
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {planComparison(freeChannelLimit).map(row => (
          <tr
            key={row.label}
            className={`align-top ${compact ? 'border-t border-slate-800/60' : 'border-b border-slate-800/60 last:border-0'}`}
          >
            <th scope="row" className={`font-normal ${compact ? 'px-3 py-2.5' : 'py-3 pr-3'}`}>
              <span className="block text-xs text-slate-300 sm:text-sm">{row.label}</span>
              {!compact && row.detail && (
                <span className="mt-0.5 block text-xs text-slate-500">{row.detail}</span>
              )}
            </th>
            <td className={`${align} ${compact ? 'px-3 py-2.5' : 'py-3'}`}>
              <PlanValueCell value={row.free} compact={compact} />
            </td>
            <td className={`${align} ${compact ? 'px-3 py-2.5' : 'py-3'}`}>
              <PlanValueCell value={row.premium} premium compact={compact} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Icons carry sr-only text so a dash isn't announced as an empty cell. */
function PlanValueCell({
  value,
  premium,
  compact,
}: {
  value: PlanValue;
  premium?: boolean;
  compact?: boolean;
}) {
  const center = compact ? '' : 'mx-auto ';
  if (value === false) {
    return (
      <>
        <Minus className={`${center}h-4 w-4 text-slate-600`} aria-hidden="true" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  if (value === true) {
    return (
      <>
        <Check
          className={`${center}h-4 w-4 ${premium ? 'text-blue-400' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="sr-only">Included</span>
      </>
    );
  }
  return (
    <span className={`text-xs sm:text-sm ${premium ? 'text-blue-200' : 'text-slate-400'}`}>
      {value}
    </span>
  );
}
