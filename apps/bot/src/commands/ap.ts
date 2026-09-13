import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ChannelType, InteractionContextType, PermissionFlagsBits } from 'discord.js';
import {
  chatInputDisable,
  chatInputEnable,
  chatInputFilters,
  chatInputOverview,
} from '../handlers/ap/index.js';

@ApplyOptions<Subcommand.Options>({
  description: 'Configure publishing in your announcement channels',
  requiredUserPermissions: [PermissionFlagsBits.ManageChannels],
  runIn: ['GUILD_ANY'],
  preconditions: ['GuildOnly'],
  subcommands: [
    { name: 'enable', chatInputRun: 'chatInputEnable' },
    { name: 'disable', chatInputRun: 'chatInputDisable' },
    { name: 'overview', chatInputRun: 'chatInputOverview' },
    { name: 'filters', chatInputRun: 'chatInputFilters' },
  ],
})
export class APCommand extends Subcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand(builder => {
      const command = builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setContexts([InteractionContextType.Guild])
        .addSubcommand(subcommand =>
          subcommand //
            .setName('enable')
            .setDescription('Enable auto-publishing in announcement channel')
            .addChannelOption(option =>
              option
                .setName('channel')
                .setDescription('The announcement channel to enable auto-publishing in')
                .setRequired(true)
                .addChannelTypes([ChannelType.GuildAnnouncement])
            )
        )
        .addSubcommand(subcommand =>
          subcommand //
            .setName('disable')
            .setDescription('Disable auto-publishing in announcement channel')
            .addChannelOption(option =>
              option
                .setName('channel')
                .setDescription('The announcement channel to disable auto-publishing in')
                .setRequired(true)
                .addChannelTypes([ChannelType.GuildAnnouncement])
            )
        )
        .addSubcommand(subcommand =>
          subcommand //
            .setName('overview')
            .setDescription('See publishing status for every channel in this server')
        );

      // Registered unconditionally: one bot serves both plans, so the command
      // must exist for every guild and gate on the guild's own entitlement.
      command.addSubcommand(subcommand =>
        subcommand //
          .setName('filters')
          .setDescription('Choose exactly which messages auto-publish from each channel')
          .addChannelOption(option =>
            option //
              .setName('channel')
              .setDescription('The announcement channel to manage conditions for')
              .setRequired(true)
              .addChannelTypes([ChannelType.GuildAnnouncement])
          )
      );

      return command;
    });
  }

  // Subcommand handlers
  public chatInputEnable = chatInputEnable;
  public chatInputDisable = chatInputDisable;
  public chatInputOverview = chatInputOverview;
  public chatInputFilters = chatInputFilters;
}
