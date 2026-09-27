/**
 * Display only — Paddle charges from the prices behind PADDLE_PRICE_ID_MONTHLY /
 * PADDLE_PRICE_ID_YEARLY, which are tax-inclusive so one figure is truthful in every
 * VAT jurisdiction.
 *
 * Change the amount on the existing Paddle price. Minting a new price id and swapping
 * the env var makes `isPlanChange` re-stamp every subscriber's
 * withdrawalPeriodStartsAt, handing them all a fresh 14-day full-refund right.
 */
export const PREMIUM_PRICE_MONTHLY_USD = 4.99;
export const PREMIUM_PRICE_YEARLY_USD = 49.99;

/** Display only (the legal pages render it); must match `trial_period` on the Paddle trial prices. */
export const PREMIUM_TRIAL_DAYS = 14;

export const PREMIUM_YEARLY_PER_MONTH_USD = PREMIUM_PRICE_YEARLY_USD / 12;
export const PREMIUM_YEARLY_SAVINGS_USD = PREMIUM_PRICE_MONTHLY_USD * 12 - PREMIUM_PRICE_YEARLY_USD;
export const PREMIUM_YEARLY_SAVINGS_PERCENT = Math.round(
  (PREMIUM_YEARLY_SAVINGS_USD / (PREMIUM_PRICE_MONTHLY_USD * 12)) * 100
);

export const formatUsd = (amount: number): string => `$${amount.toFixed(2)}`;
