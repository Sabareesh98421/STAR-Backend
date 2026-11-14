import { expect, test } from '@playwright/test';
import { emailSignupSchema } from './email.schema';

const signup = {
    firstName: 'Ada',
    email: 'signup-schema@example.invalid',
    password: 'Sample-Pass-17!',
    confirmPassword: 'Sample-Pass-17!',
};

test('accepts a null optional second name and normalizes it to null', () => {
    const result = emailSignupSchema.safeParse({ ...signup, secondName: null });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.secondName).toBeNull();
});

test('normalizes an omitted optional second name to null', () => {
    const result = emailSignupSchema.safeParse(signup);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.secondName).toBeNull();
});