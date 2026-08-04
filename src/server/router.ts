// router.ts
import socketRouter from '@/socket/router';
import { Elysia } from 'elysia';
const routerConfig={
    prefix:'/api',
}
const listenPort= process.env.PORT || 3000;
const masterRouter = new Elysia(routerConfig).get('/',()=>{
    console.log('server is running');
}).use(socketRouter).listen(listenPort,()=>{
    console.log(`Server is running on port ${listenPort}`);
});
export default masterRouter;