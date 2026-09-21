import { Copy, type OperatorOption } from '@ap/copy';
import type { SegmentedOption } from '@/components/ui/segmented-control';
import type { FilterMatchMode, FilterType } from '@/lib/api/types';

export type { OperatorOption };

/** The `@ap/copy` labels reshaped into the pairs the picker iterates. */
export const OPERATOR_OPTIONS: Record<FilterType, [OperatorOption, OperatorOption]> =
  Object.fromEntries(
    (Object.keys(Copy.filters.operators.labels) as FilterType[]).map(type => [
      type,
      [
        { negate: false, label: Copy.filters.operators.labels[type].positive },
        { negate: true, label: Copy.filters.operators.labels[type].negative },
      ],
    ])
  ) as Record<FilterType, [OperatorOption, OperatorOption]>;

/** Mirror of the backend refine: a keyword that is empty or only `*` is a no-op. */
export function isNoOpKeyword(value: string): boolean {
  const collapsed = value.trim().replace(/\*+/g, '*');
  return collapsed.length === 0 || collapsed === '*';
}

/**
 * Per-type value caps. Hand-mirrors `MAX_VALUES` in `@ap/validations`, which is the
 * authority — keep the two in step.
 *
 * Not imported, even though `@ap/validations` is reachable through `@ap/api-types`:
 * that route carries *types* only (`export type`), which erase at compile time. This
 * is a runtime value, and the rule editor is a client component, so importing it
 * would evaluate the validations module — whose top level builds zod schemas — and
 * drag zod into the browser bundle for four integers.
 *
 * Uniform at 25 today (Discord's `max_values` ceiling for the selects the bot's
 * mention/author pickers use); kept per-type so one can be tuned later.
 */
export const MAX_VALUES: Record<FilterType, number> = {
  keyword: 25,
  mention: 25,
  author: 25,
  webhook: 25,
};

/** All = every condition must hold (default), Any = at least one. */
export const MATCH_MODE_OPTIONS: SegmentedOption<FilterMatchMode>[] = (['all', 'any'] as const).map(
  value => ({ value, label: Copy.filters.matchModes.labels[value] })
);

/** Discord snowflake: 17-20 digits. */
export const SNOWFLAKE_REGEX = /^\d{17,20}$/;

/**
 * Per-type value check, shared by the chip inputs (flag invalid chips in red) and
 * the rule editor (drop flagged values from the save payload). Invalid values are
 * never discarded on entry — the user gets to fix them.
 */
export function filterValueError(type: FilterType, value: string): string | null {
  if (type === 'keyword') {
    if (value.length > 200) return Copy.filters.errors.keywordTooLong;
    return isNoOpKeyword(value) ? Copy.filters.errors.keywordEmpty : null;
  }
  if (SNOWFLAKE_REGEX.test(value)) return null;
  return type === 'webhook' ? Copy.filters.errors.webhookId : Copy.filters.errors.userId;
}

/** Discord role color int → CSS hex; 0 means "no color" (default). */
export function roleColorHex(color: number): string | null {
  return color === 0 ? null : `#${color.toString(16).padStart(6, '0')}`;
}
