CREATE TABLE "free_trials" (
    "id" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "user_id" TEXT,
    "prompts_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "free_trials_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "chat_sessions"
    ADD COLUMN "owner_user_id" TEXT,
    ADD COLUMN "free_trial_id" TEXT;

CREATE UNIQUE INDEX "free_trials_locator_key" ON "free_trials"("locator");
CREATE UNIQUE INDEX "free_trials_user_id_key" ON "free_trials"("user_id");
CREATE INDEX "chat_sessions_owner_user_id_updated_at_idx"
    ON "chat_sessions"("owner_user_id", "updated_at");
CREATE INDEX "chat_sessions_free_trial_id_updated_at_idx"
    ON "chat_sessions"("free_trial_id", "updated_at");

ALTER TABLE "free_trials"
    ADD CONSTRAINT "free_trials_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_sessions"
    ADD CONSTRAINT "chat_sessions_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "chat_sessions_free_trial_id_fkey"
    FOREIGN KEY ("free_trial_id") REFERENCES "free_trials"("id") ON DELETE CASCADE ON UPDATE CASCADE;