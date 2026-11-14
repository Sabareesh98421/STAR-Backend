export interface FreeTrialUsage {
    readonly runMilliseconds: number;
    readonly cooldownUntil: number | null;
}

export const FREE_TRIAL_RUN_LIMIT_MS = 2 * 60 * 60 * 1000;
export const FREE_TRIAL_COOLDOWN_MS = 5 * 60 * 60 * 1000;

export function canStartFreeTrialRun(usage: FreeTrialUsage, now: number): boolean {
    if (usage.cooldownUntil !== null) return usage.cooldownUntil <= now;
    return usage.runMilliseconds < FREE_TRIAL_RUN_LIMIT_MS;
}

export function recordFreeTrialRun(
    usage: FreeTrialUsage,
    durationMs: number,
    finishedAt: number,
): FreeTrialUsage {
    const previous = usage.cooldownUntil !== null && usage.cooldownUntil <= finishedAt
        ? 0
        : usage.runMilliseconds;
    const duration = Number.isFinite(durationMs) ? Math.max(0, Math.ceil(durationMs)) : 0;
    const runMilliseconds = previous + duration;
    const cooldownUntil = runMilliseconds >= FREE_TRIAL_RUN_LIMIT_MS
        ? finishedAt + FREE_TRIAL_COOLDOWN_MS
        : null;

    return { runMilliseconds, cooldownUntil };
}