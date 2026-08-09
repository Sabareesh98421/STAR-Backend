// server/router.ts
import { logger } from '@/infrastructure/logger';
import { authRoutes } from '@/modules/auth/routes';
import { AppError, ValidationError } from '@/shared/errors';
import { socketRouter } from '@/socket/routes';
import { Elysia, status } from 'elysia';
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
.onAfterResponse(({request,set,starttime})=>{
    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname
        logger.info(
            {
                method:request.method,
                path,
                status:set.status ?? 200,
                durationMs:Date.now()-starttime
            },
            "Request Completed"
        )
})
.onError(({request,code,error})=>{
    const path = new URL(request.url).pathname
    const appError = code === "VALIDATION" ? new ValidationError(error.message) 
    : error instanceof AppError ? error 
    : new AppError("Internal server Error","INTERNAL",500)
    logger.error(
        {
            method:request.method,
            path,
            code,
            error

        }
    )
})
.use(socketRouter)
.use(authRoutes)
.get('/',()=>{
    console.log('welcome,server is running');
})

export default masterRouter;