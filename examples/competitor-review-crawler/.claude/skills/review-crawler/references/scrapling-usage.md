# Scrapling 사용 가이드 (이 프로젝트 맥락)

## Fetcher 선택

| Fetcher | 언제 사용 |
|---------|-----------|
| `StealthyFetcher` | 기본값. 정적 HTML 또는 약한 봇 차단이 있는 사이트 |
| `PlayWrightFetcher` | JS 렌더링으로만 컨텐츠가 보이는 사이트, 또는 StealthyFetcher가 403/봇 차단되는 경우 |

**자동 폴백 규칙** (`scrape.py`에서 구현):
1. StealthyFetcher 시도
2. 200 OK이지만 리뷰 블록이 0개 → JS 렌더링 가능성 → PlayWrightFetcher 재시도
3. 4xx/5xx 또는 봇 차단 페이지 감지 → PlayWrightFetcher 재시도
4. 두 번째 시도도 실패 → `user_handoff`로 분기 또는 실패 로그

## 기본 사용법

```python
from scrapling.fetchers import StealthyFetcher, PlayWrightFetcher

# Stealthy (빠름)
page = StealthyFetcher.fetch(url, headless=True)

# Playwright (JS 렌더링)
page = PlayWrightFetcher.fetch(url, headless=True, network_idle=True)
```

## 세션 주입 (쿠키)

`user_handoff.py`가 저장한 `_session.json` 구조:

```json
{
  "cookies": [{"name": "...", "value": "...", "domain": "...", "path": "/"}],
  "origin": "https://example.com",
  "saved_at": "2026-04-21T14:30:00"
}
```

PlayWrightFetcher에 주입:

```python
page = PlayWrightFetcher.fetch(
    url,
    headless=True,
    cookies=session["cookies"],
)
```

StealthyFetcher는 쿠키 주입이 제한적이므로 로그인이 필요한 사이트는 PlayWrightFetcher를 사용.

## 요소 선택

```python
# CSS
blocks = page.css("div.review")

# 반복 요소 내부에서 필드 추출
for block in blocks:
    title = block.css_first("h3.title").text
    rating_el = block.css_first("span[aria-label*=star]")
    rating = rating_el.attrib.get("aria-label") if rating_el else None
    body = block.css_first(".body").text
```

`css_first`가 `None`을 반환할 수 있으므로 반드시 체크.

## 페이지네이션 패턴

| 유형 | 셀렉터 스키마 | 처리 방식 |
|------|--------------|----------|
| `next_button` | `{"type": "next_button", "selector": "a.next"}` | 다음 페이지 링크의 `href`를 따라감. 링크 없으면 종료 |
| `page_numbers` | `{"type": "page_numbers", "template": "?page={n}", "start": 1}` | 템플릿에 페이지 번호 삽입. 결과가 비거나 오류 시 종료 |
| `infinite_scroll` | `{"type": "infinite_scroll", "scroll_count": 10}` | PlayWrightFetcher로 스크롤 후 한 번에 파싱 |

## 장애물 감지 휴리스틱

응답 HTML에서 다음 패턴이 보이면 장애물로 판단:

- `captcha`, `recaptcha`, `hcaptcha`, `cloudflare challenge`, `ray id` 등의 키워드
- 페이지 길이가 극도로 짧음 (< 500 바이트) + 리뷰 블록 0개
- HTTP 403 / 429
- 로그인 폼 셀렉터 (`input[type=password]`) 가 존재하고 리뷰 블록은 없음

감지 시 `scrape.py`는 종료 코드 10으로 빠지고 stdout에 JSON(`{"status": "obstacle", "kind": "captcha|login|unknown"}`) 출력.

## Rate Limiting

- 기본 1.5초
- `_selectors.json`의 `rate_limit_sec`이 있으면 그 값 사용
- 429 응답 감지 시 즉시 배로 증가 + 10초 대기
- 연속 3회 이상 429/5xx 시 종료 (부분 결과 저장)

## 안전 체크

- 시작 시 `/robots.txt` 조회 → `Disallow`에 대상 경로가 포함되면 사용자에게 경고
- 한 실행의 페이지 수가 100을 넘으면 경고 후 사용자 확인
