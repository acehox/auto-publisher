import { ServerSelector } from '@/components/dashboard/server-selector';

/**
 * Server-list page. Auth + the guild list are handled by the shared
 * `dashboard/layout`; ServerSelector reads the list from GuildListProvider,
 * so this page holds no data-fetching of its own.
 */
export default function DashboardPage() {
  return <ServerSelector />;
}
