import type { Rng } from "@/server/lib/rng";
import { weightedDraw } from "@/server/lib/rng";
import {
  type Engine,
  type EngineJson,
  type ApplyResult,
  type FinishResult,
  type ActionDescriptor,
  type TextBundle,
  engineError,
  applyPreset,
  num,
  str,
  txt,
} from "@/server/engines/types";

// BUSINESS - "Quán nước của tôi" (doc 04 §5). One week = one turn.
// SECRETS: demand-curve parameters (elasticity, noise) and future weather.

interface BusinessState {
  week: number;
  cash: number;
  upgradesOwned: string[];
  totalProfit: number;
  spoiledUnits: number;
  missedDemandUnits: number;
  failed: boolean;
  history: EngineJson[];
  [k: string]: unknown;
}

function cfg(config: EngineJson) {
  const product = (config.product ?? {}) as Record<string, unknown>;
  const demand = (config.demandCurve ?? {}) as Record<string, unknown>;
  return {
    weeks: num(config.weeks),
    opening: num(config.openingCashVnd),
    unitCost: num(product.unitCostVnd),
    spoilageBps: num(product.spoilagePctBpsPerWeek),
    basePrice: num(demand.basePriceVnd),
    baseDemand: num(demand.baseDemandUnits),
    elasticity: Number(demand.elasticity ?? -1.5),
    noiseBps: num(demand.noiseBps),
    weather: (config.weather as Array<{ key: string; weight: number; demandMultBps: number }>) ?? [],
    upgrades: (config.upgrades as Array<{ key: string; costVnd: string; demandMultBps?: number; spoilageMultBps?: number }>) ?? [],
    fixedCost: num(config.fixedCostPerWeekVnd),
    events: (config.events as Array<{ key: string; weight: number; costVnd: string }>) ?? [],
    priceMin: num(config.priceMinVnd ?? 1000),
    priceMax: num(config.priceMaxVnd ?? 100000),
  };
}

export const businessEngine: Engine = {
  type: "BUSINESS",

  init(config, _seed, optionsKey) {
    const c = cfg(applyPreset(config, optionsKey));
    const state: BusinessState = {
      week: 1,
      cash: c.opening,
      upgradesOwned: [],
      totalProfit: 0,
      spoiledUnits: 0,
      missedDemandUnits: 0,
      failed: false,
      history: [],
    };
    return state;
  },

  view(state, config, textBundle: TextBundle) {
    const s = state as BusinessState;
    const c = cfg(config);
    return {
      week: s.week,
      weeks: c.weeks,
      cashVnd: String(s.cash),
      product: { key: "prod", label: txt(textBundle, "prod_tra_chanh"), unitCostVnd: String(c.unitCost) },
      referencePriceVnd: String(c.basePrice), // a hint, not the formula
      fixedCostPerWeekVnd: String(c.fixedCost),
      upgrades: c.upgrades.map((u) => ({
        key: u.key,
        label: txt(textBundle, u.key),
        costVnd: u.costVnd,
        owned: s.upgradesOwned.includes(u.key),
      })),
      totalProfitVnd: String(s.totalProfit),
      history: s.history, // past weeks reveal weather AFTER the fact
    };
  },

  availableActions(state, config): ActionDescriptor[] {
    const s = state as BusinessState;
    if (s.failed || s.week > cfg(config).weeks) return [];
    return [
      {
        type: "PLAN_WEEK",
        schema: {
          priceVnd: "stringVnd (1000..100000)",
          unitsToStock: "number ≥ 0",
          buyUpgradeKeys: "string[] (optional)",
        },
      },
    ];
  },

  applyAction(state, config, action, rng: Rng): ApplyResult {
    const s = structuredClone(state) as BusinessState;
    const c = cfg(config);
    if (str(action.type) !== "PLAN_WEEK") engineError("UNKNOWN_ACTION", str(action.type));
    if (s.failed || s.week > c.weeks) engineError("WRONG_PHASE");

    const price = num(action.priceVnd);
    const stock = Number(action.unitsToStock);
    const buyKeys = Array.isArray(action.buyUpgradeKeys) ? (action.buyUpgradeKeys as string[]) : [];
    if (!Number.isFinite(price) || price < c.priceMin || price > c.priceMax) engineError("PRICE_OUT_OF_RANGE");
    if (!Number.isInteger(stock) || stock < 0) engineError("STOCK_NEGATIVE");
    const newUpgrades = buyKeys.filter((k) => !s.upgradesOwned.includes(k));
    const upgradeDefs = newUpgrades.map((k) => {
      const u = c.upgrades.find((x) => x.key === k);
      if (!u) engineError("BAD_CHOICE", k);
      return u;
    });
    const upgradeCost = upgradeDefs.reduce((sum, u) => sum + num(u.costVnd), 0);
    const stockCost = stock * c.unitCost;
    if (c.fixedCost + upgradeCost + stockCost > s.cash) engineError("INSUFFICIENT_CASH");

    // Resolution order (doc 04 §5.2): fixed cost → upgrades → stock → weather →
    // demand → sales → spoilage → event → report
    const cashStart = s.cash;
    s.cash -= c.fixedCost + upgradeCost + stockCost;
    s.upgradesOwned.push(...newUpgrades);

    const weather = weightedDraw(c.weather, rng);
    const owned = c.upgrades.filter((u) => s.upgradesOwned.includes(u.key));
    const demandMult = owned.reduce((m, u) => m * ((u.demandMultBps ?? 10000) / 10000), 1);
    const spoilMult = owned.reduce((m, u) => m * ((u.spoilageMultBps ?? 10000) / 10000), 1);
    const noise = 1 + ((rng.next() * 2 - 1) * c.noiseBps) / 10000;
    const demand = Math.max(
      0,
      Math.floor(
        c.baseDemand * Math.pow(price / c.basePrice, c.elasticity) * (weather.demandMultBps / 10000) * demandMult * noise,
      ),
    );
    const unitsSold = Math.min(demand, stock);
    const revenue = unitsSold * price;
    s.cash += revenue;
    s.missedDemandUnits += Math.max(0, demand - stock);

    const unsold = stock - unitsSold;
    const spoiled = Math.floor((unsold * c.spoilageBps * spoilMult) / 10000);
    s.spoiledUnits += spoiled;

    let eventKey: string | null = null;
    let eventCost = 0;
    for (const evt of c.events) {
      if (rng.next() < evt.weight / 10) {
        eventKey = evt.key;
        eventCost = num(evt.costVnd);
        s.cash -= eventCost;
        break;
      }
    }

    const profit = s.cash - cashStart;
    s.totalProfit += profit;
    const report = {
      week: s.week,
      weatherKey: weather.key,
      priceVnd: String(price),
      stocked: stock,
      demand,
      unitsSold,
      revenueVnd: String(revenue),
      stockCostVnd: String(stockCost),
      upgradesBought: newUpgrades,
      spoiledUnits: spoiled,
      ...(eventKey ? { eventKey, eventCostVnd: String(eventCost) } : {}),
      profitVnd: String(profit),
      cashEndVnd: String(s.cash),
    };
    s.history.push(report);
    if (s.cash < 0) s.failed = true;
    else s.week += 1;

    return { state: s, resultDelta: report, turnAdvanced: true, turnReport: report };
  },

  isFinished(state, config): FinishResult {
    const s = state as BusinessState;
    const c = cfg(config);
    if (s.failed) {
      return {
        finished: true,
        status: "FAILED",
        summary: {
          totalProfitVnd: String(s.totalProfit),
          weeksSurvived: s.history.length,
          grade: "D",
          insights: ["ins_cash_is_oxygen"],
          awardBadge: null,
        },
      };
    }
    if (s.week > c.weeks) {
      const weeks = s.history as Array<Record<string, unknown>>;
      const best = weeks.reduce(
        (b, w) => (Number(w.profitVnd) > Number(b?.profitVnd ?? -Infinity) ? w : b),
        weeks[0],
      );
      const margins = weeks
        .filter((w) => Number(w.revenueVnd) > 0)
        .map((w) => Number(w.profitVnd) / Number(w.revenueVnd));
      const avgMarginPct = margins.length
        ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 100)
        : 0;
      const insights: string[] = [];
      if (s.missedDemandUnits > c.baseDemand) insights.push("ins_stock_more");
      if (s.spoiledUnits > c.baseDemand / 2) insights.push("ins_spoilage_cost");
      if (s.totalProfit > 0) insights.push("ins_unit_economics");
      return {
        finished: true,
        status: "COMPLETED",
        summary: {
          totalProfitVnd: String(s.totalProfit),
          bestWeek: best ? Number(best.week) : null,
          avgMarginPct,
          missedDemandUnits: s.missedDemandUnits,
          spoiledUnits: s.spoiledUnits,
          grade: s.totalProfit > 2000000 ? "A" : s.totalProfit > 0 ? "B" : "C",
          insights,
          awardBadge: s.totalProfit > 0 ? "SIM_BUSINESS_PROFIT" : null,
        },
      };
    }
    return { finished: false, status: "COMPLETED" };
  },
};
