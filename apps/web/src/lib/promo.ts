import type { BillingInterval } from '@ap/api-types';
import { formatDateLabel } from '@/lib/constants';

export interface Promo {
  code: string;
  percentOff: number;
  /** The one billing interval the code works on. */
  interval: BillingInterval;
  /** Last day the code is shown, `YYYY-MM-DD` (UTC). */
  lastDay: string;
  /** Paddle's `recur`: true = every payment is discounted, false = the first one only. */
  recurring: boolean;
}

/**
 * Display only: the discount itself lives in Paddle, which is what applies and expires it, so
 * each entry must match a Paddle discount with the same code, percentage, `recur`, expiry and
 * `restrict_to` (both price ids of the interval, plain and trial). The buyer types the code
 * into Paddle's checkout. An entry stops showing on its own after `lastDay`; delete it then.
 *
 * State a percentage, never a discounted amount: a displayed price needs the Croatian
 * reference price and EUR beside it (see `REFERENCE_PRICE`).
 */
const PROMOS: Promo[] = [
  {
    code: 'THENEWERABEGINS',
    percentOff: 30,
    interval: 'year',
    lastDay: '2027-01-10',
    recurring: false,
  },
];

export function activePromo(now = new Date()): Promo | null {
  const today = now.toISOString().slice(0, 10);
  return PROMOS.find(promo => today <= promo.lastDay) ?? null;
}

const INTERVAL_PLAN = { month: 'Monthly', year: 'Annual' } as const;

export function promoHeadline(promo: Promo): string {
  return `${promo.percentOff}% off ${INTERVAL_PLAN[promo.interval]} Premium`;
}

export function promoDeadline(promo: Promo): string {
  return formatDateLabel(promo.lastDay);
}

/** "Jan 10", for the one-line bar. */
export function promoDeadlineShort(promo: Promo): string {
  return new Date(`${promo.lastDay}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The conditions an offer must state where it is made (Zakon o elektroničkoj trgovini čl. 7).
 * A first-payment discount is worded by what that payment buys, which is exact: the first
 * payment pays for one interval. The renewal terms are owed at checkout and in the pricing
 * card, not here.
 */
export function promoTerms(promo: Promo): string {
  const covers = promo.recurring ? 'every payment' : `your first ${promo.interval}`;
  return `Enter the code at checkout by ${promoDeadline(promo)}. It covers ${covers}.`;
}
