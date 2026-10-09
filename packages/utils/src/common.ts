import { FilterType } from '@ap/validations';

/**
 * Sleep for a given amount of time
 * @param ms Time in milliseconds
 */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Capitalize the first letter of a string
 * @param str The string to capitalize
 * @returns The capitalized string
 */
export const capitalize = (str: string): string => {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export interface TtlCache<T> {
  /** Cached value if present and unexpired, else undefined (lazily evicting on read) */
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
}

/**
 * Minimal in-memory TTL cache: `Map` + per-entry `expiresAt`, lazy expiry on
 * read, and a size-gated full sweep on write so expired entries never
 * accumulate unbounded. No LRU cap — callers use it for small, self-evicting
 * key spaces. Safe because every consumer is single-instance.
 * @param ttlMs entry lifetime in milliseconds
 * @param pruneThreshold sweep expired entries once the map reaches this size
 */
export const createTtlCache = <T>(ttlMs: number, pruneThreshold = 10_000): TtlCache<T> => {
  const store = new Map<string, { value: T; expiresAt: number }>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      const now = Date.now();
      if (store.size >= pruneThreshold) {
        for (const [k, entry] of store) {
          if (entry.expiresAt <= now) store.delete(k);
        }
      }
      store.set(key, { value, expiresAt: now + ttlMs });
    },
    delete(key) {
      store.delete(key);
    },
  };
};

/**
 * Normalize filter values based on filter type
 * - Keyword filters: converted to lowercase for case-insensitive matching
 * - Other filter types: returned as-is
 * @param values Array of filter values
 * @param filterType Type of filter
 * @returns Normalized filter values
 */
export const normalizeFilterValues = (values: string[], filterType: FilterType): string[] => {
  if (filterType === FilterType.Keyword) {
    return values.map(value => value.toLowerCase());
  }
  return values;
};
