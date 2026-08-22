-- AlterTable
ALTER TABLE "food_spot" ADD COLUMN "lat" DOUBLE PRECISION,
ADD COLUMN "lng" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "food_spot_lat_lng_idx" ON "food_spot"("lat", "lng");
