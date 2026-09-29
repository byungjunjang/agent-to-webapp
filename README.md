# agent-to-webapp

로컬 에이전트(Claude Code·Codex)를 웹 앱으로 옮기기 전에 **관찰 → 판정 → 고정 → 재검증 → 전환** 다섯 단계를
게이트로 밟는 Claude Code 스킬이다. 모델이 순서를 정하던 에이전트를 코드가 순서를 정하는 워크플로우로
고정할 수 있는지 먼저 확인하고, 고정할 수 있을 때만 웹 앱 전환 브리프를 만든다. 스택은 Next.js + Tailwind CSS + shadcn/ui 로 고정이다.

스킬은 두 개다.

| 스킬 | 옮기는 것 | API 키 |
|---|---|---|
| `agent-to-webapp` | 에이전트 전체 | 4단계 재검증에 필요 |
| `agent-to-webapp-lite` | 출력 한 벌(대시보드) 또는 스킬 하나 | 필요 없음 |

## 준비물

- [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)
- Node.js 24 이상 (`node -v` 로 확인)
- git
- Anthropic API 키 — `agent-to-webapp` 4단계에서만 쓴다. [콘솔](https://console.anthropic.com/)에서 발급하며 사용량만큼 과금된다

## 설치

    git clone https://github.com/byungjunjang/agent-to-webapp.git
    cd agent-to-webapp
    node .claude/skills/agent-to-webapp/scripts/install.mjs

`~/.claude/skills/` 아래에 두 스킬이 함께 설치된다. Claude Code 를 새로 열면 `/agent-to-webapp`,
`/agent-to-webapp-lite` 가 보인다.

### API 키 넣기 (`agent-to-webapp` 만)

설치된 스킬 폴더의 `.env.example` 을 `.env` 로 복사하고 `ANTHROPIC_API_KEY=` 뒤에 키를 붙인다.

    # macOS·Linux·Git Bash
    cp ~/.claude/skills/agent-to-webapp/.env.example ~/.claude/skills/agent-to-webapp/.env

    # Windows PowerShell
    Copy-Item "$HOME\.claude\skills\agent-to-webapp\.env.example" "$HOME\.claude\skills\agent-to-webapp\.env"

키가 잡혔는지는 아무 폴더에서나 확인한다. 키 값은 출력하지 않고 어디서 읽었는지만 알려 준다.

    node ~/.claude/skills/agent-to-webapp/scripts/check_phase.mjs key

주의할 점 두 가지.

- 키를 **셸 환경변수 `ANTHROPIC_API_KEY` 로 두지 않는다.** 그러면 Claude Code 가 구독 대신 그 키로 과금한다
- `.env` 는 이 저장소 안이 아니라 **설치된 폴더**(`~/.claude/skills/agent-to-webapp/`)에 둔다. 다시 설치해도 지워지지 않는다

## 사용

전환할 에이전트 폴더 **옆에** `<이름>-app/` 폴더를 만들고, 그 안에서 Claude Code 를 연다.

    workspace/
    ├── my-agent/         ← 전환할 에이전트
    └── my-agent-app/     ← 여기서 claude 를 연다

    /agent-to-webapp ../my-agent

관찰 횟수와 모델은 옵션이다. `--runs 1` 이면 관찰 한 번으로 끝까지 가되 판정은 조건부까지만 나온다(강의용).
`--model opus` 처럼 관찰·재검증 모델을 바꿀 수 있고 기본은 sonnet 이다. `--batch` 를 붙이면 질문 없이 진행한다.

1단계가 끝나면 스킬이 멈춘다. 에이전트 폴더에서 세션을 관찰 횟수만큼 동시에 열어 입력을 하나씩 돌리고 돌아와 다시 부른다.
산출물은 전부 `<이름>-app/docs/agent-to-webapp/` 에 쌓인다. 5단계가 끝나면 같은 폴더에서 새 세션을 열어
`docs/agent-to-webapp/prompt.md` 의 프롬프트를 붙여넣고 브리프대로 웹 앱을 만든다.

### 출력만·스킬 하나만 옮길 때

에이전트를 통째로 옮기지 않고 에이전트가 남긴 출력을 웹에서 보기만 하거나, 스킬 하나만 서버로 옮길 때는
형제 스킬을 쓴다. 같은 다섯 단계를 밟지만 고정하는 대상이 순서가 아니라 데이터와 스킬이다.

    /agent-to-webapp-lite ../my-agent --mode dashboard --output ../my-agent/out/data.csv
    /agent-to-webapp-lite ../my-agent --mode skill --skill <스킬 이름> --samples 5

dashboard 는 출력 스키마를 관찰해 데이터 계약을 만들고 대시보드 브리프로 끝난다. skill 은 샘플 N건을
관찰해 입출력 스키마와 프롬프트를 고정하고 확인·수정 화면이 있는 앱 브리프로 끝난다. 산출물은
`<이름>-app/docs/agent-to-webapp-lite/` 에 쌓인다.

## 업데이트·삭제

업데이트는 받아서 다시 설치하면 된다. 설치된 쪽 `.env` 는 그대로 남는다.

    cd agent-to-webapp
    git pull
    node .claude/skills/agent-to-webapp/scripts/install.mjs

삭제는 `~/.claude/skills/agent-to-webapp/` 과 `~/.claude/skills/agent-to-webapp-lite/` 두 폴더를 지운다.
`.env` 의 키도 함께 지워진다.

## 자주 막히는 곳

- **`/agent-to-webapp` 이 안 보인다** — 설치 뒤 Claude Code 를 새로 열어야 한다
- **에이전트 폴더 안에서 불렀다** — 스킬은 옆에 둔 `<이름>-app/` 폴더에서 부른다. 에이전트 폴더의 git 추적 파일은 건드리지 않는다
- **4단계에서 키를 못 찾는다** — 위의 `check_phase.mjs key` 로 확인한다. `.env` 가 저장소 안 스킬 폴더에 있으면 설치본이 못 찾는다
- **Windows Git Bash 에서 `claude -p "/agent-to-webapp …"` 가 경로를 망가뜨린다** — 앞에 `MSYS_NO_PATHCONV=1` 을 붙인다.
  안 붙이면 `/agent-to-webapp` 이 `C:/Program Files/Git/agent-to-webapp` 으로 바뀐다

## 저장소 구조

    .claude/skills/agent-to-webapp/        정식 스킬 (SKILL.md, references/phase-1~5.md, scripts/, assets/)
    .claude/skills/agent-to-webapp-lite/   lite 스킬
    docs/superpowers/specs/                설계 문서와 결정 사항
    tests/                                 게이트·설치 스크립트 테스트

- 설계와 결정 사항: `docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md`
  (lite: `docs/superpowers/specs/2026-09-22-agent-to-webapp-lite-design.md`)
- 단계별 절차와 프롬프트: `.claude/skills/agent-to-webapp/references/phase-1.md` ~ `phase-5.md`
- 설계 문서에 나오는 로컬 경로(`C:\Users\…`, LLM-Wiki 등)는 작성자 PC 기준 기록이다. 따라 할 필요는 없다

스킬을 고쳤다면 테스트를 돌린 뒤 다시 설치한다.

    node --test "tests/*.test.mjs"
