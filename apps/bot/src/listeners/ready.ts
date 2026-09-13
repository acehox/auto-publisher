import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { ChannelType, type Client, Events, type NewsChannel } from 'discord.js';
import { setBotInvite } from 'lib/constants/index.js';
import { hydrateEmojis } from 'lib/emojis.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';

// Cap concurrent per-guild pushes so a large shard doesn't burst the backend.
const SWEEP_CONCURRENCY = 10;

/**
 * Seed the publish-state cache (ADR 0008) for every guild this shard owns.
 * `full` replaces stale fields (self-heals channels deleted
 * while the bot was offline). Fire-and-forget; failures fall back to the
 * backend's write-back REST path.
 */
const sweepPublishState = async (client: Client): Promise<void> => {
  const guilds = [...client.guilds.cache.values()];
  for (let i = 0; i < guilds.length; i += SWEEP_CONCURRENCY) {
    await Promise.all(
      guilds.slice(i, i + SWEEP_CONCURRENCY).map(guild => {
        const announcementChannels = [
          ...guild.channels.cache
            .filter((c): c is NewsChannel => c.type === ChannelType.GuildAnnouncement)
            .values(),
        ];
        return Services.Permissions.syncChannels(guild, announcementChannels, {
          full: true,
          clearBlocked: false,
        });
      })
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

    void sweepPublishState(this.container.client).catch(err =>
      logger.warn({ event: 'permissions.sweep_failed', err }, 'Publish-state startup sweep failed')
    );
  }
}
