---
name: route-evaluator
description: 추출된 열처리 스펙과 장비/규칙을 대조하여 진공침탄, 가스침탄, 가스질화 3개 공정 루트의 적합성을 판정. 공정 선정, 루트 평가, 열처리 경로 판정 시 사용.
---

# 공정 루트 판정 스킬

추출된 스펙(`extracted_specs.json`)을 장비 데이터(`available_equipment.csv`)와 라우팅 규칙(`routing_pricing_rules.md`)에 대조하여 3개 공정 루트의 적합성을 판정한다.

## 입력

- `/output/[고객사]/extracted_specs.json`
- `available_equipment.csv`
- `routing_pricing_rules.md` (§2 Valid route logic)

## 절차

### 1. 보조 스크립트로 범위 매칭 확인

```bash
python .claude/skills/route-evaluator/scripts/evaluate_routes.py available_equipment.csv output/[고객사]/extracted_specs.json
```

이 스크립트는 각 장비의 ECD 범위 매칭 여부와 재질 유효성을 반환한다.

### 2. LLM 판정 (규칙 + 맥락)

`references/route_rules.md`의 규칙과 스크립트 결과를 조합하여 각 루트를 판정:

#### 진공 침탄 (VCQ-1200)
- 재질 매칭 + ECD 0.35-0.80mm 범위 + HRC 58-62 → **valid**
- 추가: 변형 ≤0.03mm OR 연삭 불가 OR 자동차 품질 우선 → **recommended**

#### 가스 침탄 (GC-900)
- 재질 매칭 + ECD 0.40-1.20mm + 중간 변형 수용 → **valid**
- 변형 ≤0.03mm + 연삭 불가 → **candidate_not_recommended**

#### 가스 질화 (GN-600)
- ECD 상한 > 0.40mm → **not_suitable**
- ECD 상한 ≤ 0.40mm + 변형 우선 + 질화 호환 → **valid**

### 3. 출력 JSON 생성

```json
[
  {
    "route_name": "vacuum_carburizing",
    "equipment_id": "VCQ-1200",
    "display_name": "Vacuum carburizing + 10 bar gas quench",
    "status": "recommended",
    "reason": "판정 사유",
    "distortion_risk": "Low"
  }
]
```

`/output/[고객사]/route_evaluation.json`으로 저장.

### 4. 리드타임 판정 (Step 5에서 추가)

고객 요청 납기(`delivery_days`)와 비교하여 각 valid 루트에 `lead_time_assessment` 필드 추가:
- `feasible` / `risk` / `not_feasible`

## 검증

- 3개 루트 모두 평가됨
- 각 루트에 `status`와 `reason` 존재
- `status` 값: `recommended`, `valid`, `candidate_not_recommended`, `not_suitable` 중 하나
