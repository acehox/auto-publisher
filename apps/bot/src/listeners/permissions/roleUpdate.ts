import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Role } from 'discord.js';
import { Services } from 'services/index.js';
import { getAnnouncementChannels } from 'utils/channels.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildRoleUpdate,
})
export class RoleUpdateListener extends Listener {
  public async run(_oldRole: Role, newRole: Role) {
    const me = newRole.guild.members.me;
    if (!me?.roles.cache.has(newRole.id)) return;

    // A role the bot holds changed — recompute every announcement channel.
    await Services.Permissions.syncChannels(newRole.guild, getAnnouncementChannels(newRole.guild), {
      full: false,
      clearBlocked: true,
    });
  }
}
