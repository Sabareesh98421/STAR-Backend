export type { default as WsHandlerI } from './wsHandler.types';
import WebSocketHandler from "./wsConnection";
export const wsHandler= new WebSocketHandler();