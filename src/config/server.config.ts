// server.config.ts
import { envNumber } from './env.util';

export const serverConfig = {
    port: envNumber(process.env.PORT, 3000),
    // How many sequential ports (port, port+1, port+2, ...) to try before giving
    // up - always sequential, never random, so the port actually bound is
    // predictable and easy to find/stop.
    maxPortAttempts: envNumber(process.env.SERVER_MAX_PORT_ATTEMPTS, 10),
};
