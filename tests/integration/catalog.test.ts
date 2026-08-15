import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { uuidv7 } from "@/server/lib/ids";
import { getCourse, getLesson } from "@/server/services/catalogService";

/**
 * The reader and the syllabus navigate off the catalog payload rather than a
 * second round trip, so the derived fields are pinned here: the media glyphs,
 * and the neighbours, which must never point at an unpublished lesson.
 */

const stamp = Date.now();
const courseSlug = `cat-course-${stamp}`;

async function makeLesson(
  courseId: string,
  slug: string,
  order: number,
  opts: { status?: "DRAFT" | "PUBLISHED"; blocks?: unknown[] } = {},
) {
  return prisma.lesson.create({
    data: {
      id: uuidv7(),
      courseId,
      slug,
      order,
      status: opts.status ?? "PUBLISHED",
      translations: {
        create: {
          locale: "vi",
          title: `Bài ${slug}`,
          summary: "Tóm tắt",
          blocks: (opts.blocks ?? [{ type: "PARAGRAPH", text: "Nội dung" }]) as never,
        },
      },
    },
  });
}

beforeAll(async () => {
  const track = await prisma.track.create({
    data: {
      id: uuidv7(),
      slug: `cat-track-${stamp}`,
      status: "PUBLISHED",
      order: 98,
      translations: { create: { locale: "vi", title: "Chủ đề" } },
    },
  });
  const course = await prisma.course.create({
    data: {
      id: uuidv7(),
      trackId: track.id,
      slug: courseSlug,
      status: "PUBLISHED",
      order: 98,
      level: 1,
      translations: { create: { locale: "vi", title: "Khóa học thử" } },
    },
  });

  await makeLesson(course.id, `cat-l1-${stamp}`, 1, {
    blocks: [
      { type: "VIDEO", url: "https://www.youtube.com/watch?v=abc", caption: "Mở đầu" },
      { type: "PARAGRAPH", text: "Nội dung" },
    ],
  });
  // Sits between the two published lessons, and must not show up as a neighbour.
  await makeLesson(course.id, `cat-draft-${stamp}`, 2, { status: "DRAFT" });
  await makeLesson(course.id, `cat-l2-${stamp}`, 3, {
    blocks: [
      { type: "PARAGRAPH", text: "Nội dung" },
      { type: "SIM_LINK", simSlug: "thang-luong-dau-tien" },
    ],
  });
});

describe("lesson media", () => {
  it("flags video and sim from the blocks", async () => {
    const course = await getCourse(courseSlug, "vi", null);
    const lessons = course.unmoduledLessons;
    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.media).toEqual({ video: true, sim: false });
    expect(lessons[1]!.media).toEqual({ video: false, sim: true });
  });

  it("hides draft lessons from the syllabus", async () => {
    const course = await getCourse(courseSlug, "vi", null);
    expect(course.unmoduledLessons.some((l) => l.slug.startsWith("cat-draft-"))).toBe(false);
  });
});

describe("lesson neighbours", () => {
  it("carries the course and the position", async () => {
    const lesson = await getLesson(`cat-l1-${stamp}`, "vi", null);
    expect(lesson.courseSlug).toBe(courseSlug);
    expect(lesson.courseTitle).toBe("Khóa học thử");
    expect(lesson.position).toBe(1);
    expect(lesson.lessonCount).toBe(2);
  });

  it("skips the draft lesson between the two published ones", async () => {
    const first = await getLesson(`cat-l1-${stamp}`, "vi", null);
    expect(first.prev).toBeNull();
    expect(first.next).toMatchObject({ slug: `cat-l2-${stamp}` });

    const last = await getLesson(`cat-l2-${stamp}`, "vi", null);
    expect(last.prev).toMatchObject({ slug: `cat-l1-${stamp}` });
    expect(last.next).toBeNull();
    expect(last.position).toBe(2);
  });
});
