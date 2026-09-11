---
name: quote-calculator
description: 열처리 사이클타임, 원가, 견적 단가를 계산하고 한국식 엑셀 견적서를 생성. 견적 계산, 원가 산출, 견적서 생성, xlsx 견적서 시 사용.
---

# 견적 계산 스킬

valid 루트에 대해 사이클타임/원가/견적을 계산하고, 한국 기업 표준 양식의 엑셀 견적서를 생성한다.

## 입력

- `/output/[고객사]/extracted_specs.json`
- `/output/[고객사]/route_evaluation.json`
- `available_equipment.csv`

## Step 4: 수치 계산

```bash
python .claude/skills/quote-calculator/scripts/calculate_quote.py \
  output/extracted_specs.json \
  output/route_evaluation.json \
  available_equipment.csv \
  > output/[고객사]/quote_calculation.json
```

### 계산 수식 (routing_pricing_rules.md §4)

```
case_depth_mid = (case_depth_low + case_depth_high) / 2
total_weight_kg = lot_size * part_weight_kg
batches = ceil(total_weight_kg / max_load_kg)

사이클 타임:
  진공 침탄: 2.5 + 4.0 * case_depth_mid + 0.8
  가스 침탄: 3.0 + 5.0 * case_depth_mid + 0.8
  가스 질화: 10.0 + 18.0 * case_depth_mid

process_cost_per_batch = setup_fee + hourly_rate * cycle_time + temper_fee
unit_process_cost = (batches * process_cost_per_batch) / lot_size
rough_quote = (unit_process_cost + 0.35) * 1.18
```

### 반올림 규칙
- cycle_time: 소수 1자리
- unit_cost, quote: 소수 2자리

### 검증
- 모든 수치 > 0
- quote_per_pc > unit_cost > 0

## Step 6: 엑셀 견적서 생성

```bash
python .claude/skills/quote-calculator/scripts/generate_quote_xlsx.py \
  output/extracted_specs.json \
  output/route_evaluation.json \
  output/[고객사]/quote_calculation.json \
  "output/[고객사]/견적서_[RFQ번호].xlsx"
```

### 견적서 양식 구성

1. **헤더**: "견 적 서" 제목, 견적번호, 일자, 유효기간, 공급자/수신자 정보
2. **합계금액**: 추천 루트 기준 총액 강조 표시
3. **품목 테이블**: 번호, 품명, 규격(공정), 수량, 단위, 단가, 공급가액, 비고
4. **상세 조건**: 부품/공정/기술 조건/사이클타임/배치/리드타임/검사
5. **비고/특기사항**: 누락 스펙 확인 요청, 납기/포장 미정, 러프 견적 안내

### 검증
- xlsx 파일 정상 생성
- 4개 영역 모두 존재
- 금액이 quote_calculation.json과 일치
