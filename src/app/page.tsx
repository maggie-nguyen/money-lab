import Link from "next/link";
import type { Metadata } from "next";
import { Button, Card, CardBody, LedgerLabel } from "@/components/ui";
import { LedgerScene } from "@/components/auth/LedgerScene";
import { TopicGlyph, type TopicKind } from "@/components/art/TopicGlyph";

export const metadata: Metadata = {
  title: "Học tài chính cá nhân theo cách dễ hiểu",
};

const TOPICS: Array<{ kind: TopicKind; title: string; desc: string }> = [
  { kind: "budget", title: "Chi tiêu và ngân sách", desc: "Lập kế hoạch chi tiêu và theo dõi dòng tiền hằng tháng." },
  { kind: "credit", title: "Ngân hàng và tín dụng", desc: "Tài khoản, thẻ, lãi suất và cách vay nợ có trách nhiệm." },
  { kind: "tax", title: "Thuế và bảo hiểm", desc: "Những khoản khấu trừ cần hiểu trước khi ký hợp đồng lao động đầu tiên." },
  { kind: "scam", title: "Nhận diện lừa đảo", desc: "Các chiêu trò phổ biến và cách tự bảo vệ tiền của mình." },
  { kind: "invest", title: "Đầu tư cơ bản", desc: "Rủi ro, lợi suất và những nguyên tắc đầu tư đầu tiên." },
  { kind: "business", title: "Kinh doanh nhỏ", desc: "Vốn, chi phí và lợi nhuận qua một mô hình kinh doanh đơn giản." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-display text-xl font-semibold tracking-tight">MoneyLab</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-ink-soft hover:text-ink">
              Đăng nhập
            </Link>
            <Link href="/signup">
              <Button size="sm">Bắt đầu miễn phí</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero mirrors the auth split: words left, the drawn map right, and a
            banner crop of the same artwork below the fold on narrow screens. */}
        <section className="border-b border-rule">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <LedgerLabel>Nền tảng tài chính cá nhân cho học sinh trung học</LedgerLabel>
              <h1 className="mt-3 text-4xl sm:text-5xl">
                Học cách quản lý tiền từ khi còn ngồi trên ghế nhà trường
              </h1>
              <p className="mt-5 max-w-xl text-base text-ink-soft">
                MoneyLab dạy tài chính cá nhân cho học sinh trung học Việt Nam bằng những bài học
                ngắn và các tình huống mô phỏng, để bạn tập ra quyết định trước khi phải quyết định
                bằng tiền thật.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/signup">
                  <Button size="lg">Bắt đầu miễn phí</Button>
                </Link>
                <Link href="/library">
                  <Button size="lg" variant="secondary">
                    Đọc bài viết
                  </Button>
                </Link>
              </div>
              <p className="mt-3 text-sm text-ink-faint">
                Đã có tài khoản?{" "}
                <Link href="/login" className="text-moss-400 underline hover:text-moss-600">
                  Đăng nhập
                </Link>
              </p>
            </div>

            <div className="relative hidden overflow-hidden rounded-[var(--radius-card)] lg:block lg:h-[34rem]">
              <LedgerScene uid="ml-hero" className="absolute inset-0 h-full w-full" />
              {/* The caption rides the empty sky at the top. Lower down the map
                  names its own milestones, and two sets of words there collide. */}
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0b2a1e]/85 to-transparent" />
              <div className="absolute inset-x-0 top-0 p-6">
                <p className="ledger-label text-[#f0ead9]/70">Hành trình</p>
                <p className="mt-1 max-w-[14rem] font-display text-lg text-[#f0ead9]">
                  Từ khoản chi hằng ngày tới những quyết định lớn hơn
                </p>
              </div>
            </div>
          </div>

          <div className="relative h-44 w-full overflow-hidden sm:h-56 lg:hidden">
            <LedgerScene
              uid="ml-hero-banner"
              viewBox="0 386 900 398"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </section>

        <section className="border-y border-rule bg-paper-sunken">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl">Các chủ đề bạn sẽ học</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Mỗi chủ đề gồm các bài học ngắn, câu hỏi kiểm tra nhanh và tình huống thực tế.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TOPICS.map((t) => (
                <Card key={t.title}>
                  <CardBody>
                    <TopicGlyph kind={t.kind} className="h-10 w-10 text-moss-600" />
                    <h3 className="mt-3 text-base">{t.title}</h3>
                    <p className="mt-1.5 text-sm text-ink-soft">{t.desc}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
            <div>
              <LedgerLabel>Mô phỏng</LedgerLabel>
              <h2 className="mt-2 text-2xl">Luyện ra quyết định qua các tình huống mô phỏng</h2>
              <p className="mt-3 text-sm text-ink-soft">
                Lập ngân sách cho một tháng, so sánh các khoản vay, nhận diện chiêu lừa đảo hoặc
                điều hành một quán nhỏ. Sau mỗi quyết định, mô phỏng cho thấy ngay kết quả, nhờ vậy
                bài học đọng lại lâu hơn so với chỉ đọc lý thuyết.
              </p>
              <p className="mt-3 text-xs text-ink-faint">
                Toàn bộ số liệu trong mô phỏng là dữ liệu giả lập, chỉ dùng để luyện tập.
              </p>
            </div>
            <Card tone="ink">
              <CardBody>
                <LedgerLabel className="text-paper/70">Mô phỏng ngân sách, tháng 3</LedgerLabel>
                <div className="figure mt-2 text-3xl font-semibold">8.500.000 ₫</div>
                <p className="mt-1 text-sm text-paper/80">Thu nhập giả lập trong tháng</p>
                <div className="mt-5 space-y-2 text-sm text-paper/90">
                  <div className="flex justify-between border-b border-paper/20 pb-2">
                    <span>Nhu cầu thiết yếu</span>
                    <span className="figure">4.250.000 ₫</span>
                  </div>
                  <div className="flex justify-between border-b border-paper/20 pb-2">
                    <span>Chi tiêu cá nhân</span>
                    <span className="figure">2.550.000 ₫</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tiết kiệm</span>
                    <span className="figure">1.700.000 ₫</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        </section>

        {/* The closing ask sits on the artwork rather than beside it, so the page
            ends on the same drawing it opened with. */}
        <section className="relative border-t border-rule">
          {/* Cropped below the lowest place name on the map, so the band is
              texture behind the words rather than a second thing to read. */}
          <LedgerScene uid="ml-cta" viewBox="0 1010 900 190" className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-[#0b2a1e]/75" />
          <div className="relative mx-auto max-w-5xl px-4 py-20 text-center">
            <h2 className="text-2xl text-[#f0ead9]">Bắt đầu học ngay hôm nay</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#f0ead9]/85">
              Tạo tài khoản miễn phí để lưu tiến độ học, hoặc đọc thư viện bài viết trước khi đăng ký.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="!bg-[#f0ead9] !text-[#16211c] hover:!bg-white">
                  Bắt đầu miễn phí
                </Button>
              </Link>
              <Link href="/library">
                <Button
                  size="lg"
                  variant="secondary"
                  className="!border-[#f0ead9]/60 !text-[#f0ead9] hover:!bg-[#f0ead9]/10"
                >
                  Đọc bài viết
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-ink-faint">
          © {new Date().getFullYear()} MoneyLab. Số liệu trong mô phỏng là dữ liệu giả lập.
        </div>
      </footer>
    </div>
  );
}
