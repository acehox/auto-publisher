import { Data } from 'data/index.js';
import { logger } from 'utils/logger.js';

export type ProxyInfo = {
  rest: {
    globalRemaining: number;
    handlers: number;
    activeHandlers: number;
    hashes: number;
    invalidRequests: { count: number; expiresInMs: number };
  };
  queue: {
    /** BullMQ's wait+paused. Must be 0 — see the render in handlers/admin/info.ts */
    waiting: number;
    /** Where all depth lives: every enqueue carries an explicit priority (ADR 0011) */
    prioritized: number;
    active: number;
  };
  sublimitCount: number;
  blockedCount: number;
};

export type BackendInfo = {
  channelsCacheSize: number;
};

export type AggregatedInfo = {
  proxy: ProxyInfo | null;
  backend: BackendInfo | null;
};

const fetchProxy = async (): Promise<ProxyInfo | null> => {
  try {
    const res = await Data.API.Proxy.getInfo();
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { data: ProxyInfo };
    return body.data ?? null;
  } catch (error) {
    logger.warn({ event: 'info.proxy_failed', err: error });
    return null;
  }
};

const fetchBackend = async (): Promise<BackendInfo | null> => {
  try {
    const res = await Data.API.Backend.getInfo();
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as { data: BackendInfo };
    return body.data ?? null;
  } catch (error) {
    logger.warn({ event: 'info.backend_failed', err: error });
    return null;
  }
};

const get = async (): Promise<AggregatedInfo> => {
  const [proxy, backend] = await Promise.all([fetchProxy(), fetchBackend()]);
  return { proxy, backend };
};

export const Info = {
  get,
};
