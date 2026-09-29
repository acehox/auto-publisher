import type { RedisClient } from './client.js';

const SCAN_COUNT = 100;

export const scanKeys = async (client: RedisClient, pattern: string): Promise<string[]> => {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
};
