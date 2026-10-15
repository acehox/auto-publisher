import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ActionRowBuilder, type ButtonBuilder, MessageFlags } from 'discord.js';
import { Buttons } from '#lib/components/buttons.js';

@ApplyOptions<Command.Options>({
  description: 'Add Auto Publisher to your server',
})
export class InviteCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(builder =>
      builder //
        .setName(this.name)
        .setDescription(this.description)
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const replyButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(Buttons.botInvite());

    return interaction.reply({
      flags: [MessageFlags.Ephemeral],
      components: [replyButtons],
    });
  }
}
