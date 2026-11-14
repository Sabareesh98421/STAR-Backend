import { Elysia } from 'elysia';
import masterRouter from './master.router';

const serverRouter = new Elysia().use(masterRouter);

export default serverRouter;