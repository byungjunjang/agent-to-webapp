# agent-to-webapp

로컬 에이전트(Claude Code·Codex)를 웹 앱으로 옮기기 전에 관찰 → 판정 → 고정 → 재검증 → 전환 다섯 단계를
게이트로 밟는 Claude Code 스킬이다. 모델이 순서를 정하던 에이전트를 코드가 순서를 정하는 워크플로우로
고정할 수 있는지 먼저 확인하고, 고정할 수 있을 때만 Next.js 웹 앱 전환 브리프를 만든다.

## 설치

Node 24 이상이 필요하다. 저장소를 받은 뒤:

    node .claude/skills/agent-to-webapp/scripts/install.mjs

`~/.claude/skills/agent-to-webapp/` 에 설치된다. 4단계 재검증에 쓸 Anthropic API 키는 그 폴더의
`.env.example` 을 `.env` 로 복사해 넣는다. 셸 환경변수로 두지 않는다. Claude Code 가 구독 대신 그 키로 과금한다.

## 사용

전환할 에이전트 폴더 옆에 `<이름>-app/` 폴더를 만들고 그 안에서 Claude Code 를 연 뒤:

    /agent-to-webapp ../<이름>

관찰 횟수와 모델은 옵션이다. `--runs 1` 이면 관찰 한 번으로 끝까지 가되 판정은 조건부까지만 나온다(강의용).
`--model opus` 처럼 관찰·재검증 모델을 바꿀 수 있고 기본은 sonnet 이다.

1단계가 끝나면 스킬이 멈춘다. 에이전트 폴더에서 새 세션을 관찰 횟수만큼 열어 입력을 하나씩 돌리고 돌아와 다시 부른다.
산출물은 전부 `<이름>-app/docs/agent-to-webapp/` 에 쌓인다. 5단계가 끝나면 같은 폴더에서 새 세션을 열어
브리프대로 웹 앱을 만든다.

## 문서

- 설계와 결정 사항: `docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md`
- 단계별 절차와 프롬프트: `.claude/skills/agent-to-webapp/references/phase-1.md` ~ `phase-5.md`
- 테스트: `node --test "tests/*.test.mjs"`
