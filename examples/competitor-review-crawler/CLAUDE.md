# 경쟁사 리뷰 크롤러

경쟁사 제품·서비스 리뷰 URL을 받아 Scrapling으로 크롤링하고 엑셀로 저장하는 에이전트.
전체 설계는 `blueprint-review-crawler.md` 참조. 실행 시 `review-crawler` 스킬을 사용한다.

## 워크플로우 (9단계)

1. URL/도메인 파싱 → `output/<domain>/` 생성 & 노트 로드 (`scripts/domain_notes.py`)
2. 사용자에게 수집 필드 자연어로 받기 → 에이전트가 필드/페이지수로 매핑 (확인 1회)
3. 셀렉터 프로필 있으면 재사용(3A), 없으면 `agent-browser`로 구조 분석(3B)
4. 자연어 필드 → DOM 셀렉터 매핑 (에이전트 판단)
5. Sanity check: 샘플 1~2개 빈값 비율 < 50% 확인 (`scripts/sanity_check.py`)
6. 장애물(captcha/로그인) 감지 시 `scripts/user_handoff.py`로 브라우저 이양 → 사용자 `done` 입력 대기
7. `scripts/scrape.py`로 전체 페이지 순회 (기본 전체, 사용자 지정 시 해당 범위)
8. `scripts/save_excel.py`로 `output/<domain>/<YYYYMMDD_HHMM>_reviews.xlsx` 저장
9. `_site_notes.md` append + `_selectors.json` 업데이트

## 작성 원칙 (자기 검증 포함)

- **구현 전에 생각하라**: 수집 필드·페이지 범위·도메인 노트 해석을 자의로 정하지 말 것. 불명확하면 멈추고 묻기. *자기 검증: "내 가정을 사용자에게 명시했는가?"*
- **단순함 우선**: 요청한 것만. 멀티스레드·캐시·플러그인 같은 "나중 확장" 금지. *자기 검증: "시니어 엔지니어가 '너무 복잡하다'고 할까?"*
- **수술적 변경**: 기존 도메인 노트는 append-only. 관련 없는 파일/주석 건드리지 말 것. *자기 검증: "변경된 모든 줄이 사용자 요청에 직접 연결되는가?"*
- **목표 중심 실행**: 각 단계의 성공 기준을 말하고 검증으로 확인. *자기 검증: "성공/실패를 객관적으로 판단할 수 있는가?"*

**트레이드오프**: 신중함 > 속도. 단, 노트가 7일 이내면 sanity check는 약식(샘플 1개, 비어있지 않으면 통과)으로 돌려도 됨.

## 장애물 대응

captcha, 로그인, 2FA 등이 감지되면 **조용히 실패하지 말고** `user_handoff.py`를 호출해 Playwright headful 창을 띄우고 사용자에게 자연어로 안내한다. 사용자가 `done` 입력 시 쿠키/스토리지를 `_session.json`에 저장 → Scrapling에 주입하여 재개.

## 안전 규칙

- robots.txt 확인 후 crawling disallow면 사용자에게 경고 + 확인
- 기본 요청 간격 1.5초 (노트의 `rate_limit_sec` 있으면 우선)
- 도메인당 한 실행에 최대 100페이지, 초과 시 사용자 확인
- `_session.json`은 `.gitignore`에 포함 (커밋 금지)

## 잘 작동하고 있다는 신호

- 같은 도메인 2회째 크롤링 시 구조 분석 스킵되고 즉시 수집 시작
- 사이트 DOM이 바뀌면 sanity check가 먼저 잡아냄 (잘못된 엑셀이 안 나옴)
- captcha/로그인 시 에이전트가 즉시 사용자에게 도움 요청 (조용히 실패 X)
- 도메인 노트가 누적될수록 후속 실행이 빨라지고 에러율이 낮아짐
