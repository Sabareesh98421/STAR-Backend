import { AppError } from '../app.error.ts';
import { AppErrorCode } from '../app.error.codes.ts';

export class NotFoundError extends AppError {
  constructor(resource: string, id: string | null = null) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, AppErrorCode.NOT_FOUND, 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
