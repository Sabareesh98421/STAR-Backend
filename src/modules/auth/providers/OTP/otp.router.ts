import Elysia from "elysia";
import { requestOtpHandler, verifyOtpHandler } from "./otp.service";
import { otpRequestSchema, otpVerifySchema } from './otp.schema';
const routerConfig={
    prefix:"/otp"
}
const otpRouter = new Elysia(routerConfig)
.post('/request',({body})=>requestOtpHandler(body),{body:otpRequestSchema})
.post('/verify',({body})=>verifyOtpHandler(body),{body:otpVerifySchema})

export default otpRouter;
