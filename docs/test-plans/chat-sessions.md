# Chat sessions over per-chat sockets

A chat session is an ordered list of turns. One turn is one ensemble run, so a
session is a conversation the models can be asked to continue. The session is
the unit a user comes back to: it is listed in the right rail, reopened, read,
and added to.

Three things are new and each can fail quietly:

1. **Continuation context.** Every round opens a FRESH chat per model, so a
   second turn carries its history in the prompt or not at all. Each model gets
   only its OWN prior answers — the same rule the cross-review already follows.
2. **One socket per chat.** `/ws/chat/:sessionId`. Opening a session opens its
   connection; the connection is where a turn is asked for and where its events
   arrive.
3. **Resume.** Reopening a session reads its turns over HTTP. Reconnecting to a
   session whose run is still going replays that run's events and then streams
   the rest, because a run outlives the socket that asked for it.

## What must not be allowed to pass silently

The point of the list: every one of these produces a session that reads
correctly and is wrong.

| # | Failure | Why it is invisible |
|---|---|---|
| 1 | Turn 2 sent with no context | The models answer the new question well, in isolation. Only a follow-up that depends on turn 1 ("why?") exposes it, and by then the transcript looks fine |
| 2 | A model given another model's prior answer as its own | Reads as a model that revised its position. It is a model reading someone else's conversation |
| 3 | A turn saved without its session | The run exists, the history does not list it. Looks like a run that never happened |
| 4 | Events delivered to the wrong session's socket | Turn text appears under an unrelated chat. No error on either side |
| 5 | An unrecognised message type ignored | Both directions drop silently. A rename on one end produces a UI that never updates |
| 6 | A socket closed but left in the subscriber set | Does not fail a test. Shows up as memory growth days later |
| 7 | A reconnect that replays from zero, or skips | Duplicated or missing turn events in a session that otherwise renders |
| 8 | A WS handshake accepted from any origin | CORS does not apply to WS. With no auth on the endpoint, the origin check is the only gate there is |
| 9 | An error delivered in a shape the client does not match | The client drops it and waits forever on a run that already failed |

## Unit — continuation context (`packages/browser-ensemble`)

Pure prompt construction, so no browser and no network.

- `buildPrompts('draft', { context })` prefixes each model's prompt with that
  model's context and nothing else's → guards #2.
- A model with no context (first turn, or a model that joined late) gets the
  prompt unchanged, with no empty context block → an empty block is a prompt
  that tells the model a conversation happened and withholds it.
- Context reaches `review` and `revise` too, not only `draft`.
- `sent` in the transcript contains the full composed prompt, while
  `transcript.question` stays the user's raw text → the record stays faithful
  and the history stays readable.

## Unit — API, socket-free

`runTurn(request, emit)` takes an emitter, so every one of these runs with no
server, no socket and no network. This replaces the current stream-draining
specs: same coverage, fewer moving parts.

- Every event carries a monotonic, gapless seq (carried over).
- A second turn while one is in flight is refused with a busy error, and does
  not touch the browser (carried over — the shared browser lock is global).
- The lock releases after a turn that FAILED, not only after one that
  succeeded (carried over).
- A failure arrives as an event, since a socket has no status code to use.
- A turn that failed partway is still written, with its session id → #3.
- A database that is down does not fail a turn.
- The composed context passed to the worker is built from the session's prior
  turns, newest last.

## Unit — the socket, with a real server

One file, one ephemeral port, one real client. The only place a server is
needed.

- Handshake accepted for an allowed origin; **rejected** for a disallowed one
  → #8.
- `turn.start` round-trips: the asking socket receives that turn's events.
- A second socket on the SAME session receives the same events; a socket on a
  DIFFERENT session receives none of them → #4.
- A socket that closes is removed from the subscriber set, and the run
  continues → #6. Asserted on the registry, since memory growth is not
  otherwise observable.
- Reconnecting mid-run replays the events already emitted, then continues with
  no gap and no duplicate by seq → #7.
- An unrecognised message type answers with an error rather than being ignored
  → #5.
- A failure arrives as an error message in `failure()`'s shape — one error
  model in the project, not two → #9.

## Unit — web transport

Injected socket factory, asserted against a fake socket. Precedent:
`readWhenSettled` against a fake Playwright page in
`apps/e2e/tests/broadcast.spec.ts`.

- Events are yielded in order, and nothing is dropped when they arrive faster
  than the consumer iterates (the push-to-pull bridge is the fiddly part).
- An error message surfaces as a throw, not as a stream that merely ends.
- Abort stops iteration and closes the socket.
- Each session gets its own socket; switching sessions closes the previous one.

## Unit — session state

- Turns apply in order; a turn's status and file land on that turn and not on
  the session.
- Opening a session with a run already in flight shows that turn as running
  rather than as a finished one with nothing in it.
- The rail lists sessions newest-first and marks the one that is open.

## Integration — the real browser

Manual, because it costs minutes of real browser time and cannot be repeated
identically. Run with all three services signed in:

1. Ask a question. Wait for the transcript.
2. Ask a follow-up in the same session that is unanswerable without turn 1
   ("why that one?"). Every model's answer must show it knows what "that one"
   refers to → the only real check on #1.
3. Reload the page mid-run. The session reopens, the running turn is still
   running, and its remaining events arrive.
4. Confirm against `sent` in the stored round that each model received its own
   prior answer and no peer's → #2.

## Not covered

- Auth on the socket. Nothing in the app is authed yet; the origin check is the
  only gate, which is why it is tested rather than assumed.
- Two sessions running turns at once. One shared browser means one run; a
  second session's `turn.start` is refused, and that refusal is what is tested.
- Cancel interrupting the ensemble. Three real chat tabs are mid-conversation
  with nothing safe to interrupt, so cancel stops delivery, not the work.
