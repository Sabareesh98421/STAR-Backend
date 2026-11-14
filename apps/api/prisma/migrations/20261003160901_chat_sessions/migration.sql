-- Chat sessions: a conversation that holds many turns, where a turn is one run.
--
-- Hand-edited rather than taken as generated. Prisma's version adds a required
-- `session_id` to a table that already holds runs, which it refuses to execute
-- and whose only offered alternative is dropping them — and a run is minutes of
-- real browser time that cannot be reproduced identically, so the existing rows
-- are the experiments themselves. They are backfilled instead: each one was a
-- standalone, single-turn conversation, which is exactly what it becomes.

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_sessions_updated_at_idx" ON "chat_sessions"("updated_at");

-- AlterTable: nullable first, so the backfill below has somewhere to write.
ALTER TABLE "ensemble_runs" ADD COLUMN "session_id" TEXT;

-- Backfill: one session per existing run, titled with that run's question and
-- dated from it, so the rail lists history that already happened in the order
-- it happened rather than all at once at migration time.
INSERT INTO "chat_sessions" ("id", "title", "created_at", "updated_at")
SELECT "id", "question", "started_at", COALESCE("finished_at", "started_at")
FROM "ensemble_runs";

UPDATE "ensemble_runs" SET "session_id" = "id";

ALTER TABLE "ensemble_runs" ALTER COLUMN "session_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ensemble_runs_session_id_started_at_idx" ON "ensemble_runs"("session_id", "started_at");

-- AddForeignKey
ALTER TABLE "ensemble_runs" ADD CONSTRAINT "ensemble_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
