import Elysia from "elysia";
import { requestOtpHandler, verifyOtpHandler } from "./otp.handler";
import { otpRequestSchema, otpVerifySchema } from './otp.schema';
const routerConfig={
    prefix:"/otp"
}
const otpRouter = new Elysia(routerConfig)
.post('/request',requestOtpHandler,{body:otpRequestSchema})
.post('/verify',verifyOtpHandler,{body:otpVerifySchema})

export default otpRouter;
