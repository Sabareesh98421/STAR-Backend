import pino from "pino";

//server.log.ts
function loggerConfig(){
    const logConfig={
        level:process.env.LOG_LEVEL,
        base:{service:'star'},
        timestamp:pino.stdTimeFunctions.isoTime,
        transport:process.env.NODE_ENV !== 'production' ? {target:'pino-pretty',options:{colourize:true}}:undefined
    }
    return pino(logConfig)
}
export const logger = loggerConfig()