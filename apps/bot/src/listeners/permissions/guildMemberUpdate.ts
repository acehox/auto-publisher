import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { Services } from 'services/index.js';
import { getAnnouncementChannels } from 'utils/channels.js';

@ApplyOptions<Listener.Options>({
  event: Events.GuildMemberUpdate,
})
export class GuildMemberUpdateListener extends Listener {
  public async run(_oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    if (newMember.id !== newMember.client.user?.id) return;

    // The bot's own roles changed — recompute every announcement channel.
    await Services.Permissions.syncChannels(
      newMember.guild,
      getAnnouncementChannels(newMember.guild),
      {
        full: false,
        clearBlocked: true,
      }
    );
  }
}
