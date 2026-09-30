import { ChannelType, type Guild, type NewsChannel } from 'discord.js';

export const getAnnouncementChannels = (guild: Guild): NewsChannel[] => [
  ...guild.channels.cache
    .filter((c): c is NewsChannel => c.type === ChannelType.GuildAnnouncement)
    .values(),
];
