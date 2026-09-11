---
name: review-crawler
description: Use when the user wants to crawl competitor reviews from a web page URL and save them to an Excel file. Handles per-domain selector profiles, sanity-checks extractions, and delegates captcha/login obstacles to the user via a visible browser. Triggers on requests like "리뷰 크롤링", "사이트 리뷰 엑셀로 뽑아줘", "이 URL에서 리뷰 긁어줘", "Scrapling으로 수집", "경쟁사 리뷰 모아줘".
---

# Review Crawler Skill

사용자의 리뷰 페이지 URL을 받아 구조 분석 → 사용자 확인 → Scrapling 크롤링 → 엑셀 저장까지 수행하는 워크플로우 스킬. 도메인별로 셀렉터·노트·세션을 누적 관리하며, captcha/로그인 같은 자동화 불가 장애물은 사용자에게 이양한다.

## When to use

- 사용자가 하나 이상의 리뷰 페이지 URL을 제공하고 "리뷰 뽑아줘", "크롤링 해줘", "엑셀로 저장해줘" 같이 요청할 때
- 경쟁사 분석, 리뷰 모니터링, 제품 피드백 수집 맥락
- 이미 노트가 있는 도메인을 재크롤링할 때도 동일하게 호출

## When NOT to use

- API가 공식적으로 제공되는 사이트(App Store Connect API 등) — API 호출이 더 안전하고 빠름
- 단일 페이지에서 수작업으로 복사하면 끝나는 1건 이하의 데이터
- 리뷰 요약·감성 분석 등 후처리 작업 (범위 밖)

## Workflow

### Step 1. URL/도메인 파싱 & 노트 로드

```bash
python scripts/domain_notes.py load <URL>
```

출력: `{"domain", "notes", "selectors", "session"}` (JSON). `output/<domain>/` 폴더가 없으면 생성됨.

### Step 2. 사용자에게 수집 필드 & 범위 받기

에이전트가 사용자의 자연어 지시(예: "제목, 별점, 작성자, 본문 뽑아줘. 20페이지까지만")를 다음 형태로 매핑:

```json
{"fields": ["title", "rating", "author", "body"], "max_pages": 20}
```

필드 미지정 시 기본 후보: `title, rating, author, date, body`. 페이지 미지정 시 `"all"`.
사용자에게 "이렇게 이해했는데 맞나요?" 1회 확인 후 진행.

### Step 3. 셀렉터 확보 (재사용 vs 신규)

**3A. 재사용 경로** (노트에 셀렉터 프로필이 있고 URL 패턴 매치 + 요청 필드 커버):
- `_selectors.json`의 `profiles[]` 중 `url_pattern`에 매치되는 항목 선택
- 바로 Step 5로

**3B. 신규 경로** (재사용 불가):
- `agent-browser` 스킬 호출 (`mcp__plugin_playwright_playwright__browser_navigate` → `browser_snapshot`)
- 스냅샷을 `scripts/analyze_page.py analyze`에 전달하여 DOM 요약·반복 요소 후보·장애물 감지
- 에이전트가 "리뷰 블록" 반복 요소를 선택하고, 사용자 요청 필드 각각에 대해 CSS 셀렉터 제안
- 페이지네이션 유형(next 버튼 / 번호 링크 / infinite scroll) 판단

### Step 4. 필드 매핑 (LLM 판단)

에이전트가 판단한 셀렉터를 다음 스키마로 조립 (references/selector-schema.md 참고):

```json
{
  "review_block": "div.review",
  "fields": {
    "title":  {"css": "h3.title", "attr": "text"},
    "rating": {"css": "span[aria-label*=star]", "attr": "aria-label"},
    "author": {"css": ".author", "attr": "text"},
    "body":   {"css": ".body", "attr": "text"}
  },
  "pagination": {"type": "next_button", "selector": "a.next"},
  "rate_limit_sec": 1.5
}
```

### Step 5. Sanity Check

```bash
python scripts/sanity_check.py <URL> <selectors-json-path>
```

통과 조건: `empty_ratio < 0.5` 이고 `sample_rows >= 1`.
- 재사용 경로 실패 → Step 3B(재분석) 자동 폴백 1회
- 신규 경로 실패 → 사용자에게 샘플 제시, 수동 교정 요청

### Step 6. 장애물 핸드오프 (필요 시)

captcha / 로그인 / 2FA가 감지되면:

```bash
python scripts/user_handoff.py <URL> <output/domain/_session.json> [reason]
```

- Playwright 창을 headful로 띄우고 터미널에 안내 메시지 출력
- 사용자가 `done` 입력 → 쿠키/localStorage를 세션 JSON에 저장
- 에이전트는 안내 메시지를 자연어로 추가 출력 (captcha 유형, 예상 소요, 막힐 때 연락)
- 완료 후 Step 5부터 재개

### Step 7. 전체 크롤링

```bash
python scripts/scrape.py <URL> <selectors-json-path> --max-pages <N|all> \
  --session <output/domain/_session.json> --out <output/domain/_raw.json>
```

`StealthyFetcher` 1차, JS 렌더링이 필요하면 `PlayWrightFetcher` 폴백. 페이지 간 `rate_limit_sec` 딜레이. 장애물 재발생 시 프로세스 종료 코드 10으로 빠짐 → 에이전트가 Step 6으로 루프.

### Step 8. 엑셀 저장

```bash
python scripts/save_excel.py <output/domain/_raw.json> <output/domain/YYYYMMDD_HHMM_reviews.xlsx>
```

실패 시 `.csv` 폴백. 성공 시 파일 경로를 사용자에게 전달.

### Step 9. 노트 & 셀렉터 업데이트

```bash
python scripts/domain_notes.py update <domain> --selectors <json> --note "<자연어 요약>"
```

에이전트가 작성하는 노트 내용 예시:
- "2026-04-21: 첫 수집. 페이지네이션은 `a.next`. 로그인 없이 접근 가능. rate_limit 1.5초 OK."
- "2026-04-21: 재크롤링 시 DOM 변경 감지됨 (`.review` → `.review-card`). 셀렉터 갱신."

## References

- [`references/scrapling-usage.md`](references/scrapling-usage.md) — StealthyFetcher vs PlayWrightFetcher 선택, 세션 주입, 페이지네이션 패턴
- [`references/field-mapping-hints.md`](references/field-mapping-hints.md) — 자연어 필드명 → DOM 패턴 힌트 (별점, 날짜, 본문 등)
- [`references/selector-schema.md`](references/selector-schema.md) — `_selectors.json` 스키마 정의

## Scripts

| 스크립트 | 역할 |
|----------|------|
| `scripts/domain_notes.py` | 도메인 폴더·노트·셀렉터·세션 로드/저장 |
| `scripts/analyze_page.py` | DOM 스냅샷 요약 & 반복 요소 후보 추출 |
| `scripts/sanity_check.py` | 1페이지 샘플 검증 |
| `scripts/scrape.py` | Scrapling 전체 순회 |
| `scripts/save_excel.py` | openpyxl 엑셀 저장 (CSV 폴백) |
| `scripts/user_handoff.py` | Playwright headful + 쿠키 저장 |
