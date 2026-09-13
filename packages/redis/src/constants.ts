export enum DatabaseIDs {
  Channels = 0,
  CrosspostQueue = 1,
  SublimitCounter = 2,
  BlockedChannels = 3,
  DiscordAuth = 4,
  // MIGRATION: retired at sunset (v6→v7 migration markers, derived from guild.migratedAt)
  MigratedGuilds = 5,
  PaddleWebhookDedupe = 6,
  // 7 retired (was LegacyGuildPerms) — legacy canPublish maps now recompute from
  // the backend's in-memory Discord read cache (ADR 0007)
  Alerts = 8,
  // 9, 10, 11 retired — were the premium proxy's queue/sublimit/denylist triple
  // back when each edition ran its own bot, proxy and token.
  // 12 retired (was PremiumPending) — the premium handover marker; there is one
  // bot now, so nothing ever idles waiting to take a guild over.
  // Per-guild publish-state hash (backend-owned; the bot pushes, dashboard + gate read)
  PublishState = 13,
  // Per-guild queue-priority state, backend-written and proxy-read at enqueue:
  // the onboarding boost budget (`boost:{guildId}`, remaining priority
  // publishes, 90d TTL) and the Premium marker (`premium:{guildId}`, no TTL).
  // One DB because they answer the same question — which tier does this guild's
  // next crosspost enter at — and the proxy reads both on the same hot path.
  QueuePriority = 14,
}

export enum Keys {
  Channel = 'channel',
  Sublimit = 'channel:sublimit',
  Blocked = 'channel:blocked',
  // MIGRATION: removed at sunset with the MigratedGuilds DB
  MigratedGuild = 'migrated_guild',
  PaddleEvent = 'paddle_event',
  Alert = 'alert',
  PublishState = 'publish_state',
  Boost = 'boost',
  // Presence = the guild is entitled to Premium. Written by
  // `Plans.reconcileChannelServing`, the one place entitlement is resolved.
  PremiumGuild = 'premium',
}
