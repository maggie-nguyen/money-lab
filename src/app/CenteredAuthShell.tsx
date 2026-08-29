import Link from "next/link";

/** Shared centered layout for public auth screens (login, signup, welcome, verify). */
export function CenteredAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-10">
      <Link href="/" className="mb-8 font-display text-xl font-semibold tracking-tight text-ink">
        Money&amp;Me
      </Link>
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-rule bg-paper-raised p-6">
        <h1 className="text-xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
