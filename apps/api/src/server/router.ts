// server/router.ts
import { logger } from '@/infrastructure/logger';
import { authRoutes } from '@/modules/auth/routes';
import { AppError, AppErrorCode, ElysiaErrorCode, ValidationError } from '@/shared/errors';
import response from '@/shared/http/response';
import { failure } from '@/shared/http/responseHelper';
import { socketRouter } from '@/socket/routes';
import { toAppError } from '@/shared/utils/try-catch';
import { Elysia } from 'elysia';
const routerConfig={
    prefix:'/api',
}

const masterRouter = new Elysia(routerConfig).derive(()=>({starttime:Date.now()}))
.onRequest(({request})=>{
    const path = new URL(request.url).pathname;
    logger.info(
        {
            method:request.method,
            path
        },
        'Request Recieved'
    )
})
.onAfterResponse(({request,set,starttime,responseValue})=>{
    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname
    const status = responseValue instanceof Response ? responseValue.status : set.status ?? 200
        logger.info(
            {
                method:request.method,
                path,
                status,
                durationMs:Date.now()-starttime
            },
            "Request Completed"
        )
})
.onError(({request,code,error})=>{
    const path = new URL(request.url).pathname
    let field: string | null = null
    let reason: string
    if (code === ElysiaErrorCode.VALIDATION) {
        const errPath = error.valueError?.path
        field = (errPath ? errPath.replace(/^\//, '').replace(/\//g, '.') : '') || 'root'
        reason = String(error.customError ?? error.valueError?.message ?? "Invalid request body")
    } else if (code === ElysiaErrorCode.PARSE) {
        const cause = (error as Error).cause
        reason = cause instanceof Error ? cause.message : "Malformed request body"
    } else {
        reason = error instanceof Error ? error.message : "Unknown error"
    }
    const appError = code === ElysiaErrorCode.VALIDATION ? new ValidationError(reason, field ? { [field]: [reason] } : {})
    : code === ElysiaErrorCode.PARSE ? new AppError(reason, AppErrorCode.BAD_REQUEST, 400)
    : toAppError(error)
    logger.error(
        {
            method:request.method,
            path,
            code,
            status:appError.statusCode,
            ...(field ? {field} : {}),
            reason
        },
        "Request failed"
    )
    return response(failure(appError));
})
.use(socketRouter)
.use(authRoutes)
.get('/',()=>{
    console.log('welcome,server is running');
})

export default masterRouter;