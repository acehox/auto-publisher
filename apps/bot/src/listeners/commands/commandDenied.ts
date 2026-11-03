import { ApplyOptions } from '@sapphire/decorators';
import {
  type ChatInputCommandDeniedPayload,
  Events,
  Listener,
  type UserError,
} from '@sapphire/framework';
import { replyDenied } from '#utils/denied.js';

@ApplyOptions<Listener.Options>({
  event: Events.ChatInputCommandDenied,
})
export class CommandDeniedListener extends Listener {
  public run(error: UserError, { interaction }: ChatInputCommandDeniedPayload) {
    return replyDenied(interaction, error);
  }
}
