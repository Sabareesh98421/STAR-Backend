//socket/router.ts
import {Elysia} from 'elysia';
import { wsHandler } from '@/socket';
// const socketRouterConfig={
//     prefix:'/socket'
// };
const socketRouter = new Elysia().ws('/ws', {
    open: wsHandler.onOpen.bind(wsHandler),
    message: wsHandler.onMessage.bind(wsHandler),
    close: wsHandler.onClose.bind(wsHandler),
});

export default socketRouter;        