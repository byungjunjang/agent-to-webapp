# 1단계 관찰

언제 읽나: STATUS 에 phase-1 통과 기록이 없을 때.

## 1. 입력 3종 제안

`$TARGET` 의 CLAUDE.md(AGENTS.md)와 skills 를 읽고 이 에이전트가 받는 입력이 무엇인지 파악한다.
아래 표를 채워 학습자에게 보인다. `--batch` 면 묻지 않고 그대로 쓴다.

| 종류 | 입력 | 왜 이것인가 |
|---|---|---|
| 쉬움 | 에이전트가 가장 자주 받는 전형적 입력 | 기준선 |
| 보통 | 필드가 하나쯤 다르거나 양이 많은 입력 | 순서가 유지되는지 |
| 예외 | 필수 정보가 빠졌거나 형식이 어긋난 입력 | 모델이 무엇을 알아서 처리하는지 드러낸다 |

세 입력은 대상의 서로 다른 분기를 지나가게 고른다. 같은 첨부 파일(도면 등)을 세 번 쓰면 판정 분기 상당수가 한 번도
실행되지 않아, 2단계가 "관찰되지 않은 분기" 를 조건으로 남긴다.

학습자가 승인하거나 바꾸면 `$A2W/runs/inputs/` 에 입력 파일을 두고(폴더 하나에 하나씩. 이름은
`1-easy-<slug>/`, `2-normal-<slug>/`, `3-edge-<slug>/`) 위 표를 `$A2W/runs/inputs/README.md` 에 쓴다.
대상 프로젝트 안에 이미 있는 샘플 입력은 복사한다. 없으면 만든다.

## 2. 대상에 로컬 전용 파일 설치

대상의 git 추적 파일은 건드리지 않는다. 아래만 만든다. 이미 있으면 마커 블록만 덧붙인다.

먼저 `$TARGET` 의 상위 폴더를 루트까지 올라가며 CLAUDE.md(Codex 면 AGENTS.md)를 찾는다. 사용자 전역
`~/.claude/CLAUDE.md` 는 빼고 센다. 있으면 관찰 세션에 함께 로드된다는 뜻이다. 경로 목록을 학습자에게 보여주고,
에이전트 행동을 바꿀 만한 내용(다른 프로젝트의 작업 규칙, "이 문서를 먼저 읽어라" 같은 지시)이면 대상 사본을 그
밖으로 옮겨 관찰하라고 권한다. `--batch` 면 목록만 출력하고 진행한다.

### runtime: claude-code

`$TARGET/CLAUDE.local.md` 에 프롬프트 1(`references/prompts.md`)을 마커째 덧붙인다. `<A2W>` 를 `$A2W` 절대 경로로 바꾼다.

`$TARGET/.claude/settings.local.json` 에 `assets/hooks.claude.example.json` 의 내용을 합친다. 이미 있는 키는
보존하고 `hooks.PostToolUse` 배열과 `permissions.additionalDirectories` 배열에 항목을 추가한다.
`<SKILL_DIR>` 과 `<APP>` 은 절대 경로(슬래시 `/`)로 바꾼다.

`CLAUDE.local.md` 가 대상의 `.gitignore` 에 없으면 학습자에게 "untracked 로 보이지만 커밋되지 않는다. 원하면
.gitignore 에 추가하라" 고 알린다. 스킬이 `.gitignore` 를 고치지는 않는다.

### runtime: codex

`$TARGET/AGENTS.override.md` 에 프롬프트 1 을 마커째 덧붙인다.

`$TARGET/.codex/hooks.json` 에 `assets/hooks.codex.example.json` 을 합친다. Codex 훅의 stdin 페이로드가
Claude Code 와 같은지는 확인되지 않았다. 훅 스크립트는 낯선 필드를 raw 로 남기므로 그대로 둔다.

`~/.codex/config.toml` 에 아래를 추가하라고 학습자에게 안내한다(프로젝트 `.codex/config.toml` 을 지원하는
버전이면 거기).

```toml
[sandbox_workspace_write]
writable_roots = ["<APP 절대 경로>"]
```

## 3. 여기서 멈춘다

학습자에게 아래를 그대로 보여주고 스킬을 끝낸다. 스킬 세션에서 에이전트를 돌리지 않는다 — 스킬 컨텍스트가
있으면 에이전트 행동이 바뀐다.

```
이제 대상 폴더에서 새 세션을 3개 열어 한 번에 입력 하나씩 돌리세요.
  1. $TARGET 에서 claude (또는 codex) 를 새로 연다
  2. ../<이름>-app/docs/agent-to-webapp/runs/inputs/1-easy-…/ 의 입력으로 평소처럼 일을 시킨다
  3. 끝나면 세션을 닫고 2, 3 번 입력으로 반복한다
  세 번이 끝나면 $APP 에서 /agent-to-webapp 를 다시 부르세요.
```

입력 경로는 대상 폴더 기준 상대 경로로 보여준다. 학습자는 대상 폴더에서 세션을 연다.

## 4. 돌아왔을 때: 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 1
```

통과하면 STATUS 에 phase-1 이 기록된다. 경고에 "훅 기록 N개, run 파일 M개" 가 나오면 세션 하나가 중간에
끊겼거나 run 파일 번호가 어긋난 것이다. 짝이 맞는지 `runs/run-N.tools.jsonl` 의 첫 줄 시각과 run-N.md 의 내용을
대조하고, 틀리면 파일 이름을 바꿔 맞춘다. 실패하면 부족한 것을 학습자에게 알리고 멈춘다.
