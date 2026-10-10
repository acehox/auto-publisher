import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events } from 'discord.js';
import { logger } from 'utils/logger.js';

@ApplyOptions<Listener.Options>({
  event: Events.Error,
})
export class ErrorListener extends Listener {
  public run(error: Error) {
    logger.error(error);
  }
}
