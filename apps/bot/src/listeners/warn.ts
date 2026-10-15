import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { Events } from 'discord.js';
import { logger } from '#utils/logger.js';

@ApplyOptions<Listener.Options>({
  event: Events.Warn,
})
export class WarnListener extends Listener {
  public run(info: string) {
    logger.warn(info);
  }
}
