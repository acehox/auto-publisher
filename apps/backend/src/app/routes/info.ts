import { StatusCodes, sendErrorResponse } from '@ap/express';
import express, { type Response, type Router } from 'express';
import { Services } from '#services/index.js';

export const Info: Router = (() => {
  const router = express.Router();

  /**
   * Get messages queue data
   */
  router.get('/', async (_, res: Response) => {
    try {
      const data = await Services.Info.get();
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data,
        message: 'Info retrieved successfully',
      });
    } catch (error) {
      sendErrorResponse(res, error, 'Error getting info');
    }
  });

  return router;
})();
