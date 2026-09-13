import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Role } from 'discord.js';
import { Services } from 'services/index.js';

// Keeps the backend's cached role list fresh for the dashboard's
// mention-filter picker (ADR 0007 amendment).
@ApplyOptions<Listener.Options>({
  event: Events.GuildRoleCreate,
})
export class RoleCreateListener extends Listener {
  public async run(role: Role) {
    await Services.Channel.invalidateGuildRoles(role.guild.id);
  }
}
