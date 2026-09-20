import { auth } from '@/lib/auth';
import { AccountMenu } from './account-menu';
import { LoginButton, MobileAccount } from './nav-account';
import { dashboardLinks, siteLinks } from './nav-config';
import { NavbarBar } from './navbar-bar';

type NavUser = React.ComponentProps<typeof AccountMenu>['user'];

/**
 * Synchronous on purpose: a layout that has awaited `auth()` can render this in
 * a Suspense fallback, which an async component may not be — it would suspend
 * the fallback and push the boundary out of that layout.
 */
export function NavbarView({
  variant = 'site',
  user,
  brand,
}: {
  variant?: 'site' | 'dashboard';
  user: NavUser | null;
  brand?: React.ReactNode;
}) {
  return (
    <NavbarBar
      variant={variant}
      links={variant === 'dashboard' ? dashboardLinks : siteLinks}
      account={user ? <AccountMenu user={user} /> : <LoginButton />}
      mobileAccount={user ? <MobileAccount user={user} /> : <LoginButton fullWidth />}
      brand={brand}
    />
  );
}

/**
 * Navbar for sections that already render per request. Reading the session here
 * rather than in a client island keeps `SessionProvider` out of the tree and
 * drops the `/api/auth/session` round trip that flashes a placeholder in the
 * bar. It also opts the route into dynamic rendering, which is why the legal
 * pages use `StaticNavbar` instead.
 */
export async function Navbar({ variant = 'site' }: { variant?: 'site' | 'dashboard' }) {
  const session = await auth();

  return <NavbarView variant={variant} user={session?.user ?? null} />;
}
