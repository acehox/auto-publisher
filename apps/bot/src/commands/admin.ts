import { env } from '@ap/config';
import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { InteractionContextType, PermissionFlagsBits } from 'discord.js';
import {
  chatInputInfo,
  chatInputPing,
  chatInputRespawn,
  chatInputShutdown,
  chatInputUptime,
} from '../handlers/admin/index.js';

const prefix = '[BOT ADMIN]';

@ApplyOptions<Subcommand.Options>({
  description: `${prefix} Bot maintenance tools`,
  requiredUserPermissions: [PermissionFlagsBits.Administrator],
  preconditions: ['SupportGuild'],
  subcommands: [
    { name: 'info', chatInputRun: 'chatInputInfo' },
    { name: 'ping', chatInputRun: 'chatInputPing' },
    { name: 'respawn', chatInputRun: 'chatInputRespawn' },
    { name: 'shutdown', chatInputRun: 'chatInputShutdown' },
    { name: 'uptime', chatInputRun: 'chatInputUptime' },
  ],
})
export class AdminCommand extends Subcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    // Guild-scoped to the operator's own support server. Unset (the self-host
    // default) means there is nowhere to register it — registering against an
    // empty id would fail, and against the hosted service's guild id would be
    // both useless and wrong.
    if (!env.BOT_SUPPORT_GUILD_ID) return;

    registry.registerChatInputCommand(
      builder =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
          .setContexts([InteractionContextType.Guild])
          .addSubcommand(subcommand =>
            subcommand //
              .setName('info')
              .setDescription(`${prefix} Show bot information`)
          )
          .addSubcommand(subcommand =>
            subcommand //
              .setName('ping')
              .setDescription(`${prefix} Show the bot's latency`)
          )
          .addSubcommand(subcommand =>
            subcommand //
              .setName('respawn')
              .setDescription(`${prefix} Restart all bot clusters`)
          )
          .addSubcommand(subcommand =>
            subcommand //
              .setName('shutdown')
              .setDescription(`${prefix} Shut down the bot`)
          )
          .addSubcommand(subcommand =>
            subcommand //
              .setName('uptime')
              .setDescription(`${prefix} Show how long the bot has been online`)
          ),
      {
        guildIds: [env.BOT_SUPPORT_GUILD_ID],
      }
    );
  }

  // Subcommand handlers
  public chatInputInfo = chatInputInfo;
  public chatInputPing = chatInputPing;
  public chatInputRespawn = chatInputRespawn;
  public chatInputShutdown = chatInputShutdown;
  public chatInputUptime = chatInputUptime;
}
