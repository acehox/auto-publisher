/**
 * Plan copy for the /premium page and the dashboard's subscription panel. It renders
 * above the checkout button, and čl. 60 st. 2 makes what it says part of the contract.
 */

export const PREMIUM_PLAN_FEATURES = [
  { id: 'channels', label: 'Unlimited channels' },
  { id: 'filters', label: 'Advanced message filters' },
  {
    id: 'rollover',
    label: "Messages beyond Discord's hourly limit published once it resets, for up to 24 hours",
  },
  { id: 'support', label: 'Priority support' },
] as const;

export type PremiumFeatureId = (typeof PREMIUM_PLAN_FEATURES)[number]['id'];

/** `true` renders a tick, `false` a dash. */
export type PlanValue = string | boolean;

export interface PlanComparisonRow {
  label: string;
  detail?: string;
  free: PlanValue;
  premium: PlanValue;
}

/**
 * čl. 60 st. 2 makes every row a contract term, so it has to describe what actually
 * runs. There is one FIFO publishing queue (ADR 0001): never claim priority, a
 * dedicated queue or dedicated capacity.
 */
export const planComparison = (freeChannelLimit: number): readonly PlanComparisonRow[] => [
  {
    label: 'Announcement channels',
    free: `Up to ${freeChannelLimit}`,
    premium: 'Unlimited',
  },
  {
    label: "Messages beyond Discord's hourly limit",
    detail: 'Discord limits each channel to 10 published messages per hour',
    free: 'Not published',
    premium: 'Published when the limit resets (up to 24 hours)',
  },
  {
    label: 'Message filters',
    detail: 'Publish only what matches your rules — keyword, mention, author, or webhook',
    free: false,
    premium: true,
  },
  {
    label: 'Support',
    free: 'Standard',
    premium: 'Priority',
  },
];
