import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, loginHref, safeReturnTo, welcomeHref } from "@/lib/returnTo";

/**
 * ?next= is a value an attacker can put in a link they send to a student, so
 * every case here is about what must not survive the check.
 */
describe("safeReturnTo", () => {
  it("keeps a path on this origin", () => {
    expect(safeReturnTo("/lesson/ngan-sach-la-gi")).toBe("/lesson/ngan-sach-la-gi");
    expect(safeReturnTo("/library?category=GUIDE")).toBe("/library?category=GUIDE");
  });

  it("falls back when there is nothing to return to", () => {
    expect(safeReturnTo(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo(undefined)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo("")).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("refuses anything that leaves this origin", () => {
    expect(safeReturnTo("https://evil.example/steal")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo("//evil.example/steal")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo("/\\evil.example/steal")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo("javascript:alert(1)")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo("lesson/relative")).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("refuses the auth screens, which would loop", () => {
    expect(safeReturnTo("/login")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo("/signup")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeReturnTo("/welcome?next=%2Flogin")).toBe(DEFAULT_AFTER_LOGIN);
  });
});

describe("loginHref", () => {
  it("carries the destination and escapes it", () => {
    expect(loginHref("/course/vay-no?tab=syllabus")).toBe(
      "/login?next=%2Fcourse%2Fvay-no%3Ftab%3Dsyllabus",
    );
  });

  it("stays bare when the destination is the default", () => {
    expect(loginHref("/learn")).toBe("/login");
    expect(loginHref("//evil.example")).toBe("/login");
  });
});

describe("welcomeHref", () => {
  it("passes the destination through onboarding", () => {
    expect(welcomeHref("/sims")).toBe("/welcome?next=%2Fsims");
    expect(welcomeHref("/learn")).toBe("/welcome");
  });
});
