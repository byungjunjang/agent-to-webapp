# 고정 워크플로우 — rfq-quote-generator

- 근거: `verdict.md` (판정: 조건부 고정 가능). 원본: `../rfq-quote-generator/CLAUDE.md`, `.claude/skills/` 4개, `routing_pricing_rules.md`, `available_equipment.csv`
- 순서는 코드가 정한다. LLM 은 네 곳(스펙 추출, 누락 스펙, 판정 설명, 회신 이메일)에서만 부른다. 사람은 두 곳(견적 전제 확인, 발송 전 검토)에서 본다
- 로컬의 실제 순서(입력 읽기 → 0 → 1 → 2 → 3 → 4 → 5 → 7 → 6 → 검증)를 따른다. 루트 판정 설명은 계산 뒤로 옮겼다. 트레이드오프 문장이 단가를 인용하기 때문이다

## 조건

verdict.md 조건 ①–⑤ 를 아래처럼 반영했다. 하나라도 빠지면 이 명세는 고정 워크플로우가 아니다.

1. 견적 전제 누락 분기 (조건 ①). 단계 2 가 `material`·`lot_size`·`delivery_days` 에 출처를 붙인다. 단계 3 이 출처로 `mode`(`firm` / `provisional`)를 정한다. provisional 이면 단계 4(사람)가 값을 넣는다. 모델은 가정값을 지어 넣지 않는다. 검증은 이 세 필드의 `null` 을 받는다
2. 견적서 사후 보정 없음 (조건 ②). 단계 10 이 포장·납기·고객 지정 조건·가정 표시·참고 단가를 JSON 에서 읽어 한 번에 만든다. 생성 뒤 셀을 고치는 단계는 없다
3. 스키마와 참고 산출 고정 (조건 ③). `## 공통 스키마` 가 유일한 스키마다. 보조 필드는 거기 있는 것만 쓴다. 참고 산출은 단계 7 의 세 가지로 고정한다
4. 수치 규칙 (조건 ④). 루트 규칙의 모호 조건은 단계 2 가 boolean 으로 넘기고 단계 6 이 코드로 판정한다. 리드타임 경계와 not_suitable 루트 처리는 단계 6 에 수치로 적었다
5. 반올림은 10진 사사오입이다: `r(x, d) = Number(Math.round(Number(x.toPrecision(12) + 'e' + d)) + 'e-' + d)`. 로컬 `calculate_quote.py` 는 부동소수에 Python `round()` 를 써서 6.55 hr 를 6.5 로 내렸다. 규칙 §4 의 뜻은 사사오입이다. 그래서 가스침탄(ECD 중앙 0.55) 결과가 로컬과 달라진다. cycle 6.5→6.6, 단가 NovaDrive 8.65→8.76, Helios 7.34→7.42, Orion 7.84→7.92. 4단계 재검증에서 이 차이는 의도된 차이로 표시한다
6. 관찰하지 못한 분기 (조건 ⑤). ECD 상한 0.80 초과, 질화 valid, valid 루트 0개, 요청 납기 10일 미만은 관찰에서 한 번도 나오지 않았다. 단계 6·7 을 구현할 때 이 네 경우의 입력을 만들어 규칙 함수 결과를 확인한다. 웹 앱 전환 때 단위 테스트로 옮긴다
7. 로컬 선례 대체. 로컬 run-2·run-3 은 앞 실행의 기록을 읽고 따랐다(질화 리드타임 null, 가정 문구). 웹 앱에는 선례가 없다. 그래서 관례는 규칙으로 옮겼다. 누락 스펙 가정 문구는 도면마다 달라서 규칙으로 박지 않았다

## 공통 스키마

값은 타입 문자열이다. `?` 는 null 허용, `a|b` 는 enum. 모든 단계가 이 이름을 그대로 쓴다.

```json
{
  "Source": "rfq|drawing|both|missing|sales|internal",
  "InputFile": {
    "name": "string",
    "role": "rfq_email|drawing",
    "media_type": "application/pdf|text/markdown|text/plain",
    "data_base64": "string"
  },
  "ExtractedSpecs": {
    "part_name": "string",
    "drawing_no": "string",
    "drawing_rev": "string?",
    "material": "string?",
    "lot_size": "integer>0?",
    "monthly_volume": "integer>0?",
    "annual_volume": "integer>0?",
    "part_weight_kg": "number>0",
    "case_depth_low": "number>0",
    "case_depth_high": "number>0",
    "case_depth_zone": "string?",
    "hardness_test_standard": "string?",
    "surface_hardness_low": "number>0",
    "surface_hardness_high": "number>0",
    "core_hardness_low": "number>0",
    "core_hardness_high": "number>0",
    "distortion_limit_mm": "number>0",
    "distortion_definition": "string?",
    "grinding_after_ht": "boolean",
    "straightening_allowed": "boolean?",
    "accepts_medium_distortion": "boolean?",
    "automotive_quality_priority": "boolean?",
    "nitriding_compatible": "boolean?",
    "prefers_carburizing_behavior": "boolean?",
    "delivery_days": "integer>0?",
    "delivery_basis": "string?",
    "packing_requirement": "string?",
    "ppap_requirement": "string?",
    "inspection_requirement": "string?",
    "customer_name": "string?",
    "customer_email": "string?",
    "customer_company": "string?",
    "rfq_number": "string?",
    "rfq_date": "string? (YYYY-MM-DD)",
    "rfq_subject": "string?",
    "customer_requested_reply_items": ["string"],
    "sources": { "<ExtractedSpecs 필드명>": "Source" },
    "unconfirmed_fields": ["string (필드명. 고객이 미확정이라 했거나 메일과 도면이 다른 필드)"],
    "extraction_notes": ["string"]
  },
  "MissingSpec": {
    "id": "integer (1부터, quote_basis 먼저)",
    "category": "quote_basis|checklist",
    "key": "material|lot_size|delivery_days|masking|sampling_plan|hardness_test|straightening|packing|ppap_fai",
    "item_name": "string (ko)",
    "item_name_en": "string",
    "evidence": "string",
    "reason": "string (ko)",
    "assumption": "string (en, 이 견적에 깐 가정)"
  },
  "ChecklistDefined": { "key": "masking|sampling_plan|hardness_test|straightening|packing|ppap_fai", "evidence": "string" },
  "RouteResult": {
    "route_name": "vacuum_carburizing|gas_carburizing|gas_nitriding",
    "equipment_id": "VCQ-1200|GC-900|GN-600",
    "display_name": "string (CSV)",
    "distortion_risk": "string (CSV)",
    "status": "recommended|valid|candidate_not_recommended|not_suitable",
    "rule_hits": ["string (예: 2A.valid, 2A.rec:no_grinding, 2C.not_suitable:ecd)"],
    "material_valid": "boolean",
    "equipment_range_match": "boolean (CSV depth_min ≤ low 이고 high ≤ depth_max. 참고용)",
    "lead_time_assessment": "feasible|risk|not_feasible|null",
    "lead_time_days": "string?",
    "conditional_on": ["string (provisional 필드명)"],
    "reason": "string? (단계 8)",
    "recommendation_comment": "string? (단계 8)",
    "technical_reason": "string? (단계 8, headline 만)",
    "commercial_tradeoff": "string? (단계 8, headline 만)",
    "assumptions_to_confirm": ["string (단계 8, headline 만)"],
    "lead_time_note": "string? (단계 8)"
  },
  "QuoteRow": {
    "route_name": "string",
    "equipment_id": "string",
    "display_name": "string",
    "status": "string",
    "lot_size": "integer>0",
    "case_depth_mid": "number (r 3)",
    "total_weight_kg": "number (r 2)",
    "batches": "integer>0",
    "cycle_time_hr": "number (r 1)",
    "cost_per_batch_cny": "number (r 2)",
    "unit_cost_cny": "number (r 2)",
    "inspection_fee_cny": 0.35,
    "margin": 1.18,
    "quote_per_pc_cny": "number (r 2)",
    "total_quote_cny": "number (r 2)"
  },
  "QuoteCalculation": {
    "outcome": "quote|no_route",
    "headline_route": "string? (route_name)",
    "quotes": ["QuoteRow (견적 루트, specs.lot_size)"],
    "references": {
      "not_suitable_routes": ["QuoteRow"],
      "monthly_volume": ["QuoteRow"],
      "lot_table": ["QuoteRow"]
    }
  },
  "Email": { "subject": "string", "body_md": "string" },
  "Emails": { "ko": "Email", "zh": "Email", "en": "Email" }
}
```

## 단계

### 단계 1: 입력 접수

- 실행 주체: 코드
- 입력 스키마:
```json
{ "files": ["InputFile"], "received_at": "string (ISO 8601)" }
```
- 출력 스키마:
```json
{ "job_id": "string (uuid)", "received_date": "string (YYYY-MM-DD, Asia/Shanghai)", "files": ["InputFile"] }
```
- 규칙:
  - role 이 rfq_email 인 파일이 정확히 1개(pdf·md·txt), drawing 인 파일이 1개 이상(pdf)
  - PDF 는 32MB·100쪽 이하(Claude 문서 입력 한도)
  - 웹 앱은 업로드 칸으로 role 을 정한다. 재검증 스크립트는 파일명으로 정한다: `customer_rfq_email.*` → rfq_email, `part_drawing_*.pdf` → drawing, 그 밖은 오류
  - 로컬 Step 0(`init_customer.py`, 고객사 약칭 폴더)은 job_id 로 대신한다. 약칭이 필요 없으니 Step 1 보다 먼저 약칭을 알아야 하던 순서 문제도 없어진다
- 실패 처리: 파일 구성이 틀리면 작업을 만들지 않고 빠진 파일을 사용자에게 알린다

### 단계 2: 스펙 추출

- 실행 주체: LLM
- 입력 스키마:
```json
{ "job_id": "string", "files": ["InputFile"], "previous_errors": ["string (단계 3 이 돌려보낸 오류. 첫 호출은 [])"] }
```
- 출력 스키마:
```json
{ "specs": "ExtractedSpecs" }
```
- 프롬프트 초안:
```text
너는 열처리 업체 영업기술팀의 견적 엔지니어다. 첨부한 고객 RFQ 메일과 부품 도면에서 열처리 스펙을 뽑아
ExtractedSpecs JSON 하나로 답한다(도구 1개, input_schema = ExtractedSpecs).
- 숫자는 숫자 타입. 단위는 mm, kg, 일(calendar day). 도면 MASS 가 g 이면 kg 으로 바꾼다
- 값을 지어내지 않는다. 문서에 없으면 null 이고 sources 에 missing
- material, lot_size, delivery_days 는 반드시 sources 에 출처를 적는다: 메일에만 rfq, 도면에만 drawing, 둘이 같으면 both, 없으면 missing
- 고객이 "to be confirmed" 라고 했거나 메일과 도면 값이 다른 필드는 unconfirmed_fields 에 넣고, 값은 도면 쪽을 쓴다
- lot_size 는 이번 견적의 첫 주문(첫 로트) 수량이다. 월 소요량은 monthly_volume, 연 소요량은 annual_volume
- 납기는 일수로 바꾼다: "N weeks" → N×7, "PO 후 N일" → N. 기준(PO 후, 입고 후 등)은 delivery_basis 에 원문 뜻대로
- grinding_after_ht: "no grinding correction after heat treatment" 류면 false, 연삭 허용·예정이면 true, 언급이 없으면 true 에 sources missing
- straightening_allowed, accepts_medium_distortion, nitriding_compatible, prefers_carburizing_behavior 는 문서에 근거가 있을 때만 true/false, 없으면 null
- automotive_quality_priority 는 자동차(EV 포함) 부품이고 변형·품질 요구가 단가보다 앞선다고 읽힐 때 true, 반대 근거가 있으면 false, 판단 근거가 없으면 null
- customer_requested_reply_items 에는 고객이 회신에 넣어 달라고 한 항목을 그대로 적는다
- 스키마에 없는 필드를 만들지 않는다. 해석한 근거(예: "6 weeks → 42")는 extraction_notes 에 한 줄씩
{previous_errors 가 있으면: 지난 결과의 오류는 아래와 같다. 문서를 다시 읽고 고쳐라. <오류 목록>}
```
- 실패 처리: 출력이 스키마에 맞지 않으면 같은 호출을 1회 다시 하고, PDF 를 읽지 못하면(API 오류·"읽을 수 없음" 응답) 최대 2회 다시 한 뒤 작업을 needs_attention 으로 둔다

### 단계 3: 스펙 검증·모드 판정

- 실행 주체: 코드
- 입력 스키마:
```json
{ "job_id": "string", "received_date": "string", "specs": "ExtractedSpecs", "attempt": "integer (1부터)" }
```
- 출력 스키마:
```json
{
  "specs": "ExtractedSpecs",
  "errors": ["string"],
  "mode": "firm|provisional",
  "provisional_fields": ["material|lot_size|delivery_days"]
}
```
- 규칙:
  1. 공통 스키마에서 `?` 가 없는 필드는 null 불가, 타입 일치. `validate_specs.py` 의 양수 검사를 유지한다. lot_size·delivery_days 는 null 이 아닐 때만 양수를 본다
  2. case_depth_low < case_depth_high, surface_hardness_low ≤ surface_hardness_high
  3. sources 에 material·lot_size·delivery_days 세 키가 있어야 한다
  4. provisional_fields = material·lot_size·delivery_days 가운데 값이 null 이거나 sources 가 missing 이거나 unconfirmed_fields 에 든 필드
  5. mode = provisional_fields 가 비었으면 firm, 아니면 provisional
  6. rfq_number 가 null 이면 `INT-{received_date 의 YYMMDD}-{job_id 앞 4자 대문자}` 를 넣고 sources.rfq_number = internal
- 실패 처리: errors 가 있으면 그 목록을 previous_errors 로 붙여 단계 2 를 다시 부른다(재추출 최대 2회). 세 번째에도 errors 가 남으면 needs_attention

### 단계 4: 견적 전제 확인

- 실행 주체: 사람
- 입력 스키마:
```json
{ "job_id": "string", "mode": "firm|provisional", "provisional_fields": ["string"], "specs": "ExtractedSpecs" }
```
- 출력 스키마:
```json
{
  "specs": "ExtractedSpecs",
  "decision": {
    "status": "approved|skipped",
    "approved_by": "string?",
    "approved_at": "string? (ISO 8601)",
    "values": { "material": "string?", "lot_size": "integer>0?", "delivery_days": "integer>0?" },
    "extra_lot_sizes": ["integer>0"],
    "note": "string?"
  }
}
```
- 확인할 것:
  - mode 가 firm 이면 status skipped 로 바로 지나간다
  - provisional 필드마다 영업 담당이 값을 넣는다. 수량은 단가를 크게 움직이므로(verdict 6절: 219 pcs 12.76 / 500 pcs 16.63) UI 는 기본값 없이 빈 칸으로 연다. material 은 도면 값이 있으면 보여 주고 그 값을 쓸지 받는다
  - 월 물량과 다른 첫 로트처럼 영업 판단이 필요한 추가 수량이 있으면 extra_lot_sizes 에 넣는다
  - 승인하면 넣은 값으로 specs 를 덮어쓰고 sources[필드] = sales. unconfirmed_fields 는 그대로 둔다(견적서·이메일의 가정 표시 근거)
  - 재검증 스크립트의 자동 승인은 run-3 과 같은 값(lot_size 1000, delivery_days 12, material 은 specs 값)을 넣고 report.md 에 남긴다
- 실패 처리: 값이 들어오기 전까지 작업은 waiting_for_human 으로 멈추고 다음 단계로 가지 않는다

### 단계 5: 누락 스펙 식별

- 실행 주체: LLM
- 입력 스키마:
```json
{ "files": ["InputFile"], "specs": "ExtractedSpecs", "mode": "firm|provisional", "provisional_fields": ["string"] }
```
- 출력 스키마:
```json
{ "missing_specs": ["MissingSpec"], "checklist_defined": ["ChecklistDefined"], "notes": ["string"] }
```
- 프롬프트 초안:
```text
routing_pricing_rules.md §3 체크리스트 여섯 개(masking, sampling_plan, hardness_test, straightening, packing, ppap_fai)를
RFQ 메일·도면·ExtractedSpecs 와 대조해 하나씩 판정한다(도구 1개).
- RFQ 나 도면이 그 항목을 분명히 정했으면 checklist_defined 에 key 와 evidence(문서의 어느 부분)를 넣는다
- 정하지 않았으면 missing_specs 에 category checklist 로 넣는다. evidence 는 무엇을 봤는지, reason 은 왜 견적에
  필요한지(한국어 1–2문장, 끝에 "가정: …"), assumption 은 이 견적에 깐 가정(영어 1문장). 가정은 이 도면의 실제 형상과
  노트에 맞춰 쓴다
- provisional_fields 의 필드마다 category quote_basis 항목을 먼저 넣는다. assumption 에는 영업이 정한 현재 값을 쓴다
- 여섯 개 밖의 항목은 만들지 않는다. 더 알릴 것은 notes 에 적는다
- id 는 quote_basis 먼저, 그다음 checklist 를 위 순서대로 1부터 매긴다
```
- 실패 처리: 코드가 여섯 key 가 missing_specs·checklist_defined 에 합쳐 정확히 한 번씩, provisional 필드마다 quote_basis 가 하나씩인지 보고, 어긋나면 그 내용을 붙여 1회 다시 부른 뒤에도 어긋나면 needs_attention

### 단계 6: 루트 판정·리드타임

- 실행 주체: 코드
- 입력 스키마:
```json
{
  "specs": "ExtractedSpecs",
  "provisional_fields": ["string"],
  "equipment": [{
    "equipment_id": "string", "route_name": "string", "display_name": "string",
    "max_load_kg": "number", "depth_min_mm": "number", "depth_max_mm": "number",
    "distortion_risk": "string", "hourly_rate_cny": "number", "setup_fee_cny": "number", "temper_fee_cny": "number"
  }]
}
```
- 출력 스키마:
```json
{ "routes": ["RouteResult (설명 필드는 null, assumptions_to_confirm 는 [])"] }
```
- 규칙:
  - equipment 는 `available_equipment.csv` 3행을 그대로 싣는다. 루트 순서도 CSV 순서
  - mat_ok = normalize(material) ∈ {SCM420H, 20CRMNTI, 20MNCR5}. normalize 는 대문자로 바꾸고 공백·하이픈을 지운다
  - hi = case_depth_high, tight = distortion_limit_mm ≤ 0.03, no_grind = grinding_after_ht === false
  - hrc_ok = |surface_hardness_low − 58| ≤ 2 이고 |surface_hardness_high − 62| ≤ 2 (규칙 "around HRC 58-62")
  - 진공침탄 §2-A: valid = mat_ok && 0.35 ≤ hi ≤ 0.80 && hrc_ok. valid 이고 (tight || no_grind || automotive_quality_priority === true) 면 recommended, valid 만이면 valid, 아니면 not_suitable
  - 가스침탄 §2-B: base = mat_ok && 0.40 ≤ hi ≤ 1.20. base 가 아니면 not_suitable. tight && no_grind 면 candidate_not_recommended. accepts = accepts_medium_distortion ?? !tight 이 true 면 valid, 아니면 candidate_not_recommended
  - 가스질화 §2-C: hi > 0.40 이면 not_suitable. 아니면 (tight || no_grind) && nitriding_compatible === true && prefers_carburizing_behavior !== true 일 때 valid, 아니면 not_suitable
  - rule_hits 에 판정에 쓴 조항과 걸린 조건을 적는다(2A.valid, 2A.rec:tight, 2A.rec:no_grind, 2A.rec:automotive, 2B.candidate, 2B.fail:material, 2B.fail:ecd, 2C.not_suitable:ecd 등)
  - equipment_range_match 는 `evaluate_routes.py` 와 같은 검사(low ≥ depth_min 이고 high ≤ depth_max)다. 참고용이고 status 에 쓰지 않는다. status 는 규칙 §2 의 상한 기준을 쓴다
  - 리드타임 §5 (d = delivery_days). status 가 not_suitable 이면 lead_time_assessment 와 lead_time_days 는 null(스킬 "valid 루트에만")
    - 진공침탄: lead_time_days "10-12". d ≥ 12 feasible, 10 ≤ d < 12 risk, d < 10 not_feasible
    - 가스침탄: lead_time_days "8-10". d ≥ 10 feasible, 8 ≤ d < 10 risk, d < 8 not_feasible
    - 가스질화: lead_time_days null. d ≤ 12 risk, d > 12 feasible
  - conditional_on: provisional_fields 에 material 이 있으면 침탄 두 루트에 "material". delivery_days 가 있으면 lead_time_assessment 가 있는 루트에 "delivery_days"
  - 루트가 모두 not_suitable 이어도 오류가 아니다. 단계 7 이 outcome no_route 로 넘긴다(CLAUDE.md "valid 루트 0개")
- 실패 처리: CSV 가 3행이 아니거나 route_name 이 셋과 다르면 설정 오류로 needs_attention

### 단계 7: 원가·견적 계산

- 실행 주체: 코드
- 입력 스키마:
```json
{
  "specs": "ExtractedSpecs",
  "routes": ["RouteResult"],
  "equipment": ["단계 6 과 같은 장비 행"],
  "provisional_fields": ["string"],
  "extra_lot_sizes": ["integer>0"]
}
```
- 출력 스키마:
```json
{ "calc": "QuoteCalculation" }
```
- 규칙:
  - 한 루트·한 수량(lot)의 QuoteRow: mid = (case_depth_low + case_depth_high) / 2, total = r(lot × part_weight_kg, 6), batches = ceil(total / max_load_kg)
  - cycle = r(식, 1). 진공침탄 2.5 + 4.0·mid + 0.8, 가스침탄 3.0 + 5.0·mid + 0.8, 가스질화 10.0 + 18.0·mid
  - cost_per_batch = setup_fee + hourly_rate × cycle + temper_fee. unit_cost = r(batches × cost_per_batch / lot, 2). quote = r((unit_cost + 0.35) × 1.18, 2). total_quote = r(quote × lot, 2)
  - 출력의 case_depth_mid 는 r(·, 3), total_weight_kg·cost_per_batch_cny 는 r(·, 2). r 은 `## 조건` 5 의 사사오입
  - total 을 r(·, 6) 한 뒤 나누는 것은 0.82 × 1200 = 983.9999… 같은 부동소수 오차로 배치 수가 하나 늘지 않게 하려는 것이다
  - quotes: status 가 recommended·valid·candidate_not_recommended 인 루트를 specs.lot_size 로 계산. 순서는 recommended → valid → candidate_not_recommended, 같으면 CSV 순서
  - headline_route = quotes 첫 행의 route_name, 없으면 null. outcome = quotes 가 있으면 quote, 없으면 no_route
  - references.not_suitable_routes: not_suitable 루트도 specs.lot_size 로 계산한다. 견적서 품목과 이메일 단가에는 쓰지 않는다(규칙 §6 해석)
  - references.monthly_volume: monthly_volume 이 있고 lot_size 와 다르면 견적 루트를 monthly_volume 으로 계산
  - references.lot_table: lot_size 가 provisional_fields 에 있고 headline 이 있으면, [floor(headline 장비 max_load_kg / part_weight_kg), 500, 1000, 2000, 5000, …extra_lot_sizes] 를 중복 없이 오름차순으로 만들어 견적 루트마다 계산
  - 검증(CLAUDE.md Step 4): 모든 QuoteRow 의 수치가 0 보다 크고 quote_per_pc_cny > unit_cost_cny
- 실패 처리: 검증이 깨지면 계산 입력을 붙여 needs_attention (CLAUDE.md "계산 스크립트 에러 → 에스컬레이션")

### 단계 8: 판정 설명

- 실행 주체: LLM
- 입력 스키마:
```json
{
  "specs": "ExtractedSpecs",
  "missing_specs": ["MissingSpec"],
  "mode": "firm|provisional",
  "routes": ["RouteResult"],
  "calc": "QuoteCalculation"
}
```
- 출력 스키마:
```json
{ "routes": ["RouteResult (설명 필드가 채워진 것)"] }
```
- 프롬프트 초안:
```text
루트 판정과 계산은 코드가 끝냈다. status·rule_hits·리드타임·수치는 바꾸지 않고 설명 문장만 쓴다. 한국어.
route_name 별로 { reason, recommendation_comment, lead_time_note, technical_reason, commercial_tradeoff,
assumptions_to_confirm } 를 낸다(도구 1개).
- reason: rule_hits 의 조항을 근거로 스펙 값을 인용해 2–3문장. not_suitable 이면 걸린 조건
- recommendation_comment: 한 줄
- lead_time_note: 표준 리드타임, 요청 납기, 납기가 영업 가정값(sources.delivery_days = sales)인지 한 줄.
  lead_time_assessment 가 null 이면 판정 대상이 아닌 이유
- headline_route 만 technical_reason(공정 특성), commercial_tradeoff(다른 견적 루트와 배치 수·단가 비교),
  assumptions_to_confirm(missing_specs 의 item_name 목록)을 쓴다. 나머지 루트는 null 과 []
- conditional_on 이 있으면 reason 끝에 그 전제가 바뀌면 판정이 달라진다는 문장을 붙인다
- 숫자는 입력 JSON 에 있는 값만 쓴다. 새로 계산하지 않는다
```
- 실패 처리: 코드가 설명 필드만 받아 루트에 합치고(코드 필드는 입력값 유지), 루트 셋 모두 reason·recommendation_comment 가 없으면 1회 다시 부른 뒤에도 없으면 needs_attention

### 단계 9: 회신 이메일

- 실행 주체: LLM
- 입력 스키마:
```json
{
  "specs": "ExtractedSpecs",
  "missing_specs": ["MissingSpec"],
  "mode": "firm|provisional",
  "routes": ["RouteResult"],
  "calc": "QuoteCalculation",
  "xlsx_filename": "string? (단계 10 의 파일명 규칙. outcome no_route 면 null)",
  "retry_missing": { "ko": ["string"], "zh": ["string"], "en": ["string"] }
}
```
- 출력 스키마:
```json
{ "emails": "Emails" }
```
- 프롬프트 초안:
```text
견적 회신 메일 초안을 한국어·중국어·영어로 쓴다(도구 1개, 출력 Emails). 세 언어의 수치와 항목 구성은 같아야 한다.
섹션 순서는 고정이다.
1 제목: "RE: {rfq_subject 가 없으면 Quotation request} — 견적 회신" / "… — 报价回复" / "… — Quotation Reply"
2 인사: customer_name 이 있으면 이름으로, 없으면 ko "담당자님", zh "尊敬的客户", en "Dear Sir or Madam". RFQ 번호와 도면 번호·Rev 를 적는다
3 mode 가 provisional 이면 잠정 견적 안내: 어떤 전제(수량·납기·재질)를 가정했는지. ko "잠정", zh "暂定", en "provisional" 을 쓴다
4 견적 요약: headline 루트 이름, 단가(CNY/pc), 수량, 총액
5 대안 루트: 다른 견적 루트를 한 줄씩 비교. not_suitable 루트는 이유 한 줄
6 참고 단가: calc.references 의 monthly_volume·lot_table 이 있으면 표로
7 확인 요청 사항: missing_specs 를 번호순으로, 항목마다 왜 필요한지와 우리가 깐 가정. provisional 이면
  A(견적 전제, 회신 필수 = quote_basis)와 B(공정·품질 조건 = checklist) 두 묶음
8 customer_requested_reply_items 가운데 위에서 다루지 않은 것에 대한 답
9 납기: headline 루트의 lead_time_assessment. feasible 은 대응 가능, risk 는 사전 협의 필요, not_feasible 은 요청 납기
  대응 불가와 표준 리드타임
10 마무리: 첨부 견적서 파일명(xlsx_filename), "본 견적은 러프 견적이며 최종 단가는 시험 가공 후 확정", 추가 문의 환영,
  서명 "Dongwoo Dongam Technology (Wuxi) — Sales Engineering Team"
outcome 이 no_route 면 4–6 대신 대응 불가 안내(ko "대응 불가", zh "无法", en "unable")와 루트별 이유 한 줄. 첨부 안내는 없다.
톤: ko 합니다체·"귀사", zh 商务正式·"贵司"·"请贵司确认", en formal business.
금액: ko "¥ 1,234.56 CNY", zh "¥ 1,234.56 元 (CNY)", en "CNY 1,234.56". 숫자는 입력 JSON 값만 쓴다.
{retry_missing 이 있으면: 지난 초안에 아래 문자열이 빠졌다. 넣어서 다시 써라. <목록>}
```
- 실패 처리: 단계 11 이 필수 문자열 누락을 찾으면 그 목록을 retry_missing 으로 붙여 1회 다시 부르고, 그 뒤에도 빠지면 needs_attention

### 단계 10: 견적서 xlsx 생성

- 실행 주체: 코드
- 입력 스키마:
```json
{
  "received_date": "string",
  "specs": "ExtractedSpecs",
  "missing_specs": ["MissingSpec"],
  "mode": "firm|provisional",
  "routes": ["RouteResult"],
  "calc": "QuoteCalculation"
}
```
- 출력 스키마:
```json
{ "xlsx": { "filename": "string", "data_base64": "string" }, "summary": { "total_quote_cny": "number?", "item_rows": [{ "route_name": "string", "quote_per_pc_cny": "number", "supply_amount_cny": "number", "remark": "추천|대안|참고" }] } }
```
- 규칙:
  - 순수 JS 라이브러리(exceljs 등)로 시트 하나 "견적서". 열 너비 [6, 28, 24, 10, 8, 14, 18, 22], 글꼴 맑은 고딕. 영역 순서는 로컬 `generate_quote_xlsx.py` 와 같다(제목 → 헤더 → 공급자 → 합계금액 → 품목 → 상세 조건 → 비고). 행 번호는 내용에 따라 흐르고 셀 주소를 고정하지 않는다
  - outcome 이 no_route 면 xlsx 를 만들지 않고 xlsx 와 summary.total_quote_cny 는 null
  - 파일명 `견적서_{rfq_number}.xlsx`. rfq_number 의 `\ / : * ? " < > |` 는 `-` 로 바꾼다
  - 헤더: 견적번호 `QT-{rfq_number}`, 견적일자 received_date, 유효기간 +30일, 수신 `{customer_company ?? "(회사명 미확인)"}  {customer_name ?? "담당자"} 귀하`, RFQ No., 도면번호(Rev 가 있으면 `{drawing_no} Rev.{drawing_rev}`), 견적 구분(firm "러프 견적", provisional "잠정 견적 (가정 기준)")
  - 가정 표시: sources 가 sales 인 값 뒤에 " (가정)", internal 인 rfq_number 뒤에 " (당사 부여)"
  - 공급자 세 줄과 러프 견적 문구는 로컬 고정값 그대로
  - 합계금액·합계 행: headline 루트의 total_quote_cny. 품목 행: calc.quotes 순서대로 품명, display_name, lot_size, EA, quote_per_pc_cny, total_quote_cny, 비고(recommended 추천 / valid 대안 / candidate_not_recommended 참고)
  - 상세 조건: 로컬 행(대상 부품·ECD `@ {hardness_test_standard ?? "HV550"}`·표면 경도·심부 경도·변형 한도·연삭 후처리·수량/월 소요)에 교정 허용(허용/불허/미정), headline 의 공정·사이클 타임·배치 수, 요청 납기 `{delivery_days}일 ({delivery_basis})`, 리드타임 `{대응 가능|일정 리스크 — 사전 협의 필요|요청 납기 대응 불가} (표준 {lead_time_days}일)`, 검사 항목 `{inspection_requirement ?? "경도 검사 (표면/심부) + 외관 검사"}` 를 더한다
  - 비고: provisional 이면 `[ 견적 전제 — 회신 필요 ]` 에 quote_basis 항목을 먼저, 이어서 `[ 고객 확인 필요 사항 ]` 에 checklist 항목을 `  - {item_name}: {reason}` 로. `[ 일반 조건 ]` 에 러프 견적 문구, `  - 납기: {delivery_basis ?? "PO 후"} {delivery_days}일 요청 기준`, `  - 포장/방청: {packing_requirement ?? "미정 (고객 사양 확인 필요)"}`, ppap_requirement 가 있으면 `  - PPAP/FAI: {값}`, 금액 단위 문구. references 의 monthly_volume·lot_table 이 있으면 `[ 참고 단가 ]` 에 `  - {display_name} {lot_size} EA: {quote_per_pc_cny} CNY/pc`. not_suitable 참고값은 넣지 않는다
- 실패 처리: 생성 오류면 1회 다시 만들고 그래도 실패하면 needs_attention (CLAUDE.md "xlsx 생성 실패")

### 단계 11: 최종 검증

- 실행 주체: 코드
- 입력 스키마:
```json
{
  "specs": "ExtractedSpecs",
  "missing_specs": ["MissingSpec"],
  "checklist_defined": ["ChecklistDefined"],
  "mode": "firm|provisional",
  "provisional_fields": ["string"],
  "routes": ["RouteResult"],
  "calc": "QuoteCalculation",
  "emails": "Emails",
  "xlsx": "단계 10 출력의 xlsx (null 가능)"
}
```
- 출력 스키마:
```json
{
  "ok": "boolean",
  "checks": [{ "name": "string", "level": "error|warning", "ok": "boolean", "detail": "string?" }],
  "email_missing": { "ko": ["string"], "zh": ["string"], "en": ["string"] }
}
```
- 규칙:
  - error: 루트 3개, status 가 enum 안, 루트마다 reason·recommendation_comment 있음
  - error: 단계 7 의 수치 검증을 다시 통과
  - error: xlsx 를 다시 읽어 합계금액 문자열에 headline total_quote_cny 가 `#,##0.00` 로 들어 있고 품목 행의 단가·공급가액이 calc.quotes 와 같다
  - error: 이메일 세 개에 필수 문자열이 모두 있다. rfq_number, drawing_no, headline 의 quote_per_pc_cny·total_quote_cny(소수 2자리, 천 단위 쉼표는 있어도 없어도 됨), outcome quote 면 xlsx 파일명, provisional 이면 ko "잠정" / zh "暂定" / en "provisional", no_route 면 ko "대응 불가" / zh "无法" / en "unable"
  - warning: 세 이메일 본문에서 뽑은 소수 2자리 숫자 집합이 같다
  - ok = error 가 모두 통과
- 실패 처리: 이메일 필수 문자열만 빠졌으면 email_missing 을 붙여 단계 9 를 1회 다시 부르고 단계 11 을 다시 돌며, 그 밖의 error 는 needs_attention

### 단계 12: 발송 전 검토

- 실행 주체: 사람
- 입력 스키마:
```json
{
  "job_id": "string",
  "specs": "ExtractedSpecs",
  "missing_specs": ["MissingSpec"],
  "mode": "firm|provisional",
  "routes": ["RouteResult"],
  "calc": "QuoteCalculation",
  "emails": "Emails",
  "xlsx": "단계 10 출력의 xlsx (null 가능)",
  "checks": ["단계 11 의 checks"]
}
```
- 출력 스키마:
```json
{ "review": { "status": "approved|rejected", "reviewed_by": "string", "reviewed_at": "string (ISO 8601)", "comment": "string?" } }
```
- 확인할 것:
  - headline 루트와 단가가 맞는지, 대안·참고 루트 설명이 사실과 맞는지
  - 누락 스펙의 가정 문구가 이 도면에 맞는지(나사부 방탄, 측정 구간처럼 도면마다 다른 내용)
  - provisional 이면 가정값이 JSON·견적서·이메일 세 곳에 가정으로 표시됐는지
  - 세 언어 이메일의 호칭과 톤, 고객이 요청한 회신 항목에 답했는지
  - 승인하면 xlsx 와 이메일 초안을 내려받게 한다. 이 앱은 메일을 보내지 않는다(로컬도 초안까지만 만들었다)
  - 재검증 스크립트는 자동 승인하고 이 목록을 report.md 에 남긴다
- 실패 처리: rejected 면 comment 를 남기고 작업을 needs_attention 으로 둔다. 고친 입력은 새 작업으로 돌린다

## 규칙화 불가

- 메일·도면 값 해석(첫 로트냐 월 물량이냐, "6 weeks" 환산, "steel" 과 도면 재질의 충돌, 루트 규칙용 boolean 판단) → LLM 단계 2
- RFQ 가 체크리스트 항목을 분명히 정했는지와 도면에 맞춘 가정 문구 → LLM 단계 5
- 루트 판정 사유·기술 근거·상업적 트레이드오프 문장 → LLM 단계 8
- 회신 이메일의 구성 조정(고객 요청 항목, 호칭, 잠정 견적 안내) → LLM 단계 9
- 견적 전제가 빠졌을 때의 수량·납기·재질 값 → 사람 확인 지점 4
- LLM 이 쓴 가정 문구와 이메일이 사실과 맞는지 → 사람 확인 지점 12
