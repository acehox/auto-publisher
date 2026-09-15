'use client';

import { FilterManager } from '@/components/dashboard/filter-config';
import { useGuild } from '@/components/dashboard/guild-context';
import { LockedFeature } from '@/components/dashboard/locked-feature';
import { PageHeader } from '@/components/dashboard/page-header';
import { useIsPublicInstance } from '@/components/site-config-context';

export default function FiltersPage() {
  const { guild, data } = useGuild();
  // A self-hosted instance has no billing: filters are part of the base feature
  // set, so the tab is always unlocked. On the public instance an entitled
  // subscription is the whole gate — one bot serves both plans, so there is no
  // second condition. Enforced server-side too (PREMIUM_INACTIVE).
  const isPublicInstance = useIsPublicInstance();
  const isPremium = !isPublicInstance || guild.hasSubscription;

  return (
    <div className="space-y-4">
      <PageHeader title="Filters" />
      {isPremium ? (
        <FilterManager guildId={guild.id} channels={data.channels} />
      ) : (
        <LockedFeature guildId={guild.id} trialAvailable={data.trialAvailable} />
      )}
    </div>
  );
}
