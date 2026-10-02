# Frontend implementation record

What exists in `apps/web`, why it is shaped that way, and what is still open.
Written at the end of the first implementation pass.

## 1. Where the design came from

Three sources, which do not describe the same product:

| Source | What it covers |
|---|---|
| `EnsembleM_Design_Specification/` (sibling repo) | Workspace / Projects IA, three routes, retro-computing direction |
| `claude-desing/` (sibling repo) | The editor-centric brief: full-bleed editor, floating prompt, Productive Booster, go-live, spotlight |
| `plans/Design system canvas sheets-handoff/` | The actual wireframes: Sheets A, B, C |

The wireframes are the source of truth for anything visual, and they are
specific: exact blur, fill and hairline values, a four-step accent, four status
glyphs, fixed geometry, an explicit z order.

**They do not contain the product.** Both variants were searched: zero
occurrences of `leader`, `peer`, `model`, `llm`, `ensemble`, `synthes`.
`agent` appears only as the composer chip and "agent edit", singular. The
wireframes design the *shell*, not the multi-LLM system.

## 2. The one hook into the product

Sheet A, under ROW:

> `instances: tree row · file result · review finding · agent thread`

So the design did decide how participants render: an agent thread is a ROW,
the same five slots as everything else, and a review finding is a ROW too.
Rows, not columns, which is the only layout that survives an unknown N.

Everything in `AgentThreads.vue` is built on that line. The Leader has no
design at all; it is currently a row whose meta slot carries its RAG and
retrieval activity. **That part is inference, not specification.**

## 3. What is built

```
apps/web/app/
  assets/css/main.css      tokens from both .dc.html variants, as Tailwind @theme
  domain/
    workspace.ts           shell types, Esc z-order        (+ spec)
    run.ts                 agents, phases, reviews, events (+ spec)
    fixtures.ts            the design's own sample content
  transport/
    run.transport.ts       the network boundary + a local driver
  composables/
    useShell.ts            layers, focus mode, hint layer, Sheet C keymap
    useBuffer.ts           the open file, adopt and dismiss
    useRun.ts              one run, abortable
  components/              GlassPanel StatusGlyph ObjectRow PeekBlock
                           EditorSurface BoosterRail TravelingField
                           ConsolePanel ToastStack AgentThreads
  app.vue                  composes the shell
```

Frames 1-3 of Sheet B are one screen in three states (default, focus mode,
go-live), not three screens.

## 4. Decisions worth keeping

**Ink is one colour at many alphas.** `--ink-rgb` flips per theme and all ten
steps follow, so light and dark are one definition rather than two palettes.

**Escalation is opacity, never hue.** Sheet B: "no red, no badges, no severity
colours." `MARKERS` resolves only to accent / accent-60 / ink-18 / ink-30, and
a spec fails if anyone adds a coloured one.

**The FIELD is one element.** Sheet C: "never duplicated, never crossfaded."
One node and one `<input>` serve as composer, spotlight query and focus-mode
pill, so typed text and the caret survive the morph. Vertical travel is a
transform; width genuinely morphs 720→640, and since the element is fixed and
out of flow that reflows only its own subtree.

**Transport health is not run status.** `LinkState` (live / reconnecting /
offline) and `RunStatus` are separate. A dropped socket never fails a run.

**Nothing outside `transport/` knows the network exists**, mirroring the
backend rule that only `infrastructure/` names a vendor.

**Run state is plainly reactive, not shallow.** It is bounded by agent count
and carries no token text. Streaming tokens are the one thing that must stay
out of reactive state, and they do.

## 5. Bugs found during implementation

Each was found by exercising the UI or by a spec, not by reading.

1. **Agent rows never updated mid-run.** Objects were mutated inside a
   `shallowRef` Map with `triggerRef`; the child received the same Map identity
   so its computed never invalidated. `shallowRef` had been applied where plain
   reactivity was correct. Fixed by extracting a pure `applyEvent` reducer over
   `reactive` state, which also made it testable.
2. **Abort did not stop a run.** `sleep` only rejected if the abort *arrived*
   while waiting; an already-aborted signal fires no event, so the timer
   resolved and the generator kept emitting. `cancel()` only looked correct
   because the consumer ignored the events.
3. **`defineShortcuts` fired nothing.** Nuxt UI's helper did not work in this
   setup; reverted to a single listener. Then found synthetic key events arrive
   with `code: ""`, so matching on `code` alone is fragile while `key` alone
   breaks under Alt on some layouts. Now matches either.
4. **Golden-angle hue placement was wrong** in the since-removed agent colour
   scale: applying the increment modulo a truncated arc destroys its spreading
   property, and two agents landed 14.5° apart at N=8.
5. **The composer was 53px, not 52.** The 1px hairline was adding to the box
   rather than sitting inside it.
6. **`bun run lint` in the API never ran.** `bun run --check src/` is not a
   valid invocation; it is now `tsc --noEmit`. Pre-existing.

## 6. Verified

Measured in the browser against the wireframes' stated numbers.

| | spec | measured |
|---|---|---|
| Rail | 360, right edge | `360×800 @920,0` |
| Rail, focus mode | 220 | `220×800 @1060,0` |
| Composer at rest | 720×52, 24 off bottom | `720×52 @280,724` |
| Focus-mode pill | 44×44 | `44×44 @618,724` |
| Spotlight | 640, 18% from top | `640 @320,144` |
| Console | ≤240, left edges align | `720×147 @280,565`, aligned |
| Hint layer | ⌥ held 400ms | 0 → 2 → 0 cells |
| Esc | topmost in z order | spotlight → toast → focus |
| Light | whitesmoke / #1A1A1A / #a7761c | exact |
| Dark | #08090A / #E8E6E3 / #E3A94E | exact |

Functional: typing filters the spotlight (9 rows → 2 on "test" → no match);
Enter starts a run; the chip becomes `stop` and cancelling returns status
`cancelled`; Adopt inserts the proposed line (21 → 22 lines) and clears the
peek; editing a line commits. A run staggers correctly, e.g. at t=1800ms two
agents are done while two are still responding.

11 specs pass. No horizontal scroll at any width tested.

## 7. Open

- **The ensemble's presentation is inference.** Rail rows come from Sheet A's
  ROW note and the brief's "agents working threads"; the Leader has no design.
- **Mobile.** The wireframes are 1280×800 only. At 375px the 360 rail leaves
  15px of editor. Nothing overflows, but it is a desktop layout on a phone.
  The stated intent is that chat becomes the editor there; that screen does not
  exist in the design.
- **fs: indent.** The caption says "indent 16"; the inline styles step guides
  by 16 and content by 32. The caption was followed.
- **Go-live hides Chat History and Custom Instructions**, implemented literally
  from Frame 3. May be intent, may be the frame running out of room.
- **No backend.** `localRunTransport` drives `RunTransport` from a timer. It is
  a stand-in; the real API replaces one file.
- **The run API must carry a monotonic `seq` per event and accept
  `?since=<seq>`**, or reconnect-and-reconcile cannot be built.
