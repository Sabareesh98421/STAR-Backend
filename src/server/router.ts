// server/router.ts
import socketRouter from '@/socket/router';
import { Elysia } from 'elysia';
const routerConfig={
    prefix:'/api',
}

const masterRouter = new Elysia(routerConfig)
.use(socketRouter)
.get('/',()=>{
    console.log('welcome,server is running');
})

export default masterRouter;