import { type Command, Precondition } from '@sapphire/framework';

export class GuildOnlyPrecondition extends Precondition {
  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    if (interaction.guild) return this.ok();
    return this.error({
      message: 'You can use this command only in a server.',
    });
  }
}

declare module '@sapphire/framework' {
  interface Preconditions {
    GuildOnly: never;
  }
}
