import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthRedirect } from '@/components/auth/auth-redirect';
import { DashboardLoadingSkeleton } from '@/components/dashboard/dashboard-loading';
import { GuildListProvider } from '@/components/dashboard/guild-list-context';
import { Navbar } from '@/components/layout/navbar';
import { SiteShell } from '@/components/layout/site-shell';
import { getUserGuilds } from '@/lib/api/actions';
import { AuthExpiredError } from '@/lib/api/backend';
import type { DiscordGuild } from '@/lib/api/types';
import { auth } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Dashboard | Auto Publisher',
  description: 'Manage your Discord servers, channels, and subscriptions.',
};

/**
 * Fetches the managed-guild list ONCE for the whole dashboard and seeds the
 * client GuildListProvider. This shared layout isn't re-run on guild-to-guild
 * navigation (Next caches it), so the switcher/sidebar stay populated without
 * re-fetching. Both the server-list page and the switcher read the same list
 * from context (ADR 0007, 2026-07-15). The fetch is wrapped in a Suspense so a
 * cold load shows a route-appropriate skeleton instead of a blank.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user) {
    return (
      <SiteShell nav={<Navbar />}>
        <AuthRedirect callbackUrl="/dashboard" />
      </SiteShell>
    );
  }

  return (
    <SiteShell nav={<Navbar variant="dashboard" />}>
      <Suspense fallback={<DashboardLoadingSkeleton />}>
        <GuildListLoader>{children}</GuildListLoader>
      </Suspense>
    </SiteShell>
  );
}

async function GuildListLoader({ children }: { children: React.ReactNode }) {
  let guilds: DiscordGuild[] = [];
  let error = false;
  try {
    guilds = await getUserGuilds();
  } catch (e) {
    // A dead Discord token (session valid, token expired) is not a generic
    // failure — re-login instead of the "Something went wrong" card (ADR 0010).
    if (e instanceof AuthExpiredError) {
      return <AuthRedirect callbackUrl="/dashboard" />;
    }
    error = true;
  }

  return (
    <GuildListProvider guilds={guilds} error={error}>
      {children}
    </GuildListProvider>
  );
}
