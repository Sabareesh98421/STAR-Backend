-- Caps conversation titles at the length the rail is built to render.
--
-- The backfill in 20261003160901_chat_sessions used each run's whole `question`,
-- which is accepted up to 8000 characters; every title written since goes
-- through `toTitle` and is one line of at most 120. Measured before writing
-- this: the longest backfilled title was 155.
--
-- 120 is spelled out because a migration is a snapshot and has to keep meaning
-- what it meant the day it ran. The live rule stays in `toTitle`.
--
-- Idempotent, and it does not touch `updated_at`: Prisma's @updatedAt is applied
-- by the query engine, not a trigger, so nothing jumps the rail's ordering.
WITH capped AS (
    SELECT
        "id",
        CASE
            WHEN length(one_line) <= 120 THEN one_line
            ELSE left(one_line, 119) || '…'
        END AS title
    FROM (
        SELECT "id", btrim(regexp_replace("title", '\s+', ' ', 'g')) AS one_line
        FROM "chat_sessions"
    ) AS normalised
)
UPDATE "chat_sessions" s
SET "title" = c.title
FROM capped c
WHERE c."id" = s."id";
