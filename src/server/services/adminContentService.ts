import { z } from "zod";
import { Prisma, type Locale } from "@prisma/client";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { AppError, conflict, notFound, ruleViolation, type ErrorDetail } from "@/server/lib/errors";
import { SIM_CONFIG_SCHEMAS } from "@/server/schemas/simConfig";
import {
  blockSchema,
  questionSchema,
  slugSchema,
  type QuestionInput,
} from "@/server/schemas/content";
import {
  questionPayload,
  questionPayloadText,
  validateQuestion,
  type ImportIssue,
} from "@/server/services/contentImport";
import { getEngine } from "@/server/engines";
import { applyPreset, type EngineJson } from "@/server/engines/types";
import { turnRng } from "@/server/lib/rng";
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

const localeKey = z.enum(["vi", "en"]);
const titleI18n = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().max(300).default(""),
  description: z.string().max(3000).default(""),
});
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

// ── Sim publish smoke - doc 03 §14.1 ─────────────────────────────────────────

/** Per-engine auto-policy: a minimal valid action for the current state. */
function smokeAction(type: string, state: EngineJson, config: EngineJson): EngineJson {
  const s = state as Record<string, unknown>;
  switch (type) {
    case "BUDGET": {
      if (s.phase === "ALLOCATE") {
        const cats = (config.categories ?? []) as Array<{ key: string; kind: string; minVnd?: unknown }>;
        const allocations: Record<string, string> = {};
        for (const c of cats) allocations[c.key] = String(c.kind === "NEED" ? Number(c.minVnd ?? 0) : 0);
        return { type: "SET_ALLOCATIONS", allocations };
      }
      if (s.phase === "EVENTS") {
        const pending = (s.pendingEvents ?? []) as Array<{ key: string }>;
        const defs = (config.events ?? []) as Array<{ key: string; choices?: Array<{ key: string }> }>;
        const ev = pending[0];
        const choice = defs.find((d) => d.key === ev?.key)?.choices?.[0];
        return { type: "RESOLVE_EVENT", eventKey: ev?.key ?? "", choiceKey: choice?.key ?? "" };
      }
      return { type: "END_MONTH" };
    }
    case "LOANS": {
      if (s.phase === "CHOOSE") {
        const offers = (config.offers ?? []) as Array<{ key: string }>;
        return { type: "TAKE_LOAN", offerKey: offers[0]?.key ?? "" };
      }
      return { type: "PAY_SCHEDULED" };
    }
    case "SCAM":
      return { type: "DECIDE", verdict: "SAFE" };
    case "BUSINESS":
      return { type: "PLAN_WEEK", priceVnd: "20000", unitsToStock: 5 };
    case "INVEST":
      return { type: "REBALANCE", orders: [] };
    default:
      return {};
  }
}

/** init + 3 turns with a naive policy; any throw = config is not publishable. */
function smokeSimulate(type: string, rawConfig: EngineJson): void {
  const engine = getEngine(type as never);
  const cfg = applyPreset(rawConfig, "default");
  let state = engine.init(rawConfig, 12345, "default");
  engine.view(state, cfg, {});
  for (let turn = 0; turn < 3; turn++) {
    if (engine.isFinished(state, cfg).finished) break;
    if (engine.availableActions(state, cfg).length === 0) break;
    const action = smokeAction(type, state, cfg);
    const res = engine.applyAction(state, cfg, action, turnRng(12345, turn));
    state = res.state;
    engine.view(state, cfg, {});
  }
}

// ── Resource registry ────────────────────────────────────────────────────────

export const ADMIN_RESOURCES = [
  "tracks",
  "courses",
  "modules",
  "lessons",
  "quizzes",
  "questions",
  "sims",
  "badges",
  "shop-items",
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

// ── tracks ───────────────────────────────────────────────────────────────────

const trackCreate = z.object({
  slug: slugSchema,
  order: z.number().int().min(0),
  iconKey: z.string().max(40).optional(),
  i18n: i18nOf(titleI18n),
});
const trackPatch = trackCreate.partial().extend({ i18n: i18nPartialOf(titleI18n).optional() });

function trackDto(t: {
  id: string;
  slug: string;
  order: number;
  status: string;
  iconKey: string | null;
  updatedAt: Date;
  translations: Array<{ locale: Locale; title: string; subtitle: string; description: string }>;
}) {
  return {
    id: t.id,
    slug: t.slug,
    order: t.order,
    status: t.status,
    iconKey: t.iconKey,
    i18n: trMap(t.translations),
    etag: etagOf(t.updatedAt),
    updatedAt: t.updatedAt.toISOString(),
  };
}

const tracks: ResourceImpl = {
  entityType: "track",
  async list(q) {
    const rows = await prisma.track.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { OR: [{ slug: { contains: q.q } }, { translations: { some: { title: { contains: q.q, mode: "insensitive" } } } }] } : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(trackDto), nextCursor };
  },
  async get(id) {
    const t = await prisma.track.findUnique({ where: { id }, include: { translations: true } });
    if (!t) throw notFound("Track");
    return trackDto(t);
  },
  async create(body, actor, now) {
    const b = parse(trackCreate, body);
    const t = await slugGuard(() =>
      prisma.track.create({
        data: {
          id: uuidv7(),
          slug: b.slug,
          order: b.order,
          iconKey: b.iconKey,
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({ locale: locale as Locale, ...tr! })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "track", t.id, null, trackDto(t), actor.ip, now);
    return trackDto(t);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(trackPatch, body);
    const before = await prisma.track.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Track");
    assertIfMatch(ifMatch, before.updatedAt);
    const t = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.track.update({
          where: { id },
          data: { slug: b.slug, order: b.order, iconKey: b.iconKey },
        });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          await tx.trackTranslation.upsert({
            where: { trackId_locale: { trackId: id, locale: locale as Locale } },
            create: { trackId: id, locale: locale as Locale, ...tr! },
            update: tr!,
          });
        }
        return tx.track.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "track", id, trackDto(before), trackDto(t), actor.ip, now);
    return trackDto(t);
  },
  lifecycle: async (id, action, _body, actor, now) => {
    const before = await prisma.track.findUnique({ where: { id } });
    if (!before) throw notFound("Track");
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const t = await prisma.track.update({ where: { id }, data: { status }, include: { translations: true } });
    await writeAudit(prisma, actor.id, action, "track", id, { status: before.status }, { status }, actor.ip, now);
    return trackDto(t);
  },
  async remove(id, actor, now) {
    const t = await prisma.track.findUnique({ where: { id }, include: { courses: { select: { id: true } } } });
    if (!t) throw notFound("Track");
    if (t.status !== "DRAFT") throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    if (t.courses.length > 0) throw ruleViolation("HAS_CHILDREN", "Track still has courses");
    await prisma.track.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "track", id, { slug: t.slug }, null, actor.ip, now);
  },
};

// ── courses ──────────────────────────────────────────────────────────────────

const courseI18n = titleI18n.extend({
  learningObjectives: z.array(z.string().max(300)).max(10).default([]),
});
const courseCreate = z.object({
  trackId: z.string().min(1),
  slug: slugSchema,
  order: z.number().int().min(0),
  level: z.number().int().min(1).max(3).default(1),
  estimatedMinutes: z.number().int().min(1).max(600).default(30),
  coverImageUrl: z.string().url().nullish(),
  xpReward: z.number().int().min(0).max(1000).default(50),
  finalQuizId: z.string().nullish(),
  i18n: i18nOf(courseI18n),
});
const coursePatch = courseCreate.partial().extend({ i18n: i18nPartialOf(courseI18n).optional() });

function courseDto(c: {
  id: string;
  trackId: string;
  slug: string;
  order: number;
  status: string;
  level: number;
  estimatedMinutes: number;
  coverImageUrl: string | null;
  xpReward: number;
  finalQuizId: string | null;
  updatedAt: Date;
  translations: Array<{ locale: Locale } & Record<string, unknown>>;
}) {
  return {
    id: c.id,
    trackId: c.trackId,
    slug: c.slug,
    order: c.order,
    status: c.status,
    level: c.level,
    estimatedMinutes: c.estimatedMinutes,
    coverImageUrl: c.coverImageUrl,
    xpReward: c.xpReward,
    finalQuizId: c.finalQuizId,
    i18n: trMap(c.translations),
    etag: etagOf(c.updatedAt),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const courses: ResourceImpl = {
  entityType: "course",
  async list(q) {
    const rows = await prisma.course.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { OR: [{ slug: { contains: q.q } }, { translations: { some: { title: { contains: q.q, mode: "insensitive" } } } }] } : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(courseDto), nextCursor };
  },
  async get(id) {
    const c = await prisma.course.findUnique({ where: { id }, include: { translations: true } });
    if (!c) throw notFound("Course");
    return courseDto(c);
  },
  async create(body, actor, now) {
    const b = parse(courseCreate, body);
    const track = await prisma.track.findUnique({ where: { id: b.trackId } });
    if (!track) throw notFound("Track");
    const c = await slugGuard(() =>
      prisma.course.create({
        data: {
          id: uuidv7(),
          trackId: b.trackId,
          slug: b.slug,
          order: b.order,
          level: b.level,
          estimatedMinutes: b.estimatedMinutes,
          coverImageUrl: b.coverImageUrl ?? null,
          xpReward: b.xpReward,
          finalQuizId: b.finalQuizId ?? null,
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({
              locale: locale as Locale,
              title: tr!.title,
              subtitle: tr!.subtitle,
              description: tr!.description,
              learningObjectives: json(tr!.learningObjectives),
            })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "course", c.id, null, courseDto(c), actor.ip, now);
    return courseDto(c);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(coursePatch, body);
    const before = await prisma.course.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Course");
    assertIfMatch(ifMatch, before.updatedAt);
    if (b.finalQuizId) {
      const quiz = await prisma.quiz.findUnique({ where: { id: b.finalQuizId } });
      if (!quiz) throw notFound("Quiz");
    }
    const c = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.course.update({
          where: { id },
          data: {
            trackId: b.trackId,
            slug: b.slug,
            order: b.order,
            level: b.level,
            estimatedMinutes: b.estimatedMinutes,
            coverImageUrl: b.coverImageUrl,
            xpReward: b.xpReward,
            finalQuizId: b.finalQuizId,
          },
        });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          const data = {
            title: tr!.title,
            subtitle: tr!.subtitle,
            description: tr!.description,
            learningObjectives: json(tr!.learningObjectives),
          };
          await tx.courseTranslation.upsert({
            where: { courseId_locale: { courseId: id, locale: locale as Locale } },
            create: { courseId: id, locale: locale as Locale, ...data },
            update: data,
          });
        }
        return tx.course.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "course", id, courseDto(before), courseDto(c), actor.ip, now);
    return courseDto(c);
  },
  lifecycle: async (id, action, _body, actor, now) => {
    const before = await prisma.course.findUnique({
      where: { id },
      include: { lessons: { select: { status: true } } },
    });
    if (!before) throw notFound("Course");
    if (action === "publish" && !before.lessons.some((l) => l.status === "PUBLISHED")) {
      throw ruleViolation("NO_PUBLISHED_LESSON", "Course needs at least one published lesson");
    }
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const c = await prisma.course.update({ where: { id }, data: { status }, include: { translations: true } });
    await writeAudit(prisma, actor.id, action, "course", id, { status: before.status }, { status }, actor.ip, now);
    return courseDto(c);
  },
  async remove(id, actor, now) {
    const c = await prisma.course.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true, certificates: true, lessons: true } } },
    });
    if (!c) throw notFound("Course");
    if (c.status !== "DRAFT") throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    if (c._count.enrollments > 0 || c._count.certificates > 0) {
      throw ruleViolation("HAS_LEARNER_DATA", "Course has enrollments or certificates");
    }
    await prisma.course.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "course", id, { slug: c.slug }, null, actor.ip, now);
  },
};

// ── modules (no status lifecycle) ────────────────────────────────────────────

const moduleI18n = z.object({ title: z.string().trim().min(1).max(200) });
const moduleCreate = z.object({
  courseId: z.string().min(1),
  slug: slugSchema,
  order: z.number().int().min(0),
  i18n: i18nOf(moduleI18n),
});
const modulePatch = moduleCreate.partial().extend({ i18n: i18nPartialOf(moduleI18n).optional() });

function moduleDto(m: {
  id: string;
  courseId: string;
  slug: string;
  order: number;
  updatedAt: Date;
  translations: Array<{ locale: Locale; title: string }>;
}) {
  return {
    id: m.id,
    courseId: m.courseId,
    slug: m.slug,
    order: m.order,
    i18n: trMap(m.translations),
    etag: etagOf(m.updatedAt),
    updatedAt: m.updatedAt.toISOString(),
  };
}

const modules: ResourceImpl = {
  entityType: "module",
  async list(q) {
    const rows = await prisma.module.findMany({
      where: {
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { slug: { contains: q.q } } : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(moduleDto), nextCursor };
  },
  async get(id) {
    const m = await prisma.module.findUnique({ where: { id }, include: { translations: true } });
    if (!m) throw notFound("Module");
    return moduleDto(m);
  },
  async create(body, actor, now) {
    const b = parse(moduleCreate, body);
    const course = await prisma.course.findUnique({ where: { id: b.courseId } });
    if (!course) throw notFound("Course");
    const m = await slugGuard(() =>
      prisma.module.create({
        data: {
          id: uuidv7(),
          courseId: b.courseId,
          slug: b.slug,
          order: b.order,
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({ locale: locale as Locale, title: tr!.title })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "module", m.id, null, moduleDto(m), actor.ip, now);
    return moduleDto(m);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(modulePatch, body);
    const before = await prisma.module.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Module");
    assertIfMatch(ifMatch, before.updatedAt);
    const m = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.module.update({ where: { id }, data: { slug: b.slug, order: b.order } });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          await tx.moduleTranslation.upsert({
            where: { moduleId_locale: { moduleId: id, locale: locale as Locale } },
            create: { moduleId: id, locale: locale as Locale, title: tr!.title },
            update: { title: tr!.title },
          });
        }
        return tx.module.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "module", id, moduleDto(before), moduleDto(m), actor.ip, now);
    return moduleDto(m);
  },
  lifecycle: null,
  async remove(id, actor, now) {
    const m = await prisma.module.findUnique({ where: { id } });
    if (!m) throw notFound("Module");
    await prisma.module.delete({ where: { id } }); // lessons keep courseId; moduleId → SetNull
    await writeAudit(prisma, actor.id, "delete", "module", id, { slug: m.slug }, null, actor.ip, now);
  },
};

// ── lessons ──────────────────────────────────────────────────────────────────

const lessonI18n = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(500).default(""),
  blocks: z.array(blockSchema).min(1).max(30),
});
const lessonCreate = z.object({
  courseId: z.string().min(1),
  moduleId: z.string().nullish(),
  slug: slugSchema,
  order: z.number().int().min(0),
  estimatedMinutes: z.number().int().min(1).max(120).default(6),
  xpReward: z.number().int().min(0).max(500).default(20),
  checkQuizId: z.string().nullish(),
  i18n: i18nOf(lessonI18n),
});
const lessonPatch = lessonCreate.partial().extend({ i18n: i18nPartialOf(lessonI18n).optional() });

function lessonDto(l: {
  id: string;
  courseId: string;
  moduleId: string | null;
  slug: string;
  order: number;
  status: string;
  estimatedMinutes: number;
  xpReward: number;
  contentVersion: number;
  checkQuizId: string | null;
  updatedAt: Date;
  translations: Array<{ locale: Locale; title: string; summary: string; blocks: unknown }>;
}) {
  return {
    id: l.id,
    courseId: l.courseId,
    moduleId: l.moduleId,
    slug: l.slug,
    order: l.order,
    status: l.status,
    estimatedMinutes: l.estimatedMinutes,
    xpReward: l.xpReward,
    contentVersion: l.contentVersion,
    checkQuizId: l.checkQuizId,
    i18n: trMap(l.translations),
    etag: etagOf(l.updatedAt),
    updatedAt: l.updatedAt.toISOString(),
  };
}

const lessons: ResourceImpl = {
  entityType: "lesson",
  async list(q) {
    const rows = await prisma.lesson.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { OR: [{ slug: { contains: q.q } }, { translations: { some: { title: { contains: q.q, mode: "insensitive" } } } }] } : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(lessonDto), nextCursor };
  },
  async get(id) {
    const l = await prisma.lesson.findUnique({ where: { id }, include: { translations: true } });
    if (!l) throw notFound("Lesson");
    return lessonDto(l);
  },
  async create(body, actor, now) {
    const b = parse(lessonCreate, body);
    const course = await prisma.course.findUnique({ where: { id: b.courseId } });
    if (!course) throw notFound("Course");
    const l = await slugGuard(() =>
      prisma.lesson.create({
        data: {
          id: uuidv7(),
          courseId: b.courseId,
          moduleId: b.moduleId ?? null,
          slug: b.slug,
          order: b.order,
          estimatedMinutes: b.estimatedMinutes,
          xpReward: b.xpReward,
          checkQuizId: b.checkQuizId ?? null,
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({
              locale: locale as Locale,
              title: tr!.title,
              summary: tr!.summary,
              blocks: json(tr!.blocks),
            })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "lesson", l.id, null, { slug: l.slug }, actor.ip, now);
    return lessonDto(l);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(lessonPatch, body);
    const before = await prisma.lesson.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Lesson");
    assertIfMatch(ifMatch, before.updatedAt);
    const l = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.lesson.update({
          where: { id },
          data: {
            moduleId: b.moduleId,
            slug: b.slug,
            order: b.order,
            estimatedMinutes: b.estimatedMinutes,
            xpReward: b.xpReward,
            checkQuizId: b.checkQuizId,
            // Editing a published lesson bumps the version learners see (doc 03 §4).
            ...(before.status === "PUBLISHED" && b.i18n ? { contentVersion: { increment: 1 } } : {}),
          },
        });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          const data = { title: tr!.title, summary: tr!.summary, blocks: json(tr!.blocks) };
          await tx.lessonTranslation.upsert({
            where: { lessonId_locale: { lessonId: id, locale: locale as Locale } },
            create: { lessonId: id, locale: locale as Locale, ...data },
            update: data,
          });
        }
        return tx.lesson.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "lesson", id, { etag: etagOf(before.updatedAt) }, { etag: etagOf(l.updatedAt) }, actor.ip, now);
    return lessonDto(l);
  },
  lifecycle: async (id, action, body, actor, now) => {
    const before = await prisma.lesson.findUnique({
      where: { id },
      include: { checkQuiz: true, course: { include: { lessons: { select: { id: true, status: true } } } }, translations: true },
    });
    if (!before) throw notFound("Lesson");
    if (action === "publish") {
      requireChecklist(body);
      if (!before.checkQuiz) throw ruleViolation("NO_CHECK_QUIZ", "Lesson has no check quiz");
      if (before.checkQuiz.status !== "PUBLISHED") {
        throw ruleViolation("CHECK_QUIZ_UNPUBLISHED", "Publish the check quiz first");
      }
      // Re-validate every translation's blocks against the current schema.
      const details: ErrorDetail[] = [];
      for (const t of before.translations) {
        const blocks = Array.isArray(t.blocks) ? t.blocks : [];
        blocks.forEach((blk, i) => {
          const r = blockSchema.safeParse(blk);
          if (!r.success) details.push({ path: `${t.locale}.blocks[${i}]`, message: r.error.issues[0]?.message ?? "invalid" });
        });
      }
      if (details.length > 0) throw new AppError("RULE_VIOLATION", "Lesson blocks failed validation", { details });
    }
    if (action === "unpublish" && before.course.status === "PUBLISHED") {
      const stillPublished = before.course.lessons.filter((l) => l.status === "PUBLISHED" && l.id !== id);
      if (stillPublished.length === 0) {
        throw ruleViolation("LAST_PUBLISHED_LESSON", "Published course needs at least one published lesson");
      }
    }
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const l = await prisma.lesson.update({
      where: { id },
      data: { status, ...(action === "publish" ? { contentVersion: { increment: 1 } } : {}) },
      include: { translations: true },
    });
    await writeAudit(prisma, actor.id, action, "lesson", id, { status: before.status }, { status }, actor.ip, now);
    return lessonDto(l);
  },
  async remove(id, actor, now) {
    const l = await prisma.lesson.findUnique({
      where: { id },
      include: { _count: { select: { progress: true } } },
    });
    if (!l) throw notFound("Lesson");
    if (l.status !== "DRAFT" || l.contentVersion > 1) {
      throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    }
    if (l._count.progress > 0) throw ruleViolation("HAS_LEARNER_DATA", "Lesson has learner progress");
    await prisma.lesson.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "lesson", id, { slug: l.slug }, null, actor.ip, now);
  },
};

// ── quizzes ──────────────────────────────────────────────────────────────────

const quizCreate = z.object({
  kind: z.enum(["LESSON_CHECK", "COURSE_FINAL", "PLACEMENT"]),
  passThresholdPct: z.number().int().min(0).max(100).default(70),
  maxAttempts: z.number().int().min(1).max(20).nullish(),
  timeLimitSec: z.number().int().min(30).max(3600).nullish(),
  shuffleQuestions: z.boolean().default(true),
});
const quizPatch = quizCreate.partial();

function quizDto(qz: {
  id: string;
  kind: string;
  status: string;
  passThresholdPct: number;
  maxAttempts: number | null;
  timeLimitSec: number | null;
  shuffleQuestions: boolean;
  contentVersion: number;
  updatedAt: Date;
  questions?: Array<{
    id: string;
    order: number;
    type: string;
    points: number;
    payload: unknown;
    answerKey: unknown;
    translations: Array<{ locale: Locale; prompt: string; explanation: string; payloadText: unknown }>;
  }>;
}) {
  return {
    id: qz.id,
    kind: qz.kind,
    status: qz.status,
    passThresholdPct: qz.passThresholdPct,
    maxAttempts: qz.maxAttempts,
    timeLimitSec: qz.timeLimitSec,
    shuffleQuestions: qz.shuffleQuestions,
    contentVersion: qz.contentVersion,
    // Admin sees answer keys (doc 03 §14.1) - this DTO must never be reused on learner routes.
    questions: qz.questions
      ?.sort((a, b) => a.order - b.order)
      .map((question) => ({
        id: question.id,
        order: question.order,
        type: question.type,
        points: question.points,
        payload: question.payload,
        answerKey: question.answerKey,
        i18n: trMap(question.translations),
      })),
    etag: etagOf(qz.updatedAt),
    updatedAt: qz.updatedAt.toISOString(),
  };
}

const quizzes: ResourceImpl = {
  entityType: "quiz",
  async list(q) {
    const rows = await prisma.quiz.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
      },
      include: { questions: { include: { translations: true } } },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(quizDto), nextCursor };
  },
  async get(id) {
    const qz = await prisma.quiz.findUnique({
      where: { id },
      include: { questions: { include: { translations: true } } },
    });
    if (!qz) throw notFound("Quiz");
    return quizDto(qz);
  },
  async create(body, actor, now) {
    const b = parse(quizCreate, body);
    const qz = await prisma.quiz.create({
      data: { id: uuidv7(), ...b, maxAttempts: b.maxAttempts ?? null, timeLimitSec: b.timeLimitSec ?? null },
      include: { questions: { include: { translations: true } } },
    });
    await writeAudit(prisma, actor.id, "create", "quiz", qz.id, null, { kind: qz.kind }, actor.ip, now);
    return quizDto(qz);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(quizPatch, body);
    const before = await prisma.quiz.findUnique({ where: { id } });
    if (!before) throw notFound("Quiz");
    assertIfMatch(ifMatch, before.updatedAt);
    const qz = await prisma.quiz.update({
      where: { id },
      data: { ...b, ...(before.status === "PUBLISHED" ? { contentVersion: { increment: 1 } } : {}) },
      include: { questions: { include: { translations: true } } },
    });
    await writeAudit(prisma, actor.id, "update", "quiz", id, quizDto({ ...before, questions: undefined }), { etag: etagOf(qz.updatedAt) }, actor.ip, now);
    return quizDto(qz);
  },
  lifecycle: async (id, action, body, actor, now) => {
    const before = await prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: { include: { translations: true } },
        lessonCheckOf: { select: { id: true, status: true } },
        courseFinalOf: { select: { id: true, status: true } },
      },
    });
    if (!before) throw notFound("Quiz");
    if (action === "publish") {
      requireChecklist(body);
      if (before.questions.length === 0) throw ruleViolation("NO_QUESTIONS", "Quiz has no questions");
    }
    if (action !== "publish") {
      const parents = [before.lessonCheckOf, before.courseFinalOf].filter((p) => p?.status === "PUBLISHED");
      if (parents.length > 0) {
        throw ruleViolation("REFERENCED_BY_PUBLISHED", "A published lesson/course uses this quiz");
      }
    }
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const qz = await prisma.quiz.update({
      where: { id },
      data: { status, ...(action === "publish" ? { contentVersion: { increment: 1 } } : {}) },
      include: { questions: { include: { translations: true } } },
    });
    await writeAudit(prisma, actor.id, action, "quiz", id, { status: before.status }, { status }, actor.ip, now);
    return quizDto(qz);
  },
  async remove(id, actor, now) {
    const qz = await prisma.quiz.findUnique({
      where: { id },
      include: { _count: { select: { attempts: true } }, lessonCheckOf: true, courseFinalOf: true },
    });
    if (!qz) throw notFound("Quiz");
    if (qz.status !== "DRAFT" || qz.contentVersion > 1) throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    if (qz._count.attempts > 0) throw ruleViolation("HAS_LEARNER_DATA", "Quiz has attempts");
    if (qz.lessonCheckOf || qz.courseFinalOf) throw ruleViolation("REFERENCED", "Detach from lesson/course first");
    await prisma.quiz.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "quiz", id, { kind: qz.kind }, null, actor.ip, now);
  },
};

// ── questions (no status lifecycle; authoring shape = doc 05) ────────────────

const questionCreate = z.object({
  quizId: z.string().min(1),
  order: z.number().int().min(1),
  authoring: questionSchema,
});
const questionPatchBody = z.object({
  order: z.number().int().min(1).optional(),
  points: z.number().int().min(1).max(10).optional(),
  authoring: questionSchema.optional(),
});

function questionDto(question: {
  id: string;
  quizId: string;
  order: number;
  type: string;
  points: number;
  payload: unknown;
  answerKey: unknown;
  updatedAt: Date;
  translations: Array<{ locale: Locale; prompt: string; explanation: string; payloadText: unknown }>;
}) {
  return {
    id: question.id,
    quizId: question.quizId,
    order: question.order,
    type: question.type,
    points: question.points,
    payload: question.payload,
    answerKey: question.answerKey,
    i18n: trMap(question.translations),
    etag: etagOf(question.updatedAt),
    updatedAt: question.updatedAt.toISOString(),
  };
}

function assertAuthoringValid(q: QuestionInput): void {
  const errors: ImportIssue[] = [];
  validateQuestion(q, "authoring", errors);
  if (errors.length > 0) {
    throw new AppError("RULE_VIOLATION", "Question failed validation", {
      details: errors.map((e) => ({ path: e.path, message: e.message })),
    });
  }
}

const questions: ResourceImpl = {
  entityType: "question",
  async list(q) {
    const rows = await prisma.question.findMany({
      where: { ...(q.cursor ? { id: { lt: q.cursor } } : {}) },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(questionDto), nextCursor };
  },
  async get(id) {
    const question = await prisma.question.findUnique({ where: { id }, include: { translations: true } });
    if (!question) throw notFound("Question");
    return questionDto(question);
  },
  async create(body, actor, now) {
    const b = parse(questionCreate, body);
    const quiz = await prisma.quiz.findUnique({ where: { id: b.quizId } });
    if (!quiz) throw notFound("Quiz");
    assertAuthoringValid(b.authoring);
    const question = await prisma.question.create({
      data: {
        id: uuidv7(),
        quizId: b.quizId,
        order: b.order,
        type: b.authoring.type,
        points: b.authoring.points,
        payload: questionPayload(b.authoring),
        answerKey: json(b.authoring.answerKey),
        translations: {
          create: Object.entries(b.authoring.i18n).map(([locale, tr]) => ({
            locale: locale as Locale,
            prompt: tr.prompt,
            explanation: tr.explanation ?? "",
            payloadText: questionPayloadText(b.authoring, locale),
          })),
        },
      },
      include: { translations: true },
    });
    await writeAudit(prisma, actor.id, "create", "question", question.id, null, { quizId: b.quizId, type: question.type }, actor.ip, now);
    return questionDto(question);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(questionPatchBody, body);
    const before = await prisma.question.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Question");
    assertIfMatch(ifMatch, before.updatedAt);
    if (b.authoring) assertAuthoringValid(b.authoring);
    const question = await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          order: b.order,
          points: b.authoring ? b.authoring.points : b.points,
          ...(b.authoring
            ? {
                type: b.authoring.type,
                payload: questionPayload(b.authoring),
                answerKey: json(b.authoring.answerKey),
              }
            : {}),
        },
      });
      if (b.authoring) {
        await tx.questionTranslation.deleteMany({ where: { questionId: id } });
        await tx.questionTranslation.createMany({
          data: Object.entries(b.authoring.i18n).map(([locale, tr]) => ({
            questionId: id,
            locale: locale as Locale,
            prompt: tr.prompt,
            explanation: tr.explanation ?? "",
            payloadText: questionPayloadText(b.authoring!, locale),
          })),
        });
      }
      return tx.question.findUniqueOrThrow({ where: { id }, include: { translations: true } });
    });
    await writeAudit(prisma, actor.id, "update", "question", id, { type: before.type }, { type: question.type }, actor.ip, now);
    return questionDto(question);
  },
  lifecycle: null,
  async remove(id, actor, now) {
    const question = await prisma.question.findUnique({
      where: { id },
      include: { _count: { select: { answers: true } }, quiz: { select: { status: true } } },
    });
    if (!question) throw notFound("Question");
    if (question._count.answers > 0) throw ruleViolation("HAS_LEARNER_DATA", "Question has answers");
    if (question.quiz.status === "PUBLISHED") throw ruleViolation("REFERENCED_BY_PUBLISHED", "Unpublish the quiz first");
    await prisma.question.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "question", id, { quizId: question.quizId }, null, actor.ip, now);
  },
};

// ── sims ─────────────────────────────────────────────────────────────────────

const simI18n = titleI18n.extend({ textBundle: z.record(z.string(), z.unknown()).default({}) });
const simCreate = z.object({
  slug: slugSchema,
  type: z.enum(["BUDGET", "LOANS", "SCAM", "BUSINESS", "INVEST"]),
  order: z.number().int().min(0).default(0),
  config: z.record(z.string(), z.unknown()),
  estimatedMinutes: z.number().int().min(1).max(120).default(10),
  xpRewardComplete: z.number().int().min(0).max(1000).default(100),
  unlockRule: z.record(z.string(), z.unknown()).nullish(),
  i18n: i18nOf(simI18n),
});
const simPatch = simCreate.partial().extend({ i18n: i18nPartialOf(simI18n).optional() });

function simDto(s: {
  id: string;
  slug: string;
  type: string;
  status: string;
  order: number;
  configVersion: number;
  config: unknown;
  estimatedMinutes: number;
  xpRewardComplete: number;
  unlockRule: unknown;
  updatedAt: Date;
  translations: Array<{ locale: Locale } & Record<string, unknown>>;
}) {
  return {
    id: s.id,
    slug: s.slug,
    type: s.type,
    status: s.status,
    order: s.order,
    configVersion: s.configVersion,
    config: s.config,
    estimatedMinutes: s.estimatedMinutes,
    xpRewardComplete: s.xpRewardComplete,
    unlockRule: s.unlockRule,
    i18n: trMap(s.translations),
    etag: etagOf(s.updatedAt),
    updatedAt: s.updatedAt.toISOString(),
  };
}

const sims: ResourceImpl = {
  entityType: "sim_definition",
  async list(q) {
    const rows = await prisma.simDefinition.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { slug: { contains: q.q } } : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(simDto), nextCursor };
  },
  async get(id) {
    const s = await prisma.simDefinition.findUnique({ where: { id }, include: { translations: true } });
    if (!s) throw notFound("Sim");
    return simDto(s);
  },
  async create(body, actor, now) {
    const b = parse(simCreate, body);
    const s = await slugGuard(() =>
      prisma.simDefinition.create({
        data: {
          id: uuidv7(),
          slug: b.slug,
          type: b.type,
          order: b.order,
          config: json(b.config),
          estimatedMinutes: b.estimatedMinutes,
          xpRewardComplete: b.xpRewardComplete,
          unlockRule: b.unlockRule ? json(b.unlockRule) : undefined,
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({
              locale: locale as Locale,
              title: tr!.title,
              subtitle: tr!.subtitle,
              description: tr!.description,
              textBundle: json(tr!.textBundle),
            })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "sim_definition", s.id, null, { slug: s.slug, type: s.type }, actor.ip, now);
    return simDto(s);
  },
  async patch(id, body, ifMatch, actor, now) {
    const b = parse(simPatch, body);
    const before = await prisma.simDefinition.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Sim");
    assertIfMatch(ifMatch, before.updatedAt);
    const s = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.simDefinition.update({
          where: { id },
          data: {
            slug: b.slug,
            order: b.order,
            estimatedMinutes: b.estimatedMinutes,
            xpRewardComplete: b.xpRewardComplete,
            ...(b.config ? { config: json(b.config), configVersion: { increment: 1 } } : {}),
            ...(b.unlockRule !== undefined ? { unlockRule: b.unlockRule === null ? Prisma.DbNull : json(b.unlockRule) } : {}),
          },
        });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          const data = {
            title: tr!.title,
            subtitle: tr!.subtitle,
            description: tr!.description,
            textBundle: json(tr!.textBundle),
          };
          await tx.simDefinitionTranslation.upsert({
            where: { simId_locale: { simId: id, locale: locale as Locale } },
            create: { simId: id, locale: locale as Locale, ...data },
            update: data,
          });
        }
        return tx.simDefinition.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "sim_definition", id, { configVersion: before.configVersion }, { configVersion: s.configVersion }, actor.ip, now);
    return simDto(s);
  },
  lifecycle: async (id, action, body, actor, now) => {
    const before = await prisma.simDefinition.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Sim");
    if (action === "publish") {
      requireChecklist(body);
      const checked = SIM_CONFIG_SCHEMAS[before.type].safeParse(before.config);
      if (!checked.success) {
        // Machine code in details[0] (ruleViolation convention), then the Zod paths.
        throw new AppError("RULE_VIOLATION", "Sim config failed validation", {
          details: [
            { path: "", message: "INVALID_SIM_CONFIG" },
            ...checked.error.issues.map((i) => ({
              path: `config.${i.path.join(".")}`,
              message: i.message,
            })),
          ],
        });
      }
      try {
        smokeSimulate(before.type, before.config as EngineJson);
      } catch (e) {
        throw new AppError("RULE_VIOLATION", "Sim smoke test failed", {
          details: [{ path: "config", message: e instanceof Error ? e.message : String(e) }],
        });
      }
    }
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const s = await prisma.simDefinition.update({ where: { id }, data: { status }, include: { translations: true } });
    await writeAudit(prisma, actor.id, action, "sim_definition", id, { status: before.status }, { status }, actor.ip, now);
    return simDto(s);
  },
  async remove(id, actor, now) {
    const s = await prisma.simDefinition.findUnique({
      where: { id },
      include: { _count: { select: { sessions: true } } },
    });
    if (!s) throw notFound("Sim");
    if (s.status !== "DRAFT" || s.configVersion > 1) throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    if (s._count.sessions > 0) throw ruleViolation("HAS_LEARNER_DATA", "Sim has sessions");
    await prisma.simDefinition.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "sim_definition", id, { slug: s.slug }, null, actor.ip, now);
  },
};

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

// ── shop-items (status but no timestamps → no etag) ──────────────────────────

const shopItemI18n = z.object({ title: z.string().trim().min(1).max(120) });
const shopItemCreate = z.object({
  code: z.string().regex(/^[A-Z0-9_]{3,40}$/),
  kind: z.enum(["STREAK_FREEZE", "AVATAR", "COSMETIC"]),
  priceCoins: z.number().int().min(1).max(100000),
  i18n: i18nOf(shopItemI18n),
});
const shopItemPatch = shopItemCreate.partial().extend({ i18n: i18nPartialOf(shopItemI18n).optional() });

function shopItemDto(s: {
  id: string;
  code: string;
  kind: string;
  priceCoins: number;
  status: string;
  translations: Array<{ locale: Locale; title: string }>;
}) {
  return { id: s.id, code: s.code, kind: s.kind, priceCoins: s.priceCoins, status: s.status, i18n: trMap(s.translations) };
}

const shopItems: ResourceImpl = {
  entityType: "shop_item",
  async list(q) {
    const rows = await prisma.shopItem.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.q ? { code: { contains: q.q.toUpperCase() } } : {}),
      },
      include: { translations: true },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const { page, nextCursor } = pageOf(rows, q.limit);
    return { data: page.map(shopItemDto), nextCursor };
  },
  async get(id) {
    const s = await prisma.shopItem.findUnique({ where: { id }, include: { translations: true } });
    if (!s) throw notFound("Shop item");
    return shopItemDto(s);
  },
  async create(body, actor, now) {
    const b = parse(shopItemCreate, body);
    const s = await slugGuard(() =>
      prisma.shopItem.create({
        data: {
          id: uuidv7(),
          code: b.code,
          kind: b.kind,
          priceCoins: b.priceCoins,
          status: "DRAFT",
          translations: {
            create: Object.entries(b.i18n).map(([locale, tr]) => ({ locale: locale as Locale, title: tr!.title })),
          },
        },
        include: { translations: true },
      }),
    );
    await writeAudit(prisma, actor.id, "create", "shop_item", s.id, null, { code: s.code }, actor.ip, now);
    return shopItemDto(s);
  },
  async patch(id, body, _ifMatch, actor, now) {
    const b = parse(shopItemPatch, body);
    const before = await prisma.shopItem.findUnique({ where: { id }, include: { translations: true } });
    if (!before) throw notFound("Shop item");
    const s = await slugGuard(() =>
      prisma.$transaction(async (tx) => {
        await tx.shopItem.update({ where: { id }, data: { code: b.code, kind: b.kind, priceCoins: b.priceCoins } });
        for (const [locale, tr] of Object.entries(b.i18n ?? {})) {
          await tx.shopItemTranslation.upsert({
            where: { itemId_locale: { itemId: id, locale: locale as Locale } },
            create: { itemId: id, locale: locale as Locale, title: tr!.title },
            update: { title: tr!.title },
          });
        }
        return tx.shopItem.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      }),
    );
    await writeAudit(prisma, actor.id, "update", "shop_item", id, shopItemDto(before), shopItemDto(s), actor.ip, now);
    return shopItemDto(s);
  },
  lifecycle: async (id, action, _body, actor, now) => {
    const before = await prisma.shopItem.findUnique({ where: { id } });
    if (!before) throw notFound("Shop item");
    const status = action === "publish" ? "PUBLISHED" : action === "unpublish" ? "DRAFT" : "ARCHIVED";
    const s = await prisma.shopItem.update({ where: { id }, data: { status }, include: { translations: true } });
    await writeAudit(prisma, actor.id, action, "shop_item", id, { status: before.status }, { status }, actor.ip, now);
    return shopItemDto(s);
  },
  async remove(id, actor, now) {
    const s = await prisma.shopItem.findUnique({ where: { id }, include: { _count: { select: { purchases: true } } } });
    if (!s) throw notFound("Shop item");
    if (s._count.purchases > 0) throw ruleViolation("HAS_LEARNER_DATA", "Item has purchases");
    if (s.status !== "DRAFT") throw ruleViolation("EVER_PUBLISHED", "Archive instead of deleting");
    await prisma.shopItem.delete({ where: { id } });
    await writeAudit(prisma, actor.id, "delete", "shop_item", id, { code: s.code }, null, actor.ip, now);
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
  authorName: z.string().trim().min(1).max(80).default("MoneyLab"),
  relatedCourseId: z.string().nullish(),
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
  relatedCourseId: string | null;
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
    relatedCourseId: a.relatedCourseId,
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
    if (b.relatedCourseId) {
      const course = await prisma.course.findUnique({ where: { id: b.relatedCourseId } });
      if (!course) throw notFound("Course");
    }
    const a = await slugGuard(() =>
      prisma.article.create({
        data: {
          id: uuidv7(),
          slug: b.slug,
          category: b.category,
          coverImageUrl: b.coverImageUrl ?? null,
          readMinutes: b.readMinutes,
          authorName: b.authorName,
          relatedCourseId: b.relatedCourseId ?? null,
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
            relatedCourseId: b.relatedCourseId,
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
  tracks,
  courses,
  modules,
  lessons,
  quizzes,
  questions,
  sims,
  badges,
  "shop-items": shopItems,
  surveys,
  articles,
};

export function resourceFor(key: AdminResourceKey): ResourceImpl {
  return REGISTRY[key];
}
