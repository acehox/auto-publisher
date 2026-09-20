'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext } from 'react';
import type { DiscordGuild } from '@/lib/api/types';

interface GuildListContextValue {
  guilds: DiscordGuild[];
  error: boolean;
}

const GuildListContext = createContext<GuildListContextValue | null>(null);

/**
 * Holds the user's managed-guild list once, seeded server-side in the shared
 * `dashboard/layout` (RSC). Pass-through (no local state): the server re-seeds
 * on every hard load and Next keeps this layout mounted across nested
 * navigation, so the switcher/sidebar never blank on guild-to-guild switches;
 * `router.refresh()` (mutations + post-invite focus) delivers a fresh value.
 * No browser storage — a hard reload re-seeds fresh, so the list can't drift.
 */
export function GuildListProvider({
  guilds,
  error,
  children,
}: GuildListContextValue & { children: React.ReactNode }) {
  return (
    <GuildListContext.Provider value={{ guilds, error }}>{children}</GuildListContext.Provider>
  );
}

export function useGuildList(): GuildListContextValue {
  const context = useContext(GuildListContext);
  if (!context) {
    throw new Error('useGuildList must be used within GuildListProvider');
  }
  return context;
}

/** The current guild by id, or undefined if it isn't in the seeded list. */
export function useCurrentGuild(guildId: string): DiscordGuild | undefined {
  return useGuildList().guilds.find(g => g.id === guildId);
}

/**
 * The open route's guild, for chrome above the `[guildId]` segment that has no
 * param. Undefined off a guild route, on a failed list fetch, or for a guild the
 * user can't reach.
 */
export function useRouteGuild(): DiscordGuild | undefined {
  const guildId = usePathname().match(/^\/dashboard\/([^/]+)/)?.[1];
  return useGuildList().guilds.find(g => g.id === guildId);
}
