import type { RequestHandler, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { ZodType, z } from 'zod';

/**
 * Standard API response format
 */
export type APIResponse<T = object> = {
  status: number;
  data?: T;
  message: string;
  /** Machine-readable reason, set on some error responses so clients can branch */
  code?: string;
};

/**
 * HTTP error with status code
 */
export class HttpError extends Error {
  statusCode: number;
  /** Optional machine-readable reason forwarded to the client */
  code?: string;
  /** Optional structured payload forwarded to the client as the response `data` */
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'HttpError';
  }
}

/**
 * Create HTTP error with status code
 * @param message Error message
 * @param statusCode HTTP status code
 * @param code Optional machine-readable reason forwarded to the client
 * @param details Optional structured payload sent as the response `data`
 * @returns HttpError instance
 */
export const createHttpError = (
  message: string,
  statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
  code?: string,
  details?: Record<string, unknown>
): HttpError => {
  return new HttpError(message, statusCode, code, details);
};

/**
 * Extract status code from error
 * @param error Error object
 * @param defaultStatusCode Default status code if none found
 * @returns HTTP status code
 */
export const getErrorStatusCode = (
  error: unknown,
  defaultStatusCode: number = StatusCodes.INTERNAL_SERVER_ERROR
): number => {
  if (error instanceof HttpError) {
    return error.statusCode;
  }
  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }
  return defaultStatusCode;
};

/**
 * Extract error message from error
 * @param error Error object
 * @param defaultMessage Default message if none found
 * @returns Error message
 */
export const getErrorMessage = (
  error: unknown,
  defaultMessage: string = 'Internal server error'
): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return defaultMessage;
};

/**
 * Send error response
 * @param res Express response object
 * @param error Error object
 * @param defaultMessage Default error message
 * @param defaultStatusCode Default status code
 */
export const sendErrorResponse = (
  res: Response,
  error: unknown,
  defaultMessage: string = 'Internal server error',
  defaultStatusCode: number = StatusCodes.INTERNAL_SERVER_ERROR
): void => {
  const statusCode = getErrorStatusCode(error, defaultStatusCode);
  const message = getErrorMessage(error, defaultMessage);
  const code = error instanceof HttpError ? error.code : undefined;
  const details = error instanceof HttpError ? error.details : undefined;
  res.status(statusCode).json({
    status: statusCode,
    message,
    ...(code ? { code } : {}),
    ...(details ? { data: details } : {}),
  });
};

/**
 * Validates req against a `{ params?, body?, query? }` zod schema (400 on mismatch)
 * and pins the route's request generics, so downstream handlers in the same route
 * see typed req.params/req.body/req.query without casts.
 */
export const validateRequest = <S extends ZodType>(
  schema: S
): RequestHandler<
  z.infer<S> extends { params: infer P } ? P : Record<string, string>,
  unknown,
  z.infer<S> extends { body: infer B } ? B : unknown,
  z.infer<S> extends { query: infer Q } ? Q : Record<string, unknown>
> => {
  return (req, res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
      const errorMessage = `Invalid input: ${result.error.issues.map(issue => issue.message).join(', ')}`;
      res.status(StatusCodes.BAD_REQUEST).json({
        status: StatusCodes.BAD_REQUEST,
        message: errorMessage,
      });
      return;
    }
    next();
  };
};
