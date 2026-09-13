import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Data } from 'data/index.js';
import { ChannelType, Events, type Guild, type NewsChannel } from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildCreate,
})
export class GuildCreateListener extends Listener {
  public async run(guild: Guild) {
    // Register the presence; the live announcement channel list (from the
    // GUILD_CREATE payload, no REST) lets the backend prune config for channels
    // deleted while the bot was kicked (missed channelDelete events). The bot
    // never checks a subscription — the backend resolves the guild's plan and
    // trims its channels accordingly.
    const announcementChannels = [
      ...guild.channels.cache
        .filter((c): c is NewsChannel => c.type === ChannelType.GuildAnnouncement)
        .values(),
    ];
    await Data.API.Backend.registerNewGuild(
      guild.id,
      announcementChannels.map(c => c.id)
    );

    // Seed the publish-state cache for this guild (ADR 0008); `full` drops any
    // fields stale from a prior stint.
    await Services.Permissions.syncChannels(guild, announcementChannels, {
      full: true,
      clearBlocked: false,
    });
  }
}
