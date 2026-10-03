import { AppError } from '../app.error.ts';
import { AppErrorCode } from '../app.error.codes.ts';

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, AppErrorCode.UNAUTHORIZED, 401);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}
