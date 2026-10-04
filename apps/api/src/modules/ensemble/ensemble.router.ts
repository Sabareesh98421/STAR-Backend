import Elysia from 'elysia';
import {
    createSessionHandler,
    getRunHandler,
    getSessionHandler,
    listRunsHandler,
    listSessionsHandler,
} from './ensemble.history';
import {
    idParamsSchema,
    runDetailQuerySchema,
    runListQuerySchema,
    sessionCreateSchema,
    sessionListQuerySchema,
} from './ensemble.schema';

const routerConfig = {
    prefix: '/ensemble',
};

/**
 * Reads only. A turn is asked for over the conversation's own socket
 * (`/ws/chat/:id`, see socket/chat.socket.ts), never over HTTP: the client has
 * to be able to talk back mid-run, and a run that arrived through a second
 * transport would belong to no conversation and appear in no history.
 *
 * Creating a session is the exception that stays here — it happens once, before
 * there is a socket to open, and the id it returns is what the socket url is
 * built from.
 */
const ensembleRouter = new Elysia(routerConfig)
    .post('/sessions', ({ body }) => createSessionHandler(body), { body: sessionCreateSchema })
    .get('/sessions', ({ query }) => listSessionsHandler(query), { query: sessionListQuerySchema })
    // The conversation, resumed: its turns, oldest first. A turn's transcript
    // is fetched per turn below — twelve of them is hundreds of kilobytes of
    // markdown nobody has asked to read yet.
    .get('/sessions/:id', ({ params }) => getSessionHandler(params), { params: idParamsSchema })
    .get('/runs', ({ query }) => listRunsHandler(query), { query: runListQuerySchema })
    // `?rounds=1` for the prompts and answers behind the transcript. Off by
    // default: the client that opens a turn reads the rendered file and nothing
    // else, and the rounds are that same text over again several times.
    .get('/runs/:id', ({ params, query }) => getRunHandler(params, query), {
        params: idParamsSchema,
        query: runDetailQuerySchema,
    });

export default ensembleRouter;
