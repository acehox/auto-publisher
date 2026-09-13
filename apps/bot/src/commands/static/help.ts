import { config } from '@ap/config';
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { Buttons } from 'lib/components/buttons.js';
import { emojis } from 'lib/constants/index.js';
import { logger } from 'utils/logger.js';

@ApplyOptions<Command.Options>({
  description: 'Discover all the ways you can use Auto Publisher to manage your channels!',
})
export class HelpCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(builder =>
      builder //
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setContexts([InteractionContextType.Guild])
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const apCommandId = await interaction.client.application.commands
      .fetch()
      .then(commands => commands.findKey(command => command.name === 'ap'))
      .catch(logger.error);

    const replyContainer = new ContainerBuilder()
      .addTextDisplayComponents(textDisplay => textDisplay.setContent('### How to use the bot:'))
      .addTextDisplayComponents(textDisplay =>
        textDisplay.setContent(
          `${emojis.greenCircle}  Use </ap enable:${apCommandId}> to enable auto-publishing in a channel.`
        )
      )
      .addTextDisplayComponents(textDisplay =>
        textDisplay.setContent(
          `${emojis.redCircle}  Use </ap disable:${apCommandId}> to stop auto-publishing in a channel.`
        )
      )
      .addTextDisplayComponents(textDisplay =>
        textDisplay.setContent(
          `${emojis.info}  Use </ap overview:${apCommandId}> to see publishing status for every channel in this server.`
        )
      );

    const filtersLine = `${emojis.filter}  Use </ap filters:${apCommandId}> to choose which messages get published in a channel.`;

    // The heading is the only difference: a self-hosted copy has one plan, so
    // calling its own features "Premium" would just be confusing.
    if (config.isPublicInstance) {
      replyContainer
        .addSeparatorComponents(separator => separator)
        .addTextDisplayComponents(textDisplay => textDisplay.setContent('### Premium features:'))
        .addTextDisplayComponents(textDisplay => textDisplay.setContent(filtersLine));
    } else {
      replyContainer.addTextDisplayComponents(textDisplay => textDisplay.setContent(filtersLine));
    }

    replyContainer
      .addSeparatorComponents(separator => separator)
      .addSectionComponents(section =>
        section
          .addTextDisplayComponents(textDisplay =>
            textDisplay.setContent('Need additional help? Join the support server!')
          )
          .setButtonAccessory(Buttons.supportServer)
      );

    return interaction.reply({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [replyContainer],
    });
  }
}
