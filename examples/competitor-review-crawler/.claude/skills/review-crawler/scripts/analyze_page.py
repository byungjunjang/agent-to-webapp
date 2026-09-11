"""agent-browser 스냅샷을 받아 DOM 요약·반복 요소 후보를 추출.

에이전트가 agent-browser 스킬로 얻은 HTML을 stdin 또는 파일로 넘기면,
이 스크립트가 반복 요소 후보를 식별하고 장애물 키워드를 감지한다.

CLI 사용:
  python analyze_page.py analyze --html-file <path> [--url <url>]
      -> {"candidates":[{"selector","count","sample"}], "obstacles":[...], ...}
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

try:
    from lxml import html as lxml_html
except ImportError:
    print("[analyze_page] lxml 필요: pip install lxml", file=sys.stderr)
    raise

OBSTACLE_PATTERNS = {
    "captcha": re.compile(r"\b(recaptcha|hcaptcha|captcha)\b", re.I),
    "cloudflare": re.compile(r"(cloudflare|ray\s*id|just a moment)", re.I),
    "login": re.compile(r'<input[^>]*type=["\']?password', re.I),
}

MIN_REPEAT = 3
MAX_CANDIDATES = 8


def detect_obstacles(html_text: str) -> list[str]:
    found = []
    for kind, pat in OBSTACLE_PATTERNS.items():
        if pat.search(html_text):
            found.append(kind)
    if len(html_text) < 500:
        found.append("short_response")
    return found


def _element_signature(el) -> str:
    """같은 구조 반복 요소를 묶기 위한 시그니처: tag + 가장 첫 class 토큰."""
    tag = el.tag
    cls = (el.get("class") or "").strip().split()
    if cls:
        return f"{tag}.{cls[0]}"
    return tag


def find_repeat_candidates(tree) -> list[dict]:
    """같은 부모 아래 같은 시그니처가 반복되는 그룹을 찾는다."""
    groups: dict[tuple[int, str], list] = {}
    for el in tree.iter():
        parent = el.getparent()
        if parent is None:
            continue
        sig = _element_signature(el)
        key = (id(parent), sig)
        groups.setdefault(key, []).append(el)

    candidates = []
    seen_selectors = set()
    for (_, sig), els in groups.items():
        if len(els) < MIN_REPEAT:
            continue
        selector = sig
        if selector in seen_selectors:
            continue
        seen_selectors.add(selector)
        sample = els[0]
        sample_text = (sample.text_content() or "").strip()
        candidates.append({
            "selector": selector,
            "count": len(els),
            "sample_text": sample_text[:200],
            "inner_signature": _inner_signature(sample),
        })

    candidates.sort(key=lambda c: (-c["count"], c["selector"]))
    return candidates[:MAX_CANDIDATES]


def _inner_signature(el) -> list[str]:
    """샘플 요소 내부에서 보이는 주요 태그/클래스를 나열."""
    sigs = []
    for child in el.iter():
        if child is el:
            continue
        cls = (child.get("class") or "").strip().split()
        if cls:
            sigs.append(f"{child.tag}.{cls[0]}")
        else:
            sigs.append(child.tag)
    # 빈도 상위 20개
    common = [s for s, _ in Counter(sigs).most_common(20)]
    return common


def analyze(html_text: str, url: str | None = None) -> dict:
    try:
        tree = lxml_html.fromstring(html_text)
    except Exception as e:
        return {"error": f"HTML 파싱 실패: {e}", "obstacles": detect_obstacles(html_text)}

    obstacles = detect_obstacles(html_text)
    candidates = find_repeat_candidates(tree)

    pagination_hint = _guess_pagination(tree, html_text)

    return {
        "url": url,
        "obstacles": obstacles,
        "candidates": candidates,
        "pagination_hint": pagination_hint,
        "byte_size": len(html_text),
    }


def _guess_pagination(tree, html_text: str) -> dict:
    next_link = tree.xpath('//a[@rel="next"] | //a[contains(@class,"next")] | //a[contains(.,"다음")] | //a[contains(.,"Next")]')
    if next_link:
        el = next_link[0]
        href = el.get("href")
        return {"type": "next_button", "sample_selector": "a[rel=next]" if el.get("rel") == "next" else "a.next", "sample_href": href}
    if re.search(r"[?&]page=\d+", html_text):
        return {"type": "page_numbers", "template": "?page={n}", "start": 1}
    return {"type": "unknown"}


def _cli(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="페이지 구조 분석")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("analyze")
    p.add_argument("--html-file", required=True)
    p.add_argument("--url", default=None)

    args = parser.parse_args(argv)

    if args.cmd == "analyze":
        html_text = Path(args.html_file).read_text(encoding="utf-8", errors="ignore")
        result = analyze(html_text, url=args.url)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(_cli(sys.argv[1:]))
