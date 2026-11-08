import type { BillingInterval, PlanPrices } from '@ap/api-types';

/**
 * Display only — Paddle charges from the prices behind PADDLE_PRICE_ID_MONTHLY /
 * PADDLE_PRICE_ID_YEARLY, which are tax-inclusive so one figure is truthful in every
 * VAT jurisdiction.
 *
 * Change the amount on the existing Paddle prices, so no env var moves. If Paddle forces a
 * new price id, existing subscribers keep the id they bought; never move them onto the new
 * one, since `isPlanChange` would re-stamp withdrawalPeriodStartsAt and hand each of them a
 * fresh 14-day full-refund right.
 */
export const PREMIUM_PRICE_MONTHLY_USD = 3.99;
export const PREMIUM_PRICE_YEARLY_USD = 34.99;

/** Display only (the legal pages render it); must match `trial_period` on the Paddle trial prices. */
export const PREMIUM_TRIAL_DAYS = 14;

const PREMIUM_YEARLY_SAVINGS_USD = PREMIUM_PRICE_MONTHLY_USD * 12 - PREMIUM_PRICE_YEARLY_USD;
export const PREMIUM_YEARLY_SAVINGS_PERCENT = Math.round(
  (PREMIUM_YEARLY_SAVINGS_USD / (PREMIUM_PRICE_MONTHLY_USD * 12)) * 100
);

const PREMIUM_PRICES_USD: PlanPrices = {
  month: PREMIUM_PRICE_MONTHLY_USD,
  year: PREMIUM_PRICE_YEARLY_USD,
};

export const formatUsd = (amount: number): string => `$${amount.toFixed(2)}`;

export const formatEur = (amount: number): string => `€${amount.toFixed(2)}`;

const perMonth = (interval: BillingInterval, prices: PlanPrices): number =>
  interval === 'year' ? prices.year / 12 : prices.month;

/**
 * A plan's full price, with the EUR price beside the USD one. Croatian law binds us to the EUR
 * price (Pravilnik NN 105/2026, čl. 3), so it is the one Paddle charges a euro-area buyer,
 * converted from USD at Paddle's rate and published by the backend's hourly price-list refresh.
 */
const planPriceLabel = (interval: BillingInterval, eurPrices: PlanPrices | null): string => {
  const usd = formatUsd(PREMIUM_PRICES_USD[interval]);
  return eurPrices ? `${usd} (${formatEur(eurPrices[interval])})` : usd;
};

/**
 * The "additional price" Croatian law requires beside every price we display, from 17.11.2026
 * (Odluka NN 101/2026, point II, amended by NN 110/2026). It is the price on 10.9.2026 or, for a
 * service first sold later, its price on the first day of sale, dated. Premium went on sale on
 * 10.10.2026. It shows even when it equals the current price, and a price change never moves it.
 *
 * Premium was sold only in USD that day. The Odluka calls it a retail price, and Pravilnik
 * NN 105/2026 čl. 3 st. 4 wants a retail price in euros, so it is also stated in EUR at the HNB
 * middle rate applicable on 10.10.2026 (exchange rate list 199).
 */
export const REFERENCE_PRICE = {
  // A literal label, not an Intl format: the upgrade card hydrates on the client.
  label: '10 Oct 2026',
  isoDate: '2026-10-10',
  usd: { month: 4.99, year: 49.99 },
  usdPerEur: 1.1206,
} as const;

export const referencePriceEur = (interval: BillingInterval): number =>
  REFERENCE_PRICE.usd[interval] / REFERENCE_PRICE.usdPerEur;

const referencePriceLine = (interval: BillingInterval): string =>
  `Price on ${REFERENCE_PRICE.label}: ${formatUsd(REFERENCE_PRICE.usd[interval])} (${formatEur(referencePriceEur(interval))}) per ${interval}.`;

export interface PlanPriceDisplay {
  perMonth: { usd: string; eur: string | null };
  /** The amount charged per billing period. */
  charge: string;
  billing: string;
  reference: string | null;
}

/**
 * Everything a plan card states about one billing period. The EUR prices and the reference line
 * are Croatian rules, shown only to `croatianVisitor`.
 */
export const planPriceDisplay = (
  interval: BillingInterval,
  croatianVisitor: boolean,
  eurPrices: PlanPrices | null
): PlanPriceDisplay => {
  const eur = croatianVisitor ? eurPrices : null;
  const charge = planPriceLabel(interval, eur);
  return {
    perMonth: {
      usd: formatUsd(perMonth(interval, PREMIUM_PRICES_USD)),
      eur: eur && formatEur(perMonth(interval, eur)),
    },
    charge,
    billing: `Billed ${interval === 'year' ? 'annually' : 'monthly'} at ${charge}.`,
    reference: croatianVisitor ? referencePriceLine(interval) : null,
  };
};
