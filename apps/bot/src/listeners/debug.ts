import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events } from 'discord.js';
import { logger } from '#utils/logger.js';

@ApplyOptions<Listener.Options>({
  event: Events.Debug,
})
export class DebugListener extends Listener {
  public run(message: string) {
    // Filter out WS heartbeat debug messages
    if (message.match(/heartbeat/gi)) {
      return;
    }

    logger.debug(message);
  }
}
