"use client";

/** Index of the finance calculators (doc 03 §8). */

import Link from "next/link";
import { Card, CardBody, LedgerLabel } from "@/components/ui";
import { ToolGlyph, type ToolKind } from "@/components/art/ToolGlyph";

const TOOLS: ReadonlyArray<{ slug: ToolKind; title: string; description: string }> = [
  {
    slug: "compound-interest",
    title: "Lãi kép",
    description: "Xem số tiền tiết kiệm lớn lên theo thời gian nhờ lãi kép và khoản góp hằng tháng.",
  },
  {
    slug: "loan-payment",
    title: "Tính khoản trả góp",
    description: "Tính khoản trả hằng tháng và bảng trả nợ chi tiết cho một khoản vay.",
  },
  {
    slug: "loan-compare",
    title: "So sánh khoản vay",
    description: "Đặt 2 đến 4 khoản vay cạnh nhau để xem khoản nào rẻ nhất theo tổng chi phí.",
  },
  {
    slug: "savings-goal",
    title: "Mục tiêu tiết kiệm",
    description: "Tính số tháng cần tiết kiệm để đạt một mục tiêu tiền cụ thể.",
  },
  {
    slug: "inflation",
    title: "Lạm phát",
    description: "Xem sức mua của một khoản tiền giảm ra sao qua từng năm vì lạm phát.",
  },
  {
    slug: "budget-503020",
    title: "Ngân sách 50/30/20",
    description: "Chia thu nhập hằng tháng theo quy tắc 50% nhu cầu, 30% mong muốn, 20% tiết kiệm.",
  },
];

export default function ToolsIndexPage() {
  return (
    <div className="space-y-5">
      <div>
        <LedgerLabel>Công cụ</LedgerLabel>
        <h1 className="mt-1 text-2xl">Máy tính tài chính</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Mọi phép tính đều do máy chủ thực hiện, kết quả chính xác đến từng đồng.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.slug} href={`/tools/${t.slug}`}>
            <Card className="h-full transition-colors hover:bg-paper-sunken">
              <CardBody className="flex h-full flex-col gap-2">
                <ToolGlyph kind={t.slug} className="h-11 w-11 text-moss-600" />
                <h2 className="mt-1 text-base font-semibold">{t.title}</h2>
                <p className="text-sm text-ink-soft">{t.description}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
