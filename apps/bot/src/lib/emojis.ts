import type { Client } from 'discord.js';
import { emojiNames, emojis } from 'lib/constants/index.js';
import { logger } from 'utils/logger.js';

type EmojiKey = keyof typeof emojis;

/**
 * Resolve this app's emojis by name and write them into `emojis`, replacing the
 * unicode fallbacks. One REST call per cluster, awaited before the cluster
 * reports ready so no reply can render a fallback the app actually owns.
 *
 * App emojis need neither `UseExternalEmojis` nor a shared guild, which is why
 * they replaced the guild-hosted set — see `emojiNames`.
 *
 * A name absent from the app is warned about rather than thrown on: the missing
 * key keeps its fallback and the rest still render. Since the emoji set is
 * uploaded by hand per application, this warning is the only guard against a
 * name drifting between the dev and production apps.
 */
export const hydrateEmojis = async (client: Client<true>): Promise<void> => {
  const fetched = await client.application.emojis.fetch();
  const byName = new Map(fetched.map(emoji => [emoji.name, emoji.toString()]));

  const missing: string[] = [];

  for (const [key, name] of Object.entries(emojiNames) as [EmojiKey, string][]) {
    const resolved = byName.get(name);

    if (!resolved) {
      missing.push(name);
      continue;
    }

    emojis[key] = resolved;
  }

  if (missing.length) {
    logger.warn(
      { event: 'emojis.missing', missing },
      `Missing ${missing.length} app emoji(s), using unicode fallbacks: ${missing.join(', ')}`
    );
  }
};
