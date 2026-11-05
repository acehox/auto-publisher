/**
 * Plan copy for the /premium page and the dashboard's subscription panel. It renders
 * above the checkout button, and čl. 60 st. 2 makes what it says part of the contract.
 */

/** Rendered as `before` + `emphasis` + `after`, with `emphasis` stressed. */
export interface PlanFeature {
  id: string;
  before?: string;
  emphasis: string;
  after?: string;
}

export const PREMIUM_PLAN_FEATURES = [
  { id: 'rollover', emphasis: 'Rollover', after: " — publish beyond Discord's hourly limit" },
  { id: 'filters', before: 'Advanced message ', emphasis: 'filters' },
  { id: 'channels', emphasis: 'Unlimited', after: ' channels' },
  { id: 'support', emphasis: 'Priority', after: ' support' },
] as const satisfies readonly PlanFeature[];

export type PremiumFeatureId = (typeof PREMIUM_PLAN_FEATURES)[number]['id'];

/**
 * Purchase-time only, so not in PREMIUM_PLAN_FEATURES, which existing subscribers also see.
 * The window runs from conclusion, not from each charge or renewal (/refunds).
 */
export const REFUND_PLAN_FEATURE: PlanFeature = {
  id: 'refund',
  before: 'Fully ',
  emphasis: 'refundable',
  after: ' within 14 days of subscribing',
};

/** Purchase-time only, like the refund line; closes the card's list. */
export const CANCEL_PLAN_FEATURE: PlanFeature = {
  id: 'cancel',
  emphasis: 'Cancel',
  after: ' anytime',
};

/** `true` renders a tick, `false` a cross, `'unlimited'` an infinity sign, a number itself. */
export type PlanValue = boolean | number | 'unlimited';

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
    label: 'Rollover',
    detail:
      "Messages beyond Discord's limit of 10 per channel per hour are published when it resets, for up to 24 hours",
    free: false,
    premium: true,
  },
  {
    label: 'Message filters',
    detail: 'Publish only what matches your rules — keyword, mention, author, or webhook',
    free: false,
    premium: true,
  },
  {
    label: 'Announcement channels',
    free: freeChannelLimit,
    premium: 'unlimited',
  },
  {
    label: 'Priority support',
    free: false,
    premium: true,
  },
];
