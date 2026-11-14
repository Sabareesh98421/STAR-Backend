// server.config.ts
import { envNumber } from './env.util';

export const serverConfig = {
    // API_PORT, not PORT: one .env feeds the whole monorepo and Nuxt reads
    // PORT too, so a generic name here is a port two servers both try to use.
    port: envNumber(process.env.API_PORT, 3000),
    // How many sequential ports (port, port+1, port+2, ...) to try before giving
    // up - always sequential, never random, so the port actually bound is
    // predictable and easy to find/stop.
    maxPortAttempts: envNumber(process.env.SERVER_MAX_PORT_ATTEMPTS, 10),
};
