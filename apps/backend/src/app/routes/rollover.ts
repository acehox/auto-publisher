import { type APIResponse, StatusCodes, sendErrorResponse, validateRequest } from '@ap/express';
import express, { type Router } from 'express';
import { Services } from '#services/index.js';
import { GuildRolloverReqSchema } from '#utils/validations.js';

/**
 * `PUT …/rollover`, mounted on both the bot's guild router and the dashboard's.
 * The plan gate lives in `Plans.setRollover`, so the two cannot diverge.
 */
export const Rollover: Router = (() => {
  const router = express.Router({ mergeParams: true });

  router.put('/', validateRequest(GuildRolloverReqSchema), async (req, res) => {
    const { guildId } = req.params;
    const { enabled } = req.body;

    try {
      const rolloverEnabled = await Services.Plans.setRollover(guildId, enabled);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { rolloverEnabled },
        message: 'Rollover updated successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to update rollover');
    }
  });

  return router;
})();
