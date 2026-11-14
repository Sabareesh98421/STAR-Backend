# Plan — move the run transport from SSE to a WebSocket editor session

Status: Phase 0 and Phase 1 done 2026-10-03, by way of chat sessions. Phase 2
(the editor channel) not started; Phase 3 (replay) came for free and is in.

What shipped differs from this plan in three places, each deliberate:

- **The trigger was continue-chat, not Go-Live.** A conversation cannot be
  one-directional: turn two is asked on the connection turn one answered on.
  This plan listed continue-chat under "what this does NOT deliver"; it is what
  made the migration necessary.
- **No connection registry keyed by run.** One shared browser means one turn in
  flight in the process, so the live turn is a single slot
  (`ensemble.live.ts`) and the `inFlight` boolean is that slot. The lock and
  the thing it protects are one object.
- **No push-to-pull bridge.** The client transport delivers by callback rather
  than implementing `AsyncIterable`, which deletes the queue, the backpressure
  and the class of bug that came with them. `RunTransport` survives only as the
  simulated run the specs drain.

Phase 3 arrived with Phase 1 rather than later: the single live slot already
holds the turn's whole message log, so replay is "send the array from `since`"
and a reconnect mid-run works today.

Scope: the transport between `apps/web` and `apps/api` for ensemble runs, and
the session that will carry the editor's own traffic. Does not include
continue-chat, the Leader step, or auth, each of which is independent.

## Context

`POST /api/ensemble/run` currently streams a run over SSE and works: a verified
one-round run (draft → cross-review → revise) completes against three real
logged-in chat tabs and opens its transcript in the editor.

SSE was chosen badly. Not wrongly for the feature it serves — it is a correct
fit for a bounded, one-directional broadcast — but it was never evaluated
against the product. It was picked because the frontend's `RunTransport`
described an `AsyncIterable<RunEvent>` and `domain/run.ts` mentioned resuming
with `?since=<seq>`, and the existing socket module was never read.

The design says bidirectional editor session, in several places:

- `nuxt.config.ts` configures `wsBase: ws://localhost:3000/ws`.
- `apps/api/src/socket/` exists and is mounted in `server/router.ts` — a 44-line
  echo scaffold, no per-connection state, no routing.
- `LinkState = 'live' | 'reconnecting' | 'offline'`. `reconnecting` is
  meaningless for a request; that type was written for a persistent connection.
- **Go-Live — "Reviews on save · build · commit."** The server reacting
  continuously to editing. The client has to emit save/build/commit, and SSE
  cannot carry that direction at all.
- **Adopt / dismiss**, which `useBuffer` calls "the interaction the brief is
  built around: the agent proposes beside you and never writes into your
  buffer." A proposal arrives, the user adopts or dismisses, the agent reacts.
  The return leg has no channel today.
- **Task Tracker** shows long-running work with progress ("3 of 7") that
  outlives any one run.
- **Context** pins files with `⌥2`/`⌥3`; the server needs to know what is in
  context and the user changes it from the editor.

This is not a chat application with an editor attached. It is an editor in
continuous conversation with an agent system, and the run is one thing that
conversation can contain.

## Why not immediately

The maintenance argument decides the sequencing, not the direction.

A WS session layer is bespoke infrastructure: a connection registry, a
hand-rolled message dispatch, an error envelope parallel to the project's
`AppError` convention, and eventually a replay buffer. The framework owns none
of it. Its characteristic failures — sockets that never close, registry entries
that leak — do not fail tests; they show up as memory growth days later.

Built today, its only consumer would be a run that does not need it, because
none of the editor flows above exist yet. Infrastructure with no real user is
the kind that rots, and a solo maintainer carries it alone. A background agent
already died mid-task this session and left an unreviewed migration on disk;
anything built here has to survive its author disappearing halfway through.

**Trigger: the first editor flow that needs the client to talk back.** Go-Live,
or whatever first makes `peek` reachable so adopt/dismiss stops being dead code.
That feature justifies the connection, gives it traffic in both directions, and
the run moves onto the same session at that point. Not two transports
permanently — SSE is the interim, and the interim ends at a named feature.

## Phase 0 — prerequisite, do this regardless

Fix the validation bug first or it ports into the new transport and then cannot
be attributed. `POST /api/ensemble/run` currently answers **500** for every
invalid body — `{}`, a whitespace-only prompt, `rounds` above the cap — and `{}`
returns Bun's raw HTML fallback, meaning the throw escapes Elysia's `onError`
entirely. The Zod schema is wired (`ensemble.router.ts`, `{ body:
ensembleRunSchema }`), so the likely cause is Elysia not recognising a Zod v4
schema as a validator. See `progress/issues-2026-10-02.md` issue 1.

## Phase 1 — the session, and the run on it

**Envelope, in `packages/run-protocol`.** Both directions, typed, one place —
the same reasoning that put the event names there: an unrecognised message type
is not an error on either side, so a rename produces silence rather than a
failure.

```
ClientMessage = { id, type: 'run.start', prompt, rounds }
              | { id, type: 'run.cancel', runId }
ServerMessage = { seq, type: <existing RunEvent types> }
              | { seq, type: 'error', code, message, details }
```

The `error` variant must carry the same shape `failure()` produces from an
`AppError`, so the project keeps **one** error model rather than two. This is
the single most important detail in the migration; get it wrong and every
future handler has to decide which convention it follows.

**Connection registry** in `socket/handlers/`: connId → socket plus
per-connection state, with cleanup on close. The existing `wsConnection.ts`
also has a real bug to fix on the way past — `onClose` calls `ws.send` on a
closed socket.

**Origin check, explicitly.** Browsers do not enforce CORS on WebSocket
handshakes, so `@elysiajs/cors` will not guard `/ws` and the origin allowlist in
`appConfig.webOrigins` goes inert for run traffic. Check `Origin` in `onOpen`
and reject. With no auth on the endpoint yet this is the only gate there is, so
losing it silently would be a regression in the one place it matters.

**Service change is small.** `drive()` survives; its `send()` stops writing to a
`ReadableStream` controller and writes to the socket. Deleted: `SSE_HEADERS`,
the `ReadableStream`, `start()`/`cancel()`, and `HEARTBEAT_MS` — WS ping/pong
replaces the 10s comment line that currently keeps Bun from closing a response
that has been silent for ~30s.

**Client.** `makeWsRunTransport(wsBase)` implements the existing `RunTransport`
interface, so no component changes. The fiddly part is the push-to-pull bridge:
WS delivers by callback, the interface yields by iteration, so it needs a queue
with backpressure. `transport/sse.ts` and its six framing specs are deleted.

Unchanged throughout: every `.vue` file, `domain/run.ts`, the in-flight lock,
`ensemble.worker.ts`, the transcript renderer, Prisma.

## Phase 2 — the editor channel

The flow that triggered the migration. Client → server for save, build, commit,
context change, adopt and dismiss; server → client for proposals, findings and
task progress. This is where the connection earns its existence.

## Phase 3 — resume, only if reconnects are actually observed

SSE hands back `Last-Event-ID` semi-free, which is why `domain/run.ts` talks
about `?since=<seq>`. Over WS this is yours to build: a bounded per-run ring
buffer server-side, and `{ type: 'resume', since }` from the client. Keep `seq`
monotonic on every event from Phase 1 onward — it is what makes replay possible
later — but do not build the buffer until a dropped socket mid-run is a real
observed problem rather than an imagined one.

## Testing

The current specs are cheap because they call `runEnsembleHandler(body)`
directly and drain a stream: no server, no socket, no network. A naive WS
migration loses that, in a repo where every module has colocated specs. The
migration should **improve** it instead.

**1. Keep the run logic socket-free — inject the emitter.** Make the WS handler
a thin adapter over a function that takes a request and an `emit` callback. A
spec then passes a fake `emit` that collects into an array and asserts on the
sequence, with no transport at all. That is simpler than today's stream
draining, and it is the same shape as `dispatch`'s `onSettled`. Everything
currently covered — the in-flight lock, 409 on a second run, the lock releasing
after a failure, the lock surviving a disconnect, monotonic seq — moves across
unchanged and keeps running without a server.

**2. One real socket harness, for the transport only.** Start the Elysia app on
an ephemeral port, connect a real client, assert: handshake accepted, message
round-trip, event ordering, clean close, and a handshake from a disallowed
origin **rejected**. One file; it is the only place a server is needed.

**3. Client transport against a fake socket.** Inject the socket factory into
`makeWsRunTransport` and assert the push-to-pull bridge: events yielded in
order, a mid-stream error surfaced as a throw, abort stopping iteration,
backpressure not dropping events. Precedent exists — `readWhenSettled` is
tested against a fake Playwright page in `apps/e2e/tests/broadcast.spec.ts`.

**4. Preserve debuggability, deliberately.** The 32-second stream death was
found with `curl -N` and a shell loop; you cannot curl a WebSocket. Add a
`bun run ws:tail` script (~20 lines) that connects and prints messages, so one
transport keeps one debug tool. Do not keep a parallel HTTP route for
debugging — two transports is the smell this migration exists to remove.

**5. Replay tests, with Phase 3 only.** Drop the socket mid-run, reconnect with
`since`, and assert no gaps and no duplicates by `seq`.

**6. Write the test plan first.** Per CLAUDE.md a major feature gets
`docs/test-plans/<feature>.md` before its specs. This is one;
`docs/test-plans/ws-transport.md` comes before any of the above is written, and
should carry a "failures that look like success" table like
`browser-ensemble-run.md` does. Candidates: a leaked registry entry that only
shows as memory; an unrecognised message type silently ignored on either side;
an error delivered as a message the client does not match and therefore drops;
a reconnect that silently loses events because `seq` was not checked.

## What this does NOT deliver

- **Continue-chat.** Needs a conversation entity (the schema's root is
  `EnsembleRun`, with no parent or ordering), a turn-holding store in place of
  `useRun`'s single-run state, and prompt construction across turns. WS makes it
  natural and supplies none of it.
- **Cancel actually stopping a run.** It becomes a real message rather than an
  inferred disconnect, but the models are mid-conversation in three browser tabs
  with nothing safe to interrupt. Cancel stops delivery, not the ensemble.
- **Any performance gain.** Events are tens per run and the bottleneck is three
  chat UIs thinking for 30+ seconds. Transport is ~0% of the time budget. If
  this migration is justified on speed, it is being justified dishonestly.
