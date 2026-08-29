"use client";

/**
 * Admin sub-shell (doc 10 scope). Every route under /admin renders inside this
 * secondary nav. Access is gated on the client because role lives in the
 * bootstrap payload already loaded by the outer app layout.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/components/Providers";
import { Alert, cx } from "@/components/ui";

const NAV = [
  { href: "/admin/content", label: "Nội dung" },
  { href: "/admin/sims", label: "Mô phỏng" },
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/feedback", label: "Phản hồi" },
  { href: "/admin/flags", label: "Cờ tính năng" },
  { href: "/admin/audit", label: "Nhật ký" },
  { href: "/admin", label: "Thống kê" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();

  if (me?.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alert tone="critical" title="Không có quyền truy cập">
          Khu vực này chỉ dành cho quản trị viên. Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ
          quản trị viên khác để được cấp quyền.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Quản trị</h1>
        <p className="mt-1 text-sm text-ink-soft">Nội dung, người dùng và vận hành Money&amp;Me.</p>
      </div>
      <nav aria-label="Điều hướng quản trị" className="flex flex-wrap gap-1 border-b border-rule pb-2">
        {NAV.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "rounded-[var(--radius-control)] px-3 py-1.5 text-sm",
                active ? "bg-moss-50 font-medium text-moss-600" : "text-ink-soft hover:bg-paper-sunken hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
