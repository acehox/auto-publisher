import { MAX_JOIN_DATES_PER_PUSH } from '@ap/validations';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Data } from 'data/index.js';
import { type Client, Events } from 'discord.js';
import { setBotInvite } from 'lib/constants/index.js';
import { hydrateEmojis } from 'lib/emojis.js';
import { Services } from 'services/index.js';
import { getAnnouncementChannels } from 'utils/channels.js';
import { logger } from 'utils/logger.js';

// Cap concurrent per-guild pushes so a large shard doesn't burst the backend.
const SWEEP_CONCURRENCY = 10;

// `joined_at` comes from GUILD_CREATE because Discord's REST guild list has none.
const pushJoinDates = async (client: Client): Promise<void> => {
  // An unavailable (outage) guild is unpatched: `joinedAt` is an Invalid Date.
  const guilds = [...client.guilds.cache.values()]
    .filter(g => g.available)
    .map(g => ({ guildId: g.id, joinedAt: g.joinedAt.toISOString() }));
  for (let i = 0; i < guilds.length; i += MAX_JOIN_DATES_PER_PUSH) {
    await Data.API.Backend.pushJoinDates(guilds.slice(i, i + MAX_JOIN_DATES_PER_PUSH)).catch(err =>
      logger.warn({ event: 'guilds.join_dates_batch_failed', err }, 'Join-date batch push failed')
    );
  }
};

/**
 * Seed the publish-state cache for every guild this shard owns.
 * `full` replaces stale fields (self-heals channels deleted
 * while the bot was offline). Fire-and-forget; failures fall back to the
 * backend's write-back REST path.
 */
const sweepPublishState = async (client: Client): Promise<void> => {
  // An unavailable guild's channel cache is empty, and a `full` push of nothing
  // would wipe its stored publish state.
  const guilds = [...client.guilds.cache.values()].filter(g => g.available);
  for (let i = 0; i < guilds.length; i += SWEEP_CONCURRENCY) {
    await Promise.all(
      guilds.slice(i, i + SWEEP_CONCURRENCY).map(guild =>
        Services.Permissions.syncChannels(guild, getAnnouncementChannels(guild), {
          full: true,
          clearBlocked: false,
        })
      )
    );
  }
};

@ApplyOptions<Listener.Options>({
  once: true,
  event: Events.ClientReady,
})
export class ReadyListener extends Listener {
  public async run(client: Client<true>) {
    // Self-hosted instances must invite their own application, not the hosted
    // bot. No REST call needed — the id is on the ready client.
    setBotInvite(client.application.id);

    // Awaited before ready: every command surface renders these, and a fallback
    // shown once would persist in that reply. Never fatal — on failure every key
    // keeps its unicode fallback.
    await hydrateEmojis(client).catch(err =>
      logger.warn({ event: 'emojis.hydrate_failed', err }, 'App emoji hydration failed')
    );

    this.container.client.cluster.triggerReady();

    void pushJoinDates(this.container.client).catch(err =>
      logger.warn({ event: 'guilds.join_dates_failed', err }, 'Join-date startup push failed')
    );

    void sweepPublishState(this.container.client).catch(err =>
      logger.warn({ event: 'permissions.sweep_failed', err }, 'Publish-state startup sweep failed')
    );
  }
}
