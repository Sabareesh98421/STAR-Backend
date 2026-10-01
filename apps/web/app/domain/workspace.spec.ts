import { expect, test } from '@playwright/test';
import { dismissTopmost, MARKERS, type DismissState } from './workspace';

const ALL_UP: DismissState = { layer: 'spotlight', hasToast: true, focusMode: true };

test('Esc peels one layer at a time, in z order', () => {
    let s = ALL_UP;
    const seen: string[] = [];

    for (let i = 0; i < 5; i++) {
        const next = dismissTopmost(s);
        if (next === s) break;
        seen.push(
            next.layer !== s.layer ? s.layer
            : next.hasToast !== s.hasToast ? 'toast'
            : 'focus',
        );
        s = next;
    }

    // spotlight 50 > toast 40 > console 35 > focus mode.
    expect(seen).toEqual(['spotlight', 'toast', 'focus']);
    expect(s).toEqual({ layer: 'rest', hasToast: false, focusMode: false });
});

test('the console is only reachable once nothing sits above it', () => {
    const withConsole: DismissState = { layer: 'console', hasToast: true, focusMode: false };
    // The toast is above the console, so the first press must not close it.
    expect(dismissTopmost(withConsole).layer).toBe('console');
    expect(dismissTopmost(dismissTopmost(withConsole)).layer).toBe('rest');
});

test('Esc at rest changes nothing', () => {
    const rest: DismissState = { layer: 'rest', hasToast: false, focusMode: false };
    expect(dismissTopmost(rest)).toEqual(rest);
});

test('escalation is carried by opacity, never by hue', () => {
    // Sheet B: "no red, no badges, no severity colours." Every marker resolves
    // to accent or ink; a new one tinted anything else is a regression.
    for (const marker of Object.values(MARKERS)) {
        expect(marker.tone).toMatch(/^(accent|accent-60|ink-18|ink-30)$/);
    }
    expect(MARKERS.open.tone).toBe('accent');
    expect(MARKERS.raised.tone).toBe('accent-60');
});
