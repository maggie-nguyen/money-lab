// Canonical error codes - doc 01 §3.4. Do not invent others.

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_STATE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "GONE"
  | "RULE_VIOLATION"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "NOT_IMPLEMENTED";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_STATE: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  GONE: 410,
  RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
};

export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: ErrorDetail[];
  readonly retryAfterSec?: number;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { details?: ErrorDetail[]; retryAfterSec?: number; httpStatus?: number },
  ) {
    super(message);
    this.code = code;
    // `httpStatus` override exists for the one documented case where a canonical code maps to a
    // different status: upstream AI failure → code INTERNAL, status 502 (doc 03 §9.4).
    this.httpStatus = opts?.httpStatus ?? STATUS[code];
    this.details = opts?.details;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

const NOT_FOUND_LABELS: Record<string, string> = {
  Resource: "tài nguyên",
  Track: "chủ đề",
  Course: "khóa học",
  Lesson: "bài học",
  Quiz: "bài kiểm tra",
  Question: "câu hỏi",
  "Check question": "câu hỏi ôn tập",
  Attempt: "lượt làm bài",
  "Lesson progress": "tiến độ bài học",
  Session: "phiên",
  "Sim session": "phiên mô phỏng",
  Simulation: "mô phỏng",
  Sim: "mô phỏng",
  Article: "bài viết",
  Translation: "bản dịch",
  User: "tài khoản",
  Certificate: "chứng chỉ",
  Survey: "khảo sát",
  Thread: "cuộc trò chuyện",
  "Shop item": "vật phẩm",
};

export const notFound = (what = "Resource"): AppError =>
  new AppError("NOT_FOUND", `Không tìm thấy ${NOT_FOUND_LABELS[what] ?? what.toLowerCase()}.`);
export const forbidden = (msg = "Bạn không có quyền thực hiện thao tác này."): AppError => new AppError("FORBIDDEN", msg);
export const unauthenticated = (msg = "Vui lòng đăng nhập để tiếp tục."): AppError =>
  new AppError("UNAUTHENTICATED", msg);
export const conflict = (msg: string, details?: ErrorDetail[]): AppError =>
  new AppError("CONFLICT", msg, { details });
export const versionConflict = (msg = "Stale version"): AppError =>
  new AppError("VERSION_CONFLICT", msg);
export const gone = (msg = "Expired"): AppError => new AppError("GONE", msg);
export const ruleViolation = (machineCode: string, msg?: string): AppError =>
  new AppError("RULE_VIOLATION", msg ?? machineCode, {
    details: [{ path: "", message: machineCode }],
  });
export const invalidState = (msg: string): AppError => new AppError("INVALID_STATE", msg);
