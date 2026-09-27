import { siteLinks } from './nav-config';
import { NavbarBar } from './navbar-bar';

export function StaticNavbar() {
  return <NavbarBar variant="site" links={siteLinks} account={null} mobileAccount={null} />;
}
