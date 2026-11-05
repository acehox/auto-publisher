import { ContainerBuilder, MessageFlags } from 'discord.js';
import { emojis } from '#lib/constants/index.js';

/** Every command reply is one ephemeral Components V2 container. */
export interface ReplyPayload {
  flags: [MessageFlags.IsComponentsV2];
  components: [ContainerBuilder];
}

export const replyPayload = (container: ContainerBuilder): ReplyPayload => ({
  flags: [MessageFlags.IsComponentsV2],
  components: [container],
});

export interface ReplyOptions {
  /** Heading above the separator. Owns the status emoji, so the body never repeats it. */
  title: string;
  /** Blocks below it, one Text Display each. Falsy entries are dropped. */
  body?: string | (string | false | null | undefined)[];
}

/**
 * The shape every command reply takes: a heading, a separator, then the body.
 *
 * Falsy body blocks are dropped, so conditional copy needs no filtering at the
 * call site. The container is returned unfinished — anything needing separators,
 * sections or action rows below the body keeps building on it.
 */
export const buildReply = ({ title, body }: ReplyOptions): ContainerBuilder => {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(textDisplay => textDisplay.setContent(`### ${title}`))
    .addSeparatorComponents(separator => separator);

  for (const content of Array.isArray(body) ? body : [body]) {
    if (content) {
      container.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
    }
  }

  return container;
};

/** Collector panels close after 10 min of inactivity, well inside the 15-min interaction token life. */
export const PANEL_IDLE_MS = 600_000;

/** Replaces a collector panel once it has been idle for `PANEL_IDLE_MS`. */
export const buildPanelClosedNotice = (panel: string, command: string): ContainerBuilder =>
  new ContainerBuilder().addTextDisplayComponents(textDisplay =>
    textDisplay.setContent(
      `${emojis.info} This ${panel} closed after ${PANEL_IDLE_MS / 60_000} minutes of inactivity. Run ${command} to open it again.`
    )
  );
