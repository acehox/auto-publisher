import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import {
  ChannelType,
  Events,
  type GuildMember,
  type NewsChannel,
  type PartialGuildMember,
} from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildMemberUpdate,
})
export class GuildMemberUpdateListener extends Listener {
  public async run(_oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    if (newMember.id !== newMember.client.user?.id) return;

    const announcementChannels = newMember.guild.channels.cache.filter(
      (c): c is NewsChannel => c.type === ChannelType.GuildAnnouncement
    );

    // The bot's own roles changed — recompute every announcement channel.
    await Services.Permissions.syncChannels(newMember.guild, [...announcementChannels.values()], {
      full: false,
      clearBlocked: true,
    });
  }
}
