import { z } from 'zod';
import { otpConfig } from '@/config';
import { OtpPurpose } from '@/modules/auth/shared';

const purposeSchema = z.enum(OtpPurpose).default(OtpPurpose.VerifyEmail);

export const otpRequestSchema = z.object({
  email: z.email(),
  purpose: purposeSchema,
});

export const otpVerifySchema = z.object({
  email: z.email(),
  purpose: purposeSchema,
  otp: z.string().length(otpConfig.length),
});

export type OtpRequestBody = z.infer<typeof otpRequestSchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifySchema>;
