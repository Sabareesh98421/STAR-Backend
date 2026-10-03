import { AppError } from '../app.error.ts';
import { AppErrorCode } from '../app.error.codes.ts';

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, AppErrorCode.CONFLICT, 409);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}
