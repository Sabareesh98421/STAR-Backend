import type {
    FailureResponse,
    SuccessResponse,
} from '../types/httpResponse.types';
import type HTTPResponse from '../types/httpResponse.types';

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

export function failure(
    errorCode: string,
    details: unknown = undefined,
    message = '',
    status = 500,
): HTTPResponse<FailureResponse> {
    return {
        status,
        body: {
            success: false,
            message,
            error: {
                code: errorCode,
                ...(details === undefined ? {} : { details }),
            },
        },
    };
}
