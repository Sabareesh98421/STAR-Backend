# Local Postgres setup — known issues

Context: this project moved from SQLite to Postgres via Prisma (see `prisma/schema.prisma`,
`prisma.config.ts`, `src/infrastructure/database/`). Getting a local Postgres instance
working on Fedora surfaced three separate issues, in order. Recorded here so either of us
can pick this back up without re-diagnosing from scratch.

## Status: unresolved — table not yet created

Last known state: Postgres connection + auth both work, but `prisma migrate dev` has not
successfully completed, so the `users` table does not exist in `star_dev` yet. The app
connects fine and fails on the first real query.

**Next step to try:**
```bash
sudo -u postgres createdb star_shadow   # safe to re-run, no-op if it already exists
bunx prisma migrate dev --name init
```
Then verify with:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:10108/api/auth/email/signup \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Test","email":"test@example.com","password":"Passw0rd!","confirmPassword":"Passw0rd!"}'
```
Expect `201` first call, `409` on an identical second call. If `bunx prisma migrate dev`
still doesn't complete, check its output directly — the two issues below are already fixed,
so a fresh failure at this point is a new one, not a repeat of #1/#2.

---

## Issue #1 (fixed) — shadow database denied access to `postgres`

**Symptom:**
```
Error: P1010: User was denied access on the database `postgres`
```
during `bunx prisma migrate dev`.

**Cause:** `prisma migrate dev` needs a scratch "shadow" database to diff migrations
against. With no explicit `shadowDatabaseUrl`, Prisma creates one by first connecting
through the default `postgres` maintenance database using the same role as `DATABASE_URL`.
Something in the local Postgres role/`pg_hba.conf` setup blocked that specific hop (the
real `star_dev` connection was fine).

**Fix:** added an explicit shadow database instead of relying on the auto-created one,
bypassing the `postgres`-db hop entirely.
- `prisma.config.ts` → `datasource.shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL`
- `.env` / `.env.example` → `SHADOW_DATABASE_URL=postgres://postgres:postgres@localhost:5432/star_shadow`
- One-time setup: `sudo -u postgres createdb star_shadow`

(Note: `shadowDatabaseUrl` must live in `prisma.config.ts` in Prisma 7, not in the
`datasource` block of `schema.prisma` — that block only allows `provider` now, putting a
URL/shadow URL there throws `P1012`.)

## Issue #2 (fixed) — `ident` auth rejecting the password connection

**Symptom:**
```
code: "P1010"
originalCode: "28000"
originalMessage: "Ident authentication failed for user \"postgres\""
kind: "DatabaseAccessDenied"
```

**Cause:** Fedora's default `postgresql-setup --initdb` writes `pg_hba.conf` with `ident`
as the auth method for TCP (`host`) connections. `ident` matches the connecting OS username
to the Postgres role via the ident protocol — it never looks at the password in
`DATABASE_URL` at all. Since the shell user isn't literally `postgres`, the match failed,
regardless of whether the password was correct.

**Fix:**
```bash
sudo -u postgres psql -c "SHOW hba_file;"          # confirms /var/lib/pgsql/data/pg_hba.conf
sudo sed -i 's/ident/scram-sha-256/g' /var/lib/pgsql/data/pg_hba.conf
sudo systemctl restart postgresql
```

## Issue #3 (fixed, mentioned for completeness) — `.env.example` leaked working credentials

Not a Postgres issue, but adjacent: `DATABASE_URL`/`SHADOW_DATABASE_URL` were initially
written into `.env.example` (a git-tracked template file) with real, working
`postgres:postgres` credentials instead of placeholders. Fixed by replacing with
`postgres://<user>:<password>@localhost:5432/...` in `.env.example`; the real values stay
only in `.env`, which is gitignored.

## Relevant files
- `prisma.config.ts` — `DATABASE_URL` / `SHADOW_DATABASE_URL` wiring
- `prisma/schema.prisma` — schema (provider is fixed to `postgresql`, not env-driven — see
  the explanation in-session if this needs to change)
- `.env` — actual local connection strings (gitignored, not this file's concern to fix)
- `.env.example` — template, placeholders only
