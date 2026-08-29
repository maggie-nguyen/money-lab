import { BrandLink } from "@/components/BrandLink";

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
      <BrandLink href="/" className="mb-8 flex items-center gap-1.5 text-ink" />
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-rule bg-paper-raised p-6">
        <h1 className="text-xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
