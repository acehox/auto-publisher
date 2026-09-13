import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { ChannelType, type DMChannel, Events, type NonThreadGuildBasedChannel } from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.ChannelUpdate,
})
export class ChannelUpdateListener extends Listener {
  public async run(
    oldChannel: DMChannel | NonThreadGuildBasedChannel,
    newChannel: DMChannel | NonThreadGuildBasedChannel
  ) {
    // A type-cross INTO or OUT OF announcement changes the candidate list →
    // bust the backend's cached list so the dashboard reflects it without the
    // 5-min TTL wait (ADR 0007 amendment). Membership only: a rename/reposition
    // (no type change) is left to expire on TTL. Relies on the cached
    // oldChannel type (ChannelManager is not zeroed).
    const wasAnnouncement = oldChannel.type === ChannelType.GuildAnnouncement;
    const isAnnouncement = newChannel.type === ChannelType.GuildAnnouncement;
    if (wasAnnouncement !== isAnnouncement && !newChannel.isDMBased()) {
      await Services.Channel.invalidateGuildCache(newChannel.guildId);
    }

    // Permission work is only meaningful while it IS an announcement channel;
    // a demotion has nothing left to sync.
    if (newChannel.type !== ChannelType.GuildAnnouncement) return;

    // The changed overwrites affect only this channel — incremental push.
    await Services.Permissions.syncChannels(newChannel.guild, [newChannel], {
      full: false,
      clearBlocked: true,
    });
  }
}
