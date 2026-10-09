import { config } from '@ap/config';
import { RequestMethod, type Snowflake } from 'discord.js';

// The proxy: every Discord call and every crosspost enqueue goes through it
const baseUrl = config.proxyUrl;
const FETCH_TIMEOUT_MS = 5_000;

// Never `channel.messages.crosspost()`: through passthrough it skips the queue,
// and its `Promise<Message>` contract cannot be met by a queued 202.
const enqueueCrosspost = async (
  guildId: Snowflake,
  channelId: Snowflake,
  messageId: Snowflake,
  options: { rollover: boolean; waitForPreview: boolean }
) => {
  const query = new URLSearchParams();
  if (options.rollover) query.set('rollover', '1');
  if (options.waitForPreview) query.set('preview', '1');
  const search = query.size ? `?${query}` : '';
  return fetch(`${baseUrl}/crosspost/${guildId}/${channelId}/${messageId}${search}`, {
    method: RequestMethod.Post,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
};

const clearBlocked = async (channelId: Snowflake) => {
  return fetch(`${baseUrl}/internal/blocked/${channelId}`, {
    method: RequestMethod.Delete,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
};

const cancelCrosspost = async (channelId: Snowflake, messageId: Snowflake) => {
  return fetch(`${baseUrl}/internal/crosspost/${channelId}/${messageId}`, {
    method: RequestMethod.Delete,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
};

const getInfo = async () => {
  return fetch(`${baseUrl}/info`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
};

export const ProxyAPI = {
  enqueueCrosspost,
  clearBlocked,
  cancelCrosspost,
  getInfo,
};
