import type { Nullable } from './common.types';
export interface SuccessResponse<T> {
    success: true;
    message: string;
    data: Nullable<T>;
}

export interface FailureResponse {
    success: false;
    message: string;
    error: {
        code: string;
        details?: unknown;
    };
}

type ApiBody<T> = SuccessResponse<T> | FailureResponse;
export default interface HTTPResponse<T=ApiBody<unknown>>{
    status: number;
    statusText?: string;
    body: T;
}
