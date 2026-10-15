import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { type CloseEvent, Events } from 'discord.js';
import { logger } from '#utils/logger.js';

@ApplyOptions<Listener.Options>({
  event: Events.ShardDisconnect,
})
export class ShardDisconnectListener extends Listener {
  public run(event: CloseEvent, id: number) {
    logger.warn(`[Shard ${id}] Code ${event.code}`);
  }
}
