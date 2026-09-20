'use client';

import { ChannelStatus } from '@/components/dashboard/channel-status';
import { useGuild } from '@/components/dashboard/guild-context';
import { GuildNotices } from '@/components/dashboard/guild-notices';
import { HowPublishingWorks } from '@/components/dashboard/how-publishing-works';
import { PageHeader } from '@/components/dashboard/page-header';

/**
 * Guild Overview — the attention surface and default landing tab. The ambient
 * facts close the page, same component and same guard as the Channels tab, so
 * the two tabs state them identically.
 */
export default function OverviewPage() {
  const { guild, data } = useGuild();

  return (
    <div className="space-y-4">
      <PageHeader title="Overview" />
      <GuildNotices />
      <ChannelStatus />
      {data.channels.length > 0 && <HowPublishingWorks hasSubscription={guild.hasSubscription} />}
    </div>
  );
}
