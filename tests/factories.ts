/**
 * Canonical fixture factory - doc 08 §3: tests never hand-write user rows.
 * Users are created through the real auth services so hashes, stats rows and
 * tokens match production exactly.
 */
import { prisma } from "@/server/db";
import { signup } from "@/server/services/authService";
import type { Clock } from "@/server/lib/time";

let seq = 0;

export function uniqueEmail(prefix = "t"): string {
  seq += 1;
  return `${prefix}${Date.now()}x${seq}@test.moneylab.local`;
}

/**
 * One instant, frozen for the whole run, but taken from the real clock.
 *
 * Anything that signs a token has to use this rather than a date literal. The
 * services take the clock as an argument, but `jwtVerify` reads the real time,
 * so a token minted at a hardcoded instant starts failing verification the day
 * the wall clock walks past its expiry. That turns green tests red on a repo
 * nobody has touched.
 */
const RUN_START = new Date();
export const runClock: Clock = () => RUN_START;

/** An instant `days` after `runClock`, for expiry cases. */
export const runClockPlusDays = (days: number): Clock => {
  const d = new Date(RUN_START.getTime() + days * 24 * 60 * 60 * 1000);
  return () => d;
};

export async function makeLearner(now: Clock = () => new Date()) {
  const email = uniqueEmail("learner");
  const res = await signup(
    { email, password: "Password123!", displayName: "Test Learner" },
    now,
    {},
  );
  return { ...res, email, password: "Password123!" };
}

export async function makeAdmin(now: Clock = () => new Date()) {
  const learner = await makeLearner(now);
  await prisma.user.update({ where: { id: learner.user.id }, data: { role: "ADMIN" } });
  return learner;
}
