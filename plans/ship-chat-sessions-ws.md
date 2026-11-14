# Plan — get feat/chat-sessions-ws committed and onto a PR

Status: code green and verified 2026-10-04. Nothing committed. **One** decision is
yours before a PR can be raised — the commit scoping; everything else is
mechanical.

## Where things stand

The branch holds the whole chat-sessions-over-WebSocket feature plus a review
pass over it (8 correctness bugs, 9 memory/space findings, 4 convention
violations — logged in `notes/completed.md`, 2026-10-04 entries).

```
45 tracked files modified   45 untracked files added   0 feature commits
branch feat/chat-sessions-ws has no upstream; origin is Sabareesh98421/STAR-Backend
```

Verified, so a later session does not repeat it:

| check | result |
|---|---|
| `apps/api` lint + test | tsc clean · 91 passed |
| `apps/web` lint + test | nuxt typecheck clean · 52 passed |
| `apps/e2e` test | 20 passed |
| `GET /runs/:id` live | 25,100 bytes vs 98,214 with `?rounds=1` — 3.9x off the read the editor makes |
| `?rounds=nonsense` | 400, not a guessed boolean |
| session titles in dev db | 12 rows, longest exactly 120 |
| web app, real browser | rail lists 12 conversations; opening one replays its live turn (23,801 chars, matching `file.text` byte for byte); opening a stored turn fetches a different transcript (15,256 chars); zero console errors |

Two migrations were applied to the dev database here and need
`bun run db:migrate` (or `prisma migrate deploy`) anywhere else:

- `20261004120000_cap_session_titles` — one-shot data fix, titles to 120
- `20261004130000_run_context` — adds `ensemble_runs.context JSONB DEFAULT '{}'`

## The one decision — how the commits are scoped

The convention is one commit per file, so this branch is ~90 commits. Most of
them are feature work written before the review pass, and a commit message per
file is a claim about intent that should come from you rather than be guessed.

Pick one:

- **(a) You commit the feature, I commit the review pass.** Cleanest history and
  the PR diff reads as two stories. Needs you to go first.
- **(b) I commit all ~90 in one go**, taking the message from each file's own
  purpose, and you rewrite any that are wrong before pushing. Fastest; some
  messages will be generic.
- **(c) Squash the feature to a few commits** and drop one-commit-per-file for
  this branch only, because it was developed as one unit rather than file by
  file.

Nothing about the code changes under any of these.

## Settled, not a decision — the repository IS the seam

I previously wrote this up as a decision with "leave it" as my recommendation.
That was wrong: the vault already settles it. `Component.md:72` — "The consumer
should depend on its contract, not its implementation" — and Introduction.md's
services section, "the database can be switched without rewriting the business
logic". The repositories exist so the database can be ejected and mounted; that
is not a preference to weigh.

The access boundary was already intact. Nothing outside `infrastructure/database`
touches the database:

```bash
grep -rn "getDb()\|\$queryRaw\|generated/prisma" apps/api/src --include=*.ts \
  | grep -v "\.spec\." | grep -v src/generated | grep -v infrastructure/database
# no output
```

What was missing was enforcement: `index.ts` published the concrete classes, so
every consumer was typed to `PrismaEnsembleRunRepository`. Both repositories are
now published as their interfaces, which is the whole change:

```ts
export const userRepository: IUserRepository = new PrismaUserRepository();
export const ensembleRunRepository: IEnsembleRunRepository = new PrismaEnsembleRunRepository();
```

Proven by ejecting it rather than by assertion — all three results are from
`tsc`, not from reading:

| test | result |
|---|---|
| swap Prisma for an in-memory implementation | **1 file changed** (`index.ts`), tsc clean, zero consumer changes |
| mount an implementation missing `sessionExists` | rejected **at the mount point**, `index.ts:28` — so a class that never declared `implements` is caught too |
| a module calling a Prisma-only method | `Property 'rawCount' does not exist on type 'IEnsembleRunRepository'` |

The third is the one that matters: before this, reaching one Prisma-only method
from a service would have welded the database on and compiled.

**The one bounded exception** is spec cleanup — 9 call sites across 5 spec files
use `getDb()` directly for `deleteMany`/`findUnique` in `afterAll`. A spec
asserting against the Prisma implementation is meant to see the real database,
and adding `deleteSession()` to the contract so tests can tidy up would put
test-only methods on the interface every consumer sees. It is the one place that
needs touching if Prisma is ever actually swapped.

## Then, mechanically

1. Resolve the two decisions above.
2. Commit. `.env` is gitignored and clean; `.env.example` moved to the repo root
   on this branch and is already staged.
3. The `apps/e2e/shared_browser` submodule has its own uncommitted work —
   `login-once.mjs`, `serve.mjs`, and a new `lib/browser-launch.mjs`. It is a
   separate repository, so that commits and pushes there first; only then does
   the parent's gitlink move. Checked: the logged-in Chrome profile
   (`google-profile/`) is gitignored inside the submodule, so it cannot be
   committed by accident — leave it that way.
4. `git push -u origin feat/chat-sessions-ws`
5. `gh pr create --base main` — body should carry the three test counts, the
   3.9x payload measurement, and the two migrations that need running.

## Do not "fix" these

- **One `setInterval` per socket connection** (`chat.socket.ts`). A shared
  heartbeat needs ~20 lines of registry-walking plus its own throw guard to save
  a few timer-heap entries in a process that holds a handful of sockets. Declined
  on purpose.
- **Three producerless events** (`agent.token`, `review.added`, `leader.note`).
  Listed in `PENDING` in `@star/run-protocol` with what each waits on. They feed
  findings UI that works off the simulated transport; the missing producer is
  real work, not dead flexibility.
- **`ponytail:` notes** in `useBuffer.ts` (editor mirror, ceiling ~1-2k lines —
  measured 326 on a real transcript) and `ensemble.live.ts` (the live slot holds
  ~2x the last transcript). Both bounded and deliberate.

## Loose end, if you want it

`chat.socket.ts` reads about 1:1 comment to code. **Zero of its 98 comment lines
were written in the review pass** — the DNS-rebinding reasoning, the measured
`PING_MS` gaps and the file header are all yours, and they carry measurements, so
I left them. Say the word and they get the same trim the rest got (540 → 425
comment lines across the seven files the pass touched).
