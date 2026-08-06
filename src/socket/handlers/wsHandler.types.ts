// wsHandler.ts
// WSHandler.types.ts where these interfaces are copied from 
import type { ElysiaWS } from 'elysia/ws';
export default interface WsHandlerI{
    onOpen:(ws: ElysiaWS)=>void
    onMessage:(ws: ElysiaWS,message: string)=>void
    onClose:(ws: ElysiaWS)=>void
    onError?:(ws: ElysiaWS,error: Error)=>void
}