// broadcast.ts — transport layer for the browser ensemble.
//
// Delivers one prompt to N browser-based LLMs simultaneously and collects their
// answers back. Knows nothing about rounds or peer review — that is ensemble.ts.
//
// Requires each service logged in (`bun run login` in apps/e2e). The browser
// itself is started on demand by chrome.ts if it is not already up.
//
//   bun run broadcast.ts "your prompt here"

import type { BrowserContext, Page } from 'playwright';
import { connectOrLaunch } from './chrome.ts';
import { DEFAULT_CDP_URL } from './types.ts';
import type {
    DispatchOptions,
    ModelResult,
    Prepared,
    ReadOptions,
    ReadResult,
    Target,
} from './types.ts';

// Selectors probed from the live DOM. Every composer is a contenteditable rich
// editor (ProseMirror / tiptap / quill), so we set text via fill() rather than
// typing — that also keeps multi-line prompts from submitting at the first \n.
export const TARGETS: readonly Target[] = [
    {
        name: 'chatgpt',
        match: /chatgpt\.com/,
        newChat: 'https://chatgpt.com/',
        composer: '#prompt-textarea',
        response: '[data-message-author-role="assistant"]',
    },
    {
        name: 'claude',
        match: /claude\.ai/,
        newChat: 'https://claude.ai/new',
        composer: '[data-testid="chat-input"]',
        response: '.font-claude-response',
    },
    {
        name: 'gemini',
        match: /gemini\.google\.com/,
        newChat: 'https://gemini.google.com/app',
        composer: '[aria-label="Enter a prompt for Gemini"]',
        response: '.model-response-text',
    },
];

/** Reuse the tab already open for a target; open one only if it's missing. */
export async function pageFor(ctx: BrowserContext, target: Target): Promise<Page> {
    // Array.find hands back undefined; it is converted at this line and never
    // travels any further as one.
    const existing = ctx.pages().find((p) => target.match.test(p.url())) ?? null;
    if (existing) return existing;
    const page = await ctx.newPage();
    await page.goto(target.newChat, { waitUntil: 'domcontentloaded' });
    return page;
}

// Each tab is one conversation, so a round that should be stateless (the API
// spike's semantics) needs a fresh thread — otherwise a model reviewing peers
// also sees its own earlier draft in context and the comparison is contaminated.
export async function newChat(page: Page, target: Target, timeoutMs = 30_000): Promise<void> {
    await page.goto(target.newChat, { waitUntil: 'domcontentloaded' });
    await page.locator(target.composer).waitFor({ state: 'visible', timeout: timeoutMs });

    // A fresh thread has to be genuinely EMPTY before we send. These are SPAs:
    // the previous conversation stays mounted for a beat after navigation, and
    // a response still in the DOM gets read back as if it were this round's
    // answer — which silently feeds one round's output into the next.
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if ((await page.locator(target.response).count()) === 0) return;
        await page.waitForTimeout(250);
    }
    throw new Error(`${target.name}: previous conversation did not clear on ${target.newChat}`);
}

// A refusal-to-answer from the service itself, not from the model. These read as
// a normal settled response, so without this check they get scored as an answer.
const PROVIDER_ERROR = /^(sorry, something went wrong|something went wrong|an error occurred)/i;

// Some chat UIs render a line twice inside the response element (a heading or
// preview node alongside the body), and innerText returns both. Harmless on
// screen, but it lands in the transcript and in anything that diffs rounds.
export const collapseRepeats = (s: string): string =>
    s
        .split('\n')
        .filter((line, i, all) => i === 0 || line.trim() === '' || line !== all[i - 1])
        .join('\n');

/**
 * Streaming is done when the text stops growing. Quiescence polling beats
 * per-site stop-button selectors: one mechanism, nothing to re-probe when a
 * vendor reskins its UI.
 *
 * `stale` is every text this model has already produced (plus whatever was on
 * screen before we sent). A match means this round's answer has not rendered
 * yet, so returning it would pass one round's output off as the next round's.
 *
 * It cannot be inferred from the element count: these SPAs re-hydrate the
 * PREVIOUS conversation a moment after a /new navigation reports an empty
 * thread, so a stale response can appear as the first and only element — count
 * says "fresh answer", content says otherwise. Content is the one that's right.
 */
export async function readWhenSettled(
    page: Page,
    target: Target,
    { before, stale = [], settleMs = 1500, timeoutMs = 180_000 }: Partial<ReadOptions> & Pick<ReadOptions, 'before'>,
): Promise<ReadResult> {
    const started = Date.now();
    const last = page.locator(target.response).last();
    let text = '';
    let stableSince: number | null = null;

    while (Date.now() - started < timeoutMs) {
        await page.waitForTimeout(400);
        if ((await page.locator(target.response).count()) <= before) continue;

        // Raw: quiescence only asks whether the text CHANGED. Collapsing here
        // re-split the whole growing answer ~450 times a round to decide one
        // boolean.
        const now = (await last.innerText().catch(() => '')).trim();

        if (now && now === text) {
            stableSince ??= Date.now();
            if (Date.now() - stableSince >= settleMs) {
                const settled = collapseRepeats(now);
                // An earlier round's answer off a re-hydrated SPA. Clearing
                // `stableSince` keeps waiting instead of returning it.
                if (stale.includes(settled)) {
                    stableSince = null;
                    continue;
                }
                return {
                    text: settled,
                    ms: Date.now() - started,
                    providerError: PROVIDER_ERROR.test(settled),
                    timedOut: false,
                };
            }
        } else {
            stableSince = null;
            text = now;
        }
    }
    // Shaped like a settled reading. It may hold text the stale list would have
    // rejected: on this path that is what was on screen when we gave up, and
    // `ok` is false either way.
    return { text: collapseRepeats(text), ms: Date.now() - started, providerError: false, timedOut: true };
}

/**
 * Deliver a per-model prompt to every target at once, then collect each answer.
 * `promptFor(model)` lets a round give each model a different prompt — the
 * cross-review round needs that, since each reviewer sees only its peers.
 *
 * Two phases on purpose: fill all the composers first, then fire every Enter
 * together, so the prompts land simultaneously instead of tab-by-tab.
 *
 * `staleFor(model)` returns texts this model has already produced in earlier
 * rounds; any of them showing up again means we are looking at a stale render,
 * not this round's answer.
 *
 * `onSettled(result)` fires as each model finishes, before the round resolves.
 * A round waits on the SLOWEST of three real chat UIs, so a caller that only
 * sees the resolved array has nothing to show for minutes. It fires for a
 * failed model too: a dropout the caller never hears about reads as a model
 * still thinking, and later as agreement it never gave.
 */
export async function dispatch(
    promptFor: (model: string) => string,
    options: Partial<DispatchOptions> = {},
): Promise<ModelResult[]> {
    const {
        cdpUrl = DEFAULT_CDP_URL,
        fresh = false,
        collect = true,
        retries = 1,
        staleFor = () => [],
        onSettled = null,
    } = options;

    const browser = await connectOrLaunch(cdpUrl);
    try {
        const ctx = browser.contexts()[0] ?? (await browser.newContext());

        // Progress reporting is not the run. A caller whose callback throws
        // (a closed SSE stream, a dead socket) must not cost us answers that
        // are already in hand.
        const settled = (result: ModelResult): ModelResult => {
            try {
                onSettled?.(result);
            } catch {
                /* reporting only */
            }
            return result;
        };

        // Re-ask one service on its own, in a fresh thread. Only used to recover
        // from a provider error: the slowest model in a round can take a third
        // request moments after its second and get throttled, which surfaces as
        // "Sorry, something went wrong" rather than an answer. Mirrors the
        // backoff the API spike already uses for the same class of failure.
        const retryOne = async (target: Target, page: Page, attempt: number): Promise<ReadResult> => {
            await page.waitForTimeout(attempt * 3000);
            await newChat(page, target);
            const composer = page.locator(target.composer);
            await composer.waitFor({ state: 'visible', timeout: 30_000 });
            await composer.click();
            await composer.fill(promptFor(target.name));
            await page.keyboard.press('Enter');
            return readWhenSettled(page, target, { before: 0, stale: staleFor(target.name) });
        };

        // One unreachable or wedged service must not abort the round for the
        // others — a partial result is still worth having, and the caller can
        // see which model dropped out.
        const prepared = await Promise.allSettled(
            TARGETS.map(async (target): Promise<Prepared> => {
                const page = await pageFor(ctx, target);
                if (fresh) await newChat(page, target);
                const composer = page.locator(target.composer);
                await composer.waitFor({ state: 'visible', timeout: 30_000 });
                const before = await page.locator(target.response).count();
                // Whatever is on screen now, plus everything this model said in
                // earlier rounds. Captured unconditionally: on a fresh thread the
                // count is 0, and keying the guard off the count is what let a
                // re-hydrated stale response through as a "first" answer.
                const onScreen = before
                    ? collapseRepeats(
                          (await page.locator(target.response).last().innerText().catch(() => '')).trim(),
                      )
                    : '';
                const stale = [...staleFor(target.name), onScreen].filter(Boolean);
                await composer.click();
                await composer.fill(promptFor(target.name));
                return { target, page, before, stale };
            }),
        );

        const failed = (model: string, error: string): ModelResult =>
            settled({ model, ok: false, text: '', ms: 0, attempts: 1, url: null, error });

        const failedPrep = TARGETS.flatMap((target, i) => {
            const outcome = prepared[i];
            return outcome && outcome.status === 'rejected'
                ? [failed(target.name, String((outcome.reason as Error).message))]
                : [];
        });

        const ready = prepared.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []));
        const sent = await Promise.allSettled(ready.map(({ page }) => page.keyboard.press('Enter')));

        // Keep results in TARGETS order regardless of which models dropped out,
        // so a transcript reads the same way across runs.
        const inOrder = (results: readonly ModelResult[]): ModelResult[] => {
            const byModel = new Map([...failedPrep, ...results].map((r) => [r.model, r]));
            return TARGETS.flatMap((t) => {
                const hit = byModel.get(t.name) ?? null;
                return hit ? [hit] : [];
            });
        };

        if (!collect) {
            return inOrder(
                ready.map(({ target }, i) => {
                    const outcome = sent[i];
                    const error =
                        outcome && outcome.status === 'rejected'
                            ? String((outcome.reason as Error).message)
                            : null;
                    return settled({
                        model: target.name,
                        ok: error === null,
                        text: '',
                        ms: 0,
                        attempts: 1,
                        url: null,
                        error,
                    });
                }),
            );
        }

        return inOrder(
            await Promise.all(
                ready.map(async ({ target, page, before, stale }, i): Promise<ModelResult> => {
                    const outcome = sent[i];
                    if (outcome && outcome.status === 'rejected') {
                        return failed(target.name, String((outcome.reason as Error).message));
                    }

                    let r = await readWhenSettled(page, target, { before, stale });
                    let attempts = 1;
                    while (r.providerError && attempts <= retries) {
                        r = await retryOne(target, page, attempts);
                        attempts++;
                    }

                    return settled({
                        model: target.name,
                        ok: !!r.text && !r.timedOut && !r.providerError,
                        text: r.text,
                        ms: r.ms,
                        attempts,
                        url: page.url(),
                        error: r.timedOut
                            ? 'timed out waiting for response'
                            : r.providerError
                              ? `service returned an error instead of an answer (${attempts} attempts)`
                              : null,
                    });
                }),
            ),
        );
    } finally {
        await browser.close(); // closes the CONNECTION, not the shared browser
    }
}

/** Same prompt to everyone — the plain broadcast case. */
export const broadcast = (prompt: string, opts: Partial<DispatchOptions> = {}): Promise<ModelResult[]> =>
    dispatch(() => prompt, opts);

// CLI: bun run broadcast.ts "your prompt"
if (import.meta.main) {
    const prompt = process.argv.slice(2).join(' ').trim();
    if (!prompt) {
        console.error('usage: bun run broadcast.ts "your prompt"');
        process.exit(1);
    }
    for (const r of await broadcast(prompt)) {
        console.log(`\n${r.ok ? '✓' : '✘'} ${r.model}${r.error ? ' — ' + r.error : ` (${r.ms}ms)`}`);
        if (r.text) console.log('  ' + r.text.replace(/\n/g, '\n  ').slice(0, 500));
    }
}
