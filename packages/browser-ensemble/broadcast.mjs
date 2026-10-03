// broadcast.mjs — transport layer for the browser ensemble.
//
// Delivers one prompt to N browser-based LLMs simultaneously and collects their
// answers back. Knows nothing about rounds or peer review — that is ensemble.mjs.
//
// Requires the shared browser running (`bun run browser`) with each service
// logged in (`bun run login`).
//
//   node broadcast.mjs "your prompt here"

import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';

// Selectors probed from the live DOM. Every composer is a contenteditable rich
// editor (ProseMirror / tiptap / quill), so we set text via fill() rather than
// typing — that also keeps multi-line prompts from submitting at the first \n.
export const TARGETS = [
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

// Reuse the tab already open for a target; open one only if it's missing.
export async function pageFor(ctx, target) {
    const existing = ctx.pages().find((p) => target.match.test(p.url()));
    if (existing) return existing;
    const page = await ctx.newPage();
    await page.goto(target.newChat, { waitUntil: 'domcontentloaded' });
    return page;
}

// Each tab is one conversation, so a round that should be stateless (the API
// spike's semantics) needs a fresh thread — otherwise a model reviewing peers
// also sees its own earlier draft in context and the comparison is contaminated.
export async function newChat(page, target, { timeoutMs = 30000 } = {}) {
    await page.goto(target.newChat, { waitUntil: 'domcontentloaded' });
    await page.locator(target.composer).waitFor({ state: 'visible', timeout: timeoutMs });

    // A fresh thread has to be genuinely EMPTY before we send. These are SPAs:
    // the previous conversation stays mounted for a beat after navigation, and
    // a response still in the DOM gets read back as if it were this round's
    // answer — which silently feeds one round's output into the next.
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (await page.locator(target.response).count() === 0) return;
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
export const collapseRepeats = (s) =>
    s.split('\n').filter((line, i, all) => i === 0 || line.trim() === '' || line !== all[i - 1]).join('\n');

// Streaming is done when the text stops growing. Quiescence polling beats
// per-site stop-button selectors: one mechanism, nothing to re-probe when a
// vendor reskins its UI.
//
// `stale` is every text this model has already produced (plus whatever was on
// screen before we sent). A match means this round's answer has not rendered
// yet, so returning it would pass one round's output off as the next round's.
//
// It cannot be inferred from the element count: these SPAs re-hydrate the
// PREVIOUS conversation a moment after a /new navigation reports an empty
// thread, so a stale response can appear as the first and only element — count
// says "fresh answer", content says otherwise. Content is the one that's right.
export async function readWhenSettled(page, target, { before, stale = [], settleMs = 1500, timeoutMs = 180000 }) {
    const started = Date.now();
    const last = page.locator(target.response).last();
    let text = '';
    let stableSince = null;

    while (Date.now() - started < timeoutMs) {
        await page.waitForTimeout(400);
        if (await page.locator(target.response).count() <= before) continue;

        const now = collapseRepeats((await last.innerText().catch(() => '')).trim());
        if (stale.includes(now)) continue;

        if (now && now === text) {
            stableSince ??= Date.now();
            if (Date.now() - stableSince >= settleMs) {
                const failed = PROVIDER_ERROR.test(text);
                return { text, ms: Date.now() - started, providerError: failed };
            }
        } else {
            stableSince = null;
            text = now;
        }
    }
    return { text, ms: Date.now() - started, timedOut: true };
}

// Deliver a per-model prompt to every target at once, then collect each answer.
// `promptFor(modelName)` lets a round give each model a different prompt — the
// cross-review round needs that, since each reviewer sees only its peers.
//
// Two phases on purpose: fill all the composers first, then fire every Enter
// together, so the prompts land simultaneously instead of tab-by-tab.
// `staleFor(model)` returns texts this model has already produced in earlier
// rounds; any of them showing up again means we are looking at a stale render,
// not this round's answer.
//
// `onSettled(result)` fires as each model finishes, before the round resolves.
// A round waits on the SLOWEST of three real chat UIs, so a caller that only
// sees the resolved array has nothing to show for minutes. It fires for a
// failed model too: a dropout the caller never hears about reads as a model
// still thinking, and later as agreement it never gave.
export async function dispatch(
    promptFor,
    { cdpUrl = CDP_URL, fresh = false, collect = true, retries = 1, staleFor = () => [], onSettled = null } = {},
) {
    const browser = await chromium.connectOverCDP(cdpUrl);
    try {
        const ctx = browser.contexts()[0] ?? await browser.newContext();

        // Progress reporting is not the run. A caller whose callback throws
        // (a closed SSE stream, a dead socket) must not cost us answers that
        // are already in hand.
        const settled = (result) => {
            try { onSettled?.(result); } catch { /* reporting only */ }
            return result;
        };

        // Re-ask one service on its own, in a fresh thread. Only used to recover
        // from a provider error: the slowest model in a round can take a third
        // request moments after its second and get throttled, which surfaces as
        // "Sorry, something went wrong" rather than an answer. Mirrors the
        // backoff the API spike already uses for the same class of failure.
        const retryOne = async (target, page, attempt) => {
            await page.waitForTimeout(attempt * 3000);
            await newChat(page, target);
            const composer = page.locator(target.composer);
            await composer.waitFor({ state: 'visible', timeout: 30000 });
            await composer.click();
            await composer.fill(promptFor(target.name));
            await page.keyboard.press('Enter');
            return readWhenSettled(page, target, { before: 0, stale: staleFor(target.name) });
        };

        // One unreachable or wedged service must not abort the round for the
        // others — a partial result is still worth having, and the caller can
        // see which model dropped out.
        const prepared = await Promise.allSettled(TARGETS.map(async (target) => {
            const page = await pageFor(ctx, target);
            if (fresh) await newChat(page, target);
            const composer = page.locator(target.composer);
            await composer.waitFor({ state: 'visible', timeout: 30000 });
            const before = await page.locator(target.response).count();
            // Whatever is on screen now, plus everything this model said in
            // earlier rounds. Captured unconditionally: on a fresh thread the
            // count is 0, and keying the guard off the count is what let a
            // re-hydrated stale response through as a "first" answer.
            const onScreen = before
                ? collapseRepeats((await page.locator(target.response).last().innerText().catch(() => '')).trim())
                : '';
            const stale = [...staleFor(target.name), onScreen].filter(Boolean);
            await composer.click();
            await composer.fill(promptFor(target.name));
            return { target, page, before, stale };
        }));

        const failedPrep = TARGETS.flatMap((target, i) =>
            prepared[i].status === 'rejected'
                ? [settled({ model: target.name, ok: false, text: '', ms: 0, error: prepared[i].reason.message })]
                : []);

        const ready = prepared.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []));
        const sent = await Promise.allSettled(ready.map(({ page }) => page.keyboard.press('Enter')));

        // Keep results in TARGETS order regardless of which models dropped out,
        // so a transcript reads the same way across runs.
        const inOrder = (results) => {
            const byModel = new Map([...failedPrep, ...results].map((r) => [r.model, r]));
            return TARGETS.map((t) => byModel.get(t.name)).filter(Boolean);
        };

        if (!collect) {
            return inOrder(ready.map(({ target }, i) => ({
                model: target.name,
                ok: sent[i].status === 'fulfilled',
                error: sent[i].status === 'rejected' ? sent[i].reason.message : null,
            })));
        }

        return inOrder(await Promise.all(ready.map(async ({ target, page, before, stale }, i) => {
            if (sent[i].status === 'rejected') {
                return settled({ model: target.name, ok: false, text: '', ms: 0, error: sent[i].reason.message });
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
                error: r.timedOut ? 'timed out waiting for response'
                    : r.providerError ? `service returned an error instead of an answer (${attempts} attempts)`
                    : null,
            });
        })));
    } finally {
        await browser.close(); // closes the CONNECTION, not the shared browser
    }
}

// Same prompt to everyone — the plain broadcast case.
export const broadcast = (prompt, opts) => dispatch(() => prompt, opts);

if (import.meta.url === `file://${process.argv[1]}`) {
    const prompt = process.argv.slice(2).join(' ').trim();
    if (!prompt) {
        console.error('usage: node broadcast.mjs "your prompt"');
        process.exit(1);
    }
    for (const r of await broadcast(prompt)) {
        console.log(`\n${r.ok ? '✓' : '✘'} ${r.model}${r.error ? ' — ' + r.error : ` (${r.ms}ms)`}`);
        if (r.text) console.log('  ' + r.text.replace(/\n/g, '\n  ').slice(0, 500));
    }
}
