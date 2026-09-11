"""장애물(captcha/로그인) 발생 시 Playwright 브라우저 창을 사용자에게 이양.

CLI 사용:
  python user_handoff.py <URL> <session_json_path> [--reason <text>]

동작:
  1. Playwright headful 브라우저 오픈
  2. 주어진 URL로 이동
  3. 터미널에 사용자 안내 출력
  4. 사용자가 `done` 입력할 때까지 대기
  5. 쿠키 + localStorage를 session_json_path에 저장
  6. 브라우저 닫기

종료 코드:
  0 성공 저장, 1 사용자 취소/실패
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


BANNER = """
============================================================
 사용자 개입 필요
============================================================
 브라우저 창이 열렸습니다.

 해야 할 일:
   {tasks}

 완료되면 이 터미널에 'done'을 입력하고 Enter.
 취소하려면 'cancel'.
============================================================
"""


def _tasks_for(reason: str | None) -> str:
    reason_l = (reason or "").lower()
    tasks = []
    if "captcha" in reason_l:
        tasks.append("- captcha를 풀어주세요")
    if "login" in reason_l:
        tasks.append("- 로그인을 진행해주세요")
    if "cloudflare" in reason_l:
        tasks.append("- Cloudflare 챌린지가 끝날 때까지 기다려주세요")
    if not tasks:
        tasks.append("- 페이지가 정상적으로 로드되도록 필요한 조치를 해주세요")
    return "\n   ".join(tasks)


def run_handoff(url: str, session_path: Path, reason: str | None = None) -> int:
    from playwright.sync_api import sync_playwright

    origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded")
        except Exception as e:
            print(f"[handoff] 페이지 이동 실패: {e}", file=sys.stderr)

        print(BANNER.format(tasks=_tasks_for(reason)))

        while True:
            try:
                user_in = input("> ").strip().lower()
            except EOFError:
                user_in = "cancel"
            if user_in == "done":
                break
            if user_in == "cancel":
                browser.close()
                return 1
            print("'done' 또는 'cancel' 을 입력해주세요.")

        cookies = context.cookies()
        try:
            local_storage = page.evaluate(
                "() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))"
            )
        except Exception:
            local_storage = {}

        payload = {
            "cookies": cookies,
            "local_storage": local_storage,
            "origin": origin,
            "saved_at": datetime.now().isoformat(timespec="seconds"),
        }
        session_path.parent.mkdir(parents=True, exist_ok=True)
        session_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[handoff] 세션 저장: {session_path} (쿠키 {len(cookies)}개)")

        browser.close()
    return 0


def _cli(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("session_path", type=Path)
    parser.add_argument("--reason", default=None)
    args = parser.parse_args(argv)
    return run_handoff(args.url, args.session_path, reason=args.reason)


if __name__ == "__main__":
    raise SystemExit(_cli(sys.argv[1:]))
