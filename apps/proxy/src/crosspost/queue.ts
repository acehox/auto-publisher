import type { REST } from '@discordjs/rest';
import { DelayedError, type Job, Queue, Worker } from 'bullmq';
import { RESTJSONErrorCodes, Routes, type Snowflake } from 'discord-api-types/v10';
import express, { type Router } from 'express';
import { Redis } from 'ioredis';
import { logger } from '../logger.js';
import type { GatedChannels } from './caches.js';
import { type CrosspostOutcome, classify } from './classifier.js';
import type { Gate } from './gate.js';
import type { CrosspostMetrics } from './metrics.js';
import { type HoldResult, type RolloverBacklog, readyAt } from './rollover.js';

const QUEUE_NAME = 'crosspost';
const CROSSPOST_JOB = 'crosspost';
const DRAIN_JOB = 'drain';
const QUEUE_HIGH_WATER = 10_000;
const RATE_LIMIT_RETRY_CAP_MS = 5 * 60 * 1_000;
const INVALID_REQUESTS_DELAY_MS = 60_000;
// Discord's hourly per-channel limit: one drain run never publishes more than a reset frees
const DRAIN_BATCH = 10;
const SNOWFLAKE_PATTERN = /^\d{17,19}$/;
const EXPECTED_DISCORD_ERRORS = new Set<number | string>([
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.InvalidMessageType,
]);

export type CrosspostJobData = {
  guildId: Snowflake;
  channelId: Snowflake;
  messageId: Snowflake;
};

type DrainJobData = { channelId: Snowflake };

export type CrosspostQueueStats = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export type CrosspostQueueModule = {
  router: Router;
  internalRouter: Router;
  shutdown(): Promise<void>;
  stats(): Promise<CrosspostQueueStats>;
};

const crosspostJobId = (channelId: Snowflake, messageId: Snowflake) => `${channelId}-${messageId}`;

const delayJob = async (job: Job, delayMs: number): Promise<never> => {
  // moveToDelayed skips the attempt counter, so a wait never spends a retry
  await job.moveToDelayed(Date.now() + delayMs, job.token);
  throw new DelayedError();
};

export const createCrosspostQueue = (deps: {
  rest: REST;
  gate: Gate;
  gatedChannels: GatedChannels;
  backlog: RolloverBacklog;
  metrics: CrosspostMetrics;
  redisUri: string;
  queueDatabaseId: number;
  concurrency: number;
}): CrosspostQueueModule => {
  const connection: Redis = new Redis(deps.redisUri, {
    db: deps.queueDatabaseId,
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<CrosspostJobData | DrainJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 10,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 1_000, age: 60 * 60 },
      removeOnFail: { count: 5_000, age: 24 * 60 * 60 },
    },
  });

  const scheduleDrain = async (channelId: Snowflake, delayMs: number): Promise<void> => {
    if (!(await deps.backlog.claimDrain(channelId, delayMs))) return;
    try {
      await queue.add(DRAIN_JOB, { channelId }, { delay: delayMs > 0 ? delayMs : undefined });
    } catch (error) {
      await deps.backlog.unclaimDrain(channelId);
      throw error;
    }
  };

  const hold = async (
    channelId: Snowflake,
    messageId: Snowflake,
    waitForPreview: boolean,
    waitMs: number
  ): Promise<HoldResult> => {
    const result = await deps.backlog.hold(channelId, messageId, waitForPreview, waitMs);
    if (result === 'held') await scheduleDrain(channelId, waitMs);
    if (result === 'expired') deps.metrics.outcome('expired');
    logger.debug({ event: `crosspost.rollover.${result}`, channelId, messageId, waitMs });
    return result;
  };

  /** Metrics, logs and gate writes every send shares; what happens to the message is the caller's. */
  const recordOutcome = async (
    outcome: CrosspostOutcome,
    channelId: Snowflake,
    messageId: Snowflake
  ): Promise<{ lockMs?: number }> => {
    switch (outcome.kind) {
      case 'already_done':
        deps.metrics.outcome('already_done');
        logger.debug({ event: 'crosspost.already', channelId, messageId });
        return {};
      case 'blocked':
        await deps.gatedChannels.block(channelId);
        deps.metrics.outcome('blocked');
        logger.info({ event: 'crosspost.blocked', channelId, messageId, status: outcome.status });
        return {};
      case 'sublimit': {
        const lockMs = await deps.gatedChannels.lock(channelId, outcome.retryAfterMs);
        deps.metrics.outcome('sublimit');
        logger.debug({ event: 'crosspost.sublimit', channelId, messageId, lockMs });
        return { lockMs };
      }
      case 'global_ratelimit':
      case 'transient_429':
        deps.metrics.outcome('rate_limited');
        logger.warn({
          event: 'crosspost.rate_limited',
          channelId,
          messageId,
          kind: outcome.kind,
          delayMs: Math.min(outcome.retryAfterMs, RATE_LIMIT_RETRY_CAP_MS),
        });
        return {};
      case 'fatal_4xx': {
        deps.metrics.discordError(outcome.code);
        const level = EXPECTED_DISCORD_ERRORS.has(outcome.code) ? 'debug' : 'warn';
        logger[level]({
          event: 'crosspost.discord_error',
          channelId,
          messageId,
          status: outcome.status,
          code: outcome.code,
        });
        return {};
      }
      case 'retryable_5xx':
        deps.metrics.outcome('retryable');
        logger.debug({
          event: 'crosspost.retryable',
          channelId,
          messageId,
          status: outcome.status,
        });
        return {};
    }
  };

  /** Free plan: one job per message, dropped at a sublimit lock. */
  const processCrosspost = async (job: Job<CrosspostJobData>): Promise<void> => {
    const { channelId, messageId } = job.data;
    const verdict = await deps.gate.evaluate(channelId);
    if (verdict.kind === 'reject') {
      deps.metrics.workerSkipped(verdict.reason);
      if (verdict.reason === 'invalid_requests') {
        logger.debug({ event: 'crosspost.shed.invalid_requests', channelId, messageId });
        return delayJob(job, INVALID_REQUESTS_DELAY_MS);
      }
      logger.debug({ event: 'crosspost.skipped', channelId, messageId, reason: verdict.reason });
      return;
    }

    try {
      await deps.rest.post(Routes.channelMessageCrosspost(channelId, messageId));
      deps.metrics.latency(Date.now() - job.timestamp - (job.opts.delay ?? 0));
      logger.debug({ event: 'crosspost.success', channelId, messageId });
      return;
    } catch (error) {
      const outcome = classify(error);
      await recordOutcome(outcome, channelId, messageId);
      switch (outcome.kind) {
        case 'global_ratelimit':
        case 'transient_429':
          return delayJob(job, Math.min(outcome.retryAfterMs, RATE_LIMIT_RETRY_CAP_MS));
        case 'retryable_5xx':
          throw new Error(`crosspost_retryable_${outcome.status}`);
        default:
          return;
      }
    }
  };

  const delayDrain = async (job: Job<DrainJobData>, delayMs: number): Promise<never> => {
    await deps.backlog.extendDrain(job.data.channelId, delayMs);
    return delayJob(job, delayMs);
  };

  const finishDrain = async (channelId: Snowflake): Promise<void> => {
    if (await deps.backlog.finishDrain(channelId)) await scheduleDrain(channelId, 0);
  };

  /**
   * Rollover: publishes a channel's messages one at a time, oldest first, until
   * the backlog empties or Discord's next shared 429 locks the channel, then
   * waits for the lock. Strictly sequential, so neither the worker concurrency
   * nor a retry can reorder them.
   */
  const processDrain = async (job: Job<DrainJobData>): Promise<void> => {
    const { channelId } = job.data;
    const startedAt = Date.now();
    const verdict = await deps.gate.evaluate(channelId);
    if (verdict.kind === 'reject') {
      if (verdict.reason === 'invalid_requests') return delayDrain(job, INVALID_REQUESTS_DELAY_MS);
      if (verdict.reason === 'sublimit') return delayDrain(job, verdict.retryAfterMs);
      // Lost access: held messages go the way a fresh one would
      await deps.backlog.clear(channelId);
      return finishDrain(channelId);
    }
    deps.metrics.outcome('expired', await deps.backlog.dropExpired(channelId));

    for (let published = 0; published < DRAIN_BATCH; ) {
      const held = await deps.backlog.oldest(channelId);
      if (held === null) return finishDrain(channelId);
      // Everything behind it waits too: that is what keeps post order
      if (held.readyAt > Date.now()) return delayDrain(job, held.readyAt - Date.now());
      const { messageId } = held;
      try {
        await deps.rest.post(Routes.channelMessageCrosspost(channelId, messageId));
        await deps.backlog.remove(channelId, messageId);
        deps.metrics.outcome('released');
        // From when it could first go: ready, or this run starting after a wait
        deps.metrics.latency(Date.now() - Math.max(held.readyAt, startedAt));
        logger.debug({ event: 'crosspost.rollover.released', channelId, messageId });
        published++;
      } catch (error) {
        const outcome = classify(error);
        const { lockMs } = await recordOutcome(outcome, channelId, messageId);
        switch (outcome.kind) {
          case 'already_done':
          case 'fatal_4xx':
            await deps.backlog.remove(channelId, messageId);
            continue;
          case 'blocked':
            await deps.backlog.clear(channelId);
            return finishDrain(channelId);
          case 'sublimit':
            return delayDrain(job, lockMs ?? outcome.retryAfterMs);
          case 'global_ratelimit':
          case 'transient_429':
            return delayDrain(job, Math.min(outcome.retryAfterMs, RATE_LIMIT_RETRY_CAP_MS));
          case 'retryable_5xx':
            throw new Error(`crosspost_retryable_${outcome.status}`);
        }
      }
    }
    // A full batch: the next send learns the next lock, in a fresh run so other channels get a turn
    return delayDrain(job, 0);
  };

  const worker = new Worker<CrosspostJobData | DrainJobData>(
    QUEUE_NAME,
    job =>
      job.name === DRAIN_JOB
        ? processDrain(job as Job<DrainJobData>)
        : processCrosspost(job as Job<CrosspostJobData>),
    { connection, concurrency: deps.concurrency }
  );

  worker.on('failed', (job, err) => {
    if (err instanceof DelayedError) return;
    // BullMQ emits 'failed' on every attempt; only the last one is a lost message
    const isFinal = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    logger[isFinal ? 'warn' : 'debug']({
      event: 'crosspost.job_failed',
      jobId: job?.id,
      name: job?.name,
      attemptsMade: job?.attemptsMade,
      err,
    });
    // The backlog stays; the channel's next held message starts a new drain
    if (isFinal && job?.name === DRAIN_JOB) {
      void deps.backlog.unclaimDrain((job.data as DrainJobData).channelId).catch(error => {
        logger.warn({ event: 'redis.write_failed', op: 'rollover.unclaim', err: error });
      });
    }
  });
  worker.on('error', err => logger.error({ event: 'worker.error', err }));

  const counts = async (): Promise<CrosspostQueueStats> => {
    const jobCounts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    return {
      waiting: jobCounts.waiting ?? 0,
      active: jobCounts.active ?? 0,
      delayed: jobCounts.delayed ?? 0,
      failed: jobCounts.failed ?? 0,
    };
  };

  const router = express.Router();
  router.post('/crosspost/:guildId/:channelId/:messageId', async (req, res) => {
    const { guildId, channelId, messageId } = req.params;
    const waitForPreview = req.query.preview === '1';
    if (
      !SNOWFLAKE_PATTERN.test(guildId) ||
      !SNOWFLAKE_PATTERN.test(channelId) ||
      !SNOWFLAKE_PATTERN.test(messageId)
    ) {
      res.status(400).end();
      return;
    }

    const verdict = await deps.gate.evaluate(channelId);
    if (verdict.kind === 'reject' && verdict.reason === 'invalid_requests') {
      deps.metrics.enqueueRejected(verdict.reason);
      logger.debug({ event: 'crosspost.rejected.invalid_requests', channelId, messageId });
      res.setHeader('Retry-After', '60').status(503).end();
      return;
    }
    // Rollover goes through the channel's backlog even when unlocked: only one
    // sender per channel keeps every message in post order
    if (req.query.rollover === '1' && (verdict.kind === 'allow' || verdict.reason === 'sublimit')) {
      const waitMs = verdict.kind === 'allow' ? 0 : verdict.retryAfterMs;
      const result = await hold(channelId, messageId, waitForPreview, waitMs);
      if (result === 'expired') {
        res.status(204).end();
        return;
      }
      deps.metrics.enqueueAccepted();
      res.status(202).end();
      return;
    }
    if (verdict.kind === 'reject') {
      deps.metrics.enqueueRejected(verdict.reason);
      logger.debug({ event: 'crosspost.rejected', channelId, messageId, reason: verdict.reason });
      res.status(204).end();
      return;
    }

    const { waiting } = await counts();
    if (waiting >= QUEUE_HIGH_WATER) {
      deps.metrics.enqueueRejected('queue_overloaded');
      logger.debug({ event: 'crosspost.rejected.queue_overloaded', channelId, messageId, waiting });
      res.setHeader('Retry-After', '30').status(503).end();
      return;
    }

    const data: CrosspostJobData = { guildId, channelId, messageId };
    const delayMs = readyAt(messageId, waitForPreview) - Date.now();
    await queue.add(CROSSPOST_JOB, data, {
      jobId: crosspostJobId(channelId, messageId),
      delay: delayMs > 0 ? delayMs : undefined,
    });
    deps.metrics.enqueueAccepted();
    logger.debug({ event: 'crosspost.enqueued', guildId, channelId, messageId });

    res.status(202).end();
  });

  const internalRouter = express.Router();
  internalRouter.delete('/internal/blocked/:channelId', async (req, res) => {
    const { channelId } = req.params;
    if (!SNOWFLAKE_PATTERN.test(channelId)) {
      res.status(400).end();
      return;
    }
    await deps.gatedChannels.unblock(channelId);
    res.status(204).end();
  });

  // A deleted message leaves the queue and the backlog. A job already sending is
  // locked and stays; Discord answers it with Unknown Message.
  internalRouter.delete('/internal/crosspost/:channelId/:messageId', async (req, res) => {
    const { channelId, messageId } = req.params;
    if (!SNOWFLAKE_PATTERN.test(channelId) || !SNOWFLAKE_PATTERN.test(messageId)) {
      res.status(400).end();
      return;
    }
    await Promise.all([
      deps.backlog.remove(channelId, messageId),
      queue.remove(crosspostJobId(channelId, messageId)),
    ]);
    res.status(204).end();
  });

  return {
    router,
    internalRouter,
    shutdown: async () => {
      await worker.close();
      await queue.close();
      await connection.quit();
    },
    stats: counts,
  };
};
