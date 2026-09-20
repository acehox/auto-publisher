'use server';

import { BackendError, backendFetch } from '@/lib/api/backend';
import type {
  ChannelLimitReason,
  CheckoutResponse,
  DiscordGuild,
  FilterInput,
  FilterMatchMode,
  GuildChannel,
  GuildDashboardData,
  GuildRole,
  SubscriptionDetail,
  WithdrawalResult,
} from '@/lib/api/types';
import { LEGAL_DOCUMENTS_VERSION } from '@/lib/legal/documents';

/**
 * Result of a mutation that the UI branches on. Thrown errors are sanitized
 * across the server-action boundary, so mutations that need the failure reason
 * (e.g. the channel-limit `code` or a `PREMIUM_INACTIVE` filter rejection)
 * return it instead of throwing.
 */
export type MutationResult = { ok: true } | { ok: false; status: number; code?: string };

export async function getUserGuilds(): Promise<DiscordGuild[]> {
  return backendFetch<DiscordGuild[]>('/api/user/guilds');
}

export async function getGuildDashboard(guildId: string): Promise<GuildDashboardData> {
  return backendFetch<GuildDashboardData>(`/api/guild/${guildId}`);
}

export async function getGuildChannels(guildId: string): Promise<GuildChannel[]> {
  return backendFetch<GuildChannel[]>(`/api/guild/${guildId}/channels`);
}

export async function enableChannel(
  guildId: string,
  channelId: string,
  /** Consent to drop a retained rule the guild's plan can no longer run. */
  options: { clearFilters?: boolean } = {}
): Promise<MutationResult> {
  try {
    await backendFetch(`/api/guild/${guildId}/channel/${channelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options.clearFilters ? { clearFilters: true } : {}),
    });
    return { ok: true };
  } catch (error) {
    // Not narrowed to ChannelLimitReason: this route also answers
    // NOT_ANNOUNCEMENT_CHANNEL and FILTERS_PREMIUM.
    if (error instanceof BackendError) {
      return { ok: false, status: error.status, code: error.code };
    }
    throw error;
  }
}

export async function disableChannel(guildId: string, channelId: string): Promise<MutationResult> {
  try {
    await backendFetch(`/api/guild/${guildId}/channel/${channelId}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (error) {
    // Surface the status (esp. 401 = dead token) so the client can re-login
    // rather than silently swallowing a sanitized thrown error (ADR 0010).
    if (error instanceof BackendError) {
      return { ok: false, status: error.status, code: error.code as ChannelLimitReason };
    }
    throw error;
  }
}

/** MIGRATION: Remove after migration period (6 months) */
export async function migrateGuild(guildId: string, channelIds: string[]): Promise<MutationResult> {
  try {
    await backendFetch(`/api/guild/${guildId}/migrate`, {
      method: 'POST',
      body: JSON.stringify({ channelIds }),
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, status: error.status, code: error.code as ChannelLimitReason };
    }
    throw error;
  }
}

export async function getSubscription(guildId: string): Promise<SubscriptionDetail | null> {
  return backendFetch<SubscriptionDetail | null>(`/api/guild/${guildId}/subscription`);
}

/**
 * `acceptedTerms` is sent rather than assumed: the backend requires it, so a caller
 * that skips the acceptance checkbox fails at the server and not merely in the UI.
 */
export async function createCheckout(
  guildId: string,
  interval: 'month' | 'year'
): Promise<CheckoutResponse> {
  return backendFetch<CheckoutResponse>(`/api/guild/${guildId}/subscription/checkout`, {
    method: 'POST',
    body: JSON.stringify({
      interval,
      acceptedTerms: true,
      termsVersion: LEGAL_DOCUMENTS_VERSION,
    }),
  });
}

/**
 * Statutory withdrawal (ZZP čl. 81.a / CRD Art 11a). One call, never two — the
 * statute has a single sending event. Only the address is sent; name and contract
 * details are server-composed. The result carries the real outcome, not just ok.
 */
export async function withdrawFromContract(
  guildId: string,
  notificationAddress: string
): Promise<{ ok: true; result: WithdrawalResult } | { ok: false; status: number; code?: string }> {
  try {
    const result = await backendFetch<WithdrawalResult>(
      `/api/guild/${guildId}/subscription/withdrawal`,
      { method: 'POST', body: JSON.stringify({ notificationAddress }) }
    );
    return { ok: true, result };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, status: error.status, code: error.code };
    }
    throw error;
  }
}

export async function getGuildRoles(guildId: string): Promise<GuildRole[]> {
  return backendFetch<GuildRole[]>(`/api/guild/${guildId}/roles`);
}

/**
 * Keyword values are stored lowercased (the evaluator matches case-insensitively
 * against lowercased content); mirror the bot's `normalizeFilterValues` from
 * `@ap/utils` so dashboard-added conditions behave identically to command-added
 * ones. Inlined rather than importing `@ap/utils` — its barrel pulls in
 * discord.js helpers that use BigInt literals the web's TS target rejects.
 */
function toConditionBody(data: FilterInput) {
  return {
    type: data.type,
    negate: data.negate,
    values: data.type === 'keyword' ? data.values.map(value => value.toLowerCase()) : data.values,
  };
}

/**
 * Atomically replace a channel's whole rule (match mode + all conditions) from
 * the inline builder. A `FILTER_LIMIT` code rides back on the over-cap rejection
 * so the caller can toast it.
 */
export async function setChannelFilters(
  guildId: string,
  channelId: string,
  data: { matchMode: FilterMatchMode; conditions: FilterInput[] }
): Promise<MutationResult> {
  try {
    await backendFetch(`/api/guild/${guildId}/channel/${channelId}/filters`, {
      method: 'PUT',
      body: JSON.stringify({
        matchMode: data.matchMode,
        conditions: data.conditions.map(toConditionBody),
      }),
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof BackendError) {
      return { ok: false, status: error.status, code: error.code };
    }
    throw error;
  }
}
