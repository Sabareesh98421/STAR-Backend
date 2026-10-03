import { AppError } from '../app.error.ts';
import { AppErrorCode } from '../app.error.codes.ts';

export class DatabaseError extends AppError {
  constructor(message: string = 'Database request failed', details: unknown = null) {
    super(message, AppErrorCode.DATABASE_ERROR, 500, details);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}
