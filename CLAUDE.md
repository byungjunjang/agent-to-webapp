# agent-to-webapp

로컬 에이전트를 웹 앱으로 옮기는 고정 공정(관찰 → 판정 → 고정 → 재검증 → 전환)을
스킬 하나로 만든다.

- 시작 전에 `docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md` 를 읽는다.
  결정 사항은 그 문서 §2 가 정본이다. 착수 순서는 §13
- 스킬 정본은 `.claude/skills/agent-to-webapp/`. 완성 후 `~/.claude/skills/` 로 복사 설치한다
- 개념과 프롬프트 원문은 LLM-Wiki `wiki/vibe-coding/local-agent-to-web-app.md`. 실행판은
  스킬의 `references/prompts.md` 가 정본이다(§2-17). 실행판이 원문에서 벗어나면 이유를
  `raw/practice/` 로 보내 위키에 되먹인다
- 다음 단계는 `superpowers:writing-plans`
