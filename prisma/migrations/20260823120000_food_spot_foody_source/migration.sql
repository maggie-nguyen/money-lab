-- Add foody as a food spot source (Foody.vn public listing crawl)
ALTER TYPE "FoodSpotSource" ADD VALUE IF NOT EXISTS 'foody';
