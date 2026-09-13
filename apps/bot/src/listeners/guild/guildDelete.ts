import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Guild } from 'discord.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildDelete,
})
export class GuildDeleteListener extends Listener {
  public async run(guild: Guild) {
    logger.info(`Guild deleted: ${guild.id} (${guild.name})`);

    // Soft-delete the presence (config preserved for re-invite)
    await Services.Guild.remove(guild.id);
  }
}
