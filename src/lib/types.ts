/**
 * Client-side DTOs, mirroring doc 03 §0. Money fields are decimal strings of
 * đồng and must be rendered with formatVnd, never parsed as numbers.
 */

import type { Locale } from "@/lib/locale";

export type { Locale };
export type Role = "LEARNER" | "ADMIN";
export type ProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type SimType = "BUDGET" | "LOANS" | "SCAM" | "BUSINESS" | "INVEST";

export interface UserPublic {
  id: string;
  displayName: string;
  avatarKey: string | null;
  level: number;
  isMinor?: true;
}

export interface Me {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  avatarKey: string | null;
  role: Role;
  birthYear: number | null;
  province: string | null;
  localePref: Locale;
  onboardedAt: string | null;
  createdAt: string;
}

export interface Stats {
  xpTotal: number;
  level: number;
  xpForNextLevel: number;
  coins: number;
  streakCurrent: number;
  streakLongest: number;
  streakFreezes: number;
  lessonsCompleted: number;
  quizzesPassed: number;
  simsCompleted: number;
}

export interface DailyQuest {
  id: string;
  questDate: string;
  code: string;
  title: string;
  targetInt: number;
  progressInt: number;
  completedAt: string | null;
  xpReward: number;
  coinReward: number;
}

/** GET /me/quests/today */
export interface QuestsToday {
  questDate: string;
  quests: DailyQuest[];
}

export interface Bootstrap {
  user: Me;
  stats: Stats;
  featureFlags: Record<string, boolean>;
  dailyQuests: DailyQuest[];
  activeSimSessions: Array<{ sessionId: string; simSlug: string; simType: SimType; turnNumber: number }>;
  continueLearning: {
    lessonId: string;
    lessonSlug: string;
    courseSlug: string;
    lastBlockIndex: number;
  } | null;
  unreadBadges: Array<{ code: string; title: string }>;
}

export interface TrackSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  iconKey: string | null;
  order: number;
  courseCount: number;
  resolvedLocale: Locale;
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  level: 1 | 2 | 3;
  estimatedMinutes: number;
  order: number;
  lessonCount: number;
  xpReward: number;
  progress?: { status: ProgressStatus; completedLessons: number };
}

export interface LessonSummary {
  id: string;
  slug: string;
  title: string;
  order: number;
  estimatedMinutes: number;
  xpReward: number;
  hasCheckQuiz: boolean;
  /** Which glyphs the syllabus row shows, derived server side from the blocks. */
  media: { video: boolean; sim: boolean };
  progress?: { status: ProgressStatus; lastBlockIndex: number };
}

export interface CourseDetail extends CourseSummary {
  description: string | null;
  learningObjectives: string[];
  modules: Array<{ id: string; slug: string; title: string; order: number; lessons: LessonSummary[] }>;
  unmoduledLessons: LessonSummary[];
  finalQuiz: { id: string; questionCount: number; passThresholdPct: number } | null;
}

export type ArticleCategory = "GUIDE" | "EXPLAINER" | "NEWS" | "STORY";

/** One row of the library list, doc 03 §12. Mirrors libraryService.ArticleSummary. */
export interface ArticleSummary {
  id: string;
  slug: string;
  category: ArticleCategory;
  coverImageUrl: string | null;
  readMinutes: number;
  publishedAt: string | null;
  authorName: string;
  title: string;
  summary: string;
  resolvedLocale: Locale;
}

/**
 * The inline check question carried by a CHECK_QUESTION block. `answerKey` is
 * stripped server side before the block reaches the browser, so the client type
 * has no field for it: grading goes through
 * POST /catalog/lessons/:slug/check/:questionId.
 */
export interface InlineQuestion {
  id: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE";
  prompt: string;
  options?: Array<{ key: string; text: string }>;
}

/**
 * Lesson and article content blocks, doc 05 §3. Mirrors `blockSchema` in
 * src/server/schemas/content.ts, which is what the database stores. Rendered by
 * src/components/lesson/Blocks.tsx.
 */
export type Block =
  | { type: "HEADING"; text: string; level?: 2 | 3 }
  | { type: "PARAGRAPH"; text: string }
  | { type: "LIST"; ordered?: boolean; items: string[] }
  | { type: "CALLOUT"; variant?: "INFO" | "WARNING" | "TIP"; title?: string; text: string }
  | { type: "IMAGE"; url: string; alt: string; caption?: string }
  | { type: "VIDEO"; url: string; caption?: string }
  | { type: "TABLE"; headers: string[]; rows: string[][]; caption?: string }
  | { type: "KEY_TERM"; term: string; definition: string }
  | { type: "EXAMPLE"; title?: string; text: string }
  | { type: "CHECK_QUESTION"; question: InlineQuestion }
  | { type: "CALCULATOR"; tool: string; presets?: Record<string, unknown> }
  | { type: "SIM_LINK"; simSlug: string; label?: string }
  | { type: "DIVIDER" };

export interface LessonLink {
  slug: string;
  title: string;
}

export interface LessonDetail {
  id: string;
  slug: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  /** 1-based place in the published lesson order, for the sticky reader bar. */
  position: number;
  lessonCount: number;
  prev: LessonLink | null;
  next: LessonLink | null;
  title: string;
  summary: string | null;
  estimatedMinutes: number;
  xpReward: number;
  contentVersion: number;
  blocks: Block[];
  checkQuiz: { id: string; questionCount: number; passThresholdPct: number } | null;
  resolvedLocale: Locale;
  progress?: { status: ProgressStatus; lastBlockIndex: number };
}

export type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "TRUE_FALSE"
  | "NUMERIC"
  | "ORDERING"
  | "MATCHING"
  | "SCENARIO_CHOICE";

export interface QuestionPublic {
  id: string;
  order: number;
  type: QuestionType;
  points: number;
  prompt: string;
  payload: Record<string, unknown>;
}

export interface AttemptState {
  id: string;
  quizId: string;
  attemptNumber: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
  questionOrder: string[];
  startedAt: string;
  expiresAt: string | null;
  answers: Array<{ questionId: string; response: unknown }>;
  questions?: QuestionPublic[];
  result?: {
    scorePoints: number;
    maxPoints: number;
    scorePct: number;
    passed: boolean;
    perQuestion: Array<{
      questionId: string;
      isCorrect: boolean;
      pointsAwarded: number;
      correctResponse: unknown;
      explanation: string | null;
    }>;
  };
}

export interface SimDefinitionSummary {
  id: string;
  slug: string;
  type: SimType;
  title: string;
  subtitle: string | null;
  estimatedMinutes: number;
  xpRewardComplete: number;
  order: number;
  locked: boolean;
  lockReason: string | null;
  activeSessionId: string | null;
}

export interface SimDefinitionDetail extends SimDefinitionSummary {
  description: string | null;
  howToPlay: string[];
}

export interface ActionDescriptor {
  type: string;
  schema: Record<string, unknown>;
}

export interface SimSessionView<V = Record<string, unknown>> {
  id: string;
  simId: string;
  simType: SimType;
  status: "ACTIVE" | "COMPLETED" | "FAILED" | "ABANDONED";
  turnNumber: number;
  stateVersion: number;
  startedAt: string;
  endedAt: string | null;
  view: V;
  availableActions: ActionDescriptor[];
  summary?: Record<string, unknown>;
  turnReport?: Record<string, unknown>;
  meta: { disclaimer: "simulated" };
  awards?: Awards;
}

export interface Awards {
  xp: number;
  coins: number;
  badges: Array<{ code: string; title: string }>;
  questProgress: Array<{ code: string; progressInt: number; targetInt: number; completed: boolean }>;
  streak: { current: number; extendedToday: boolean };
  levelUp: { from: number; to: number } | null;
}

export interface GamifiedResult {
  awards: Awards;
}

/** GET /me/badges returns every badge, earned ones carrying earnedAt. */
export interface BadgeView {
  id: string;
  code: string;
  kind: string;
  iconKey: string | null;
  coinReward: number;
  title: string;
  description: string;
  earnedAt: string | null;
}

export interface LeaderboardWeekly {
  weekStart: string;
  entries: Array<{ rank: number; user: UserPublic; xpEarned: number; isMe: boolean }>;
  me: { rank: number; xpEarned: number } | null;
}

export interface ShopItem {
  id: string;
  code: string;
  kind: string;
  title: string;
  description?: string | null;
  priceCoins: number;
  iconKey?: string | null;
  owned: boolean;
  /** How many the learner already holds, for consumables such as streak freezes. */
  held: number;
}

/** GET /shop/items carries the coin balance so the shop needs one request. */
export interface ShopView {
  coins: number;
  items: ShopItem[];
}

export interface CertificateView {
  id: string;
  code: string;
  courseTitle: string;
  issuedAt: string;
  status: string;
  shareUrl: string;
}

export interface TutorThreadView {
  id: string;
  contextType: "GENERAL" | "LESSON" | "SIM_SESSION";
  contextId: string | null;
  contextTitle: string | null;
  title: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface TutorMessageView {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

export interface TutorUsage {
  usedToday: number;
  limitPerDay: number;
  remainingToday: number;
}

export interface Paginated<T> {
  items?: T[];
  nextCursor?: string | null;
}
