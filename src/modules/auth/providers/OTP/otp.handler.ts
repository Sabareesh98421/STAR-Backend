// otp.handler.ts
import type { Context } from "elysia"
import type { OtpRequestBody, OtpVerifyBody } from "./otp.schema"
import { requestOtp, verifyOtp } from './otp.service';

export async function requestOtpHandler({body}:Context<{body:OtpRequestBody}>){
    return await requestOtp(body);
}

export async function verifyOtpHandler({body}:Context<{body:OtpVerifyBody}>){
    return await verifyOtp(body);
}
