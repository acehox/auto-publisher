/** Discord snowflake: 17-20 digits. */
export const SNOWFLAKE_REGEX = /^\d{17,20}$/;

/**
 * Discord CDN icon URL for a guild, or null when the guild has no custom icon
 * (caller renders an initial/fallback). Shared by the server list and the
 * checkout server indicator.
 */
export function guildIconUrl(id: string, icon: string | null): string | null {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${id}/${icon}.webp?size=128`;
}
