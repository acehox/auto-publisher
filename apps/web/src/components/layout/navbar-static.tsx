import { AccountSlot, NavSessionProvider } from './account-slot';
import { siteLinks } from './nav-config';
import { NavbarBar } from './navbar-bar';

/**
 * Navbar for prerendered pages. Reads no session on the server, so the HTML is
 * the same for everyone and stays shared-cacheable (`s-maxage`); the account
 * slot fills in after hydration. Only the legal documents and the 404 use it —
 * every other section renders per request anyway and takes the server-resolved
 * `Navbar`.
 */
export function StaticNavbar() {
  return (
    <NavSessionProvider>
      <NavbarBar
        variant="site"
        links={siteLinks}
        account={<AccountSlot />}
        mobileAccount={<AccountSlot mobile />}
      />
    </NavSessionProvider>
  );
}
