import { type REST, RESTEvents } from '@discordjs/rest';
import type { InvalidRequestsTracker } from '../gateway/invalidRequests.js';
import { logger } from '../logger.js';
import { withTimeout } from './caches.js';
import type { GateRejectReason } from './gate.js';
import type { CrosspostQueueStats } from './queue.js';

const WINDOW_MS = 60_000;
const MAX_LATENCY_SAMPLES = 50_000;
// discord.js's bucket route: snowflakes normalised to `:id`
const CROSSPOST_ROUTE = '/channels/:id/messages/:id/crosspost';

export type CrosspostOutcomeMetric =
  | 'already_done'
  | 'sublimit'
  | 'blocked'
  | 'rate_limited'
  | 'retryable';

export type EnqueueRejectReason = GateRejectReason | 'queue_overloaded';

export type CrosspostMetrics = {
  outcome(kind: CrosspostOutcomeMetric): void;
  discordError(code: number | string): void;
  enqueueAccepted(): void;
  enqueueRejected(reason: EnqueueRejectReason): void;
  workerSkipped(reason: GateRejectReason): void;
  latency(ms: number): void;
  start(queueStats: () => Promise<CrosspostQueueStats>): void;
  stop(): void;
};

type Counts = Record<string, number>;

const createCounters = () => ({
  startedAt: Date.now(),
  sent: 0,
  responsesByStatus: {} as Counts,
  rateLimitedByScope: {} as Counts,
  buckets: {} as Counts,
  localWaits: { global: 0, route: 0 },
  outcomes: {} as Counts,
  discordErrorsByCode: {} as Counts,
  enqueue: { accepted: 0, rejected: {} as Counts },
  workerSkipped: {} as Counts,
  latencySamples: [] as number[],
});

const bump = (counts: Counts, key: string) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;

const summarizeLatency = (samples: number[]) => {
  if (samples.length === 0) return { n: 0 };
  const sorted = samples.sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
};

export const createCrosspostMetrics = (deps: {
  rest: REST;
  invalidRequests: InvalidRequestsTracker;
}): CrosspostMetrics => {
  let counters = createCounters();
  let timer: NodeJS.Timeout | undefined;

  // Never read the body here: it shares discord.js's stream and breaks its 4xx error parsing
  deps.rest.on(RESTEvents.Response, (request, res) => {
    if (request.route !== CROSSPOST_ROUTE) return;
    counters.sent++;
    bump(counters.responsesByStatus, String(res.status));
    const scope = res.headers.get('x-ratelimit-scope');
    if (res.status === 429) bump(counters.rateLimitedByScope, scope ?? 'none');
    // A new hash, or a limit other than 5 in the debug line, means Discord changed the route
    const bucket = res.headers.get('x-ratelimit-bucket');
    if (bucket) bump(counters.buckets, bucket);

    if (logger.isLevelEnabled('debug')) {
      const headers: Record<string, string> = {};
      for (const [name, value] of res.headers) {
        if (name.startsWith('x-ratelimit-') || name === 'retry-after' || name === 'via') {
          headers[name] = value;
        }
      }
      logger.debug({
        event: 'crosspost.response',
        path: request.path,
        status: res.status,
        headers,
      });
    }
  });

  deps.rest.on(RESTEvents.RateLimited, data => {
    if (data.global) counters.localWaits.global++;
    else counters.localWaits.route++;
  });

  const flush = async (queueStats: () => Promise<CrosspostQueueStats>) => {
    const closed = counters;
    counters = createCounters();
    const queue = await withTimeout<CrosspostQueueStats | null>(queueStats(), null, {
      op: 'metrics.queue',
    });
    logger.info({
      event: 'crosspost.metrics',
      windowMs: Date.now() - closed.startedAt,
      sent: closed.sent,
      responsesByStatus: closed.responsesByStatus,
      rateLimitedByScope: closed.rateLimitedByScope,
      buckets: closed.buckets,
      localWaits: closed.localWaits,
      outcomes: closed.outcomes,
      discordErrorsByCode: closed.discordErrorsByCode,
      enqueue: closed.enqueue,
      workerSkipped: closed.workerSkipped,
      invalidRequests: deps.invalidRequests.current().count,
      queue: queue ?? undefined,
      latencyMs: summarizeLatency(closed.latencySamples),
    });
  };

  return {
    outcome: kind => bump(counters.outcomes, kind),
    discordError: code => bump(counters.discordErrorsByCode, String(code)),
    enqueueAccepted: () => {
      counters.enqueue.accepted++;
    },
    enqueueRejected: reason => bump(counters.enqueue.rejected, reason),
    workerSkipped: reason => bump(counters.workerSkipped, reason),
    latency: ms => {
      if (counters.latencySamples.length < MAX_LATENCY_SAMPLES) counters.latencySamples.push(ms);
    },
    start: queueStats => {
      if (timer) return;
      timer = setInterval(() => void flush(queueStats), WINDOW_MS);
      timer.unref();
    },
    stop: () => {
      clearInterval(timer);
      timer = undefined;
    },
  };
};
