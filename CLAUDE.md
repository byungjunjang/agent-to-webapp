# agent-to-webapp

로컬 에이전트를 웹 앱으로 옮기는 고정 공정(관찰 → 판정 → 고정 → 재검증 → 전환)을
스킬 하나로 만든다.

- 시작 전에 `docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md` 를 읽는다. 결정 사항은
  그 문서 §2 가 정본이다. 구현 계획서는 `docs/superpowers/plans/archive/` 에 이력으로만 둔다. 읽지 않아도 된다
- 사람용 안내(설치·사용)는 루트 `README.md`. 이 파일은 Claude 를 위한 작업 규칙이다
- 스킬 정본은 `.claude/skills/agent-to-webapp/`. 유저 스코프(`~/.claude/skills/agent-to-webapp/`)에는
  아래 "스킬을 고친 뒤 다시 설치하기" 대로 설치한다
- 형제 스킬 `agent-to-webapp-lite` 는 에이전트 전체가 아니라 출력 한 벌(`--mode dashboard`)이나 스킬
  하나(`--mode skill`)만 옮긴다. 기획서는 `docs/superpowers/specs/2026-09-22-agent-to-webapp-lite-design.md`,
  정본은 `.claude/skills/agent-to-webapp-lite/`. API 키를 쓰지 않고 게이트가 산출물을 직접 파싱한다.
  정식 스킬에서 `md.mjs`·`decision-axes.md` 를 복사해 갖고, 어긋나면 `tests/lite_shared.test.mjs` 가 잡는다 —
  고칠 때는 정식 원본을 고치고 다시 복사한다
- 개념과 프롬프트 원문은 LLM-Wiki `wiki/vibe-coding/local-agent-to-web-app.md`. 실행판은
  스킬의 `references/phase-N.md` 안 "프롬프트 N" 절이 정본이다(§2-17). 실행판이 원문에서 벗어나면 이유를
  `raw/practice/` 로 보내 위키에 되먹인다
- 4단계 러너·라이브러리는 `assets/verify-template/` 이 정본이다. 재검증 중 러너를 고쳐야 했다면 그 수정은
  여기로 돌아와야 한다(§2-21). 헤딩·필드 같은 형식 문자열은 `scripts/lib/phaseN.mjs` 상수와 같아야 하고
  `tests/references.test.mjs` 가 확인한다
- 남은 일: 재-dogfood(2026-09-14) 되먹일 후보 반영, 고정 불가 경로 dogfood(크롤링할 URL 3개 필요),
  LLM-Wiki `/wiki-ingest`. 열린 항목은 기획서 §14
- lite 남은 일: dogfood 두 사례(채널 매출 대시보드, 인보이스 파서 스킬). 열린 항목은 lite 기획서 §12

## 스킬을 고친 뒤 다시 설치하기

1. 저장소 루트에서 테스트가 통과해야 한다: `node --test "tests/*.test.mjs"`
2. 커밋한 뒤 설치한다: `node .claude/skills/agent-to-webapp/scripts/install.mjs`
   - 인자 없이 부르면 `.claude/skills/` 아래 **두 스킬을 함께** 설치한다. 하나만 넣으려면 대상 폴더를 인자로 준다.
     대상 폴더 이름은 `agent-to-webapp` 이어야 하고, 원본의 조상·자손 폴더는 거부한다
   - 설치된 쪽 `.env`·`.env.*`(사용자 키)는 어느 깊이든 지우지도 덮지도 않는다. 저장소 쪽 것은 복사하지 않는다(`.env.example` 만 복사)
   - 저장소에 없는 옛 파일은 설치된 쪽에서 지운다
   - `rm -rf` 뒤 `cp -r` 로 설치하지 않는다. 키가 지워진다
3. 확인: 두 줄 다 아무것도 출력하지 않아야 한다
   - `diff -rq -x .env .claude/skills/agent-to-webapp ~/.claude/skills/agent-to-webapp`
   - `diff -rq .claude/skills/agent-to-webapp-lite ~/.claude/skills/agent-to-webapp-lite`
4. 키가 잡히는지는 작업 폴더에서 `node ~/.claude/skills/agent-to-webapp/scripts/check_phase.mjs key` 로
   본다. 키 값은 출력하지 않고 출처만 답한다

## API 키

- 사용자별 키는 `~/.claude/skills/agent-to-webapp/.env` 한 곳에 둔다. 없으면 같은 폴더의 `.env.example` 을
  복사해 채운다. 저장소 안 스킬 폴더에 만들면 유저 스코프 설치본이 찾지 못한다
- 셸 환경변수 `ANTHROPIC_API_KEY` 로 두지 않는다. Claude Code 가 구독 대신 그 키로 과금한다
- `.env` 는 git 에 올리지 않는다. 저장소와 스킬 폴더의 `.gitignore` 가 가리고 `tests/secrets.test.mjs` 가 확인한다
- `agent-to-webapp-lite` 는 키를 쓰지 않는다. 스킬 폴더에 `.env`·`.env.example` 이 없고, `scripts/` 가 `.env`·`ANTHROPIC_API_KEY` 를
  읽지 않으며, `key` 명령이 없다. `tests/lite_skill_md.test.mjs`·`tests/lite_cli.test.mjs` 가 확인한다

## dogfood 할 때

- 저장소 밖에서 돌린다. 저장소 안에서 돌리면 이 저장소 CLAUDE.md 가 관찰 세션에 섞인다. 대상은 `.demo-projects` 의
  사본을 쓴다. 산출물은 저장소에 두지 않는다(`examples/` 는 2026-09-14 에 지웠다). 시행착오와 결과 요약만 LLM-Wiki
  `raw/practice/` 로 보낸다
- Windows Git Bash 에서 `claude -p "/agent-to-webapp …"` 로 부를 때는 `MSYS_NO_PATHCONV=1` 을 붙인다.
  안 붙이면 첫 인자가 `C:/Program Files/Git/…` 로 바뀐다
