import {Elysia} from 'elysia';
import masterRouter from './router';
const listenPort= process.env.PORT || 3000;
const server = new Elysia().use(masterRouter).listen(listenPort,()=>{
    console.log(`Server is running on port ${listenPort}`);
});;

export default server;