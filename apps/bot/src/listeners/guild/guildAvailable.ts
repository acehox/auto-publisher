import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Guild } from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildAvailable,
})
export class GuildAvailableListener extends Listener {
  public async run(guild: Guild) {
    await Services.Guild.registerIfPendingJoin(guild);
  }
}
