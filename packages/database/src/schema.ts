import { relations, sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export type ChannelFilter = {
  id: string;
  type: string;
  // true = negated operator ("doesn't contain"/"is not")
  negate: boolean;
  values: string[];
  createdAt: Date;
};

export const guild = pgTable('guild', {
  // Discord snowflakes are immutable and never reused — safe natural PK.
  guildId: text('guild_id').primaryKey(),
  // NULL = legacy guild (auto-publishes all announcement channels, pre-v7 model).
  // MIGRATION: dropped together with the MigratedGuilds Redis DB at sunset.
  migratedAt: timestamp('migrated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});

export const guildRelations = relations(guild, ({ many, one }) => ({
  channels: many(channel),
  botPresence: one(botPresence),
}));

// Bot membership; unrelated to Discord user presence. leftAt is a soft delete so
// config survives a re-invite — reconciliation purges the guild 30 days after the
// bot left. One row per guild: there is one bot, and Free/Premium are per-guild
// subscription tiers rather than separate applications.
export const botPresence = pgTable('bot_presence', {
  guildId: text('guild_id')
    .primaryKey()
    .references(() => guild.guildId, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  leftAt: timestamp('left_at', { withTimezone: true }),
});

export const botPresenceRelations = relations(botPresence, ({ one }) => ({
  guild: one(guild, { fields: [botPresence.guildId], references: [guild.guildId] }),
}));

export const channel = pgTable(
  'channel',
  {
    channelId: text('channel_id').primaryKey(),
    guildId: text('guild_id')
      .notNull()
      .references(() => guild.guildId, { onDelete: 'cascade' }),
    filters: jsonb('filters').$type<ChannelFilter[]>().default([]).notNull(),
    // any = OR, all = AND.
    filterMode: text('filter_mode').default('all').notNull(),
    // Set by the system trim when a guild drops to free-managed over its channel
    // limit: config is retained but the channel leaves the allowlist and the limit
    // count. Only ever written by the trim, never by a user toggle (ADR 0009).
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  table => [index('channel_guild_id_idx').on(table.guildId)]
);

export const channelRelations = relations(channel, ({ one }) => ({
  guild: one(guild, { fields: [channel.guildId], references: [guild.guildId] }),
}));

// No FK to guild: a subscription outlives the guild row, so a bot kick can never
// cancel billing.
export const subscription = pgTable('subscription', {
  // Surrogate PK over the two candidate keys, so a future row-per-Paddle-subscription
  // history model stays open.
  id: uuid('id').primaryKey().defaultRandom(),
  guildId: text('guild_id').unique().notNull(),
  paddleSubscriptionId: text('paddle_subscription_id').unique().notNull(),
  paddleCustomerId: text('paddle_customer_id').notNull(),
  // NULL = retained row whose subscriber identity retention already erased at 24
  // months (services/retention.ts), not missing data.
  subscriberDiscordUserId: text('subscriber_discord_user_id'),
  status: text('status').notNull(),
  paddlePriceId: text('paddle_price_id'),
  billingInterval: text('billing_interval'),
  // Paddle `started_at` — contract conclusion, fixed for the contract's life.
  startedAt: timestamp('started_at', { withTimezone: true }),
  // Anchor of the statutory 14-day withdrawal window. Sticky across renewals
  // (C-565/22 Sofatutor), re-stamped only on a price/interval change. ⚠️ Anchoring on
  // currentPeriodStartsAt instead would grant a fresh full-refund right every period.
  withdrawalPeriodStartsAt: timestamp('withdrawal_period_starts_at', { withTimezone: true }),
  // Pro-rating only, never eligibility. ⚠️ Never derive by subtracting the interval
  // from currentPeriodEndsAt; proration and plan changes break that arithmetic.
  currentPeriodStartsAt: timestamp('current_period_starts_at', { withTimezone: true }),
  currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true }),
  scheduledChangeAction: text('scheduled_change_action'),
  scheduledChangeAt: timestamp('scheduled_change_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  // Paddle's updated_at for the applied state — rejects out-of-order webhook deliveries
  lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
  // Newest approved refund or chargeback against any subscription this guild has held,
  // including refunds Paddle issues under its own buyer terms (which never touch the
  // `withdrawal` table). Nothing reads it yet, on purpose — it collects evidence for a
  // possible repeat refund-and-rebuy policy. Not dead code.
  //
  // ⚠️ The only column here that is not mirrored Paddle state, so the only one that must
  // survive a re-subscribe. It survives only because every Paddle-derived write is a
  // partial update over PaddleSubscriptionValues, which omits it; an upsert or a row
  // spread erases it at the moment it becomes interesting.
  lastRefundAt: timestamp('last_refund_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});

/**
 * One row per submitted statutory withdrawal (ZZP čl. 81.a / CRD Art 11a) — the čl. 64
 * evidence. No FK to guild or subscription: the record has to outlive both.
 */
export const withdrawal = pgTable(
  'withdrawal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: text('guild_id').notNull(),
    paddleSubscriptionId: text('paddle_subscription_id').notNull(),
    paddleTransactionId: text('paddle_transaction_id'),
    // Stored as presented rather than as references: the evidence must show what the
    // consumer saw and confirmed, not what the live rows say now.
    consumerName: text('consumer_name').notNull(),
    contractReference: text('contract_reference').notNull(),
    // Immutable counterpart to the username in consumerName, which is both changeable
    // and reclaimable by someone else. Kept out of the statement text so it can be
    // erased at 24 months without mangling the evidence — the same clock the id keeps
    // on `subscription`.
    subscriberDiscordUserId: text('subscriber_discord_user_id'),
    // The only field the consumer fills in (st. 3 t. 3). NULL = retained row whose
    // address was erased at 24 months; the obligation is discharged by sending, so it
    // never rides the 11-year clock. Erasure also requires acknowledgedAt.
    notificationAddress: text('notification_address'),
    // st. 7 — timeliness is decided by submission.
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    // ⚠️ Necessarily equal to submittedAt: one sending event, one insert. Two columns
    // because `confirmedAt IS NOT NULL` is what "a withdrawal happened" means to
    // retention and the retry sweep. Never reintroduce a row where this is NULL.
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    // st. 6 — set only once the acknowledgement actually left. NULL after a confirm
    // means a statutory duty is outstanding; the sender retries and alerts.
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    // Paddle adjustment `status:id`, or a failure reason. Requested is not approved.
    refundOutcome: text('refund_outcome'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  table => [
    index('withdrawal_guild_id_idx').on(table.guildId),
    index('withdrawal_subscription_id_idx').on(table.paddleSubscriptionId),
    // Double-confirm guard: the route's pre-check is not atomic with the insert and
    // the effects include a refund. Scoped to the subscription, not the guild, so a
    // re-subscribe gets its own row.
    uniqueIndex('withdrawal_confirmed_subscription_unique')
      .on(table.paddleSubscriptionId)
      .where(sql`${table.confirmedAt} is not null`),
  ]
);

export type Guild = typeof guild.$inferSelect;
export type Channel = typeof channel.$inferSelect;
export type BotPresence = typeof botPresence.$inferSelect;
export type NewBotPresence = typeof botPresence.$inferInsert;
export type Subscription = typeof subscription.$inferSelect;
export type NewSubscription = typeof subscription.$inferInsert;
export type Withdrawal = typeof withdrawal.$inferSelect;
export type NewWithdrawal = typeof withdrawal.$inferInsert;
