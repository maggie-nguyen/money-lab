import type { SchoolKind } from "@prisma/client";
import type { OsmElement } from "./geo";

const UNIVERSITY_RE = /đại học|dai hoc|university|đh\s|dh\s|học viện|hoc vien|academy|college/i;
const LANGUAGE_TRAINING_RE = /english academy|language center|ngôn ngữ|ngoai ngu/i;
const HOC_VIEN_RE = /học viện|hoc vien/i;
const HIGH_SCHOOL_RE = /thpt|trung học phổ thông|trung hoc pho thong|phổ thông|pho thong|cấp 3|cap 3|lyceum|high school/i;
const VOCATIONAL_RE = /cao đẳng|cao dang|trung cấp|trung cap|vocational|nghề|nghe/i;
const PRIMARY_RE = /tiểu học|tieu hoc|mầm non|mam non|primary|kindergarten|thcs|trung học cơ sở|trung hoc co so/i;

function isLanguageTrainingAcademy(name: string): boolean {
  return LANGUAGE_TRAINING_RE.test(name) && !HOC_VIEN_RE.test(name);
}

export function classifySchoolByName(name: string, amenity = ""): SchoolKind | null {
  return classifySchool({ name, amenity });
}

export function classifySchool(tags: Record<string, string>): SchoolKind | null {
  const name = tags.name ?? tags["name:vi"] ?? "";
  const amenity = tags.amenity ?? "";

  if (PRIMARY_RE.test(name) && !HIGH_SCHOOL_RE.test(name)) return null;

  if (VOCATIONAL_RE.test(name)) return "VOCATIONAL";
  if (isLanguageTrainingAcademy(name) && amenity !== "university") return null;
  if (amenity === "university" || UNIVERSITY_RE.test(name)) {
    return "UNIVERSITY";
  }
  if (amenity === "college" && !VOCATIONAL_RE.test(name)) return "UNIVERSITY";
  if (HIGH_SCHOOL_RE.test(name) || (amenity === "school" && /thpt|thcs/i.test(name))) {
    return "HIGH_SCHOOL";
  }
  if (amenity === "school") {
    if (name.length >= 8 && /trường|truong|school/i.test(name)) return "HIGH_SCHOOL";
  }
  return null;
}

export function schoolDisplayName(tags: Record<string, string>): string {
  return (tags["name:vi"] ?? tags.name ?? "").trim();
}

export function isLikelyFoodName(tags: Record<string, string>): boolean {
  const name = (tags.name ?? tags["name:vi"] ?? "").trim();
  return name.length >= 2;
}

export function parseOsmElements(data: unknown): OsmElement[] {
  if (!data || typeof data !== "object") return [];
  const elements = (data as { elements?: OsmElement[] }).elements;
  return Array.isArray(elements) ? elements : [];
}
