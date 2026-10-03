// shared/http/status-text.ts
const statusText: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    // extend as you actually need them — no need to front-load all ~60
} as const;

export function getStatusText(code: number): string {
    return statusText[code] ?? 'Unknown Status';
    }