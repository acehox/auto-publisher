import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type Guild } from 'discord.js';
import { Services } from '#services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildDelete,
})
export class GuildDeleteListener extends Listener {
  public async run(guild: Guild) {
    await Services.Guild.remove(guild.id);
  }
}
