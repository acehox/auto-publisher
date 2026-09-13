import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { ChannelType, Events, type NewsChannel, type Role } from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildRoleUpdate,
})
export class RoleUpdateListener extends Listener {
  public async run(_oldRole: Role, newRole: Role) {
    const me = newRole.guild.members.me;
    if (!me?.roles.cache.has(newRole.id)) return;

    const announcementChannels = newRole.guild.channels.cache.filter(
      (c): c is NewsChannel => c.type === ChannelType.GuildAnnouncement
    );

    // A role the bot holds changed — recompute every announcement channel.
    await Services.Permissions.syncChannels(newRole.guild, [...announcementChannels.values()], {
      full: false,
      clearBlocked: true,
    });
  }
}
