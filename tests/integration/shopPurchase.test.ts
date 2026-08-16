import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { withApi as rawWithApi } from "@/server/http";
import { idempotencyKey } from "@/lib/api";
import { purchaseItem, listShopItems } from "@/server/services/gamificationQueryService";
import { makeLearner } from "../factories";
import { uuidv7 } from "@/server/lib/ids";

/**
 * Buying a consumable twice.
 *
 * The shop screen sends an Idempotency-Key so a double click cannot charge
 * twice. Keyed on the item alone that key is held for 24 hours, which turns the
 * streak freeze, a consumable a learner may hold three of, into something they
 * can buy once a day. The client now keys on the copy being bought, so these
 * tests pin both halves: a repeated key still replays, a new copy does not.
 */

const POST = rawWithApi(
  { auth: "required", rateLimit: "write", idempotent: true },
  async (ctx) => ({ data: await purchaseItem(ctx.user!.id, ctx.params.id!, ctx.now), status: 201 }),
);

function buy(itemId: string, token: string, key: string) {
  const req = new NextRequest(`http://localhost:3000/api/v1/shop/items/${itemId}/purchase`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": key,
    },
    body: "{}",
  });
  return POST(req, { params: Promise.resolve({ id: itemId }) });
}

let freezeId: string;

beforeAll(async () => {
  const item = await prisma.shopItem.upsert({
    where: { code: "STREAK_FREEZE" },
    create: { id: uuidv7(), code: "STREAK_FREEZE", kind: "CONSUMABLE", priceCoins: 50, status: "PUBLISHED" },
    update: { priceCoins: 50, status: "PUBLISHED" },
  });
  freezeId = item.id;
  await prisma.shopItemTranslation.upsert({
    where: { itemId_locale: { itemId: item.id, locale: "vi" } },
    create: { itemId: item.id, locale: "vi", title: "Bảo vệ chuỗi ngày" },
    update: { title: "Bảo vệ chuỗi ngày" },
  });
});

describe("shop purchase idempotency", () => {
  it("a second copy of a consumable is a real purchase, not a replay", async () => {
    const { user, accessToken } = await makeLearner();
    await prisma.userStats.update({ where: { userId: user.id }, data: { coins: 500, streakFreezes: 0 } });

    // The key the shop screen builds: scope, item, and the count already held.
    const first = await buy(freezeId, accessToken, idempotencyKey("shop", `${freezeId}:0`));
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replay")).toBeNull();

    const second = await buy(freezeId, accessToken, idempotencyKey("shop", `${freezeId}:1`));
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replay")).toBeNull();

    const stats = await prisma.userStats.findUnique({ where: { userId: user.id } });
    expect(stats?.streakFreezes).toBe(2);
    expect(stats?.coins).toBe(400);
    expect(await prisma.userPurchase.count({ where: { userId: user.id, itemId: freezeId } })).toBe(2);
  });

  it("the same key twice still replays, so a double click charges once", async () => {
    const { user, accessToken } = await makeLearner();
    await prisma.userStats.update({ where: { userId: user.id }, data: { coins: 500, streakFreezes: 0 } });
    const key = idempotencyKey("shop", `${freezeId}:0`);

    const first = await buy(freezeId, accessToken, key);
    const second = await buy(freezeId, accessToken, key);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replay")).toBe("true");
    expect(await second.json()).toEqual(await first.json());

    const stats = await prisma.userStats.findUnique({ where: { userId: user.id } });
    expect(stats?.streakFreezes).toBe(1);
    expect(stats?.coins).toBe(450);
  });

  it("the response names the item by code and never sends an item object", async () => {
    // The screen used to read result.item.title off this body and threw on a
    // purchase that had already gone through, reporting a failure to the learner
    // whose coins were gone.
    const { user, accessToken } = await makeLearner();
    await prisma.userStats.update({ where: { userId: user.id }, data: { coins: 500, streakFreezes: 0 } });
    const res = await buy(freezeId, accessToken, idempotencyKey("shop", `${freezeId}:0`));
    const body = await res.json();
    expect(body.data).toMatchObject({ itemCode: "STREAK_FREEZE", coins: 450, streakFreezes: 1 });
    expect(body.data.item).toBeUndefined();
  });

  it("the hold limit stops a fourth copy", async () => {
    const { user, accessToken } = await makeLearner();
    await prisma.userStats.update({ where: { userId: user.id }, data: { coins: 500, streakFreezes: 3 } });
    const res = await buy(freezeId, accessToken, idempotencyKey("shop", `${freezeId}:3`));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details[0].message).toBe("FREEZE_HOLD_LIMIT");

    // The shop list keeps reporting the held count the key is built from.
    const shop = await listShopItems(user.id, "vi");
    expect(shop.items.find((i) => i.id === freezeId)?.held).toBe(3);
  });
});
