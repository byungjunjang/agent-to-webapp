---
name: rfq-spec-extractor
description: RFQ 이메일 PDF와 부품 도면 PDF에서 열처리 스펙 항목을 구조화된 JSON으로 추출. RFQ 파싱, 스펙 추출, 도면 해석, 열처리 요구사항 추출 시 사용.
---

# RFQ 스펙 추출 스킬

고객 RFQ 이메일 PDF와 부품 도면 PDF를 읽어 열처리 관련 스펙을 구조화된 JSON으로 추출한다.

## 입력

- `customer_rfq_email.pdf` — 고객 견적 요청 이메일
- `part_drawing_*.pdf` — 부품 도면 (열처리 노트 포함)

## 절차

1. **RFQ 이메일 PDF 읽기** (Read 도구 사용)
   - 부품명, 재질, 수량, 월 소요량 추출
   - ECD 범위, 표면경도, 심부경도, 변형 한도 추출
   - 연삭 후처리 여부, 납기 요청 추출
   - 고객명, 회사명, RFQ 번호 추출

2. **도면 PDF 읽기** (Read 도구 사용)
   - 열처리 노트(NOTES / HEAT TREAT REQUIREMENTS) 영역에서 보충 정보 추출
   - 도면번호, REV, 재질, MASS(부품 중량) 추출
   - RFQ 이메일과 도면 간 정보 교차 검증

3. **JSON 구조화**
   아래 필드를 모두 포함하는 JSON 생성:

   ```json
   {
     "part_name": "string",
     "drawing_no": "string",
     "material": "string",
     "lot_size": 1200,
     "monthly_volume": 3600,
     "part_weight_kg": 0.82,
     "case_depth_low": 0.45,
     "case_depth_high": 0.65,
     "hardness_test_standard": "HV550",
     "surface_hardness_low": 58,
     "surface_hardness_high": 62,
     "core_hardness_low": 30,
     "core_hardness_high": 42,
     "distortion_limit_mm": 0.03,
     "grinding_after_ht": false,
     "delivery_days": 12,
     "customer_name": "string",
     "customer_company": "string",
     "rfq_number": "string"
   }
   ```

4. **스키마 검증**
   ```bash
   python .claude/skills/rfq-spec-extractor/scripts/validate_specs.py output/[고객사]/extracted_specs.json
   ```
   - 통과 시: `/output/[고객사]/extracted_specs.json` 저장 완료
   - 실패 시: 에러 필드 확인 후 재추출 (최대 2회)

## 주의사항

- 수치는 반드시 숫자 타입으로 저장 (문자열 금지)
- `grinding_after_ht`는 boolean — "열처리 후 연삭 수정 불가" → `false`
- `delivery_days`는 정수로 변환 (예: "PO 후 12 일" → `12`)
- 도면의 MASS 필드에서 `part_weight_kg` 추출 (단위 변환 주의: kg 기준)
