/**
 * Shared geometry for the chips a channel row carries on its right (filter
 * count, Fix). One definition so the two always line up at the same height;
 * they sit side by side on the Channels tab. No border — a tinted fill is what
 * separates a chip from the row, and a hairline on top of it only muddied the
 * edge at this size.
 */
export const CHIP_CLASS =
  'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] transition-colors';
