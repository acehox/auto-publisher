import { ApplyOptions } from '@sapphire/decorators';
import {
  type ChatInputCommandDeniedPayload,
  CorePreconditions,
  Events,
  Identifiers,
  Listener,
  type UserError,
} from '@sapphire/framework';
import { ContainerBuilder, MessageFlags, type PermissionsString } from 'discord.js';
import { emojis } from '#lib/constants/index.js';

/**
 * Sapphire's built-in preconditions answer in developer wording ("chat input
 * command invocation channel"), so their identifiers are mapped to ours. Our own
 * preconditions already carry user-facing messages.
 */
const deniedMessage = (error: UserError): string => {
  switch (error.identifier) {
    case Identifiers.PreconditionUserPermissions: {
      const { missing = [] } = error.context as { missing?: PermissionsString[] };
      const names = missing
        .map(permission => CorePreconditions.ClientPermissions.readablePermissions[permission])
        .join(', ');
      if (missing.length === 0) return 'You do not have permission to use this command.';
      return missing.length === 1
        ? `You need the ${names} permission to use this command.`
        : `You need these permissions to use this command: ${names}.`;
    }
    case Identifiers.PreconditionUserPermissionsNoPermissions:
      return 'Auto Publisher cannot read your permissions in this channel. Use this command in a server channel.';
    case Identifiers.PreconditionRunIn:
      return 'You can use this command only in a server.';
    default:
      return error.message;
  }
};

@ApplyOptions<Listener.Options>({
  event: Events.ChatInputCommandDenied,
})
export class CommandDeniedListener extends Listener {
  public run(error: UserError, { interaction }: ChatInputCommandDeniedPayload) {
    const errorContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
      textDisplay.setContent(`${emojis.crossmark} ${deniedMessage(error)}`)
    );

    interaction.reply({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [errorContainer],
    });
  }
}
