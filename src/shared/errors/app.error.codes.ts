// Internal business error codes (AppError.code). Numeric but NOT HTTP statuses —
// the HTTP status returned to the client is set separately via AppError.statusCode
// at each throw site, so these values can and do differ from it (e.g. mailSendError
// is 503 here but is thrown with statusCode 502 in otp.mailer.ts).
const appErrorCodes={
    singleTonDb:101,     // reserved, currently unused
    dbStartError:501,    // Postgres failed to connect, or getDb() called before connectDatabase()
    invalidInput:300,    // reserved, currently unused
    redisStartError:502, // Redis failed to connect, or getRedis() called before connectRedis()
    mailSendError:503,   // SMTP send failed (e.g. OTP email)
    internalError:500,   // uncaught/unclassified error, generic fallback
}
export default appErrorCodes;