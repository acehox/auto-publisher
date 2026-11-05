import { config } from '@ap/config';
import { Copy } from '@ap/copy';
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { Buttons } from '#lib/components/buttons.js';
import { emojis } from '#lib/constants/index.js';
import { logger } from '#utils/logger.js';
import { buildReply } from '#utils/reply.js';

@ApplyOptions<Command.Options>({
  description: Copy.commands.help,
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
      .catch(error => {
        logger.error(error, 'Failed to fetch application commands for /help');
        return undefined;
      });

    // Without the id a `</ap enable:…>` mention renders as raw text, so fall back
    // to the plain command name.
    const command = (subcommand: string): string =>
      apCommandId ? `</ap ${subcommand}:${apCommandId}>` : `\`/ap ${subcommand}\``;
    // Each line reads the description Discord's command picker shows, so the two cannot drift.
    const line = (emoji: string, subcommand: keyof typeof Copy.commands.ap): string =>
      `${emoji}  ${command(subcommand)} - ${Copy.commands.ap[subcommand]}`;

    const replyContainer = buildReply({
      title: `${emojis.botBrand} How to use Auto Publisher`,
      body: [
        line(emojis.greenCircle, 'enable'),
        line(emojis.redCircle, 'disable'),
        line(emojis.info, 'overview'),
      ],
    });

    const premiumLines = [line(emojis.rollover, 'rollover'), line(emojis.filter, 'filters')];

    // The heading is the only difference: a self-hosted copy has one plan, so
    // calling its own features "Premium" would just be confusing.
    if (config.isPublicInstance) {
      replyContainer
        .addSeparatorComponents(separator => separator)
        .addTextDisplayComponents(textDisplay => textDisplay.setContent('### Premium features'));
    }
    for (const line of premiumLines) {
      replyContainer.addTextDisplayComponents(textDisplay => textDisplay.setContent(line));
    }

    replyContainer.addSeparatorComponents(separator => separator);

    // The support server belongs to the hosted service; `/links` skips it on a
    // self-host for the same reason.
    if (config.isPublicInstance) {
      replyContainer.addSectionComponents(section =>
        section
          .addTextDisplayComponents(textDisplay =>
            textDisplay.setContent('For more help, join the support server.')
          )
          .setButtonAccessory(Buttons.supportServer)
      );
    }

    const { guildId } = interaction;
    if (guildId) {
      replyContainer.addSectionComponents(section =>
        section
          .addTextDisplayComponents(textDisplay =>
            textDisplay.setContent('Manage your channels from the dashboard.')
          )
          .setButtonAccessory(Buttons.dashboard(guildId))
      );
    }

    return interaction.reply({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [replyContainer],
    });
  }
}
