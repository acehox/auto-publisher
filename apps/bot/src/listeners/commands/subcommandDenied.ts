import { ApplyOptions } from '@sapphire/decorators';
import { Listener, type UserError } from '@sapphire/framework';
import {
  type ChatInputSubcommandDeniedPayload,
  SubcommandPluginEvents,
} from '@sapphire/plugin-subcommands';
import { replyDenied } from '#utils/denied.js';

/** A precondition set on a subcommand mapping fails here, not as `ChatInputCommandDenied`. */
@ApplyOptions<Listener.Options>({
  event: SubcommandPluginEvents.ChatInputSubcommandDenied,
})
export class SubcommandDeniedListener extends Listener {
  public run(error: UserError, { interaction }: ChatInputSubcommandDeniedPayload) {
    return replyDenied(interaction, error);
  }
}
