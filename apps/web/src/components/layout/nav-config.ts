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
  { href: '/guides', label: 'Guides', external: false },
  { href: links.githubRepo, label: 'GitHub', external: true },
];

// Both 404 on a self-hosted instance: it has no billing, and the guides describe the public bot.
export const publicOnlyHrefs = new Set(['/premium', '/guides']);

export const siteLinks: NavLinkItem[] = isPublicInstance
  ? routeLinks
  : routeLinks.filter(link => !publicOnlyHrefs.has(link.href));

// MIGRATION: drop the migration guide with the rest of the migration UX at sunset.
export const dashboardLinks: NavLinkItem[] = [
  { href: '/migration', label: 'Migration Guide', external: false },
  { href: links.discordSupportServer, label: 'Support Server', external: true },
];
