import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events } from 'discord.js';
import { logger } from '#utils/logger.js';

@ApplyOptions<Listener.Options>({
  event: Events.ShardReady,
})
export class ShardReadyListener extends Listener {
  public run(id: number) {
    logger.info(`[Shard ${id}] Ready!`);
  }
}
