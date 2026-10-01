import { AppError } from './app.error.ts';

export class ValidationError extends AppError {
  public readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message, 'VALIDATION_ERROR', 400, fieldErrors);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}