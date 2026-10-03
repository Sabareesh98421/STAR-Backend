import { z } from 'zod';
import { passwordSchema } from './password.schema';

export const emailSignupSchema = z
  .object({
    firstName: z.string().min(1).max(999),
    secondName: z.string().max(1000).optional().transform((v) => v ?? null),
    email: z.email(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type EmailSignupRequest = z.infer<typeof emailSignupSchema>;

export const emailSigninSchema = z.object({
  email: z.email(),
  password: passwordSchema,
});

export type EmailSigninRequest = z.infer<typeof emailSigninSchema>;
