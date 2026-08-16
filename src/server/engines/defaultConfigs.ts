// Seed configs for the 5 sim definitions - doc 04 §2–§6. Authored JSON, no display strings
// (text keys resolve via sim_definition_translation.textBundle).

export const BUDGET_CONFIG = {
  months: 3,
  monthlyIncomeVnd: "6500000",
  openingCashVnd: "1000000",
  fixedBills: [
    { key: "bill_rent", amountVnd: "1800000" },
    { key: "bill_phone", amountVnd: "120000" },
  ],
  categories: [
    { key: "cat_food", kind: "NEED", minVnd: "1200000", recommendedVnd: "1800000" },
    { key: "cat_transport", kind: "NEED", minVnd: "300000", recommendedVnd: "500000" },
    { key: "cat_fun", kind: "WANT", minVnd: "0", recommendedVnd: "800000" },
    { key: "cat_clothes", kind: "WANT", minVnd: "0", recommendedVnd: "400000" },
    { key: "cat_savings", kind: "SAVING", minVnd: "0", recommendedVnd: "1300000" },
  ],
  events: [
    {
      key: "evt_motorbike_repair",
      weight: 3,
      type: "EXPENSE",
      amountVnd: "700000",
      choices: [
        { key: "ch_pay_now", effect: { cashVnd: "-700000" } },
        { key: "ch_delay", effect: { cashVnd: "-200000", nextMonthExtraVnd: "700000" } },
      ],
    },
    { key: "evt_bonus", weight: 1, type: "INCOME", amountVnd: "500000", choices: [] },
    {
      key: "evt_friend_borrow",
      weight: 2,
      type: "CHOICE",
      amountVnd: "300000",
      choices: [
        { key: "ch_lend", effect: { cashVnd: "-300000", repayChanceBps: 6000, repayMonthOffset: 1 } },
        { key: "ch_decline", effect: {} },
      ],
    },
  ],
  allowDebt: false,
  eventCountPerMonth: { min: 0, max: 2 },
  savingsMonthlyInterestBps: 40,
  presets: { default: {}, hard: { monthlyIncomeVnd: "5200000" } },
};

export const LOANS_CONFIG = {
  goalKey: "goal_laptop",
  goalPriceVnd: "18000000",
  // Must cover goal + the worst upfront fee (offer_retail 1.4M) after any loan
  playerCashVnd: "5500000",
  monthlyBudgetVnd: "2500000",
  redFlagRevealAfter: 2,
  offers: [
    {
      key: "offer_bank",
      principalVnd: "14000000",
      annualRateBps: 1400,
      termMonths: 12,
      method: "ANNUITY",
      upfrontFeeVnd: "200000",
      earlyRepayPenaltyBps: 200,
      legit: true,
    },
    {
      key: "offer_retail",
      principalVnd: "14000000",
      annualRateBps: 0,
      termMonths: 6,
      method: "ANNUITY",
      upfrontFeeVnd: "1400000",
      earlyRepayPenaltyBps: 0,
      legit: true,
      marketingKey: "mk_zero_percent",
    },
    {
      key: "offer_app",
      principalVnd: "14000000",
      annualRateBps: 9500,
      termMonths: 12,
      method: "DECLINING_BALANCE",
      upfrontFeeVnd: "0",
      earlyRepayPenaltyBps: 0,
      legit: false,
      redFlags: ["rf_no_license", "rf_contact_access", "rf_daily_calls"],
    },
  ],
  incomeEvents: [
    { key: "evt_overtime", weight: 2, amountVnd: "800000" },
    { key: "evt_income_drop", weight: 2, amountVnd: "-900000" },
  ],
  months: 12,
};

export const SCAM_CONFIG = {
  rounds: 10,
  timerSecondsPerRound: null,
  livesMode: false,
  scoring: { correctFlag: 10, correctTrust: 10, missedScam: -10, falseAlarm: -5, cueBonusEach: 2 },
  pool: [
    { key: "msg_bank_otp", channel: "SMS", isScam: true, scamType: "OTP_PHISHING", cues: ["cue_urgent", "cue_link_odd", "cue_asks_otp"] },
    { key: "msg_real_promo", channel: "EMAIL", isScam: false, cues: [] },
    { key: "msg_invest_30pct", channel: "ZALO", isScam: true, scamType: "PONZI", cues: ["cue_guaranteed_return", "cue_pressure_recruit"] },
    { key: "msg_parcel_fee", channel: "SMS", isScam: true, scamType: "FEE_ADVANCE", cues: ["cue_unexpected_parcel", "cue_small_fee_first"] },
    { key: "msg_real_bank_notice", channel: "SMS", isScam: false, cues: [] },
    { key: "msg_fake_police", channel: "CALL", isScam: true, scamType: "IMPERSONATION", cues: ["cue_authority_pressure", "cue_secrecy", "cue_transfer_now"] },
    { key: "msg_job_like_video", channel: "ZALO", isScam: true, scamType: "TASK_SCAM", cues: ["cue_easy_money", "cue_deposit_first"] },
    { key: "msg_real_school_fee", channel: "EMAIL", isScam: false, cues: [] },
    { key: "msg_lottery_win", channel: "SMS", isScam: true, scamType: "PRIZE", cues: ["cue_never_entered", "cue_fee_to_claim"] },
    { key: "msg_real_delivery", channel: "SMS", isScam: false, cues: [] },
    { key: "msg_bank_upgrade_link", channel: "SMS", isScam: true, scamType: "OTP_PHISHING", cues: ["cue_link_odd", "cue_urgent"] },
    { key: "msg_friend_borrow_fb", channel: "FACEBOOK", isScam: true, scamType: "IMPERSONATION", cues: ["cue_odd_wording", "cue_new_account_number"] },
    { key: "msg_real_promo_momo", channel: "APP", isScam: false, cues: [] },
    { key: "msg_crypto_double", channel: "TELEGRAM", isScam: true, scamType: "PONZI", cues: ["cue_guaranteed_return", "cue_urgent"] },
    { key: "msg_real_bill_reminder", channel: "SMS", isScam: false, cues: [] },
    { key: "msg_hui_invite", channel: "ZALO", isScam: true, scamType: "PONZI", cues: ["cue_guaranteed_return", "cue_friend_pressure"] },
    { key: "msg_visa_lottery", channel: "EMAIL", isScam: true, scamType: "PRIZE", cues: ["cue_never_entered", "cue_fee_to_claim", "cue_odd_sender"] },
    { key: "msg_real_2fa_notice", channel: "EMAIL", isScam: false, cues: [] },
    { key: "msg_loan_instant", channel: "SMS", isScam: true, scamType: "BLACK_CREDIT", cues: ["cue_no_paperwork", "cue_daily_interest"] },
    { key: "msg_real_survey", channel: "EMAIL", isScam: false, cues: [] },
    { key: "msg_sim_swap", channel: "CALL", isScam: true, scamType: "OTP_PHISHING", cues: ["cue_asks_otp", "cue_urgency_network"] },
    { key: "msg_real_refund", channel: "APP", isScam: false, cues: [] },
    { key: "msg_gov_subsidy", channel: "SMS", isScam: true, scamType: "IMPERSONATION", cues: ["cue_link_odd", "cue_personal_info_ask"] },
    { key: "msg_real_event_ticket", channel: "EMAIL", isScam: false, cues: [] },
  ],
};

export const BUSINESS_CONFIG = {
  weeks: 8,
  openingCashVnd: "3000000",
  product: { key: "prod_tra_chanh", unitCostVnd: "6000", spoilagePctBpsPerWeek: 2000 },
  demandCurve: { basePriceVnd: "15000", baseDemandUnits: 120, elasticity: -1.6, noiseBps: 1500 },
  weather: [
    { key: "w_sunny", weight: 5, demandMultBps: 12000 },
    { key: "w_cloudy", weight: 4, demandMultBps: 10000 },
    { key: "w_rain", weight: 3, demandMultBps: 6000 },
  ],
  upgrades: [
    { key: "up_sign", costVnd: "500000", demandMultBps: 11000 },
    { key: "up_fridge", costVnd: "1500000", spoilageMultBps: 3000 },
  ],
  fixedCostPerWeekVnd: "200000",
  events: [{ key: "evt_inspection", weight: 1, costVnd: "300000" }],
  priceMinVnd: "1000",
  priceMaxVnd: "100000",
};

export const INVEST_CONFIG = {
  turns: 12,
  turnLabelKey: "quarter",
  startingCashVnd: "20000000",
  assets: [
    { key: "as_savings", class: "DEPOSIT", meanReturnBps: 120, volBps: 10, feeBps: 0 },
    { key: "as_bond", class: "BOND", meanReturnBps: 200, volBps: 300, feeBps: 20 },
    { key: "as_bluechip", class: "STOCK", meanReturnBps: 350, volBps: 1200, feeBps: 30 },
    {
      key: "as_hotcoin",
      class: "CRYPTO",
      meanReturnBps: 500,
      volBps: 4500,
      feeBps: 50,
      crashChanceBps: 800,
      crashSizeBps: -6000,
    },
  ],
  newsEvents: [
    { key: "news_hotcoin_hype", affects: "as_hotcoin", biasBps: 0, weight: 3 },
    { key: "news_rate_cut", affects: "as_bond", biasBps: 150, weight: 2 },
    { key: "news_market_calm", affects: null, biasBps: 0, weight: 4 },
    { key: "news_bluechip_earnings", affects: "as_bluechip", biasBps: 100, weight: 2 },
  ],
  rebalanceFeeVnd: "10000",
};

export const SIM_SEEDS: Array<{
  slug: string;
  type: "BUDGET" | "LOANS" | "SCAM" | "BUSINESS" | "INVEST";
  order: number;
  estimatedMinutes: number;
  config: object;
  vi: { title: string; subtitle: string; description: string };
  en: { title: string; subtitle: string; description: string };
}> = [
  {
    slug: "thang-luong-dau-tien",
    type: "BUDGET",
    order: 1,
    estimatedMinutes: 12,
    config: BUDGET_CONFIG,
    vi: {
      title: "Tháng lương đầu tiên",
      subtitle: "Cân đối chi tiêu trong ba tháng đầu đi làm",
      description:
        "Phân bổ thu nhập cho nhu cầu, mong muốn và tiết kiệm, xử lý các sự cố bất ngờ và giữ cho số dư không bị âm.",
    },
    en: {
      title: "First paycheck month",
      subtitle: "Balance spending in your first three months of work",
      description:
        "Allocate income across needs, wants, and savings, handle surprise expenses, and keep the balance from going negative.",
    },
  },
  {
    slug: "vay-khon-ngoan",
    type: "LOANS",
    order: 2,
    estimatedMinutes: 15,
    config: LOANS_CONFIG,
    vi: {
      title: "Vay khôn ngoan",
      subtitle: "Chọn khoản vay tốt nhất để mua laptop",
      description:
        "So sánh lãi suất, phí ẩn và kỳ hạn. Nhận diện tín dụng đen và học cách trả nợ sớm.",
    },
    en: {
      title: "Borrow wisely",
      subtitle: "Pick the best loan to buy a laptop",
      description:
        "Compare interest rates, hidden fees, and terms. Spot illegal lenders and learn how early repayment works.",
    },
  },
  {
    slug: "san-lua-dao",
    type: "SCAM",
    order: 3,
    estimatedMinutes: 8,
    config: SCAM_CONFIG,
    vi: {
      title: "Nhận diện lừa đảo",
      subtitle: "Phân biệt tin nhắn thật và tin nhắn lừa đảo",
      description:
        "Mười tình huống thường gặp: lấy cắp mã OTP, đa cấp Ponzi, giả danh công an, việc nhẹ lương cao.",
    },
    en: {
      title: "Spot the scam",
      subtitle: "Tell real messages from scam messages",
      description:
        "Ten common situations: OTP theft, Ponzi schemes, fake police, and easy-money job offers.",
    },
  },
  {
    slug: "quan-nuoc-cua-toi",
    type: "BUSINESS",
    order: 4,
    estimatedMinutes: 15,
    config: BUSINESS_CONFIG,
    vi: {
      title: "Quán nước của tôi",
      subtitle: "Kinh doanh trà chanh 8 tuần",
      description:
        "Định giá, nhập hàng và nâng cấp quán, qua đó hiểu doanh thu, chi phí và lợi nhuận trên mỗi sản phẩm.",
    },
    en: {
      title: "My drink stall",
      subtitle: "Run a lemonade shop for 8 weeks",
      description:
        "Price, stock, and upgrade the stall to learn revenue, costs, and profit per product.",
    },
  },
  {
    slug: "danh-muc-dau-tien",
    type: "INVEST",
    order: 5,
    estimatedMinutes: 15,
    config: INVEST_CONFIG,
    vi: {
      title: "Danh mục đầu tiên",
      subtitle: "12 quý đầu tư với tài sản mô phỏng",
      description:
        "Rủi ro và lợi nhuận, đa dạng hóa, phí giao dịch, và cách tin tức đánh lừa cảm xúc nhà đầu tư.",
    },
    en: {
      title: "First portfolio",
      subtitle: "12 quarters of investing with simulated assets",
      description:
        "Risk and return, diversification, trading fees, and how news can trick an investor's emotions.",
    },
  },
];
