import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import {
  bundleSchema,
  type BundleInput,
  type LessonInput,
  type QuizInput,
  type QuestionInput,
  type InlineQuestionInput,
  type BlockInput,
} from "@/server/schemas/content";
import type { Locale, Prisma } from "@prisma/client";

// Importer - doc 05 §6. Reports ALL errors (no fail-fast). Upserts by slug; never deletes.

export interface ImportIssue {
  path: string;
  message: string;
}

export interface ImportReport {
  ok: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  summary: {
    trackSlug: string | null;
    courseSlug: string | null;
    modules: number;
    lessons: number;
    quizzes: number;
    questions: number;
  };
}

function questionOptionKeys(q: QuestionInput): string[] {
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
    case "SCENARIO_CHOICE":
      return q.options;
    case "ORDERING":
      return q.items;
    case "MATCHING":
      return [...q.left, ...q.right];
    default:
      return [];
  }
}

export function validateQuestion(q: QuestionInput, path: string, errors: ImportIssue[]): void {
  // §6 step 5 - answerKey consistency
  switch (q.type) {
    case "SINGLE_CHOICE":
      if (!q.options.includes(q.answerKey.correct))
        errors.push({ path, message: `answerKey.correct "${q.answerKey.correct}" not in options` });
      break;
    case "MULTI_CHOICE":
      for (const k of q.answerKey.correct)
        if (!q.options.includes(k))
          errors.push({ path, message: `answerKey.correct "${k}" not in options` });
      break;
    case "ORDERING": {
      const sorted = [...q.answerKey.order].sort();
      const items = [...q.items].sort();
      if (JSON.stringify(sorted) !== JSON.stringify(items))
        errors.push({ path, message: "answerKey.order must be a permutation of items" });
      break;
    }
    case "MATCHING": {
      const leftKeys = Object.keys(q.answerKey.pairs);
      if (leftKeys.length !== q.left.length)
        errors.push({ path, message: "answerKey.pairs must map every left key" });
      for (const [l, r] of Object.entries(q.answerKey.pairs)) {
        if (!q.left.includes(l)) errors.push({ path, message: `pair left key "${l}" not in left` });
        if (typeof r !== "string" || !q.right.includes(r))
          errors.push({ path, message: `pair right key "${String(r)}" not in right` });
      }
      break;
    }
    case "SCENARIO_CHOICE":
      if (!q.options.includes(q.answerKey.best))
        errors.push({ path, message: `answerKey.best "${q.answerKey.best}" not in options` });
      for (const k of q.answerKey.acceptable)
        if (!q.options.includes(k))
          errors.push({ path, message: `answerKey.acceptable "${k}" not in options` });
      break;
    default:
      break;
  }
  // i18n text coverage for option keys
  for (const [loc, t] of Object.entries(q.i18n)) {
    const keys = questionOptionKeys(q);
    if (keys.length > 0 && q.type !== "MATCHING" && q.type !== "ORDERING") {
      for (const k of "options" in q ? q.options : []) {
        if (!t.optionsText?.[k])
          errors.push({ path, message: `i18n.${loc}.optionsText missing key "${k}"` });
      }
    }
    if (q.type === "ORDERING")
      for (const k of q.items)
        if (!t.itemsText?.[k])
          errors.push({ path, message: `i18n.${loc}.itemsText missing key "${k}"` });
    if (q.type === "MATCHING") {
      for (const k of q.left)
        if (!t.leftText?.[k])
          errors.push({ path, message: `i18n.${loc}.leftText missing key "${k}"` });
      for (const k of q.right)
        if (!t.rightText?.[k])
          errors.push({ path, message: `i18n.${loc}.rightText missing key "${k}"` });
    }
    if (q.type === "SCENARIO_CHOICE") {
      if (!t.scenarioMd) errors.push({ path, message: `i18n.${loc}.scenarioMd is required` });
      for (const k of q.options)
        if (!t.feedback?.[k])
          errors.push({ path, message: `i18n.${loc}.feedback missing key "${k}"` });
    }
  }
}

/** An inline check must point its answer key at options that actually exist. */
function validateInlineQuestion(
  q: InlineQuestionInput,
  path: string,
  errors: ImportIssue[],
): void {
  if (q.type === "TRUE_FALSE") return;
  const keys = new Set(q.options.map((o) => o.key));
  if (keys.size !== q.options.length) errors.push({ path, message: "duplicate option key" });
  const correct = q.type === "MULTI_CHOICE" ? q.answerKey.correct : [q.answerKey.correct];
  for (const k of correct)
    if (!keys.has(k)) errors.push({ path, message: `answerKey references unknown option "${k}"` });
}

function validateQuiz(quiz: QuizInput, path: string, errors: ImportIssue[]): void {
  quiz.questions.forEach((q, i) => validateQuestion(q, `${path}.questions[${i}]`, errors));
}

function lessonWarnings(lesson: LessonInput, path: string, warnings: ImportIssue[]): void {
  for (const [loc, t] of Object.entries(lesson.i18n)) {
    const blocks = t.blocks;
    if (blocks.length < 5 || blocks.length > 12)
      warnings.push({ path: `${path}.i18n.${loc}`, message: `${blocks.length} blocks (5–12 recommended)` });
    if (!blocks.some((b) => b.type === "CHECK_QUESTION"))
      warnings.push({ path: `${path}.i18n.${loc}`, message: "no CHECK_QUESTION block" });
    if (!blocks.some((b) => b.type === "VIDEO"))
      warnings.push({ path: `${path}.i18n.${loc}`, message: "no VIDEO block" });
    for (let i = 1; i < blocks.length; i++) {
      const a = blocks[i - 1]!;
      const b = blocks[i]!;
      if (a.type === "PARAGRAPH" && b.type === "PARAGRAPH" && a.text.length + b.text.length > 1200)
        warnings.push({
          path: `${path}.i18n.${loc}.blocks[${i}]`,
          message: "two consecutive PARAGRAPH blocks > 1200 chars combined",
        });
    }
  }
}

export async function validateBundle(raw: unknown): Promise<{
  bundle: BundleInput | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  // §6 step 2 - Zod shape
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      bundle: null,
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      warnings,
    };
  }
  const bundle = parsed.data;
  const { course } = bundle;

  // §6 step 3 - slug uniqueness within bundle
  const lessonSlugs = new Set<string>();
  course.lessons.forEach((l, i) => {
    if (lessonSlugs.has(l.slug))
      errors.push({ path: `course.lessons[${i}]`, message: `duplicate lesson slug "${l.slug}"` });
    lessonSlugs.add(l.slug);
  });
  const moduleSlugs = new Set<string>();
  course.modules.forEach((m, i) => {
    if (moduleSlugs.has(m.slug))
      errors.push({ path: `course.modules[${i}]`, message: `duplicate module slug "${m.slug}"` });
    moduleSlugs.add(m.slug);
  });

  // §6 step 4 - cross-refs
  const simSlugs = new Set(
    (await prisma.simDefinition.findMany({ select: { slug: true } })).map((s) => s.slug),
  );
  course.lessons.forEach((l, i) => {
    if (l.moduleSlug && !moduleSlugs.has(l.moduleSlug))
      errors.push({
        path: `course.lessons[${i}]`,
        message: `moduleSlug "${l.moduleSlug}" not declared in modules`,
      });
    for (const [loc, t] of Object.entries(l.i18n)) {
      // Inline check ids are the lookup key for the grading endpoint, so they
      // have to be unique within the lesson or one question shadows another.
      const checkIds = new Set<string>();
      t.blocks.forEach((b: BlockInput, bi: number) => {
        const path = `course.lessons[${i}].i18n.${loc}.blocks[${bi}]`;
        if (b.type === "SIM_LINK" && !simSlugs.has(b.simSlug))
          errors.push({ path, message: `simSlug "${b.simSlug}" does not exist` });
        if (b.type === "CHECK_QUESTION") {
          if (checkIds.has(b.question.id))
            errors.push({ path, message: `duplicate check question id "${b.question.id}"` });
          checkIds.add(b.question.id);
          validateInlineQuestion(b.question, `${path}.question`, errors);
        }
      });
    }
    // §6 step 5
    if (l.checkQuiz) validateQuiz(l.checkQuiz, `course.lessons[${i}].checkQuiz`, errors);
  });
  if (course.finalQuiz) validateQuiz(course.finalQuiz, "course.finalQuiz", errors);

  // §6 step 7 - warnings
  course.lessons.forEach((l, i) => lessonWarnings(l, `course.lessons[${i}]`, warnings));

  return { bundle, errors, warnings };
}

export function questionPayload(q: QuestionInput): Prisma.InputJsonValue {
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return { options: q.options };
    case "SCENARIO_CHOICE":
      return { options: q.options };
    case "NUMERIC":
      return { unit: q.unit ?? null, inputHint: q.inputHint ?? null };
    case "ORDERING":
      return { items: q.items };
    case "MATCHING":
      return { left: q.left, right: q.right };
    case "TRUE_FALSE":
      return {};
  }
}

export function questionPayloadText(q: QuestionInput, loc: string): Prisma.InputJsonValue {
  const t = q.i18n[loc as Locale];
  if (!t) return {};
  return {
    ...(t.optionsText ? { optionsText: t.optionsText } : {}),
    ...(t.scenarioMd ? { scenarioMd: t.scenarioMd } : {}),
    ...(t.feedback ? { feedback: t.feedback } : {}),
    ...(t.leftText ? { leftText: t.leftText } : {}),
    ...(t.rightText ? { rightText: t.rightText } : {}),
    ...(t.itemsText ? { itemsText: t.itemsText } : {}),
  };
}

async function upsertQuiz(
  tx: Prisma.TransactionClient,
  quiz: QuizInput,
  existingQuizId: string | null,
): Promise<string> {
  let quizId = existingQuizId;
  if (quizId) {
    await tx.quiz.update({
      where: { id: quizId },
      data: {
        kind: quiz.kind,
        passThresholdPct: quiz.passThresholdPct,
        maxAttempts: quiz.maxAttempts,
        timeLimitSec: quiz.timeLimitSec,
        shuffleQuestions: quiz.shuffleQuestions,
        contentVersion: { increment: 1 },
      },
    });
    await tx.question.deleteMany({ where: { quizId } });
  } else {
    quizId = uuidv7();
    await tx.quiz.create({
      data: {
        id: quizId,
        kind: quiz.kind,
        status: "DRAFT",
        passThresholdPct: quiz.passThresholdPct,
        maxAttempts: quiz.maxAttempts,
        timeLimitSec: quiz.timeLimitSec,
        shuffleQuestions: quiz.shuffleQuestions,
      },
    });
  }
  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i]!;
    const questionId = uuidv7();
    await tx.question.create({
      data: {
        id: questionId,
        quizId,
        order: i + 1,
        type: q.type,
        points: q.points,
        payload: questionPayload(q),
        answerKey: q.answerKey as Prisma.InputJsonValue,
      },
    });
    for (const [loc, t] of Object.entries(q.i18n)) {
      await tx.questionTranslation.create({
        data: {
          questionId,
          locale: loc as Locale,
          prompt: t.prompt,
          explanation: t.explanation,
          payloadText: questionPayloadText(q, loc),
        },
      });
    }
  }
  return quizId;
}

/** Apply a validated bundle. Upsert-by-slug; content stays DRAFT until published via admin. */
export async function applyBundle(bundle: BundleInput): Promise<{
  trackId: string;
  courseId: string;
  lessons: number;
  quizzes: number;
  questions: number;
}> {
  let quizzes = 0;
  let questions = 0;

  return prisma.$transaction(
    async (tx) => {
      // Track
      let track = await tx.track.findUnique({ where: { slug: bundle.track.slug } });
      if (!track) {
        track = await tx.track.create({
          data: {
            id: uuidv7(),
            slug: bundle.track.slug,
            order: bundle.track.order,
            iconKey: bundle.track.iconKey,
          },
        });
      } else {
        track = await tx.track.update({
          where: { id: track.id },
          data: { order: bundle.track.order, iconKey: bundle.track.iconKey ?? track.iconKey },
        });
      }
      for (const [loc, t] of Object.entries(bundle.track.i18n)) {
        await tx.trackTranslation.upsert({
          where: { trackId_locale: { trackId: track.id, locale: loc as Locale } },
          create: { trackId: track.id, locale: loc as Locale, ...t },
          update: t,
        });
      }

      // Course
      const c = bundle.course;
      let course = await tx.course.findUnique({ where: { slug: c.slug } });
      const courseData = {
        trackId: track.id,
        order: c.order,
        level: c.level,
        estimatedMinutes: c.estimatedMinutes,
        xpReward: c.xpReward,
        coverImageUrl: c.coverImageUrl ?? null,
      };
      if (!course) {
        course = await tx.course.create({ data: { id: uuidv7(), slug: c.slug, ...courseData } });
      } else {
        course = await tx.course.update({ where: { id: course.id }, data: courseData });
      }
      for (const [loc, t] of Object.entries(c.i18n)) {
        await tx.courseTranslation.upsert({
          where: { courseId_locale: { courseId: course.id, locale: loc as Locale } },
          create: { courseId: course.id, locale: loc as Locale, ...t },
          update: t,
        });
      }

      // Modules
      const moduleIdBySlug = new Map<string, string>();
      for (const m of c.modules) {
        const existing = await tx.module.findUnique({
          where: { courseId_slug: { courseId: course.id, slug: m.slug } },
        });
        const mod = existing
          ? await tx.module.update({ where: { id: existing.id }, data: { order: m.order } })
          : await tx.module.create({
              data: { id: uuidv7(), courseId: course.id, slug: m.slug, order: m.order },
            });
        moduleIdBySlug.set(m.slug, mod.id);
        for (const [loc, t] of Object.entries(m.i18n)) {
          await tx.moduleTranslation.upsert({
            where: { moduleId_locale: { moduleId: mod.id, locale: loc as Locale } },
            create: { moduleId: mod.id, locale: loc as Locale, title: t.title },
            update: { title: t.title },
          });
        }
      }

      // Lessons
      for (const l of c.lessons) {
        const existing = await tx.lesson.findUnique({
          where: { courseId_slug: { courseId: course.id, slug: l.slug } },
        });
        let checkQuizId = existing?.checkQuizId ?? null;
        if (l.checkQuiz) {
          checkQuizId = await upsertQuiz(tx, l.checkQuiz, checkQuizId);
          quizzes++;
          questions += l.checkQuiz.questions.length;
        }
        const lessonData = {
          moduleId: l.moduleSlug ? (moduleIdBySlug.get(l.moduleSlug) ?? null) : null,
          order: l.order,
          estimatedMinutes: l.estimatedMinutes,
          xpReward: l.xpReward,
          checkQuizId,
        };
        const lesson = existing
          ? await tx.lesson.update({
              where: { id: existing.id },
              data: { ...lessonData, contentVersion: { increment: 1 } },
            })
          : await tx.lesson.create({
              data: { id: uuidv7(), courseId: course.id, slug: l.slug, ...lessonData },
            });
        for (const [loc, t] of Object.entries(l.i18n)) {
          await tx.lessonTranslation.upsert({
            where: { lessonId_locale: { lessonId: lesson.id, locale: loc as Locale } },
            create: {
              lessonId: lesson.id,
              locale: loc as Locale,
              title: t.title,
              summary: t.summary,
              blocks: t.blocks as Prisma.InputJsonValue,
            },
            update: {
              title: t.title,
              summary: t.summary,
              blocks: t.blocks as Prisma.InputJsonValue,
            },
          });
        }
      }

      // Final quiz
      if (c.finalQuiz) {
        const finalQuizId = await upsertQuiz(tx, c.finalQuiz, course.finalQuizId);
        quizzes++;
        questions += c.finalQuiz.questions.length;
        await tx.course.update({ where: { id: course.id }, data: { finalQuizId } });
      }

      return {
        trackId: track.id,
        courseId: course.id,
        lessons: c.lessons.length,
        quizzes,
        questions,
      };
    },
    { timeout: 60_000 },
  );
}

export async function importBundle(raw: unknown, dryRun: boolean): Promise<ImportReport> {
  const { bundle, errors, warnings } = await validateBundle(raw);
  const summary = {
    trackSlug: bundle?.track.slug ?? null,
    courseSlug: bundle?.course.slug ?? null,
    modules: bundle?.course.modules.length ?? 0,
    lessons: bundle?.course.lessons.length ?? 0,
    quizzes: 0,
    questions: 0,
  };
  if (!bundle || errors.length > 0) return { ok: false, errors, warnings, summary };
  if (dryRun) return { ok: true, errors, warnings, summary };
  const applied = await applyBundle(bundle);
  return {
    ok: true,
    errors,
    warnings,
    summary: { ...summary, quizzes: applied.quizzes, questions: applied.questions },
  };
}
