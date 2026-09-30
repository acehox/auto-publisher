import { z } from 'zod';

// Regular expression patterns
export const RegExPatterns = {
  snowflake: /^(?<id>\d{17,20})$/,
};

// Base validation schemas
export const Validations = {
  snowflakeId: z.string().refine((value: string) => RegExPatterns.snowflake.test(value), {
    message: 'Invalid snowflake ID',
  }),
};

// Filter enums (using const objects for Bun ES module compatibility)
export const FilterType = {
  Keyword: 'keyword',
  Mention: 'mention',
  Author: 'author',
  Webhook: 'webhook',
} as const;

// How a channel's conditions combine: Any = OR, All = AND.
export const FilterMatchMode = {
  Any: 'any',
  All: 'all',
} as const;

// Type exports for type-checking
export type FilterType = (typeof FilterType)[keyof typeof FilterType];
export type FilterMatchMode = (typeof FilterMatchMode)[keyof typeof FilterMatchMode];

// Filter validation schemas
export const FilterTypeSchema = z.enum(Object.values(FilterType));
export const FilterMatchModeSchema = z.enum(Object.values(FilterMatchMode));

export const FilterSchema = z.object({
  id: z.string(),
  type: FilterTypeSchema,
  // Negative form of the operator: false = "contains"/"is", true = "doesn't contain"/"is not".
  // Replaces the old allow/block mode — "block X" is now a negated condition.
  negate: z.boolean(),
  values: z.array(z.string().min(1).max(200)),
  createdAt: z.date(),
});

/**
 * Per-type value caps. Uniform at 25 today: that is Discord's ceiling for a select
 * menu's `max_values`, and the mention/author forms are built on selects, so no type
 * could go higher. Kept per-type rather than collapsed to one number so a single
 * type can be tuned later without reshaping every caller.
 */
export const MAX_VALUES: Record<FilterType, number> = {
  [FilterType.Keyword]: 25,
  [FilterType.Mention]: 25,
  [FilterType.Author]: 25,
  [FilterType.Webhook]: 25,
};

/** A keyword that is empty or only `*`s matches everything — reject it as a no-op. */
const isNoOpKeyword = (value: string): boolean => {
  const collapsed = value.trim().replace(/\*+/g, '*');
  return collapsed.length === 0 || collapsed === '*';
};

export const CreateFilterSchema = z
  .object({
    type: FilterTypeSchema,
    negate: z.boolean().default(false),
    values: z.array(z.string().min(1).max(200)).min(1, 'At least one value is required'),
  })
  .refine(
    filter => {
      const max = MAX_VALUES[filter.type];
      return max !== undefined && filter.values.length <= max;
    },
    {
      message: 'Maximum amount of values exceeded for filter type',
    }
  )
  .refine(filter => filter.type !== FilterType.Keyword || !filter.values.some(isNoOpKeyword), {
    message: 'A keyword cannot be empty or only wildcards',
  });

/**
 * Atomic replace of a channel's whole rule (dashboard inline builder). The friendly
 * per-channel cap is enforced in the service so it can return a structured code; the
 * cap here is only an abuse safety net.
 */
export const SetChannelFiltersSchema = z.object({
  matchMode: FilterMatchModeSchema,
  conditions: z.array(CreateFilterSchema).max(200),
});

export type Filter = z.infer<typeof FilterSchema>;
export type CreateFilter = z.infer<typeof CreateFilterSchema>;
export type SetChannelFilters = z.infer<typeof SetChannelFiltersSchema>;

/** Guilds per bot join-date push; sized to stay well under express.json()'s 100kb default. */
export const MAX_JOIN_DATES_PER_PUSH = 500;
