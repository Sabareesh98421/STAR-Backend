import pino from "pino";
import { loggerConfig } from "@/config";

//server.log.ts
function createLogger(){
    const logConfig={
        level:loggerConfig.level,
        base:{service:'star'},
        timestamp:pino.stdTimeFunctions.isoTime,
        transport:!loggerConfig.isProduction ? {target:'pino-pretty',options:{colourize:true}}:undefined
    }
    return pino(logConfig)
}
export const logger = createLogger()