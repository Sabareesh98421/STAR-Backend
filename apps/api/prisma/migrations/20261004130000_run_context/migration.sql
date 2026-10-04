-- The conversation context a run was given, recorded once instead of per round.
--
-- Every round prepends the SAME block and `ensemble_rounds.sent` held the whole
-- prompt, so one turn stored nine copies of the previous turns' answers.
--
-- Default '{}' rather than backfilled: older rows keep their context inside
-- `sent`, where it still reads correctly. A run is browser time that cannot be
-- reproduced, so its stored bytes are not edited after the fact.
ALTER TABLE "ensemble_runs" ADD COLUMN "context" JSONB NOT NULL DEFAULT '{}';
