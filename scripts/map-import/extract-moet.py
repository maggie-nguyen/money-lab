#!/usr/bin/env python3
"""Extract Hanoi (01) and HCMC (02) THPT rows from MOET PDF → JSON."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

PDF = Path(__file__).resolve().parents[2] / "prisma/data/moet-thpt-2024.pdf"
OUT = Path(__file__).resolve().parents[2] / "prisma/data/moet-thpt-hanoi-hcm.json"

PROVINCE = {"01": "hanoi", "02": "saigon"}

# Header row ends with school code + moet code, then name + address until KV3
ENTRY_RE = re.compile(
    r"(?P<stt>\d+)\s+"
    r"(?P<prov>0[12])\s+"
    r"(?:Tp\.\s+)?(?:Hà Nội|Hồ Chí Minh|Tp\. Hồ Chí Minh)[^\d]*"
    r"(?P<distcode>\d{2})\s+"
    r"(?P<distname>Quận \d+|Q\.\d+|.+?)\s+"
    r"(?P<schoolcode>\d{3})\s+"
    r"(?P<moetcode>0[12]\d{3})\s+"
    r"(?P<rest>.+?)\s+KV3",
    re.DOTALL,
)

ADDR_START = re.compile(
    r"\b(Số\s+\d|Ngõ\s+\d|Ng\.\s+\d|\d+\s+phố|\d+\s+Đ\.|P\.|Q\.|phường\s|đường\s|Thị trấn|Xã\s|Ấp\s)",
    re.I,
)


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def split_name_addr(rest: str) -> tuple[str, str]:
    rest = normalize(rest)
    m = ADDR_START.search(rest)
    if not m:
        return rest, ""
    name = normalize(rest[: m.start()])
    addr = normalize(rest[m.start() :])
    return name, addr


def extract_rows(text: str) -> list[dict]:
    flat = re.sub(r"\s+", " ", text)
    rows: list[dict] = []
    for m in ENTRY_RE.finditer(flat):
        prov = m.group("prov")
        cluster = PROVINCE.get(prov)
        if not cluster:
            continue
        name, addr = split_name_addr(m.group("rest"))
        if not name.upper().startswith("THPT"):
            continue
        if len(name) < 8:
            continue
        rows.append(
            {
                "clusterSlug": cluster,
                "provinceCode": prov,
                "districtCode": m.group("distcode"),
                "districtName": normalize(m.group("distname")),
                "schoolCode": m.group("schoolcode"),
                "moetCode": m.group("moetcode"),
                "name": name,
                "address": addr,
            }
        )
    # Dedupe by moet code
    seen: set[str] = set()
    unique: list[dict] = []
    for r in rows:
        if r["moetCode"] in seen:
            continue
        seen.add(r["moetCode"])
        unique.append(r)
    return unique


def main() -> None:
    if not PDF.exists():
        print(f"Missing {PDF}", file=sys.stderr)
        sys.exit(1)
    reader = PdfReader(str(PDF))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    rows = extract_rows(text)
    counts = {k: sum(1 for r in rows if r["clusterSlug"] == k) for k in PROVINCE.values()}
    OUT.write_text(json.dumps({"rows": rows, "counts": counts}, ensure_ascii=False, indent=2), "utf8")
    print(f"Wrote {len(rows)} THPT rows → {OUT}")
    print("Counts:", counts)
    if rows:
        print("Sample:", rows[0]["name"], "|", rows[0]["address"][:60])


if __name__ == "__main__":
    main()
