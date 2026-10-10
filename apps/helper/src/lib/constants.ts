export const POLL_INTERVAL_MS = 60_000;

export const auditLogReasons = {
  grant: 'Auto Publisher: subscription active',
  revoke: 'Auto Publisher: subscription ended',
} as const;
