import { z } from "zod";

// Content authoring schemas - doc 05. Shared by importer and admin CMS.

export const localeSchema = z.literal("vi");
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be kebab-case")
  .min(2)
  .max(60);

const httpsUrl = z.string().url().startsWith("https://");
const optionKey = z.string().regex(/^[a-z0-9_]{1,20}$/);

// ── Questions - doc 05 §4 ────────────────────────────────────────────────────

const questionI18n = z.record(
  localeSchema,
  z.object({
    prompt: z.string().min(3).max(1000),
    explanation: z.string().min(3).max(2000), // required - where the teaching happens
    optionsText: z.record(optionKey, z.string().max(400)).optional(),
    scenarioMd: z.string().max(2000).optional(),
    feedback: z.record(optionKey, z.string().max(600)).optional(),
    leftText: z.record(optionKey, z.string().max(200)).optional(),
    rightText: z.record(optionKey, z.string().max(200)).optional(),
    itemsText: z.record(optionKey, z.string().max(200)).optional(),
  }),
);

const questionBase = { points: z.number().int().min(1).max(10).default(1), i18n: questionI18n };

export const singleChoiceQ = z.object({
  ...questionBase,
  type: z.literal("SINGLE_CHOICE"),
  options: z.array(optionKey).min(2).max(6),
  answerKey: z.object({ correct: optionKey }),
});

export const multiChoiceQ = z.object({
  ...questionBase,
  type: z.literal("MULTI_CHOICE"),
  options: z.array(optionKey).min(3).max(8),
  answerKey: z.object({ correct: z.array(optionKey).min(1) }),
});

export const trueFalseQ = z.object({
  ...questionBase,
  type: z.literal("TRUE_FALSE"),
  answerKey: z.object({ correct: z.boolean() }),
});

export const numericQ = z.object({
  ...questionBase,
  type: z.literal("NUMERIC"),
  unit: z.enum(["VND", "%", "months"]).optional(),
  inputHint: z.string().max(100).optional(),
  answerKey: z.object({
    value: z.string().regex(/^-?\d+$/),
    toleranceAbs: z.string().regex(/^\d+$/).optional(),
    toleranceBps: z.number().int().min(0).max(10000).optional(),
  }),
});

export const orderingQ = z.object({
  ...questionBase,
  type: z.literal("ORDERING"),
  items: z.array(optionKey).min(3).max(6),
  answerKey: z.object({ order: z.array(optionKey).min(3).max(6) }),
});

export const matchingQ = z.object({
  ...questionBase,
  type: z.literal("MATCHING"),
  left: z.array(optionKey).min(3).max(5),
  right: z.array(optionKey).min(3).max(5),
  answerKey: z.object({ pairs: z.record(optionKey, optionKey) }),
});

export const scenarioChoiceQ = z.object({
  ...questionBase,
  type: z.literal("SCENARIO_CHOICE"),
  options: z.array(optionKey).min(2).max(6),
  answerKey: z.object({ best: optionKey, acceptable: z.array(optionKey).default([]) }),
});

export const questionSchema = z.discriminatedUnion("type", [
  singleChoiceQ,
  multiChoiceQ,
  trueFalseQ,
  numericQ,
  orderingQ,
  matchingQ,
  scenarioChoiceQ,
]);
export type QuestionInput = z.infer<typeof questionSchema>;

// ── Blocks - doc 05 §3 ───────────────────────────────────────────────────────

/**
 * Inline check question. Deliberately narrower than `questionSchema`: this one
 * is graded by the lesson check endpoint, which needs a
 * stable `id` to look the block up by and a flat `explanation`, and the block
 * renderer can only collect answers for the three types below. Graded quizzes
 * keep the full `questionSchema`.
 */
export const inlineQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    id: slugSchema,
    type: z.literal("SINGLE_CHOICE"),
    prompt: z.string().min(3).max(500),
    options: z.array(z.object({ key: optionKey, text: z.string().min(1).max(300) })).min(2).max(6),
    answerKey: z.object({ correct: optionKey }),
    explanation: z.string().min(3).max(800),
  }),
  z.object({
    id: slugSchema,
    type: z.literal("MULTI_CHOICE"),
    prompt: z.string().min(3).max(500),
    options: z.array(z.object({ key: optionKey, text: z.string().min(1).max(300) })).min(3).max(6),
    answerKey: z.object({ correct: z.array(optionKey).min(1) }),
    explanation: z.string().min(3).max(800),
  }),
  z.object({
    id: slugSchema,
    type: z.literal("TRUE_FALSE"),
    prompt: z.string().min(3).max(500),
    answerKey: z.object({ correct: z.boolean() }),
    explanation: z.string().min(3).max(800),
  }),
]);
export type InlineQuestionInput = z.infer<typeof inlineQuestionSchema>;

/**
 * The one block vocabulary. Authored JSON, the admin editor, the database
 * column and `LessonBlocks` all speak exactly this, and `Block` in
 * src/lib/types.ts mirrors it. Text fields are plain text, not Markdown: the
 * renderer prints them as written, so a block is what it says it is.
 */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HEADING"),
    text: z.string().min(1).max(200),
    level: z.union([z.literal(2), z.literal(3)]).optional(),
  }),
  z.object({ type: z.literal("PARAGRAPH"), text: z.string().min(1).max(2000) }),
  z.object({
    type: z.literal("LIST"),
    ordered: z.boolean().optional(),
    items: z.array(z.string().min(1).max(400)).min(2).max(12),
  }),
  z.object({
    type: z.literal("CALLOUT"),
    variant: z.enum(["INFO", "WARNING", "TIP"]).optional(),
    title: z.string().max(120).optional(),
    text: z.string().min(1).max(800),
  }),
  z.object({
    type: z.literal("IMAGE"),
    url: httpsUrl,
    alt: z.string().min(1).max(300),
    caption: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("VIDEO"),
    url: httpsUrl,
    caption: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("TABLE"),
    headers: z.array(z.string().max(80)).min(1).max(6),
    rows: z.array(z.array(z.string().max(200)).min(1).max(6)).min(1).max(20),
    caption: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("KEY_TERM"),
    term: z.string().min(1).max(120),
    definition: z.string().min(1).max(800),
  }),
  z.object({
    type: z.literal("EXAMPLE"),
    title: z.string().max(120).optional(),
    text: z.string().min(1).max(1200),
  }),
  z.object({ type: z.literal("CHECK_QUESTION"), question: inlineQuestionSchema }),
  z.object({
    type: z.literal("CALCULATOR"),
    tool: slugSchema,
    presets: z.record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()])).optional(),
  }),
  z.object({
    type: z.literal("SIM_LINK"),
    simSlug: slugSchema,
    label: z.string().max(120).optional(),
  }),
  z.object({ type: z.literal("DIVIDER") }),
]);
export type BlockInput = z.infer<typeof blockSchema>;

// ── Quiz / Lesson / Course / Bundle - doc 05 §1–2 ────────────────────────────

export const quizSchema = z.object({
  kind: z.enum(["LESSON_CHECK", "COURSE_FINAL", "PLACEMENT"]),
  passThresholdPct: z.number().int().min(0).max(100).default(70),
  maxAttempts: z.number().int().min(1).max(10).nullable().default(null),
  timeLimitSec: z.number().int().min(30).max(3600).nullable().default(null),
  shuffleQuestions: z.boolean().default(true),
  questions: z.array(questionSchema).min(1).max(30),
});
export type QuizInput = z.infer<typeof quizSchema>;

export const lessonSchema = z.object({
  slug: slugSchema,
  order: z.number().int().min(1),
  moduleSlug: slugSchema.nullable().default(null),
  estimatedMinutes: z.number().int().min(1).max(60).default(6),
  xpReward: z.number().int().min(5).max(100).default(20),
  i18n: z.record(
    localeSchema,
    z.object({
      title: z.string().min(2).max(120),
      summary: z.string().max(400).default(""),
      blocks: z.array(blockSchema).min(1).max(30),
    }),
  ),
  checkQuiz: quizSchema.nullable().default(null),
});
export type LessonInput = z.infer<typeof lessonSchema>;

export const bundleSchema = z.object({
  $schema: z.literal("moneylab-content-v1"),
  track: z.object({
    slug: slugSchema,
    order: z.number().int().min(1),
    iconKey: z.string().max(40).optional(),
    i18n: z.record(
      localeSchema,
      z.object({
        title: z.string().min(2).max(80),
        subtitle: z.string().max(200).default(""),
        description: z.string().max(1000).default(""),
      }),
    ),
  }),
  course: z.object({
    slug: slugSchema,
    order: z.number().int().min(1),
    level: z.number().int().min(1).max(3).default(1),
    estimatedMinutes: z.number().int().min(5).max(600).default(30),
    xpReward: z.number().int().min(10).max(500).default(50),
    coverImageUrl: httpsUrl.optional(),
    i18n: z.record(
      localeSchema,
      z.object({
        title: z.string().min(2).max(120),
        subtitle: z.string().max(200).default(""),
        description: z.string().max(2000).default(""),
        learningObjectives: z.array(z.string().max(200)).max(10).default([]),
      }),
    ),
    modules: z
      .array(
        z.object({
          slug: slugSchema,
          order: z.number().int().min(1),
          i18n: z.record(localeSchema, z.object({ title: z.string().min(2).max(120) })),
        }),
      )
      .default([]),
    lessons: z.array(lessonSchema).min(1).max(30),
    finalQuiz: quizSchema.nullable().default(null),
  }),
});
export type BundleInput = z.infer<typeof bundleSchema>;
