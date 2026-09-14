# 5단계 전환

언제 읽나: phase-4 통과, phase-5 미통과.

## 1. port-brief.md 작성

`references/port-brief-template.md` 를 `$A2W/port-brief.md` 로 복사하고 일곱 절을 채운다. 헤딩은 고치지 않는다.

- 2. 실행 시간 분할: `verify/out/<입력>/summary.json` 의 `timings` 에서 단계별 시간을 옮긴다
- 3. 상태 저장: workflow.md 에 실행 주체 "사람" 단계가 있거나, summary.json 의 `total_ms` 가 함수 제한(기본 60초로
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

학습자에게 아래를 그대로 보여주고 끝낸다.

```
5단계 통과. 이제 $APP 에서 새 세션을 열고 아래를 붙여넣으세요.
```

### 프롬프트 5 — 웹 앱 전환

작업 폴더의 다음 세션에서 사람이 붙여넣는다. 위키에 원문이 없다. 스타일 지정은 여기 두지 않고 브리프의 선택 절에 넣는다.

```
docs/agent-to-webapp/port-brief.md 와 docs/agent-to-webapp/workflow.md 를 읽고 이 워크플로우를 Next.js 웹 앱으로 만들어줘.
- 이 폴더에서 create-next-app 을 먼저 돌릴 것. docs/ 와 .git 은 그대로 둔다
- docs/agent-to-webapp/verify/steps/ 와 verify/lib/ 를 src/lib/workflow/ 로 복사해서 그대로 쓸 것. 로직을 다시 짜지 말 것.
  단계를 순서대로 부르고 Goto·Skip·NeedsAttention 을 처리하는 부분은 verify/run.ts 의 runPipeline 과 같게 서버 쪽에 옮긴다
- Claude 를 부르는 코드와 API 키는 서버 쪽(Route Handler 또는 Server Action)에만 둘 것
- 상태 저장은 브리프의 "3. 상태 저장" 이 정한 대로. Supabase 면 단계별 상태를 저장하고 오래 걸리는 단계는 나눌 것
- workflow.md 의 사람 단계는 UI 승인 단계로 만들고 승인 상태를 남길 것
- 인증은 만들지 말 것. 단일 사용자 데모다
- 화면은 입력 → 진행 상태 → 결과 셋이면 충분
```

바이브 코딩은 이 스킬의 범위 밖이다. 배포 후 확인은 브리프 7절의 체크리스트를 따른다.
