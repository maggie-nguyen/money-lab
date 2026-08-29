import { z } from "zod";
import { Prisma, type Locale } from "@prisma/client";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { AppError, conflict, notFound, ruleViolation, type ErrorDetail } from "@/server/lib/errors";
import { blockSchema, slugSchema } from "@/server/schemas/content";
import {
  assertIfMatch,
  etagOf,
  pageOf,
  writeAudit,
  type AdminActor,
  type AdminListQuery,
} from "@/server/services/adminCommon";

// Admin content CRUD + lifecycle - doc 03 §14.1.
// One registry entry per resource family; routes dispatch by the {res} path segment.
// Every mutation writes audit_log; every PATCH requires If-Match (where the model versions).

// ── Shared authoring shapes ──────────────────────────────────────────────────

const localeKey = z.literal("vi");
/** i18n record; `vi` mandatory on create (product default locale). */
const i18nOf = <S extends z.ZodTypeAny>(schema: S) =>
  z.record(localeKey, schema).refine((r) => r.vi !== undefined, { message: "i18n.vi is required" });
const i18nPartialOf = <S extends z.ZodTypeAny>(schema: S) => z.record(localeKey, schema);

/** Publish body for lessons/quizzes/sims - 422 CHECKLIST_REQUIRED per doc 03 §14.1. */
function requireChecklist(body: unknown): void {
  if ((body as { checklistConfirmed?: unknown } | null)?.checklistConfirmed !== true) {
    throw ruleViolation("CHECKLIST_REQUIRED", "Confirm the mentor checklist before publishing");
  }
}

function zodDetails(err: z.ZodError): ErrorDetail[] {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}
function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid body", { details: zodDetails(r.error) });
  }
  return r.data;
}
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));

/** Prisma unique-slug violation → 409 (doc 03 §14.1 "409 slug conflict"). */
function isP2002(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
async function slugGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isP2002(e)) throw conflict("Slug or code already in use");
    throw e;
  }
}

function trMap<T extends { locale: Locale }>(rows: T[]): Record<string, Omit<T, "locale">> {
  const out: Record<string, Omit<T, "locale">> = {};
  for (const { locale, ...rest } of rows) out[locale] = rest;
  return out;
}

// ── Resource registry ────────────────────────────────────────────────────────

export const ADMIN_RESOURCES = [
  "badges",
  "surveys",
  "articles",
] as const;
export type AdminResourceKey = (typeof ADMIN_RESOURCES)[number];
export function isAdminResource(v: string): v is AdminResourceKey {
  return (ADMIN_RESOURCES as readonly string[]).includes(v);
}

interface ResourceImpl {
  entityType: string;
  list(q: AdminListQuery): Promise<{ data: unknown[]; nextCursor: string | null }>;
  get(id: string): Promise<unknown>;
  create(body: unknown, actor: AdminActor, now: Date): Promise<unknown>;
  patch(id: string, body: unknown, ifMatch: string | null, actor: AdminActor, now: Date): Promise<unknown>;
  /** null = resource has no publish lifecycle (modules, questions, badges). */
  lifecycle:
    | null
    | ((
        id: string,
        action: "publish" | "unpublish" | "archive",
        body: unknown,
        actor: AdminActor,
        now: Date,
      ) => Promise<unknown>);
  remove(id: string, actor: AdminActor, now: Date): Promise<void>;
}








// ── badges (no status; no updatedAt → no etag) ───────────────────────────────

const badgeI18n = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(""),
});
const badgeCreate = z.object({
  code: z.string().regex(/^[A-Z0-9_]{3,40}$/),
  kind: z.enum(["PROGRESS", "STREAK", "MASTERY", "SIM", "SPECIAL"]),
  iconKey: z.string().max(40).default("badge"),
  coinReward: z.number().int().min(0).max(1000).default(0),
  criteria: z.record(z.string(), z.unknown()).default({}),
  i18n: i18nOf(badgeI18n),
});
const badgePatch = badgeCreate.partial().extend({ i18n: i18nPartialOf(badgeI18n).optional() });

function badgeDto(b: {
  id: string;
  code: string;
  kind: string;
  iconKey: string;
  coinReward: number;
  criteria: unknown;
  translations: Array<{ locale: Locale; title: string; description: string }>;
}) {
  return {
    id: b.id,
    code: b.code,
    kind: b.kind,
    iconKey: b.iconKey,
    coinReward: b.coinReward,
    criteria: b.criteria,
    i18n: trMap(b.translations),
  };
}

const badges: ResourceImpl = {
  entityType: "badge",
  async list(q) {
    const rows = await prisma.badge.findMany({
      where: {
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { code: { contains: q.q.toUpperCase() } } : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(badgeDto), nextCursor };
  },
  async get(id) {
    const b = await prisma.badge.findUnique({ where: { id }, include: { translations: true } });
    if (!b) throw notFound("Badge");
    return badgeDto(b);
  },
  async create(body, actor, now) {
    const b = parse(badgeCreate, body);
    const created = await slugGuard(() =>
      prisma.badge.create({
        data: {
          id: uuidv7(),
          code: b.code,
          kind: b.kind,
          iconKey: b.iconKey,
          coinReward: b.coinReward,
          criteria: json(b.criteria),
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({
              locale: locale as Locale,
              title: tr!.title,
              description: tr!.description,
            })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "badge", created.id, null, { code: created.code }, actor.ip, now);
    return badgeDto(created);
  },
  async patch(id, body, _ifMatch, actor, now) {
    const b = parse(badgePatch, body);
    const before = await prisma.badge.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Badge");
    const updated = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.badge.update({
          where: { id },
          data: {
            code: b.code,
            kind: b.kind,
            iconKey: b.iconKey,
            coinReward: b.coinReward,
            ...(b.criteria ? { criteria: json(b.criteria) } : {}),
          },
        });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          await tx.badgeTranslation.upsert({
            where: { badgeId_locale: { badgeId: id, locale: locale as Locale } },
            create: { badgeId: id, locale: locale as Locale, title: tr!.title, description: tr!.description },
            update: { title: tr!.title, description: tr!.description },
          });
        }
        return tx.badge.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "badge", id, badgeDto(before), badgeDto(updated), actor.ip, now);
    return badgeDto(updated);
  },
  lifecycle: null,
  async remove(id, actor, now) {
    const b = await prisma.badge.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!b) throw notFound("Badge");
    if (b._count.users > 0) throw ruleViolation("HAS_LEARNER_DATA", "Badge already awarded to users");
    await prisma.badge.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "badge", id, { code: b.code }, null, actor.ip, now);
  },
};


// ── surveys (questions nested; createdAt only → no etag) ─────────────────────

const surveyQuestionBody = z.object({
  order: z.number().int().min(1),
  type: z.enum(["NPS", "RATING_1_5", "SINGLE_CHOICE", "MULTI_CHOICE", "FREE_TEXT"]),
  payload: z.record(z.string(), z.unknown()).default({}),
});
const surveyCreate = z.object({
  slug: slugSchema,
  audience: z
    .object({
      minLessons: z.number().int().min(0).optional(),
      provinces: z.array(z.string()).optional(),
      authedOnly: z.boolean().optional(),
    })
    .nullish(),
  opensAt: z.string().datetime().nullish(),
  closesAt: z.string().datetime().nullish(),
  questions: z.array(surveyQuestionBody).min(1).max(50),
});
const surveyPatch = surveyCreate.partial();

function surveyDto(s: {
  id: string;
  slug: string;
  status: string;
  audience: unknown;
  opensAt: Date | null;
  closesAt: Date | null;
  createdAt: Date;
  questions: Array<{ id: string; order: number; type: string; payload: unknown }>;
  _count?: { responses: number };
}) {
  return {
    id: s.id,
    slug: s.slug,
    status: s.status,
    audience: s.audience,
    opensAt: s.opensAt?.toISOString() ?? null,
    closesAt: s.closesAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    responses: s._count?.responses,
    questions: s.questions
      .sort((a, b) => a.order - b.order)
      .map((question) => ({ id: question.id, order: question.order, type: question.type, payload: question.payload })),
  };
}

const surveys: ResourceImpl = {
  entityType: "survey",
  async list(q) {
    const rows = await prisma.survey.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { slug: { contains: q.q } } : {}),
      },
      include: { questions: true, _count: { select: { responses: true } } },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(surveyDto), nextCursor };
  },
  async get(id) {
    const s = await prisma.survey.findUnique({
      where: { id },
      include: { questions: true, _count: { select: { responses: true } } },
    });
    if (!s) throw notFound("Survey");
    return surveyDto(s);
  },
  async create(body, actor, now) {
    const b = parse(surveyCreate, body);
    const s = await slugGuard(() =>
      prisma.survey.create({
        data: {
          id: uuidv7(),
          slug: b.slug,
          audience: b.audience ? json(b.audience) : undefined,
          opensAt: b.opensAt ? new Date(b.opensAt) : null,
          closesAt: b.closesAt ? new Date(b.closesAt) : null,
          questions: {
            create: b.questions.map((question) => ({
              id: uuidv7(),
              order: question.order,
              type: question.type,
              payload: json(question.payload),
            })),
          },
        },
        include: { questions: true, _count: { select: { responses: true } } },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "survey", s.id, null, { slug: s.slug }, actor.ip, now);
    return surveyDto(s);
  },
  async patch(id, body, _ifMatch, actor, now) {
    const b = parse(surveyPatch, body);
    const before = await prisma.survey.findUnique({ where: { id }, include: { _count: { select: { responses: true } } } });
    if (!before) throw notFound("Survey");
    // Replacing questions after responses exist would orphan the answers' questionIds.
    if (b.questions && before._count.responses > 0) {
      throw ruleViolation("HAS_RESPONSES", "Cannot replace questions after responses exist");
    }
    const s = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.survey.update({
          where: { id },
          data: {
            slug: b.slug,
            ...(b.audience !== undefined ? { audience: b.audience === null ? Prisma.DbNull : json(b.audience) } : {}),
            ...(b.opensAt !== undefined ? { opensAt: b.opensAt ? new Date(b.opensAt) : null } : {}),
            ...(b.closesAt !== undefined ? { closesAt: b.closesAt ? new Date(b.closesAt) : null } : {}),
          },
        });
        if (b.questions) {
          await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
          await tx.surveyQuestion.createMany({
            data: b.questions.map((question) => ({
              id: uuidv7(),
              surveyId: id,
              order: question.order,
              type: question.type,
              payload: json(question.payload),
            })),
          });
        }
        return tx.survey.findUniqueOrThrow({
          where: { id },
          include: { questions: true, _count: { select: { responses: true } } },
        });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "survey", id, { slug: before.slug }, { slug: s.slug }, actor.ip, now);
    return surveyDto(s);
  },
  lifecycle: async (id, action, _body, actor, now) => {
    const before = await prisma.survey.findUnique({ where: { id }, include: { questions: true } });
    if (!before) throw notFound("Survey");
    if (action === "publish" && before.questions.length === 0) {
      throw ruleViolation("NO_QUESTIONS", "Survey has no questions");
    }
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const s = await prisma.survey.update({
      where: { id },
      data: { status },
      include: { questions: true, _count: { select: { responses: true } } },
    });
    await writeAudit(prisma, actor.id, action, "survey", id, { status: before.status }, { status }, actor.ip, now);
    return surveyDto(s);
  },
  async remove(id, actor, now) {
    const s = await prisma.survey.findUnique({ where: { id }, include: { _count: { select: { responses: true } } } });
    if (!s) throw notFound("Survey");
    if (s._count.responses > 0) throw ruleViolation("HAS_LEARNER_DATA", "Survey has responses");
    if (s.status !== "DRAFT") throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    await prisma.survey.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "survey", id, { slug: s.slug }, null, actor.ip, now);
  },
};

// ── Dispatch ─────────────────────────────────────────────────────────────────

// ── articles ─────────────────────────────────────────────────────────────────

const articleI18n = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(500).default(""),
  seoTitle: z.string().max(70).default(""),
  seoDescription: z.string().max(160).default(""),
  blocks: z.array(blockSchema).min(1).max(60),
});
const articleCreate = z.object({
  slug: slugSchema,
  category: z.enum(["GUIDE", "EXPLAINER", "NEWS", "STORY"]),
  coverImageUrl: z.string().url().max(500).nullish(),
  readMinutes: z.number().int().min(1).max(60).default(4),
  authorName: z.string().trim().min(1).max(80).default("Money&Me"),
  i18n: i18nOf(articleI18n),
});
const articlePatch = articleCreate.partial().extend({ i18n: i18nPartialOf(articleI18n).optional() });

function articleDto(a: {
  id: string;
  slug: string;
  status: string;
  category: string;
  coverImageUrl: string | null;
  readMinutes: number;
  publishedAt: Date | null;
  authorName: string;
  contentVersion: number;
  updatedAt: Date;
  translations: Array<{
    locale: Locale;
    title: string;
    summary: string;
    seoTitle: string;
    seoDescription: string;
    blocks: unknown;
  }>;
}) {
  return {
    id: a.id,
    slug: a.slug,
    status: a.status,
    category: a.category,
    coverImageUrl: a.coverImageUrl,
    readMinutes: a.readMinutes,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    authorName: a.authorName,
    contentVersion: a.contentVersion,
    i18n: trMap(a.translations),
    etag: etagOf(a.updatedAt),
    updatedAt: a.updatedAt.toISOString(),
  };
}

const articles: ResourceImpl = {
  entityType: "article",
  async list(q) {
    const rows = await prisma.article.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q
          ? {
              OR: [
                { slug: { contains: q.q } },
                { translations: { some: { title: { contains: q.q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(articleDto), nextCursor };
  },
  async get(id) {
    const a = await prisma.article.findUnique({ where: { id }, include: { translations: true } });
    if (!a) throw notFound("Article");
    return articleDto(a);
  },
  async create(body, actor, now) {
    const b = parse(articleCreate, body);
    const a = await slugGuard(() =>
      prisma.article.create({
        data: {
          id: uuidv7(),
          slug: b.slug,
          category: b.category,
          coverImageUrl: b.coverImageUrl ?? null,
          readMinutes: b.readMinutes,
          authorName: b.authorName,
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({
              locale: locale as Locale,
              title: tr!.title,
              summary: tr!.summary,
              seoTitle: tr!.seoTitle,
              seoDescription: tr!.seoDescription,
              blocks: json(tr!.blocks),
            })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "article", a.id, null, { slug: a.slug }, actor.ip, now);
    return articleDto(a);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(articlePatch, body);
    const before = await prisma.article.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Article");
    assertIfMatch(ifMatch, before.updatedAt);
    const a = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.article.update({
          where: { id },
          data: {
            slug: b.slug,
            category: b.category,
            coverImageUrl: b.coverImageUrl,
            readMinutes: b.readMinutes,
            authorName: b.authorName,
            ...(before.status === "PUBLISHED" && b.i18n ? { contentVersion: { increment: 1 } } : {}),
          },
        });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          const data = {
            title: tr!.title,
            summary: tr!.summary,
            seoTitle: tr!.seoTitle,
            seoDescription: tr!.seoDescription,
            blocks: json(tr!.blocks),
          };
          await tx.articleTranslation.upsert({
            where: { articleId_locale: { articleId: id, locale: locale as Locale } },
            create: { articleId: id, locale: locale as Locale, ...data },
            update: data,
          });
        }
        return tx.article.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "article", id, { etag: etagOf(before.updatedAt) }, { etag: etagOf(a.updatedAt) }, actor.ip, now);
    return articleDto(a);
  },
  lifecycle: async (id, action, body, actor, now) => {
    const before = await prisma.article.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Article");
    if (action === "publish") {
      requireChecklist(body);
      // An article with no vi translation would render blank for most readers.
      if (!before.translations.some((t) => t.locale === "vi")) {
        throw ruleViolation("NO_VI_TRANSLATION", "Article needs a Vietnamese translation");
      }
      const details: ErrorDetail[] = [];
      for (const t of before.translations) {
        const blocks = Array.isArray(t.blocks) ? t.blocks : [];
        blocks.forEach((blk, i) => {
          const r = blockSchema.safeParse(blk);
          if (!r.success) details.push({ path: `${t.locale}.blocks[${i}]`, message: r.error.issues[0]?.message ?? "invalid" });
        });
      }
      if (details.length > 0) throw new AppError("RULE_VIOLATION", "Article blocks failed validation", { details });
    }
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const a = await prisma.article.update({
      where: { id },
      data: {
        status,
        // publishedAt is the library's sort key, so it is stamped once and kept
        // across an unpublish/republish rather than jumping the article to the
        // top of the list every time an editor toggles it.
        ...(action === "publish"
          ? { contentVersion: { increment: 1 }, ...(before.publishedAt ? {} : { publishedAt: now }) }
          : {}),
      },
      include: { translations: true },
    });
    await writeAudit(prisma, actor.id, action, "article", id, { status: before.status }, { status }, actor.ip, now);
    return articleDto(a);
  },
  async remove(id, actor, now) {
    const a = await prisma.article.findUnique({ where: { id } });
    if (!a) throw notFound("Article");
    if (a.status !== "DRAFT" || a.contentVersion > 1) {
      throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    }
    await prisma.article.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "article", id, { slug: a.slug }, null, actor.ip, now);
  },
};

const REGISTRY: Record<AdminResourceKey, ResourceImpl> = {
  badges,
  surveys,
  articles,
};

export function resourceFor(key: AdminResourceKey): ResourceImpl {
  return REGISTRY[key];
}
