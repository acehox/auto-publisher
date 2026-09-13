import { type APIResponse, StatusCodes } from '@ap/express';
import { Keys } from '@ap/redis';
import { EventName } from '@paddle/paddle-node-sdk';
import { Data } from 'data/index.js';
import express, { type Request, type Response, type Router } from 'express';
import { Services } from 'services/index.js';
import { unmarshalWebhook } from 'services/paddle.js';
import type { PaddleAdjustmentState, PaddleSubscriptionState } from 'services/subscriptions.js';
import { logger } from 'utils/logger.js';

const IDEMPOTENCY_TTL = 86_400; // 24 hours

const isEventProcessed = async (eventId: string): Promise<boolean> => {
  const exists = await Data.Drivers.Redis.PaddleWebhookDedupe.exists(
    `${Keys.PaddleEvent}:${eventId}`
  );
  return exists === 1;
};

const markEventProcessed = async (eventId: string): Promise<void> => {
  await Data.Drivers.Redis.PaddleWebhookDedupe.set(
    `${Keys.PaddleEvent}:${eventId}`,
    '1',
    'EX',
    IDEMPOTENCY_TTL
  );
};

const SUBSCRIPTION_EVENTS = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionActivated,
  EventName.SubscriptionTrialing,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionPastDue,
  EventName.SubscriptionPaused,
  EventName.SubscriptionResumed,
  EventName.SubscriptionCanceled,
]);

/**
 * Refunds do not all come from our own withdrawal function — Paddle is merchant of record
 * and grants buyers its own cancellation right, so a refund can be issued outside this
 * system and writes no `withdrawal` row. These events are the only way we learn about
 * those; they populate `subscription.lastRefundAt`.
 *
 * `Updated` is subscribed alongside `Created` because an adjustment is raised as
 * `pending_approval` and only becomes `approved` later.
 */
const ADJUSTMENT_EVENTS = new Set<string>([
  EventName.AdjustmentCreated,
  EventName.AdjustmentUpdated,
]);

export const Webhooks: Router = (() => {
  const router = express.Router({ mergeParams: true });

  /**
   * POST /webhooks/paddle
   * Receives Paddle webhook events (raw body, signature-verified)
   */
  router.post('/', async (req: Request, res: Response) => {
    const signature = req.headers['paddle-signature'];

    if (!signature || typeof signature !== 'string') {
      res.status(StatusCodes.BAD_REQUEST).json({
        status: StatusCodes.BAD_REQUEST,
        message: 'Missing Paddle-Signature header',
      } as APIResponse);
      return;
    }

    if (!req.body || !Buffer.isBuffer(req.body)) {
      res.status(StatusCodes.BAD_REQUEST).json({
        status: StatusCodes.BAD_REQUEST,
        message: 'Missing or invalid request body',
      } as APIResponse);
      return;
    }

    let event: Awaited<ReturnType<typeof unmarshalWebhook>>;

    try {
      event = await unmarshalWebhook(req.body.toString('utf8'), signature);
    } catch (error) {
      logger.error(error, 'Paddle webhook signature verification failed');
      res.status(StatusCodes.UNAUTHORIZED).json({
        status: StatusCodes.UNAUTHORIZED,
        message: 'Invalid webhook signature',
      } as APIResponse);
      return;
    }

    logger.info(`Paddle webhook: ${event.eventType} (${event.eventId})`);

    if (await isEventProcessed(event.eventId)) {
      logger.debug(`Paddle event ${event.eventId} already processed, skipping`);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        message: 'Event already processed',
      } as APIResponse);
      return;
    }

    try {
      if (SUBSCRIPTION_EVENTS.has(event.eventType)) {
        await handleSubscriptionEvent(event.data as PaddleSubscriptionState);
      } else if (ADJUSTMENT_EVENTS.has(event.eventType)) {
        await handleAdjustmentEvent(event.data as PaddleAdjustmentState);
      } else {
        logger.debug(`Unhandled Paddle event: ${event.eventType}`);
      }

      await markEventProcessed(event.eventId);

      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        message: 'Webhook processed',
      } as APIResponse);
    } catch (error) {
      logger.error(error, 'Paddle webhook processing failed');
      // Non-2xx makes Paddle retry the delivery (idempotency key not yet marked)
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: 'Webhook processing failed',
      } as APIResponse);
    }
  });

  return router;
})();

async function handleSubscriptionEvent(sub: PaddleSubscriptionState): Promise<void> {
  const { previous, current, skipped } = await Services.Subscriptions.applyPaddleSubscription(sub);

  if (skipped) return;

  // Entitlement changed either way — the guild's channels move to match its
  // plan. On an upgrade this is the whole activation path: nothing joins the
  // guild any more, so no join event will do it instead.
  await Services.Entitlements.enforceTransition(previous, current);
}

/**
 * Adjustments also arrive for credits, chargeback warnings and reversals; only the ones
 * meaning "this guild got its money back" are recorded. The rest are routine, so they are
 * dropped at debug rather than warned about.
 */
async function handleAdjustmentEvent(adjustment: PaddleAdjustmentState): Promise<void> {
  if (!Services.Subscriptions.isRecordableRefund(adjustment)) {
    logger.debug(
      `Paddle adjustment ${adjustment.id} ignored (${adjustment.action}/${adjustment.type}, ${adjustment.status})`
    );
    return;
  }

  await Services.Subscriptions.recordRefund(adjustment);
}
