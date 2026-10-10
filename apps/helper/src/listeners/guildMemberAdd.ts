import { config } from '@ap/config';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type GuildMember } from 'discord.js';
import { grantIfSubscriber } from 'services/reconcile.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildMemberAdd,
})
export class GuildMemberAddListener extends Listener {
  public async run(member: GuildMember) {
    if (member.guild.id !== config.helper.guildId || member.user.bot) return;

    await grantIfSubscriber(member);
  }
}
