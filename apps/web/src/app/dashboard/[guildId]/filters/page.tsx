'use client';

import { FilterManager } from '@/components/dashboard/filter-config';
import { useGuild } from '@/components/dashboard/guild-context';
import { LockedFeature } from '@/components/dashboard/locked-feature';
import { useIsPublicInstance } from '@/components/site-config-context';

export default function FiltersPage() {
  const { guild, data } = useGuild();
  // A self-hosted instance has no billing: filters are part of the base feature
  // set, so the tab is always unlocked. On the public instance an entitled
  // subscription is the whole gate — one bot serves both plans, so there is no
  // second condition to satisfy. Enforced server-side too (PREMIUM_INACTIVE).
  const isPublicInstance = useIsPublicInstance();
  const isPremium = !isPublicInstance || guild.hasSubscription;

  // Header is rendered at the page level so the "Channel Filters" title shows
  // in both the free (upsell) and premium (manager) states, mirroring the
  // subscription page's always-on section title.
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl text-white">Channel Filters</h2>
        <p className="text-slate-400">
          Choose exactly which messages auto-publish from each channel.
        </p>
      </div>

      {isPremium ? (
        <FilterManager guildId={guild.id} channels={data.channels} />
      ) : (
        // Left-aligned max-w-2xl to match the Subscription page's entitled card:
        // the upsell now carries a rule-editor preview, which a max-w-md column
        // squeezed into wrapping nonsense.
        <div className="max-w-2xl">
          {/* Copy lives in PREMIUM_FEATURE_BLURBS.filters, keyed by this tab's
              own segment. */}
          <LockedFeature guildId={guild.id} feature="filters" />
        </div>
      )}
    </div>
  );
}
