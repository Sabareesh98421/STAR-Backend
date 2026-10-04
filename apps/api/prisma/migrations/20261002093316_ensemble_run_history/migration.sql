-- CreateTable
CREATE TABLE "ensemble_runs" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "model_count" INTEGER NOT NULL,
    "answered_count" INTEGER NOT NULL,
    "changed_models" TEXT[],
    "file_name" TEXT NOT NULL,
    "file_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ensemble_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ensemble_rounds" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "sent" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ensemble_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ensemble_responses" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "text" TEXT NOT NULL,
    "ms" INTEGER NOT NULL,
    "thread_url" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ensemble_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ensemble_runs_started_at_idx" ON "ensemble_runs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "ensemble_rounds_run_id_seq_key" ON "ensemble_rounds"("run_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ensemble_responses_round_id_model_key" ON "ensemble_responses"("round_id", "model");

-- AddForeignKey
ALTER TABLE "ensemble_rounds" ADD CONSTRAINT "ensemble_rounds_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ensemble_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ensemble_responses" ADD CONSTRAINT "ensemble_responses_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "ensemble_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
