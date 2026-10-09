import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { ChannelType, Events, type NonThreadGuildBasedChannel } from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.ChannelCreate,
})
export class ChannelCreateListener extends Listener {
  public async run(channel: NonThreadGuildBasedChannel) {
    if (channel.type !== ChannelType.GuildAnnouncement) return;

    // A new announcement channel changes the candidate list → bust the backend's
    // cached list so the dashboard shows it without the 5-min TTL wait.
    await Services.Channel.invalidateGuildCache(channel.guildId);

    // Seed publish-state off the gateway cache (free, no REST — the CHANNEL_CREATE
    // payload carries permission overwrites) so the channel's first dashboard read
    // hits a warm canPublish entry instead of a REST write-back fallback.
    await Services.Permissions.syncChannels(channel.guild, [channel], {
      full: false,
      clearBlocked: false,
    });
  }
}
