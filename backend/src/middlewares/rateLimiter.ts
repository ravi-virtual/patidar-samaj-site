import { rateLimit } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config, ResponseCodes, ErrorCodes } from '../config/constants';
import { sendError } from '../utils/apiResponse';

const onLimit = (_req: Request, res: Response) =>
  sendError(res, {
    statusCode: ResponseCodes.TOO_MANY_REQUESTS,
    message: 'Too many requests. Please wait a while and try again.',
    code: ErrorCodes.RATE_LIMITED,
  });

/** General limiter applied to every request. */
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: onLimit,
});

/** Stricter limiter for login, registration, password reset and contact endpoints. */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.authMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: onLimit,
});
