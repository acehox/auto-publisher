import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events } from 'discord.js';
import { logger } from '#utils/logger.js';

@ApplyOptions<Listener.Options>({
  event: Events.ShardError,
})
export class ShardErrorListener extends Listener {
  public run(error: Error, id: number) {
    logger.error(`[Shard ${id}] ${error.stack}`);
  }
}
