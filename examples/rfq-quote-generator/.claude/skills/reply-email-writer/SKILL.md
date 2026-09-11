---
name: reply-email-writer
description: 견적 데이터를 기반으로 한국어, 중국어, 영어 3개 국어 회신 이메일 초안을 생성. 이메일 작성, 회신 이메일, 견적 회신, 한중영 이메일 시 사용.
---

# 회신 이메일 생성 스킬

견적 계산 결과와 루트 평가 데이터를 기반으로 한/중/영 3개 국어의 고객 회신 이메일 초안을 생성한다.

## 입력

- `/output/[고객사]/extracted_specs.json` (고객 정보, 누락 스펙)
- `/output/[고객사]/route_evaluation.json` (추천 루트, 리드타임)
- `/output/[고객사]/quote_calculation.json` (단가, 총액)

## 이메일 구조 (3개 국어 공통)

참조: `references/email_templates.md`

### 1. 제목 (Subject)
```
RE: [원본 RFQ 제목] — 견적 회신 / 报价回复 / Quotation Reply
```

### 2. 본문 섹션

#### (a) 인사
- ko: "[고객명]님, 귀사의 견적 요청(RFQ No. XXX)에 대해 회신드립니다."
- zh: "[고객명] 先生/女士，您好！感谢贵司发来的询价（RFQ No. XXX）。"
- en: "Dear Mr./Ms. [Name], Thank you for your RFQ (No. XXX)."

#### (b) 견적 요약
- 추천 공정명 + 단가 (CNY/pc) + 총액 (CNY)
- 대안 루트가 있으면 1줄 비교

#### (c) 확인 요청 사항
- `missing_specs` 배열의 각 항목을 번호 매김으로 나열
- 각 항목에 왜 필요한지 간단 설명

#### (d) 납기 안내
- 추천 루트의 `lead_time_assessment` 결과 반영
- feasible → "납기 대응 가능합니다"
- risk → "일정 리스크가 있어 사전 협의가 필요합니다"

#### (e) 마무리
- 첨부 파일 안내: "별첨 견적서(견적서_[RFQ번호].xlsx)를 참조해 주십시오"
- "본 견적은 러프 견적이며, 최종 단가는 시험 가공 후 확정"
- 추가 문의 환영 + 서명

## 출력

- `/output/[고객사]/reply_email_ko.md` — 한국어 (격식체, 합니다체)
- `/output/[고객사]/reply_email_zh.md` — 중국어 (商务正式)
- `/output/[고객사]/reply_email_en.md` — 영어 (Formal business)

## 검증

- 3개 파일 모두 생성
- 각 파일에 필수 정보 포함: 견적 금액, 추천 루트, 누락 스펙, 납기, 견적서 파일 참조
- 3개 국어 간 수치 정보 일관성 확인
