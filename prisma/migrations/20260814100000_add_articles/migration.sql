-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('GUIDE', 'EXPLAINER', 'NEWS', 'STORY');

-- CreateTable
CREATE TABLE "article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "ArticleCategory" NOT NULL,
    "coverImageUrl" TEXT,
    "readMinutes" INTEGER NOT NULL DEFAULT 4,
    "publishedAt" TIMESTAMP(3),
    "authorName" TEXT NOT NULL DEFAULT 'MoneyLab',
    "relatedCourseId" TEXT,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_translation" (
    "articleId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "blocks" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "article_translation_pkey" PRIMARY KEY ("articleId","locale")
);

-- CreateIndex
CREATE UNIQUE INDEX "article_slug_key" ON "article"("slug");

-- CreateIndex
CREATE INDEX "article_status_publishedAt_idx" ON "article"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "article_category_publishedAt_idx" ON "article"("category", "publishedAt");

-- AddForeignKey
ALTER TABLE "article" ADD CONSTRAINT "article_relatedCourseId_fkey" FOREIGN KEY ("relatedCourseId") REFERENCES "course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_translation" ADD CONSTRAINT "article_translation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

