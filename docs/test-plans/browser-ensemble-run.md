# Browser ensemble run

Covers the path from a prompt typed in the UI to a transcript opened as a file
in the editor:

```
TravelingField.submit → openChat → /api/ws/chat/:sessionId (one socket per chat)
  → ensemble.live.startTurn → packages/browser-ensemble: draft → review → revise
  → dispatch() per round → CDP → chatgpt / claude / gemini tabs
  → RunEvents stream back → useBuffer.open(transcript)
```

A run is one TURN of a conversation now. The conversation itself — the socket,
the session, resuming one — is `docs/test-plans/chat-sessions.md`; what is
below is the run inside it.

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

Spec: `apps/api/src/modules/ensemble/ensemble.service.spec.ts`,
`ensemble.live.spec.ts`

- `runTurnHandler` wraps the logic, and takes the emitter: a failure becomes a
  message rather than an unhandled rejection, and the tests need no transport
- an empty or whitespace-only prompt is rejected before any browser work
- a second turn while one is in flight is refused and does not touch the
  browser (failure 5)
- the in-flight lock releases after a run that threw, not just after one that
  succeeded — otherwise one failure wedges the endpoint until restart
- the transcript written to disk records the exact prompt each model received
  per round, not just the answers

## Unit — web

Spec: `apps/web/app/domain/run.spec.ts`,
`apps/web/app/transport/chat.transport.spec.ts`

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

## Unit — stored history

Spec: `apps/api/src/modules/ensemble/*.spec.ts`. Contract:
`packages/run-protocol/history.ts`.

A run costs minutes of real browser time and cannot be repeated identically, so
a run that happened but was not recorded is an experiment that has to be run
again. These protect the record, not the request.

| # | Failure | Why it is invisible |
|---|---|---|
| 7 | A failed run leaves no record | The evidence that a model drops out under load is exactly what gets lost |
| 8 | `sent` prompts dropped to save space | A disagreement between rounds becomes undiagnosable after the fact |
| 9 | A thread URL stored as `''` rather than `null` | "no thread" and "thread we forgot to record" stop being distinguishable |
| 10 | `changedModels` computed twice, differently | The list endpoint and the transcript disagree about the result of the experiment |

- a run that failed partway is still readable, with the rounds it completed
- every round stores the exact prompt each model received
- thread URLs round-trip, including the null case for a model that failed before
  producing one
- `changedModels` from the stored summary matches what the rendered transcript
  says — one implementation, two callers
- the list endpoint returns summaries, not transcripts
- an unknown run id is a 404, not an empty 200

## Unit — the editor

Spec: `apps/web/app/**/*.spec.ts`

The editor is where a finished run is read and edited, so it holds the only copy
of the thing the user came for.

| # | Failure | Why it is invisible |
|---|---|---|
| 11 | Rendered markdown executes embedded HTML | Transcript text is model output: untrusted input rendered into the page |
| 12 | Gutter numbers drift from logical lines | A wrapped line makes every number below it wrong, and it still looks plausible |

- rendered markdown emits no script tag and no `javascript:` href when fed
  hostile input (the content is LLM output, which is a trust boundary)
- gutter numbers correspond to logical lines, not visual rows, so a wrapped
  line does not shift everything below it
- editing marks the buffer dirty; adopting still inserts at the right place
- no horizontal overflow on prose: the editor container's `scrollWidth` does
  not exceed its `clientWidth`

## Not covered

- Leader / synthesis. There is no leader yet, so nothing picks between the
  revised answers; the transcript keeps all of them.
- Scoring against a known answer. The API spike grades; this harness only
  produces transcripts for a human to read.
- Auth on the endpoint, and more than one concurrent run.
- Continuing a conversation, and the socket that carries it: see
  `docs/test-plans/chat-sessions.md`.
