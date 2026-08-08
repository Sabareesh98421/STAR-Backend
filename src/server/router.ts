// server/router.ts
import { authRoutes } from '@/modules/auth/routes';
import { socketRouter } from '@/socket/routes';
import { Elysia } from 'elysia';
const routerConfig={
    prefix:'/api',
}

const masterRouter = new Elysia(routerConfig)
.use(socketRouter)
.use(authRoutes)
.get('/',()=>{
    console.log('welcome,server is running');
})

export default masterRouter;