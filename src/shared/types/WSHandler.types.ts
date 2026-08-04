// WSHandler.types.ts
import type { ElysiaWS } from 'elysia/ws';
export default interface WsHandlerI{
    onOpen:(ws: ElysiaWS)=>void
    onMessage:(ws: ElysiaWS,message: string)=>void
    onClose:(ws: ElysiaWS)=>void
}