# RFQ 견적 생성 에이전트

## 프로젝트 개요

열처리 가공 업체의 RFQ(견적요청서) 자동 처리 에이전트.
고객 RFQ 이메일과 도면 PDF를 읽고, 사내 장비/규칙에 따라 공정 루트를 판정하고, 원가를 계산하여, 한국식 엑셀 견적서와 한/중/영 3개 국어 회신 이메일 초안을 생성한다.

## 워크플로우

아래 7단계를 **순차적으로** 실행한다. 각 단계의 출력이 다음 단계의 입력이 된다.

### Step 0: 입력 파일 준비
- 고객 RFQ 이메일 PDF와 도면 PDF를 `/input/[고객사 약칭]/`에 저장
- 고객사 약칭은 output과 동일하게 사용 (예: `NovaDrive`)
- 폴더가 없으면 자동 생성

### Step 1: 스펙 추출
- `/input/[고객사]/` 내 RFQ 이메일 PDF와 도면 PDF를 Read 도구로 읽기
- 스킬 `rfq-spec-extractor` 참조
- 구조화 JSON을 `/output/[고객사]/extracted_specs.json`으로 저장
- 검증: `python .claude/skills/rfq-spec-extractor/scripts/validate_specs.py output/[고객사]/extracted_specs.json`
- 실패 시: PDF 재독취 후 재추출 (최대 2회)

### Step 2: 누락 스펙 식별
- `routing_pricing_rules.md` §3의 체크리스트와 대조
- 6개 항목 확인: masking, sampling plan, hardness test location, straightening, packing/rust prevention, PPAP/FAI
- `extracted_specs.json`에 `missing_specs` 배열 추가 후 재저장

### Step 3: 공정 루트 판정
- 스킬 `route-evaluator` 참조
- 보조 스크립트: `python .claude/skills/route-evaluator/scripts/evaluate_routes.py available_equipment.csv output/[고객사]/extracted_specs.json`
- 3개 루트(진공침탄, 가스침탄, 가스질화) 모두 평가
- `/output/[고객사]/route_evaluation.json` 저장
- status 허용값: `recommended`, `valid`, `candidate_not_recommended`, `not_suitable`

### Step 4: 원가/견적 계산
- 스킬 `quote-calculator` 참조
- **반드시 스크립트로 계산** (LLM 직접 계산 금지):
  ```bash
  python .claude/skills/quote-calculator/scripts/calculate_quote.py \
    output/[고객사]/extracted_specs.json \
    output/[고객사]/route_evaluation.json \
    available_equipment.csv > output/[고객사]/quote_calculation.json
  ```
- 검증: 모든 수치 양수, quote > unit_cost > 0

### Step 5: 리드타임 판정
- `routing_pricing_rules.md` §5 참조
- 고객 요청 납기(`delivery_days`)와 각 루트 비교
- 진공침탄 10-12일, 가스침탄 8-10일, 가스질화 리스크
- `route_evaluation.json`에 `lead_time_assessment` 필드 추가 후 재저장

### Step 6: 엑셀 견적서 생성
- 스킬 `quote-calculator` 참조
- **반드시 스크립트로 생성**:
  ```bash
  python .claude/skills/quote-calculator/scripts/generate_quote_xlsx.py \
    output/[고객사]/extracted_specs.json \
    output/[고객사]/route_evaluation.json \
    output/[고객사]/quote_calculation.json \
    "output/[고객사]/견적서_[RFQ번호].xlsx"
  ```
  - `[RFQ번호]`는 extracted_specs.json의 `rfq_number` 값으로 치환
- 한국 기업 표준 견적서 양식 (헤더/품목 테이블/상세 조건/비고)

### Step 7: 한/중/영 회신 이메일 생성
- 스킬 `reply-email-writer` 참조
- 3개 파일 생성: `/output/[고객사]/reply_email_ko.md`, `reply_email_zh.md`, `reply_email_en.md`
- 필수 포함: 견적 금액, 추천 루트, 누락 스펙, 납기, 견적서 첨부 안내

## 참조 파일

| 파일 | 용도 |
|------|------|
| `available_equipment.csv` | 장비 3종 데이터 (적재량, 요율, 수수료) |
| `routing_pricing_rules.md` | 라우팅 판정 규칙 + 가격 수식 + 출력 스타일 |

## 출력 규칙

- 모든 산출물은 `/output/[고객사 약칭]/` 하위 폴더에 저장
  - 고객사 약칭: `customer_company`에서 핵심 키워드 추출 (예: "Wuxi NovaDrive Precision Co., Ltd." → `NovaDrive`)
  - 워크플로우 시작 시 해당 폴더가 없으면 자동 생성
- 금액 단위: **CNY** (중국 위안)
- 반올림: cycle_time → 소수 1자리, 금액 → 소수 2자리
- 수치 계산은 반드시 Python 스크립트 사용 (LLM 직접 산술 금지)

## 이메일 톤 가이드

| 언어 | 톤 |
|------|------|
| 한국어 | 격식체 (합니다체), "귀사", "검토 부탁드립니다" |
| 중국어 | 商务正式, "贵司", "请贵司确认" |
| 영어 | Formal business, "Dear Mr./Ms.", "Please find attached" |

## 에러 처리

| 상황 | 처리 |
|------|------|
| PDF 파싱 실패 | 재시도 최대 2회, 이후 사용자에게 에스컬레이션 |
| 스키마 검증 실패 | 누락 필드 확인 후 재추출 |
| valid 루트 0개 | 모든 루트 not_suitable로 기록, 이메일에 "대응 불가" 안내 |
| 계산 스크립트 에러 | 에러 메시지와 함께 사용자에게 에스컬레이션 |
| xlsx 생성 실패 | 재시도 1회, 이후 에스컬레이션 |

## 의존성

- Python 3.8+
- `openpyxl` (`pip install openpyxl`)
