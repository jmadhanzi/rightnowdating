/**
 * Error carrying an HTTP status code. The global error handler reads
 * `statusCode`, `name`, and `message` to shape the JSON response — stack traces
 * are never exposed to clients.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string, name = 'Error') {
    super(message);
    this.statusCode = statusCode;
    this.name = name;
  }
}

export const badRequest = (msg: string): HttpError => new HttpError(400, msg, 'BadRequest');
export const unauthorized = (msg: string): HttpError => new HttpError(401, msg, 'Unauthorized');
export const tooManyRequests = (msg: string): HttpError =>
  new HttpError(429, msg, 'TooManyRequests');
