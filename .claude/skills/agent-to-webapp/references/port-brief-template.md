# 웹 앱 전환 브리프: <이름>

작성일: <YYYY-MM-DD> · 대상: <대상 경로> · 설계서: docs/agent-to-webapp/workflow.md · 검증: docs/agent-to-webapp/verify/report.md

이 문서는 같은 폴더의 다음 세션이 읽는 지시문이다. 헤딩은 고치지 않는다(게이트가 찾는다).

## 1. 서버 쪽 호출
Claude 를 부르는 코드와 API 키는 Route Handler 또는 Server Action 에만 둔다. 브라우저 번들에 키가 가지 않는다.
- LLM 단계: <workflow.md 의 LLM 단계 번호와 이름>
- 환경변수: ANTHROPIC_API_KEY (Vercel 프로젝트 설정), A2W_MODEL (선택)
- 로컬 `next dev` 는 이 폴더의 `.env.local` 에 키를 둔다(create-next-app 의 .gitignore 가 가린다). 스킬 `.env` 는 4단계 검증용이라 웹 앱이 읽지 않는다

## 2. 실행 시간 분할
Vercel 함수는 실행 시간 제한이 있다. report.md 의 단계별 시간을 적고 제한을 넘는 단계는 나눈다.
- 단계별 시간: <단계 N: n초 …>
- 나눌 단계: <없음 / 단계 N → 어떻게>

## 3. 상태 저장
<첫 줄에 `Supabase` 또는 `DB 없음`>
- 판단 근거: 사람 단계 <있음/없음> · 시간 합 <n초, 60초 초과 여부>
- Supabase 면: 테이블 `runs`(입력·상태·결과), `steps`(run_id·단계·상태·입출력 JSON). 단계 함수는 이전 단계의 출력 JSON 을 읽고 자기 출력을 쓴다. 이어 붙이기는 큐 또는 cron
- DB 없음이면: Route Handler 하나가 steps 를 순서대로 부르고 결과를 응답한다

## 4. 사람 확인 지점
<workflow.md 의 실행 주체 "사람" 단계. UI 승인 단계 + DB 상태(pending → approved)로 만든다. 없으면 "없음">

## 5. 외부 서비스로 뺄 단계
<report.md 의 같은 절을 옮기고 항목마다 임시 처리(stub·수동·외부 API)를 적는다. 없으면 `- 없음`>

## 6. 인증
범위 밖. 단일 사용자 데모. 로그인·멀티테넌트를 만들지 않는다.

## 7. 배포 후 검증
배포 뒤 `docs/agent-to-webapp/runs/inputs/` 3건을 웹 앱에 넣어 `verify/report.md` 와 비교한다. 절차는 `references/deploy-checklist.md`.

## 스타일 (선택)
<비워 두면 다음 세션이 기본 스타일로 만든다. 예: 라이트 모드 전용, 악센트 #2563EB, gradient·shadow 금지>
