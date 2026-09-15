'use client';

import { ChannelStatus } from '@/components/dashboard/channel-status';
import { GuildNotices } from '@/components/dashboard/guild-notices';
import { PageHeader } from '@/components/dashboard/page-header';

/**
 * Guild Overview — the attention surface and default landing tab. One status
 * card plus at most a couple of one-line strips; the strip below the card is
 * the paused notice, which only moves there when the card is in error
 * (`GuildNotices`).
 */
export default function OverviewPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Overview" />
      <GuildNotices position="above" />
      <ChannelStatus />
      <GuildNotices position="below" />
    </div>
  );
}
