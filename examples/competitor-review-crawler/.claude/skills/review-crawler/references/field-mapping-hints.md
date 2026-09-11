# 자연어 필드명 → DOM 셀렉터 매핑 힌트

사용자가 자연어로 요청한 필드를 DOM 셀렉터로 변환할 때 에이전트가 참고하는 패턴 모음.
**이 문서는 참고용이다** — 실제 사이트의 스냅샷을 우선하고, 아래는 후보 탐색의 출발점으로만 사용.

## 공통 정규화

| 사용자 표현 | 정규화 키 | 비고 |
|------------|----------|------|
| 제목, 타이틀, 리뷰 제목, title | `title` | — |
| 별점, 평점, 점수, rating, stars, score | `rating` | 숫자 혹은 `aria-label`("4 out of 5 stars") |
| 작성자, 유저, 리뷰어, nickname, author, reviewer | `author` | — |
| 날짜, 작성일, 시간, date, time | `date` | ISO, 상대시간("3일 전") 모두 문자열로 저장 |
| 본문, 내용, 리뷰, 댓글, body, content, text, review | `body` | — |
| 추천수, 좋아요, helpful, likes | `helpful_count` | 숫자 |
| 이미지, 사진, image, photo | `images` | 여러 개면 `;` 구분 |
| 버전, version | `version` | 앱스토어류 |
| 제품명, product | `product` | 마켓플레이스류 |

규칙에 없는 필드는 사용자 표현을 그대로 snake_case로 쓴다.

## DOM 패턴 힌트

### 별점
- `aria-label*=star`, `aria-label*=rating`
- `data-rating`, `data-score` 속성
- 시각적으로는 `.stars`, `.rating`, `.score` 같은 클래스
- 텍스트 표기: "★★★★☆" 또는 "4.0" 숫자
- 추출 방법 우선순위: `aria-label` > `data-*` > 텍스트 정규식

### 날짜
- `<time datetime="...">` 태그 → `datetime` 속성 우선
- `.date`, `.posted-at`, `.review-date` 클래스
- 상대시간 ("3일 전", "2 days ago") → 텍스트 그대로 저장, 파싱은 후처리에서

### 본문
- 가장 긴 텍스트 블록 (휴리스틱: `p`, `div[class*=body|content|text|review]`)
- 자식 엘리먼트가 여러 개면 모두 concat (줄바꿈 보존)

### 작성자
- `.author`, `.username`, `.reviewer-name`, `.name`
- `a[href*=/user/]`, `a[href*=/profile/]`

### 이미지
- 리뷰 블록 내부의 `img[src]` 모두 수집 → `;` 구분으로 저장
- 데이터 URL, picture/srcset은 첫 번째 `src`만

## 반복 요소(리뷰 블록) 식별 힌트

- 반복 횟수가 5~50 범위인 DOM 노드 셋
- 공통 클래스 prefix (`.review-card`, `.review-item`, `.c-review`)
- 각 블록에 평점·날짜·본문 같은 이질적 데이터가 모두 들어있으면 높은 가능성
- `article`, `li`, `div[role=listitem]` 태그가 자주 쓰임
- 앱스토어, 구글 플레이, 네이버 쇼핑 등 대표 사이트는 도메인 노트에 누적 기록 → 다음 실행에 재사용

## 매핑 시 주의

- 같은 페이지에 "광고 카드"가 섞여 있으면 리뷰 블록 셀렉터가 광고도 잡아버릴 수 있음 → 날짜/평점 필드가 비어있으면 광고일 가능성 → sanity check 단계에서 걸러짐
- "접기/더보기" 같은 truncation이 있으면 본문이 잘린 채 저장됨 → 도메인 노트에 기록하고 후속에서 `PlayWrightFetcher`로 펼친 뒤 수집 고려 (현 범위 밖)
