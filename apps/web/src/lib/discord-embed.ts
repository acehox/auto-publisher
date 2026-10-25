import 'server-only';
import { env, isPublicInstance } from '@ap/config';
import { BRAND_COLOR, links, PRODUCT_SUMMARY, PUBLIC_BOT_ID, values } from '@/lib/constants';
import { getBotInviteUrl } from '@/lib/invite';
import { getLogoUrl, getSiteUrl } from '@/lib/site-config';
import { formatNumberFull } from '@/lib/utils';

const DISCORD_EMBED_PATH = '/discord-embed.json';

// The subset of Discord's components a component embed accepts. Typed because Discord drops the
// whole payload, silently, over one unknown key.
type LinkButton = { type: 2; style: 5; label: string; url: string };
type TextDisplay = { type: 10; content: string };
type Thumbnail = { type: 11; media: { url: string } };
type Section = { type: 9; components: TextDisplay[]; accessory: Thumbnail | LinkButton };
type Separator = { type: 14; spacing?: 1 | 2; divider?: boolean };
type ActionRow = { type: 1; components: LinkButton[] };
type Container = {
  type: 17;
  accent_color?: number;
  components: (Section | TextDisplay | Separator | ActionRow)[];
};
export type DiscordEmbed = { component: Container };

function linkButton(label: string, url: string): LinkButton {
  return { type: 2, style: 5, label, url };
}

/**
 * Absolute URL of the home page's Discord link preview, or null on a self-hosted copy, whose
 * visitors must not be sent to the public bot's support server.
 */
export function getDiscordEmbedUrl(): string | null {
  if (!isPublicInstance || !env.DISCORD_CLIENT_ID) return null;
  return new URL(DISCORD_EMBED_PATH, getSiteUrl()).href;
}

/** https://docs.discord.com/developers/link-previews/component-embeds */
export function getDiscordEmbed(): DiscordEmbed | null {
  const inviteUrl = getBotInviteUrl({ botId: env.DISCORD_CLIENT_ID });
  if (!getDiscordEmbedUrl() || !inviteUrl) return null;

  const buttons = [
    linkButton('Invite', inviteUrl),
    linkButton('Support Server', links.discordSupportServer),
  ];
  // A public-mode dev stack invites its own application; the top.gg page is the public bot's.
  if (env.DISCORD_CLIENT_ID === PUBLIC_BOT_ID) buttons.push(linkButton('Vote', links.topggVote));

  return {
    component: {
      type: 17,
      accent_color: Number.parseInt(BRAND_COLOR.slice(1), 16),
      components: [
        {
          type: 9,
          components: [
            {
              type: 10,
              content: [
                '## Auto Publisher',
                PRODUCT_SUMMARY,
                `-# Trusted by ${formatNumberFull(values.activeServers)} servers`,
              ].join('\n'),
            },
          ],
          accessory: { type: 11, media: { url: getLogoUrl() } },
        },
        { type: 14, spacing: 2, divider: true },
        { type: 1, components: buttons },
      ],
    },
  };
}
