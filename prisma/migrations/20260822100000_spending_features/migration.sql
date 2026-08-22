-- AlterEnum
ALTER TYPE "LedgerReason" ADD VALUE 'CHALLENGE_COMPLETE';

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "spending_jar_plan" (
    "userId" TEXT NOT NULL,
    "totalBudgetVnd" BIGINT NOT NULL,
    "categories" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spending_jar_plan_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "food_cluster" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_cluster_translation" (
    "clusterId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "food_cluster_translation_pkey" PRIMARY KEY ("clusterId","locale")
);

-- CreateTable
CREATE TABLE "food_spot" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "avgPriceVnd" BIGINT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_spot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_review" (
    "id" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "priceVnd" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_challenge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "iconKey" TEXT NOT NULL DEFAULT 'challenge',
    "badgeCode" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_challenge_translation" (
    "challengeId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "savingsHint" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "savings_challenge_translation_pkey" PRIMARY KEY ("challengeId","locale")
);

-- CreateTable
CREATE TABLE "user_challenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "tickDates" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "user_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_cluster_slug_key" ON "food_cluster"("slug");

-- CreateIndex
CREATE INDEX "food_spot_clusterId_order_idx" ON "food_spot"("clusterId", "order");

-- CreateIndex
CREATE INDEX "food_review_spotId_createdAt_idx" ON "food_review"("spotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "savings_challenge_code_key" ON "savings_challenge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "savings_challenge_slug_key" ON "savings_challenge"("slug");

-- CreateIndex
CREATE INDEX "user_challenge_userId_status_idx" ON "user_challenge"("userId", "status");

-- AddForeignKey
ALTER TABLE "spending_jar_plan" ADD CONSTRAINT "spending_jar_plan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_cluster_translation" ADD CONSTRAINT "food_cluster_translation_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "food_cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_spot" ADD CONSTRAINT "food_spot_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "food_cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_review" ADD CONSTRAINT "food_review_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "food_spot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_review" ADD CONSTRAINT "food_review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_challenge_translation" ADD CONSTRAINT "savings_challenge_translation_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "savings_challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_challenge" ADD CONSTRAINT "user_challenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_challenge" ADD CONSTRAINT "user_challenge_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "savings_challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
