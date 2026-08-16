import { createHash, randomBytes } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/server/db";
import { env } from "@/server/config";
import { uuidv7 } from "@/server/lib/ids";
import {
  AppError,
  conflict,
  forbidden,
  gone,
  unauthenticated,
} from "@/server/lib/errors";
import {
  signAccessToken,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
} from "@/server/auth/jwt";
import { sendEmail } from "@/server/lib/email";
import type { Clock } from "@/server/lib/time";
import type { User } from "@prisma/client";
import { createT } from "@/lib/i18n";
import { parseLocale, DEFAULT_LOCALE } from "@/lib/locale";
import type { Locale } from "@/lib/types";

// argon2id params - doc 01 stack table
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

function userLocale(pref: string | null | undefined): Locale {
  return parseLocale(pref) ?? DEFAULT_LOCALE;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

export function toMeDto(u: User) {
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    displayName: u.displayName,
    avatarKey: u.avatarKey,
    role: u.role,
    birthYear: u.birthYear,
    province: u.province,
    localePref: u.localePref,
    onboardedAt: u.onboardedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

async function issueTokens(user: User, now: Date, userAgent?: string, ip?: string): Promise<TokenPair> {
  const accessToken = await signAccessToken(
    { sub: user.id, role: user.role },
    now,
  );
  const raw = randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      id: uuidv7(),
      userId: user.id,
      familyId: uuidv7(),
      tokenHash: sha256(raw),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
      userAgent: userAgent?.slice(0, 200),
      ip,
    },
  });
  return { accessToken, refreshToken: raw, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SEC };
}

function assertNotBanned(user: User): void {
  if (user.bannedAt) throw forbidden("Account suspended");
  if (user.deletedAt) throw unauthenticated("Invalid credentials");
}

async function ensureStats(userId: string): Promise<void> {
  await prisma.userStats.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function signup(
  input: {
    email: string;
    password: string;
    displayName: string;
    birthYear?: number;
    province?: string;
    localePref?: "vi" | "en";
  },
  now: Clock,
  meta: { userAgent?: string; ip?: string },
) {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) throw conflict("Email already registered");
  const user = await prisma.user.create({
    data: {
      id: uuidv7(),
      email,
      passwordHash: await argonHash(input.password, ARGON_OPTS),
      displayName: input.displayName.trim(),
      birthYear: input.birthYear,
      province: input.province,
      localePref: input.localePref ?? "vi",
    },
  });
  await ensureStats(user.id);
  await sendVerificationEmail(user.id, now());
  const tokens = await issueTokens(user, now(), meta.userAgent, meta.ip);
  return { user: toMeDto(user), ...tokens };
}

export async function login(
  input: { email: string; password: string },
  now: Clock,
  meta: { userAgent?: string; ip?: string },
) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: input.email.toLowerCase().trim(), mode: "insensitive" } },
  });
  // Uniform error whether email exists or not (doc 03 §1.2)
  if (!user?.passwordHash) throw unauthenticated("Invalid credentials");
  assertNotBanned(user);
  const ok = await argonVerify(user.passwordHash, input.password);
  if (!ok) throw unauthenticated("Invalid credentials");
  const tokens = await issueTokens(user, now(), meta.userAgent, meta.ip);
  return { user: toMeDto(user), ...tokens };
}

const googleJwks = () => createRemoteJWKSet(new URL(env().GOOGLE_JWKS_URL));

export async function googleLogin(
  input: { idToken: string; localePref?: "vi" | "en" },
  now: Clock,
  meta: { userAgent?: string; ip?: string },
) {
  const clientId = env().GOOGLE_CLIENT_ID;
  if (!clientId) throw new AppError("NOT_IMPLEMENTED", "Google login is not configured");
  const localePref = input.localePref === "en" ? "en" : "vi";
  let payload: { sub?: string; email?: string; email_verified?: boolean; name?: string };
  try {
    const res = await jwtVerify(input.idToken, googleJwks(), {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    payload = res.payload as typeof payload;
  } catch {
    throw unauthenticated("Invalid Google token");
  }
  if (!payload.sub) throw unauthenticated("Invalid Google token");

  const account = await prisma.oauthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: payload.sub } },
    include: { user: true },
  });
  let user = account?.user ?? null;
  let isNewUser = false;
  if (!user && payload.email && payload.email_verified) {
    user = await prisma.user.findFirst({
      where: { email: { equals: payload.email.toLowerCase(), mode: "insensitive" } },
    });
    if (user) {
      await prisma.oauthAccount.create({
        data: { id: uuidv7(), userId: user.id, provider: "google", providerAccountId: payload.sub },
      });
    }
  }
  // An unverified Google email must never claim an existing account, and it
  // cannot be written onto a new one either, since the email column is unique.
  // Say so plainly instead of failing on the constraint.
  if (!user && payload.email && !payload.email_verified) {
    const taken = await prisma.user.findFirst({
      where: { email: { equals: payload.email.toLowerCase(), mode: "insensitive" } },
    });
    if (taken) {
      throw conflict(
        localePref === "en"
          ? "This email already has an account. Sign in with your password, because Google has not verified this email."
          : "Email này đã có tài khoản. Hãy đăng nhập bằng mật khẩu, vì Google chưa xác minh email của bạn.",
      );
    }
  }
  if (!user) {
    isNewUser = true;
    const fallbackName = localePref === "en" ? "Learner" : "Học sinh";
    user = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: payload.email?.toLowerCase() ?? null,
        emailVerifiedAt: payload.email_verified ? now() : null,
        displayName: (payload.name ?? fallbackName).slice(0, 40),
        localePref,
      },
    });
    await ensureStats(user.id);
    await prisma.oauthAccount.create({
      data: { id: uuidv7(), userId: user.id, provider: "google", providerAccountId: payload.sub },
    });
  }
  assertNotBanned(user);
  const tokens = await issueTokens(user, now(), meta.userAgent, meta.ip);
  return { user: toMeDto(user), isNewUser, ...tokens };
}

export async function refresh(input: { refreshToken: string }, now: Clock) {
  const tokenHash = sha256(input.refreshToken);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row) throw unauthenticated("Invalid refresh token");
  if (row.revokedAt || row.expiresAt < now()) throw unauthenticated("Invalid refresh token");
  if (row.rotatedAt) {
    // Reuse of a rotated-out token → theft signal: revoke the whole family (doc 01 §5.1)
    await prisma.refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: now() },
    });
    throw unauthenticated("Invalid refresh token");
  }
  assertNotBanned(row.user);
  const raw = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: row.id }, data: { rotatedAt: now() } }),
    prisma.refreshToken.create({
      data: {
        id: uuidv7(),
        userId: row.userId,
        familyId: row.familyId,
        tokenHash: sha256(raw),
        expiresAt: new Date(now().getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
      },
    }),
  ]);
  const accessToken = await signAccessToken(
    { sub: row.userId, role: row.user.role },
    now(),
  );
  return { accessToken, refreshToken: raw, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SEC };
}

export async function logout(
  userId: string,
  input: { refreshToken?: string; allDevices?: boolean },
  now: Clock,
): Promise<void> {
  if (input.allDevices) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now() },
    });
    return;
  }
  if (input.refreshToken) {
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(input.refreshToken) } });
    if (row && row.userId === userId) {
      await prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: now() },
      });
    }
  }
}

async function createEmailToken(
  userId: string,
  purpose: "verify" | "reset",
  ttlMs: number,
  now: Date,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.emailToken.create({
    data: {
      id: uuidv7(),
      userId,
      purpose,
      tokenHash: sha256(raw),
      expiresAt: new Date(now.getTime() + ttlMs),
    },
  });
  return raw;
}

export async function sendVerificationEmail(userId: string, now: Date): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email || user.emailVerifiedAt) return;
  const token = await createEmailToken(userId, "verify", 7 * 24 * 3600 * 1000, now);
  const t = createT(userLocale(user.localePref));
  const url = `${env().APP_ORIGIN}/verify-email?token=${token}`;
  await sendEmail(
    user.email,
    t("auth.email.verifySubject"),
    t("auth.email.verifyBody", { name: user.displayName, url }),
  );
}

export async function verifyEmail(input: { token: string }, now: Clock): Promise<void> {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!row || row.purpose !== "verify" || row.usedAt || row.expiresAt < now()) {
    throw gone("Verification link expired or invalid");
  }
  await prisma.$transaction([
    prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: now() } }),
    prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now() } }),
  ]);
}

export async function forgotPassword(input: { email: string }, now: Clock): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: input.email.toLowerCase().trim(), mode: "insensitive" } },
  });
  if (!user?.email) return; // no enumeration - always 204
  const token = await createEmailToken(user.id, "reset", 3600 * 1000, now());
  const t = createT(userLocale(user.localePref));
  const url = `${env().APP_ORIGIN}/reset-password?token=${token}`;
  await sendEmail(user.email, t("auth.email.resetSubject"), t("auth.email.resetBody", { url }));
}

export async function resetPassword(
  input: { token: string; newPassword: string },
  now: Clock,
): Promise<void> {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!row || row.purpose !== "reset" || row.usedAt || row.expiresAt < now()) {
    throw gone("Reset link expired or invalid");
  }
  await prisma.$transaction([
    prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: now() } }),
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await argonHash(input.newPassword, ARGON_OPTS) },
    }),
    // Revoke all sessions after a reset (doc 03 §1.11)
    prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: now() },
    }),
  ]);
}
