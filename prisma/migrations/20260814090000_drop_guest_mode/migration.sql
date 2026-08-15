-- Guest mode is gone. Guest rows carry no email and no password hash, so once
-- the guest endpoints are removed nobody can ever sign into them again. Delete
-- them rather than leave unreachable accounts polluting leaderboards and the
-- analytics cohorts; FK cascades take their progress, ledgers and sessions.
DELETE FROM "user" WHERE "isGuest" = true;

-- DropIndex
DROP INDEX "user_isGuest_lastActiveAt_idx";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "isGuest";

-- CreateIndex
CREATE INDEX "user_lastActiveAt_idx" ON "user"("lastActiveAt");
