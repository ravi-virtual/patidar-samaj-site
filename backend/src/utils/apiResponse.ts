import type { Response } from 'express';
import { ResponseCodes, ErrorCodes, type ErrorCode } from '../config/constants';

export interface ErrorDetail {
  field?: string;
  message: string;
}

export class ApiResponse<T extends object = Record<string, never>> {
  readonly statusCode: number;
  readonly success: boolean;
  readonly message: string;
  readonly data: T;

  constructor(statusCode: number, message: string, data: T = {} as T) {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
  }

  send(res: Response): Response {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data,
    });
  }
}

interface SendErrorOptions {
  statusCode?: number;
  message?: string;
  code?: ErrorCode;
  details?: ErrorDetail[];
}

export const sendError = (
  res: Response,
  {
    statusCode = ResponseCodes.SERVER_ERROR,
    message = 'Something went wrong',
    code = ErrorCodes.SERVER_ERROR,
    details = [],
  }: SendErrorOptions = {},
): Response => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: { code, details },
  });
};
