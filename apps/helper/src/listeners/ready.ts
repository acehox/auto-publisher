import { config } from '@ap/config';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { type Client, Events } from 'discord.js';
import { startReconcileLoop, syncMembers } from 'services/reconcile.js';
import { logger } from 'utils/logger.js';

@ApplyOptions<Listener.Options>({
  once: true,
  event: Events.ClientReady,
})
export class ReadyListener extends Listener {
  public async run(client: Client<true>) {
    const { guildId, supporterRoleId, dryRun } = config.helper;
    logger.info(
      {
        event: 'helper.ready',
        user: client.user.tag,
        guildId,
        roleId: supporterRoleId,
        dryRun,
      },
      dryRun ? 'Helper ready (DRY RUN)' : 'Helper ready'
    );

    // Exit rather than idle: a restart loop is visible, an idle process is not
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.fatal({ event: 'helper.guild_missing', guildId }, 'Not in the support guild; exiting');
      process.exit(1);
    }

    await syncMembers(guild);
    startReconcileLoop(guild);
  }
}
