// Static reference data served by /meta/* and used for validation (doc 03 §12).
// Kept in code, not the DB: it changes at most once per administrative reform and must be
// identical across environments.

/**
 * Vietnam's 34 provincial-level units after the 2025 merger (6 municipalities + 28 provinces),
 * plus OTHER. Keys are stable ASCII; only the label is localized. Doc 02 §2 (`enum Province`).
 */
export const PROVINCES: Array<{ key: string; vi: string }> = [
  // Municipalities
  { key: "HANOI", vi: "Hà Nội" },
  { key: "HAIPHONG", vi: "Hải Phòng" },
  { key: "HUE", vi: "Huế" },
  { key: "DANANG", vi: "Đà Nẵng" },
  { key: "HCMC", vi: "TP. Hồ Chí Minh" },
  { key: "CANTHO", vi: "Cần Thơ" },
  // Provinces
  { key: "LAICHAU", vi: "Lai Châu" },
  { key: "DIENBIEN", vi: "Điện Biên" },
  { key: "SONLA", vi: "Sơn La" },
  { key: "LAOCAI", vi: "Lào Cai" },
  { key: "TUYENQUANG", vi: "Tuyên Quang" },
  { key: "THAINGUYEN", vi: "Thái Nguyên" },
  { key: "CAOBANG", vi: "Cao Bằng" },
  { key: "LANGSON", vi: "Lạng Sơn" },
  { key: "QUANGNINH", vi: "Quảng Ninh" },
  { key: "PHUTHO", vi: "Phú Thọ" },
  { key: "BACNINH", vi: "Bắc Ninh" },
  { key: "HUNGYEN", vi: "Hưng Yên" },
  { key: "NINHBINH", vi: "Ninh Bình" },
  { key: "THANHHOA", vi: "Thanh Hóa" },
  { key: "NGHEAN", vi: "Nghệ An" },
  { key: "HATINH", vi: "Hà Tĩnh" },
  { key: "QUANGTRI", vi: "Quảng Trị" },
  { key: "QUANGNGAI", vi: "Quảng Ngãi" },
  { key: "GIALAI", vi: "Gia Lai" },
  { key: "DAKLAK", vi: "Đắk Lắk" },
  { key: "KHANHHOA", vi: "Khánh Hòa" },
  { key: "LAMDONG", vi: "Lâm Đồng" },
  { key: "DONGNAI", vi: "Đồng Nai" },
  { key: "TAYNINH", vi: "Tây Ninh" },
  { key: "VINHLONG", vi: "Vĩnh Long" },
  { key: "DONGTHAP", vi: "Đồng Tháp" },
  { key: "ANGIANG", vi: "An Giang" },
  { key: "CAMAU", vi: "Cà Mau" },
  { key: "OTHER", vi: "Tỉnh/thành khác" },
];

export const PROVINCE_KEYS: string[] = PROVINCES.map((p) => p.key);

const provinceSet = new Set(PROVINCE_KEYS);
export function isProvinceKey(v: string): boolean {
  return provinceSet.has(v);
}

/** Avatar art shipped as static assets under /public/avatars. */
export const AVATARS: Array<{ key: string; url: string }> = [
  "piggy",
  "wallet",
  "coin",
  "chart",
  "shield",
  "rocket",
  "cat",
  "dog",
  "owl",
  "fox",
  "robot",
  "student",
].map((key) => ({ key, url: `/avatars/${key}.svg` }));

const avatarSet = new Set(AVATARS.map((a) => a.key));
export function isAvatarKey(v: string): boolean {
  return avatarSet.has(v);
}

/** Product-analytics event allowlist - doc 02 §9. Anything else is rejected per-event. */
export const EVENT_NAMES = [
  "page_view",
  "lesson_start",
  "lesson_block_view",
  "lesson_complete",
  "quiz_start",
  "quiz_submit",
  "sim_start",
  "sim_action",
  "sim_complete",
  "sim_abandon",
  "tool_used",
  "search",
  "signup",
  "login",
  "share_click",
  "cert_view",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
const eventSet: Set<string> = new Set(EVENT_NAMES);
export function isEventName(v: string): boolean {
  return eventSet.has(v);
}
