import { describe, expect, it } from "vitest";
import { AppError } from "@/server/lib/errors";
import { prisma } from "@/server/db";
import { signup, login, refresh, logout } from "@/server/services/authService";
import { verifyAccessToken } from "@/server/auth/jwt";
import { makeLearner, uniqueEmail, runClock, runClockPlusDays } from "../factories";

// doc 03 §1 - the full credential lifecycle against a real Postgres:
// signup → login (uniform failure) → refresh rotation → reuse-revokes-family →
// logout.

const NOW = runClock;

async function expectAppError(p: Promise<unknown>, code: string, message?: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    if (message) expect((e as AppError).message).toBe(message);
    return;
  }
  throw new Error(`expected AppError ${code}, but nothing was thrown`);
}

describe("signup", () => {
  it("creates a learner with valid tokens and a stats row", async () => {
    const { user, accessToken, refreshToken, email } = await makeLearner(NOW);
    expect(user.email).toBe(email);
    expect(user.role).toBe("LEARNER");
    expect(refreshToken.length).toBeGreaterThan(20);

    const claims = await verifyAccessToken(accessToken);
    expect(claims).toMatchObject({ sub: user.id, role: "LEARNER" });

    const stats = await prisma.userStats.findUnique({ where: { userId: user.id } });
    expect(stats).not.toBeNull();
  });

  it("rejects a duplicate email with CONFLICT (case-insensitive)", async () => {
    const { email } = await makeLearner(NOW);
    await expectAppError(
      signup({ email: email.toUpperCase(), password: "Password123!", displayName: "Dup" }, NOW, {}),
      "CONFLICT",
    );
  });
});

describe("login", () => {
  it("succeeds with the right password", async () => {
    const { email, password, user } = await makeLearner(NOW);
    const res = await login({ email, password }, NOW, {});
    expect(res.user.id).toBe(user.id);
  });

  it("fails uniformly for wrong password and unknown email", async () => {
    const { email } = await makeLearner(NOW);
    await expectAppError(login({ email, password: "WrongPass1!" }, NOW, {}), "UNAUTHENTICATED", "Invalid credentials");
    await expectAppError(
      login({ email: uniqueEmail("ghost"), password: "Whatever1!" }, NOW, {}),
      "UNAUTHENTICATED",
      "Invalid credentials",
    );
  });
});

describe("refresh rotation", () => {
  it("rotates: old token is retired, new token works", async () => {
    const { refreshToken, user } = await makeLearner(NOW);
    const r1 = await refresh({ refreshToken }, NOW);
    expect(r1.refreshToken).not.toBe(refreshToken);
    const claims = await verifyAccessToken(r1.accessToken);
    expect(claims?.sub).toBe(user.id);

    // The rotated-in token refreshes fine
    const r2 = await refresh({ refreshToken: r1.refreshToken }, NOW);
    expect(r2.refreshToken).not.toBe(r1.refreshToken);
  });

  it("reusing a rotated token revokes the whole family (theft signal)", async () => {
    const { refreshToken, user } = await makeLearner(NOW);
    const r1 = await refresh({ refreshToken }, NOW);

    // Replay the ORIGINAL (already rotated) token
    await expectAppError(refresh({ refreshToken }, NOW), "UNAUTHENTICATED");

    // The descendant token is now dead too - entire family revoked
    await expectAppError(refresh({ refreshToken: r1.refreshToken }, NOW), "UNAUTHENTICATED");
    const alive = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(alive).toBe(0);
  });

  it("rejects a garbage token", async () => {
    await expectAppError(refresh({ refreshToken: "not-a-real-token" }, NOW), "UNAUTHENTICATED");
  });

  it("rejects an expired token", async () => {
    const { refreshToken } = await makeLearner(NOW);
    const future = runClockPlusDays(40); // > 30-day TTL
    await expectAppError(refresh({ refreshToken }, future), "UNAUTHENTICATED");
  });
});

describe("logout", () => {
  it("revokes the presented token's family", async () => {
    const { refreshToken, user } = await makeLearner(NOW);
    await logout(user.id, { refreshToken }, NOW);
    await expectAppError(refresh({ refreshToken }, NOW), "UNAUTHENTICATED");
  });

  it("allDevices revokes every family", async () => {
    const first = await makeLearner(NOW);
    const second = await login({ email: first.email, password: first.password }, NOW, {});
    await logout(first.user.id, { allDevices: true }, NOW);
    await expectAppError(refresh({ refreshToken: first.refreshToken }, NOW), "UNAUTHENTICATED");
    await expectAppError(refresh({ refreshToken: second.refreshToken }, NOW), "UNAUTHENTICATED");
  });

  it("ignores a token belonging to someone else", async () => {
    const victim = await makeLearner(NOW);
    const attacker = await makeLearner(NOW);
    await logout(attacker.user.id, { refreshToken: victim.refreshToken }, NOW);
    // Victim's token still refreshes
    const r = await refresh({ refreshToken: victim.refreshToken }, NOW);
    expect(r.accessToken).toBeTruthy();
  });
});
