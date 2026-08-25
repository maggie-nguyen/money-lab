"use client";

import Link from "next/link";
import { Card, CardBody, LedgerLabel, SectionTitle } from "@/components/ui";

/**
 * Admin landing — the LMS/sim analytics dashboard was removed with those
 * features. This now just links to the remaining admin sections.
 */

const SECTIONS = [
  { href: "/admin/content/badges", label: "Huy hiệu" },
  { href: "/admin/content/articles", label: "Bài viết (Thư viện)" },
  { href: "/admin/content/surveys", label: "Khảo sát" },
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/feedback", label: "Phản hồi" },
  { href: "/admin/flags", label: "Cờ tính năng" },
  { href: "/admin/audit", label: "Nhật ký kiểm toán" },
] as const;

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <header className="max-w-2xl space-y-2">
        <LedgerLabel>Quản trị</LedgerLabel>
        <h1 className="text-2xl sm:text-3xl">Bảng điều khiển quản trị</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="block">
            <Card className="h-full transition-colors hover:bg-paper-sunken">
              <CardBody>
                <SectionTitle>{s.label}</SectionTitle>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
