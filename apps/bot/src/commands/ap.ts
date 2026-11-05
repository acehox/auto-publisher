import { Copy } from '@ap/copy';
import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ChannelType, InteractionContextType, PermissionFlagsBits } from 'discord.js';
import {
  chatInputDisable,
  chatInputEnable,
  chatInputFilters,
  chatInputOverview,
  chatInputRollover,
} from '../handlers/ap/index.js';

@ApplyOptions<Subcommand.Options>({
  description: 'Manage auto-publishing in announcement channels',
  runIn: ['GUILD_ANY'],
  preconditions: ['GuildOnly'],
  // Enable, disable and filters check the channel they name in the handler
  // (`handleManageChannelCheck`), not the one the command was typed in. Overview
  // names no channel, so it keeps the invoking-channel check. Rollover is a
  // server-wide setting, so Manage Server, a guild-level permission the invoking
  // channel cannot change.
  subcommands: [
    { name: 'enable', chatInputRun: 'chatInputEnable' },
    { name: 'disable', chatInputRun: 'chatInputDisable' },
    {
      name: 'overview',
      chatInputRun: 'chatInputOverview',
      requiredUserPermissions: [PermissionFlagsBits.ManageChannels],
    },
    { name: 'filters', chatInputRun: 'chatInputFilters' },
    {
      name: 'rollover',
      chatInputRun: 'chatInputRollover',
      requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
    },
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
            .setDescription(Copy.commands.ap.enable)
            .addChannelOption(option =>
              option
                .setName('channel')
                .setDescription('Announcement channel to enable auto-publishing in')
                .setRequired(true)
                .addChannelTypes([ChannelType.GuildAnnouncement])
            )
        )
        .addSubcommand(subcommand =>
          subcommand //
            .setName('disable')
            .setDescription(Copy.commands.ap.disable)
            .addChannelOption(option =>
              option
                .setName('channel')
                .setDescription('Announcement channel to disable auto-publishing in')
                .setRequired(true)
                .addChannelTypes([ChannelType.GuildAnnouncement])
            )
        )
        .addSubcommand(subcommand =>
          subcommand //
            .setName('overview')
            .setDescription(Copy.commands.ap.overview)
        );

      // Registered unconditionally: one bot serves both plans, so the command
      // must exist for every guild and gate on the guild's own entitlement.
      command.addSubcommand(subcommand =>
        subcommand //
          .setName('filters')
          .setDescription(Copy.commands.ap.filters)
          .addChannelOption(option =>
            option //
              .setName('channel')
              .setDescription('Announcement channel whose filter you want to change')
              .setRequired(true)
              .addChannelTypes([ChannelType.GuildAnnouncement])
          )
      );

      // Registered unconditionally, like filters; free servers get the upgrade message.
      command.addSubcommand(subcommand =>
        subcommand //
          .setName('rollover')
          .setDescription(Copy.commands.ap.rollover)
      );

      return command;
    });
  }

  // Subcommand handlers
  public chatInputEnable = chatInputEnable;
  public chatInputDisable = chatInputDisable;
  public chatInputOverview = chatInputOverview;
  public chatInputFilters = chatInputFilters;
  public chatInputRollover = chatInputRollover;
}
