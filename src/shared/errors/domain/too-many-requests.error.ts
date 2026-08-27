import { AppError } from '../app.error.ts';
import { AppErrorCode } from '../app.error.codes.ts';

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, AppErrorCode.TOO_MANY_REQUESTS, 429);
    this.name = 'TooManyRequestsError';
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}
