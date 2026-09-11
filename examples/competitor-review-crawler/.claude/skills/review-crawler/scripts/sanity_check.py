"""셀렉터 프로필로 1페이지 샘플 fetch → 빈값 비율 확인.

CLI 사용:
  python sanity_check.py <URL> <selectors_json_path> [--session <path>]
      -> {"pass":bool, "empty_ratio":float, "sample_rows":[...], "reason":...}

종료 코드:
  0 pass, 1 fail (empty_ratio 임계 초과), 2 fetch 에러, 10 장애물 감지
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from scrape import extract_rows_from_page, fetch_page, detect_obstacle_in_html

EMPTY_RATIO_MAX = 0.5
SAMPLE_SIZE = 2


def sanity_check(url: str, profile: dict, session_path: Path | None = None) -> dict:
    session = _load_session(session_path)
    try:
        page, fetcher_used = fetch_page(url, profile, session=session)
    except Exception as e:
        return {"pass": False, "reason": f"fetch 실패: {e}", "exit_code": 2}

    html = page.html_content if hasattr(page, "html_content") else str(page)
    obstacle = detect_obstacle_in_html(html)
    if obstacle:
        return {"pass": False, "reason": f"장애물 감지: {obstacle}", "exit_code": 10, "obstacle": obstacle}

    rows = extract_rows_from_page(page, profile)[:SAMPLE_SIZE]
    if not rows:
        return {"pass": False, "reason": "리뷰 블록에서 로우를 추출하지 못함", "exit_code": 1, "sample_rows": []}

    total_fields = sum(len(r) for r in rows)
    empty_fields = sum(1 for r in rows for v in r.values() if not v or (isinstance(v, str) and not v.strip()))
    ratio = empty_fields / total_fields if total_fields else 1.0

    passed = ratio < EMPTY_RATIO_MAX
    return {
        "pass": passed,
        "empty_ratio": round(ratio, 3),
        "sample_rows": rows,
        "fetcher_used": fetcher_used,
        "exit_code": 0 if passed else 1,
        "reason": None if passed else f"빈값 비율 {ratio:.1%} ≥ {EMPTY_RATIO_MAX:.0%}",
    }


def _load_session(path: Path | None) -> dict | None:
    if path is None:
        return None
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _cli(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("selectors_path")
    parser.add_argument("--session", type=Path, default=None)
    args = parser.parse_args(argv)

    profile = json.loads(Path(args.selectors_path).read_text(encoding="utf-8"))
    result = sanity_check(args.url, profile, session_path=args.session)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result.get("exit_code", 1)


if __name__ == "__main__":
    raise SystemExit(_cli(sys.argv[1:]))
