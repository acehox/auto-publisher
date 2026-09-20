'use client';

import { NavbarBrandLink } from '@/components/layout/navbar-bar';
import { useRouteGuild } from './guild-list-context';
import { GuildSwitcher } from './server-switcher';

/**
 * The navbar's left slot inside a server. The switcher displaces the wordmark
 * below md: the product name states nothing an admin needs while managing a
 * server, and it buys back the row the switcher used to own. From md up the
 * shell renders the switcher itself, so the wordmark stays.
 */
export function NavbarGuildBrand() {
  const guild = useRouteGuild();

  // No server in scope: the server list, a failed list fetch, or a bad deep link.
  if (!guild) return <NavbarBrandLink />;

  return (
    <>
      <NavbarBrandLink className="hidden md:flex" />
      <div className="flex min-w-0 md:hidden">
        <GuildSwitcher current={guild} compact />
      </div>
    </>
  );
}
