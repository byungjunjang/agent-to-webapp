"""도메인 폴더/노트/셀렉터/세션의 로드·저장.

CLI 사용:
  python domain_notes.py load <URL>
      -> {"domain","notes","selectors","session"} JSON을 stdout으로 출력
  python domain_notes.py update <domain> --selectors <json_path> --note <text>
      -> _selectors.json 덮어쓰기 + _site_notes.md에 append
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

OUTPUT_ROOT = Path(__file__).resolve().parents[4] / "output"

SITE_NOTES = "_site_notes.md"
SELECTORS = "_selectors.json"
SESSION = "_session.json"


def domain_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if not host:
        raise ValueError(f"URL에서 도메인을 추출할 수 없습니다: {url!r}")
    if host.startswith("www."):
        host = host[4:]
    return host


def domain_dir(domain: str) -> Path:
    path = OUTPUT_ROOT / domain
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_json_load(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        backup = path.with_suffix(path.suffix + ".bak")
        shutil.move(path, backup)
        print(f"[domain_notes] 손상된 JSON을 {backup.name}로 이동했습니다.", file=sys.stderr)
        return None


def load(url: str) -> dict:
    domain = domain_from_url(url)
    d = domain_dir(domain)
    notes = (d / SITE_NOTES).read_text(encoding="utf-8") if (d / SITE_NOTES).exists() else None
    selectors = _safe_json_load(d / SELECTORS)
    session = _safe_json_load(d / SESSION)
    return {
        "domain": domain,
        "dir": str(d),
        "notes": notes,
        "selectors": selectors,
        "session": session,
    }


def find_matching_profile(selectors: dict | None, url: str, fields: list[str]) -> dict | None:
    if not selectors or "profiles" not in selectors:
        return None
    for profile in selectors["profiles"]:
        pattern = profile.get("url_pattern")
        if not pattern:
            continue
        try:
            if not re.search(pattern, url):
                continue
        except re.error:
            continue
        profile_fields = set(profile.get("fields", {}).keys())
        if all(f in profile_fields for f in fields):
            return profile
    return None


def update_selectors(domain: str, new_profile: dict) -> Path:
    """url_pattern 기준 upsert."""
    d = domain_dir(domain)
    path = d / SELECTORS
    existing = _safe_json_load(path) or {"profiles": []}
    profiles = existing.setdefault("profiles", [])
    pattern = new_profile.get("url_pattern")
    for i, prof in enumerate(profiles):
        if prof.get("url_pattern") == pattern:
            profiles[i] = new_profile
            break
    else:
        profiles.append(new_profile)
    path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def append_note(domain: str, note: str) -> Path:
    d = domain_dir(domain)
    path = d / SITE_NOTES
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    header = f"# {domain} 크롤링 노트\n\n" if not path.exists() else ""
    entry = f"## {ts}\n\n{note.strip()}\n\n"
    with path.open("a", encoding="utf-8") as f:
        if header:
            f.write(header)
        f.write(entry)
    return path


def save_session(domain: str, cookies: list[dict], origin: str | None = None) -> Path:
    d = domain_dir(domain)
    path = d / SESSION
    payload = {
        "cookies": cookies,
        "origin": origin,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _cli(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="도메인 노트/셀렉터 관리")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_load = sub.add_parser("load", help="URL로부터 도메인 컨텍스트 로드")
    p_load.add_argument("url")

    p_upd = sub.add_parser("update", help="셀렉터 프로필 & 노트 업데이트")
    p_upd.add_argument("domain")
    p_upd.add_argument("--selectors", help="새 프로필 JSON 파일 경로")
    p_upd.add_argument("--note", help="자연어 노트")

    args = parser.parse_args(argv)

    if args.cmd == "load":
        print(json.dumps(load(args.url), ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "update":
        if args.selectors:
            profile = json.loads(Path(args.selectors).read_text(encoding="utf-8"))
            p = update_selectors(args.domain, profile)
            print(f"[selectors] wrote {p}")
        if args.note:
            p = append_note(args.domain, args.note)
            print(f"[notes] appended {p}")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(_cli(sys.argv[1:]))
