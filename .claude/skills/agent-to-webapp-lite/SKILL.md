---
name: agent-to-webapp-lite
description: 에이전트 전체가 아니라 출력 데이터 한 벌이나 스킬 하나만 웹으로 옮긴다. 관찰→판정→고정→재검증→전환 다섯 단계를 게이트로 밟는다. Use when the user says "출력을 대시보드로", "이 스킬만 서버로", "데이터 계약 만들자", "agent to webapp lite", or runs /agent-to-webapp-lite with a target path and --mode dashboard|skill. Run it from the sibling work folder named after the agent with an -app suffix, not inside the agent project.
---

# agent-to-webapp-lite

에이전트를 통째로 옮기지 않는다. 옮기는 것은 둘 중 하나다.

- `--mode dashboard`: 에이전트는 로컬에 남고 웹은 에이전트가 남긴 출력을 읽기만 한다. 고정하는 것은 **출력 데이터**
- `--mode skill`: 파일을 올리면 서버가 파싱·판정한다. 고정하는 것은 **스킬 하나**

에이전트 전체를 옮기려면 `agent-to-webapp` 을 쓴다. 웹이 에이전트 출력을 읽기만 하면 dashboard, 웹이
판정을 해야 하면 skill 이다.

- 호출 인자: `$ARGUMENTS`. 첫 경로가 대상. `--mode dashboard|skill`(필수), `--output <경로>`(dashboard),
  `--skill <이름>`·`--samples N`(skill, 기본 5), `--batch`
- 이 스킬 폴더(references 문서의 `$SKILL_DIR`): `${CLAUDE_SKILL_DIR}`
- 게이트: `node "${CLAUDE_SKILL_DIR}/scripts/check_lite.mjs" …`. 항상 작업 폴더에서 실행한다
- API 키를 쓰지 않는다. 관찰과 재검증은 학습자가 자기 세션에서 돌리고 이 스킬은 산출물만 읽는다

## 이름

- `$APP`: 지금 열린 폴더 `<이름>-app/`. 나중에 웹 앱 repo 가 된다
- `$LITE`: `$APP/docs/agent-to-webapp-lite`. 산출물은 전부 여기
- `$TARGET`: 대상 에이전트 폴더. STATUS 의 `target`
- `$OUTPUT`(dashboard): 에이전트가 남기는 출력 산출물. 구글 시트가 원장이면 CSV 로 내보낸 파일
- `$SKILL`·`$SAMPLES`(skill): 옮길 스킬 이름과 샘플 수

## 원칙

- `$TARGET` 의 파일을 건드리지 않는다. 훅도 설치하지 않는다
- `$LITE/STATUS.md` 는 게이트 스크립트만 쓴다. 통과 선언을 스킬이 하지 않는다
- 게이트를 통과하기 전에 다음 단계 산출물을 만들지 않는다. 컨텍스트가 압축돼도 STATUS 부터 읽는다
- `--batch` 면 질문하지 않고 승인 게이트도 `--batch` 로 넘긴다
- 학습자에게는 한국어로 말한다. 학습자가 다른 언어로 쓰면 그 언어로 답한다
- 민감한 열(계좌·급여·상담 원문·개인 이름)은 계약의 제외 열로 빼고 화면에 싣지 않는다

## 시작

1. `node "${CLAUDE_SKILL_DIR}/scripts/check_lite.mjs" status`. STATUS 가 있으면 "재개" 로
2. 없으면 대상과 모드를 정한다. 호출 인자에 없으면 묻는다
3. dashboard 면 출력 산출물 경로를, skill 이면 옮길 스킬 이름을 확인한다. 구글 시트는 CSV 로 내보낸
   파일 경로를 받는다
4. `git rev-parse --is-inside-work-tree` 가 실패할 때만 `$APP` 에서 `git init`
5. init 뒤 1단계로:

```
node "${CLAUDE_SKILL_DIR}/scripts/check_lite.mjs" init --target <경로> --mode dashboard --output <출력 경로>
node "${CLAUDE_SKILL_DIR}/scripts/check_lite.mjs" init --target <경로> --mode skill --skill <이름> [--samples N]
```

## 단계

| 단계 | 읽을 문서 | dashboard 산출물 | skill 산출물 | 게이트 |
|---|---|---|---|---|
| 1 관찰 | references/dashboard/phase-1.md · references/skill/phase-1.md | runs/run-1.schema.md | runs/sample-k/, runs/run-1.md | `check_lite.mjs 1` |
| 2 판정 | references/dashboard/phase-2.md · references/skill/phase-2.md | verdict.md | verdict.md | `check_lite.mjs 2 --approve` |
| 3 고정 | references/dashboard/phase-3.md · references/skill/phase-3.md | contract.md | skill-spec.md | `check_lite.mjs 3 --approve` |
| 4 재검증 | references/dashboard/phase-4.md · references/skill/phase-4.md | runs/run-2.schema.md, verify/report.md | verify/sample-k.json, verify/report.md | `check_lite.mjs 4` |
| 5 전환 | references/dashboard/phase-5.md · references/skill/phase-5.md | brief.md, prompt.md | brief.md, prompt.md | `check_lite.mjs 5` |

STATUS 의 `mode` 에 해당하는 문서만 읽는다. 각 단계는 그 문서대로 하고, 프롬프트는 문서 안에 있다.
결정 축은 references/decision-axes.md, 브리프 틀은 references/brief-template-dashboard.md 와
references/brief-template-skill.md 다.

1단계와 4단계는 학습자가 자기 세션에서 에이전트를 돌리는 단계다. 안내한 뒤 스킬은 멈추고, 돌아오면
게이트부터 실행한다.

## 게이트 규칙

- 종료코드 0 통과, 1 실패, 2 사용법. 실패 메시지의 항목을 고친 뒤 다시 실행한다
- 2·3단계는 `--approve` 없이는 기록되지 않는다. 산출물을 보여주고 동의를 받은 뒤 붙인다
- dashboard 2단계는 관찰 1회 위에서 `고정 가능` 을 거부한다. `조건부 고정 가능(관찰 1회)` 로 적고 4단계가 확정한다
- skill 2단계는 샘플 출력의 키가 서로 다르면 `코드로 고정` 을 거부한다
- 4단계는 게이트가 산출물을 직접 대조한다. 보고서에 없는 변경을 지어내거나 있는 변경을 빠뜨리면 실패한다
- 2단계 판정이 `고정 불가` 면 게이트가 종료를 기록하고 라우팅을 출력한다. 그대로 전하고 멈춘다
- 사람이 판정을 뒤집을 때만 `--override "<사유>"`
- `rollback N` 은 N단계 이후 기록을 지운다. 4단계가 깨졌을 때 `rollback 3` 을 쓴다

## 재개

STATUS 에 `terminated` 가 있으면 종료된 과제라고 알리고 멈춘다. phase-K 까지 통과면 K+1 단계 문서를
읽고 시작한다.

## 끝

5단계 통과 후 `$LITE/prompt.md` 경로와 그 안의 코드 블록을 보여주고 끝낸다. 바이브 코딩은 다음 세션의 일이다.
