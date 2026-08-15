"use client";

import * as React from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // The server already logged the cause; this keeps the browser trace visible
    // for support when a learner reports the request id.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="ledger-label text-ink-faint">Sự cố</p>
      <h1 className="mt-2 text-3xl">Trang này không tải được</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Bạn có thể thử lại. Nếu vẫn lỗi, gửi mã sự cố bên dưới cho đội hỗ trợ.
      </p>
      {error.digest && <code className="figure mt-3 text-xs text-ink-faint">{error.digest}</code>}
      <button
        onClick={reset}
        className="mt-6 rounded-[var(--radius-control)] bg-moss-600 px-4 py-2 text-sm font-medium text-paper"
      >
        Thử lại
      </button>
    </div>
  );
}
