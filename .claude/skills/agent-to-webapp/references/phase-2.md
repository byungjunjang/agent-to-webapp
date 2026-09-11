# 2단계 판정

언제 읽나: phase-1 통과, phase-2 미통과.

## 1. 서브에이전트에게 판정을 맡긴다

같은 세션이 자기 실행을 판정하면 관대해진다. Agent 도구(general-purpose)로 새 컨텍스트를 열고 프롬프트 2
(`references/prompts.md`)를 준다. `<A2W>` 와 `<TARGET>` 을 절대 경로로 바꾼다. 서브에이전트가 파일을 직접
읽고 `$A2W/verdict.md` 를 쓴다. 이 세션은 결과를 요약만 한다.

`references/decision-axes.md` 의 경로를 함께 주어 2×2 표의 뜻을 참조하게 한다.

## 2. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 2
```

- 실패 "판정 줄" → verdict.md 마지막 줄을 `판정: …` 형식으로 고치라고 서브에이전트에 다시 시킨다
- 실패 "4번째 칸 항목이 있는데 고정 가능" → 서브에이전트에 조건부 또는 불가로 재판정시킨다. 사람이 판정을
  뒤집고 싶으면 아래 override
- 검사 통과 + "--approve 로 다시 실행" → 학습자에게 verdict.md 의 배정표와 판정 줄을 보여주고 동의를 묻는다.
  동의하면 `node $SKILL_DIR/scripts/check_phase.mjs 2 --approve`. `--batch` 면 묻지 않고 `--batch` 로 실행

## 3. 판정별 갈림

- 고정 가능 / 조건부 → 3단계로
- 고정 불가 → 게이트가 STATUS 에 종료를 적고 라우팅 안내를 출력한다. 그 안내를 학습자에게 그대로 전하고
  멈춘다. 3단계 이후 파일을 만들지 않는다

## 4. 사람이 판정을 뒤집을 때

학습자가 사유를 대면 `node $SKILL_DIR/scripts/check_phase.mjs 2 --approve --override "<사유>"`. 판정은
조건부 고정 가능으로 기록되고 사유가 STATUS log 에 남는다. 3단계 workflow.md 의 `## 조건` 에 그 사유를 적는다.
