import type { SegmentedOption } from '@/components/ui/segmented-control';
import type { FilterMatchMode, FilterType } from '@/lib/api/types';

/** Per-field operator option; `negate` is the stored value. */
export interface OperatorOption {
  negate: boolean;
  label: string;
}

/**
 * Per-field operator choices (positive first). The negative form replaces the
 * old allow/block split — a negated condition is "block this".
 */
export const OPERATOR_OPTIONS: Record<FilterType, [OperatorOption, OperatorOption]> = {
  keyword: [
    { negate: false, label: 'contains' },
    { negate: true, label: "doesn't contain" },
  ],
  author: [
    { negate: false, label: 'is' },
    { negate: true, label: 'is not' },
  ],
  mention: [
    { negate: false, label: 'mentions' },
    { negate: true, label: "doesn't mention" },
  ],
  webhook: [
    { negate: false, label: 'is' },
    { negate: true, label: 'is not' },
  ],
};

/** Human-readable operator for a condition. */
export function operatorLabel(type: FilterType, negate: boolean): string {
  return OPERATOR_OPTIONS[type].find(option => option.negate === negate)?.label ?? '';
}

/** Wildcard cheatsheet shown under the keyword input. */
export const KEYWORD_WILDCARD_EXAMPLES: { pattern: string; hint: string }[] = [
  { pattern: 'spam*', hint: 'starts with' },
  { pattern: '*spam', hint: 'ends with' },
  { pattern: '*spam*', hint: 'contains' },
];

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
export const MATCH_MODE_OPTIONS: SegmentedOption<FilterMatchMode>[] = [
  { value: 'all', label: 'All' },
  { value: 'any', label: 'Any' },
];

/** Default match mode for a channel with conditions. */
export const DEFAULT_MATCH_MODE: FilterMatchMode = 'all';

/** Discord snowflake: 17-20 digits. */
export const SNOWFLAKE_REGEX = /^\d{17,20}$/;

/**
 * Per-type value check, shared by the chip inputs (flag invalid chips in red) and
 * the rule editor (drop flagged values from the save payload). Invalid values are
 * never discarded on entry — the user gets to fix them.
 */
export function filterValueError(type: FilterType, value: string): string | null {
  if (type === 'keyword') {
    if (value.length > 200) return 'Keyword is too long (max 200 chars)';
    return isNoOpKeyword(value) ? 'Keyword cannot be empty or only wildcards' : null;
  }
  if (SNOWFLAKE_REGEX.test(value)) return null;
  return type === 'webhook'
    ? 'Enter a valid webhook ID (17-20 digits)'
    : 'Enter a valid user ID (17-20 digits)';
}

/** Discord role color int → CSS hex; 0 means "no color" (default). */
export function roleColorHex(color: number): string | null {
  return color === 0 ? null : `#${color.toString(16).padStart(6, '0')}`;
}
