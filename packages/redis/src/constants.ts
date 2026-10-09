// Redis ships 16 DBs (0-15); an id past 15 needs `--databases` on every
// compose file, the self-host one included. A DB is named for what its keys
// identify; the key prefix names what the value means.
export enum DatabaseIDs {
  CrosspostQueue = 0,
  EnabledChannels = 1,
  GatedChannels = 2,
  Guilds = 3,
  Alerts = 4,
  DashboardAuth = 5,
  PaddleWebhookDedupe = 6,
}

export enum Keys {
  Enabled = 'enabled',
  SublimitLock = 'sublimit_lock',
  Blocked = 'blocked',
  Migrated = 'migrated', // MIGRATION: removed at sunset, with a one-off SCAN + DEL of `migrated:*`
  ChannelPermissions = 'channel_permissions',
  Alert = 'alert',
  PaddleEvent = 'paddle_event',
}

// The one place a key is spelled, so a writer and its reader cannot drift apart.
const keyFor = (prefix: Keys) => (id: string) => `${prefix}:${id}`;

export const RedisKeys = {
  enabled: keyFor(Keys.Enabled),
  sublimitLock: keyFor(Keys.SublimitLock),
  blocked: keyFor(Keys.Blocked),
  migrated: keyFor(Keys.Migrated),
  channelPermissions: keyFor(Keys.ChannelPermissions),
  alert: keyFor(Keys.Alert),
  paddleEvent: keyFor(Keys.PaddleEvent),
} as const;

export const keyPattern = (prefix: Keys) => `${prefix}:*`;

export const idFromKey = (prefix: Keys, key: string) => key.slice(prefix.length + 1);
