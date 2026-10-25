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

/** Public origin of this deployment, the base for every absolute URL in page metadata. */
export function getSiteUrl(): URL {
  return new URL(env.WEB_APP_ORIGIN);
}

export function getLogoUrl(): string {
  return new URL('/auto-publisher.png', getSiteUrl()).href;
}

/**
 * Resolve deployment config on the server, once per render.
 *
 * `botId` is `DISCORD_CLIENT_ID`: one application logs the admin in and is the
 * bot they invite.
 */
export function getSiteConfig(): SiteConfig {
  return {
    isPublicInstance,
    botId: env.DISCORD_CLIENT_ID,
    freeChannelLimit: config.limits.freeChannelsPerGuild,
    filtersPerChannel: config.limits.filtersPerChannel,
    legacySunsetDate: config.legacySunsetDate,
    paddleClientToken: isPublicInstance ? env.PADDLE_CLIENT_TOKEN : '',
    paddleEnvironment: env.PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  };
}
