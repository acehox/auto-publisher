import { Copy, type FilterField, type MatchMode } from '@ap/copy';
import { cn } from '@/lib/utils';

export interface FilterRuleCondition {
  field: FilterField;
  negate: boolean;
  values: readonly string[];
}

/** A read-only rule worded with the editor's own vocabulary (`Copy.filters`), so marketing copy cannot drift from it. */
export function FilterRule({
  conditions,
  matchMode = Copy.filters.matchModes.default,
  className,
}: {
  conditions: readonly FilterRuleCondition[];
  matchMode?: MatchMode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-slate-800 bg-slate-950/60 p-3.5', className)}>
      <p className="text-xs text-slate-400">
        {conditions.length === 1 ? (
          Copy.filters.rule.single
        ) : (
          <>
            {Copy.filters.rule.lead}{' '}
            <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-semibold text-blue-300">
              {Copy.filters.matchModes.labels[matchMode]}
            </span>{' '}
            {Copy.filters.rule.tail}
          </>
        )}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {conditions.map(condition => (
          <li
            key={`${condition.field}-${condition.negate}-${condition.values.join()}`}
            className="flex flex-wrap items-center gap-1.5 text-[13px]"
          >
            <span className="font-medium text-slate-200">
              {Copy.filters.fields.labels[condition.field]}
            </span>
            <span className="text-slate-400">
              {Copy.filters.operators.label(condition.field, condition.negate)}
            </span>
            {condition.values.map(value => (
              <span
                key={value}
                className="rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[12px] text-slate-200"
              >
                {value}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
