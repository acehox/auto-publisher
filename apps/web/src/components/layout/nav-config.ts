import { isPublicInstance } from '@ap/config';
import { links } from '@/lib/constants';

export interface NavLinkItem {
  href: string;
  label: string;
  external: boolean;
}

const routeLinks: NavLinkItem[] = [
  { href: '/how-it-works', label: 'How It Works', external: false },
  { href: '/premium', label: 'Premium', external: false },
  // TODO: re-enable when the Status page is ready.
  // { href: '/status', label: 'Status', external: false },
  { href: links.githubRepo, label: 'GitHub', external: true },
];

// A self-hosted instance has no billing, so /premium 404s — don't link to it.
export const siteLinks: NavLinkItem[] = isPublicInstance
  ? routeLinks
  : routeLinks.filter(link => link.href !== '/premium');

// MIGRATION: drop the migration guide with the rest of the migration UX at sunset.
export const dashboardLinks: NavLinkItem[] = [
  { href: '/migration', label: 'Migration Guide', external: false },
  { href: links.discordSupportServer, label: 'Support Server', external: true },
];
