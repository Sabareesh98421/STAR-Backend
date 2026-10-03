import Elysia from 'elysia';
import { runEnsembleHandler } from './ensemble.service';
import { ensembleRunSchema } from './ensemble.schema';

const routerConfig = {
    prefix: '/ensemble',
};

// POST, not GET with a query string: the prompt is the user's own text and has
// no business in a URL, a log line, or a referer header.
const ensembleRouter = new Elysia(routerConfig)
    .post('/run', ({ body }) => runEnsembleHandler(body), { body: ensembleRunSchema });

export default ensembleRouter;
