-- Pillars-only cleanup: drop tables for removed features (LMS, sims, shop,
-- leaderboard, tutor). CASCADE drops dependent FK tables / rows safely.
DROP TABLE IF EXISTS
  tutor_thread, tutor_message, tutor_usage,
  sim_action_log, sim_session, sim_definition_translation, sim_definition,
  shop_item_translation, shop_item, user_purchase,
  leaderboard_result,
  quiz_answer, quiz_attempt, question_translation, question, quiz_translation, quiz,
  lesson_progress, lesson_translation, lesson,
  enrollment, module_translation, module,
  course_translation, course, track_translation, track
CASCADE;

-- Drop the removed enum types (only if no remaining columns use them).
DROP TYPE IF EXISTS "SimType" CASCADE;
DROP TYPE IF EXISTS "SimStatus" CASCADE;
DROP TYPE IF EXISTS "TutorContextType" CASCADE;
DROP TYPE IF EXISTS "TutorMsgRole" CASCADE;
DROP TYPE IF EXISTS "QuestionType" CASCADE;

-- Article no longer links to a course.
ALTER TABLE "article" DROP COLUMN IF EXISTS "relatedCourseId";
