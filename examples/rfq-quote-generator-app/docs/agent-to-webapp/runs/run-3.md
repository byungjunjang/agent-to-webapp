# run-3 — 3-edge-orion (고객 RFQ 번호 없음 → 내부 참조 INT-ORION-260911)

- 입력: `rfq-quote-generator-app/docs/agent-to-webapp/runs/inputs/3-edge-orion/` (customer_rfq_email.md 두 줄, part_drawing_EV_input_shaft.pdf)
- 작업 폴더: `rfq-quote-generator/`
- 최종 결과: **가정 기반 잠정 견적.** 추천 진공침탄(VCQ-1200) 13.92 CNY/pc, 총 13,920.00 CNY (가정 수량 1,000 pcs). 회신 이메일은 확정 견적 안내가 아니라 "잠정 견적 + 정보 요청 9개" 형태

## 수행한 단계

1. **사전 확인** — 도구: Bash(`ls`, `cat`), Read
   - 입력: 입력 폴더, 프로젝트 루트, 스킬 4종의 SKILL.md·스크립트·references, `available_equipment.csv`, `routing_pricing_rules.md`, `scoring_rubric.md`, `scripts/init_customer.py`, `inputs/README.md`, 기존 `run-1.md`·`run-2.md`, Helios 산출물(JSON 2개·ko 이메일, 형식 참고용)
   - 출력: 워크플로우 파악. RFQ 이메일은 "도면대로 견적, 재질은 steel(확인 예정), 무엇이 필요한지 알려 달라" 뿐이고 수량·납기·RFQ 번호·담당자명이 없음을 확인. 기존 run 이 2개라 이번 기록은 run-3.
2. **Step 0 입력 파일 준비** — 도구: Bash, 스크립트 `scripts/init_customer.py Orion <md> <pdf>`, `cmp`
   - 입력: 사용자가 준 이메일 md, 도면 PDF
   - 출력: `input/Orion/`, `output/Orion/` 생성. 이번에는 두 파일 모두 스크립트로 복사됨. `cmp` 로 원본과 동일, 도면은 NovaDrive 도면과도 동일함을 확인.
3. **Step 1 스펙 추출** — 도구: Read(md, PDF), Write, 스킬 `rfq-spec-extractor`, 스크립트 `validate_specs.py`
   - 입력: RFQ 이메일(md), 도면 PDF (NOTES 1–9, 표제란 MATERIAL SCM420H·MASS 0.82 kg)
   - 출력: `output/Orion/extracted_specs.json` — 도면에서 SCM420H(잠정), 0.82 kg, ECD 0.45–0.65 mm @HV550 (C·D), HRC 58–62 / 심부 30–42, 런아웃 ≤0.03 mm (A–D), grinding_after_ht=false. 입력에 없는 필수 필드는 가정값 + `*_source` 필드로 표시: lot_size 1,000(assumed), delivery_days 12(assumed, 당사 제안), customer_name "구매 담당자", customer_company "Orion Drivetrain"(도메인 추정), rfq_number "INT-ORION-260911"(내부 부여). `material_confirmed: false`, `assumed_fields` 목록 추가. 검증 PASSED.
4. **Step 3 보조 스크립트 (Step 1 검증과 병렬)** — 도구: Bash, 스크립트 `evaluate_routes.py`
   - 입력: available_equipment.csv, extracted_specs.json
   - 출력(stdout): VCQ-1200·GC-900 ECD 범위 안, GN-600 범위 밖. 세 장비 모두 material_valid=true (잠정 재질 SCM420H 기준).
5. **Step 2 누락 스펙 식별 (Step 3 판정 JSON 작성과 병렬)** — 도구: Edit, 규칙 `routing_pricing_rules.md` §3, 스크립트 `validate_specs.py`(재검증)
   - 입력: extracted_specs.json, RFQ 원문, 도면 Note 7·8·9
   - 출력: `missing_specs` 9개. `category: "quote_basis"` 3개(재질 확정, 수량, 요청 납기) + `category: "checklist"` §3 6개 전부(마스킹, 샘플링, 경도 측정 위치·방법, 교정 허용, 포장/방청, PPAP/FAI). 각 항목에 evidence·reason·assumption. 재검증 PASSED.
6. **Step 3 공정 루트 판정** — 도구: Write, 스킬 `route-evaluator`, 참조 `references/route_rules.md`
   - 입력: 4번 스크립트 결과, extracted_specs.json
   - 출력: `output/Orion/route_evaluation.json` — vacuum_carburizing=`recommended`, gas_carburizing=`candidate_not_recommended`, gas_nitriding=`not_suitable`. 침탄 두 루트에 `conditional_on: 재질 SCM420H 확정` 추가.
7. **Step 4 원가/견적 계산** — 도구: Bash, 스킬 `quote-calculator`, 스크립트 `calculate_quote.py`
   - 입력: extracted_specs.json, route_evaluation.json, available_equipment.csv
   - 출력: `output/Orion/quote_calculation.json`
     - 진공침탄: 5.5 hr, 5 batch, 원가 11.45, 견적 13.92 CNY/pc, 총 13,920.00
     - 가스침탄: 6.5 hr, 3 batch, 원가 6.29, 견적 7.84 CNY/pc, 총 7,840.00
   - 검증: 모든 값 양수, quote > unit_cost > 0 충족.
   - 추가(같은 턴에 병렬): 같은 스크립트의 `calculate()` 를 import 해 (a) 수량별 참고 단가 lot_size 219(VCQ 1배치 만재)/500/1,000/2,000/5,000 — 진공 12.76/16.63/13.92/13.92/12.84, 가스 11.71/10.30/7.84/7.84/7.34, (b) 질화 status 만 임시 변경한 참고값 19.9 hr / 4 batch / 22.49 산출. 219 는 `floor(max_load_kg / part_weight_kg)` 로 스크립트 안에서 계산.
8. **Step 5 리드타임 판정** — 도구: Write, 규칙 §5
   - 입력: delivery_days=12(가정), route_evaluation.json
   - 출력: route_evaluation.json 재저장 — 진공 `feasible`(10–12일), 가스침탄 `feasible`(8–10일), 질화 `null` + `lead_time_days`, `lead_time_note`(고객 요청 납기 아님을 명시). 7번 참고값을 `lot_sensitivity`(진공·가스), `reference_economics`(질화)로 기록.
9. **Step 7 한/중/영 회신 이메일 (Step 5 와 같은 턴에 병렬)** — 도구: Write, Edit, 스킬 `reply-email-writer`, 참조 `references/email_templates.md`
   - 입력: extracted_specs.json, route_evaluation.json, quote_calculation.json (값은 모두 확정된 상태)
   - 출력: `output/Orion/reply_email_ko.md`, `reply_email_zh.md`, `reply_email_en.md`. 구성: 잠정 견적(가정 명시) → 수량별 참고 단가표 → 대안 비교 → 제안 리드타임 → 확인 요청 A(견적 전제 3개)·B(공정·품질 6개, 각 가정 포함) → RFQ 번호·담당자명 요청 → 첨부 안내.
   - 작성 직후 다시 읽어 오류 2개를 Edit 로 수정: ko 수량표 219 pcs 행에 "13.92 → 12.76" 이 잘못 들어간 것을 12.76 으로, zh 첨부 줄의 "见积书" 를 "报价单" 으로.
10. **Step 6 엑셀 견적서 생성 + 가정 문구 보정** — 도구: Bash, 스킬 `quote-calculator`, 스크립트 `generate_quote_xlsx.py`, 이후 openpyxl 인라인 스크립트
    - 입력: extracted_specs.json, route_evaluation.json(리드타임 포함), quote_calculation.json
    - 출력: `output/Orion/견적서_INT-ORION-260911.xlsx`. 이어서 텍스트 셀만 보정: 합계 줄에 "가정 수량 1,000 pcs 기준", RFQ No. 칸 "미수령 (당사 참조번호 …)", 대상 부품 재질에 "잠정", 수량 칸 "1,000 EA (가정) / 월 소요 미정", 리드타임 칸 "10–12일 (당사 제안)", 비고 납기 줄 교체, 비고 3줄 추가(가정값 안내, 수량별 참고 단가, 내부 참조번호 안내). 금액 셀은 건드리지 않음.
11. **최종 검증** — 도구: Bash (openpyxl 셀 덤프, grep, python assert)
    - xlsx: 헤더/품목 테이블/상세 조건/비고 4개 영역 존재, 금액(13.92 / 13,920, 7.84 / 7,840)이 quote_calculation.json 과 일치
    - 이메일: 3개 파일 모두 13.92 / 13,920.00 / 7.84 / 12.76 / 16.63 / 12.84 / 10–12 / 견적서 파일명 / ND-IS-042 Rev.A / 0.40 mm / SCM420H / 1,000 포함, 확인 요청 항목 9개
    - route_evaluation: 3개 루트, status 허용값, reason 존재

## 판단이 필요했던 지점

- **멈추지 않고 가정값으로 진행**: 수량·납기가 RFQ·도면 어디에도 없고 `validate_specs.py` 는 둘 다 양수를 요구함. CLAUDE.md 에러 처리 표에는 "고객이 정보를 주지 않음" 경우가 없음. 멈추고 사용자에게 물을 수도 있었지만 (1) 비대화형 세션이라 중간에 답을 받을 수 없고, (2) 고객 메일 자체가 "Let us know what you need from us" 라 회신의 핵심은 정보 요청이며, (3) 도면만으로 루트 판정은 확정 가능해 가정만 드러나면 잠정 단가도 쓸모가 있음. 그래서 가정값을 넣되 JSON(`*_source: "assumed"`, `assumed_fields`), 견적서(합계·수량·RFQ No.·비고), 이메일(제목 아래 첫 문단부터 "잠정 견적") 세 곳 모두에 가정임을 표시함.
- **재질 = SCM420H (잠정)**: 이메일 "steel (to be confirmed by our engineering)" 과 도면 "SCM420H (customer supplied)" 중 도면을 따름. 고객이 "quote heat treatment per drawing" 이라 했고 "steel" 은 도면과 모순이 아니라 덜 구체적인 표현이라서. 다만 규칙 §2 의 침탄 valid 조건이 재질에 걸려 있어 `material_confirmed: false`, 침탄 루트에 `conditional_on`, missing_specs 1번에 "다른 강종이면 루트·단가 무효" 를 적음.
- **lot_size = 1,000 pcs (가정)**: 근거 있는 값이 없음. 후보는 VCQ 1배치 만재 219 pcs(장비에서 유도되지만 최저 단가라 소량이면 과소 견적), 다른 고객 사례값(NovaDrive 1,200 — 다른 고객 정보를 끌어오는 것이라 제외), 반올림 수 1,000. 1,000 을 잠정 기준으로 쓰고, 배치 올림 때문에 단가가 수량에 따라 오르내리므로(500 pcs 16.63 > 1,000 pcs 13.92) 수량별 참고 단가표를 같은 스크립트로 산출해 이메일·견적서에 함께 제시함. 기준값을 정한 뒤 단가표를 계산했고, 단가를 보고 기준값을 고르지 않음.
- **delivery_days = 12 (당사 제안)**: 고객 요청이 없어 추천 공정 표준 리드타임 상한 12일을 "당사 제안" 으로 넣음. 고객 요청 납기처럼 보이지 않도록 `delivery_basis`·`lead_time_note`·이메일에 "요청 납기 미수령, 10–12일 제안" 으로 씀.
- **고객사 약칭·회사명·담당자·RFQ 번호**: 약칭 `Orion`(입력 폴더명·도메인). customer_company 는 도메인 `orion-drivetrain.example` 에서 "Orion Drivetrain" 으로 추정, 정식 법인명 미확인 표기. 서명이 없어 customer_name 은 역할명 "구매 담당자". RFQ 번호는 없어서 파일명·견적번호용으로 내부 참조 `INT-ORION-260911` 을 부여하고, 고객 번호로 오인되지 않게 `INT-` 접두어를 붙임. 이메일 끝에 RFQ 번호·담당자명을 요청함.
- **missing_specs 에 §3 밖 항목 포함**: CLAUDE.md Step 2 는 6개 항목 확인이지만 §3 는 "RFQ 가 명확히 정의하지 않은 항목을 넣는다, Typical missing items" 라서 목록이 전부가 아님. 재질·수량·납기를 별도 배열로 두면 견적서 비고에 자동으로 안 나오므로 missing_specs 에 넣고 `category` 로 `quote_basis` / `checklist` 를 구분, 앞 순서에 둠. RFQ 번호·담당자명은 가격·공정과 무관해 missing_specs 에서 빼고 이메일 마무리에만 요청.
- **§3 체크리스트 6개 전부 누락**: 도면 Note 8(마스킹 not specified)·Note 9(sampling plan not attached) 외 나머지 4개도 RFQ·도면 어디에도 없음. 가정은 Helios 와 같은 도면이라 마스킹·샘플링·측정 위치는 run-2 와 같은 가정을 쓰고, 교정 없음 / 당사 표준 포장 / PPAP 없음을 새로 가정함.
- **루트 판정**: 진공침탄 recommended(valid 3조건 + 추천 3조건: 런아웃 0.03, 연삭 불가 Note 7, EV 부품). 가스침탄 candidate_not_recommended — 고객이 중간 변형 수용을 밝힌 적 없고 런아웃 + 연삭 불가 조건에 해당. 질화 not_suitable — ECD 상한 0.65 > 0.40, 재질 확정과 무관. valid 루트가 0개인 상황은 아니라 "대응 불가" 처리는 하지 않음.
- **질화 lead_time_assessment = null**: 스킬이 valid 루트에만 부여하라고 함. delivery_days 12 에 규칙 §5 를 문자 그대로 적용하면 risk 지만 12 는 고객 요청이 아닌 가정값이라 null + 노트로 둠(run-2 와 같은 처리).
- **이메일 구조를 정보 요청 중심으로**: 스킬 템플릿의 섹션(요약·대안·확인 요청·납기·마무리)은 유지하되 첫 문단에 "잠정 견적" 임을 밝히고 확인 요청을 A(회신 필수, 견적 전제)·B(공정·품질 조건, 가정 포함)로 나눔. 수량별 단가표를 넣은 것은 고객이 수량을 알려 주기 전에도 단가 범위를 볼 수 있게 하려는 것.
- **호칭**: 이름이 없어 en "Dear Sir or Madam", zh "Orion Drivetrain 采购负责人，您好", ko "Orion Drivetrain 구매 담당자님께". 템플릿의 "Mr./Ms. [Name]" 은 쓸 수 없음.
- **Step 5·7 병렬, Step 6 마지막**: run-2 와 같음. 이메일은 xlsx 자체를 입력으로 쓰지 않고 수치가 확정돼 있어 Step 5 와 같은 턴에 작성, xlsx 는 `lead_time_assessment` 를 읽으므로 Step 5 저장 뒤 생성.

## 예상과 달라서 방식을 바꾼 지점

- **init_customer.py 가 도면 PDF 도 복사함**: run-1·run-2 에서는 도면 PDF 만 "not found, skipping" 이 나서 이번에도 `cp` 대체 경로를 명령에 미리 넣어 두었는데, 이번에는 스크립트가 두 파일 모두 복사해 대체 경로가 실행되지 않음. 이번 호출은 `$SRC` 변수에 상대 경로(`../rfq-quote-generator-app/...`)를 담아 넘겼음. 이전 실패 원인(경로 길이 추정)은 여전히 검증하지 않음.
- **견적서 고정 문구가 가정 기반 견적과 맞지 않음**: `generate_quote_xlsx.py` 가 RFQ No. 칸에 내부 참조번호를 고객 번호처럼, 수량 칸에 "1000 EA / 월 N/A EA", 리드타임 칸에 "feasible" 한 단어, 비고 납기 줄에 "첫 배치 PO 수령 후 조건 확인 필요" 를 출력함. 이대로면 가정값이 확정값처럼 보임. run-2 와 같이 공용 스크립트는 고치지 않고 생성된 xlsx 의 텍스트 셀만 openpyxl 로 보정함(금액 셀 불변). run-1·2 는 리드타임 칸을 enum 그대로 두었지만 이번에는 고객 요청 납기가 없어 "feasible" 이 무엇에 대한 판정인지 읽히지 않으므로 칸 자체를 "10–12일 (당사 제안)" 으로 바꿈. 스크립트가 `*_source: assumed` 나 `lot_sensitivity` 를 읽도록 고칠지는 사용자 판단에 맡김.
- **이메일 작성 오류 2건 발견 후 수정**: 9번 참조. 최종 grep 검증 전, 작성 직후 재확인에서 발견함.
