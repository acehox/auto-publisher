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

const QUEUE_NAME = 'crosspost';
const QUEUE_HIGH_WATER = 10_000;
const RATE_LIMIT_RETRY_CAP_MS = 5 * 60 * 1_000;
const INVALID_REQUESTS_DELAY_MS = 60_000;
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

export const createCrosspostQueue = (deps: {
  rest: REST;
  gate: Gate;
  gatedChannels: GatedChannels;
  metrics: CrosspostMetrics;
  redisUri: string;
  queueDatabaseId: number;
  concurrency: number;
}): CrosspostQueueModule => {
  const connection: Redis = new Redis(deps.redisUri, {
    db: deps.queueDatabaseId,
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<CrosspostJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 10,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 1_000, age: 60 * 60 },
      removeOnFail: { count: 5_000, age: 24 * 60 * 60 },
    },
  });

  const reactToOutcome = async (
    outcome: CrosspostOutcome,
    job: Job<CrosspostJobData>
  ): Promise<void> => {
    const { channelId, messageId } = job.data;
    switch (outcome.kind) {
      case 'already_done':
        deps.metrics.outcome('already_done');
        logger.debug({ event: 'crosspost.already', channelId, messageId });
        return;
      case 'blocked':
        await deps.gatedChannels.block(channelId);
        deps.metrics.outcome('blocked');
        logger.info({ event: 'crosspost.blocked', channelId, messageId, status: outcome.status });
        return;
      case 'sublimit':
        await deps.gatedChannels.lock(channelId, outcome.retryAfterMs / 1_000);
        deps.metrics.outcome('sublimit');
        logger.debug({
          event: 'crosspost.sublimit',
          channelId,
          messageId,
          retryAfterMs: outcome.retryAfterMs,
        });
        return;
      case 'global_ratelimit':
      case 'transient_429': {
        const delayMs = Math.min(outcome.retryAfterMs, RATE_LIMIT_RETRY_CAP_MS);
        deps.metrics.outcome('rate_limited');
        logger.warn({
          event: 'crosspost.rate_limited',
          channelId,
          messageId,
          kind: outcome.kind,
          delayMs,
        });
        await job.moveToDelayed(Date.now() + delayMs, job.token);
        throw new DelayedError();
      }
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
        return;
      }
      case 'retryable_5xx':
        deps.metrics.outcome('retryable');
        logger.debug({
          event: 'crosspost.retryable',
          channelId,
          messageId,
          status: outcome.status,
        });
        throw new Error(`crosspost_retryable_${outcome.status}`);
    }
  };

  const processJob = async (job: Job<CrosspostJobData>): Promise<void> => {
    const { channelId, messageId } = job.data;
    const verdict = await deps.gate.evaluate(channelId);
    if (verdict.kind === 'reject') {
      deps.metrics.workerSkipped(verdict.reason);
      if (verdict.reason === 'invalid_requests') {
        logger.debug({ event: 'crosspost.shed.invalid_requests', channelId, messageId });
        await job.moveToDelayed(Date.now() + INVALID_REQUESTS_DELAY_MS, job.token);
        throw new DelayedError();
      }
      logger.debug({
        event: 'crosspost.skipped',
        channelId,
        messageId,
        reason: verdict.reason,
      });
      return;
    }

    try {
      await deps.rest.post(Routes.channelMessageCrosspost(channelId, messageId));
      deps.metrics.latency(Date.now() - job.timestamp);
      logger.debug({ event: 'crosspost.success', channelId, messageId });
    } catch (error) {
      const outcome = classify(error);
      await reactToOutcome(outcome, job);
    }
  };

  const worker = new Worker<CrosspostJobData>(QUEUE_NAME, processJob, {
    connection,
    concurrency: deps.concurrency,
  });

  worker.on('failed', (job, err) => {
    if (err instanceof DelayedError) return;
    // BullMQ emits 'failed' on every attempt; only the last one is a lost message
    const isFinal = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    logger[isFinal ? 'warn' : 'debug']({
      event: 'crosspost.job_failed',
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      err,
    });
  });
  worker.on('error', err => logger.error({ event: 'worker.error', err }));

  // `prioritized` counts jobs left by the tiered build; BullMQ's 'waiting'
  // excludes them. Drop next release.
  const counts = async (): Promise<CrosspostQueueStats> => {
    const jobCounts = await queue.getJobCounts(
      'waiting',
      'prioritized',
      'active',
      'delayed',
      'failed'
    );
    return {
      waiting: (jobCounts.waiting ?? 0) + (jobCounts.prioritized ?? 0),
      active: jobCounts.active ?? 0,
      delayed: jobCounts.delayed ?? 0,
      failed: jobCounts.failed ?? 0,
    };
  };

  const router = express.Router();
  router.post('/crosspost/:guildId/:channelId/:messageId', async (req, res) => {
    const { guildId, channelId, messageId } = req.params;
    if (
      !SNOWFLAKE_PATTERN.test(guildId) ||
      !SNOWFLAKE_PATTERN.test(channelId) ||
      !SNOWFLAKE_PATTERN.test(messageId)
    ) {
      res.status(400).end();
      return;
    }

    const verdict = await deps.gate.evaluate(channelId);
    if (verdict.kind === 'reject') {
      deps.metrics.enqueueRejected(verdict.reason);
      if (verdict.reason === 'invalid_requests') {
        logger.debug({ event: 'crosspost.rejected.invalid_requests', channelId, messageId });
        res.setHeader('Retry-After', '60').status(503).end();
        return;
      }
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

    await queue.add(
      'crosspost',
      { guildId, channelId, messageId },
      { jobId: `${channelId}-${messageId}` }
    );
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
