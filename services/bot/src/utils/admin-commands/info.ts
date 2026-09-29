import client from '#client';
import { Services } from '#services';
import AdminCommand from '#structures/AdminCommand';
import { CommandNames } from '#types/AdminCommandTypes';

export default new AdminCommand(CommandNames.INFO, async ({ channel }) => {
  const data = await Services.Info.get();
  const counts = (await client.cluster.fetchClientValues('guilds.cache.size')) as number[];
  const guildsCount = counts.reduce((acc, c) => acc + (c ?? 0), 0);
  const unprioritized = data?.queue.waiting ?? 0;
  const parsedData = [
    `Guilds: ${guildsCount}`,
    '### REST:',
    `> Global remaining: ${data?.rest.globalRemaining}/50`,
    `> Active handlers: ${data?.rest.activeHandlers}`,
    `> Total handlers: ${data?.rest.handlers}`,
    `> Bucket hashes: ${data?.rest.hashes}`,
    '### Queue:',
    `> Waiting: ${data?.queue.prioritized ?? 0}`,
    // Only rendered when broken: a non-zero count means some enqueue lost its explicit
    // priority and is starving the boosted tier.
    ...(unprioritized ? [`> Unprioritized: ${unprioritized}`] : []),
    `> Active: ${data?.queue.active ?? 0}`,
    `> Delayed: ${data?.queue.delayed ?? 0}`,
    `> Failed: ${data?.queue.failed ?? 0}`,
    `> Completed: ${data?.queue.completed ?? 0}`,
    '### Channels:',
    `> Sublimited: ${data?.sublimitCount}`,
    `> Blocked: ${data?.blockedCount}`,
    '### Onboarding boost:',
    `> Guilds boosted: ${data?.boostedCount ?? 0}`,
    '### Invalid requests (10min window):',
    `> Count: ${data?.rest.invalidRequests.count ?? 0}`,
    `> Window remaining: ${Math.round((data?.rest.invalidRequests.expiresInMs ?? 0) / 1_000)}s`,
  ];
  channel.send(parsedData.join('\n'));
});
