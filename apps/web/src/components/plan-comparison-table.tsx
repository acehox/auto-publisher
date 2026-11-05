import { Check, InfinityIcon, X, Zap } from 'lucide-react';
import { type PlanValue, planComparison } from '@/lib/plans';

interface PlanComparisonTableProps {
  className?: string;
  freeChannelLimit: number;
  /** Shown in the feature column's header; without it that header is screen-reader only. */
  title?: string;
  /**
   * Dashboard variant: the same table at a smaller scale, for the upgrade card, where
   * it is the justification read just before paying. Its surfaces are a step lighter
   * because it sits on a slate-900 card, the colour the full variant's Premium column uses.
   */
  compact?: boolean;
}

const SCALES = {
  full: {
    header: 'pt-8 pb-6 text-base sm:text-xl',
    freeWidth: 'w-18 sm:w-40',
    premiumWidth: 'w-28 sm:w-56',
    zap: 'size-4 sm:size-5',
    cell: 'py-4',
    feature: 'pr-3 pl-4 sm:pl-6',
    label: 'text-sm sm:text-base',
    detail: 'mt-1 text-xs sm:text-sm',
    column: 'bg-slate-900',
    stripe: 'bg-slate-900/50',
    top: 'rounded-t-2xl',
    bottom: 'rounded-b-2xl',
    icon: 'size-5',
    number: 'text-base',
  },
  compact: {
    header: 'pt-4 pb-3 text-sm',
    freeWidth: 'w-18 sm:w-28',
    premiumWidth: 'w-22 sm:w-36',
    zap: 'size-3.5',
    cell: 'py-3',
    feature: 'pr-3 pl-3 sm:pl-4',
    label: 'text-sm',
    detail: 'mt-0.5 text-xs',
    column: 'bg-slate-800/60',
    stripe: 'bg-slate-800/25',
    top: 'rounded-t-lg',
    bottom: 'rounded-b-lg',
    icon: 'size-4',
    number: 'text-sm',
  },
} as const;

type Scale = (typeof SCALES)[keyof typeof SCALES];

/**
 * The row-aligned free-vs-premium comparison, shared verbatim by the marketing
 * section and the dashboard's free subscription state — the two surfaces used to
 * hold independent flat lists that could (and did) disagree in length, order and
 * wording. Rows come from `planComparison`; callers own the surrounding chrome
 * (card, section heading, CTA) and nothing else.
 *
 * A real <table> rather than a grid of divs: the value cells are icons, which only
 * mean something in relation to their row and column, and scope="row"/"col" is
 * what makes a screen reader announce that relation.
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
  title,
  compact = false,
}: PlanComparisonTableProps) {
  const rows = planComparison(freeChannelLimit);
  const scale = compact ? SCALES.compact : SCALES.full;

  // Separate borders so the Premium column can round its ends; the column is one
  // panel built from its cells' shared background.
  return (
    <table className={`w-full border-separate border-spacing-0 text-left ${className ?? ''}`}>
      <thead>
        <tr>
          <th
            scope="col"
            className={`border-b border-slate-800 font-bold uppercase tracking-wide text-white ${scale.header}`}
          >
            {title ?? <span className="sr-only">Feature</span>}
          </th>
          <th
            scope="col"
            className={`border-b border-slate-800 text-center font-semibold text-white ${scale.header} ${scale.freeWidth}`}
          >
            Free
          </th>
          <th
            scope="col"
            className={`border-b border-slate-800 text-center font-semibold text-white ${scale.header} ${scale.premiumWidth} ${scale.column} ${scale.top}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Zap className={`fill-yellow-500 text-yellow-500 ${scale.zap}`} aria-hidden="true" />
              Premium
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const stripe = index % 2 === 1 ? scale.stripe : '';
          const last = index === rows.length - 1;
          return (
            <tr key={row.label}>
              <th scope="row" className={`font-normal ${scale.cell} ${scale.feature} ${stripe}`}>
                <span className={`block text-slate-300 ${scale.label}`}>{row.label}</span>
                {row.detail && (
                  <span className={`block text-slate-500 ${scale.detail}`}>{row.detail}</span>
                )}
              </th>
              <td className={`text-center align-middle ${scale.cell} ${stripe}`}>
                <PlanValueCell value={row.free} scale={scale} compact={compact} />
              </td>
              <td
                className={`text-center align-middle ${scale.cell} ${scale.column} ${last ? scale.bottom : ''}`}
              >
                <PlanValueCell value={row.premium} scale={scale} compact={compact} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Icons carry sr-only text so a cell is never announced empty. */
function PlanValueCell({
  value,
  scale,
  compact,
}: {
  value: PlanValue;
  scale: Scale;
  compact: boolean;
}) {
  const icon = `mx-auto ${scale.icon}`;
  if (typeof value === 'number') {
    // The dashboard column is narrow enough that "Up to" must not wrap.
    return (
      <span className={`whitespace-nowrap font-medium text-white ${scale.number}`}>
        {compact ? `Up to ${value}` : value}
      </span>
    );
  }
  if (value === false) {
    return (
      <>
        <X className={`${icon} text-rose-400`} aria-hidden="true" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  if (value === 'unlimited') {
    return (
      <>
        <InfinityIcon className={`${icon} text-green-400`} aria-hidden="true" />
        <span className="sr-only">Unlimited</span>
      </>
    );
  }
  return (
    <>
      <Check className={`${icon} text-green-400`} aria-hidden="true" />
      <span className="sr-only">Included</span>
    </>
  );
}
