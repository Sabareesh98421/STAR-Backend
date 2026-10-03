import { AppError } from '../app.error.ts';
import { AppErrorCode } from '../app.error.codes.ts';

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', details: unknown = null) {
    super(message, AppErrorCode.SERVICE_UNAVAILABLE, 503, details);
    this.name = 'ServiceUnavailableError';
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}
