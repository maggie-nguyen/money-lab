-- CreateEnum
CREATE TYPE "SchoolKind" AS ENUM ('HIGH_SCHOOL', 'UNIVERSITY', 'VOCATIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "FoodSpotSource" AS ENUM ('manual', 'openstreetmap', 'hcmc_opendata', 'moet', 'wikidata');

-- AlterTable
ALTER TABLE "food_spot" ADD COLUMN "source" "FoodSpotSource" NOT NULL DEFAULT 'manual',
ADD COLUMN "osmType" TEXT,
ADD COLUMN "osmId" TEXT,
ADD COLUMN "sourceRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "school" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "kind" "SchoolKind" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT NOT NULL DEFAULT '',
    "district" TEXT NOT NULL DEFAULT '',
    "source" "FoodSpotSource" NOT NULL DEFAULT 'manual',
    "osmType" TEXT,
    "osmId" TEXT,
    "externalRef" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_translation" (
    "schoolId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "school_translation_pkey" PRIMARY KEY ("schoolId","locale")
);

-- CreateTable
CREATE TABLE "food_spot_school" (
    "spotId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "walkMinutes" INTEGER,
    "distanceMeters" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "food_spot_school_pkey" PRIMARY KEY ("spotId","schoolId")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_spot_osmType_osmId_key" ON "food_spot"("osmType", "osmId");

-- CreateIndex
CREATE INDEX "food_spot_source_idx" ON "food_spot"("source");

-- CreateIndex
CREATE UNIQUE INDEX "school_slug_key" ON "school"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "school_osmType_osmId_key" ON "school"("osmType", "osmId");

-- CreateIndex
CREATE INDEX "school_clusterId_order_idx" ON "school"("clusterId", "order");

-- CreateIndex
CREATE INDEX "school_lat_lng_idx" ON "school"("lat", "lng");

-- CreateIndex
CREATE INDEX "food_spot_school_schoolId_idx" ON "food_spot_school"("schoolId");

-- AddForeignKey
ALTER TABLE "school" ADD CONSTRAINT "school_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "food_cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_translation" ADD CONSTRAINT "school_translation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_spot_school" ADD CONSTRAINT "food_spot_school_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "food_spot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_spot_school" ADD CONSTRAINT "food_spot_school_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
