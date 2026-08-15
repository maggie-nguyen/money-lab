import Link from "next/link";
import type { Metadata } from "next";
import { PublicChrome } from "@/components/PublicChrome";
import { Card, CardBody, Chip, EmptyState, LedgerLabel } from "@/components/ui";
import { coverStyle } from "@/lib/cover";
import { CoverArt } from "@/components/art/CoverArt";
import { listArticles, type ArticleSummary } from "@/server/services/libraryService";

/**
 * The article library. Server rendered and readable signed out, because this is
 * the one surface where search traffic matters and where a visitor should be
 * able to judge the product before creating an account.
 */

export const metadata: Metadata = {
  title: "Thư viện bài viết",
  description:
    "Bài viết ngắn về chi tiêu, tiết kiệm, vay nợ, thuế, lừa đảo và đầu tư, viết cho học sinh trung học Việt Nam.",
};

// Articles change when an editor publishes one, not per request.
export const revalidate = 300;

const CATEGORY_LABEL: Record<string, string> = {
  GUIDE: "Hướng dẫn",
  EXPLAINER: "Giải thích",
  NEWS: "Tin tức",
  STORY: "Câu chuyện",
};

const CATEGORY_ORDER = ["GUIDE", "EXPLAINER", "NEWS", "STORY"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}

function ArticleCard({ a, featured = false }: { a: ArticleSummary; featured?: boolean }) {
  return (
    <Link href={`/library/${a.slug}`} className="group block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <div
          className={featured ? "h-56 w-full sm:h-72" : "h-36 w-full"}
          style={a.coverImageUrl ? undefined : coverStyle(a.slug)}
        >
          {a.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverArt slug={a.slug} className="h-full w-full" />
          )}
        </div>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <Chip>{CATEGORY_LABEL[a.category] ?? a.category}</Chip>
            <span>{a.readMinutes} phút đọc</span>
            {a.publishedAt && <span>· {formatDate(a.publishedAt)}</span>}
          </div>
          {/* h2, not h3: each card is a section of the index, and skipping a
              level leaves a screen reader announcing a gap that is not there. */}
          <h2 className={featured ? "mt-3 text-2xl group-hover:underline" : "mt-2 text-base group-hover:underline"}>
            {a.title}
          </h2>
          {a.summary && (
            <p className={featured ? "mt-2 text-sm text-ink-soft" : "mt-1.5 line-clamp-3 text-sm text-ink-soft"}>
              {a.summary}
            </p>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

export default async function LibraryPage() {
  const { data } = await listArticles({ limit: 24 }, "vi");
  const [lead, ...rest] = data;

  return (
    <PublicChrome>
      <section className="mx-auto max-w-5xl px-4 py-12">
        <LedgerLabel>Thư viện</LedgerLabel>
        <h1 className="mt-3 max-w-3xl text-4xl">Bài viết tài chính cho người mới bắt đầu</h1>
        <p className="mt-4 max-w-2xl text-base text-ink-soft">
          Đọc tự do, không cần tài khoản. Mỗi bài đi thẳng vào một câu hỏi cụ thể mà học sinh
          thường gặp, kèm ví dụ bằng tiền Việt.
        </p>

        {data.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Chưa có bài viết nào"
              description="Thư viện đang được biên tập. Hãy quay lại sau."
            />
          </div>
        ) : (
          <>
            {lead && (
              <div className="mt-10">
                <ArticleCard a={lead} featured />
              </div>
            )}

            {rest.length > 0 && (
              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((a) => (
                  <ArticleCard key={a.id} a={a} />
                ))}
              </div>
            )}

            <div className="mt-14 border-t border-rule pt-6">
              <LedgerLabel>Chủ đề</LedgerLabel>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {CATEGORY_ORDER.filter((c) => data.some((a) => a.category === c)).map((c) => (
                  <span key={c} className="rounded-full border border-rule px-3 py-1 text-ink-soft">
                    {CATEGORY_LABEL[c]} · {data.filter((a) => a.category === c).length}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </PublicChrome>
  );
}
