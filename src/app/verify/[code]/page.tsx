"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Card, CardBody, Chip, LedgerLabel, Skeleton, ErrorPanel } from "@/components/ui";

/** Public certificate verification, doc 03 §13.3. No shell, no auth. */

interface VerifyResult {
  valid: boolean;
  holderDisplayName: string;
  courseTitle: string;
  issuedAt: string;
  status: string;
  revokedAt?: string;
}

export default function VerifyPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  const query = useQuery({
    queryKey: ["certificate-verify", code],
    queryFn: () => api.get<VerifyResult>(`/certificates/verify/${encodeURIComponent(code)}`),
    retry: false,
  });

  const notFound = query.isError && query.error instanceof ApiError && query.error.status === 404;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-10">
      <Link href="/" className="mb-8 font-display text-xl font-semibold tracking-tight text-ink">
        Money&amp;Me
      </Link>
      <div className="w-full max-w-md">
        {query.isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : notFound ? (
          <Card>
            <CardBody className="text-center">
              <p className="font-display text-lg">Không tìm thấy chứng chỉ</p>
              <p className="mt-2 text-sm text-ink-soft">
                Mã chứng chỉ &quot;{code}&quot; không tồn tại trong hệ thống. Hãy kiểm tra lại đường
                dẫn hoặc liên hệ người đã chia sẻ chứng chỉ này với bạn.
              </p>
            </CardBody>
          </Card>
        ) : query.isError ? (
          <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
        ) : query.data ? (
          <Card>
            <CardBody>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <LedgerLabel>Chứng chỉ</LedgerLabel>
                  <h1 className="mt-1 text-xl">{query.data.courseTitle}</h1>
                </div>
                <Chip tone={query.data.valid ? "positive" : "critical"}>
                  {query.data.valid ? "Hợp lệ" : "Không còn hiệu lực"}
                </Chip>
              </div>
              <div className="mt-5 space-y-3 border-t border-rule pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-soft">Cấp cho</span>
                  <span className="font-medium text-ink">{query.data.holderDisplayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">Ngày cấp</span>
                  <span className="figure text-ink">{formatDate(query.data.issuedAt)}</span>
                </div>
                {query.data.revokedAt && (
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Ngày thu hồi</span>
                    <span className="figure text-ink">{formatDate(query.data.revokedAt)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-ink-soft">Mã chứng chỉ</span>
                  <span className="figure text-ink">{code}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
