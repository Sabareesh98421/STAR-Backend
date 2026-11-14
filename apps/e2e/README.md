# @star/e2e — browser ensemble harness

Tests the EnsembleM peer-review idea against **frontier** models for free, by
driving the user's own logged-in chat tabs instead of paying per token.

The engine being tested is the one in
`~/ensemblem/ensemble-spike/spike.ts`: broadcast a prompt to N models,
cross-share the answers for peer review, revise, repeat. The spike runs it over
an OpenAI-compatible API with open-weight models; this runs the same round shape
through ChatGPT / Claude / Gemini in a browser. Same protocol, different
transport — so the two are comparable.

## Layers

| file | role |
|---|---|
| `shared_browser/` | submodule — the persistent logged-in Chromium profile, CDP on :9222 |
| `../../packages/browser-ensemble/chrome.ts` | starts Chrome on :9222 on demand, or reuses one already there |
| `../../packages/browser-ensemble/broadcast.ts` | **transport**: deliver a prompt to N tabs simultaneously, collect answers |
| `../../packages/browser-ensemble/ensemble.ts` | **protocol**: draft → cross-review → revise rounds, writes a transcript |
| `show.mjs` | read a transcript back |
| `tests/` | Playwright specs |

`broadcast.ts` knows nothing about rounds. `ensemble.ts` knows nothing about
selectors. Adding a 4th model is one entry in `TARGETS`.

## Use

```bash
bun run login       # once — log into each service by hand (no credentials in code)
```

A run starts the browser itself if it is not up, so `bun run browser` is only
for the extra it adds: the `--AID` recorder. A Chrome already on :9222 is
always reused, never restarted.

The session lives in `shared_browser/google-profile/`, which the submodule
gitignores — a fresh clone has no profile, so `bun run login` is required once
per machine. If you already have a logged-in profile elsewhere (e.g.
`~/google_connectors/google-profile`), symlink it instead of logging in again;
that directory is a live credential store, so move it yourself rather than
having a tool copy it around.

Then, in another terminal:

```bash
bun run broadcast "one prompt to all three"
bun run ensemble -- --rounds 1 "a question worth cross-reviewing"
bun run show -- --full
```

Transcripts land in `runs/<timestamp>.json` (gitignored) and record the exact
prompt each model received per round, not just the answers — without that, a
disagreement between rounds can't be diagnosed after the fact.

## Why it works the way it does

**Simultaneous delivery.** Composers are filled in parallel, then every Enter
fires together. Filling tab-by-tab would stagger the sends.

**A fresh chat per round.** One tab is one conversation. Reusing it would let a
model reviewing its peers also see its own earlier draft in context — the
cross-review would quietly become self-review. Context is passed explicitly in
the prompt instead, which is also what makes the transcript faithful.

**Stale responses are rejected by content, not by element count.** This is the
bug that bites hardest, and it bit twice. These are SPAs: after navigating to a
new thread, the *previous* conversation re-hydrates a beat later. So the reader
can see exactly one response element, be told by the count that it is this
round's fresh answer, and collect last round's text instead. It fails silently —
no error, just a transcript where a model appears to have answered the review
round with its own draft, verbatim.

`newChat` waits for the thread to report empty, which helps but is not
sufficient: the re-hydration happens *after* that check passes. The guard that
actually works is `staleFor` — every text a model has already produced is passed
into the next round, and any response matching one of them is treated as
not-yet-rendered. Keying it off the element count is what left the hole the
first time, since a fresh thread has a count of zero and so disabled the guard
exactly when it was needed.

**Quiescence polling, not stop-button selectors.** A response is done when its
text stops changing. One mechanism for all three sites, nothing to re-probe when
a vendor reskins.

**Models are anonymised as "Answer A/B/C".** Naming the vendor invites deference
to a brand instead of judging the argument.

## Known limits

- Selectors are scraped from live DOM and will rot when a vendor reskins. They're
  all in `TARGETS` — re-probe there, nothing else moves.
- A reviewer sees peer labels with its own letter missing (B sees A and C), which
  hints that one answer was withheld. Harmless so far.
- A provider error ("Sorry, something went wrong") is detected and retried once
  with backoff. Gemini hit this on the revise round in two runs; a same-length
  multi-line payload sent in isolation succeeded, so it reads as throttling
  under load rather than a content or length limit.
- Rate limits and usage caps are real. This is for testing the idea, not volume.
- No leader/synthesis step yet. The spike's `LEADER` model weighs the drafts and
  reviews into one answer; here each model keeps its own revised answer and
  nothing picks between them.
- No scoring. The spike grades against a known answer to test whether peer
  review beats a single model; this harness only produces transcripts.
