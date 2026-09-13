'use client';

import { createContext, useContext, useMemo } from 'react';
import { legacySunsetLabel } from '@/lib/constants';
import { getBotInviteUrl } from '@/lib/invite';
import type { SiteConfig } from '@/lib/site-config';

/**
 * Deployment config, server-rendered into the tree at the root layout.
 *
 * The default is the shape a misconfigured deployment would have rather than
 * the hosted service's: an absent provider must not silently render billing
 * upsells on a self-hosted copy.
 */
const SiteConfigContext = createContext<SiteConfig>({
  isPublicInstance: false,
  botId: '',
  freeChannelLimit: 0,
  filtersPerChannel: 0,
  legacySunsetDate: '',
  paddleClientToken: '',
  paddleEnvironment: 'sandbox',
});

export function SiteConfigProvider({
  config,
  children,
}: {
  config: SiteConfig;
  children: React.ReactNode;
}) {
  return <SiteConfigContext.Provider value={config}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig(): SiteConfig {
  return useContext(SiteConfigContext);
}

/** True only on the hosted service — gates every billing and upgrade surface. */
export function useIsPublicInstance(): boolean {
  return useContext(SiteConfigContext).isPublicInstance;
}

/**
 * MIGRATION: formatted legacy sunset date for the legacy surfaces. Removed with
 * the rest of the legacy UX at sunset.
 */
export function useLegacySunsetLabel(): string {
  const { legacySunsetDate } = useSiteConfig();
  return useMemo(() => legacySunsetLabel(legacySunsetDate), [legacySunsetDate]);
}

/** Bot invite URL for this deployment, or null when no client id is configured. */
export function useBotInviteUrl(
  guildId?: string,
  options?: { lockGuildSelect?: boolean }
): string | null {
  const config = useSiteConfig();
  const lockGuildSelect = options?.lockGuildSelect;
  return useMemo(
    () => getBotInviteUrl(config, guildId, { lockGuildSelect }),
    [config, guildId, lockGuildSelect]
  );
}
