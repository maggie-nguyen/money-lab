import Link from "next/link";
import { LedgerScene } from "@/components/auth/LedgerScene";

/**
 * Two column layout for the sign in and sign up screens: the form on the left,
 * a full bleed illustration panel on the right. The panel is decoration, so it
 * drops away below lg and the form simply centers itself.
 */
export function SplitAuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col px-6 py-8 lg:min-h-0 lg:px-10">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          Money&amp;Me
        </Link>

        {/* The illustration panel is desktop only, so small screens get a strip of it. */}
        <div
          aria-hidden
          className="relative mx-auto mt-6 h-40 w-full max-w-sm overflow-hidden rounded-[var(--radius-card)] lg:hidden"
        >
          <LedgerScene uid="ml-banner" viewBox="0 386 900 398" className="absolute inset-0 h-full w-full" />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm text-center text-xs text-ink-faint">
          {footer ?? (
            <p>
              Tiếp tục nghĩa là bạn đồng ý với{" "}
              <Link href="/" className="underline hover:text-ink-soft">
                điều khoản sử dụng
              </Link>{" "}
              và{" "}
              <Link href="/" className="underline hover:text-ink-soft">
                chính sách riêng tư
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div aria-hidden className="relative hidden overflow-hidden lg:block">
        <LedgerScene uid="ml-panel" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="max-w-md font-display text-2xl leading-snug text-[#f7f2e6]">
            Học cách quản lý tiền bằng chính những quyết định bạn sẽ gặp ngoài đời.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[#f7f2e6]/70">
            {["Ngân sách", "Vay và tín dụng", "Thuế và bảo hiểm", "Đầu tư", "Nhận diện lừa đảo"].map(
              (topic) => (
                <span
                  key={topic}
                  className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f7f2e6]/65"
                >
                  {topic}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
