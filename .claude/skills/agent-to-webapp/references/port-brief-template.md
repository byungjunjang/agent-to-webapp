# 웹 앱 전환 브리프: <이름>

작성일: <YYYY-MM-DD> · 대상: <대상 경로> · 설계서: docs/agent-to-webapp/workflow.md · 검증: docs/agent-to-webapp/verify/report.md

이 문서는 같은 폴더의 다음 세션이 읽는 지시문이다. 헤딩은 고치지 않는다(게이트가 찾는다).

## 1. 서버 쪽 호출
Claude 를 부르는 코드와 API 키는 Route Handler 또는 Server Action 에만 둔다. 브라우저 번들에 키가 가지 않는다.
- LLM 단계: <workflow.md 의 LLM 단계 번호와 이름>
- 환경변수: ANTHROPIC_API_KEY (Vercel 프로젝트 설정), A2W_MODEL=<STATUS 의 model ID. 관찰·재검증과 같은 모델>
- 로컬 `next dev` 는 이 폴더의 `.env.local` 에 키를 둔다(create-next-app 의 .gitignore 가 가린다). 스킬 `.env` 는 4단계 검증용이라 웹 앱이 읽지 않는다

## 2. 실행 시간 분할
Vercel 함수는 실행 시간 제한이 있다. report.md 의 단계별 시간을 적고 제한을 넘는 단계는 나눈다.
- 단계별 시간: <단계 N: n초 …>
- 나눌 단계: <없음 / 단계 N → 어떻게>

## 3. 상태 저장
<첫 줄에 `Supabase` 또는 `DB 없음`>
- 판단 근거: 사람 단계 <없음/마지막/중간> · 시간 합 <n초, 60초 초과 여부>. 중간이거나 초과면 Supabase
- Supabase 면: 테이블 `runs`(입력·상태·결과), `steps`(run_id·단계·상태·입출력 JSON). 단계 함수는 이전 단계의 출력 JSON 을 읽고 자기 출력을 쓴다. 이어 붙이기는 큐 또는 cron
- DB 없음이면: Route Handler 하나가 steps 를 순서대로 부르고 결과를 응답한다. 사람 단계가 마지막이면 결과 화면에서 승인·반려하고, 반려는 메모와 함께 다시 실행한다

## 4. 사람 확인 지점
<workflow.md 의 실행 주체 "사람" 단계. 중간이면 UI 승인 단계 + DB 상태(pending → approved), 마지막이면 결과 화면의 승인·반려. 없으면 "없음">

## 5. 외부 서비스로 뺄 단계
<report.md 의 같은 절을 옮기고 항목마다 임시 처리(stub·수동·외부 API)를 적는다. 없으면 `- 없음`>

## 6. 인증
범위 밖. 단일 사용자 데모. 로그인·멀티테넌트를 만들지 않는다.

## 7. 배포 후 검증
배포 뒤 `docs/agent-to-webapp/runs/inputs/` 3건을 웹 앱에 넣어 `verify/report.md` 와 비교한다. 결과는
`docs/agent-to-webapp/deploy-report.md` 에 `verify/report.md` 와 같은 헤딩(`## 입력 1` ~ `## 입력 3`)으로 적는다.
- [ ] Vercel 환경변수에 `ANTHROPIC_API_KEY` 가 있다. Supabase 면 URL 과 키도
- [ ] 브라우저 번들에 키가 없다: 빌드 뒤 `grep -r "sk-ant" .next/static` 결과가 비어 있다
- [ ] `runs/inputs/` 의 3건을 배포된 앱에 차례로 넣었다
- [ ] 결과를 `deploy-report.md` 에 `verify/report.md` 의 같은 입력과 나란히 적었다
- [ ] 차이가 report.md 의 차이보다 크면 웹 개발 문제다(에이전트 설계 문제는 4단계에서 끝났다). 단계 분할·시간 제한·상태 저장 중 어디인지 좁혀 적었다
- [ ] 사람 단계가 있으면 UI 승인 없이는 다음 단계로 못 간다(마지막이면 결과를 확정하지 못한다)
- [ ] 외부 서비스로 뺀 단계가 있으면 stub 이 화면에 명시된다
- [ ] 대상 프로젝트의 로컬 전용 파일(`CLAUDE.local.md` 블록, `settings.local.json` 훅·additionalDirectories)을 지웠다

## 스타일 (선택)
<비워 두면 다음 세션이 기본 스타일로 만든다. 예: 라이트 모드 전용, 악센트 #2563EB, gradient·shadow 금지>
