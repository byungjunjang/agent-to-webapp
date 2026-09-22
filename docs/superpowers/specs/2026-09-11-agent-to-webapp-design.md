# 설계: agent-to-webapp 스킬 — 로컬 에이전트를 웹 앱으로 옮기는 고정 공정

작성 2026-09-11 · 상태: 승인(brainstorming 1라운드 → grill-me 2라운드 반영, 2026-09-11) ·
구현 완료(계획서는 `docs/superpowers/plans/archive/`), 고정 가능 경로 dogfood 통과(2026-09-11) ·
남은 일: 고정 불가 경로 dogfood(§14), `/wiki-ingest`

이 문서는 LLM-Wiki 의 `wiki/vibe-coding/local-agent-to-web-app.md` 를 실행 절차로 옮기는
기획서다. 위키는 개념과 프롬프트 원문을 보존하고, 이 문서와 스킬의 `references/` 는 그
지식의 **실행판** 이다(§2-17). 실행판이 원문에서 벗어날 때는 이유를 `raw/practice/` 로 보내
위키에 되먹인다.

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

**누가 쓰는가.** 비개발자 학습자가 자기 에이전트에 직접 돌리는 것을 기준으로 설계한다.
강사는 같은 스킬로 시연한다. 1~2단계는 수업 시간 안에, 3~5단계는 과제 또는 다음 회차로
가정한다(§2-16). 설명량·질문 수·런타임 의존은 이 기준으로 정한다.

## 2. 결정 사항

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| 1 | 위치 | `workos/agent-to-webapp/` 루트 직속, 자체 git repo | WorkOS 규칙: 루트 직속 = 자체 repo 를 가진 독립 제품. 교육에 배포할 것 |
| 2 | 스코프 | 프로젝트 스코프 `.claude/skills/agent-to-webapp/` 에서 먼저 만들고, 완성되면 `~/.claude/skills/agent-to-webapp/` 로 복사 설치 | 대상이 다른 폴더의 로컬 에이전트라 유저 스코프가 맞다. 개발은 한 폴더에서 |
| 3 | 대상 지정 | 스킬은 **작업 폴더 `<이름>-app/` 에서 부른다**. 대상은 `/agent-to-webapp ../<이름>` 처럼 인자로 주고, 없으면 스킬이 묻는다. `STATUS.md` 에 `target` 과 `runtime` 을 기록한다 | 대상 안에서 부르면 대상의 CLAUDE.md 가 2~5단계 세션을 오염시킨다. 작업 폴더에서 부르면 대상은 무변경이고 Codex 대상도 자연스럽다 |
| 4 | 범위 | 관찰·판정·고정·재검증·전환 다섯 단계. 배포 확인 체크리스트까지 | 스킬 이름이 가리키는 곳까지 |
| 5 | 구조 | 단일 SKILL.md + 단계 게이트. 다섯 단계 전체를 서브에이전트 파이프라인으로 자동화하지 않는다. **2단계 판정만 서브에이전트** 가 새 컨텍스트에서 한다 | 1단계가 사람이 에이전트를 세 번 돌리는 일이라 자동 파이프라인이 성립하지 않는다. 판정은 자기 실행을 자기가 평가하는 일이라 새 눈이 필요하다 |
| 6 | 산출물 위치 | `<이름>-app/docs/agent-to-webapp/` 한 폴더. **대상 프로젝트의 git 추적 파일은 건드리지 않는다.** 1단계에 필요한 로컬 전용 파일만 대상에 둔다(§4-1) | 대상 무변경. `docs/` 는 create-next-app 이 비어 있지 않은 폴더에서 허용하는 이름이라 5단계와 충돌하지 않는다 |
| 7 | 게이트 | `scripts/check_phase.mjs` 가 단계마다 종료코드로 답한다. **STATUS 는 스크립트가 통과 시 직접 쓴다.** 2·3단계는 사람 승인을 STATUS 에 기록해야 통과(`--batch` 면 생략). 2단계는 배정표에 4번째 칸 항목이 있으면 `고정 가능` 을 거부한다. 사람이 판정을 뒤집을 수 있고 사유를 STATUS 에 남긴다 | 검증 없이 완료 선언 금지. 모델이 통과를 선언만 하고 넘어가는 경로를 막는다 |
| 8 | 웹 앱 위치 | 작업 폴더가 곧 웹 앱 repo. `../<이름>-app/`, 자체 repo. 스킬이 시작 때 `git init` 한다. 5단계 스캐폴드는 `docs/` 까지만 | 중첩 저장소 금지, Vercel Root Directory, 클라우드 에이전트의 통째 clone. 선례 `litigation-writer-app`. 형제가 둘이면 충분하다 |
| 9 | 스택 | Next.js + Vercel. Supabase 는 조건부(§4-5). `--stack` 옵션은 없다 | 본인 기본값이 Next.js. 스타터 표기는 뜻이 불분명하고 브리프 항목과 충돌해 뺐다 |
| 10 | 재검증 언어 | TypeScript, Node 24 에서 `node run.ts` 로 바로 실행되는 단독 스크립트(`tsx` 불필요), Anthropic SDK. 기본 모델 `claude-sonnet-5`, 환경변수로 변경. `child_process` 로 Python 을 부르지 않는다. **러너 `run.ts` 와 `lib/` 는 스킬 자산 `assets/verify-template` 에서 복사하고 LLM 은 `steps/` 만 쓴다**(2026-09-14, §2-21) | 웹 앱과 다른 언어로 검증하면 검증이 절반만 된다. Vercel 에서 안 도는 것을 로컬에서 되게 하면 검증이 아니다 |
| 11 | 훅 기록 | Claude Code 대상은 PostToolUse 훅을 **기본 설치**(끌 수 있다). Codex 대상은 `.codex/hooks.json` 을 시도하고, 페이로드가 다르면 자기 보고만으로 후퇴한다. 훅은 파일 경로·명령과 응답 첫 200자만 남기고, 1단계 게이트가 `run-N.tools.md` 색인(순번·시각·도구·대상·공백)을 만든다(2026-09-14) | 판정 서브에이전트가 자기 보고를 실제 도구 호출과 대조하려면 훅 기록이 있어야 한다. 훅은 무엇을 했는지를, 자기 보고는 왜 그랬는지를 남긴다. dogfood 에서 응답이 기록 340KB 의 3분의 2였지만 판정은 순번·시각·도구·경로만 썼다 |
| 12 | 원격 | `--batch` 면 질문 없이 진행. 사람 승인 게이트도 생략 | 원격 채널에서는 질문하지 않는다 |
| 13 | 고정 불가 | 2단계에서 종료. Agent SDK + 별도 서버 트랙으로 라우팅 안내만 한다 | 우하단 칸은 이 스킬의 대상이 아니다 |
| 14 | 도착지 판정 | 정식 라우팅 단계는 두지 않는다. 시작 때 한 줄 확인("웹 앱이 도착지인가, 플러그인·cron·Slack 봇이 아닌가")만 | 웹 앱을 유일한 도착지로 두면 로컬 에이전트로 충분한 일까지 앱으로 만들게 된다. 그러나 이 스킬은 웹 앱이 도착지로 정해진 뒤에 부르는 것이다 |
| 15 | 대상 런타임 | **Claude Code 와 Codex 둘 다** 대상이다. 표식은 `CLAUDE.md`·`.claude/skills/` 와 `AGENTS.md`·`.agents/skills/`. 둘 다 있으면 묻는다. 스킬 자체는 Claude Code 에서만 실행한다 | 위키가 로컬 에이전트를 Claude Code·Codex 로 정의하고, 데모 풀의 상당수가 Codex 기반이다. 판정 서브에이전트와 사람 승인 질문이 Claude Code 도구에 묶여 있다 |
| 16 | 사용자·시간 | 학습자 기준. 1~2단계 수업 중, 3~5단계 과제 | §1 |
| 17 | 프롬프트 정본 | 실행판은 각 `references/phase-N.md` 안의 "프롬프트 N" 절(2026-09-14 까지는 `prompts.md` 한 파일). 위키는 원문과 개념을 보존하고 "실행판은 agent-to-webapp 스킬" 한 줄을 단다 | 실행판은 경로·고정 헤딩·JSON 필수·4번째 칸 규칙이 원문과 다르다. 바뀔 때마다 위키를 고치면 위키가 스킬 매뉴얼이 된다. 한 파일에 두면 단계마다 다섯 프롬프트를 다 읽는다 |
| 18 | API 키 | 사용자별 키를 스킬 폴더의 `.env` 에 둔다. 한 번 만들면 모든 프로젝트의 4단계가 다시 쓰고, 한 프로젝트만 다를 때 `verify/.env` 가 덮는다. `.env` 는 git 에 올리지 않는다(저장소와 스킬 폴더의 `.gitignore`, 테스트로 강제). 설치 스크립트는 설치된 쪽 `.env` 를 지우지 않는다. 스킬은 키를 읽지 않고 `check_phase.mjs key` 가 출처만 답한다. 훅 기록은 키 모양 문자열을 가린다 | 학습자가 프로젝트마다 키를 만들 필요가 없다. 셸 환경변수로 두면 Claude Code 가 구독 대신 그 키로 과금한다(Anthropic 지원 문서) |
| 19 | 4단계 검증 수단 | 코드가 순서를 정하고 Anthropic API 를 부르는 스크립트로만 한다. 에이전트가 workflow.md 를 따라 하거나 `claude -p` 로 대체하지 않는다 | 에이전트는 빈틈을 판단으로 메워 통과한다(dogfood 2회차의 견적서 수기 보정). API 스크립트만 순서, 스키마 연결, 단계 단독 동작, 실제 소요 시간을 보여 주고, 그 함수가 웹 앱으로 복사된다 |
| 20 | workflow.md 흐름도 | 첫 절 `## 흐름도` 에 Mermaid `flowchart TD` 하나. 노드 id `S<단계 번호>`, 모양·class 는 실행 주체(코드 사각·`code`, LLM 알약·`llm`, 사람 육각·`human`, 입력·끝점 회색·`term`), 분기·되돌아가기는 라벨 화살표, 멈추는 실패는 점선. 3단계 게이트가 노드와 `### 단계 N`, class 와 실행 주체를 대조해 어긋나면 실패 | 명세가 길어(rfq 예제 510줄) 순서·재시도·사람 확인 지점이 한눈에 안 보인다. 학습자가 승인 때 읽는 문서라 첫 화면에 둔다. Mermaid 는 GitHub·Obsidian 이 그리고 diff 가 된다. 대조가 없으면 단계를 고친 뒤 그림이 옛것으로 남는다 |
| 21 | 경량화 | (a) 4단계 러너·라이브러리를 `assets/verify-template` 로 고정하고 `--from N` 이어 돌리기. 게이트는 템플릿과 다르면 경고 (b) 훅 기록은 경로·명령·응답 200자, 1단계 게이트가 `run-N.tools.md` 색인 생성, 2단계는 색인을 읽는다 (c) workflow.md 스키마는 `단계 N 출력과 같음` / `공통 스키마 이름` / `입력과 같음` 참조 허용, 게이트가 참조를 끝까지 따라가 검사 (d) report 의 입력 절은 차이 표 하나, verdict 는 표 위주 한 줄 근거 (e) 프롬프트를 단계 문서로 흡수 | dogfood 실측: 2단계 입력 400KB 중 훅 기록 340KB, workflow 544줄 중 JSON 257줄, 러너 19KB 를 매번 새로 씀, API 28회 중 최종 13회, report 20KB. 단계 수·관찰 3회·서브에이전트·게이트는 그대로 둔다 — 그것들은 비용의 원인이 아니었다 |
| 22 | 관찰 횟수·모델 | `init --runs N`(기본 3)·`--model <sonnet|opus|haiku|ID>`(기본 sonnet)를 STATUS 에 적는다. 1단계는 runs 개의 입력·run 만 요구하고(1이면 "보통" 하나), 관찰 세션의 `.claude/settings.local.json` 에 `model` 을 넣으며, 4단계 `key` 가 같은 모델을 `A2W_MODEL` 로 붙인다. **runs 가 3 미만이면 2단계는 `고정 가능` 을 거부**하고 조건부(관찰 N회)까지만 받는다. 뒤에 더 돌려 1단계 게이트를 다시 통과하면 runs 가 올라간다 | 강의는 2시간 안에 끝나야 한다. 관찰 1회는 실행 간 차이를 못 보므로 잠정 판정이어야 한다. 모델은 Haiku 로 고정하지 않는다 — 숨은 판단(반올림 버그 발견, 사후 보정, 가정값 주입)은 모델 능력에 달려 있어 약한 모델은 4번째 칸을 놓치거나 실패를 4번째 칸으로 오인한다. 기본 sonnet 은 웹 앱이 쓸 모델이자 4단계 기본 모델이라 관찰·재검증 비교가 같은 모델끼리가 된다 |
| 23 | 병렬 관찰 | 관찰 세션 N개를 **동시에** 여는 것이 기본. run 파일 번호는 입력 폴더의 앞 숫자(`1-easy-…` → `run-1`), 훅 기록 짝짓기는 기록 안의 입력 경로(`inputs/<N>-`)로 하고 경로가 없을 때만 시각 순으로 후퇴·경고. 1단계가 대상의 출력 경로가 입력마다 갈리는지 보고 `inputs/README.md` 에 `관찰 방식: 동시 | 차례` 를 적는다. 고정 경로면 차례 | 관찰 시간이 세 실행의 합에서 가장 긴 하나로 준다. 번호를 입력에서 정하면 세션이 runs 폴더를 볼 이유가 없어 dogfood 의 오염(run 2·3 이 run 1 을 읽음)이 구조적으로 사라진다. 헤드리스 `claude -p` 를 스킬이 직접 띄우는 안은 비대화형이라 예외 입력 관찰이 달라지고 권한을 다 열어야 해서 기본으로 두지 않는다 |
| 24 | 다음 세션 프롬프트 | 5단계는 프롬프트 5 를 `$A2W/prompt.md` 에 코드 블록으로 남기고 끝낸다. 게이트가 파일과 코드 블록 안의 고정 문자열(`PROMPT_MUST`: 브리프·workflow 경로, `create-next-app`, `src/lib/workflow/`)을 확인하고, 통과 메시지가 그 경로를 알린다. 원문 정본은 여전히 `references/phase-5.md`(§2-17) | 터미널에만 보여 준 프롬프트는 스크롤에 묻히고 다른 기기·다음 날 세션에서 찾을 수 없다. 2026-09-14 재-dogfood 뒤 사용자 요청 |
| 25 | 웹 앱 간소화 | 3단계가 단계를 다 쓴 뒤 흐름도 전에 Next.js 웹 앱 기준으로 줄이고 문서 끝 `## 웹 앱 간소화` 에 결과를 적는다. 점검은 넷: 로컬 흔적(폴더·복사·파일명 역할 가르기) 뺌, 분기 없이 이어지는 코드 단계 합침, 뒤에 되돌릴 수 없는 외부 효과가 없으면 중간 사람 단계를 끝으로 옮김, 산출물 범위는 줄이지 않고 `범위 확인` 으로 학습자에게. 검증 단계·규칙화 불가에서 온 단계·관찰된 실패를 막는 규칙은 빼지 않는다. 게이트는 절이 없거나 비면 실패, 흐름도 화살표로 찾은 분기 없는 코드 단계 쌍은 경고. 5단계는 사람 단계가 마지막이면 `DB 없음` 을 허용한다 | 4단계가 검증한 steps/ 를 5단계가 그대로 복사하므로 줄이려면 4단계 전이어야 한다. 새 단계·서브에이전트는 강의 시간 때문에 두지 않는다. rfq 12단계 실측: 분기 없는 코드 쌍 둘(4·5, 7·8), 입력당 44–52초인데 중간 사람 단계 하나 때문에 Supabase 가 붙었다. 합칠지는 판단이라 경고로 둔다 |
| 26 | 설계서·코드 대조 | 4단계 게이트가 `workflow.md` 의 `### 단계 N` 과 `steps/` 의 단계 객체(`n`·`name`·`actor`)를 번호로 짝지어 이름·실행 주체를 대조한다. 하나라도 다르면 실패. `n:` 이 없는 파일은 보조 파일로 보고 뺀다. `## 재검증 중 고친 것` 경고는 그대로 둔다(스키마·프롬프트 변경은 대조 밖) | 학습자가 3단계에서 승인한 설계와 5단계가 복사하는 코드가 어긋나면 학습자는 A 를 승인했는데 웹 앱은 B 가 된다. 2026-09-11 dogfood 에서 실제로 일어났고, 그때의 처방(보고서 절 + 경고)은 모델이 스스로 적어야만 잡힌다. §2-7 은 "모델이 통과를 선언만 하고 넘어가는 경로를 막는다" 인데 4단계만 자기 보고에 기댔다. 3단계가 흐름도와 단계를 대조하는 것과 같은 방식이라 새 개념이 없다 |
| 27 | 3층 구조·논의점 | 브리프 맨 앞에 `## 3층 구조` 표(화면(프리젠테이션)·처리(비즈니스)·데이터(저장·바깥) 세 줄, 코드 위치 `src/app/`·`src/lib/workflow/`·`src/lib/data/`)와 `## 논의점`. 논의점은 조건이 걸릴 때만 최대 둘: 밖으로 나가는 단계가 있으면 진짜·흉내, 3절이 DB 없음이면 결과를 다시 볼 일이 있는지(있으면 Supabase). 답은 `결정:` 으로, `--batch` 면 기본값. 6절에 Vercel 배포 보호를 고정 규칙으로. 게이트가 `runs/inputs/` 최대 파일이 요청 본문 상한(4.5MB) 근처면 `파일 크기` 안내를 요구. 프롬프트 5 에 층별 위치와 화면 기본값 | 5단계 뒤 세션은 dogfood 한 적이 없어 예측이다. 확실한 것만 넣었다: URL 을 아는 누구나 유료 키로 돌리는 사고, 큰 PDF 가 안 올라가는 사고, 학습자 앱을 같은 틀로 보는 교육 가치. 화면 질문(업로드 칸·내려받기·기다림·멈춤)은 비개발자가 앱을 보기 전에 정하기 어려워 프롬프트 기본값으로 뺐다. 반려 처리는 3단계 실패 처리와 중복, 개인정보 보관은 결과 보관 질문과 같은 답. 새 단계는 §2-25 대로 두지 않는다 |
| 28 | 4단계 실행 증거 | 게이트가 `runs/inputs/` 의 입력 폴더마다 `verify/out/<입력>/summary.json` 을 읽는다. 없거나 JSON 이 아니면 실패. status 가 done 이 아니면, model 이 STATUS 와 다르면, `--from` 으로 이어 돌려 시간이 부분이면, report 의 `## 모델` 절이 summary 의 model 과 다르면 경고 | 러너가 실행마다 상태·모델·시간·LLM 사용량을 남기는데 게이트가 report 의 글만 봤다. 돌리지 않고 보고서만 써도 통과했다. §2-26 과 같은 종류의 구멍. rfq 실측에서 입력 3이 `--from 3` 이라 시간 합이 여섯 단계분이었고, 브리프 2절이 그대로 옮기면 틀린다 |
| 29 | maxDuration | 브리프 2절에 시간 합과 `maxDuration = <초>` 를 적고, 프롬프트 5 가 Route Handler 에 넣게 하며, 7절 체크박스로 확인. 게이트가 2절에 `maxDuration` 이 없으면 실패. 값은 시간 합의 1.5배쯤, 플랜 최대치 안에서. 최대치는 학습자가 자기 플랜 문서에서 확인한다 | Vercel 함수의 기본 실행 시간 제한은 최대치보다 짧고 늘리려면 코드에 적어야 하는데 어디에도 지시가 없었다. rfq 는 한 번에 41초라 기본값이 그보다 짧은 플랜이면 배포 뒤 첫 실행에서 끊긴다. 플랜별 정확한 수치는 문서에 고정하지 않는다 |

## 3. 용어

| 용어 | 뜻 |
|---|---|
| 로컬 에이전트 | Claude Code·Codex 위에서 CLAUDE.md(AGENTS.md)·Skills·훅으로 만든 개인 도구. 모델이 순서를 정하고 스크립트를 부른다. 에이전트 로직의 프로토타입 |
| 대상 | 전환할 로컬 에이전트 프로젝트. `STATUS.md` 의 `target` |
| 런타임 | 대상이 도는 도구. `claude-code` 또는 `codex`. `STATUS.md` 의 `runtime` |
| 작업 폴더 | `<이름>-app/`. 스킬을 부르는 곳이자 산출물이 쌓이는 곳이자 나중의 웹 앱 repo |
| 웹 앱 | 남이 쓰는 제품. 코드가 순서를 정하고 정해진 단계에서 모델을 부른다 |
| 고정 | 실행마다 달랐던 판단을 규칙으로 바꾸고 순서를 못 박는 것 |
| 2×2 표 | 단위 작업·워크플로우 × 결정론·확률론. 우하단(워크플로우 × 확률론)만 에이전트, 나머지 셋은 워크플로우. LLM 판단이 들어 있어도 순서가 고정이면 워크플로우다 |
| 세 축 | 제어권(코드/모델) · 도구(도메인 도구만/파일·쉘·코드 실행) · 환경(서버리스/장기 실행). 구현 수단을 정한다 |
| 게이트 | 단계를 통과했는지 스크립트가 판정하는 지점. 통과하면 스크립트가 STATUS 에 쓴다 |
| 사람 승인 | 2·3단계에서 학습자가 산출물을 읽고 동의하는 지점. 스킬이 묻고 STATUS 에 기록한다 |
| 브리프 | 5단계가 만드는 웹 앱 전환 지시문. 같은 폴더의 다음 세션이 읽는다 |

## 4. 다섯 단계

각 단계를 입력 → 할 일 → 산출물 → 게이트로 적는다. 프롬프트 원문은 §7. 게이트 명령은
`node <스킬>/scripts/check_phase.mjs <N>` 이고 작업 폴더에서 실행한다.

### 시작

- 작업 폴더가 없으면 만들고 `git init` 한다. `docs/agent-to-webapp/STATUS.md` 를 만든다
- 대상을 인자에서 읽거나 묻는다. 런타임을 표식으로 판별한다(§2-15)
- 도착지 한 줄 확인(§2-14). `--batch` 면 생략
- STATUS 가 이미 있으면 읽고 통과한 다음 단계부터 시작한다(재개 규칙)

### 1단계 관찰

- 입력: 대상, 서로 다른 입력 3종(쉬움·보통·예외. STATUS 의 `runs` 가 1 이면 보통 하나, §2-22). **입력 3종은 스킬이 대상의 CLAUDE.md
  (AGENTS.md)와 skills 를 읽고 제안하고 학습자가 승인하거나 바꾼다.** 왜 그 셋인지
  `runs/inputs/README.md` 에 적는다. 비개발자는 "예외" 가 무엇인지 모르기 때문이다
- 할 일: 대상에 로컬 전용 파일을 설치한다. 그리고 **스킬은 여기서 멈춘다.** 학습자가 대상
  폴더에서 **세션 N개를 동시에** 열어 각각 입력 하나씩 돌린 뒤 작업 폴더에서 스킬을 다시 부른다(§2-23)

  | | Claude Code 대상 | Codex 대상 |
  |---|---|---|
  | 기록 프롬프트(§7-1) | `CLAUDE.local.md` | `AGENTS.override.md` |
  | 훅 | `.claude/settings.local.json` 의 PostToolUse → `log_tool_use.mjs` | `.codex/hooks.json` 의 PostToolUse → 같은 스크립트 |
  | 작업 폴더 쓰기 허용 | 같은 파일의 `permissions.additionalDirectories` 에 `../<이름>-app` | `[sandbox_workspace_write] writable_roots` |

  세 파일 모두 git 추적 대상이 아니다. `CLAUDE.local.md` 는 `.gitignore` 에 없으면 untracked
  로 보이기만 하니 학습자에게 알린다. 5단계 통과 후 제거를 안내한다
- 산출물: `runs/run-N.md`(자기 보고, 헤딩 고정), `runs/run-N.tools.jsonl`(훅 기록), `runs/run-N.tools.md`(게이트가
  만드는 색인. 2단계가 jsonl 대신 읽는다)
- 게이트: run 파일 3개 이상, inputs 3개 이상 + README, 각 run 에 `## 판단이 필요했던 지점`
  헤딩 존재. 헤딩 문자열은 기록 프롬프트가 지정하고 게이트가 그대로 찾는다

한 번 돌려서는 고정 여부를 알 수 없다. 입력을 일부러 다르게 하는 이유가 그것이다. 새
세션에서 돌리는 이유는 스킬 컨텍스트가 있는 세션에서 돌리면 에이전트 행동이 바뀌어 관찰이
오염되기 때문이다.

### 2단계 판정

- 입력: `runs/` 전체, `runs/inputs/`, 대상의 CLAUDE.md(AGENTS.md)와 skills
- 할 일: **서브에이전트** 에게 판정 프롬프트(§7-2)와 입력을 준다. 대상의 CLAUDE.md·skills 는
  "하기로 한 것", runs 는 "실제로 한 것" 으로 역할을 표시한다. 훅 기록이 있으면 자기 보고와
  대조하게 한다. 프롬프트 마지막 두 줄(억지로 고정 가능하다고 하지 말 것)은 삭제 금지 —
  모델은 기본적으로 가능하다고 답하는 쪽으로 기울어서 반대 의견을 낼 여지를 명시적으로
  줘야 한다
- 산출물: `verdict.md` — 같았던 단계, 달랐던 단계(무엇이·왜), 2×2 배정표(칸 열 고정), 판정
  한 줄
- 게이트: 판정 줄이 `고정 가능` / `조건부 고정 가능` / `고정 불가` 중 하나. **배정표에
  4번째 칸(워크플로우 × 확률론) 항목이 하나라도 있으면 `고정 가능` 은 거부** 하고 `조건부`
  또는 `불가` 만 받는다. 학습자가 verdict 를 읽고 승인해야 통과. 판정을 뒤집으려면 STATUS
  에 `override: <사유>` 를 남긴다. **고정 불가면 STATUS 에 종료를 적고 멈춘다.**

라우팅 안내: Agent SDK 를 Vercel 밖 컨테이너에 두거나 Managed Agents. 선례
`workos/litigation-writer-app`. Agent SDK 는 `settingSources` 를 생략하면 CLI 와 같이
CLAUDE.md·skills·settings 를 모두 읽는다(v0.1.0 에서 잠깐 바뀌었다가 되돌려짐). 배포 앱에서는
`settingSources: []` 로 격리하고 필요한 것만 명시한다.

### 3단계 고정

- 입력: `verdict.md`
- 할 일: 고정 프롬프트(§7-3). 조건부면 조건을 흐름도 바로 다음에 적는다. **단계 간 데이터는 JSON
  스키마 필수** — "가능하면" 이 아니다. 4단계가 이 스키마를 그대로 쓴다
- 산출물: `workflow.md` — 첫 절에 전체 흐름도(Mermaid, §2-20). 단계마다 번호·이름, 실행 주체(코드/LLM), 입출력 JSON 스키마, LLM
  단계의 프롬프트 초안, 코드 단계의 규칙, 실패 처리, 사람 확인 지점. 끝에 `## 웹 앱 간소화`(§2-25)
- 게이트: 흐름도 노드가 단계 헤딩과 하나씩 맞고 class 가 실행 주체와 같다. 모든 단계에 실행 주체·입력 스키마·출력 스키마·실패 처리 필드.
  `## 웹 앱 간소화` 절이 있고 비어 있지 않다. 분기 없이 이어지는 코드 단계 쌍은 경고. `규칙화 불가` 항목은
  **각각 LLM 단계(단위 작업 × 확률론) 또는 사람 확인 지점으로 재배치** 돼야 통과. 순서 자체가
  흔들리는 항목이면 2단계로 돌아가 재판정한다(STATUS 를 되돌린다). 학습자가 workflow.md
  를 읽고 승인해야 통과

이 `workflow.md` 가 설계서다. 이것이 있어야 4단계의 스크립트와 5단계의 웹 앱이 같은 것을
가리킨다.

### 4단계 재검증

- 입력: `workflow.md`, `runs/inputs/`
- 할 일: 재검증 프롬프트(§7-4). Node 단독 스크립트, 웹 앱 뼈대 금지. "Next.js 로 짜라" 가
  아니라 "TypeScript 로, Node 에서 바로 실행되는 단독 스크립트로" 다 — 이 구분이 없으면
  Claude Code 가 이 단계에서 웹 앱 뼈대를 만들어 버린다. Node 24 는 `.ts` 를 직접 실행하므로
  `tsx` 가 필요 없다. 모델은 `A2W_MODEL`, 기본 `claude-sonnet-5`. API 키는 스킬 `.env` 에서 읽는다(§2-18). 사람 확인 지점은 자동
  승인으로 지나가고 report 에 "여기서 사람이 봤어야 할 것" 절을 남긴다. Python 이나 Codex
  전용 도구(`@oai/artifact-tool` 같은 것)에 묶인 단계는 TS 재작성을 먼저 시도하고, 안 되면
  `외부 서비스로 뺄 단계` 로 표시한다. `child_process` 로 Python 을 부르는 것은 금지 —
  Vercel 에서 안 도니 검증이 안 된다
- 산출물: `verify/` — 러너·라이브러리(`run.ts`, `lib/`)는 스킬 자산 `assets/verify-template` 에서 복사, LLM 이
  쓰는 것은 `steps/index.ts`(단계 배열)와 단계당 함수 하나(`steps/`). `package.json`, `.gitignore`
  (node_modules, .env), `report.md`(입력 3개의 결과와 로컬 에이전트 결과의 차이, 사용한 모델명,
  외부 서비스로 뺄 단계 목록)
- 게이트: `report.md` 에 3건 결과, 모델명, 외부 서비스 절(비어 있어도 절은 있어야 한다). `workflow.md` 의 `### 단계 N` 과
  `steps/` 의 단계 객체(`n`·`name`·`actor`)를 번호로 짝지어 이름·실행 주체를 대조하고 하나라도 다르면 실패(§2-26).
  입력 폴더마다 `verify/out/<입력>/summary.json` 이 있어야 하고, 상태·모델·`--from` 은 경고(§2-28).
  차이가 허용 범위인지는 사람이 판단한다
- 재검증 중 단계 코드를 고쳤으면 report 의 `## 재검증 중 고친 것` 에 적고 workflow.md 의 그 단계도 같이 고친다.
  게이트는 그 절이 비어 있지 않으면 workflow.md 반영을 확인하라고 경고한다

어떤 단계가 파이썬 전용 라이브러리 없이는 안 된다고 나오면 그것은 문제가 아니라 정보다.
그 단계는 Vercel 위에서도 안 돌아간다는 뜻이니, 웹 앱을 만들기 전에 알게 된 것이다. 로컬
에이전트가 Opus 로 돌았고 스크립트가 Sonnet 이면 차이의 원인이 모델인지 고정인지 구분해야
하므로 report 에 모델명을 남긴다.

### 5단계 전환

- 입력: `workflow.md`, `verify/`
- 할 일: `references/port-brief-template.md` 로 `port-brief.md` 를 만든다. 스캐폴드는 여기까지다
  — 산출물이 이미 `docs/agent-to-webapp/` 에 있으므로 폴더를 더 만들지 않는다. 대상의 로컬
  전용 파일 제거를 안내한다. **같은 폴더에서 새 세션을 열어** 전환 프롬프트(§7-5)로 바이브
  코딩을 시작한다. 그 세션이 `create-next-app` 을 돌리고(`docs/`·`.git` 은 허용 목록에 있다)
  `docs/agent-to-webapp/verify/steps/` 와 `verify/lib/` 를 `src/lib/workflow/` 로 복사한다
- 산출물: `port-brief.md`, `prompt.md`(다음 세션에 붙여넣을 프롬프트 5. §2-24)
- 게이트: 브리프에 다음 일곱 가지가 명시돼 있다
  1. Claude 를 부르는 코드와 API 키는 서버 쪽(Route Handler 또는 Server Action)에만
  2. Vercel 함수는 실행 시간 제한이 있으니 오래 걸리는 단계는 나눈다
  3. 상태 저장 방식. **사람 확인 지점이 중간에 있거나 단계 합이 시간 제한을 넘으면** Supabase 에
     단계별 상태를 저장하고 큐·cron 으로 이어 붙인다. 둘 다 아니면 DB 없이 Route Handler
     하나로 끝낸다. 사람 확인 지점이 마지막이면 결과 화면의 승인·반려로 만들고 DB 를 두지 않는다(§2-25).
     브리프가 어느 쪽인지 적는다
  4. `workflow.md` 의 사람 확인 지점은 UI 승인 단계 + DB 상태로(3 이 Supabase 인 경우). 마지막이면 결과 화면의 승인·반려
  5. `외부 서비스로 뺄 단계` 목록과 각각의 임시 처리. 없으면 "없음"
  6. 인증·멀티테넌트는 범위 밖(단일 사용자 데모)임을 명시
  7. 배포 후 `runs/inputs/` 3개를 다시 넣어 `verify/report.md` 와 비교한다
     (`references/deploy-checklist.md`)
  8. `## 3층 구조` 표에 화면(프리젠테이션)·처리(비즈니스)·데이터(저장·바깥) 세 줄(§2-27)
  9. `## 논의점` 항목마다 `결정:`. 물은 것이 없으면 `- 없음`
  10. 6절에 Vercel 배포 보호를 켠다는 말. `runs/inputs/` 의 최대 파일이 요청 본문 상한 근처면 브리프에 `파일 크기` 안내
  11. 2절에 `maxDuration = <초>`(§2-29)

4단계를 통과했으면 이 단계는 이식이다. 에이전트 설계 문제는 끝났고 웹 개발 문제만 남는다.

### 재개 규칙

`docs/agent-to-webapp/STATUS.md` 는 게이트 스크립트가 쓰고 읽는다. `target`, `runtime`,
통과한 단계와 날짜, 승인, override, 종료 사유를 담는다. 스킬이 불리면 STATUS 를 먼저 읽고
그 다음 단계부터 시작한다. 컨텍스트 압축 뒤에도 같다. 파이프라인 절대 준수 — 게이트를
건너뛰고 다음 단계를 실행하지 않는다.

## 5. 산출물 폴더

```
<부모>/
  <이름>/                          대상. git 추적 파일 무변경
    CLAUDE.local.md                1단계 기록 프롬프트 (Codex 면 AGENTS.override.md). 5단계 후 삭제
    .claude/settings.local.json    훅 + additionalDirectories (Codex 면 .codex/hooks.json + writable_roots)
  <이름>-app/                      작업 폴더이자 웹 앱 repo. 스킬은 여기서 부른다
    .git/                          시작 때 스킬이 init
    docs/agent-to-webapp/
      STATUS.md                    target·runtime·통과 단계·승인·override. 스크립트가 쓴다
      runs/
        inputs/                    실행 3회의 입력 (쉬움·보통·예외) + README.md (왜 그 셋인지)
        run-1.md                   자기 보고 (프롬프트 1, 헤딩 고정)
        run-1.tools.jsonl          PostToolUse 훅 기록 (경로·명령·응답 200자)
        run-1.tools.md             1단계 게이트가 만든 색인. 2단계가 읽는다. 파생 파일
      verdict.md                   2×2 배정표 + 판정 (프롬프트 2)
      workflow.md                  고정 워크플로우 명세 (프롬프트 3)
      verify/                      TypeScript 단독 스크립트 (프롬프트 4)
        run.ts  lib/step.ts  lib/llm.ts  package.json  .gitignore   ← 스킬 assets/verify-template 에서 복사. 고치지 않는다
        steps/index.ts  steps/<nn>-<이름>.ts                          ← LLM 이 쓴다 (단계 배열 + 단계당 함수 하나)
        out/<입력>/NN-이름.json  summary.json                         ← 실행이 쓴다
        report.md
      port-brief.md                웹 앱 전환 브리프 (5단계)
      prompt.md                    다음 세션에 붙여넣을 프롬프트 5 (5단계. 게이트가 코드 블록을 확인)
    (5단계 뒤 새 세션이 create-next-app 으로 채운다. src/lib/workflow/ ← verify/steps/ + verify/lib/)
```

## 6. 스킬 파일 구조

```
workos/agent-to-webapp/
  CLAUDE.md                              이 기획서를 먼저 읽으라는 포인터
  docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md   이 문서
  docs/superpowers/plans/                writing-plans 산출물
  .claude/skills/agent-to-webapp/        정본. 완성 후 ~/.claude/skills/ 로 복사
    SKILL.md                             단계 표·게이트 명령·재개 규칙·대상 판별. 150줄 안쪽
    .env.example                         사용자별 API 키 틀. 같은 폴더에 .env 로 복사해 채운다
    .gitignore                           .env 를 가린다
    references/
      phase-1.md ~ phase-5.md            단계별 세부 + 그 단계의 프롬프트 실행판(정본). 해당 단계에서만 읽는다
      decision-axes.md                   §8 표 넷
      port-brief-template.md             5단계 브리프 틀 (선택 절: 스타일 지정)
      deploy-checklist.md                배포 확인
    scripts/
      check_phase.mjs                    게이트. Node 표준 라이브러리만. 종료코드 0/1. STATUS 를 쓴다
      log_tool_use.mjs                   PostToolUse 훅. Claude Code·Codex 페이로드 분기
      install.mjs                        유저 스코프 설치. 설치된 쪽 .env 를 지우지 않는다
    assets/
      hooks.claude.example.json          settings.local.json 에 합칠 훅 + additionalDirectories
      hooks.codex.example.json           .codex/hooks.json 예시
      verify-template/                   4단계 러너 run.ts, lib/step.ts(단계 계약), lib/llm.ts, package.json, .gitignore. verify/ 로 복사된다
```

런타임은 Node 하나다. 학습자는 Next.js 때문에 어차피 Node 를 깔고, Windows 비개발자 PC 에
Python 은 대개 없다. 스크립트는 파일을 LF·UTF-8 로 쓴다 — LLM-Wiki CLAUDE.md 의 CRLF 주의와
같은 이유다.

## 7. 프롬프트

원문은 위키 페이지에 있다. 원출처는 2026-09-07 claude.ai 대화
(`LLM-Wiki/raw/conversations/2026-09-07_Local-Agent-To-Web-App.md`). 아래는 기획 당시 실행판 초안이고
원문과 다른 점을 각 프롬프트 뒤에 적는다. 5 는 이 문서에서 처음 쓰는 초안이다.

### 7-1. 매 실행마다 기록 남기기

대상의 `CLAUDE.local.md`(Codex 는 `AGENTS.override.md`)에 넣는다.

```
작업을 마친 뒤 ../<이름>-app/docs/agent-to-webapp/runs/run-N.md 파일에 실행 기록을 남겨줘. (N은 순번)
번호는 파일 이름만 보고 정하고, 다른 run 파일의 내용은 열어 읽지 마. 이번 실행은 앞 실행과 독립된 관찰이어야 한다.
아래 헤딩을 그대로 써줘.
## 수행한 단계
- 순서대로 번호 매겨 적을 것. 각 단계에서 사용한 도구, 스크립트, 스킬
- 각 단계의 입력과 출력이 무엇이었는지
## 판단이 필요했던 지점
- 무엇을 보고 무엇을 결정했는지, 왜 그렇게 했는지
## 예상과 달라서 방식을 바꾼 지점
- 없으면 "없음"
```

원문과 다른 점: 경로가 작업 폴더를 가리킨다. 헤딩 세 개를 고정해 게이트가 문자열로 찾는다. 앞 run 파일을
읽지 않게 한다(dogfood 에서 run 2·3 이 앞 기록을 읽고 시작해 독립 표본이 아니게 됨).

### 7-2. 고정 가능 여부 판정

세 번 이상 돌린 뒤. 서브에이전트에게 준다.

```
runs/ 폴더의 실행 기록을 모두 읽고 워크플로우가 고정 가능한지 판정해줘.
함께 준 CLAUDE.md 와 skills 는 "하기로 한 것" 이고 runs/ 는 "실제로 한 것" 이다.
run-N.tools.jsonl 이 있으면 run-N.md 의 자기 보고와 대조해서 다른 점을 먼저 적어줘.

1. 모든 실행에서 순서와 방식이 같았던 단계를 나열
2. 실행마다 달랐던 단계를 나열. 각각에 대해 무엇이 달랐는지(순서가 바뀜 / 단계가 추가·생략됨 / 같은 단계인데 방법이 다름)와 왜 달랐는지
3. 각 단계를 아래 표에 배정. 표는 | 단계 | 칸 | 근거 | 세 열이고 칸은 아래 넷 중 하나를 그대로 쓴다
   - 단위 작업 × 결정론: 정해진 규칙으로 고정 출력
   - 단위 작업 × 확률론: 매번 LLM 판단이 필요
   - 워크플로우 × 결정론: 순서가 고정
   - 워크플로우 × 확률론: 순서나 방식 자체가 상황에 따라 재구성됨
4. 4번째 칸에 해당하는 것이 있으면 명시하고, 규칙으로 바꿀 수 있는지 없는지 의견을 낼 것

최종 판정을 "판정: 고정 가능 / 조건부 고정 가능(조건 명시) / 고정 불가" 중 하나로 마지막 줄에 내줘.
4번째 칸 항목이 하나라도 남아 있으면 "고정 가능" 이라고 하지 말 것.
억지로 고정 가능하다고 하지 말 것. 고정하면 품질이 떨어질 단계가 있으면 그렇다고 말해줘.
```

원문과 다른 점: 설계 의도와 실제의 역할 표시, 훅 기록 대조, 배정표 열과 칸 이름 고정, 판정
줄 형식 고정, 4번째 칸 규칙 한 줄.

### 7-3. 워크플로우 고정

판정이 고정 가능 또는 조건부일 때.

```
판정 결과를 바탕으로 workflow.md에 고정된 워크플로우 명세를 작성해줘.
조건부 판정이면 조건을 문서 첫머리에 적어줘.

각 단계마다:
- 단계 번호와 이름
- 실행 주체: 코드 / LLM
- 입력과 출력. 반드시 JSON 스키마로 적을 것. 다음 단계가 이 스키마를 그대로 쓴다
- LLM 단계면: 프롬프트 초안, 모델에 넘길 것과 받을 것
- 코드 단계면: 적용할 규칙
- 실패했을 때 처리 방법

실행마다 판단이 달랐던 부분은 규칙으로 바꾸는 것을 먼저 시도하고,
바꿀 수 없으면 "규칙화 불가"로 표시하고 이유를 적어줘. 규칙화 불가 항목은 각각
LLM 단계로 둘지 사람 확인 지점으로 둘지 정해서 적어줘. 순서 자체가 흔들리는 항목이면
그렇다고 적어줘. 그건 이 단계가 아니라 판정으로 돌아갈 일이다.
사람이 확인해야 하는 지점이 있으면 그것도 단계로 넣어줘.
```

원문과 다른 점: 조건 첫머리, JSON 필수, 규칙화 불가 항목의 재배치 요구. 2026-09-14 부터 첫 절에 흐름도를
두고 조건은 그 다음이다(§2-20). 실행판 문구는 `references/phase-3.md` 의 프롬프트 3.

### 7-4. 스크립트 작성

```
workflow.md의 순서대로 각 단계를 함수 하나로 구현한 TypeScript 스크립트를 verify/ 에 작성해줘.
- Node 24 에서 node run.ts 로 바로 실행되는 단독 스크립트로. tsx 나 빌드 단계 없이. 웹 앱 뼈대는 만들지 말 것
- LLM 단계는 Anthropic SDK로 호출. 모델은 환경변수 A2W_MODEL, 기본 claude-sonnet-5
- 단계 사이에 넘기는 데이터는 workflow.md에 정의한 JSON 스키마를 그대로 쓸 것
- 사람 확인 지점은 자동 승인으로 지나가되 report.md 에 "여기서 사람이 봤어야 할 것" 절로 남길 것
- child_process 로 Python 이나 다른 런타임을 부르지 말 것. TS 로 안 되는 단계는 "외부 서비스로 뺄 단계" 로 표시
- 작성 후 runs/inputs/ 의 입력 3개로 실행하고, 로컬 에이전트 결과와 비교해서 차이를 report.md 에 보고해줘. 사용한 모델명도 적을 것
```

원문과 다른 점: Node 24 직접 실행, 모델 지정, 사람 확인 처리, child_process 금지, report 항목.

### 7-5. 웹 앱 전환 (초안)

작업 폴더의 다음 세션에서 쓴다. 위키에 원문이 없다. 구현 때 다듬는다.

```
docs/agent-to-webapp/port-brief.md 와 docs/agent-to-webapp/workflow.md 를 읽고 이 워크플로우를 Next.js 웹 앱으로 만들어줘.
- 이 폴더에서 create-next-app 을 먼저 돌릴 것. docs/ 와 .git 은 그대로 둔다
- docs/agent-to-webapp/verify/steps/ 를 src/lib/workflow/ 로 복사해서 그대로 쓸 것. 로직을 다시 짜지 말 것
- Claude 를 부르는 코드와 API 키는 서버 쪽(Route Handler 또는 Server Action)에만 둘 것
- 상태 저장은 브리프가 정한 대로. Supabase 면 단계별 상태를 저장하고 오래 걸리는 단계는 나눌 것
- workflow.md 의 사람 확인 지점은 UI 승인 단계로 만들고 승인 상태를 남길 것
- 인증은 만들지 말 것. 단일 사용자 데모다
- 화면은 입력 → 진행 상태 → 결과 셋이면 충분
```

스타일 지정(라이트 모드, 악센트 색, gradient·shadow 금지 같은 것)은 프롬프트에 두지 않고
`port-brief-template.md` 의 선택 절로 뺀다. 본인 취향이 배포 스킬에 박히지 않게 한다.

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
| 철거 | `.demo-projects/demolition-agent` | `workos/demolition-web-app` (Next.js 16 + Firebase) | §8 첫 행이되 실행이 Vercel 밖. Next.js 는 업로드·트리거·진행 표시만 하고 Claude 를 직접 부르지 않는다. 모델 호출은 Firebase Cloud Functions 의 Python 이 Messages API 로 한다. 4단계가 말하는 `외부 서비스로 뺀 단계` 의 실물 선례 |

`litigation-writer-app/CLAUDE.md` 가 형제 분리의 이유를 이미 적어 뒀다. 에이전트
프로젝트는 별도 저장소가 canonical 이고 앱 저장소에는 그 소스를 두지 않는다. Vercel 배포는
Root Directory 하나를 보고, 클라우드 에이전트는 저장소를 통째로 clone 한다. WorkOS 의 중첩
저장소 금지 규칙도 같은 방향이다. 이 스킬의 작업 폴더가 곧 앱 repo 인 것은 그 규칙을
그대로 따르면서 형제를 둘로 줄인 것이다.

## 10. 스킬 자체의 검증

게이트·훅·러너는 `tests/` 의 단위 테스트(`node --test "tests/*.test.mjs"`)로 검증한다. 고정 불가 경로(2단계 종료·
라우팅 안내·이후 단계 거부)도 여기서 보증한다.

스킬 전체는 dogfood 로 검증한다. 대상은 `.demo-projects` 의 데모 에이전트 사본이고, **저장소 밖**(세션 스크래치 등)에
대상 사본과 `<이름>-app/` 을 만들어 유저 스코프 설치본으로 돌린다. 저장소 안에서 돌리면 이 저장소 CLAUDE.md("기획서를
먼저 읽어라")와 WorkOS CLAUDE.md 가 관찰 세션에 함께 로드돼 에이전트 행동이 바뀐다(2026-09-11 발견). 학습자 PC 에서도
같은 문제가 생길 수 있어 1단계가 상위 폴더 CLAUDE.md 를 경고한다.

| 경로 | 데모 | 성공 기준 | 상태 |
|---|---|---|---|
| 고정 가능 | `rfq-quote-generator` | 1~5단계 게이트 통과. `verify/report.md` 의 3건이 로컬 결과와 허용 범위 안에서 일치 | 2026-09-11 통과(경량화 이전 구성). 2026-09-14 경량화 구성으로 다시 통과 |
| 고정 불가 | `competitor-review-crawler` | 2단계에서 멈추고 STATUS 에 종료, Agent SDK 트랙 안내. 3단계 이후 파일 없음 | 크롤링 URL 미정. 게이트 테스트로만 |

dogfood 산출물은 이 저장소에 두지 않는다(2026-09-14, `examples/` 삭제). 시행착오와 결과 요약은 LLM-Wiki
`raw/practice/YYYY-MM-DD_주제.md` 로 쓰고 `/wiki-ingest` 로 컴파일한다. 위키에 직접 쓰지 않는다. 학습자에게 보여줄
완성 예시가 필요해지면 그때의 dogfood 산출물을 별도로 공개한다.

후보 선정 근거(2026-09-11 조사): `rfq-quote-generator` 는 Step 0~7 순차 고정, 의존 openpyxl 뿐, PDF 독해는 모델 Vision,
스킬 4개. `competitor-review-crawler` 는 도메인마다 모델이 런타임에 DOM 셀렉터를 새로 매핑하고 sanity check 로 경로가
갈리는 우하단의 전형. 걸러진 후보: `exam-score-aggregator`(Codex 전용 도구), `email-issue-brief`(Gmail 입력 재현 어려움),
`instagram-monitor`(불가가 아니라 조건부).

## 11. 범위 밖

- Agent SDK·Managed Agents 경로의 구현. 2단계에서 라우팅 안내까지만
- 웹 앱 자동 생성. 5단계는 브리프까지고, 바이브 코딩은 같은 폴더의 다음 세션이 한다
- 3입력 비교 이상의 eval. 품질 평가는 `eval-and-improvement/` 위키 페이지들의 몫
- n8n·Slack 봇·플러그인 배포 같은 다른 도착지. 이 스킬은 웹 앱이 도착지로 정해진 뒤에 부른다
- 스킬 자체를 Codex 에서 실행하는 것(`.agents/skills/` 설치). 대상이 Codex 인 것과 다르다
- 인증·멀티테넌트. 브리프에 범위 밖으로 명시한다
- 다른 스택(`vibecoding-workshop-starter` 의 Codex Sites·D1 등)

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

grill-me 에서 확인한 외부 사양(2026-09-11):

- code.claude.com/docs/en/skills — 프로젝트 스킬은 하위 폴더에서 열어도 상위로 올라가며 찾는다. 인자는 `$ARGUMENTS`·named arguments 텍스트 치환, 플래그 파서 없음
- code.claude.com/docs/en/memory — `CLAUDE.local.md` 는 CLAUDE.md 와 함께 자동 로드, `.gitignore` 등록은 수동
- code.claude.com/docs/en/hooks — PostToolUse stdin 에 `tool_name`·`tool_input`·`tool_response`·`session_id`·`cwd`·`tool_use_id`. `settings.local.json` 등록 가능
- code.claude.com/docs/en/cli-reference — `--add-dir`, `permissions.additionalDirectories`
- code.claude.com/docs/en/agent-sdk/migration-guide — `settingSources` 생략 시 CLI 와 같이 전부 로드. v0.1.0 의 변경은 되돌려짐. 격리는 `[]`
- learn.chatgpt.com/docs/agent-configuration/agents-md — `AGENTS.override.md` 가 레벨마다 우선. `project_doc_fallback_filenames`
- learn.chatgpt.com/docs/config-file/config-reference — `[hooks]` PreToolUse·PostToolUse, `.codex/hooks.json`, `[sandbox_workspace_write] writable_roots`
- learn.chatgpt.com/docs/build-skills — Codex 스킬은 `.agents/skills/`(repo)·`~/.agents/skills`(user)
- vercel/next.js `packages/create-next-app/helpers/is-folder-empty.ts` — 허용 목록에 `docs`·`.claude`·`.git` 있음, `src`·`README.md` 없음 (canary 기준)

## 13. 다음 세션 착수 순서

(2026-09-11 당시 순서. 완료했고 이력으로 둔다. `examples/` 는 2026-09-14 에 지웠다.)

1. 이 문서를 읽는다. §2 가 결정의 정본이다
2. `superpowers:writing-plans` 로 구현 계획을 `docs/superpowers/plans/` 에 쓴다
3. 구현 순서 제안: `references/`(prompts·decision-axes·phase-1~5) → `SKILL.md` →
   `scripts/check_phase.mjs` → `examples/rfq-quote-generator` 로 1~4단계 dogfood →
   `port-brief-template.md`·`deploy-checklist.md` → `log_tool_use.mjs`·`assets/hooks.*.json` →
   `examples/competitor-review-crawler` 로 불가 경로 dogfood
4. 두 경로(§10) 모두 통과하면 `~/.claude/skills/agent-to-webapp/` 로 설치하고(`scripts/install.mjs`, 설치된 쪽 `.env` 보존), 대상 프로젝트
   하나에서 유저 스코프 호출을 확인한다
5. 시행착오를 `raw/practice/` 로 보내 `/wiki-ingest`. 위키 페이지에 "실행판은 agent-to-webapp
   스킬" 한 줄을 단다

## 14. 열린 항목

- Codex `.codex/hooks.json` 의 PostToolUse stdin 페이로드가 Claude Code 와 같은 필드인지. 문서는
  "hooks.json 과 같은 이벤트 스키마" 라고만 한다. `log_tool_use.mjs` 의 분기를 구현 때 실측한다
- `permissions.additionalDirectories` 가 권한 프롬프트 없이 쓰기를 허용하는지 실측. 안 되면
  1단계 안내에 "쓰기 허용을 한 번 승인" 을 넣는다. dogfood 는 `bypassPermissions` 로 돌려 실측하지 못했다
- 고정 불가 경로 dogfood(계획 Task 16)는 크롤링할 URL 을 정하기 전이라 돌리지 않았다. 이 경로는 게이트 단위
  테스트(2단계 고정 불가 → 종료·라우팅 안내·이후 단계 거부)로만 검증됐다
- 헤드리스 dogfood 에서는 예외 입력에서 에이전트가 사람에게 묻지 못하고 가정값으로 채웠다. 학습자의 대화형
  관찰에서는 멈추고 물을 수 있어 판정 분기가 다를 수 있다
- 2026-09-14 재-dogfood 의 되먹일 후보(LLM-Wiki `raw/practice/2026-09-14_Agent-To-Webapp-Dogfood-RFQ-Rerun.md` 끝 절): 동시 관찰에서 대상이
  다른 입력의 output 을 선례로 읽는 오염, 원본이 모노레포 안일 때 `-app` 위치, verdict 분량(14KB), 고유 문자열은 자리표시자로

구현 중 닫힘(2026-09-11):

- create-next-app 허용 목록: 릴리스 16.3.4 에도 `docs`·`.git`·`.claude` 가 있다(canary 와 같음)
- `rfq-quote-generator` 합성 입력 2건: 계획 Task 15 에 확정. Helios 는 도면 ND-IS-042 와 사양을 맞췄다
- Windows Git Bash 에서 `claude -p "/agent-to-webapp …"` 는 MSYS 경로 변환으로 첫 인자가 `C:/Program Files/Git/…`
  로 바뀐다. 헤드리스로 스킬을 부를 때는 `MSYS_NO_PATHCONV=1` 을 붙인다

## 15. 검토 이력

- 2026-09-11 brainstorming 1라운드: §2 1~14 결정
- 2026-09-11 grill-me 2라운드(Q1~Q21): 작업 폴더를 대상 밖 `<이름>-app/` 으로, 게이트·훅을
  Node 로, 2단계를 서브에이전트로, Codex 대상 포함, Supabase 조건부, 프롬프트 실행판 정본화,
  데모 확정. §14 의 폴더명·examples·Agent SDK·스캐폴드·훅 언어 항목을 닫음
- 2026-09-11 구현 중 사용자 결정: API 키는 스킬 `.env`(§2-18), 4단계는 API 스크립트로만(§2-19)
- 2026-09-11 dogfood 고정 가능 경로(rfq-quote-generator) 1~5단계 통과. 스킬 결함 9개를 반영했다. 산출물은
  `examples/rfq-quote-generator-app/`, 시행착오는 LLM-Wiki `raw/practice/2026-09-11_Agent-To-Webapp-Dogfood-RFQ.md`.
  고정 불가 경로(competitor-review-crawler)는 URL 을 정하기 전이라 돌리지 않았다
- 2026-09-14 사용자 결정: workflow.md 첫 절에 Mermaid 흐름도, 게이트가 단계와 대조(§2-20). rfq 예제 workflow.md 에도
  흐름도를 넣었다(dogfood 뒤 추가)
- 2026-09-14 사용자 결정: 병렬 관찰을 기본으로(§2-23). run 번호는 입력 폴더 앞 숫자, 짝짓기는 입력 경로
- 2026-09-14 사용자 결정: 관찰 횟수·모델 옵션(§2-22). 강의 시간 때문에 `--runs 1` 을 넣되 판정을 조건부로 묶고, 관찰 모델은
  Haiku 고정 대신 기본 sonnet 에 opus·haiku 선택으로. 모델 하나가 관찰과 재검증을 같이 정한다
- 2026-09-14 사용자 결정: 저장소 정리. `examples/` 삭제(dogfood 산출물은 저장소 밖, §10), 계획서를 `plans/archive/` 로,
  배포 체크리스트를 브리프 틀 7절로 흡수, 루트 README 추가
- 2026-09-14 사용자 결정: 경량화(§2-21). dogfood 산출물 크기를 재어 비용의 원인이 훅 기록·러너 재작성·스키마 되풀이·
  보고서 서술임을 확인하고 다섯 가지를 고쳤다. 단계·관찰 3회·서브에이전트·게이트는 유지
- 2026-09-14 재-dogfood 고정 가능 경로(rfq-quote-generator, 경량화·병렬 관찰 구성) 1~5단계 통과. 관찰 3회를 헤드리스로 동시에
  약 6분, 재검증 템플릿 러너 무수정·입력당 44–52초·LLM 2–3회. 입력 셋을 루트 분기별로 골라 질화·가스침탄 valid 분기를 처음 관찰했다.
  산출물은 `.demo-projects/rfq-quote-generator-app/`, 시행착오는 LLM-Wiki `raw/practice/2026-09-14_Agent-To-Webapp-Dogfood-RFQ-Rerun.md`
- 2026-09-14 사용자 결정: 다음 세션 프롬프트를 `prompt.md` 로 남기고 5단계 게이트가 확인한다(§2-24)
- 2026-09-15 사용자 결정: 3단계에 웹 앱 간소화 점검(§2-25). 새 단계가 아니라 승인 전 절차와 절 하나로. rfq workflow.md 에 게이트를
  대 보니 절 없음 실패 1·코드 단계 쌍 경고 2(4·5, 7·8). 같은 날 rfq 를 `rollback 3` 해 새 스킬로 3~5단계를 헤드리스로 다시 통과:
  12단계 → 8단계, 견적 검토를 끝으로 옮겨 브리프가 Supabase 에서 `DB 없음` 으로, 입력당 41–50초·단가 일치. 기록은 LLM-Wiki
  `raw/practice/2026-09-15_Agent-To-Webapp-Web-Simplify.md`
- 2026-09-22 사용자 결정: 4단계 게이트가 workflow.md 와 steps/ 의 번호·이름·실행 주체를 대조한다(§2-26). DDD 관점에서 저장소를
  훑은 결과 공용 언어·애그리거트·규칙의 코드화는 이미 있었고, 유일하게 값이 있는 빈틈이 이 명세↔코드 계약이었다. 전술 패턴은
  넣지 않기로 했다. rfq 산출물(`.demo-projects/rfq-quote-generator-app`)에 대 보니 8단계 모두 일치해 통과
- 2026-09-22 사용자 결정: 3층 구조와 논의점(§2-27). 처음 제안한 점검표 열 항목·논의 다섯을 "정말 도움이 되는가" 로 다시 걸러
  표 하나·규칙 둘·질문 둘로 줄였다. 층 이름은 화면(프리젠테이션)·처리(비즈니스)·데이터(저장·바깥) 병기
- 2026-09-22 재검토 뒤 사용자 결정: 4단계 게이트가 실행 증거 summary.json 을 읽고(§2-28), 브리프 2절에 maxDuration(§2-29). 같은 재검토에서
  오늘 패치의 결함 둘(DB 없음에서 불가능한 단계별 진행 표시, base64 로 커지는 파일 크기)을 고쳤다. 남긴 후보: "60초" 가정의 문구,
  steps/index.ts 순서, 조건부 판정의 `## 조건` 절 검사, 모노레포 안 git init
