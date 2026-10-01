// resolveAppError.ts
import response from './response';
import { failure } from './responseHelper';
import { AppError } from '@/shared/errors';
import { NEXT, type Resolver } from '@/shared/utils/try-catch';

export const toResponse: Resolver<Response> = (error) => {
    if (error instanceof AppError) return response(failure(error));
    return NEXT;
};
