import { redirect } from 'next/navigation';
import { GuildDashboardShell } from '@/components/dashboard/guild-dashboard-shell';
import { getGuildDashboard } from '@/lib/api/actions';
import {
  AUTH_EXPIRED,
  BOT_ABSENT,
  GUILD_UNAVAILABLE,
  type GuildLoadFailure,
  TRANSIENT_ERROR,
} from '@/lib/api/auth-expired';
import { AuthExpiredError, BackendError } from '@/lib/api/backend';
import type { GuildDashboardData } from '@/lib/api/types';
import { auth } from '@/lib/auth';

export default async function GuildLayout({
  params,
  children,
}: {
  params: Promise<{ guildId: string }>;
  children: React.ReactNode;
}) {
  const [session, { guildId }] = await Promise.all([auth(), params]);

  if (!session?.user) {
    redirect('/dashboard');
  }

  // Stream the guild-detail payload as a promise — do NOT await it here. The
  // shell chrome (switcher/sidebar) renders instantly from the persisted guild
  // list; only the content + attention badge suspend on this.
  // Authorization + presence are enforced by the detail read
  // itself (requireGuildPermission + a botless-guild throw): a rejection surfaces
  // at the content's `use()` and the shell's error boundary redirects to the
  // server list, so no separate presence gate is needed here.
  //
  // Failures are mapped to serializable sentinels rather than left to reject:
  // errors are sanitized across the RSC boundary, so the client can't tell
  // auth-expiry from a botless guild from a transient blip by error identity.
  // useGuild() turns each sentinel back into a typed client-side throw the
  // boundary routes to the matching recovery — re-login (401), offer the bot
  // invite in place (409 BOT_NOT_PRESENT), redirect to the server list
  // (403/404), or stay + retry (5xx / network).
  const dataPromise: Promise<GuildDashboardData | GuildLoadFailure> = getGuildDashboard(guildId)
    .then(raw => ({
      ...raw,
      channels: (raw.channels ?? []).map(ch => ({
        ...ch,
        filters: ch.filters ?? [],
      })),
    }))
    .catch((err: unknown): GuildLoadFailure => {
      if (err instanceof AuthExpiredError) return AUTH_EXPIRED;
      // Before the generic branch, and keyed on the `code` rather than the 409
      // status, so any other 409 keeps the safe redirect.
      if (err instanceof BackendError && err.status === 409 && err.code === 'BOT_NOT_PRESENT') {
        return BOT_ABSENT;
      }
      if (err instanceof BackendError && [403, 404, 409].includes(err.status)) {
        return GUILD_UNAVAILABLE;
      }
      return TRANSIENT_ERROR;
    });

  return (
    <GuildDashboardShell guildId={guildId} dataPromise={dataPromise}>
      {children}
    </GuildDashboardShell>
  );
}
