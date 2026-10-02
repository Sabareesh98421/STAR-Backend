# Frontend architecture

Status: brief, awaiting approval. Foundation is built; no product surface yet.

## 1. Boundaries

The backend rule is "never hardcode a vendor outside `infrastructure/`."
The frontend rule is the same shape with a different vendor:

> **Nothing outside `app/transport/` may know that HTTP or WebSocket exist.**

No `$fetch`, no `WebSocket`, no URL, no envelope unwrapping anywhere else. A
module imports an interface-typed client and receives domain objects. When the
backend's `{success, message, data}` envelope changes, or SSE replaces
WebSocket, one folder changes.

```
apps/web/app/
  domain/       concepts and pure logic. No Vue, no fetch, no DOM.
  transport/    the only folder that knows about the network.
  composables/  stateful behaviour. One concern each.
  components/   presentation, named after the design's own primitives.
  assets/css    main.css: Tailwind theme carrying the design tokens.
```

`components/` and `composables/` are Nuxt's auto-import conventions rather
than the backend's `modules/`. Fighting them to mirror a folder name would
cost more than the symmetry is worth; the boundary that actually matters,
`domain/` and `transport/`, is kept.

The backend's barrel discipline applies where there are barrels to have. Nuxt
resolves components and composables by convention, so an index.ts per folder
would be a second, competing resolution mechanism rather than a contract.

Terminology is shared with the backend on purpose: Conversation, Run, Agent,
Response, Review, Leader. Same words, same meanings, both sides.

## 2. The run is a graph; the store is flat

A run is a tree (Run → Agents → Responses → Reviews, plus Leader). Storing it
as a tree gives one deep reactive object graph that Vue must traverse on every
token. So the graph is kept as **normalised maps plus id references**, and the
tree is reconstructed only by the component that renders it.

```
run       { id, conversationId, status, agentIds[], leaderId, cursor }
agents    Map<agentId,    AgentState>
responses Map<responseId, ResponseMeta>   // metadata only, never the text
reviews   Map<reviewId,   ReviewMeta>     // targets a responseId + a span
```

`ReviewMeta` points at a response and a character span inside it. That is what
makes peer review render as annotation on a claim rather than as a second
column of argument (PRODUCT.md principle 4).

## 3. Streaming text stays outside reactivity

The hard requirement: a token must not trigger application-wide reactivity.

Response text is **not** in the reactive store. Tokens land in a plain
non-reactive buffer keyed by responseId, and a single `requestAnimationFrame`
flush publishes them into one `shallowRef` per response. Consequences:

- N agents streaming at any rate produce at most one flush per frame in total.
- A flush touches one `shallowRef`, read by one component. Nothing else
  re-renders: not the run header, not the sibling agent lanes, not the shell.
- Text is a string, so there is no per-token object allocation and no proxy.

When a run completes, its buffers are released; only the settled text is kept,
and only for runs currently on screen.

## 4. Transport health is not run status

The prompt's recovery scenario only works if these two are never conflated:

| Axis | Owner | Values |
|---|---|---|
| `RunStatus` | backend truth | `queued` `responding` `reviewing` `synthesizing` `complete` `failed` `cancelled` |
| `LinkState` | our connection | `live` `reconnecting` `offline` `stale` |

A dropped socket moves `LinkState` to `reconnecting`. It **never** moves
`RunStatus`. The UI reports "Network: reconnecting" beside "Agent C:
reviewing", exactly as in your example. A run is only `failed` when the backend
says so.

The eleven required UI states are these two axes plus per-request status
(`idle` `loading` `partial` `success` `empty` `retrying` `cancelled`), which
belongs to the request, not to the app.

### 4.1 This imposes one requirement on the backend

Reconnection reconciliation is impossible without a resumable event stream.
The contract needs:

- every run event carries a monotonic `seq` within its run;
- a resume endpoint accepting `?since=<seq>` that replays everything after it;
- a run snapshot endpoint, for when the gap is too large to replay.

The client stores the last applied `seq` as the run's cursor. On reconnect it
resumes from the cursor, and falls back to a snapshot if the server says the
cursor is too old. **This is the single most important thing to build into the
run API.** Retries use exponential backoff with jitter; every request is
abortable via `AbortController`, and leaving a run aborts its in-flight work.

## 5. Responsive strategy

Per your decision: on mobile there is no editor, and the chat *is* the editing
surface.

| Viewport | Surface |
|---|---|
| Phone | Single column. Conversation is primary and is where changes are proposed and accepted. Booster is a bottom sheet. Run state inline. |
| Tablet | Conversation plus a docked Booster. |
| Desktop | Project rail, editor centre, Booster right. |

No horizontal scrolling anywhere as a normal interaction. Content that is
genuinely wider than the viewport (diffs, tables, long code) scrolls inside its
own container; the page never does.

Review density is handled by progressive disclosure, not by columns: a response
shows inline markers where peers flagged something, and opening a marker
reveals the review against that span. There is no N-column side-by-side
comparison at any width, because N is unknown.

## 6. What is deliberately absent

No Pinia: a per-run store created and disposed with the run covers it, and a
global store for per-run data is how obsolete streaming state gets retained.
No animation library: the design specifies two curves and two durations. No
virtualisation until a list actually measures slow.

Tailwind and Nuxt UI *are* used. An earlier draft of this document argued
against Tailwind on the grounds that agent colour had to be generated at
runtime for an unknown N, which a static utility system cannot express. That
reasoning died with the premise: the design carries identity through four
accent opacities and four glyphs, not through generated hue, so there is
nothing dynamic to express. Tailwind's default spacing scale is also already
the design's own (4 8 12 16 24 32 48).

Nuxt UI earns its place for Tailwind 4, color-mode and fonts, which it
bundles. Its *components* are mostly unused: the FIELD, rail, peek and console
are bespoke geometry, and its `defineShortcuts` did not work here and was
replaced by one listener. A dependency is kept for the parts that work, not
adopted wholesale.

Each absent thing gets added the moment something measures worse without it,
and not before.
