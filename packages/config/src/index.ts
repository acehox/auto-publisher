// Single file on purpose. The dashboard bundles this package with Turbopack,
// which does not resolve the `.js`-extension convention TypeScript ESM uses for
// relative imports (`./env.js` -> `env.ts`). Every other `@ap/*` package the web
// imports is likewise single-file; splitting this one would break `next build`.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loggerLevels } from '@ap/logger';
import { config as loadDotenv } from 'dotenv';
import { cleanEnv, num, str } from 'envalid';

/**
 * Locate the monorepo root by walking up from this module.
 *
 * `dotenv/config` resolves against `process.cwd()`, which differs per entry
 * point — `apps/web` under `next dev`, `apps/backend` inside its container,
 * the repo root for drizzle-kit. A single shared env file could never be found
 * from all of them, which is why the web app used to need its own copy.
 */
const findRepoRoot = (): string | undefined => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'turbo.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

// `.env.local` first: dotenv never overwrites an already-set key, so the dev
// override wins over `.env`, and the real process environment (Docker's
// `env_file`) wins over both. Containers carry no env file at all —
// `.dockerignore` excludes them — so this is a no-op there.
const repoRoot = findRepoRoot();
if (repoRoot) {
  for (const file of ['.env.local', '.env']) {
    loadDotenv({ path: resolve(repoRoot, file), quiet: true });
  }
}

// An empty value means "not set". envalid only falls back to `default` when a
// key is absent, so `DEPLOYMENT_MODE=` in an env file — a blank line someone
// uncommented — would otherwise fail the `choices` check and refuse to boot,
// even though absent is a perfectly valid way to ask for self-host.
if (process.env.DEPLOYMENT_MODE === '') delete process.env.DEPLOYMENT_MODE;

/**
 * Environment variables
 */
export const env = cleanEnv(process.env, {
  // Runtime
  NODE_ENV: str({ default: 'development', choices: ['development', 'production', 'test'] }),
  LOGGER_LEVEL: str({ default: 'info', choices: loggerLevels }),

  /**
   * Which deployment this is.
   *
   * Both modes run the same topology — one bot, one proxy, one backend. The
   * only difference is billing: `public` (the commercial service) sells
   * Premium through Paddle and carries the statutory withdrawal surface;
   * `self-host` (the default) gives every guild the full feature set for free
   * and never instantiates any of it.
   *
   * Deliberately NOT derived from `NODE_ENV`: a self-hoster must be able to run
   * `NODE_ENV=production` — which they should, for log levels and optimized
   * builds — without silently switching on billing.
   */
  DEPLOYMENT_MODE: str({ default: 'self-host', choices: ['self-host', 'public'] }),

  // --- The bot -------------------------------------------------------------
  DISCORD_BOT_TOKEN: str({ default: '' }),
  PROXY_URL: str({ default: 'http://proxy:8080' }),

  /**
   * Outbound source IP for Discord traffic; empty = default route.
   *
   * Discord restricts IP addresses, not tokens, so this is the only real lever
   * on the 10k-invalid-requests/10min Cloudflare ceiling. Pinning it keeps the
   * stack's Discord egress on a known address the host can rotate.
   */
  EGRESS_LOCAL_ADDRESS: str({ default: '' }),

  // Backend
  DATABASE_URL: str({ default: 'postgresql://postgres:postgres@localhost:54322/postgres' }),

  // Redis
  REDIS_URI: str({ default: 'redis://redis:6379' }),

  // Alerts (optional; alerts are disabled when unset)
  DISCORD_ALERT_WEBHOOK_URL: str({ default: '' }),

  // Bot. `BOT_SUPPORT_GUILD_ID` is public-instance only — unset means the
  // guild-scoped admin commands are simply not registered.
  BOT_SUPPORT_GUILD_ID: str({ default: '' }),
  BOT_SHARDS: num({ default: 1 }),
  BOT_SHARDS_PER_CLUSTER: num({ default: 1 }),

  // --- Web dashboard -------------------------------------------------------
  // Required by the web app only; validated at its point of use so that a
  // misconfigured dashboard cannot stop the bot from publishing.
  AUTH_SECRET: str({ default: '' }),
  DISCORD_CLIENT_ID: str({ default: '' }),
  DISCORD_CLIENT_SECRET: str({ default: '' }),
  /**
   * Application id of the bot users are invited to.
   *
   * Defaults to `DISCORD_CLIENT_ID`, which is the whole story for a self-host:
   * one Discord application is the OAuth client and the bot. Set it only when
   * the dashboard logs in with a different application than the bot — the
   * public instance does, because its bot is the long-lived application the
   * existing servers already have and re-inviting them is not an option.
   */
  DISCORD_BOT_ID: str({ default: '' }),
  WEB_APP_ORIGIN: str({ default: 'http://localhost:3100' }),
  /** Backend base URL the dashboard calls server-side (never from the browser). */
  BACKEND_URL: str({ default: 'http://backend:8080' }),

  // --- Public instance only: billing + statutory mail ----------------------
  PADDLE_ENVIRONMENT: str({ default: 'sandbox', choices: ['sandbox', 'production'] }),
  PADDLE_API_KEY: str({ default: '' }),
  PADDLE_WEBHOOK_SECRET: str({ default: '' }),
  PADDLE_PRICE_ID_MONTHLY: str({ default: '' }),
  PADDLE_PRICE_ID_YEARLY: str({ default: '' }),
  // The same two prices plus `trial_period: {interval: 'day', frequency: 14}`. The trial
  // belongs to the PRICE, so a trial subscriber keeps this price id for the subscription's
  // life and conversion to paid is not a price change — which is what stops `isPlanChange`
  // re-opening the withdrawal window over the first real charge.
  PADDLE_PRICE_ID_MONTHLY_TRIAL: str({ default: '' }),
  PADDLE_PRICE_ID_YEARLY_TRIAL: str({ default: '' }),
  /**
   * Client-side token for Paddle.js. Public by design; the API key is the secret.
   *
   * Deliberately NOT `NEXT_PUBLIC_`: Next.js reads `.env*` only from its own app directory,
   * never the monorepo root, so a build-time inlined value resolved to `undefined` in the
   * browser and left the checkout button permanently disabled with nothing logged. It
   * reaches the browser at runtime via `getSiteConfig()` → `SiteConfigProvider`, which also
   * keeps the web image free of build args.
   */
  PADDLE_CLIENT_TOKEN: str({ default: '' }),

  // Outbound email — the withdrawal acknowledgement is the only mail the stack
  // sends. Unset credentials disable sending rather than failing at startup;
  // the withdrawal flow reports it as an unsent acknowledgement.
  SMTP_HOST: str({ default: 'smtp.zoho.eu' }),
  SMTP_PORT: num({ default: 465 }),
  SMTP_USER: str({ default: '' }),
  SMTP_PASSWORD: str({ default: '' }),
  SMTP_FROM: str({ default: 'Auto Publisher <support@auto-publisher.gg>' }),
});

/** True for the commercial deployment (billing on), false for a self-hosted copy. */
export const isPublicInstance = env.DEPLOYMENT_MODE === 'public';

/**
 * Whether checkout offers the free trial at all — the one gate every trial surface reads,
 * backend and dashboard alike.
 *
 * Both price ids or neither: the disclosure a buyer sees is written before an interval is
 * chosen, so a half-configured trial would advertise on one interval and charge immediately
 * on the other. A misconfiguration must read as "no trial", never "trial on one interval".
 *
 * Unsetting either variable is therefore also the kill switch — selling continues at the
 * plain prices and every trial claim disappears from the UI in the same move.
 */
export const premiumTrialEnabled =
  isPublicInstance && !!env.PADDLE_PRICE_ID_MONTHLY_TRIAL && !!env.PADDLE_PRICE_ID_YEARLY_TRIAL;

/**
 * Scoped rather than global: a bot or proxy that refused to boot over an unconfigured
 * checkout would stop publishing for a reason unrelated to publishing.
 */
type EnvScope = {
  billing?: boolean;
  dashboard?: boolean;
};

const SCOPED_KEYS = {
  billing: [
    'PADDLE_API_KEY',
    'PADDLE_WEBHOOK_SECRET',
    'PADDLE_PRICE_ID_MONTHLY',
    'PADDLE_PRICE_ID_YEARLY',
    // Required here but not self-host: the withdrawal acknowledgement is a statutory
    // duty (ZZP čl. 81.a st. 6), and unset credentials fail at send time, not at deploy.
    'SMTP_USER',
    'SMTP_PASSWORD',
  ],
  dashboard: ['AUTH_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'PADDLE_CLIENT_TOKEN'],
} as const satisfies Record<keyof EnvScope, readonly string[]>;

/**
 * Assert the variables this deployment mode and this process actually need.
 *
 * Called explicitly from each long-running process rather than at module
 * import: `next build` evaluates server modules, and the web image is built
 * before any env file exists, so an import-time throw would break the build
 * for a token the web app never even reads. The dashboard never calls this at all —
 * `getSiteConfig()` runs during prerender — so the backend asserts the `dashboard`
 * scope on its behalf, both reading one env file.
 *
 * Deliberately no "you set a variable this mode ignores" errors — a stray
 * leftover is inert, which lets a maintainer flip `DEPLOYMENT_MODE` on an
 * existing env file to exercise the self-host path without a second one.
 */
export const assertRequiredEnv = (scope: EnvScope = {}): void => {
  const required: string[] = ['DISCORD_BOT_TOKEN'];

  if (isPublicInstance) {
    if (scope.billing) required.push(...SCOPED_KEYS.billing);
    if (scope.dashboard) required.push(...SCOPED_KEYS.dashboard);
  }

  const missing = required.filter(key => !env[key as keyof typeof env]);
  const problems = missing.length
    ? [`Missing required environment variable(s): ${missing.join(', ')}.`]
    : [];

  if (isPublicInstance && scope.billing) {
    // Raw `process.env`, not `env`: the `sandbox` default makes an unset variable
    // indistinguishable from a deliberate one.
    if (!process.env.PADDLE_ENVIRONMENT) {
      problems.push(
        'PADDLE_ENVIRONMENT must be set explicitly on a public instance (sandbox|production) — ' +
          'it silently defaults to sandbox, which would bill nobody while appearing to work.'
      );
    }

    const trialIds = [env.PADDLE_PRICE_ID_MONTHLY_TRIAL, env.PADDLE_PRICE_ID_YEARLY_TRIAL];
    if (trialIds.some(Boolean) && !trialIds.every(Boolean)) {
      problems.push(
        'PADDLE_PRICE_ID_MONTHLY_TRIAL and PADDLE_PRICE_ID_YEARLY_TRIAL must both be set or both be empty.'
      );
    }
  }

  if (problems.length === 0) return;

  throw new Error(
    `Invalid environment for DEPLOYMENT_MODE="${env.DEPLOYMENT_MODE}": ${problems.join(' ')} ` +
      (isPublicInstance ? 'See docs/public-instance/.env.example.' : 'See docs/self-hosting.md.')
  );
};

/** The free plan's channel cap. Every other app reads it from here. */
const FREE_CHANNELS_PER_GUILD = 3;

/**
 * Application configuration.
 *
 * One bot serves every guild. Free and Premium are subscription tiers resolved
 * per guild by the backend, never a property of the running process — so
 * nothing here branches on a plan.
 */
export const config = {
  /**
   * Whether this is the commercial deployment. False for a self-hosted copy,
   * which has no billing and gives every guild the full feature set.
   */
  isPublicInstance,
  /** The bot's token. */
  discordToken: env.DISCORD_BOT_TOKEN,
  /** The proxy base URL every Discord call is routed through. */
  proxyUrl: env.PROXY_URL,
  /**
   * Outbound source IP for Discord traffic; empty = default route. Discord's
   * invalid-request ceiling is per IP, so this is what the host rotates if the
   * proxy's self-shed ever trips for real.
   */
  egressLocalAddress: env.EGRESS_LOCAL_ADDRESS,
  /**
   * MIGRATION: the date legacy mode stops working, as `YYYY-MM-DD` (UTC).
   *
   * Shown on every legacy surface — the bot's `/ap overview`, the dashboard's
   * migrate banner and status section, and the marketing migration page. It
   * lives here, not per app, because two surfaces quoting different sunset
   * dates to the same admin is the one failure mode that matters. This module
   * is server-only (it reads the environment at import), so the dashboard's
   * client components receive it through `getSiteConfig()`.
   *
   * TODO(migration): replace with the real sunset date before v7 launch.
   * Placeholder only. Removed with the rest of the legacy UX at sunset.
   */
  legacySunsetDate: '2026-12-31',
  /**
   * Application limits
   */
  limits: {
    /** The free plan's channel cap; Premium is unlimited. */
    freeChannelsPerGuild: FREE_CHANNELS_PER_GUILD,
    /**
     * Maximum filter conditions per channel (not surfaced in UI; over-limit shows a toast)
     */
    filtersPerChannel: 50,
  },
} as const;
