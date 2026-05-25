import {
  AppError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors.js';

export { AppError };

// Convenience constructors returning the matching AppError subclass.
export const badRequest = (msg: string): AppError => new ValidationError(msg);
export const unauthorized = (msg: string): AppError => new AuthError(msg);
export const forbidden = (msg: string): AppError => new ForbiddenError(msg);
export const notFound = (msg: string): AppError => new NotFoundError(msg);
export const tooManyRequests = (msg: string): AppError => new RateLimitError(msg);
