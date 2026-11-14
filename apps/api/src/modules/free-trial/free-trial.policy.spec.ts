import { expect, test } from '@playwright/test';
import {
    canStartFreeTrialRun,
    FREE_TRIAL_COOLDOWN_MS,
    FREE_TRIAL_RUN_LIMIT_MS,
    recordFreeTrialRun,
} from './free-trial.policy';

test('run time below the limit remains available regardless of idle gaps', () => {
    const usage = recordFreeTrialRun({ runMilliseconds: 0, cooldownUntil: null }, 30 * 60 * 1000, 1_000);

    expect(canStartFreeTrialRun(usage, 24 * 60 * 60 * 1000)).toBe(true);
    expect(usage.runMilliseconds).toBe(30 * 60 * 1000);
});

test('reaching two accumulated hours starts a five-hour cooldown after settlement', () => {
    const finishedAt = 50_000;
    const usage = recordFreeTrialRun(
        { runMilliseconds: FREE_TRIAL_RUN_LIMIT_MS - 1_000, cooldownUntil: null },
        1_000,
        finishedAt,
    );

    expect(usage.cooldownUntil).toBe(finishedAt + FREE_TRIAL_COOLDOWN_MS);
    expect(canStartFreeTrialRun(usage, finishedAt + FREE_TRIAL_COOLDOWN_MS - 1)).toBe(false);
    expect(canStartFreeTrialRun(usage, finishedAt + FREE_TRIAL_COOLDOWN_MS)).toBe(true);
});

test('a threshold usage without cooldown metadata cannot start another run', () => {
    expect(canStartFreeTrialRun({ runMilliseconds: FREE_TRIAL_RUN_LIMIT_MS, cooldownUntil: null }, 0)).toBe(false);
});

test('the first run after cooldown starts a fresh accumulation cycle', () => {
    const finishedAt = 5_000_000;
    const usage = recordFreeTrialRun(
        { runMilliseconds: FREE_TRIAL_RUN_LIMIT_MS, cooldownUntil: finishedAt - 1 },
        10_000,
        finishedAt,
    );

    expect(usage).toEqual({ runMilliseconds: 10_000, cooldownUntil: null });
});

test('negative durations cannot reduce or bypass accumulated usage', () => {
    const usage = recordFreeTrialRun({ runMilliseconds: 60_000, cooldownUntil: null }, -10_000, 2_000);

    expect(usage).toEqual({ runMilliseconds: 60_000, cooldownUntil: null });
});

test('non-finite durations do not corrupt the stored allowance', () => {
    const usage = recordFreeTrialRun({ runMilliseconds: 60_000, cooldownUntil: null }, Number.NaN, 2_000);

    expect(usage).toEqual({ runMilliseconds: 60_000, cooldownUntil: null });
});