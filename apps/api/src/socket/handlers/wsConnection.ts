// wsConnection.ts
import type WsHandlerI from './wsHandler.types';
import type { ElysiaWS } from 'elysia/ws';
export default class WebSocketHandler implements WsHandlerI {
    constructor() {
        // This is intended to be a placeholder for any future initialization logic
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