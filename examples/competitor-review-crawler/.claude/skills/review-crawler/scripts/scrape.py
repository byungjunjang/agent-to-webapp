"""Scrapling 전체 순회 크롤링.

CLI 사용:
  python scrape.py <URL> <selectors_path> --out <raw.json>
      [--max-pages N|all] [--session <path>]

종료 코드:
  0 성공, 1 부분 성공 (일부 수집은 있음), 2 fetch 전면 실패, 10 장애물 감지
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

OBSTACLE_RE = re.compile(r"(recaptcha|hcaptcha|captcha|cloudflare|ray\s*id|just a moment)", re.I)
PW_PASSWORD_RE = re.compile(r'<input[^>]*type=["\']?password', re.I)

DEFAULT_RATE_LIMIT = 1.5
MAX_PAGE_HARD_LIMIT = 100


def detect_obstacle_in_html(html: str) -> str | None:
    if OBSTACLE_RE.search(html):
        return "captcha"
    if PW_PASSWORD_RE.search(html) and "review" not in html.lower():
        return "login"
    if len(html) < 500:
        return "short_response"
    return None


def _choose_fetcher(profile: dict):
    name = (profile.get("fetcher") or "stealthy").lower()
    from scrapling.fetchers import StealthyFetcher, PlayWrightFetcher
    return PlayWrightFetcher if name == "playwright" else StealthyFetcher, name


def fetch_page(url: str, profile: dict, session: dict | None = None):
    """StealthyFetcher 시도 후 필요시 PlayWrightFetcher로 폴백."""
    from scrapling.fetchers import StealthyFetcher, PlayWrightFetcher

    preferred, name = _choose_fetcher(profile)
    try:
        if preferred is PlayWrightFetcher and session and session.get("cookies"):
            page = PlayWrightFetcher.fetch(url, headless=True, network_idle=True, cookies=session["cookies"])
        elif preferred is PlayWrightFetcher:
            page = PlayWrightFetcher.fetch(url, headless=True, network_idle=True)
        else:
            page = StealthyFetcher.fetch(url, headless=True)
    except Exception:
        if preferred is StealthyFetcher:
            page = PlayWrightFetcher.fetch(url, headless=True, network_idle=True,
                                            cookies=(session or {}).get("cookies"))
            return page, "playwright"
        raise

    html = page.html_content if hasattr(page, "html_content") else str(page)
    block = profile.get("review_block")
    blocks_found = len(page.css(block)) if block else 0
    need_js = blocks_found == 0 and preferred is StealthyFetcher
    if need_js:
        page = PlayWrightFetcher.fetch(url, headless=True, network_idle=True,
                                        cookies=(session or {}).get("cookies"))
        return page, "playwright"

    return page, name


def _get_value(block, rule: dict) -> str:
    css = rule.get("css")
    attr = rule.get("attr", "text")
    el = block.css_first(css) if css else None
    if el is None:
        return ""
    if attr == "text":
        return (el.text or "").strip()
    if attr == "html":
        return getattr(el, "html_content", "") or ""
    val = el.attrib.get(attr) if hasattr(el, "attrib") else None
    return (val or "").strip()


def extract_rows_from_page(page, profile: dict) -> list[dict]:
    block_sel = profile["review_block"]
    field_rules = profile["fields"]
    blocks = page.css(block_sel)
    rows = []
    for block in blocks:
        row = {name: _get_value(block, rule) for name, rule in field_rules.items()}
        rows.append(row)
    return rows


def _next_url(current_url: str, page, profile: dict, page_num: int) -> str | None:
    pag = profile.get("pagination", {}) or {}
    ptype = pag.get("type")
    if ptype == "next_button":
        sel = pag.get("selector")
        if not sel:
            return None
        el = page.css_first(sel)
        if el is None:
            return None
        href = el.attrib.get("href") if hasattr(el, "attrib") else None
        if not href:
            return None
        return urljoin(current_url, href)
    if ptype == "page_numbers":
        template = pag.get("template", "?page={n}")
        start = pag.get("start", 1)
        next_n = start + page_num
        from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
        if template.startswith("?"):
            parsed = urlparse(current_url)
            params = parse_qs(parsed.query)
            key = template.split("=", 1)[0].lstrip("?")
            params[key] = [str(next_n)]
            new_q = urlencode(params, doseq=True)
            return urlunparse(parsed._replace(query=new_q))
        return urljoin(current_url, template.format(n=next_n))
    return None


def scrape(url: str, profile: dict, max_pages: int | str = "all",
           session: dict | None = None, progress=print) -> dict:
    rows: list[dict] = []
    errors: list[dict] = []
    rate = float(profile.get("rate_limit_sec") or DEFAULT_RATE_LIMIT)
    current = url
    page_num = 0
    consecutive_failures = 0
    fetcher_seen: set[str] = set()

    hard_limit = MAX_PAGE_HARD_LIMIT if max_pages == "all" else min(int(max_pages), MAX_PAGE_HARD_LIMIT)

    while current and page_num < hard_limit:
        page_num += 1
        progress(f"[scrape] page {page_num}: {current}")
        try:
            page, fetcher_used = fetch_page(current, profile, session=session)
            fetcher_seen.add(fetcher_used)
        except Exception as e:
            errors.append({"page": page_num, "url": current, "error": str(e)})
            consecutive_failures += 1
            if consecutive_failures >= 3:
                progress(f"[scrape] 연속 {consecutive_failures}회 실패, 중단")
                break
            time.sleep(rate * 2)
            continue

        html = page.html_content if hasattr(page, "html_content") else str(page)
        obstacle = detect_obstacle_in_html(html)
        if obstacle:
            return {
                "status": "obstacle",
                "kind": obstacle,
                "url": current,
                "rows": rows,
                "pages_scraped": page_num - 1,
                "errors": errors,
            }

        page_rows = extract_rows_from_page(page, profile)
        if not page_rows:
            progress(f"[scrape] page {page_num}: 0 rows, 종료")
            break

        for r in page_rows:
            r["source_url"] = current
            r["page"] = page_num
            r["scraped_at"] = datetime.now().isoformat(timespec="seconds")
        rows.extend(page_rows)
        consecutive_failures = 0

        if isinstance(max_pages, int) and page_num >= max_pages:
            break

        nxt = _next_url(current, page, profile, page_num)
        if not nxt or nxt == current:
            break
        current = nxt
        time.sleep(rate)

    status = "ok" if rows and not errors else ("partial" if rows else "failed")
    return {
        "status": status,
        "rows": rows,
        "pages_scraped": page_num,
        "errors": errors,
        "fetchers_used": sorted(fetcher_seen),
    }


def _cli(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("selectors_path")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--max-pages", default="all")
    parser.add_argument("--session", type=Path, default=None)
    args = parser.parse_args(argv)

    profile = json.loads(Path(args.selectors_path).read_text(encoding="utf-8"))
    session = json.loads(args.session.read_text(encoding="utf-8")) if args.session and args.session.exists() else None
    max_pages = "all" if args.max_pages == "all" else int(args.max_pages)

    result = scrape(args.url, profile, max_pages=max_pages, session=session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}, ensure_ascii=False, indent=2))
    print(f"[scrape] 총 {len(result.get('rows', []))}건 → {args.out}")

    status = result["status"]
    if status == "obstacle":
        return 10
    if status == "failed":
        return 2
    if status == "partial":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli(sys.argv[1:]))
