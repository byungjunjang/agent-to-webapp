# 설계: agent-to-webapp 스킬 — 로컬 에이전트를 웹 앱으로 옮기는 고정 공정

작성 2026-09-11 · 상태: 승인(brainstorming 1라운드, 2026-09-11) · 다음 단계: `superpowers:writing-plans` 로 구현 계획

이 문서는 LLM-Wiki 의 `wiki/vibe-coding/local-agent-to-web-app.md` 를 실행 절차로 옮기는
기획서다. 위키가 지식의 정본이고 이 문서는 그 지식을 스킬로 바꾸는 설계다. 위키가 갱신되면
이 문서와 스킬의 `references/` 도 따라 고친다.

## 1. 배경과 목적

Claude Code 실습 교육은 두 단계다. 1단계에서 로컬 커스텀 에이전트를 만들어 동작을 검증하고,
2단계에서 그것을 웹 앱으로 바이브 코딩한다. 두 단계 사이에 공정이 하나 빠져 있다.

로컬 에이전트는 모델이 순서를 정하고 코드를 부른다. 웹 앱은 코드가 순서를 정하고 정해진
단계에서 모델을 부른다. 1단계에서 검증한 것은 "모델이 이 일을 해낸다" 이지 "이 순서로
고정해도 된다" 가 아니다. 로컬 에이전트가 잘 돌수록 모델이 예외를 알아서 처리하므로
학습자는 그 처리가 있었다는 것 자체를 모른다. 웹 앱으로 고정하는 순간 그 판단이 사라지고,
왜 되던 것이 안 되는지 모르게 된다. 규칙을 쓴 적이 없기 때문이다.

그래서 사이에 **관찰 → 판정 → 고정 → 재검증** 을 넣고, 그 위에 **전환** 을 얹는다. 이 다섯
단계를 스킬 하나로 만든다. 이 공정을 건너뛰면 웹 앱 단계에서 에이전트 설계 문제와 웹 개발
문제가 동시에 터지고, 비개발자는 둘을 구분하지 못한다. 가장 어려운 케이스(동적 에이전트를
Vercel 에 바이브 코딩)가 실습에서 가장 자주 실패하는 케이스가 된다.

스킬이 없으면 매번 위키를 열어 프롬프트 넷을 복사해야 하고, 학습자에게 나눠줄 것이 없다.
이 공정의 산출물인 2×2 배정표와 `workflow.md` 는 하네스 엔지니어링 강의의 실질적 결과물이
된다 — CLAUDE.md 와 Skills 는 무엇을 하는지를 남기고, 이 표는 왜 그렇게 나눴는지를 남긴다.

## 2. 결정 사항

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | 위치 | `workos/agent-to-webapp/` 루트 직속, 자체 git repo | WorkOS 규칙: 루트 직속 = 자체 repo 를 가진 독립 제품. 교육에 배포할 것 |
| 2 | 스코프 | 프로젝트 스코프 `.claude/skills/agent-to-webapp/` 에서 먼저 만들고, 완성되면 `~/.claude/skills/agent-to-webapp/` 로 복사 설치 | 대상이 다른 폴더의 로컬 에이전트라 유저 스코프가 맞다. 개발은 한 폴더에서 |
| 3 | 대상 | 스킬은 **지금 열린 프로젝트를 전환 대상 에이전트로 간주** 한다 | 유저 스코프 스킬은 대상 프로젝트 안에서 불린다 |
| 4 | 범위 | 관찰·판정·고정·재검증·전환 다섯 단계. 배포 확인 체크리스트까지 | 스킬 이름이 가리키는 곳까지 |
| 5 | 구조 | 단일 SKILL.md + 단계 게이트. 커맨드 분할과 서브에이전트 파이프라인은 안 한다 | 1단계가 사람이 에이전트를 세 번 돌리는 일이라 자동 파이프라인이 성립하지 않는다 |
| 6 | 산출물 위치 | 대상 프로젝트 안 `a2w/` 한 폴더 | 대상 프로젝트의 다른 파일을 건드리지 않는다. 폴더명은 열린 항목(§14) |
| 7 | 게이트 | `scripts/check_phase.py` 가 단계마다 종료코드로 답한다. 통과 전에는 다음 단계로 못 간다 | 검증 없이 완료 선언 금지 |
| 8 | 웹 앱 위치 | 형제 폴더 `../<이름>-app/`, 자체 repo | 중첩 저장소 금지, Vercel Root Directory, 클라우드 에이전트의 통째 clone. 선례 `litigation-writer-app` |
| 9 | 스택 | 기본 Next.js + Supabase + Vercel. `--stack starter` 로 `vibecoding-workshop-starter`(Codex Sites·vinext·D1) 를 표기만 | 본인 기본값이 Next.js. 바꿀 이유 없음 |
| 10 | 재검증 언어 | TypeScript, Node 에서 바로 실행되는 단독 스크립트, Anthropic SDK | 웹 앱과 다른 언어로 검증하면 검증이 절반만 된다 |
| 11 | 훅 기록 | PostToolUse 훅은 선택 설치 | 교육에서는 자기 보고만으로 충분. 훅은 무엇을 했는지를, 자기 보고는 왜 그랬는지를 남긴다 |
| 12 | 원격 | `--batch` 면 질문 없이 진행 | 원격 채널에서는 질문하지 않는다 |
| 13 | 고정 불가 | 2단계에서 종료. Agent SDK + 별도 서버 트랙으로 라우팅 안내만 한다 | 우하단 칸은 이 스킬의 대상이 아니다 |
| 14 | 도착지 판정 | 정식 라우팅 단계는 두지 않는다. 1단계 시작 전 한 줄 확인("웹 앱이 도착지인가, 플러그인·cron·Slack 봇이 아닌가")만 | 웹 앱을 유일한 도착지로 두면 로컬 에이전트로 충분한 일까지 앱으로 만들게 된다. 그러나 이 스킬은 웹 앱이 도착지로 정해진 뒤에 부르는 것이다 |

## 3. 용어

| 용어 | 뜻 |
|---|---|
| 로컬 에이전트 | Claude Code·Codex 위에서 CLAUDE.md·Skills·훅으로 만든 개인 도구. 모델이 순서를 정하고 스크립트를 부른다. 에이전트 로직의 프로토타입 |
| 웹 앱 | 남이 쓰는 제품. 코드가 순서를 정하고 정해진 단계에서 모델을 부른다 |
| 고정 | 실행마다 달랐던 판단을 규칙으로 바꾸고 순서를 못 박는 것 |
| 2×2 표 | 단위 작업·워크플로우 × 결정론·확률론. 우하단(워크플로우 × 확률론)만 에이전트, 나머지 셋은 워크플로우. LLM 판단이 들어 있어도 순서가 고정이면 워크플로우다 |
| 세 축 | 제어권(코드/모델) · 도구(도메인 도구만/파일·쉘·코드 실행) · 환경(서버리스/장기 실행). 구현 수단을 정한다 |
| 게이트 | 단계를 통과했는지 스크립트가 판정하는 지점 |
| 브리프 | 5단계가 만드는 웹 앱 전환 지시문. 형제 폴더의 첫 세션이 읽는다 |

## 4. 다섯 단계

각 단계를 입력 → 할 일 → 산출물 → 게이트로 적는다. 프롬프트 원문은 §7.

### 1단계 관찰

- 입력: 대상 프로젝트(`CLAUDE.md` 또는 `.claude/skills/` 가 있는 폴더), 서로 다른 입력 3종(쉬움·보통·예외)
- 할 일: 기록 프롬프트(§7-1)를 CLAUDE.md 에 넣거나 매 요청 끝에 붙인다. 에이전트를 3회 이상 돌린다. 각 회의 입력을 `a2w/runs/inputs/` 에 보관한다. 훅 기록을 원하면 `assets/hooks.example.json` 을 `.claude/settings.local.json` 에 합친다
- 산출물: `a2w/runs/run-N.md`(자기 보고). 선택 `a2w/runs/run-N.tools.jsonl`
- 게이트: run 파일 3개 이상, inputs 3개 이상, 각 run 에 "판단이 필요했던 지점" 절 존재

한 번 돌려서는 고정 여부를 알 수 없다. 입력을 일부러 다르게 하는 이유가 그것이다.

### 2단계 판정

- 입력: `a2w/runs/` 전체
- 할 일: 판정 프롬프트(§7-2). 마지막 두 줄(억지로 고정 가능하다고 하지 말 것)은 삭제 금지. 모델은 기본적으로 가능하다고 답하는 쪽으로 기울어서 반대 의견을 낼 여지를 명시적으로 줘야 한다
- 산출물: `a2w/verdict.md` — 같았던 단계, 달랐던 단계(무엇이·왜), 2×2 배정표, 판정 한 줄
- 게이트: 판정 줄이 `고정 가능` / `조건부 고정 가능` / `고정 불가` 중 하나. **고정 불가면 STATUS 에 종료를 적고 멈춘다.** 라우팅 안내: Agent SDK 를 Vercel 밖 컨테이너에 두거나 Managed Agents. 선례 `workos/litigation-writer-app`

### 3단계 고정

- 입력: `a2w/verdict.md`
- 할 일: 고정 프롬프트(§7-3). 조건부면 조건을 명세 첫머리에 적는다
- 산출물: `a2w/workflow.md` — 단계마다 번호·이름, 실행 주체(코드/LLM), 입출력(가능하면 JSON), LLM 단계의 프롬프트 초안, 코드 단계의 규칙, 실패 처리, 사람 확인 지점
- 게이트: 모든 단계에 실행 주체·입력·출력·실패 처리 필드. `규칙화 불가` 항목은 이유와 함께 목록화

이 `workflow.md` 가 설계서다. 이것이 있어야 4단계의 스크립트와 5단계의 웹 앱이 같은 것을
가리킨다.

### 4단계 재검증

- 입력: `a2w/workflow.md`, `a2w/runs/inputs/`
- 할 일: 재검증 프롬프트(§7-4). Node 단독 스크립트, 웹 앱 뼈대 금지. "Next.js 로 짜라" 가 아니라 "TypeScript 로, Node 에서 바로 실행되는 단독 스크립트로" 다 — 이 구분이 없으면 Claude Code 가 이 단계에서 웹 앱 뼈대를 만들어 버린다
- 산출물: `a2w/verify/` — 단계당 함수 하나(`steps/`), `run.ts`, `package.json`, `report.md`(입력 3개의 결과와 로컬 에이전트 결과의 차이)
- 게이트: `report.md` 에 3건 결과. 파이썬 전용 의존이 나온 단계는 `외부 서비스로 뺄 단계` 로 표시. 차이가 허용 범위인지는 사람이 판단한다

어떤 단계가 파이썬 전용 라이브러리 없이는 안 된다고 나오면 그것은 문제가 아니라 정보다.
그 단계는 Vercel 위에서도 안 돌아간다는 뜻이니, 웹 앱을 만들기 전에 알게 된 것이다.

### 5단계 전환

- 입력: `a2w/workflow.md`, `a2w/verify/`
- 할 일: `references/port-brief-template.md` 로 `a2w/port-brief.md` 를 만든다. 형제 폴더 `../<이름>-app/` 을 만들고 `docs/port-brief.md`, `docs/workflow.md`, `src/lib/workflow/`(verify 의 `steps/` 복사)를 넣는다. 그 폴더에서 새 세션을 열어 전환 프롬프트(§7-5)로 바이브 코딩을 시작한다
- 산출물: `a2w/port-brief.md`, `../<이름>-app/` 스캐폴드
- 게이트: 브리프에 다음 다섯 가지가 명시돼 있다
  1. Claude 를 부르는 코드와 API 키는 서버 쪽(Route Handler 또는 Server Action)에만
  2. Vercel 함수는 실행 시간 제한이 있으니 오래 걸리는 단계는 나눈다
  3. 단계별 상태는 Supabase 에 저장하고 큐·cron 으로 이어 붙인다
  4. `workflow.md` 의 사람 확인 지점은 UI 승인 단계 + DB 상태로
  5. 배포 후 `runs/inputs/` 3개를 다시 넣어 `verify/report.md` 와 비교한다(`references/deploy-checklist.md`)

4단계를 통과했으면 이 단계는 이식이다. 에이전트 설계 문제는 끝났고 웹 개발 문제만 남는다.

### 재개 규칙

`a2w/STATUS.md` 에 통과한 단계와 날짜를 적는다. 스킬이 불리면 STATUS 를 먼저 읽고 그 다음
단계부터 시작한다. 컨텍스트 압축 뒤에도 같다. 파이프라인 절대 준수 — 게이트를 건너뛰고
다음 단계를 실행하지 않는다.

## 5. 산출물 폴더

```
<대상 에이전트 프로젝트>/
  a2w/
    STATUS.md                통과한 단계와 날짜. 재개 기준점
    runs/
      inputs/                실행 3회의 입력 (쉬움·보통·예외)
      run-1.md               자기 보고 (프롬프트 1)
      run-1.tools.jsonl      PostToolUse 훅 기록 (선택)
    verdict.md               2×2 배정표 + 판정 (프롬프트 2)
    workflow.md              고정 워크플로우 명세 (프롬프트 3)
    verify/                  TypeScript 단독 스크립트 (프롬프트 4)
      package.json
      run.ts
      steps/
      report.md
    port-brief.md            웹 앱 전환 브리프 (5단계)
```

## 6. 스킬 파일 구조

```
workos/agent-to-webapp/
  CLAUDE.md                              이 기획서를 먼저 읽으라는 포인터
  docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md   이 문서
  docs/superpowers/plans/                writing-plans 산출물
  .claude/skills/agent-to-webapp/        정본. 완성 후 ~/.claude/skills/ 로 복사
    SKILL.md                             절차·게이트·재개 규칙. 150줄 안쪽
    references/
      prompts.md                         §7 프롬프트 원문
      decision-axes.md                   §8 표 넷
      port-brief-template.md             5단계 브리프 틀
      deploy-checklist.md                배포 확인
    scripts/
      check_phase.py                     게이트. python -X utf8. 종료코드 0/1
      log_tool_use.py                    PostToolUse 훅
    assets/
      hooks.example.json                 훅 등록 예시
  examples/                              스킬 검증용 데모 에이전트 (§10)
```

`check_phase.py` 는 표준 라이브러리만 쓴다. 파일을 쓸 일이 있으면 `write_bytes` 로 쓴다 —
LLM-Wiki CLAUDE.md 의 CRLF 주의와 같은 이유다. 이 PC 는 Python 기본 인코딩이 `cp949` 라
`-X utf8` 이 필수다.

## 7. 프롬프트 원문

1~4 는 위키 페이지에서 그대로 옮겼다. 원출처는 2026-09-07 claude.ai 대화
(`LLM-Wiki/raw/conversations/2026-09-07_Local-Agent-To-Web-App.md`). 5 는 이 문서에서
처음 쓰는 초안이다.

### 7-1. 매 실행마다 기록 남기기

CLAUDE.md 에 넣거나 매번 요청 끝에 붙인다. 스킬은 경로를 `a2w/runs/` 로 바꿔 쓴다.

```
작업을 마친 뒤 runs/run-N.md 파일에 실행 기록을 남겨줘. (N은 순번)
- 수행한 단계를 순서대로 번호 매겨 적을 것
- 각 단계에서 사용한 도구, 스크립트, 스킬
- 각 단계의 입력과 출력이 무엇이었는지
- 판단이 필요했던 지점: 무엇을 보고 무엇을 결정했는지, 왜 그렇게 했는지
- 예상과 달라서 방식을 바꾼 지점이 있으면 그것도 적을 것
```

### 7-2. 고정 가능 여부 판정

세 번 이상 돌린 뒤.

```
runs/ 폴더의 실행 기록을 모두 읽고 워크플로우가 고정 가능한지 판정해줘.

1. 모든 실행에서 순서와 방식이 같았던 단계를 나열
2. 실행마다 달랐던 단계를 나열. 각각에 대해 무엇이 달랐는지(순서가 바뀜 / 단계가 추가·생략됨 / 같은 단계인데 방법이 다름)와 왜 달랐는지
3. 각 단계를 아래 표에 배정
   - 단위 작업 × 결정론: 정해진 규칙으로 고정 출력
   - 단위 작업 × 확률론: 매번 LLM 판단이 필요
   - 워크플로우 × 결정론: 순서가 고정
   - 워크플로우 × 확률론: 순서나 방식 자체가 상황에 따라 재구성됨
4. 4번째 칸에 해당하는 것이 있으면 명시하고, 규칙으로 바꿀 수 있는지 없는지 의견을 낼 것

최종 판정을 "고정 가능 / 조건부 고정 가능(조건 명시) / 고정 불가" 중 하나로 내줘.
억지로 고정 가능하다고 하지 말 것. 고정하면 품질이 떨어질 단계가 있으면 그렇다고 말해줘.
```

### 7-3. 워크플로우 고정

판정이 고정 가능일 때.

```
판정 결과를 바탕으로 workflow.md에 고정된 워크플로우 명세를 작성해줘.

각 단계마다:
- 단계 번호와 이름
- 실행 주체: 코드 / LLM
- 입력과 출력 (형식까지, 가능하면 JSON 구조로)
- LLM 단계면: 프롬프트 초안, 모델에 넘길 것과 받을 것
- 코드 단계면: 적용할 규칙
- 실패했을 때 처리 방법

실행마다 판단이 달랐던 부분은 규칙으로 바꾸는 것을 먼저 시도하고,
바꿀 수 없으면 "규칙화 불가"로 표시하고 이유를 적어줘.
사람이 확인해야 하는 지점이 있으면 그것도 단계로 넣어줘.
```

### 7-4. 스크립트 작성

```
workflow.md의 순서대로 각 단계를 함수 하나로 구현한 TypeScript 스크립트를 작성해줘.
- Node에서 바로 실행되는 단독 스크립트로. 웹 앱 뼈대는 만들지 말 것
- LLM 단계는 Anthropic SDK로 호출
- 단계 사이에 넘기는 데이터는 workflow.md에 정의한 JSON 형식을 그대로 쓸 것
- 작성 후 runs/에서 썼던 입력 3개로 실행하고, 로컬 에이전트 결과와 비교해서 차이를 보고해줘
```

### 7-5. 웹 앱 전환 (초안)

형제 폴더 `../<이름>-app/` 의 첫 세션에서 쓴다. 위키에 원문이 없다. 구현 때 다듬는다.

```
docs/port-brief.md 와 docs/workflow.md 를 읽고 이 워크플로우를 Next.js + Supabase 웹 앱으로 만들어줘.
- src/lib/workflow/ 의 함수들을 그대로 쓸 것. 로직을 다시 짜지 말 것
- Claude 를 부르는 코드와 API 키는 서버 쪽(Route Handler 또는 Server Action)에만 둘 것
- Vercel 함수는 실행 시간 제한이 있으니 오래 걸리는 단계는 나누고, 단계별 상태를 Supabase 에 저장할 것
- workflow.md 의 사람 확인 지점은 UI 승인 단계로 만들고 승인 상태를 DB 에 남길 것
- 화면은 입력 → 진행 상태 → 결과 셋이면 충분. 라이트 모드 전용, 악센트 #2563EB, gradient·shadow 금지
```

## 8. 참고 틀 (위키에서 발췌)

`references/decision-axes.md` 에 들어갈 표 넷. 출처는 모두
`wiki/vibe-coding/local-agent-to-web-app.md`.

### 세 결정 축

`동적이면 Agent SDK, 고정이면 API` 는 축을 잘못 잡은 것이다. 에이전트 루프는 Messages API
의 기본 기능이고 반복문 하나면 된다. 진짜 결정 축은 모델에게 어떤 도구가 필요한가이고,
여기에 실행 환경이 붙어 셋이 된다.

| 축 | 한쪽 | 다른 쪽 |
|---|---|---|
| 제어권 | 코드가 순서를 정한다 (워크플로우) | 모델이 정한다 (에이전트) |
| 도구 | 도메인 도구만 — DB 조회, 외부 API, 내 앱의 함수 | 파일시스템, 쉘, 런타임에 코드를 새로 써서 실행 |
| 환경 | 서버리스 함수 안에서 몇 초~몇 분에 끝난다 | 오래 돌아간다, 샌드박스가 필요하다 |

### 조합이 정하는 구현 수단

| 제어권 | 도구 | 수단 |
|---|---|---|
| 코드가 정함 | 도메인 도구 | Messages API. Next.js 안에서 끝난다 |
| 모델이 정함 | 도메인 도구 | API tool-use 루프를 직접 작성. 또는 Agent SDK 에 커스텀 도구만 |
| 모델이 정함 | 파일·쉘·코드 실행 | Agent SDK 를 Vercel 밖 컨테이너에. 또는 Managed Agents |

이 스킬이 다루는 것은 첫 행이다. 2단계 판정이 고정 가능이면 첫 행에 들어온 것이다.
셋째 행은 2단계에서 걸러져 나간다.

### 하네스 5요소의 웹 앱 매핑

| 로컬 하네스 | 웹 앱 — API 경로 | 웹 앱 — Agent SDK 경로 |
|---|---|---|
| CLAUDE.md | system prompt | 그대로 (설정 소스 로딩) |
| Skill | tool 정의 + 서버 함수 | .claude/skills 그대로 |
| Subagent | 별도 API 호출·병렬 실행 | SDK 서브에이전트 |
| Hooks | 미들웨어·검증 코드 | SDK hooks |
| MCP | 직접 함수 호출로 대체 가능 | 그대로 |
| 사람 승인 | UI 승인 단계 + DB 상태 | permission 콜백 |

Skill 하나가 웹 앱에서는 코드가 호출하는 서버 함수 하나와, 그 안에서 특정 시점에 부르는
Claude API 호출 하나로 분해된다.

### 실행 환경 차이

| | 로컬 | Vercel |
|---|---|---|
| 파일과 쉘 | 있다 | 영구 파일시스템 없음 |
| 시간 | 제한 없음 | 서버리스 함수의 실행 시간 제한 |
| 사용자 | 나 혼자 | 멀티테넌트 |
| 승인 | 사람이 그 자리에서 | UI 승인 단계와 DB 상태로 |
| 상태 | 폴더 | Supabase |

## 9. 웹 앱은 형제 repo — 선례

| 선례 | 로컬 에이전트 | 웹 앱 | 비고 |
|---|---|---|---|
| 송무서면 | `workos/litigation-writer` | `workos/litigation-writer-app` (Next.js 15 + Supabase + Managed Agents) | §8 셋째 행. 스킬 5종·rules·templates 를 tar.gz 번들로 실어 나른다. 이 스킬의 대상이 아닌 경로의 선례 |
| 철거 | `.demo-projects/demolition-agent` | `workos/demolition-web-app` | 어느 행인지 미확인. 구현 세션에서 확인 |
| 워크샵 스타터 | — | `.demo-projects/vibecoding-workshop-starter` (Codex Sites·vinext·D1) | `--stack starter` 의 실체 |

`litigation-writer-app/CLAUDE.md` 가 형제 분리의 이유를 이미 적어 뒀다. 에이전트
프로젝트는 별도 저장소가 canonical 이고 앱 저장소에는 그 소스를 두지 않는다. Vercel 배포는
Root Directory 하나를 보고, 클라우드 에이전트는 저장소를 통째로 clone 한다. WorkOS 의 중첩
저장소 금지 규칙도 같은 방향이다. 이 스킬의 5단계는 그 규칙을 그대로 따른다.

## 10. 스킬 자체의 검증

`examples/` 에 데모 에이전트를 두고 스킬을 끝까지 돌린다. 경로 둘을 다 밟아야 한다.

| 경로 | 성공 기준 |
|---|---|
| 고정 가능 | 1~5단계 게이트를 전부 통과하고 형제 `-app/` 폴더가 스캐폴드된다. `verify/report.md` 의 3건이 로컬 결과와 허용 범위 안에서 일치한다 |
| 고정 불가 | 2단계에서 멈추고 STATUS 에 종료가 적히며 Agent SDK 트랙 안내가 나온다. 3단계 이후 파일이 생기지 않는다 |

후보는 `.demo-projects` 에서 고른다. 아래는 이름만 보고 짐작한 것이라 내용 확인이 먼저다.

- 고정 가능 쪽 추정: `exam-score-aggregator`, `weekly-report-guess`, `email-issue-brief`, `rfq-quote-generator`
- 고정 불가 쪽 추정: `competitor-review-crawler`, `instagram-monitor` (사이트마다 다른 수집 코드를 설계하는 우하단 예시에 가깝다)

`.demo-projects` 에서 가져올 때는 사본이다. 원본은 두고 `.git` 없이 복사한다.

실습 시행착오는 `LLM-Wiki/raw/practice/YYYY-MM-DD_주제.md` 로 먼저 쓰고 `/wiki-ingest` 로
컴파일한다. 위키에 직접 쓰지 않는다.

## 11. 범위 밖

- Agent SDK·Managed Agents 경로의 구현. 2단계에서 라우팅 안내까지만
- 웹 앱 자동 생성. 5단계는 브리프와 스캐폴드까지고, 바이브 코딩은 형제 폴더의 새 세션이 한다
- 3입력 비교 이상의 eval. 품질 평가는 `eval-and-improvement/` 위키 페이지들의 몫
- n8n·Slack 봇·플러그인 배포 같은 다른 도착지. 이 스킬은 웹 앱이 도착지로 정해진 뒤에 부른다

## 12. 근거

이 PC 기준 경로. 맥미니는 `/Users/byungjunjang/Desktop/WorkOS/llm-wiki`.

- `C:\Users\byung\LLM-Wiki\wiki\vibe-coding\local-agent-to-web-app.md` — 본체. 다섯 단계, 프롬프트 넷, 세 축, 매핑표
- `C:\Users\byung\LLM-Wiki\wiki\agent-design\deterministic-probabilistic-decomposition.md` — 2×2 표의 원래 자리와 본인이 다시 그린 판
- `C:\Users\byung\LLM-Wiki\wiki\agent-design\agent-system-design-process.md` — `workflow.md` 가 놓이는 설계서의 자리
- `C:\Users\byung\LLM-Wiki\wiki\agent-design\graph-workflow-design.md` — 자동화 전에 수동으로 세 번 돌린다는 같은 방향의 독립 소스
- `C:\Users\byung\LLM-Wiki\wiki\practice\teaching-design-pattern.md` — 실습 두 단계 구조
- `C:\Users\byung\LLM-Wiki\raw\conversations\2026-09-07_Local-Agent-To-Web-App.md` — 원출처 대화
- `C:\Users\byung\workos\litigation-writer-app\CLAUDE.md` — 형제 repo 분리의 이유
- `C:\Users\byung\workos\CLAUDE.md` — 폴더 분류와 중첩 저장소 금지

## 13. 다음 세션 착수 순서

1. 이 문서를 읽는다. §2 가 결정의 정본이다
2. `superpowers:writing-plans` 로 구현 계획을 `docs/superpowers/plans/` 에 쓴다
3. 구현 순서 제안: `references/`(위키 발췌) → `SKILL.md` → `scripts/check_phase.py` → `examples/` 로 1~4단계 dogfood → `port-brief-template.md`·`deploy-checklist.md` → `log_tool_use.py`·`hooks.example.json`
4. 두 경로(§10) 모두 통과하면 `~/.claude/skills/agent-to-webapp/` 로 복사하고, 대상 프로젝트 하나에서 유저 스코프 호출을 확인한다
5. 시행착오를 `raw/practice/` 로 보내 `/wiki-ingest`

## 14. 열린 항목

- `a2w/` 폴더명. 짧지만 뜻이 안 보인다. 학습자가 보는 이름이라 구현 전에 정한다
- `examples/` 후보 선택 (§10). 내용 확인 뒤 각 경로 하나씩
- Agent SDK 가 파일시스템 설정을 기본으로 로드하지 않아 스킬을 쓰려면 설정 소스를 명시해야 한다는 사양 — 대화 재구성본의 Claude 턴이 말한 것이라 공식 문서 확인이 필요하다. 2단계 라우팅 안내문에만 쓰이므로 급하지 않다
- 5단계 형제 폴더 스캐폴드를 스킬이 직접 만들지, 브리프만 만들고 사람이 만들지. 초안은 직접 만든다
- `log_tool_use.py` 를 Python 으로 할지 bash 로 할지. Windows 와 맥미니 둘 다 돌아야 하므로 Python 우선
