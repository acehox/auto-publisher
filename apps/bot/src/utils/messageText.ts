import {
  type ComponentInContainer,
  ComponentType,
  type Embed,
  type Message,
  type TopLevelComponent,
} from 'discord.js';

/**
 * Every place a message can carry human-readable text, flattened for matching.
 *
 * `message.content` alone is not enough, and for two different reasons:
 * - Embed-only posts (RSS relays, GitHub, news bots — the bulk of what lands in an
 *   announcement channel) leave `content` empty and put everything in the embed.
 * - A Components V2 message (`IS_COMPONENTS_V2`) has *no* usable `content` or
 *   `embeds` at all — Discord requires both be empty once the flag is set, and the
 *   text lives in Text Display components instead.
 *
 * Reading only `content` therefore made a content condition silently unable to match
 * those messages, which is worse for a negated condition ("does not contain X" would
 * pass everything) than for a positive one.
 *
 * All of these fields are gated behind the Message Content intent, which the bot
 * holds; without it Discord returns them empty and this degrades to `content` only.
 */

/** Text carried by an embed, in the order a reader would encounter it. */
const collectEmbedText = (embed: Embed, into: string[]): void => {
  if (embed.author?.name) into.push(embed.author.name);
  if (embed.title) into.push(embed.title);
  if (embed.description) into.push(embed.description);

  for (const field of embed.fields) {
    if (field.name) into.push(field.name);
    if (field.value) into.push(field.value);
  }

  if (embed.footer?.text) into.push(embed.footer.text);
};

/**
 * Text carried by Components V2, which nests: a Container holds Sections and Text
 * Displays, and a Section holds Text Displays of its own. Only Text Display carries
 * prose — button labels and select placeholders are chrome, not message content.
 */
const collectComponentText = (
  components: readonly (TopLevelComponent | ComponentInContainer)[],
  into: string[]
): void => {
  for (const component of components) {
    switch (component.type) {
      case ComponentType.TextDisplay:
        if (component.content) into.push(component.content);
        break;

      case ComponentType.Container:
      case ComponentType.Section:
        collectComponentText(component.components, into);
        break;

      default:
        break;
    }
  }
};

/**
 * Flatten a message's text for filter matching.
 *
 * Parts are joined by newline so a keyword can never match across a boundary that
 * does not exist for a reader — `title: "foo"` plus `description: "bar"` must not
 * satisfy the keyword `foobar`.
 * @param message Discord message
 * @returns Every readable text part of the message, newline-joined
 */
export const extractMessageText = (message: Message): string => {
  const parts: string[] = [];

  if (message.content) parts.push(message.content);

  for (const embed of message.embeds) {
    collectEmbedText(embed, parts);
  }

  collectComponentText(message.components, parts);

  return parts.join('\n');
};
