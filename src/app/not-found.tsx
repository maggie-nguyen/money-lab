import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="ledger-label text-ink-faint">Lỗi 404</p>
      <h1 className="mt-2 text-3xl">Không tìm thấy trang</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Đường dẫn này không tồn tại hoặc nội dung đã được gỡ.
      </p>
      <Link
        href="/learn"
        className="mt-6 rounded-[var(--radius-control)] bg-moss-600 px-4 py-2 text-sm font-medium text-paper"
      >
        Về trang học
      </Link>
    </div>
  );
}
