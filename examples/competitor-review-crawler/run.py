"""경쟁사 리뷰 크롤러 CLI.

이 스크립트는 **재실행용 thin wrapper**이다. 도메인에 이미 저장된 셀렉터 프로필이
있다면 에이전트 없이 바로 크롤링 → 엑셀 저장까지 실행한다.

프로필이 없는 최초 크롤링 또는 DOM이 크게 변한 경우에는 Claude Code에서
`review-crawler` 스킬을 사용한다 — 에이전트가 구조 분석 & 필드 매핑을 담당한다.

CLI 사용:
  python run.py <URL> [--max-pages N|all] [--force-skill]

종료 코드:
  0 성공, 1 부분 성공, 2 실패, 10 장애물 감지 (에이전트 개입 필요)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent / ".claude" / "skills" / "review-crawler" / "scripts"
sys.path.insert(0, str(SKILL_DIR))

from domain_notes import load, find_matching_profile, update_selectors, append_note  # noqa: E402
from scrape import scrape  # noqa: E402
from save_excel import save  # noqa: E402


def _format_skill_message(url: str, domain: str, ctx: dict) -> str:
    return f"""
이 URL에 대한 셀렉터 프로필이 없습니다.

  URL:    {url}
  도메인: {domain}
  노트:   {'있음' if ctx.get('notes') else '없음'}

최초 크롤링은 Claude Code에서 `review-crawler` 스킬로 실행해주세요:

  claude > 이 URL의 리뷰를 크롤링해줘: {url}
          제목, 별점, 작성자, 내용을 뽑아줘.

에이전트가 페이지 구조를 분석하고 셀렉터를 저장하면,
이후부터는 `python run.py {url}` 로 바로 재실행 가능합니다.
""".strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="경쟁사 리뷰 크롤러 (재실행용)")
    parser.add_argument("url")
    parser.add_argument("--max-pages", default="all", help="페이지 상한 (기본 전체)")
    parser.add_argument(
        "--fields",
        nargs="+",
        default=None,
        help="요청 필드 키 목록 (프로필 매칭용, 생략 시 프로필의 모든 필드 사용)",
    )
    args = parser.parse_args(argv)

    ctx = load(args.url)
    domain = ctx["domain"]

    requested = args.fields or list((ctx.get("selectors") or {}).get("profiles", [{}])[0].get("fields", {}).keys())
    profile = find_matching_profile(ctx.get("selectors"), args.url, requested)

    if not profile:
        print(_format_skill_message(args.url, domain, ctx), file=sys.stderr)
        return 2

    print(f"[run] 도메인: {domain} / 프로필 재사용 (last_verified={profile.get('last_verified')})")

    session = ctx.get("session")
    max_pages = "all" if args.max_pages == "all" else int(args.max_pages)

    result = scrape(args.url, profile, max_pages=max_pages, session=session)

    if result["status"] == "obstacle":
        print(json.dumps({k: v for k, v in result.items() if k != "rows"}, ensure_ascii=False, indent=2))
        print("\n[run] 장애물 감지됨. Claude Code의 `review-crawler` 스킬로 핸드오프 필요.", file=sys.stderr)
        append_note(domain, f"재실행 중 장애물 감지 ({result.get('kind')}) — Claude Code 개입 필요.")
        return 10

    rows = result.get("rows", [])
    ts = datetime.now().strftime("%Y%m%d_%H%M")
    out_dir = Path(ctx["dir"])
    raw_path = out_dir / f"{ts}_raw.json"
    xlsx_path = out_dir / f"{ts}_reviews.xlsx"

    raw_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    save_result = save(rows, xlsx_path)

    profile["last_verified"] = datetime.now().strftime("%Y-%m-%d")
    profile["last_reused_ok"] = result["status"] == "ok"
    update_selectors(domain, profile)

    note = (
        f"재실행: 페이지 {result.get('pages_scraped')}개, 로우 {len(rows)}건, "
        f"status={result['status']}, fetchers={result.get('fetchers_used')}, "
        f"저장={save_result.get('saved')}"
    )
    append_note(domain, note)

    print(json.dumps({
        "status": result["status"],
        "rows": len(rows),
        "pages": result.get("pages_scraped"),
        "saved": save_result.get("saved"),
        "format": save_result.get("format"),
        "errors": result.get("errors"),
    }, ensure_ascii=False, indent=2))

    if result["status"] == "failed":
        return 2
    if result["status"] == "partial":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
