import { CorePreconditions, Identifiers, type UserError } from '@sapphire/framework';
import {
  type ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
  type PermissionsString,
} from 'discord.js';
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

/** One reply for a failed precondition, whether it was set on the command or a subcommand. */
export const replyDenied = (interaction: ChatInputCommandInteraction, error: UserError) => {
  const errorContainer = new ContainerBuilder().addTextDisplayComponents(textDisplay =>
    textDisplay.setContent(`${emojis.crossmark} ${deniedMessage(error)}`)
  );

  return interaction.reply({
    flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
    components: [errorContainer],
  });
};
