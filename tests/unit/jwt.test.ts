import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "@/server/auth/jwt";
import { env } from "@/server/config";

// doc 01 §5 - the access token is the only thing standing between a request and
// a user id, so what it refuses matters as much as what it accepts.

function secret(): Uint8Array {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

const future = () => Math.floor(Date.now() / 1000) + 600;

describe("verifyAccessToken", () => {
  it("round-trips a token this server signed", async () => {
    const token = await signAccessToken({ sub: "u1", role: "LEARNER" }, new Date());
    expect(await verifyAccessToken(token)).toEqual({ sub: "u1", role: "LEARNER" });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime(future())
      .sign(new TextEncoder().encode("some-other-secret-that-is-long-enough-aaaa"));
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects an unsigned alg:none token", async () => {
    // Hand-assembled, since jose will not sign one of these.
    const enc = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "u1", role: "ADMIN", exp: future() })}.`;
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects a role outside the two the app has", async () => {
    const token = await new SignJWT({ role: "SUPERADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime(future())
      .sign(secret());
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({ role: "LEARNER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret());
    expect(await verifyAccessToken(token)).toBeNull();
  });
});
