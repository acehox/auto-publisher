import { config } from '@ap/config';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Guild } from 'discord.js';
import { resyncMembers } from 'services/reconcile.js';

/**
 * Fires after a guild outage and after every re-identify (READY marks guilds
 * unavailable until GUILD_CREATE). A re-identify, unlike a resume, never replays
 * the member events missed in the gap.
 */
@ApplyOptions<Listener.Options>({
  event: Events.GuildAvailable,
})
export class GuildAvailableListener extends Listener {
  public async run(guild: Guild) {
    if (guild.id !== config.helper.guildId) return;

    await resyncMembers(guild);
  }
}
