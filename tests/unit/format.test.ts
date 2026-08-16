import { describe, expect, it } from "vitest";
import { formatVnd, formatVndApprox, formatVndShort } from "@/lib/format";

describe("formatVnd", () => {
  it("groups đồng with dots and keeps the unit", () => {
    expect(formatVnd("100133641")).toBe("100.133.641 ₫");
  });

  it("keeps a negative sign in front of the digits", () => {
    expect(formatVnd("-2500000")).toBe("-2.500.000 ₫");
  });

  it("renders a dash rather than NaN for anything unparseable", () => {
    expect(formatVnd(null)).toBe("-");
    expect(formatVnd("không phải số")).toBe("-");
  });
});

describe("formatVndApprox", () => {
  it("stays quiet under a million, where the digits already read fine", () => {
    expect(formatVndApprox("999999")).toBeNull();
    expect(formatVndApprox("0")).toBeNull();
  });

  it("glosses a long figure in words", () => {
    expect(formatVndApprox("100133641")).toBe("khoảng 100,1 triệu");
    expect(formatVndApprox("12500000")).toBe("12,5 triệu");
  });

  it("drops khoảng only when the short form is exact", () => {
    expect(formatVndApprox("70000000")).toBe("70 triệu");
    expect(formatVndApprox("70100000")).toBe("70,1 triệu");
    expect(formatVndApprox("70150000")).toBe("khoảng 70,1 triệu");
  });

  it("switches to tỷ above a billion", () => {
    expect(formatVndApprox("1500000000")).toBe("1,5 tỷ");
    expect(formatVndApprox("2340000000")).toBe("khoảng 2,3 tỷ");
  });

  it("keeps the sign on a negative figure", () => {
    expect(formatVndApprox("-5000000")).toBe("-5 triệu");
  });

  it("returns null instead of throwing on junk", () => {
    expect(formatVndApprox(null)).toBeNull();
    expect(formatVndApprox("abc")).toBeNull();
  });
});

describe("formatVndShort", () => {
  it("stays the compact form for tight cells", () => {
    expect(formatVndShort("12500000")).toBe("12,5 tr");
    expect(formatVndShort("100133641")).toBe("100,1 tr");
  });
});
