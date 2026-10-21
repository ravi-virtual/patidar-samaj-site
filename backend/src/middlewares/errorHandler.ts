import type { NextFunction, Request, Response } from 'express';
import { sendError, type ErrorDetail } from '../utils/apiResponse';
import { ResponseCodes, ErrorCodes, type ErrorCode } from '../config/constants';

interface HttpishError extends Error {
  statusCode?: number;
  status?: number;
  type?: string;
  code?: number | string;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { path: string; message: string }>;
}

const DB_UNAVAILABLE_NAMES = new Set([
  'MongoNetworkError',
  'MongoServerSelectionError',
  'MongoNotConnectedError',
  'MongooseServerSelectionError',
]);

/**
 * Global Express error handler. Must be registered last in app.ts.
 * Responses never include stack traces or raw driver messages — only safe, generic text.
 */
const errorHandler = (err: HttpishError, req: Request, res: Response, _next: NextFunction) => {
  let statusCode: number = err.statusCode ?? err.status ?? ResponseCodes.SERVER_ERROR;
  let code: ErrorCode = ErrorCodes.SERVER_ERROR;
  let message = 'Something went wrong';
  let details: ErrorDetail[] = [];

  if (err.name === 'MulterError') {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    statusCode = tooBig ? ResponseCodes.PAYLOAD_TOO_LARGE : ResponseCodes.BAD_REQUEST;
    code = tooBig ? ErrorCodes.PAYLOAD_TOO_LARGE : ErrorCodes.VALIDATION_ERROR;
    message = tooBig ? 'That file is too large' : 'Upload one file in the "file" field';
  } else if (err.type === 'entity.too.large') {
    statusCode = ResponseCodes.PAYLOAD_TOO_LARGE;
    code = ErrorCodes.PAYLOAD_TOO_LARGE;
    message = 'Request body is too large';
  } else if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    statusCode = ResponseCodes.BAD_REQUEST;
    code = ErrorCodes.VALIDATION_ERROR;
    message = 'Malformed request body';
  } else if (err.name === 'CastError') {
    statusCode = ResponseCodes.BAD_REQUEST;
    code = ErrorCodes.INVALID_ID;
    message = 'Invalid ID format';
  } else if (err.name === 'ValidationError' && err.errors) {
    statusCode = ResponseCodes.BAD_REQUEST;
    code = ErrorCodes.VALIDATION_ERROR;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.code === 11000) {
    statusCode = ResponseCodes.CONFLICT;
    code = ErrorCodes.DUPLICATE;
    // Name the field but never echo the conflicting value back to the client.
    const field = Object.keys(err.keyValue ?? {})[0];
    message = field ? `${field} already exists` : 'Record already exists';
  } else if (DB_UNAVAILABLE_NAMES.has(err.name)) {
    statusCode = ResponseCodes.SERVICE_UNAVAILABLE;
    code = ErrorCodes.DATABASE_UNAVAILABLE;
    message = 'Service temporarily unavailable. Please try again shortly.';
  } else if (statusCode < ResponseCodes.SERVER_ERROR && statusCode >= ResponseCodes.BAD_REQUEST) {
    // Deliberately thrown client errors (e.g. from middleware) keep their own status.
    message = err.message || message;
  }

  return sendError(res, { statusCode, message, code, details });
};

export default errorHandler;
