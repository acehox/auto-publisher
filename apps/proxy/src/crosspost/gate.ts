import type { Alerter } from '@ap/alerts';
import type { InvalidRequestsTracker } from '../gateway/invalidRequests.js';
import type { BlockedCache, SublimitCounter } from './caches.js';

export type GateRejectReason = 'invalid_requests' | 'blocked' | 'sublimit';

export type GateVerdict = { kind: 'allow' } | { kind: 'reject'; reason: GateRejectReason };

export type Gate = {
  evaluate(channelId: string): Promise<GateVerdict>;
};

export const createGate = (deps: {
  invalidRequests: InvalidRequestsTracker;
  blocked: BlockedCache;
  sublimit: SublimitCounter;
  alerter?: Alerter;
}): Gate => ({
  evaluate: async channelId => {
    if (deps.invalidRequests.isOverThreshold()) {
      // Alerter's Redis throttle dedupes the per-rejection firing
      const { count, expiresInMs } = deps.invalidRequests.current();
      deps.alerter?.send('invalid-request-shed', {
        title: 'Proxy invalid-request shed active',
        description: `Crossposts are being rejected: ${count} invalid requests in the current 10 min window (${Math.round(expiresInMs / 1000)}s remaining). Find what is generating 401/403s before the Cloudflare ban at 10k.`,
      });
      return { kind: 'reject', reason: 'invalid_requests' };
    }
    if (await deps.blocked.isBlocked(channelId)) return { kind: 'reject', reason: 'blocked' };
    if (await deps.sublimit.isOverLimit(channelId)) return { kind: 'reject', reason: 'sublimit' };
    return { kind: 'allow' };
  },
});
