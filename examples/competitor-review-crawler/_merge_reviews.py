"""3개 사이트 raw JSON을 합쳐서 요청한 스키마(사이트명/옵션명/고객명/별점/리뷰내용/날짜)로 엑셀 저장."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

ILLEGAL_XLSX_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")

ROOT = Path(__file__).resolve().parent
SKILL_SCRIPTS = ROOT / ".claude" / "skills" / "review-crawler" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from save_excel import save_xlsx  # noqa: E402

SOURCES = [
    {
        "site": "카멜마운트",
        "raw": ROOT / "output" / "brand.naver.com" / "20260421_camelmount_raw.json",
        "url": "https://brand.naver.com/camelmount/products/9842177372",
    },
    {
        "site": "빌티니",
        "raw": ROOT / "output" / "builtini.co.kr" / "20260421_builtini_raw.json",
        "url": "https://builtini.co.kr/product/detail.html?product_no=139",
    },
    {
        "site": "모블랩스",
        "raw": ROOT / "output" / "smartstore.naver.com" / "20260421_movlabs_raw.json",
        "url": "https://smartstore.naver.com/movlabs/products/7869285606",
    },
]


def _normalize_date(raw: str) -> str:
    if not raw:
        return ""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return raw


def _clean_body(raw: str) -> str:
    """XLSX 비허용 제어문자 제거 + 앞뒤 공백 정리."""
    if not raw:
        return ""
    return ILLEGAL_XLSX_RE.sub("", raw).strip()


def collect_rows() -> list[dict]:
    combined: list[dict] = []
    for src in SOURCES:
        data = json.loads(src["raw"].read_text(encoding="utf-8"))
        raw_rows = data.get("rows", [])
        for r in raw_rows:
            combined.append({
                "사이트명": src["site"],
                "옵션명": _clean_body(r.get("option", "")),
                "고객명": _clean_body(r.get("author", "")),
                "별점": r.get("rating"),
                "리뷰 내용": _clean_body(r.get("body", "")),
                "리뷰 남긴 날짜": _normalize_date(r.get("date", "")),
                "상품명": _clean_body(r.get("product_name", "")),
                "상품 URL": src["url"],
            })
        print(f"[merge] {src['site']}: {len(raw_rows)}건")
    return combined


def main() -> int:
    rows = collect_rows()
    ts = datetime.now().strftime("%Y%m%d_%H%M")

    combined_path = ROOT / "output" / f"{ts}_경쟁사_리뷰_3사_통합.xlsx"
    save_xlsx(rows, combined_path)
    print(f"[merge] 통합 {len(rows)}건 저장: {combined_path}")

    by_site: dict[str, list] = {}
    for r in rows:
        by_site.setdefault(r["사이트명"], []).append(r)

    for src in SOURCES:
        site = src["site"]
        site_rows = by_site.get(site, [])
        if not site_rows:
            continue
        domain_dir = src["raw"].parent
        per_site_path = domain_dir / f"{ts}_{domain_dir.name}_reviews.xlsx"
        save_xlsx(site_rows, per_site_path)
        print(f"  - {site}: {len(site_rows)}건 → {per_site_path.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
