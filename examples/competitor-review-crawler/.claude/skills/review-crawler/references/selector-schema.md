# `_selectors.json` 스키마

도메인별 폴더(`output/<domain>/_selectors.json`)에 저장되는 셀렉터 프로필. 재사용 경로에서 직접 로드된다.

## 스키마

```json
{
  "profiles": [
    {
      "url_pattern": "string (regex)",
      "review_block": "string (CSS selector)",
      "fields": {
        "<field_key>": {
          "css": "string (CSS selector, review_block 내부 기준)",
          "attr": "text | html | <attribute name>"
        }
      },
      "pagination": {
        "type": "next_button | page_numbers | infinite_scroll",
        "selector": "string (next_button 타입)",
        "template": "string (page_numbers 타입, 예: '?page={n}')",
        "start": 1,
        "scroll_count": 10
      },
      "rate_limit_sec": 1.5,
      "fetcher": "stealthy | playwright",
      "last_verified": "YYYY-MM-DD",
      "last_reused_ok": true,
      "notes": "짧은 메모 (선택)"
    }
  ]
}
```

## 필드 설명

- `url_pattern`: 현재 URL이 이 정규식에 매치되면 이 프로필이 후보가 됨. 가장 먼저 매치되는 프로필을 사용.
- `review_block`: 리뷰 한 건을 감싸는 반복 요소의 CSS 셀렉터
- `fields.<key>.attr`:
  - `text` → `.text` (innerText)
  - `html` → `.html_content` (innerHTML)
  - 기타 → `.attrib[attr]` (HTML 속성)
- `pagination.type`별 필수 필드:
  - `next_button`: `selector`
  - `page_numbers`: `template`, `start`
  - `infinite_scroll`: `scroll_count`
- `fetcher`: 기본 선택. 생략 시 `stealthy`.
- `last_verified`: sanity check가 마지막으로 통과한 날짜
- `last_reused_ok`: 마지막 재사용 시도에서 통과했는지

## 예시

```json
{
  "profiles": [
    {
      "url_pattern": "^https://example\\.com/product/\\d+/reviews",
      "review_block": "div.review-card",
      "fields": {
        "title":  {"css": "h3", "attr": "text"},
        "rating": {"css": "span.stars", "attr": "aria-label"},
        "author": {"css": "a.user", "attr": "text"},
        "date":   {"css": "time", "attr": "datetime"},
        "body":   {"css": "p.body", "attr": "text"}
      },
      "pagination": {"type": "next_button", "selector": "a[rel=next]"},
      "rate_limit_sec": 1.5,
      "fetcher": "stealthy",
      "last_verified": "2026-04-21",
      "last_reused_ok": true,
      "notes": "로그인 없이 공개 접근 가능"
    }
  ]
}
```
