import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicChrome } from "@/components/PublicChrome";
import { LessonBlocks } from "@/components/lesson/Blocks";
import { Button, Card, CardBody, Chip, LedgerLabel } from "@/components/ui";
import { coverStyle } from "@/lib/cover";
import { CoverArt } from "@/components/art/CoverArt";
import type { Block } from "@/lib/types";
import { getArticle, publishedArticleSlugs } from "@/server/services/libraryService";
import { AppError } from "@/server/lib/errors";

export const revalidate = 300;

const CATEGORY_LABEL: Record<string, string> = {
  GUIDE: "Hướng dẫn",
  EXPLAINER: "Giải thích",
  NEWS: "Tin tức",
  STORY: "Câu chuyện",
};

/** Prerender what exists at build time; anything newer renders on first hit. */
export async function generateStaticParams() {
  try {
    const slugs = await publishedArticleSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    // A build without a reachable database still succeeds; pages render on demand.
    return [];
  }
}

async function load(slug: string) {
  try {
    return await getArticle(slug, "vi");
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await load(slug);
  if (!article) return { title: "Không tìm thấy bài viết" };
  return {
    title: article.seoTitle,
    description: article.seoDescription,
    alternates: { canonical: `/library/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.seoTitle,
      description: article.seoDescription,
      publishedTime: article.publishedAt ?? undefined,
      ...(article.coverImageUrl ? { images: [article.coverImageUrl] } : {}),
    },
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await load(slug);
  if (!article) notFound();

  return (
    <PublicChrome>
      <article className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/library" className="text-sm text-moss-400 underline hover:text-moss-600">
          ← Thư viện
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <Chip>{CATEGORY_LABEL[article.category] ?? article.category}</Chip>
          <span>{article.readMinutes} phút đọc</span>
          {article.publishedAt && <span>· {formatDate(article.publishedAt)}</span>}
          <span>· {article.authorName}</span>
        </div>

        <h1 className="mt-4 text-4xl">{article.title}</h1>
        {article.summary && <p className="mt-4 text-lg text-ink-soft">{article.summary}</p>}

        <div
          className="mt-8 h-64 w-full overflow-hidden rounded-[var(--radius-card)]"
          style={article.coverImageUrl ? undefined : coverStyle(article.slug)}
        >
          {article.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverArt slug={article.slug} className="h-full w-full" />
          )}
        </div>

        <div className="mt-10">
          <LessonBlocks blocks={article.blocks as Block[]} />
        </div>

        {article.relatedCourse && (
          <div className="mt-12">
            <Card tone="ink">
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <LedgerLabel className="text-paper/70">Học sâu hơn</LedgerLabel>
                  <p className="mt-1 font-display text-lg text-paper">{article.relatedCourse.title}</p>
                </div>
                <Link href={`/course/${article.relatedCourse.slug}`}>
                  <Button variant="secondary">Xem khóa học</Button>
                </Link>
              </CardBody>
            </Card>
          </div>
        )}

        {article.related.length > 0 && (
          <div className="mt-14 border-t border-rule pt-8">
            <LedgerLabel>Đọc tiếp</LedgerLabel>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {article.related.map((r) => (
                <Link key={r.id} href={`/library/${r.slug}`} className="group block">
                  <Card className="h-full">
                    <CardBody>
                      <span className="text-xs text-ink-faint">
                        {CATEGORY_LABEL[r.category] ?? r.category} · {r.readMinutes} phút
                      </span>
                      <h3 className="mt-1.5 text-base group-hover:underline">{r.title}</h3>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-14 rounded-[var(--radius-card)] border border-rule px-6 py-8 text-center">
          <h2 className="text-2xl">Muốn luyện tập thay vì chỉ đọc?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            Tài khoản miễn phí mở khóa bài học ngắn, mô phỏng và tiến trình được lưu lại.
          </p>
          <div className="mt-5">
            <Link href="/signup">
              <Button size="lg">Bắt đầu miễn phí</Button>
            </Link>
          </div>
        </div>
      </article>
    </PublicChrome>
  );
}
