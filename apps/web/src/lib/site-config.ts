import 'server-only';
import { config, env, isPublicInstance } from '@ap/config';

export type SiteConfig = {
  /** False for a self-hosted copy: no billing, no upgrade paths. */
  isPublicInstance: boolean;
  /** Application id of the bot users are invited to. */
  botId: string;
  /**
   * The free plan's channel cap from `@ap/config`. Rides this context because the
   * components that render it are client components and `@ap/config` is server-only.
   * Display copy only — a live per-guild count is `data.channelLimit`.
   */
  freeChannelLimit: number;
  /**
   * Per-channel condition cap from `@ap/config`. Rides this context for the same
   * reason as `freeChannelLimit`: the rule editor is a client component.
   */
  filtersPerChannel: number;
  /**
   * MIGRATION: legacy sunset date (`YYYY-MM-DD`, UTC) from `@ap/config`, which
   * the bot reads directly. Rides this context because every surface rendering
   * it is a client component. Removed with the legacy UX at sunset.
   */
  legacySunsetDate: string;
  /**
   * Client-side Paddle.js token, empty when billing is not configured (always so when
   * self-hosted). Served at runtime rather than inlined as a `NEXT_PUBLIC_` build-time
   * value — see `PADDLE_CLIENT_TOKEN` in `@ap/config`.
   */
  paddleClientToken: string;
  /**
   * Which Paddle instance the browser talks to. Derived from the same `PADDLE_ENVIRONMENT`
   * the backend uses, so the overlay cannot talk to sandbox while the webhooks talk to live.
   */
  paddleEnvironment: 'sandbox' | 'production';
};

/**
 * Resolve deployment config on the server, once per render.
 *
 * `botId` falls back to `DISCORD_CLIENT_ID`, which is the whole story for a
 * self-host: one application logs the admin in and is the bot they invite. The
 * public instance sets `DISCORD_BOT_ID` separately because its bot is the
 * long-lived application the existing servers already have.
 */
export function getSiteConfig(): SiteConfig {
  return {
    isPublicInstance,
    botId: env.DISCORD_BOT_ID || env.DISCORD_CLIENT_ID,
    freeChannelLimit: config.limits.freeChannelsPerGuild,
    filtersPerChannel: config.limits.filtersPerChannel,
    legacySunsetDate: config.legacySunsetDate,
    paddleClientToken: isPublicInstance ? env.PADDLE_CLIENT_TOKEN : '',
    paddleEnvironment: env.PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  };
}
