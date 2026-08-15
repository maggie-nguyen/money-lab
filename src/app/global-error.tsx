"use client";

/**
 * The last resort: an error thrown by the root layout itself, where error.tsx
 * cannot help because the layout that would wrap it is the thing that failed.
 * This one replaces the whole document, so it carries its own html and body and
 * cannot rely on globals.css having loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "1rem",
          textAlign: "center",
          background: "#faf8f3",
          color: "#16211c",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>
          Sự cố
        </p>
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600 }}>Ứng dụng không tải được</h1>
        <p style={{ margin: 0, maxWidth: "30rem", fontSize: "0.875rem", opacity: 0.75 }}>
          Bạn có thể thử lại. Nếu vẫn lỗi, gửi mã sự cố bên dưới cho đội hỗ trợ.
        </p>
        {error.digest && (
          <code style={{ fontSize: "0.75rem", opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
            {error.digest}
          </code>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "0.75rem",
            border: 0,
            borderRadius: "0.5rem",
            background: "#14432f",
            color: "#faf8f3",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Thử lại
        </button>
      </body>
    </html>
  );
}
