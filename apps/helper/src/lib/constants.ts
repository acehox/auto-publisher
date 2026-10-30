export const POLL_INTERVAL_MS = 60_000;

// Tested by the compose healthcheck; the helper has no HTTP server.
export const READY_FILE = '/tmp/helper-ready';

export const auditLogReasons = {
  grant: 'Auto Publisher: subscription active',
  revoke: 'Auto Publisher: subscription ended',
} as const;
