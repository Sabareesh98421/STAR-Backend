import { z } from 'zod';

const ALLOWED_SPECIAL_CHARS = `!@#$%^&*()_+\\-=[\\]{};':"\\\\|,.<>/?`;

export const passwordSchema = z.string().min(8, {
  error:
    'Password must be at least 8 length. Tip: using about 2 characters from each of lowercase, uppercase, numbers, and symbols is an easy way to reach that.',
})
  .max(1000, { error: 'Password must be at most 1000 characters' })
  .regex(/[a-z]/, { error: 'Atleast 1 small chareacters are required' })
  .regex(/[A-Z]/, { error: 'Atleast 1 Capital Letters are required' })
  .regex(/\d/, { error: 'Atleast 1 numbers are required' })
  .regex(new RegExp(`[${ALLOWED_SPECIAL_CHARS}]`), { error: 'At least 1 special character is required' });
