import type { Response } from 'express';
import { HTTP_STATUS } from '../constants';

interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    errors?: Record<string, string[]>;
  };
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = HTTP_STATUS.OK,
  meta?: Record<string, unknown>,
): void => {
  res.status(statusCode).json({
    success: true,
    ...(message !== undefined && { message }),
    data,
    ...(meta !== undefined && { meta }),
  } satisfies SuccessResponse<T>);
};

export const sendCreated = <T>(res: Response, data: T, message?: string): void => {
  sendSuccess(res, data, message, HTTP_STATUS.CREATED);
};

export const sendNoContent = (res: Response): void => {
  res.status(HTTP_STATUS.NO_CONTENT).end();
};

export const sendError = (
  res: Response,
  code: string,
  message: string,
  statusCode: number,
  errors?: Record<string, string[]>,
): void => {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(errors !== undefined && { errors }),
    },
  } satisfies ErrorResponse);
};
