import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { ChannelType, Events, type Message, type PartialMessage } from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.MessageDelete,
})
export class MessageDeleteListener extends Listener {
  public run(message: Message | PartialMessage) {
    if (message.channel.type !== ChannelType.GuildAnnouncement) return;
    Services.Crosspost.cancel(message.channelId, message.id);
  }
}
