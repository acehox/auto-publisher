import type { FilterMatchMode, FilterType } from '@ap/validations';

/** Re-exported so the web can depend on @ap/api-types alone. */
export type { FilterMatchMode, FilterType };

/**
 * Why a channel enable/migrate was rejected for hitting the per-guild cap.
 * One member, kept as a named type so both clients branch on the error `code`
 * rather than assuming every 400 is a limit hit.
 */
export type ChannelLimitReason = 'LIMIT_FREE';

/** Guild entry from GET /api/user/guilds */
export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
  /** Whether the bot is currently in the guild. */
  botPresent: boolean;
  /** MIGRATION: false = legacy guild (auto-publishes everything). Removed at sunset. */
  migrated: boolean;
  hasSubscription: boolean;
}

/** Guild role for the mention-filter picker (subset of Discord's role object) */
export interface GuildRole {
  id: string;
  name: string;
  /** Discord role color as an integer (0 = no color / default) */
  color: number;
}

/** Channel filter condition (JSON-serialized) */
export interface ChannelFilterRule {
  id: string;
  type: FilterType;
  /** true = negated operator ("doesn't contain"/"is not"); replaces the old allow/block mode */
  negate: boolean;
  values: string[];
  createdAt: string;
}

/** Guild channel with filters (enriched with Discord channel info) */
export interface GuildChannel {
  channelId: string;
  /**
   * null = registered but not returned by Discord: hidden by private-channel
   * obfuscation, or deleted while the bot was offline. Nullable rather than a
   * `hidden` flag because we cannot tell those two apart — and the nullable type
   * forces every render site to handle it.
   */
  name: string | null;
  type: number;
  enabled: boolean;
  filters: ChannelFilterRule[];
  filterMode: FilterMatchMode;
  /**
   * Whether the bot can currently crosspost here (from the publish-state cache,
   * ADR 0008). Present on every channel of the dashboard aggregate; also drives
   * legacy migrate-modal preselection.
   */
  canPublish?: boolean;
  /**
   * True for a disabled channel whose config is retained because a plan change
   * paused it (ADR 0009) — either for carrying filters or for the over-limit
   * trim. Only ever true when `enabled` is false. It does NOT say which cause,
   * so copy about filters must read `filters.length`, never this flag.
   */
  hasSavedSetup?: boolean;
}

/** Subscription status (mirrors Paddle statuses verbatim) */
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';

/** Billing interval */
export type BillingInterval = 'month' | 'year';

/** Pending scheduled change on a subscription (cancel/pause at period end) */
export interface SubscriptionScheduledChange {
  action: 'cancel' | 'pause' | 'resume';
  effectiveAt: string;
}

/** Subscription summary (part of the guild dashboard aggregate) */
export interface SubscriptionData {
  status: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  currentPeriodEndsAt: string | null;
  scheduledChange: SubscriptionScheduledChange | null;
  canceledAt: string | null;
  /** Whether the current requester is the subscriber (drives the manage-vs-note branch at first paint) */
  isSubscriber: boolean;
}

/** The Discord user who paid for the subscription */
export interface SubscriptionSubscriber {
  id: string;
  /** Resolved display name; null when resolution failed or requester is the subscriber */
  username: string | null;
}

/**
 * Statutory withdrawal state (ZZP čl. 81.a / CRD Art 11a); subscriber-only.
 * Statement fields are server-composed: shown = stored = emailed.
 */
export interface WithdrawalState {
  /** Keyed to the 14-day window ONLY — never status or a scheduled cancellation. */
  eligible: boolean;
  /** End of the withdrawal window; null when the contract start is unknown. */
  windowEndsAt: string | null;
  consumerName: string;
  contractReference: string;
  /**
   * Contract identification for DISPLAY (Art 11a(2)(b)) — the consumer confirms it,
   * so it must be on screen. `contractReference` is for the record and email.
   */
  contractDisplay: {
    /** Guild name, or `Server <id>` when the Discord name read failed. */
    server: string;
    /** Product plus billing interval, e.g. `Auto Publisher Premium (yearly)`. */
    plan: string;
  };
  /**
   * Set once a withdrawal is recorded; the panel then renders nothing — never a
   * live control on an already-withdrawn contract. No "pending" state exists.
   */
  confirmedAt: string | null;
}

/**
 * Full subscription detail from GET /api/guild/:guildId/subscription.
 * Both portal URLs are set only when the requester is the subscriber.
 */
export interface SubscriptionDetail extends SubscriptionData {
  portalUrl: string | null;
  cancelUrl: string | null;
  subscriber: SubscriptionSubscriber;
  /** Null for a non-subscriber, and for a guild with no subscription at all. */
  withdrawal: WithdrawalState | null;
}

/** Outcome of a completed withdrawal. */
export interface WithdrawalResult {
  /** st. 7 — decides timeliness. Equal to `confirmedAt` by construction. */
  submittedAt: string;
  confirmedAt: string;
  /** Where the statutory acknowledgement was sent (st. 6). */
  notificationAddress: string;
  /** False = ack email did not leave (retry sweep owns it); UI must not claim it was sent. */
  acknowledged: boolean;
  /**
   * Paddle adjustment status; `'none'` when there was no payment to return (a withdrawal
   * inside the free trial), null when raising it failed. Never collapse the two: one means
   * nothing was owed, the other that something is owed and did not happen.
   */
  refundStatus: string | null;
}

/** Guild dashboard aggregate response */
export interface GuildDashboardData {
  /** MIGRATION: false = legacy guild (auto-publishes everything). Removed at sunset. */
  migrated: boolean;
  /** Max enabled channels for the guild's plan; 0 = unlimited (Premium) */
  channelLimit: number;
  /**
   * Whether an upgrade started now would carry the 14-day free trial: the guild has never
   * held a subscription (one trial per guild, ever) AND both trial prices are configured.
   * Server-decided by the same predicate the checkout route picks the price with — never
   * re-derive it client-side. Every trial claim in the UI is gated on this, because a claim
   * the checkout then contradicts creates a second 14-day withdrawal right over a real charge.
   */
  trialAvailable: boolean;
  channels: GuildChannel[];
  subscription: SubscriptionData | null;
}

/** Checkout response: transaction ID consumed by Paddle.js overlay checkout */
export interface CheckoutResponse {
  transactionId: string;
}
