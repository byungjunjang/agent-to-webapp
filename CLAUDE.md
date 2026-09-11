# agent-to-webapp

로컬 에이전트를 웹 앱으로 옮기는 고정 공정(관찰 → 판정 → 고정 → 재검증 → 전환)을
스킬 하나로 만든다.

- 시작 전에 `docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md` 를 읽는다.
  결정 사항은 그 문서 §2 가 정본이다. 착수 순서는 §13
- 스킬 정본은 `.claude/skills/agent-to-webapp/`. 완성 후 `~/.claude/skills/` 로 복사 설치한다
- 지식의 정본은 LLM-Wiki `wiki/vibe-coding/local-agent-to-web-app.md`. 위키가 바뀌면
  스킬의 `references/` 를 따라 고친다
- 다음 단계는 `superpowers:writing-plans`
