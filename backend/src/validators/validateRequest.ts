import type { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { sendError } from '../utils/apiResponse';
import { ErrorCodes, ResponseCodes } from '../config/constants';

/** Always the LAST item of every rule list (skill rule). Returns the standard validation error. */
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({
      field: e.type === 'field' ? e.path : undefined,
      message: String(e.msg),
    }));
    return sendError(res, {
      statusCode: ResponseCodes.BAD_REQUEST,
      message: 'Validation failed',
      code: ErrorCodes.VALIDATION_ERROR,
      details,
    });
  }
  return next();
};
