import type { PlanPrices, PublishedPriceList } from '@ap/api-types';
import { db, type PriceList, priceList } from '@ap/database';
import { desc, gte, lt } from 'drizzle-orm';
import { PaddleService } from '#services/paddle.js';
import { alerter } from '#utils/alerts.js';
import { logger } from '#utils/logger.js';

// Odluka NN 101/2026-1213 point II keeps a list available "30 dana od dana objave, odnosno svake
// promjene", read as 30 days after the change that replaced it. A day of slack covers the hourly run.
const ARCHIVE_DAYS = 31;

const latest = async (): Promise<PriceList | undefined> =>
  (await db.select().from(priceList).orderBy(desc(priceList.storageNumber)).limit(1))[0];

/**
 * Appends a price list when the EUR price Paddle charges a Croatian buyer has changed. Paddle
 * moves it with its exchange rate, so this is how a rate change becomes a new published file.
 */
const refresh = async (): Promise<void> => {
  const preview = await PaddleService.previewPrices('HR');
  // Croatian law binds us to a EUR price (Pravilnik NN 105/2026, čl. 3), which only exists
  // while automatic currency conversion is on for EUR in Paddle.
  if (preview.currency !== 'EUR') {
    alerter.send('price-list-no-eur', {
      title: 'No EUR price from Paddle',
      description: `Paddle prices a Croatian buyer in ${preview.currency}. Turn on automatic currency conversion for EUR; until then the site shows no EUR price and no new price list.`,
    });
    return;
  }

  const current = await latest();
  if (
    current?.currency === preview.currency &&
    current.monthAmount === preview.month &&
    current.yearAmount === preview.year
  ) {
    return;
  }

  const [inserted] = await db
    .insert(priceList)
    .values({ currency: preview.currency, monthAmount: preview.month, yearAmount: preview.year })
    .returning();
  logger.info({ event: 'price_list.published', storageNumber: inserted?.storageNumber });
};

const prices = (list: PriceList): PlanPrices => ({
  month: list.monthAmount / 100,
  year: list.yearAmount / 100,
});

/** The current EUR prices, which every page showing a USD price states beside it. */
const currentEurPrices = async (): Promise<PlanPrices | null> => {
  const current = await latest();
  return current ? prices(current) : null;
};

/** The current list first, then the archive the law keeps public. */
const published = async (): Promise<PublishedPriceList[]> => {
  const archiveStart = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000);
  const newest = desc(priceList.storageNumber);
  const publishedInWindow = await db
    .select()
    .from(priceList)
    .where(gte(priceList.publishedAt, archiveStart))
    .orderBy(newest);
  // The list current when the window opened: replaced inside it, or still current.
  const currentAtArchiveStart = await db
    .select()
    .from(priceList)
    .where(lt(priceList.publishedAt, archiveStart))
    .orderBy(newest)
    .limit(1);
  return [...publishedInWindow, ...currentAtArchiveStart].map(list => ({
    storageNumber: list.storageNumber,
    publishedAt: list.publishedAt.toISOString(),
    currency: list.currency,
    prices: prices(list),
  }));
};

export const PriceLists = {
  currentEurPrices,
  refresh,
  published,
};
