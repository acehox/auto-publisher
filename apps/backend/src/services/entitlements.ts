import type { Subscription } from '@ap/database';
import { Plans } from './plans.js';
import { isEntitledStatus } from './subscriptions.js';

/**
 * Applies a change of Premium entitlement to a guild's channels.
 *
 * Nothing joins or leaves the guild — one bot serves every plan, so an
 * entitlement change is a change of what that bot publishes, not of where it is.
 * `reconcileChannelServing` resolves the plan and moves the channels to match:
 * a downgrade pauses the guild to the free shape (filtered channels, then the
 * excess beyond the cap), an upgrade restores every paused row untouched
 * (ADR 0009). Idempotent, which is what lets the webhook path and the reconcile
 * backstop both call it without tracking whether the other already did.
 */
const apply = async (guildId: string): Promise<void> => {
  await Plans.reconcileChannelServing(guildId);
};

const wasEntitled = (sub: Subscription | undefined): boolean =>
  !!sub && isEntitledStatus(sub.status);

/**
 * Entitled → not-entitled. A type guard so callers can safely read
 * `current.guildId`. The reconcile cron collects these across a whole pass so a
 * circuit breaker can catch a Paddle mass-cancel before any guild is trimmed —
 * the grant direction needs no such guard, since un-pausing a guild's own
 * channels is never destructive.
 */
const isRevocation = (
  previous: Subscription | undefined,
  current: Subscription | undefined
): current is Subscription => !!current && wasEntitled(previous) && !wasEntitled(current);

/** Not-entitled → entitled. The upgrade an admin just paid for. */
const isGrant = (
  previous: Subscription | undefined,
  current: Subscription | undefined
): current is Subscription => !!current && !wasEntitled(previous) && wasEntitled(current);

/**
 * Enforces an entitlement change in EITHER direction (webhook path, single
 * guild — no mass-action guard needed).
 *
 * Both directions matter: a grant is the only thing that un-pauses the channels
 * a downgrade paused, and no bot joins on upgrade any more, so this webhook is
 * the whole of the activation path.
 */
const enforceTransition = async (
  previous: Subscription | undefined,
  current: Subscription | undefined
): Promise<void> => {
  const changed = isRevocation(previous, current) || isGrant(previous, current);
  if (changed) await apply(current.guildId);
};

export const Entitlements = {
  apply,
  enforceTransition,
  isRevocation,
  isGrant,
};
