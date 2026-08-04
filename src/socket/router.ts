import {Elysia} from 'elysia';
import {wsHandler} from './handlers/handlerExporter';
const socketRouterConfig={
    prefix:'/socket'
};
const socketRouter = new Elysia(socketRouterConfig).ws('/ws', {
    open: wsHandler.onOpen.bind(wsHandler),
    message: wsHandler.onMessage.bind(wsHandler),
    close: wsHandler.onClose.bind(wsHandler)
});

export default socketRouter;    