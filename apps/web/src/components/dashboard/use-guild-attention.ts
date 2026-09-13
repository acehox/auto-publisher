'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useGuild } from '@/components/dashboard/guild-context';
import { useIsPublicInstance } from '@/components/site-config-context';

// Same-tab listeners for the localStorage dismissal marker: the native `storage`
// event only fires in OTHER tabs, so dismiss() notifies these directly. Shared at
// module scope so every hook instance (banner stack + sidebar badge) stays in sync.
const dismissalListeners = new Set<() => void>();

/**
 * Reads a per-browser dismissal marker from localStorage via useSyncExternalStore
 * — SSR-safe (server snapshot = dismissed/hidden, so no hydration flash or
 * mismatch) and without a synchronous setState inside an effect (React flags that
 * as cascading renders).
 */
export function usePersistentDismissal(key: string): [boolean, () => void] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    dismissalListeners.add(onStoreChange);
    window.addEventListener('storage', onStoreChange);
    return () => {
      dismissalListeners.delete(onStoreChange);
      window.removeEventListener('storage', onStoreChange);
    };
  }, []);
  const dismissed = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key) === '1',
    () => true
  );
  const dismiss = useCallback(() => {
    window.localStorage.setItem(key, '1');
    for (const listener of dismissalListeners) listener();
  }, [key]);
  return [dismissed, dismiss];
}

export interface GuildAttention {
  /** MIGRATION: legacy guild (auto-publishes everything). Removed at sunset. */
  showMigration: boolean;
  /** Over the free limit with retained (paused) channels AND not dismissed */
  showPaused: boolean;
  /** Count of paused (retained) channels — drives the paused banner copy */
  pausedCount: number;
  /** Enabled channels the bot currently can't publish in (migrated only) */
  needsFixingCount: number;
  /** ≥1 enabled channel the bot can't publish in (migrated only) — drives the misconfigured banner */
  showMisconfigured: boolean;
  /**
   * Attention items for the Overview sidebar badge: one per active nag banner
   * (misconfigured channels, legacy migration, paused). Any number of broken
   * channels collapse into the single misconfigured banner, so they count once
   * regardless of how many. The positive checkout-success card never counts.
   */
  badgeCount: number;
  /** Dismiss the paused-channels banner (episode-scoped, per-browser). */
  dismissPaused: () => void;
}

/**
 * Single source of truth for the guild's attention state, consumed by both the
 * Overview banner stack (what to render) and the sidebar badge (how many items).
 * Must be called within a GuildProvider.
 */
export function useGuildAttention(): GuildAttention {
  const { guild, data } = useGuild();
  // A self-hosted instance has no billing, so it never caps a guild and the
  // paused banner is unreachable there. Gated at the source so the banner stack
  // and the sidebar badge can't disagree. Migration is not billing; it stays.
  const isPublicInstance = useIsPublicInstance();

  const showMigration = !data.migrated;

  // Paused-channels state: the guild is on the free plan (channelLimit !== 0)
  // and has retained channels it is no longer serving. ADR 0009.
  const pausedCount = data.channels.filter(c => c.hasSavedSetup).length;
  const overLimitPaused = data.channelLimit !== 0 && pausedCount > 0 && !guild.hasSubscription;

  const dismissKey = `ap:pausedBannerDismissed:${guild.id}`;
  const [pausedDismissed, dismissPaused] = usePersistentDismissal(dismissKey);

  // Clear the marker whenever the guild is back under limit so a fresh downgrade
  // re-alerts. Pure external write (no setState) — safe inside an effect.
  useEffect(() => {
    if (!overLimitPaused) window.localStorage.removeItem(dismissKey);
  }, [overLimitPaused, dismissKey]);

  const showPaused = isPublicInstance && overLimitPaused && !pausedDismissed;

  // Legacy guilds contribute no per-channel permission item — migration comes
  // first (the itemized status list is a migrated-guild concept).
  const needsFixingCount = data.migrated
    ? data.channels.filter(c => c.enabled && c.canPublish === false).length
    : 0;
  // Any number of broken channels surface as one red banner (badge = 1), not a
  // per-channel tally. The per-channel detail + Fix lives in the channel list.
  const showMisconfigured = needsFixingCount > 0;

  const badgeCount = (showMisconfigured ? 1 : 0) + (showMigration ? 1 : 0) + (showPaused ? 1 : 0);

  return {
    showMigration,
    showPaused,
    pausedCount,
    needsFixingCount,
    showMisconfigured,
    badgeCount,
    dismissPaused,
  };
}
