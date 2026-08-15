import { turnRng } from "@/server/lib/rng";
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

// INVEST - "Danh mục đầu tiên" (doc 04 §6). Returns for ALL turns are
// pre-generated at init from the seed. `pricePath`/`newsPath` beyond the
// current turn are ABSOLUTE SECRETS - view() must never leak them.

interface Asset {
  key: string;
  class: string;
  meanReturnBps: number;
  volBps: number;
  feeBps: number;
  crashChanceBps?: number;
  crashSizeBps?: number;
}

interface Order {
  assetKey: string;
  action: "BUY" | "SELL";
  amountVnd: string;
}

interface InvestState {
  turn: number; // 1-based current turn
  cash: number;
  holdings: Record<string, number>;
  pricePath: Record<string, number[]>; // SECRET: returnBps per asset per turn (index 0 = turn 1)
  newsPath: string[]; // SECRET beyond current turn
  valueHistory: number[]; // portfolio value at end of each played turn
  benchmarkValue: number;
  holdTurns: Record<string, number>; // turns each asset was held (for badge)
  tradesCount: number;
  feesPaid: number;
  behaviorFlags: string[];
  lastReturns: Record<string, number>; // last turn's returnBps (for flags)
  history: EngineJson[];
  [k: string]: unknown;
}

function cfg(config: EngineJson) {
  return {
    turns: num(config.turns),
    startingCash: num(config.startingCashVnd),
    assets: (config.assets as Asset[]) ?? [],
    newsEvents: (config.newsEvents as Array<{ key: string; affects: string | null; biasBps: number; weight: number }>) ?? [],
    rebalanceFee: num(config.rebalanceFeeVnd),
    turnLabelKey: str(config.turnLabelKey ?? "turn"),
  };
}

function portfolioValue(s: InvestState): number {
  return s.cash + Object.values(s.holdings).reduce((a, b) => a + b, 0);
}

export const investEngine: Engine = {
  type: "INVEST",

  init(config, seed, optionsKey) {
    const c = cfg(applyPreset(config, optionsKey));
    // Pre-generate news + returns for every turn (doc 04 §6.2)
    const newsPath: string[] = [];
    const pricePath: Record<string, number[]> = Object.fromEntries(c.assets.map((a) => [a.key, []]));
    for (let t = 1; t <= c.turns; t++) {
      const rng = turnRng(seed, t);
      const news = weightedDraw(c.newsEvents, rng);
      newsPath.push(news.key);
      for (const asset of c.assets) {
        let ret = Math.round(asset.meanReturnBps + asset.volBps * rng.gauss());
        if (asset.crashChanceBps && rng.next() * 10000 < asset.crashChanceBps) {
          ret = asset.crashSizeBps ?? -5000;
        }
        if (news.affects === asset.key) ret += news.biasBps; // bias baked into the path
        pricePath[asset.key]!.push(ret);
      }
    }
    const state: InvestState = {
      turn: 1,
      cash: c.startingCash,
      holdings: Object.fromEntries(c.assets.map((a) => [a.key, 0])),
      pricePath,
      newsPath,
      valueHistory: [],
      benchmarkValue: c.startingCash,
      holdTurns: Object.fromEntries(c.assets.map((a) => [a.key, 0])),
      tradesCount: 0,
      feesPaid: 0,
      behaviorFlags: [],
      lastReturns: {},
      history: [],
    };
    return state;
  },

  view(state, config, textBundle: TextBundle) {
    const s = state as InvestState;
    const c = cfg(config);
    const playing = s.turn <= c.turns;
    return {
      turn: s.turn,
      turns: c.turns,
      turnLabel: txt(textBundle, c.turnLabelKey),
      cashVnd: String(s.cash),
      assets: c.assets.map((a) => ({
        key: a.key,
        label: txt(textBundle, a.key),
        class: a.class,
        feeBps: a.feeBps,
        holdingVnd: String(s.holdings[a.key] ?? 0),
        // history only - returns already realized (never the future path)
        returnHistoryBps: (s.pricePath[a.key] ?? []).slice(0, s.turn - 1),
      })),
      news: playing
        ? { key: s.newsPath[s.turn - 1], label: txt(textBundle, s.newsPath[s.turn - 1] ?? "") }
        : null,
      portfolioValueVnd: String(portfolioValue(s)),
      benchmarkValueVnd: String(Math.round(s.benchmarkValue)),
      valueHistory: s.valueHistory.map((v) => String(v)),
      rebalanceFeeVnd: String(c.rebalanceFee),
      history: s.history,
    };
  },

  availableActions(state, config): ActionDescriptor[] {
    const s = state as InvestState;
    if (s.turn > cfg(config).turns) return [];
    return [
      {
        type: "REBALANCE",
        schema: {
          orders: '[{ assetKey, action: "BUY"|"SELL", amountVnd }] (empty = hold)',
        },
      },
    ];
  },

  applyAction(state, config, action): ApplyResult {
    const s = structuredClone(state) as InvestState;
    const c = cfg(config);
    if (str(action.type) !== "REBALANCE") engineError("UNKNOWN_ACTION", str(action.type));
    if (s.turn > c.turns) engineError("WRONG_PHASE");

    const orders = Array.isArray(action.orders) ? (action.orders as Order[]) : [];
    // Validate all orders first
    let sellTotal = 0;
    let buyTotal = 0;
    for (const o of orders) {
      const asset = c.assets.find((a) => a.key === o.assetKey);
      if (!asset) engineError("BAD_ASSET", String(o.assetKey));
      const amount = num(o.amountVnd);
      if (!Number.isFinite(amount) || amount <= 0) engineError("BAD_CHOICE", "amountVnd must be > 0");
      if (o.action === "SELL") {
        if (amount > (s.holdings[o.assetKey] ?? 0)) engineError("SELL_EXCEEDS_HOLDING", o.assetKey);
        sellTotal += amount;
      } else if (o.action === "BUY") {
        buyTotal += amount;
      } else {
        engineError("BAD_CHOICE", "action must be BUY or SELL");
      }
    }
    const fees = orders.length * c.rebalanceFee;
    if (buyTotal + fees > s.cash + sellTotal) engineError("INSUFFICIENT_CASH");

    // FOMO/panic behavior flags - compare against LAST turn's returns
    for (const o of orders) {
      const lastRet = s.lastReturns[o.assetKey];
      if (lastRet === undefined) continue;
      const holding = s.holdings[o.assetKey] ?? 0;
      if (o.action === "SELL" && lastRet < -1500 && num(o.amountVnd) > holding * 0.5) {
        if (!s.behaviorFlags.includes("flag_panic_sell")) s.behaviorFlags.push("flag_panic_sell");
      }
      if (o.action === "BUY" && lastRet > 1500) {
        if (!s.behaviorFlags.includes("flag_fomo_buy")) s.behaviorFlags.push("flag_fomo_buy");
      }
    }

    // Apply orders (sells first), then fees
    for (const o of orders) {
      const amount = num(o.amountVnd);
      if (o.action === "SELL") {
        s.holdings[o.assetKey] = (s.holdings[o.assetKey] ?? 0) - amount;
        s.cash += amount;
      }
    }
    for (const o of orders) {
      const amount = num(o.amountVnd);
      if (o.action === "BUY") {
        s.holdings[o.assetKey] = (s.holdings[o.assetKey] ?? 0) + amount;
        s.cash -= amount;
      }
    }
    s.cash -= fees;
    s.feesPaid += fees;
    s.tradesCount += orders.length;

    // Apply this turn's pre-generated returns net of asset fees
    const perAsset: EngineJson[] = [];
    for (const asset of c.assets) {
      const ret = s.pricePath[asset.key]![s.turn - 1]!;
      const netBps = ret - asset.feeBps;
      const before = s.holdings[asset.key] ?? 0;
      const after = Math.max(0, Math.round(before * (1 + netBps / 10000)));
      s.holdings[asset.key] = after;
      s.lastReturns[asset.key] = ret;
      if (before > 0) s.holdTurns[asset.key] = (s.holdTurns[asset.key] ?? 0) + 1;
      perAsset.push({ key: asset.key, returnBps: ret, valueVnd: String(after) });
    }
    // Benchmark: 100% as_savings buy-and-hold
    const savingsRet = s.pricePath["as_savings"]?.[s.turn - 1] ?? 0;
    s.benchmarkValue = s.benchmarkValue * (1 + savingsRet / 10000);

    const value = portfolioValue(s);
    s.valueHistory.push(value);
    const report = {
      turn: s.turn,
      newsKey: s.newsPath[s.turn - 1],
      perAsset,
      ordersApplied: orders.length,
      feesVnd: String(fees),
      portfolioValueVnd: String(value),
      benchmarkValueVnd: String(Math.round(s.benchmarkValue)),
    };
    s.history.push(report);
    s.turn += 1;
    return { state: s, resultDelta: report, turnAdvanced: true, turnReport: report };
  },

  isFinished(state, config): FinishResult {
    const s = state as InvestState;
    const c = cfg(config);
    if (s.turn <= c.turns) return { finished: false, status: "COMPLETED" };

    const finalValue = portfolioValue(s);
    const totalReturnBps = Math.round(((finalValue - c.startingCash) / c.startingCash) * 10000);
    const benchmarkReturnBps = Math.round(((s.benchmarkValue - c.startingCash) / c.startingCash) * 10000);

    // Max drawdown over the value history
    let peak = c.startingCash;
    let maxDrawdownBps = 0;
    for (const v of s.valueHistory) {
      if (v > peak) peak = v;
      const dd = Math.round(((peak - v) / peak) * 10000);
      if (dd > maxDrawdownBps) maxDrawdownBps = dd;
    }

    // Herfindahl index over final allocation (incl. cash), 0..10000
    const parts = [s.cash, ...Object.values(s.holdings)].filter((v) => v > 0);
    const total = parts.reduce((a, b) => a + b, 0);
    const hhi = total > 0 ? Math.round(parts.reduce((a, v) => a + Math.pow((v / total) * 100, 2), 0)) : 10000;

    const heldLong = Object.values(s.holdTurns).filter((t) => t >= 6).length;
    const diversified = hhi <= 4000 && heldLong >= 3;
    const flags = [...s.behaviorFlags];
    if (diversified) flags.push("flag_diversified");

    const insights: string[] = [];
    if (flags.includes("flag_panic_sell")) insights.push("ins_panic_costs");
    if (flags.includes("flag_fomo_buy")) insights.push("ins_fomo_costs");
    if (totalReturnBps < benchmarkReturnBps) insights.push("ins_benchmark_humble");
    if (diversified) insights.push("ins_diversification");
    return {
      finished: true,
      status: "COMPLETED",
      summary: {
        finalValueVnd: String(finalValue),
        totalReturnBps,
        benchmarkReturnBps,
        maxDrawdownBps,
        herfindahlIndex: hhi,
        tradesCount: s.tradesCount,
        feesPaidVnd: String(s.feesPaid),
        behaviorFlags: flags,
        grade:
          totalReturnBps > benchmarkReturnBps && diversified
            ? "A"
            : totalReturnBps > 0
              ? "B"
              : "C",
        insights,
        awardBadge: diversified ? "SIM_INVEST_DIVERSIFIED" : null,
      },
    };
  },
};
