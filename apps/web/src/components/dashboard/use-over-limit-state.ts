'use client';

import type { OverLimitState } from '@ap/copy';
import { useGuild } from '@/components/dashboard/guild-context';
import { useIsPublicInstance } from '@/components/site-config-context';

/**
 * What happens to a message past Discord's hourly limit, for every surface that
 * states it. `upsell` only on the public instance's Free plan (`channelLimit !== 0`
 * is the free plan): a self-host has no plan to sell.
 */
export function useOverLimitState(): OverLimitState {
  const { data } = useGuild();
  const isPublicInstance = useIsPublicInstance();
  if (isPublicInstance && data.channelLimit !== 0) return 'upsell';
  return data.rolloverEnabled ? 'on' : 'off';
}
