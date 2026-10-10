import { config } from '@ap/config';
import { fetchSubscriberUserIds } from 'data/backend.js';
import { type Guild, type GuildMember, PermissionFlagsBits, type Role } from 'discord.js';
import { auditLogReasons, POLL_INTERVAL_MS } from 'lib/constants.js';
import { guardMassAction, massActionCap } from 'utils/alerts.js';
import { logger } from 'utils/logger.js';

const resolveRole = (guild: Guild): Role | null => {
  const role = guild.roles.cache.get(config.helper.subscriberRoleId);
  if (!role) {
    logger.error(
      {
        event: 'reconcile.role_missing',
        roleId: config.helper.subscriberRoleId,
        guildId: guild.id,
      },
      'Subscriber role not found in guild; nothing applied'
    );
  }
  return role ?? null;
};

/** Per pass, not once: roles can be reordered any time, and one clear error beats a burst of 403s. */
const isRoleWritable = (guild: Guild, role: Role): boolean => {
  const me = guild.members.me;
  if (!me) {
    logger.error({ event: 'reconcile.self_missing', guildId: guild.id }, 'Own member not cached');
    return false;
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.error(
      { event: 'reconcile.missing_permission', guildId: guild.id },
      'Helper lacks Manage Roles; nothing applied'
    );
    return false;
  }

  if (me.roles.highest.comparePositionTo(role) <= 0) {
    logger.error(
      {
        event: 'reconcile.role_hierarchy',
        roleId: role.id,
        rolePosition: role.position,
        ownHighestPosition: me.roles.highest.position,
      },
      "Helper's highest role is not above the Subscriber role; every write would 403"
    );
    return false;
  }

  return true;
};

const pastTense = { grant: 'granted', revoke: 'revoked' } as const;

/** Sequential: the per-guild REST bucket serialises these anyway, and one failure must not abort the rest. */
const applyRoleChange = async (
  members: readonly GuildMember[],
  op: 'grant' | 'revoke',
  role: Role
): Promise<void> => {
  for (const member of members) {
    try {
      if (op === 'grant') await member.roles.add(role, auditLogReasons.grant);
      else await member.roles.remove(role, auditLogReasons.revoke);
      logger.info(
        { event: `subscriber.${pastTense[op]}`, userId: member.id },
        `Subscriber role ${pastTense[op]}`
      );
    } catch (err) {
      logger.error(
        { event: `subscriber.${op}_failed`, userId: member.id, err },
        `Failed to ${op} Subscriber role`
      );
    }
  }
};

/** So a join burst is not a query burst. */
let lastDesired: Set<string> | null = null;

/**
 * ```
 * desired = entitled user ids from the backend
 * holders = role.members − bots         (live gateway cache, zero REST)
 * grant   = (desired ∩ members) − holders
 * revoke  = holders − desired
 * ```
 */
export const reconcile = async (guild: Guild): Promise<void> => {
  // The member cache is stale until resyncMembers runs on GuildAvailable
  if (!guild.available) return;

  const role = resolveRole(guild);
  if (!role || !isRoleWritable(guild, role)) return;

  let desired: Set<string>;
  try {
    desired = await fetchSubscriberUserIds();
  } catch (err) {
    // Never revoke on a failed read: grants are safe to retry, revokes are not
    logger.error(
      { event: 'reconcile.read_failed', err },
      'Subscriber read failed; pass skipped, nothing applied'
    );
    return;
  }
  lastDesired = desired;

  const holders = role.members.filter(member => !member.user.bot);

  const grants: GuildMember[] = [];
  for (const userId of desired) {
    if (holders.has(userId)) continue;
    // Paid but not in the support server: guildMemberAdd catches them on join
    const member = guild.members.cache.get(userId);
    if (member) grants.push(member);
  }

  const revokes = [...holders.values()].filter(member => !desired.has(member.id));

  const stats = {
    desired: desired.size,
    holders: holders.size,
    members: guild.members.cache.size,
    grant: grants.length,
    revoke: revokes.length,
    revokeCap: massActionCap(holders.size),
  };

  if (grants.length === 0 && revokes.length === 0) {
    logger.debug({ event: 'reconcile.noop', ...stats }, 'Reconcile pass: already in sync');
    return;
  }

  // Logged before the guard, so the holder audit sees every id even when the
  // batch would trip it (`revoke` > `revokeCap`).
  const { dryRun } = config.helper;
  logger.info(
    {
      event: 'reconcile.plan',
      dryRun,
      ...stats,
      grantUserIds: grants.map(member => member.id),
      revokeUserIds: revokes.map(member => member.id),
    },
    dryRun ? 'Reconcile pass (DRY RUN, nothing applied)' : 'Reconcile pass'
  );
  if (dryRun) return;

  // Aborts grants too: a tripped guard means the read itself is suspect. A real
  // batch over the cap never clears alone: remove the role by hand.
  const withinCap = guardMassAction({
    key: 'subscriber.revoke',
    action: `revoke ${revokes.length === 1 ? 'the Subscriber role' : 'Subscriber roles'}`,
    count: revokes.length,
    population: holders.size,
    context: 'Likely a broken subscription read, not a real mass churn.',
  });
  if (!withinCap) return;

  await applyRoleChange(grants, 'grant', role);
  await applyRoleChange(revokes, 'revoke', role);
};

/**
 * Covers the person who pays before joining the support server. Never revokes:
 * a join says nothing about anyone losing entitlement.
 */
export const grantIfSubscriber = async (member: GuildMember): Promise<void> => {
  const role = resolveRole(member.guild);
  if (!role || member.roles.cache.has(role.id) || !isRoleWritable(member.guild, role)) return;

  try {
    // At most one poll interval stale; a payment newer than that is granted next pass
    const desired = lastDesired ?? (await fetchSubscriberUserIds());
    if (!desired.has(member.id)) return;
  } catch (err) {
    logger.error(
      { event: 'join_check.read_failed', userId: member.id, err },
      'Subscriber check failed on join; the next poll will cover this member'
    );
    return;
  }

  if (config.helper.dryRun) {
    logger.info(
      { event: 'join_check.plan', dryRun: true, userId: member.id },
      'Entitled member joined (DRY RUN, nothing applied)'
    );
    return;
  }

  await applyRoleChange([member], 'grant', role);
};

/**
 * Gateway op 8, rate-limited to 1 per guild per 30s: startup and guildAvailable
 * only, never on a timer. `fetch()` only adds, so members it no longer returns are
 * evicted by hand or they stay counted as holders. Exits on failure: a stale cache
 * is a silently wrong diff, a restart is a fresh fetch.
 */
export const syncMembers = async (guild: Guild): Promise<void> => {
  try {
    const fetched = await guild.members.fetch();
    for (const id of guild.members.cache.keys()) {
      if (!fetched.has(id)) guild.members.cache.delete(id);
    }
  } catch (err) {
    logger.fatal(
      { event: 'helper.member_fetch_failed', guildId: guild.id, err },
      'Member fetch failed; is the Server Members Intent enabled? Exiting'
    );
    process.exit(1);
  }

  logger.info(
    { event: 'helper.members_cached', guildId: guild.id, members: guild.members.cache.size },
    'Member cache populated'
  );
};

let pollTimer: NodeJS.Timeout | null = null;
let passInFlight = false;

const tick = async (guild: Guild): Promise<void> => {
  // Overlapping passes would compute the same diff and write it twice
  if (passInFlight) {
    logger.warn({ event: 'reconcile.overrun' }, 'Previous reconcile pass still running; skipping');
    return;
  }

  passInFlight = true;
  try {
    await reconcile(guild);
  } catch (err) {
    logger.error({ event: 'reconcile.unexpected_error', err }, 'Reconcile pass threw');
  } finally {
    passInFlight = false;
  }
};

/** The first pass goes through `tick` too, so a throw cannot stop the loop. */
export const startReconcileLoop = (guild: Guild): void => {
  if (pollTimer) return;
  pollTimer = setInterval(() => void tick(guild), POLL_INTERVAL_MS);
  logger.info(
    { event: 'reconcile.loop_started', intervalMs: POLL_INTERVAL_MS },
    'Poll loop started'
  );
  void tick(guild);
};

/** No-op before the loop starts: at startup `guildAvailable` precedes `ready`, which fetches itself. */
export const resyncMembers = async (guild: Guild): Promise<void> => {
  if (!pollTimer) return;
  await syncMembers(guild);
  await tick(guild);
};
