import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { fetchUserGuilds } from '../discordUserApi.js';

const MANAGE_GUILD = BigInt(0x20);

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'EX', seconds: number): Promise<unknown>;
};

type Logger = { warn: (obj: unknown, msg?: string) => void };

export function createRequireGuildPermission(redisClient: RedisLike, logger: Logger) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.discordUser;
    const token = req.discordAccessToken;

    if (!user || !token) {
      res.status(StatusCodes.UNAUTHORIZED).json({
        status: StatusCodes.UNAUTHORIZED,
        message: 'Authentication required',
      });
      return;
    }

    const { guildId } = req.params;

    if (!guildId) {
      res.status(StatusCodes.BAD_REQUEST).json({
        status: StatusCodes.BAD_REQUEST,
        message: 'Missing guildId parameter',
      });
      return;
    }

    // Shared resilient read (fresh cache → retry → last-known-good). A real
    // Discord 401 maps to 401 so reactive re-login fires; a transient
    // 429/5xx with no stale fallback maps to 502 the web retries in place — a
    // blip must NOT masquerade as auth-expiry.
    const result = await fetchUserGuilds(redisClient, token, logger);

    if (!result.ok) {
      const status = result.kind === 'auth' ? StatusCodes.UNAUTHORIZED : StatusCodes.BAD_GATEWAY;
      res.status(status).json({
        status,
        message:
          result.kind === 'auth'
            ? 'Invalid or expired Discord token'
            : 'Failed to verify guild membership',
      });
      return;
    }

    const matchingGuild = result.data.find(g => g.id === guildId);

    if (!matchingGuild) {
      res.status(StatusCodes.FORBIDDEN).json({
        status: StatusCodes.FORBIDDEN,
        message: 'You are not a member of this guild',
      });
      return;
    }

    // Discord returns `permissions` as a numeric string; guard the parse so a
    // malformed value (corrupt cache / unexpected shape) yields a clean 500
    // instead of an unstructured throw out of the middleware.
    let hasPermission: boolean;
    try {
      hasPermission = (BigInt(matchingGuild.permissions) & MANAGE_GUILD) !== BigInt(0);
    } catch {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: 'Failed to verify guild permissions',
      });
      return;
    }

    if (!hasPermission) {
      res.status(StatusCodes.FORBIDDEN).json({
        status: StatusCodes.FORBIDDEN,
        message: 'You do not have Manage Server permission in this guild',
      });
      return;
    }

    next();
  };
}
