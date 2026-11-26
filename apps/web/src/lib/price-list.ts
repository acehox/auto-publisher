import type { PublishedPriceList } from '@ap/api-types';
import { entity } from '@/lib/legal/entity';
import { referencePriceEur } from '@/lib/pricing';

const zagrebParts = (date: Date, options: Intl.DateTimeFormatOptions): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', ...options })
      .formatToParts(date)
      .map(part => [part.type, part.value])
  );

const zagrebDateTime = (date: Date) =>
  zagrebParts(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

/** Serves the current list at a fixed URL: a changed list must replace it at the same address (čl. 6 st. 2). */
export const CURRENT_PRICE_LIST_FILE = 'aktualni.csv';

/**
 * The name Pravilnik o načinu objave cjenika proizvoda (NN 132/2026) čl. 6 st. 4 prescribes for a
 * list that applies at every outlet: OIB, ZA_SVA_PRODAJNA_MJESTA, goods or services, storage
 * number and GGGGMMDD_SSMM.
 */
export const priceListFileName = ({ storageNumber, publishedAt }: PublishedPriceList): string => {
  const { year, month, day, hour, minute } = zagrebDateTime(new Date(publishedAt));
  return `${entity.oib}_ZA_SVA_PRODAJNA_MJESTA_USLUGE_${storageNumber}_${year}${month}${day}_${hour}${minute}.csv`;
};

export const priceListPublishedAt = ({ publishedAt }: PublishedPriceList): string => {
  const { year, month, day, hour, minute } = zagrebDateTime(new Date(publishedAt));
  return `${day}.${month}.${year}. u ${hour}:${minute}`;
};

const csvField = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const amount = (value: number, currency: string): string => `${value.toFixed(2)} ${currency}`;

/**
 * The service columns of čl. 3 st. 3, in that order, separated by `;` (čl. 6 st. 7). The base
 * price is the EUR one, see `REFERENCE_PRICE`; the list states its amount, not its date.
 */
export const priceListCsv = ({ currency, prices }: PublishedPriceList): string =>
  `${[
    ['Naziv usluge', 'Maloprodajna cijena', 'Poseban oblik prodaje (DA/NE)', 'Bazna cijena'],
    ...(['month', 'year'] as const).map(interval => [
      `Auto Publisher Premium, ${interval === 'month' ? 'mjesečna' : 'godišnja'} pretplata`,
      amount(prices[interval], currency),
      'NE',
      amount(referencePriceEur(interval), 'EUR'),
    ]),
  ]
    .map(row => row.map(csvField).join(';'))
    .join('\r\n')}\r\n`;
