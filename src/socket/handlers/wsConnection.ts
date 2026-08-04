// wsConnection.ts
import type WsHandlerI from '@/shared/types/WSHandler.types';
import type { ElysiaWS } from 'elysia/ws';
export default class WebSocketHandler implements WsHandlerI {
    constructor() {
        
    }
    onOpen(ws: ElysiaWS): void {
        ws.send('Connection established');
    }
    onMessage(ws: ElysiaWS,message:string): void {
        ws.send(message||'This is a message from the server');

    }
    onClose(ws: ElysiaWS): void {
        ws.send('Connection closed');
    }
}