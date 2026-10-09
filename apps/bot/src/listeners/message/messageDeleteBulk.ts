import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import {
  ChannelType,
  type Collection,
  Events,
  type GuildTextBasedChannel,
  type Message,
  type PartialMessage,
  type Snowflake,
} from 'discord.js';
import { Services } from 'services/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.MessageBulkDelete,
})
export class MessageDeleteBulkListener extends Listener {
  public run(
    messages: Collection<Snowflake, Message | PartialMessage>,
    channel: GuildTextBasedChannel
  ) {
    if (channel.type !== ChannelType.GuildAnnouncement) return;
    for (const messageId of messages.keys()) Services.Crosspost.cancel(channel.id, messageId);
  }
}
