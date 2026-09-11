# run-2 — 2-normal-helios (RFQ HX-RFQ-2609-003)

- 입력: `rfq-quote-generator-app/docs/agent-to-webapp/runs/inputs/2-normal-helios/` (customer_rfq_email.md, part_drawing_EV_input_shaft.pdf)
- 작업 폴더: `rfq-quote-generator/`
- 최종 결과: 추천 진공침탄(VCQ-1200) 13.38 CNY/pc, 총 33,450.00 CNY (첫 로트 2,500 pcs). 양산 참고 12.84 CNY/pc (월 5,000 pcs 1 lot)

## 수행한 단계

1. **사전 확인** — 도구: Bash(`find`), Read
   - 입력: 입력 폴더, 프로젝트 루트, 스킬 4종의 SKILL.md·스크립트·references, `available_equipment.csv`, `routing_pricing_rules.md`, `scripts/init_customer.py`, `inputs/README.md`, 기존 `run-1.md`, NovaDrive 산출물(이메일 3종·JSON, 형식 참고용)
   - 출력: 워크플로우 파악. 이메일이 PDF 가 아니라 `.md` 임을 확인. runs 폴더에 run-1 만 있어 이번 기록은 run-2.
2. **Step 0 입력 파일 준비** — 도구: Bash, 스크립트 `scripts/init_customer.py Helios <md> <pdf>`, 이후 `cp` + `cmp`
   - 입력: 사용자가 준 이메일 md, 도면 PDF
   - 출력: `input/Helios/`, `output/Helios/` 생성. 이메일 md 는 스크립트로 복사됨. 도면 PDF 는 스크립트가 "not found, skipping" 을 내서 `cp` 로 복사하고 `cmp` 로 원본과 동일함을 확인함(아래 "예상과 달라서" 참조). 도면은 NovaDrive 도면과도 바이트 단위로 같음.
3. **Step 1 스펙 추출** — 도구: Read(md, PDF), Write, 스킬 `rfq-spec-extractor`, 스크립트 `validate_specs.py`
   - 입력: RFQ 이메일(md), 도면 PDF (NOTES 1–9, 표제란 MASS 0.82 kg)
   - 출력: `output/Helios/extracted_specs.json` — SCM420H(고객 지급), lot_size 2,500 / 월 5,000 / 12개월, 0.82 kg, ECD 0.45–0.65 mm @HV550 (C·D 구간), HRC 58–62 / 심부 30–42, 런아웃 ≤0.03 mm (datum A–D), grinding_after_ht=false, delivery_days 42, Maria Keller / Helios Motors GmbH / HX-RFQ-2609-003. 필수 17개 외에 `customer_part_no`, `straightening_allowed`, `packing_requirement`, `ppap_requirement`, `customer_requested_reply_items` 등을 보조 필드로 추가. 검증 PASSED.
4. **Step 3 보조 스크립트 (Step 1 검증과 병렬)** — 도구: Bash, 스크립트 `evaluate_routes.py`
   - 입력: available_equipment.csv, extracted_specs.json
   - 출력(stdout): VCQ-1200·GC-900 ECD 범위 안, GN-600 범위 밖. 세 장비 모두 재질 유효.
5. **Step 2 누락 스펙 식별** — 도구: Edit, 규칙 `routing_pricing_rules.md` §3, 스크립트 `validate_specs.py`(재검증)
   - 입력: extracted_specs.json, RFQ 원문, 도면 Note 8·9
   - 출력: `missing_specs` 3개(마스킹, 샘플링 기준, 경도 측정 위치·방법)와 RFQ 가 명시한 3개를 적은 `checklist_defined`(교정 허용, 포장/방청, PPAP Level 3). 재검증 PASSED.
6. **Step 3 공정 루트 판정** — 도구: Write, 스킬 `route-evaluator`, 참조 `references/route_rules.md`
   - 입력: 4번 스크립트 결과, extracted_specs.json
   - 출력: `output/Helios/route_evaluation.json` — vacuum_carburizing=`recommended`, gas_carburizing=`candidate_not_recommended`, gas_nitriding=`not_suitable`
7. **Step 4 원가/견적 계산** — 도구: Bash, 스킬 `quote-calculator`, 스크립트 `calculate_quote.py`
   - 입력: extracted_specs.json, route_evaluation.json, available_equipment.csv
   - 출력: `output/Helios/quote_calculation.json`
     - 진공침탄: 5.5 hr, 12 batch, 원가 10.99, 견적 13.38 CNY/pc, 총 33,450.00
     - 가스침탄: 6.5 hr, 7 batch, 원가 5.87, 견적 7.34 CNY/pc, 총 18,350.00
   - 검증: 모든 값 양수, quote > unit_cost > 0 충족.
   - 추가(같은 턴에 병렬): 같은 스크립트의 `calculate()` 를 import 해 참고값 두 가지 산출. (a) lot_size=5,000 양산 로트: 진공 23 batch / 12.84, 가스 14 batch / 7.34. (b) 질화 status 만 임시 변경: 19.9 hr / 10 batch / 22.49.
8. **Step 5 리드타임 판정** — 도구: Write, 규칙 §5
   - 입력: delivery_days=42, route_evaluation.json
   - 출력: route_evaluation.json 재저장 — 진공 `feasible`(10–12일), 가스침탄 `feasible`(8–10일), 질화 `null`(판정 대상 아님) + `lead_time_days`, `lead_time_note`. 7번의 참고값을 `serial_lot_reference`(진공·가스), `reference_economics`(질화)로 기록.
9. **Step 7 한/중/영 회신 이메일 (Step 5 와 같은 턴에 병렬)** — 도구: Write, 스킬 `reply-email-writer`, 참조 `references/email_templates.md`
   - 입력: extracted_specs.json, route_evaluation.json, quote_calculation.json (값은 모두 확정된 상태)
   - 출력: `output/Helios/reply_email_ko.md`, `reply_email_zh.md`, `reply_email_en.md`
10. **Step 6 엑셀 견적서 생성 + 비고 보정** — 도구: Bash, 스킬 `quote-calculator`, 스크립트 `generate_quote_xlsx.py`, 이후 openpyxl 인라인 스크립트
    - 입력: extracted_specs.json, route_evaluation.json(리드타임 포함), quote_calculation.json
    - 출력: `output/Helios/견적서_HX-RFQ-2609-003.xlsx`. 이어서 일반 조건 2줄(납기, 포장/방청)을 이 RFQ 값으로 바꾸고 3줄(고객 지정 조건, 단가 미반영 비용, 양산 참고 단가)을 덧붙임.
11. **최종 검증** — 도구: Bash (openpyxl 셀 덤프, grep)
    - xlsx: 헤더/품목 테이블/상세 조건/비고 4개 영역 존재, 금액(13.38 / 33,450, 7.34 / 18,350)이 quote_calculation.json 과 일치
    - 이메일: 3개 파일 모두 13.38 / 33,450.00 / 12.84 / 7.34 / 10–12 / 견적서 파일명 / ND-IS-042 Rev.A / 질화 0.40 mm / PPAP Level 3 포함, 확인 요청 항목 3개

## 판단이 필요했던 지점

- **고객사 약칭 = `Helios`**: "Helios Motors GmbH" 에서 핵심 키워드 추출.
- **이메일 형식이 md**: CLAUDE.md·스킬은 PDF 를 전제하지만 내용은 같은 텍스트라 Read 로 그대로 읽고 `input/Helios/` 에도 md 그대로 둠. 변환하지 않음.
- **이메일과 도면 교차 검증**: 재질·ECD·경도·런아웃·연삭 불가가 모두 일치. 도면에만 있는 정보(ECD 대상 C·D 구간, datum A–D, MASS 0.82 kg, Note 8·9)는 도면에서 보충함. 고객 P/N(HX-2210)과 도면번호(ND-IS-042)는 따로 있어 `drawing_no` 는 도면번호로, P/N 은 `customer_part_no` 로 둠.
- **lot_size = 2,500 (첫 로트)**: RFQ 수량이 "first lot 2,500 pcs, then 5,000 pcs/month (12-month contract)" 이다. 견적서 한 줄 수량으로는 명시된 로트 수량인 2,500 을 쓰고, 월 5,000 은 `monthly_volume` 에 둠. 연 60,000 은 한 번에 처리하는 로트가 아니라 제외. 다만 계약 물량 대부분이 월 5,000 이고 배치 올림(ceil) 때문에 단가가 달라지므로(13.38 vs 12.84), 5,000 로트 단가를 같은 스크립트로 산출해 이메일·견적서에 "참고" 로만 표기함.
- **delivery_days = 42**: "6 weeks from PO" → 42일.
- **missing_specs 3개로 축소**: RFQ 가 교정 허용("Press straightening after quench is acceptable"), 포장/방청("returnable plastic trays with rust preventive oil"), PPAP("level 3 ... with the first shipment")를 명시해 §3 체크리스트 6개 중 3개가 정의됨. 남은 3개(마스킹 — 도면 Note 8 "not specified in RFQ", 샘플링 — Note 9 "not attached", 경도 측정 위치·방법 — 어디에도 없음)만 넣음. 정의된 3개는 근거와 함께 `checklist_defined` 로 따로 기록.
- **가스침탄 = candidate_not_recommended 유지**: 교정 허용이 추가됐지만 규칙 §2-B 의 판정 조건은 "런아웃 ≤0.03 + 연삭 수정 불가" 두 가지이고 둘 다 성립함. 규칙에 교정 허용으로 판정을 바꾸는 조항이 없어 그대로 둠. 코멘트에 "교정으로 대응 여지는 있으나 교정 비율·수율 리스크" 를 적음.
- **진공침탄 = recommended**: valid 3조건(재질, ECD 상한 0.65 ∈ 0.35–0.80, HRC 58–62)과 recommended 3조건(런아웃, 연삭 불가, 자동차 EV 부품) 모두 충족. 교정은 예외 대응으로만 두고 전수 교정을 전제하지 않음.
- **질화 lead_time_assessment = null**: 스킬은 valid 루트에만 리드타임을 붙이라고 하고, 규칙 §5 의 질화 리스크 기준은 "≤12일 요청" 이라 42일 요청에는 해당하지 않음. run-1 처럼 `risk` 를 넣으면 근거 없는 값이 되므로 null 과 사유 노트로 둠.
- **이메일에 검사 항목 섹션 추가**: 스킬의 필수 항목은 아니지만 고객이 "recommended process route, unit price, lead time and inspection items" 를 명시적으로 요청함. 도면 Note 9 와 스펙(표면·심부경도, ECD @HV550 C·D, 런아웃 A–D, PPAP L3)으로 구성하고 빈도는 샘플링 기준 확인 후 확정한다고 적음.
- **단가에 반영되지 않은 비용 명시**: 규칙 §4 수식은 공정비 + 검사비 0.35 + 마진뿐이라 교정 공수, PPAP Level 3 서류, 회수용 트레이 운영비가 들어 있지 않음. 고객이 이 셋을 명시했으므로 "본 러프 견적 단가에 별도 반영하지 않음, 최종 단가 확정 시 협의" 로 이메일·견적서 비고에 적음. 금액을 임의로 가산하지는 않음. 트레이 공급 주체는 RFQ 에 없어 "고객 공급·순환 가정" 으로 표기.
- **호칭**: 이름만으로 성별을 알 수 없어 Mr./Ms. 를 쓰지 않고 성명 그대로 "Dear Maria Keller", "尊敬的 Maria Keller", "Maria Keller 님께" 로 씀.
- **Step 5·7 병렬, Step 6 마지막**: 이메일은 xlsx 파일 자체를 입력으로 쓰지 않고 수치가 모두 확정돼 있어 Step 5 와 같은 턴에 작성함. xlsx 는 `lead_time_assessment` 를 읽으므로 Step 5 저장 뒤에 생성함.

## 예상과 달라서 방식을 바꾼 지점

- **init_customer.py 에서 도면 PDF 복사 실패 (run-1 과 동일)**: 이메일 md 는 복사됐으나 도면 PDF 만 "not found, skipping". run-1 에서 추정한 경로 길이 문제로 보임(검증은 안 함). 이번에는 `input/Helios/` 에 기존 파일이 없어서 Bash `cp` 로 복사하고 `cmp` 로 원본과 같음을 확인함.
- **견적서 일반 조건이 이 RFQ 와 모순**: `generate_quote_xlsx.py` 가 "포장/방청 조건: 미정 (고객 사양 확인 필요)", "납기: 첫 배치 PO 수령 후 조건 확인 필요" 를 고정 문구로 출력함. Helios 는 포장/방청과 납기를 명시했으므로 그대로 두면 견적서가 고객 요청과 어긋남. 공용 스킬 스크립트는 고치지 않고, 생성된 xlsx 의 해당 2줄만 openpyxl 로 바꾸고 3줄을 덧붙임(금액 셀은 건드리지 않음). 스크립트가 `packing_requirement`·`delivery_days` 를 읽도록 고칠지는 사용자 판단에 맡김.
- **견적서 리드타임 칸이 "feasible" 한 단어**: 스크립트가 `lead_time_assessment` enum 을 그대로 출력함. run-1 과 같은 이유로 enum 은 유지하고, 구체 일수는 비고의 납기 줄에 적음.
