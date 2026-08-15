import { NextRequest } from "next/server";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, type JWK, type KeyLike } from "jose";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/config";
import { AppError } from "@/server/lib/errors";
import { googleLogin } from "@/server/services/authService";
import { verifyAccessToken } from "@/server/auth/jwt";
import { POST as googleSessionRoute } from "@/app/api/session/google/route";
import { uniqueEmail, runClock } from "../factories";

// doc 03 §1 - Google sign-in. Google's id_token is verified against a remote
// key set, so the test generates its own key pair, serves the public half from
// a local HTTP server, and points GOOGLE_JWKS_URL at it. Nothing here talks to
// Google.

const NOW = runClock;
const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const KID = "test-key-1";

let privateKey: KeyLike;
let jwksServer: Server;
let jwksUrl: string;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
  const body = JSON.stringify({ keys: [publicJwk] });
  jwksServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/certs`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
});

async function idToken(claims: {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  aud?: string;
}): Promise<string> {
  return new SignJWT({
    email: claims.email,
    email_verified: claims.email_verified,
    name: claims.name,
  })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer("https://accounts.google.com")
    .setAudience(claims.aud ?? CLIENT_ID)
    .setSubject(claims.sub)
    .setIssuedAt(Math.floor(NOW().getTime() / 1000))
    .setExpirationTime(Math.floor(NOW().getTime() / 1000) + 3600)
    .sign(privateKey);
}

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_JWKS_URL;
  resetEnvCache();
});

function configured(): void {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_JWKS_URL = jwksUrl;
  resetEnvCache();
}

describe("googleLogin", () => {
  it("creates an account on first sign-in and marks it new", async () => {
    configured();
    const email = uniqueEmail();
    const sub = `google-${email}`;
    const result = await googleLogin({ idToken: await idToken({ sub, email, email_verified: true, name: "Minh An" }) }, NOW, {});

    expect(result.isNewUser).toBe(true);
    expect(result.user.email).toBe(email);
    expect(result.user.displayName).toBe("Minh An");
    const claims = await verifyAccessToken(result.accessToken);
    expect(claims).toMatchObject({ sub: result.user.id, role: "LEARNER" });

    // Everyone who can earn XP needs a stats row from the first request on.
    const stats = await prisma.userStats.findUnique({ where: { userId: result.user.id } });
    expect(stats).not.toBeNull();
  });

  it("returns the same user on the second sign-in", async () => {
    configured();
    const email = uniqueEmail();
    const sub = `google-${email}`;
    const first = await googleLogin({ idToken: await idToken({ sub, email, email_verified: true }) }, NOW, {});
    const second = await googleLogin({ idToken: await idToken({ sub, email, email_verified: true }) }, NOW, {});

    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    const accounts = await prisma.oauthAccount.count({ where: { userId: first.user.id } });
    expect(accounts).toBe(1);
  });

  it("links to an existing password account when Google says the email is verified", async () => {
    configured();
    const email = uniqueEmail();
    const existing = await prisma.user.create({
      data: { id: crypto.randomUUID(), email, displayName: "Đã có sẵn", passwordHash: "x" },
    });

    const result = await googleLogin({ idToken: await idToken({ sub: `google-${email}`, email, email_verified: true }) }, NOW, {});
    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe(existing.id);
    // The password stays, so the account keeps both ways in.
    const after = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(after?.passwordHash).toBe("x");
  });

  it("refuses an unverified email that already has an account, rather than linking", async () => {
    configured();
    const email = uniqueEmail();
    await prisma.user.create({
      data: { id: crypto.randomUUID(), email, displayName: "Đã có sẵn", passwordHash: "x" },
    });

    // Linking here would be an account takeover: anyone can put an arbitrary
    // unverified address on a Google account.
    await expect(
      googleLogin({ idToken: await idToken({ sub: `google-${email}`, email, email_verified: false }) }, NOW, {}),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("creates a separate account for an unverified email nobody else holds", async () => {
    configured();
    const email = uniqueEmail();
    const result = await googleLogin({ idToken: await idToken({ sub: `google-${email}`, email, email_verified: false }) }, NOW, {});
    expect(result.isNewUser).toBe(true);
    // Unverified means unverified: the account starts without a verified email.
    const row = await prisma.user.findUnique({ where: { id: result.user.id } });
    expect(row?.emailVerifiedAt).toBeNull();
  });

  it("rejects a token minted for another audience", async () => {
    configured();
    const email = uniqueEmail();
    await expect(
      googleLogin({ idToken: await idToken({ sub: `google-${email}`, email, email_verified: true, aud: "someone-else" }) }, NOW, {}),
    ).rejects.toThrow(AppError);
  });

  it("rejects garbage that is not a JWT at all", async () => {
    configured();
    await expect(googleLogin({ idToken: "not-a-token-at-all" }, NOW, {})).rejects.toThrow(AppError);
  });

  it("reports NOT_IMPLEMENTED when no client id is configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    resetEnvCache();
    await expect(googleLogin({ idToken: "anything-long-enough" }, NOW, {})).rejects.toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
  });
});

describe("POST /api/session/google", () => {
  it("installs the same cookie triple as a password login", async () => {
    configured();
    process.env.RATE_LIMIT_DISABLED = "true";
    resetEnvCache();
    const email = uniqueEmail();
    const token = await idToken({ sub: `google-${email}`, email, email_verified: true, name: "Cookie Test" });

    const res = await googleSessionRoute(
      new NextRequest("http://localhost:3000/api/session/google", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ idToken: token }),
      }),
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("ml_access=") && c.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("ml_refresh=") && c.includes("Path=/api/session"))).toBe(true);
    // The hint cookie is deliberately readable: it holds no credential.
    expect(cookies.some((c) => c.startsWith("ml_session=1") && !c.includes("HttpOnly"))).toBe(true);

    const body = (await res.json()) as { data: { user: { email: string }; isNewUser: boolean } };
    expect(body.data.user.email).toBe(email);
    expect(body.data.isNewUser).toBe(true);
  });
});
