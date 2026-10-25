import { getDiscordEmbed } from '@/lib/discord-embed';

export const dynamic = 'force-dynamic';

export function GET() {
  const embed = getDiscordEmbed();
  return embed ? Response.json(embed) : new Response(null, { status: 404 });
}
