import { SignJWT, jwtVerify } from "jose";
import { uuidv7 } from "@/server/lib/ids";
import { env } from "@/server/config";

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 3600;

export interface AccessClaims {
  sub: string;
  role: "LEARNER" | "ADMIN";
}

function secret(): Uint8Array {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

export async function signAccessToken(claims: AccessClaims, now: Date): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setJti(uuidv7())
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + ACCESS_TOKEN_TTL_SEC)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    // Pinning the algorithm keeps a token that asks to be checked some other
    // way, "none" being the classic, from ever reaching the payload check.
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    if (payload.role !== "LEARNER" && payload.role !== "ADMIN") return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
