import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config, ResponseCodes, ErrorCodes } from '../config/constants';
import { sendError } from '../utils/apiResponse';

const onLimit = (_req: Request, res: Response) =>
  sendError(res, {
    statusCode: ResponseCodes.TOO_MANY_REQUESTS,
    message: 'Too many requests. Please wait a while and try again.',
    code: ErrorCodes.RATE_LIMITED,
  });

// Hosts such as Vercel add a standard `Forwarded` header next to X-Forwarded-For. Express's
// `trust proxy` reads X-Forwarded-For (req.ip), so the library's "Forwarded is ignored" check
// would reject every request; the client IP is already resolved correctly.
const validate = { forwardedHeader: false };

const off: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next();

/** General limiter applied to every request. On by default; RATE_LIMIT_MAX=0 turns it off. */
export const rateLimiter: RequestHandler = config.rateLimit.enabled
  ? rateLimit({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => config.isTest,
      handler: onLimit,
      validate,
    })
  : off;

/** Stricter limiter for login, password reset and contact endpoints. On by default; AUTH_RATE_LIMIT_MAX=0 turns it off. */
export const authRateLimiter: RequestHandler = config.rateLimit.authEnabled
  ? rateLimit({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.authMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => config.isTest,
      handler: onLimit,
      validate,
    })
  : off;

/** Per signed-in user cap on media uploads (each one is forwarded to Cloudinary). On by default; UPLOAD_RATE_LIMIT_MAX=0 turns it off. */
export const uploadRateLimiter: RequestHandler = config.rateLimit.uploadEnabled
  ? rateLimit({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.uploadMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
      skip: () => config.isTest,
      handler: onLimit,
      validate,
    })
  : off;
