-- Google Places link + photo gallery references (no image bytes stored) for food spots
ALTER TABLE "food_spot" ADD COLUMN IF NOT EXISTS "googlePlaceId" TEXT;
ALTER TABLE "food_spot" ADD COLUMN IF NOT EXISTS "gallery" JSONB NOT NULL DEFAULT '[]'::jsonb;
