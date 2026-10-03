import type { FailureResponse, SuccessResponse, HTTPResponse } from '@/shared/types';
import type { AppError } from '@/shared/errors';
export function success<T>(
    data?: T,
    message = '',
    status = 200,
): HTTPResponse<SuccessResponse<T>> {

    return {
        status,
        body:{success:true,message,data:data??null},
    }
}
export function failure(error: AppError): HTTPResponse<FailureResponse> {
  return {
    status: error.statusCode,
    body: {
      success: false,
      message: error.message,
      error: {
        code: error.code,
        ...(error.details === null ? {} : { details: error.details }),
      },
    },
  };
}