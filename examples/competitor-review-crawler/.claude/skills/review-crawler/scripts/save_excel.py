"""크롤링 결과 JSON → 엑셀(.xlsx), 실패 시 .csv 폴백.

CLI 사용:
  python save_excel.py <raw_json_path> <xlsx_path>
      -> 성공 시 xlsx 경로를 stdout에 출력, 실패 시 csv 경로.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

META_COLS = ["source_url", "page", "scraped_at"]


def _ordered_columns(rows: list[dict]) -> list[str]:
    seen: list[str] = []
    for r in rows:
        for k in r.keys():
            if k not in seen:
                seen.append(k)
    # 메타 컬럼을 맨 뒤로
    body = [c for c in seen if c not in META_COLS]
    tail = [c for c in META_COLS if c in seen]
    return body + tail


def save_xlsx(rows: list[dict], xlsx_path: Path) -> Path:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font

    columns = _ordered_columns(rows)
    wb = Workbook()
    ws = wb.active
    ws.title = "reviews"
    ws.append(columns)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(vertical="top")

    for row in rows:
        ws.append([row.get(c, "") for c in columns])

    wrap = Alignment(wrap_text=True, vertical="top")
    for col_idx, name in enumerate(columns, start=1):
        letter = ws.cell(row=1, column=col_idx).column_letter
        ws.column_dimensions[letter].width = 40 if name in ("body", "content", "text") else 20
        for row_idx in range(2, ws.max_row + 1):
            ws.cell(row=row_idx, column=col_idx).alignment = wrap

    ws.freeze_panes = "A2"
    xlsx_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(xlsx_path)
    return xlsx_path


def save_csv(rows: list[dict], csv_path: Path) -> Path:
    columns = _ordered_columns(rows)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return csv_path


def save(rows: list[dict], xlsx_path: Path) -> dict:
    if not rows:
        return {"saved": None, "reason": "no rows"}
    try:
        p = save_xlsx(rows, xlsx_path)
        return {"saved": str(p), "format": "xlsx", "count": len(rows)}
    except Exception as e:
        csv_path = xlsx_path.with_suffix(".csv")
        p = save_csv(rows, csv_path)
        return {"saved": str(p), "format": "csv", "count": len(rows), "fallback_reason": str(e)}


def _cli(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("raw_json_path", type=Path)
    parser.add_argument("xlsx_path", type=Path)
    args = parser.parse_args(argv)

    data = json.loads(args.raw_json_path.read_text(encoding="utf-8"))
    rows = data.get("rows", data) if isinstance(data, dict) else data
    if not isinstance(rows, list):
        print("[save_excel] raw JSON에 rows 리스트가 없습니다.", file=sys.stderr)
        return 2

    result = save(rows, args.xlsx_path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("saved") else 1


if __name__ == "__main__":
    raise SystemExit(_cli(sys.argv[1:]))
