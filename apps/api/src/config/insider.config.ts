import { z } from 'zod';

const insiderEntrySchema = z.object({
    email: z.email().transform((email) => email.trim().toLowerCase()),
    plan: z.string().trim().min(1).transform((plan) => plan.toLowerCase()),
});

export const insidersSchema = z.array(insiderEntrySchema).superRefine((entries, context) => {
    const emails = new Set<string>();
    for (const [index, entry] of entries.entries()) {
        if (emails.has(entry.email)) {
            context.addIssue({
                code: 'custom',
                message: 'Insider emails must be unique',
                path: [index, 'email'],
            });
        }
        emails.add(entry.email);
    }
});

export type InsiderEntry = z.infer<typeof insiderEntrySchema>;

const entries = insidersSchema.parse(
    await Bun.file(new URL('./insiders.json', import.meta.url)).json(),
);

const promptLimitByPlan: Record<string, number | null> = {
    enterprise: null,
};

export function resolveInsiderPlan(email: string, insiders: readonly InsiderEntry[]): string | null {
    const normalizedEmail = email.trim().toLowerCase();
    return insiders.find((insider) => insider.email === normalizedEmail)?.plan ?? null;
}

export function promptLimitForPlan(plan: string | null): number | null {
    return plan === null ? 3 : (promptLimitByPlan[plan] ?? 3);
}

export const getInsiderPlan = (email: string): string | null => resolveInsiderPlan(email, entries);