# 5단계 전환

언제 읽나: phase-4 통과, phase-5 미통과.

## 1. port-brief.md 작성

`references/port-brief-template.md` 를 `$A2W/port-brief.md` 로 복사하고 일곱 절을 채운다. 헤딩은 고치지 않는다.

- 3. 상태 저장: workflow.md 에 실행 주체 "사람" 단계가 있거나, report.md 의 실행 시간 합이 함수 제한(기본 60초로
  본다)을 넘으면 `Supabase`. 둘 다 아니면 `DB 없음` 이라고 첫 줄에 쓴다
- 5. 외부 서비스로 뺄 단계: report.md 의 같은 절을 옮기고 각 항목의 임시 처리를 적는다. 없으면 `- 없음`
- 6. 인증: "범위 밖. 단일 사용자 데모" 를 그대로 쓴다
- 스타일(선택) 절은 학습자가 원할 때만 채운다

## 2. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 5
```

## 3. 대상 정리 안내

통과하면 학습자에게 아래를 안내한다. 스킬이 직접 지워도 된다(로컬 전용 파일이다).

- `$TARGET/CLAUDE.local.md`(또는 `AGENTS.override.md`)의 `<!-- agent-to-webapp:start -->` ~ `end` 블록 삭제
- `$TARGET/.claude/settings.local.json`(또는 `.codex/hooks.json`)의 훅 항목과 `additionalDirectories` 항목 삭제

## 4. 다음 세션

```
5단계 통과. 이제 $APP 에서 새 세션을 열고 아래를 붙여넣으세요.
(references/prompts.md 의 프롬프트 5 원문)
```

바이브 코딩은 이 스킬의 범위 밖이다. 배포 후에는 `references/deploy-checklist.md` 를 따른다.
