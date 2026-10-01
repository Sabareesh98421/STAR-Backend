import type {
    FailureResponse,
    SuccessResponse,
} from '../types/httpResponse.types';
import type HTTPResponse from '../types/httpResponse.types';
import type {AppError} from '@/shared/errors/app.error';
export function success<T>(
    data: T,
    message = '',
    status = 200,
): HTTPResponse<SuccessResponse<T>> {

    return {
        status,
        body:{success:true,message,data},
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