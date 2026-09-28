---
name: agent-to-webapp
description: 로컬 에이전트(Claude Code·Codex)를 웹 앱으로 옮기기 전에 관찰→판정→고정→재검증→전환 다섯 단계를 게이트로 밟는다. Use when the user wants to turn a local Claude Code or Codex agent into a Next.js web app, says "웹 앱으로 만들자", "고정 가능한지 보자", "agent to webapp", or runs /agent-to-webapp with a target path and optional --batch. Run it from the sibling work folder named after the agent with an -app suffix, not inside the agent project.
---

# agent-to-webapp

로컬 에이전트는 모델이 순서를 정한다. 웹 앱은 코드가 정한다. 옮기기 전에 그 순서를 고정할 수 있는지
관찰하고 판정하고 고정하고 재검증한 뒤 전환한다. 게이트를 건너뛰지 않는다.

- 호출 인자: `$ARGUMENTS`. 첫 경로가 대상. `--runs N`(관찰 횟수, 기본 3), `--model <sonnet|opus|haiku|ID>`(관찰·재검증 모델,
  기본 sonnet), `--batch`
- 이 스킬 폴더(references 문서의 `$SKILL_DIR`): `${CLAUDE_SKILL_DIR}`
- 게이트: `node "${CLAUDE_SKILL_DIR}/scripts/check_phase.mjs" …`. 항상 작업 폴더에서 실행한다

## 이름

- `$APP`: 지금 열린 폴더. `<이름>-app/`. 나중에 웹 앱 repo 가 된다
- `$A2W`: `$APP/docs/agent-to-webapp`. 산출물은 전부 여기
- `$TARGET`: 전환할 에이전트 폴더. STATUS 의 `target`
- 스킬 폴더의 `.env`: 사용자별 API 키. 한 번 만들면 모든 프로젝트가 다시 쓴다. git 에 올리지 않는다
- 런타임: `claude-code` 또는 `codex`. STATUS 의 `runtime`
- `runs`·`model`: 관찰 횟수와 모델. STATUS 에 있다. 관찰과 4단계 재검증이 같은 모델을 쓴다

## 원칙

- `$TARGET` 의 git 추적 파일은 건드리지 않는다. 1단계의 로컬 전용 파일만 만든다
- `$A2W/STATUS.md` 는 게이트 스크립트만 쓴다. 통과 선언을 스킬이 하지 않는다
- 게이트를 통과하기 전에 다음 단계 산출물을 만들지 않는다. 컨텍스트가 압축돼도 STATUS 부터 읽는다
- 호출 인자에 `--batch` 가 있으면 질문하지 않고, 승인 게이트도 `--batch` 로 넘긴다
- 학습자에게는 한국어로 말한다. 학습자가 다른 언어로 쓰면 그 언어로 답한다
- API 키는 스킬이 읽거나 받아 적지 않는다. 있는지는 `check_phase.mjs key` 로만 본다

## 시작

1. `node "${CLAUDE_SKILL_DIR}/scripts/check_phase.mjs" status`. STATUS 가 있으면 "재개" 로
2. 없으면 대상을 정한다: 호출 인자의 첫 경로. 없으면 "전환할 에이전트 폴더가 어디인가" 를 묻는다
3. 런타임 판별: `CLAUDE.md` 또는 `.claude/skills/` → `claude-code`, `AGENTS.md` 또는 `.agents/skills/` → `codex`.
   둘 다 있으면 묻는다. 둘 다 없으면 로컬 에이전트가 아니라고 알리고 멈춘다
4. 도착지 확인 한 줄: "웹 앱이 도착지인가, 플러그인·cron·Slack 봇이 아닌가". 아니면 이 스킬의 대상이 아니라고 알리고 멈춘다
5. `git rev-parse --is-inside-work-tree` 가 실패할 때만 `$APP` 에서 `git init`
6. `node "${CLAUDE_SKILL_DIR}/scripts/check_phase.mjs" init --target <경로> --runtime <런타임> [--runs N] [--model M]` 뒤 1단계로.
   강의처럼 시간이 없으면 `--runs 1`. 판정은 조건부까지만 나온다

## 단계

| 단계 | 읽을 문서 | 산출물 | 게이트 | 멈출 곳 |
|---|---|---|---|---|
| 1 관찰 | references/phase-1.md | runs/inputs/, runs/run-N.md | `check_phase.mjs 1` | 설치 뒤 스킬 종료. 학습자가 세션 N개를 동시에 돌린다 |
| 2 판정 | references/phase-2.md | verdict.md (서브에이전트가 씀) | `check_phase.mjs 2 --approve` | 학습자 승인. 고정 불가면 종료 |
| 3 고정 | references/phase-3.md | workflow.md | `check_phase.mjs 3 --approve` | 학습자 승인. 재판정이면 `rollback 2` |
| 4 재검증 | references/phase-4.md | verify/, verify/report.md | `check_phase.mjs 4` | 차이 허용 여부는 학습자 |
| 5 전환 | references/phase-5.md | port-brief.md, prompt.md | `check_phase.mjs 5` | 논의점(조건 걸릴 때만, 최대 둘) 답 받기. 새 세션 안내 뒤 종료 |

각 단계는 그 단계의 `references/phase-N.md` 를 읽고 그대로 한다. 프롬프트는 그 문서 안에 있다.
2×2 표와 결정 축은 `references/decision-axes.md`, 브리프 틀은 `references/port-brief-template.md`,
배포 뒤 확인은 브리프 7절의 체크리스트다.

## 게이트 규칙

- 종료코드 0 통과, 1 실패, 2 사용법. 실패 메시지의 항목을 고친 뒤 다시 실행한다
- 관찰이 3회 미만(STATUS 의 `runs`)이면 2단계는 `고정 가능` 을 거부하고 조건부까지만 받는다. 뒤에 더 돌리고
  `rollback 2` 뒤 1단계 게이트를 다시 통과하면 `runs` 가 올라가고 판정을 다시 받을 수 있다
- 2·3단계는 `--approve` 없이는 기록되지 않는다. 학습자에게 산출물을 보여주고 동의를 받은 뒤 붙인다
- 2단계 판정이 `고정 불가` 면 게이트가 STATUS 에 종료를 기록하고 라우팅 안내를 출력한다. 그대로 전하고 멈춘다.
  3단계 이후 파일을 만들지 않는다
- 사람이 판정을 뒤집을 때만 `--override "<사유>"`. STATUS 의 `verdict:` 에 조건부 고정 가능으로 기록되고, 3단계는
  `## 조건` 을, 5단계는 7절의 조건 확인 항목을 요구한다
- `rollback N` 은 N단계 이후 기록을 지운다. 3단계 "재판정", 4단계 차이 불허 때 쓴다. 고정 불가 종료 뒤에는 2 이하만 받는다

## 재개

STATUS 에 `terminated` 가 있으면 종료된 과제라고 알리고 멈춘다. phase-K 까지 통과면 K+1 단계 문서를 읽고
시작한다. phase-1 미통과인데 `$A2W/runs/` 에 run 파일이 있으면 학습자가 돌리고 돌아온 것이니 바로 1단계
게이트를 실행한다.

## 끝

5단계 통과 후 `$TARGET` 의 로컬 전용 파일 정리를 안내하고, `$A2W/prompt.md` 경로와 그 안의 프롬프트 5 를 보여주고 끝낸다.
다음 세션이 붙여넣을 프롬프트는 터미널에만 두지 않고 항상 파일로 남긴다.
바이브 코딩은 다음 세션의 일이다.
