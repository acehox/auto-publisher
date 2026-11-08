import type { PublishedPriceList } from '@ap/api-types';
import { entity } from '@/lib/legal/entity';
import { REFERENCE_PRICE, referencePriceEur } from '@/lib/pricing';

const zagrebTime = (date: Date, options: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat('hr-HR', { timeZone: 'Europe/Zagreb', ...options })
    .formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => part.value)
    .join(options.hour ? ':' : '.');

const zagrebDate = (date: Date): string =>
  zagrebTime(date, { day: '2-digit', month: '2-digit', year: 'numeric' });

const zagrebClock = (date: Date): string =>
  zagrebTime(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Outlet type_address_outlet id_storage number_send time, the ministry's pattern for the price
 * list Croatian law requires on the website (Odluka o objavi cjenika, NN 101/2026; guidance of
 * 22.9.2026, 2.4: "webshop" for a website, any id such as 01 for a single outlet).
 */
export const priceListFileName = ({ storageNumber, publishedAt }: PublishedPriceList): string => {
  const sentAt = new Date(publishedAt);
  return `${[
    'webshop',
    `${entity.address.street} ${entity.address.city}`,
    '01',
    String(storageNumber).padStart(3, '0'),
    zagrebDate(sentAt),
    zagrebClock(sentAt),
  ].join('_')}.csv`;
};

export const priceListPublishedAt = ({ publishedAt }: PublishedPriceList): string => {
  const date = new Date(publishedAt);
  return `${zagrebDate(date)}. u ${zagrebClock(date)}`;
};

const csvField = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const referenceDate = REFERENCE_PRICE.isoDate.split('-').reverse().join('.');

const amount = (value: number, currency: string): string => `${value.toFixed(2)} ${currency}`;

/**
 * The service columns of the guidance (2.5). The reference price is the EUR one, see
 * `REFERENCE_PRICE`.
 */
export const priceListCsv = ({ currency, prices }: PublishedPriceList): string =>
  `${[
    [
      'Naziv usluge',
      'Maloprodajna cijena',
      'Poseban oblik prodaje (DA/NE)',
      'Naziv posebnog oblika prodaje',
      `Cijena na ${referenceDate}.`,
    ],
    ...(['month', 'year'] as const).map(interval => [
      `Auto Publisher Premium, ${interval === 'month' ? 'mjesečna' : 'godišnja'} pretplata`,
      amount(prices[interval], currency),
      'NE',
      '',
      amount(referencePriceEur(interval), 'EUR'),
    ]),
  ]
    .map(row => row.map(csvField).join(','))
    .join('\r\n')}\r\n`;
