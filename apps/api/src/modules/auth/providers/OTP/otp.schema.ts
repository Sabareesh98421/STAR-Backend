import { z } from 'zod';
import { otpConfig } from '@/config';

export enum OtpPurpose {
  VerifyEmail = 'verify-email',
}

export const otpRequestSchema = z.object({
  email: z.email(),
  purpose: z.string().min(1).max(50).default(OtpPurpose.VerifyEmail),
});

export const otpVerifySchema = z.object({
  email: z.email(),
  purpose: z.string().min(1).max(50).default(OtpPurpose.VerifyEmail),
  otp: z.string().length(otpConfig.length),
});

export type OtpRequestBody = z.infer<typeof otpRequestSchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifySchema>;
