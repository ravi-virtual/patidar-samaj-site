import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { ResponseCodes, ErrorCodes } from '../config/constants';

/**
 * @name getHealth
 * @file HealthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Liveness and database readiness probe. Reveals no configuration or version details.
 * @author Ravi Patel
 */
export const getHealth = (_req: Request, res: Response) => {
  try {
    const dbConnected = mongoose.connection.readyState === 1;
    if (!dbConnected) {
      return sendError(res, {
        statusCode: ResponseCodes.SERVICE_UNAVAILABLE,
        message: 'Database not connected',
        code: ErrorCodes.DATABASE_UNAVAILABLE,
      });
    }
    return new ApiResponse(ResponseCodes.OK, 'Service healthy', {
      database: 'connected',
      uptimeSeconds: Math.round(process.uptime()),
    }).send(res);
  } catch (err) {
    return sendError(res, {
      statusCode: ResponseCodes.SERVER_ERROR,
      message: err instanceof Error ? err.message : 'Health check failed',
    });
  }
};
