import type { Locale } from "@prisma/client";
import { prisma } from "@/server/db";
import { env } from "@/server/config";
import { notFound } from "@/server/lib/errors";

// Certificates - doc 03 §13. Issued automatically on course completion (progressService);
// there is no learner-facing issue endpoint.

interface Snapshot {
  displayName?: string;
  courseTitle?: string;
  courseSlug?: string;
  issuedDate?: string;
}

export function shareUrl(code: string): string {
  return `${env().APP_ORIGIN.replace(/\/$/, "")}/verify/${code}`;
}

export async function listMyCertificates(userId: string, locale: Locale) {
  const rows = await prisma.certificate.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    include: {
      course: { include: { translations: { where: { locale: { in: [locale, "vi"] } } } } },
    },
  });
  return rows.map((c) => {
    const snap = (c.snapshot ?? {}) as Snapshot;
    const tr = c.course.translations.find((t) => t.locale === locale) ?? c.course.translations[0];
    return {
      id: c.id,
      code: c.code,
      // The snapshot is the record of what was earned; translations are only a nicer fallback.
      courseTitle: snap.courseTitle ?? tr?.title ?? c.course.slug,
      issuedAt: c.issuedAt.toISOString(),
      status: c.status,
      shareUrl: shareUrl(c.code),
    };
  });
}

/** 13.3 - public verification. 404 for an unknown code; 200 with valid:false when revoked. */
export async function verifyCertificate(code: string) {
  const cert = await prisma.certificate.findUnique({
    where: { code },
    include: { course: { include: { translations: { where: { locale: "vi" } } } }, user: { select: { displayName: true, deletedAt: true } } },
  });
  if (!cert) throw notFound("Certificate");
  const snap = (cert.snapshot ?? {}) as Snapshot;
  const holderDisplayName = cert.user.deletedAt
    ? "Tài khoản đã xóa"
    : (snap.displayName ?? cert.user.displayName);
  return {
    valid: cert.status === "ACTIVE",
    holderDisplayName,
    courseTitle: snap.courseTitle ?? cert.course.translations[0]?.title ?? cert.course.slug,
    issuedAt: cert.issuedAt.toISOString(),
    status: cert.status,
    ...(cert.revokedAt ? { revokedAt: cert.revokedAt.toISOString() } : {}),
  };
}
