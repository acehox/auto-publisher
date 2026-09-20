import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    const millions = num / 1000000;
    return `${millions % 1 === 0 ? millions : millions.toFixed(1)}M+`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })}K+`;
  }
  return num.toLocaleString('en-US');
}

export function formatNumberFull(num: number): string {
  return `${num.toLocaleString('en-US')}+`;
}

/**
 * How a Discord channel is named anywhere in the UI. One definition so a name
 * can never render bare on one surface and prefixed on the next — the backend
 * stores it without the `#`, which is what made that drift easy. A null name is a
 * channel Discord no longer returns (`GuildChannel.name`).
 */
export function channelLabel(name: string | null): string {
  return name === null ? 'Hidden channel' : `#${name}`;
}

/**
 * UTC-pinned so a date that server-renders and then hydrates can't disagree with
 * itself across a midnight boundary — the same reason `legacySunsetLabel` pins.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
