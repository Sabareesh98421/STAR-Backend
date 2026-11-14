import { logger } from '@/infrastructure/logger';
import { AppError, AppErrorCode, ElysiaErrorCode, ValidationError } from '@/shared/errors';
import { response, failure } from '@/shared/http';
import { toAppError } from '@/shared/utils/try-catch';
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { appConfig } from '@/config';
import apiRouter from '@/router';

interface RouterError {
    readonly message?: string;
    readonly cause?: unknown;
    readonly customError?: unknown;
    readonly valueError?: {
        readonly path?: unknown;
        readonly message?: string;
    } | null;
}

function validationField(path: unknown): string {
    if (Array.isArray(path)) return path.join('.') || 'root';
    if (typeof path !== 'string') return 'root';

    const field = (path.startsWith('/') ? path.slice(1) : path).replaceAll('/', '.');
    return field || 'root';
}

function customErrorMessage(error: unknown): string | null {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return null;
}

function errorDetails(code: string | number, error: object): { field: string | null; reason: string } {
    const routerError = error as RouterError;
    if (code === ElysiaErrorCode.VALIDATION) {
        return {
            field: validationField(routerError.valueError?.path ?? null),
            reason: customErrorMessage(routerError.customError) ?? routerError.valueError?.message ?? 'Invalid request body',
        };
    }

    if (code === ElysiaErrorCode.PARSE) {
        return {
            field: null,
            reason: routerError.cause instanceof Error ? routerError.cause.message : 'Malformed request body',
        };
    }

    return {
        field: null,
        reason: error instanceof Error ? error.message : 'Unknown error',
    };
}

function appErrorFor(code: string | number, error: object, reason: string, field: string | null): AppError {
    if (code === ElysiaErrorCode.VALIDATION) {
        return new ValidationError(reason, field === null ? {} : { [field]: [reason] });
    }
    if (code === ElysiaErrorCode.PARSE) {
        return new AppError(reason, AppErrorCode.BAD_REQUEST, 400);
    }
    return toAppError(error);
}

const routerConfig = {
    prefix: '/api',
};

const masterRouter = new Elysia(routerConfig)
    .derive(() => ({ starttime: Date.now() }))
    .onRequest(({ request }) => {
        const path = new URL(request.url).pathname;
        logger.info(
            {
                method: request.method,
                path,
            },
            'Request Recieved',
        );
    })
    .onAfterResponse(({ request, set, starttime, responseValue }) => {
        const requestUrl = new URL(request.url);
        const path = requestUrl.pathname;
        const status = responseValue instanceof Response ? responseValue.status : set.status ?? 200;
        logger.info(
            {
                method: request.method,
                path,
                status,
                durationMs: Date.now() - starttime,
            },
            'Request Completed',
        );
    })
    .onError(({ request, code, error }) => {
        const path = new URL(request.url).pathname;
        const { field, reason } = errorDetails(code, error);
        const appError = appErrorFor(code, error, reason, field);
        logger.error(
            {
                method: request.method,
                path,
                code,
                status: appError.statusCode,
                ...(field ? { field } : {}),
                reason,
            },
            'Request failed',
        );
        return response(failure(appError));
    })
    .use(cors({ origin: appConfig.webOrigins, credentials: true }))
    .use(apiRouter)
    .get('/', () => {
        console.log('welcome,server is running');
    });

export default masterRouter;