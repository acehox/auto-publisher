import { auth } from '@/lib/auth';
import { AccountMenu } from './account-menu';
import { LoginButton, MobileAccount } from './nav-account';
import { dashboardLinks, siteLinks } from './nav-config';
import { NavbarBar } from './navbar-bar';

/**
 * Navbar for sections that already render per request. Reading the session here
 * rather than in a client island keeps `SessionProvider` out of the tree and
 * drops the `/api/auth/session` round trip that flashes a placeholder in the
 * bar. It also opts the route into dynamic rendering, which is why the legal
 * pages use `StaticNavbar` instead.
 */
export async function Navbar({ variant = 'site' }: { variant?: 'site' | 'dashboard' }) {
  const session = await auth();
  const user = session?.user ?? null;

  return (
    <NavbarBar
      variant={variant}
      links={variant === 'dashboard' ? dashboardLinks : siteLinks}
      account={user ? <AccountMenu user={user} /> : <LoginButton />}
      mobileAccount={user ? <MobileAccount user={user} /> : <LoginButton fullWidth />}
    />
  );
}
