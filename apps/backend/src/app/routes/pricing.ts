import { StatusCodes, sendErrorResponse } from '@ap/express';
import express, { type Response, type Router } from 'express';
import { Services } from '#services/index.js';

/** The published Croatian price lists, newest first; read by the web's /cjenik and /premium. */
export const Pricing: Router = (() => {
  const router = express.Router();

  router.get('/', async (_, res: Response) => {
    try {
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: await Services.PriceLists.published(),
        message: 'Price lists retrieved successfully',
      });
    } catch (error) {
      sendErrorResponse(res, error, 'Error getting price lists');
    }
  });

  return router;
})();
