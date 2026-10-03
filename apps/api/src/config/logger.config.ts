// logger.config.ts
import { appConfig } from "./app.config";

export const loggerConfig = {
    level: process.env.LOG_LEVEL,
    isProduction: appConfig.isProduction,
};
