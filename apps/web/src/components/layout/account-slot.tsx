'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { AccountMenu } from './account-menu';
import { LoginButton, MobileAccount } from './nav-account';

/**
 * One provider, so the desktop and mobile slots share a session request instead
 * of making one each. Focus refetching is off — the only state it would catch
 * is a logout in another tab, on a document page.
 */
export function NavSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}

/**
 * Client-side session, used only where the page must stay prerenderable — a
 * document whose HTML names the signed-in user can never be shared-cached.
 * Everywhere else the server reads the session and this never mounts.
 */
export function AccountSlot({ mobile = false }: { mobile?: boolean }) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div
        className={
          mobile ? 'h-11 w-full rounded-md bg-slate-800/50' : 'h-9 w-28 rounded-md bg-slate-800/50'
        }
      />
    );
  }

  if (!session?.user) {
    return <LoginButton fullWidth={mobile} />;
  }

  return mobile ? <MobileAccount user={session.user} /> : <AccountMenu user={session.user} />;
}
