import { ApplyOptions } from '@sapphire/decorators';
import {
  type ChatInputCommandDeniedPayload,
  Events,
  Listener,
  type UserError,
} from '@sapphire/framework';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { emojis } from '#lib/constants/index.js';

@ApplyOptions<Listener.Options>({
  event: Events.ChatInputCommandDenied,
})
export class CommandDeniedListener extends Listener {
  public run(error: UserError, { interaction }: ChatInputCommandDeniedPayload) {
    const errorContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(`${emojis.crossmark} ${error.message}`)
    );

    interaction.reply({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [errorContainer],
    });
  }
}
