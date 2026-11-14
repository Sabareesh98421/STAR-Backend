// chrome.ts — the CDP endpoint the ensemble drives, started on demand.
//
// Chrome used to be a third dev process (`bun run dev:cdp`). It is not a
// server: it is Chrome with --remote-debugging-port set, and the only
// thing on the machine that consumes it is this package — so the package
// starts it when it is not already up, and nobody has to remember a second
// terminal. A Chrome already listening on the port is REUSED, never
// restarted, so the submodule's `serve.mjs` (which adds the --AID recorder)
// still works exactly as before when you want it.
//
// This whole file is scaffolding for a browser-driven ensemble and gets
// deleted along with the rest of it when real inference infrastructure
// replaces the browsers.

import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DEFAULT_CDP_URL } from './types.ts';
import type { Browser } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A dedicated profile directory, never Chrome's default one: Chrome refuses
 * --remote-debugging-port on the default profile (136+), and pointing a
 * scripted browser at the real one would put every personal session behind an
 * open debugging port. This is the profile `bun run login` signs in, which is
 * the one thing it exists to hold.
 */
const PROFILE_DIR =
    process.env.ENSEMBLE_CHROME_PROFILE ??
    path.resolve(here, '../../apps/e2e/shared_browser/google-profile');

/**
 * The system Chrome, not a Playwright-launched one. Playwright's launcher adds
 * ~40 automation switches and Google's sign-in rejects that shape outright, so
 * a profile can never be logged in through it. Spawned plainly it is just
 * Chrome. The sandbox staying ON comes free from the same choice — Playwright
 * pushes --no-sandbox unless chromiumSandbox is exactly true.
 */
const CHROME_BIN = process.env.CHROME_BIN ?? 'google-chrome';

/**
 * Whether a silent port means "start Chrome" or "fail, nothing is there".
 *
 * Auto-start is deliberately narrow. A caller that named its own endpoint is
 * telling us it owns that endpoint, and the only honest answer when it is not
 * listening is to fail immediately — the specs point at a port that refuses
 * connections precisely to get that failure, and a 30-second launch attempt
 * turns a fast, intended failure into a timeout.
 *
 * The NODE_ENV guard is the belt to that braces. Launching here means opening
 * the developer's real, logged-in chat profile, so a test run that reached
 * this by accident would type a test prompt into their actual ChatGPT tab.
 * One env check is cheap next to that.
 */
const mayLaunch = (cdpUrl: string): boolean =>
    cdpUrl === DEFAULT_CDP_URL && process.env.NODE_ENV !== 'test';

/** The port is not listening the instant the process exists, and Chrome writes
 *  nothing to stdout worth waiting on — so ask the endpoint itself. */
const listening = (cdpUrl: string): Promise<boolean> =>
    fetch(`${cdpUrl}/json/version`)
        .then((r) => r.ok)
        .catch(() => false);

/** Only ever called for DEFAULT_CDP_URL — `mayLaunch` is the gate — so the
 *  endpoint is not a parameter and its port needs no fallback. */
async function launch(timeoutMs: number): Promise<void> {
    const port = new URL(DEFAULT_CDP_URL).port;

    // Detached and unref'd on purpose. `bun run --watch` restarts the API on
    // every save; a Chrome tied to that lifetime would be killed and relaunched
    // each time, losing the logged-in tabs a run depends on and costing a
    // cold start per keystroke. It outlives us, and the next start reuses it.
    // ponytail: nothing reaps it — `pkill -f "remote-debugging-port=${port}"`
    // to stop it, or add a reaper if an orphan Chrome ever actually bites.
    const child = spawn(
        CHROME_BIN,
        [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${PROFILE_DIR}`,
            '--no-first-run',
            '--no-default-browser-check',
        ],
        { stdio: 'ignore', detached: true },
    );
    // Collected in an array rather than a nullable: spawn reports a missing
    // binary asynchronously, so the only place to see it is the poll below.
    const failures: Error[] = [];
    child.on('error', (err) => failures.push(err));
    child.unref();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (failures.length) {
            throw new Error(
                `could not start ${CHROME_BIN}: ${failures[0]!.message} — set CHROME_BIN if Chrome lives somewhere else`,
            );
        }
        if (await listening(DEFAULT_CDP_URL)) return;
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Chrome did not expose CDP on ${DEFAULT_CDP_URL} within ${timeoutMs}ms`);
}

/**
 * The browser for a run: whatever is already on `cdpUrl`, or — only for the
 * endpoint this module owns — a Chrome started here if nothing is.
 */
export async function connectOrLaunch(cdpUrl: string, timeoutMs = 30_000): Promise<Browser> {
    if (mayLaunch(cdpUrl) && !(await listening(cdpUrl))) await launch(timeoutMs);
    return chromium.connectOverCDP(cdpUrl);
}
