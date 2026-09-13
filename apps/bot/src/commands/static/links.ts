import { config } from '@ap/config';
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ActionRowBuilder, type ButtonBuilder, ContainerBuilder, MessageFlags } from 'discord.js';
import { Buttons } from 'lib/components/buttons.js';

@ApplyOptions<Command.Options>({
  description: 'Find helpful resources, invite the bot, and connect with our community!',
})
export class LinksCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(builder =>
      builder //
        .setName(this.name)
        .setDescription(this.description)
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const replyContainer = new ContainerBuilder().addSectionComponents(section =>
      section
        .addTextDisplayComponents(textDisplay =>
          textDisplay.setContent('✨ **Add bot to your server** ✨')
        )
        .setButtonAccessory(Buttons.botInvite())
    );

    // Shown wherever Premium is sold. Deliberately not per-guild: `/links` is a
    // static command, and a backend round trip to hide one button is not worth
    // putting an HTTP dependency on it.
    if (config.isPublicInstance) {
      replyContainer.addSectionComponents(section =>
        section
          .addTextDisplayComponents(textDisplay =>
            textDisplay.setContent('**Upgrade to Premium for more features!**')
          )
          .setButtonAccessory(Buttons.getPremium)
      );
    }

    // The support server and marketing site belong to the hosted service. A
    // self-hosted instance points at its operator's own dashboard instead —
    // sending their admins to our support server for a deployment we don't run
    // would be wrong on both ends.
    replyContainer.addSeparatorComponents(separator => separator);

    if (config.isPublicInstance) {
      replyContainer
        .addSectionComponents(section =>
          section
            .addTextDisplayComponents(textDisplay =>
              textDisplay.setContent('Join the support server')
            )
            .setButtonAccessory(Buttons.supportServer)
        )
        .addSectionComponents(section =>
          section
            .addTextDisplayComponents(textDisplay => textDisplay.setContent('Official website'))
            .setButtonAccessory(Buttons.website)
        );
    } else {
      replyContainer.addSectionComponents(section =>
        section
          .addTextDisplayComponents(textDisplay => textDisplay.setContent('Open the dashboard'))
          .setButtonAccessory(Buttons.website)
      );
    }

    // The bot is the only surface that linked neither document. Both are
    // deployment-relative, so a self-hosted copy points at its operator's own.
    replyContainer
      .addSeparatorComponents(separator => separator)
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(Buttons.terms, Buttons.privacy)
      );

    return interaction.reply({
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
      components: [replyContainer],
    });
  }
}
