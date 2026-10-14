import { client } from '#lib/shard.js';

// Respawn all bot clusters
export const respawnClusters = () => {
  client.cluster.respawnAll();
};

// Shutdown all bot clusters and exit the process
export const shutdown = async () => {
  await client.cluster.broadcastEval(c => c.destroy());
  process.exit(0);
};
