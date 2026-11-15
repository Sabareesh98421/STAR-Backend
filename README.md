# STAR (`ensemblem`)

Peer-reviewed multi-model AI ensemble workspace built on **Bun**, **Elysia**, **Nuxt 4**, **PostgreSQL (Prisma 7)**, **Redis / Valkey**, and **Playwright CDP**. One prompt is dispatched simultaneously to **ChatGPT**, **Claude**, and **Gemini** in real browser tabs, put through iterative peer `review` and `revise` rounds, and streamed back to the editor over a gapless, resumable WebSocket.

---

## Monorepo Structure

| Workspace | Path | What It Owns |
|---|---|---|
| `@star/api` | `apps/api` | Bun + Elysia HTTP & WebSocket server (`/api`), auth, Redis sessions, Prisma persistence, static web serving |
| `@star/web` | `apps/web` | Nuxt 4 + `@nuxt/ui` workspace UI, auth pages (`/signin`, `/signup`, `/verify`), live run reducer & reconnect transport |
| `@star/browser-ensemble` | `packages/browser-ensemble` | Playwright CDP transport (`broadcast.ts`), multi-round peer-review engine (`ensemble.ts`), and Node child worker (`worker.ts`) |
| `@star/run-protocol` | `packages/run-protocol` | Shared TypeScript wire contracts (`RunEvent`, `RunStatus`, `AgentPhase`, `ChatClientMessage`, `ChatServerMessage`, `RunSummary`) |
| `@star/e2e` | `apps/e2e` | Persistent Chromium profile server on `:9222` (`shared_browser/serve.mjs`), one-time provider login (`login-once.mjs`), and Playwright specs |

---

## What Is Implemented

### 1. Browser Ensemble & Multi-Round Peer Review (`@star/browser-ensemble`)
- **Three Live Browser Targets (`broadcast.ts`)** — Drives authenticated browser tabs for `chatgpt` (`https://chatgpt.com/`), `claude` (`https://claude.ai/new`), and `gemini` (`https://gemini.google.com/app`) over Chrome DevTools Protocol (`http://localhost:9222`).
- **Stateless Round Isolation (`newChat`)** — Reuses open provider tabs, verifies clean new-chat state before sending, fails fast if a response element never mounts, detects provider-level refusal banners, and retries transient failures.
- **Draft → Peer Review → Revise Loop (`ensemble.ts`)** — Round `0` collects each model's initial `draft`; iterations `1..n` run cross-model `review` and `revise` passes. On follow-up turns in a conversation, each model receives only its own prior-turn answers (`context`) prepended to the round prompt so peer reviews remain uncontaminated.
- **Node Child Worker Bridge (`worker.ts`)** — Because Playwright's `connectOverCDP` hangs on WebSocket upgrade under Bun, `@star/api` spawns `worker.ts` under Node, passing `WorkerIn` JSON over `stdin` (keeping prompts out of process `argv`) and reading `WorkerOut` NDJSON (`round-start`, `settled`, `done`, `failed`) from `stdout`.

### 2. Authentication, Redis Sessions & Access Policies (`@star/api`)
- **Pending Signup & Atomic Email Change** — `POST /api/auth/email/signup` stages credentials in Redis with an `NX` guard (`SIGNUP_PENDING_TTL_SECONDS=900`) and emails a 6-digit OTP. `POST /api/auth/email/update-pending-signup-email` atomically moves the pending record to a new address via Lua `RENAMENX`, revokes the old OTP, and sends a new code.
- **OTP Delivery & Verification** — Redis-backed OTP store with configurable length (`OTP_LENGTH=6`), TTL (`OTP_TTL_SECONDS=300`), attempt ceiling (`OTP_MAX_ATTEMPTS=5`), resend cooldown (`OTP_RESEND_COOLDOWN_SECONDS=60`), and token-checked rollback if SMTP delivery fails after retries.
- **Rolling Redis Sessions (`session.store.ts`)** — Sign-in creates a Redis session (`session:<uuid>`, 7-day rolling TTL) and sets an `httpOnly`, `sameSite=lax` cookie (`sid`). `sessionMiddleware` refreshes TTL on every authenticated request and attaches `{ id, email, plan }`.
- **Insider Plans (`insider.config.ts`) & Free-Trial Policy (`free-trial.policy.ts`)** — Resolves user plans from `apps/api/src/config/insiders.json` (`enterprise` → unlimited prompts; default → `3`) and enforces a **2-hour cumulative free-trial run limit** (`FREE_TRIAL_RUN_LIMIT_MS`) followed by a **5-hour cooldown** (`FREE_TRIAL_COOLDOWN_MS`).

### 3. Persistence & Ownership Scoping (`apps/api/prisma/schema.prisma`)
- **Six PostgreSQL Models** — `User` (`users`), `FreeTrial` (`free_trials`), `ChatSession` (`chat_sessions`), `EnsembleRun` (`ensemble_runs`), `EnsembleRound` (`ensemble_rounds`), and `EnsembleResponse` (`ensemble_responses`).
- **Repository-Level `SessionAccess` Filtering** — Every session and run query in `ensemble.run.repository.prisma.ts` requires a `SessionAccess` scope (`ownerUserId` or `freeTrialId`), preventing cross-account reads or WebSocket subscriptions.
- **Immutable Markdown Transcripts** — Each completed or partial `EnsembleRun` persists both the rendered markdown transcript (`fileName`, `fileText`) and the exact per-round `sent` prompts and model `responses` (with `threadUrl` and latency `ms`).

### 4. Real-Time Chat Socket (`/api/ws/chat/:id`)
- **Per-Conversation WebSocket (`chat.socket.ts`)** — Enforces `Origin` allowlist + loopback host checks against DNS rebinding, requires an authenticated session cookie, and verifies `ChatSession` ownership before upgrading.
- **Gapless Sequence Replay (`ensemble.live.ts`)** — Numbers every server frame monotonically (`seq: 1..N`; connection errors use `seq: 0`). Clients reconnecting with `?since=<seq>` replay only missed frames while a 30-second server ping keeps long-thinking rounds alive under Bun's 255s idle ceiling.

### 5. Web Workspace (`@star/web`)
- **Auth & Route Guard** — `app/middleware/auth.ts` checks `/api/auth/email/me` and redirects unauthenticated navigation to `/signin`. Includes `/signin`, two-step `/signup` with live password rule validation, and `/verify` with inline email correction and OTP resend timer.
- **Workspace UI (`app/pages/index.vue`)** — Built with `TravelingField` (persistent morphing `<input>` across composer, spotlight search, and focus pill), `EditorSurface`, `BoosterRail`, `AgentThreads`, `ChatHistory`, `ConsolePanel`, `PeekBlock`, `GlassPanel`, `ObjectRow`, `StatusGlyph`, and `ToastStack`.

---

## Installation & Setup

### Prerequisites
- **[Bun](https://bun.sh/)** `>= 1.3`
- **Node.js** `>= 20` (used by `@star/browser-ensemble` child worker and `apps/e2e` CDP scripts)
- **PostgreSQL** `>= 15`
- **Valkey** or **Redis** (running as a local service; `@star/api` checks `valkey` via `system-checks/check-service.sh` before starting)

### 1. Clone & Install
```bash
git clone git@github.com:Sabareesh98421/STAR-Backend.git
cd STAR-Backend
bun install
```
*(Running `bun install` configures `.git` hooks to `pre-checks/` and generates the Prisma client in `apps/api/src/generated/prisma`.)*

### 2. Configure `.env`
Copy `.env.example` to `.env` at the monorepo root and fill in your PostgreSQL, Redis, and SMTP settings:
```bash
cp .env.example .env
```
Required local settings in `.env`:
```ini
NODE_ENV=development
API_PORT=3000
WEB_PORT=3001

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

DATABASE_URL=postgres://<user>:<password>@localhost:5432/star_dev
SHADOW_DATABASE_URL=postgres://<user>:<password>@localhost:5432/star_shadow
```
*(When `MAIL_USE_TEST_TRANSPORT` is left unset in development, Nodemailer uses `jsonTransport` so OTP flows work locally without sending real emails.)*

### 3. Apply Database Migrations
```bash
cd apps/api && bun run db:migrate && cd ../..
```

### 4. Authenticate Browser Providers (One-Time, for Live Ensemble Runs)
Launch the persistent Chromium profile and log into ChatGPT, Claude, and Gemini once:
```bash
cd apps/e2e && bun run login && cd ../..
```
Then keep the shared CDP browser running on `http://localhost:9222`:
```bash
bun run browser
```

### 5. Start Development Servers
```bash
bun run dev
```
- **Web App**: `http://localhost:3001` (dev proxy forwards `/api` and `/api/ws` to `http://localhost:3000`)
- **API Server**: `http://localhost:3000`

---

## Commands Reference

| Command | What It Runs |
|---|---|
| `bun run dev` | Starts `@star/api` (`:3000`) and `@star/web` (`:3001`) in watch mode |
| `bun run browser` | Starts the persistent Chromium CDP instance on `:9222` (`apps/e2e/shared_browser/serve.mjs`) |
| `bun run build` | Builds the static Nuxt frontend into `apps/web/.output/public` |
| `bun run start` | Runs `@star/api` in production mode (serves both `/api` and static web build) |
| `bun run test` | Runs colocated Playwright specs (`**/*.spec.ts`) across all workspaces |
| `bun run lint` | Runs `nuxt typecheck` and `tsc --noEmit` across `@star/web`, `@star/api`, `@star/run-protocol`, and `@star/browser-ensemble` |

---

## API & WebSocket Routes (`/api`)

| Method | Path | Guard | Handler / Purpose |
|---|---|---|---|
| `GET` | `/api/` | Public | Server liveness check (`masterRouter`) |
| `POST` | `/api/auth/email/signup` | Public | Stage pending signup in Redis (`NX`) & send `VERIFY_EMAIL` OTP |
| `POST` | `/api/auth/email/update-pending-signup-email` | Public | Atomically move pending signup to a new email & issue a new OTP |
| `POST` | `/api/auth/email/signin` | Public | Verify password, create Redis session, and set `httpOnly` `sid` cookie |
| `POST` | `/api/auth/otp/request` | Public | Request or resend an OTP (`VERIFY_EMAIL` or `RESET_PASSWORD`) |
| `POST` | `/api/auth/otp/verify` | Public | Verify OTP (creates `User` in Postgres when `purpose === "VERIFY_EMAIL"`) |
| `GET` | `/api/auth/email/me` | `sessionMiddleware` | Return `{ id, email, plan }` for the active session |
| `POST` | `/api/auth/email/signout` | `sessionMiddleware` | Delete Redis session and clear `sid` cookie |
| `POST` | `/api/ensemble/sessions` | `sessionMiddleware` | Create a new `ChatSession` (`{ title }`) owned by the caller |
| `GET` | `/api/ensemble/sessions` | `sessionMiddleware` | List caller's `ChatSessionSummary[]` ordered by `updatedAt` |
| `GET` | `/api/ensemble/sessions/:id` | `sessionMiddleware` | Fetch a caller's `ChatSessionSummary` and its ordered `turns` (`RunSummary[]`) |
| `GET` | `/api/ensemble/runs` | `sessionMiddleware` | List caller's `EnsembleRun` summaries |
| `GET` | `/api/ensemble/runs/:id` | `sessionMiddleware` | Fetch a run's markdown transcript (`?rounds=1` includes raw rounds & responses) |
| `WS` | `/api/ws/chat/:id` | `sessionMiddleware` | Start turns (`turn.start`) and stream sequenced `RunEvent` frames (`?since=<seq>`) |

---

## Production Deployment (`deployment/compose.yaml`)

Production runs as a two-service Docker Compose stack:
- **`api` (`star-api`)** — Runs the immutable app image on port `3000`, serving `/api` and static web assets from `/app/apps/web/.output/public`, connected to managed PostgreSQL, Redis, SMTP, and a private `ENSEMBLE_CDP_URL`.
- **`edge` (`caddy:2.10.2-alpine`)** — Terminates TLS (HTTP/1.1, HTTP/2, HTTP/3) for `PUBLIC_HOST` and reverse-proxies to `api:3000`.
