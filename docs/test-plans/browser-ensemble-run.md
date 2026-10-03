# Browser ensemble run

Covers the path from a prompt typed in the UI to a transcript opened as a file
in the editor:

```
TravelingField.submit → httpRunTransport → POST /api/ensemble/run (SSE)
  → packages/browser-ensemble: draft → review → revise
  → dispatch() per round → CDP → chatgpt / claude / gemini tabs
  → RunEvents stream back → useBuffer.open(transcript)
```

The point of this feature is to find out whether peer review between frontier
models beats a single model, using the user's own logged-in chat tabs instead
of paid API tokens. So the tests exist to protect the *integrity of the
evidence*, not just the happy path: a run that silently records the wrong text
is worse than a run that fails, because it produces a conclusion.

## What must not be allowed to pass silently

These are the failures that look like success. Every one of them has a test.

| # | Failure | Why it is invisible |
|---|---|---|
| 1 | A model reviews its own draft | Produces a plausible review; the result is self-review dressed as peer review |
| 2 | A stale render collected as this round's answer | Transcript shows a model answering round 2 with its round-1 text, verbatim, no error |
| 3 | A provider error stored as an answer | "Sorry, something went wrong" reads as a settled response |
| 4 | A model named to its peers | Invites deference to a brand instead of judging the argument |
| 5 | Two runs sharing one browser | Both type into the same composers; neither transcript is trustworthy |
| 6 | A dropped model counted as agreement | Three-way agreement and two-way agreement are different evidence |

## Unit — `packages/browser-ensemble`

Spec: `apps/e2e/tests/ensemble.spec.ts`, `apps/e2e/tests/broadcast.spec.ts`
(no browser; the test app owns the runner).

**Prompt construction** (`buildPrompts`) — covers failures 1 and 4
- draft round sends every model the same question
- review round gives each model its peers' drafts and never its own
- revise round shows a model its own draft plus peer critiques, never its own critique
- peers are labelled `Answer A/B/C`; no vendor name appears in any prompt

**Response reading** (`readWhenSettled`) — covers failures 2 and 3
- returns the answer once its text stops changing
- a re-hydrated stale response is skipped and the real answer is awaited
- the same frames with no stale list return last round's answer (pins *why*
  the guard keys off content, not element count)
- a provider error is flagged, not returned as an answer
- a response that never settles times out
- responses present before the prompt was sent are not read back

**Per-model progress** (`dispatch`'s `onSettled`) — covered in the integration
spec, not here. `dispatch` connects over CDP before it does anything else, so
there is no honest unit test for it; a fake that stubs out the connection would
only assert that the fake calls the callback.

## Unit — API

Spec: `apps/api/src/modules/ensemble/ensemble.service.spec.ts`

- `runEnsembleHandler` wraps the logic: a thrown `AppError` becomes a response,
  never an unhandled rejection
- an empty or whitespace-only prompt is rejected as a 400 before any browser work
- a second run while one is in flight returns 409 and does not touch the browser
  (failure 5)
- the in-flight lock releases after a run that threw, not just after one that
  succeeded — otherwise one failure wedges the endpoint until restart
- the transcript written to disk records the exact prompt each model received
  per round, not just the answers

## Unit — web

Spec: `apps/web/app/domain/run.spec.ts`, `apps/web/app/transport/run.transport.spec.ts`

- `applyEvent` stores an `agent.response` under its agent and leaves the others alone
- `applyEvent` still refuses a self-review (`byAgentId === aboutAgentId`)
- the SSE transport yields one `RunEvent` per `data:` line, in order
- a half-received SSE frame is buffered, not parsed as truncated JSON
- a dropped connection moves `link` to `offline` and leaves `status` alone
- cancelling aborts the request and stops yielding

## Integration — the real browser

Spec: `apps/e2e/tests/ensemble.live.spec.ts`. Needs the shared browser running
and every service signed in; skips itself otherwise rather than failing, since
a missing login is a precondition and not a defect.

- a one-round run over the signed-in services produces a transcript whose
  `final` text differs from its `draft` text for at least one model — if revise
  never changes anything, the review loop is not doing work and the whole
  premise is untested
- every round's `sent` prompt is recorded and non-empty for each model
- a model that is signed out appears in the transcript as a failure with a
  reason, not as an empty answer (failure 6)
- `onSettled` fires once per model per round, including for a model that
  failed, and a callback that throws does not take the round down

## Not covered

- Leader / synthesis. There is no leader yet, so nothing picks between the
  revised answers; the transcript keeps all of them.
- Scoring against a known answer. The API spike grades; this harness only
  produces transcripts for a human to read.
- Auth on the endpoint, and more than one concurrent run.
