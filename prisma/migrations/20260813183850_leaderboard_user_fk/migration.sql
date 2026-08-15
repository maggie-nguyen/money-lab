-- leaderboard_result had no FK, so purged/deleted users left orphan rows behind.
-- Drop those before the constraint goes on; they reference users that no longer exist.
DELETE FROM "leaderboard_result" lr
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = lr."userId");

-- AddForeignKey
ALTER TABLE "leaderboard_result" ADD CONSTRAINT "leaderboard_result_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
