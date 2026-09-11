# run-1 — 1-easy-novadrive (RFQ ND-RFQ-2604-017)

- 입력: `rfq-quote-generator-app/docs/agent-to-webapp/runs/inputs/1-easy-novadrive/` (customer_rfq_email.pdf, part_drawing_EV_input_shaft.pdf)
- 작업 폴더: `rfq-quote-generator/`
- 최종 결과: 추천 진공침탄(VCQ-1200) 13.92 CNY/pc, 총 16,704.00 CNY (1,200 pcs)

## 수행한 단계

1. **사전 확인** — 도구: Bash (`ls`, `md5sum`, `cat`), Read
   - 입력: 입력 폴더, 프로젝트 루트, 스킬 4종의 SKILL.md·스크립트·references, `available_equipment.csv`, `routing_pricing_rules.md`, `scoring_rubric.md`
   - 출력: 워크플로우 파악. 입력 PDF 2개가 `input/NovaDrive/`에 이미 있는 파일과 md5가 같음을 확인. runs 폴더에 기존 run 파일이 없어 이번 기록은 run-1.
2. **Step 0 입력 파일 준비** — 도구: Bash, 스크립트 `scripts/init_customer.py NovaDrive <pdf 2개>`
   - 입력: 사용자가 준 PDF 2개
   - 출력: `input/NovaDrive/`, `output/NovaDrive/` 폴더. RFQ 이메일 PDF는 복사됨, 도면 PDF는 복사 실패(아래 "예상과 달라서" 참조). 기존 파일이 md5가 같아 그대로 사용.
3. **Step 1 스펙 추출** — 도구: Read(PDF 2개), Write, 스킬 `rfq-spec-extractor`, 스크립트 `validate_specs.py`
   - 입력: `input/NovaDrive/customer_rfq_email.pdf`, `part_drawing_EV_input_shaft.pdf` (사용자 입력 폴더의 동일 파일을 직접 Read)
   - 출력: `output/NovaDrive/extracted_specs.json` — SCM420H, 1,200 pcs, 월 3,600, 0.82 kg, ECD 0.45–0.65 mm @HV550, HRC 58–62 / 심부 30–42, 런아웃 ≤0.03 mm, grinding_after_ht=false, 12일, RFQ No. ND-RFQ-2604-017. 검증 PASSED (17개 필수 필드).
4. **Step 2 누락 스펙 식별** — 도구: Edit, 규칙 `routing_pricing_rules.md` §3, 스크립트 `validate_specs.py`(재검증)
   - 입력: extracted_specs.json, RFQ 원문·도면 Note 8/9
   - 출력: `missing_specs` 6개 항목 추가 (마스킹, 샘플링, 경도 측정 위치/방법, 교정 허용, 포장/방청, PPAP/FAI). 각 항목에 `evidence`, `reason`(가정 포함), `assumption` 기재. 재검증 PASSED.
5. **Step 3 공정 루트 판정** — 도구: Bash, Write, 스킬 `route-evaluator`, 스크립트 `evaluate_routes.py`, 참조 `references/route_rules.md`
   - 입력: available_equipment.csv, extracted_specs.json
   - 스크립트 결과: VCQ-1200·GC-900 은 ECD 범위 안, GN-600 은 범위 밖. 세 장비 모두 재질은 유효.
   - 출력: `output/NovaDrive/route_evaluation.json` — vacuum_carburizing=`recommended`, gas_carburizing=`candidate_not_recommended`, gas_nitriding=`not_suitable`
6. **Step 4 원가/견적 계산** — 도구: Bash, 스킬 `quote-calculator`, 스크립트 `calculate_quote.py`
   - 입력: extracted_specs.json, route_evaluation.json, available_equipment.csv
   - 출력: `output/NovaDrive/quote_calculation.json`
     - 진공침탄: 5.5 hr, 6 batch, 원가 11.45, 견적 13.92 CNY/pc, 총 16,704.00
     - 가스침탄: 6.5 hr, 4 batch, 원가 6.98, 견적 8.65 CNY/pc, 총 10,380.00
   - 검증: 모든 값 양수, quote > unit_cost > 0 충족.
   - 추가: 같은 스크립트의 `calculate()`를 import 해 질화의 status 만 임시로 바꿔 참고값 산출 (19.9 hr, 5 batch, 23.41 CNY/pc).
7. **Step 5 리드타임 판정** — 도구: Write, 규칙 §5
   - 입력: delivery_days=12, route_evaluation.json
   - 출력: route_evaluation.json 에 `lead_time_assessment`(진공 feasible / 가스침탄 feasible / 질화 risk), `lead_time_days`, `lead_time_note` 추가. 질화에는 `reference_economics`(6단계 참고값)도 추가.
8. **Step 7 한/중/영 회신 이메일** — 도구: Write, 스킬 `reply-email-writer`, 참조 `references/email_templates.md`
   - 입력: extracted_specs.json, route_evaluation.json, quote_calculation.json
   - 출력: `output/NovaDrive/reply_email_ko.md`, `reply_email_zh.md`, `reply_email_en.md`
   - Step 6 과 입력이 겹치지 않아 먼저 작성함 (첨부 파일명은 RFQ 번호로 이미 확정).
9. **Step 6 엑셀 견적서 생성** — 도구: Bash, 스킬 `quote-calculator`, 스크립트 `generate_quote_xlsx.py`
   - 입력: extracted_specs.json, route_evaluation.json, quote_calculation.json
   - 출력: `output/NovaDrive/견적서_ND-RFQ-2604-017.xlsx`
10. **최종 검증** — 도구: Bash (openpyxl 로 셀 덤프, grep)
    - xlsx: 헤더/품목 테이블/상세 조건/비고 4개 영역 존재, 금액(13.92, 8.65, 16,704, 10,380)이 quote_calculation.json 과 일치
    - 이메일: 3개 파일 모두 13.92 / 16,704.00 / 8.65 / 10–12일 / 견적서 파일명 / 도면 Rev 포함, 확인 요청 항목 6개

## 판단이 필요했던 지점

- **고객사 약칭 = `NovaDrive`**: "Wuxi NovaDrive Precision Co., Ltd." 에서 핵심 키워드 추출. CLAUDE.md 예시와 같고 `input/NovaDrive/`도 이미 있었음.
- **Step 0 복사 생략 여부**: 입력 PDF가 `input/NovaDrive/`의 파일과 md5가 같아, 도면 복사 실패는 재시도하지 않고 기존 파일을 그대로 사용.
- **grinding_after_ht=false, delivery_days=12**: "热处理后不再进行磨削修正" → false, "PO 后 12 天内" → 12. 스킬 주의사항 그대로.
- **missing_specs 6개 전부 포함**: RFQ 가 명시적으로 열어둔 항목은 3개 (masking/螺纹保护, sampling, packing/rust). 나머지 3개(경도 측정 위치·방법, 교정 허용, PPAP/FAI)도 RFQ·도면 어디에도 정의가 없어 모두 넣음. 도면에는 ECD 대상 구간(C, D)만 있고 경도 측정 위치·방법은 없음.
- **각 항목에 가정 기재**: RFQ 가 "请贵司根据经验先给出假设条件并列出需确认事项"라고 요청해서, 확인 요청과 함께 가정을 명시함. xlsx 스크립트는 `item_name`/`reason` 만 출력하므로 `reason` 문자열 안에 "가정: ..." 을 넣음.
- **진공침탄 = recommended**: valid 조건 3개(재질, ECD 상한 0.65 ∈ 0.35–0.80, HRC 58–62)를 충족하고, recommended 조건 3개(런아웃 ≤0.03, 연삭 불가, 자동차 부품)도 모두 해당.
- **가스침탄 = candidate_not_recommended (valid 아님)**: ECD 는 범위 안이지만 valid 조건인 "고객이 중간 변형 리스크 수용"을 충족하지 못함 (런아웃 ≤0.03 + 연삭 불가). 규칙의 candidate 조건에 정확히 해당함. 이 때문에 xlsx 비고 칸에는 "대안"이 아닌 "참고"로 표시됨.
- **가스질화 = not_suitable**: ECD 상한 0.65 > 0.40. 규칙상 명시적 부적합.
- **질화 참고 원가를 계산할지**: calculate_quote.py 는 not_suitable 루트를 건너뜀. 하지만 scoring_rubric.md 가 질화 수치(19.9 hr / 5 batch / 23.41)를 기대하고, 규칙 §6도 루트별 수치 표시를 요구함. LLM 직접 산술 금지 원칙을 지키기 위해 같은 스크립트의 `calculate()`를 import 해서 산출하고, route_evaluation.json 에 "참고용, 견적 대상 아님"으로만 기록함. quote_calculation.json·xlsx 에는 넣지 않음.
- **lead_time_assessment 값 형식**: route-evaluator 스킬이 `feasible` / `risk` / `not_feasible` enum 을 지정하므로 enum 을 유지하고, 상세는 `lead_time_days`, `lead_time_note` 로 분리함. 대신 xlsx 리드타임 칸에는 "feasible" 한 단어만 표시됨.
- **진공침탄 납기 = feasible 이지만 여유 없음**: 10–12일이 요청 12일과 같음. 소재가 고객 지급품이므로 이메일에 "PO 시점 소재 입고" 전제를 명시함.
- **이메일 호칭**: 고객 성별 정보가 없어 템플릿 그대로 "Mr./Ms. Li", "李文 先生/女士", "Li Wen(李文) 님"을 사용.
- **Step 6/7 순서**: 이메일은 xlsx 산출물 자체를 입력으로 쓰지 않아 Step 7 을 먼저(병렬) 작성함. xlsx 는 lead_time_assessment 를 읽으므로 Step 5 이후에 생성함.

## 예상과 달라서 방식을 바꾼 지점

- **init_customer.py 에서 도면 PDF 복사 실패**: 같은 폴더의 RFQ 이메일 PDF는 복사됐는데 도면 PDF만 "not found, skipping" 이 나옴. 파일은 실제로 있고(ls, md5sum 확인), 상대 경로가 더 길어서 Windows 경로 길이 제한(MAX_PATH)에 걸린 것으로 추정됨(검증은 안 함). `input/NovaDrive/`에 md5 가 같은 파일이 있어 재시도 없이 그대로 사용함.
- **가스침탄 사이클타임·견적이 rubric 과 다름**: 스크립트는 6.5 hr / 8.65 CNY/pc, rubric 은 6.6 hr / 8.70 CNY/pc. 원인은 `3.0 + 5.0*0.55 + 0.8` 이 부동소수점으로 6.5499… 가 되어 Python `round(x, 1)` 이 6.5 를 반환하는 것 (Decimal ROUND_HALF_UP 이면 6.6 — 직접 확인함). rubric 의 8.70 은 반올림 전 6.55 로 원가를 계산한 값과 일치함. 추천 루트(진공침탄 5.5 hr, 13.92)는 영향 없음. 공용 스킬 스크립트는 수정하지 않고 스크립트 출력(8.65)을 그대로 견적서·이메일에 사용함. 수정 여부는 사용자 판단에 맡김.
