import {Elysia} from 'elysia';
import masterRouter from './router';
const server = new Elysia().use(masterRouter);

export default server;