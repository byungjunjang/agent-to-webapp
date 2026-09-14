# 3단계 고정

언제 읽나: phase-2 통과(판정 고정 가능 또는 조건부), phase-3 미통과.

## 1. workflow.md 작성

이 세션이 직접 프롬프트 3(`references/prompts.md`)을 수행해 `$A2W/workflow.md` 를 쓴다. 첫 절은 `## 흐름도`
(mermaid) 다. 조건부 판정이나 override 였으면 `## 조건` 을 흐름도 바로 다음에 둔다. 단계 간 데이터는 JSON 스키마
필수 — 4단계 스크립트가 이 스키마를 그대로 쓴다.

흐름도는 단계를 다 쓴 뒤에 그리는 편이 어긋나지 않는다. 게이트가 노드 `S<번호>` 와 `### 단계 N` 을 하나씩,
class(`code`/`llm`/`human`)와 실행 주체를 대조한다. 되돌아가는 화살표는 각 단계의 `실패 처리` 에서 옮긴다.
예시는 `examples/rfq-quote-generator-app/docs/agent-to-webapp/workflow.md`.

verdict.md 에서 "달랐던 단계" 로 분류된 것은 규칙으로 바꾸는 것을 먼저 시도한다. 안 되는 것은 `## 규칙화 불가`
에 적되 반드시 `→ LLM 단계 N` / `→ 사람 확인 지점 N` / `→ 재판정: 이유` 중 하나를 붙인다.

## 2. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 3
```

- 실패 "재판정 필요" → 순서 자체가 흔들리는 항목이 있다. `node $SKILL_DIR/scripts/check_phase.mjs rollback 2`
  로 되돌리고 2단계를 다시 한다. 이번에는 서브에이전트에게 그 항목을 명시해서 준다
- 실패 "흐름도" → 흐름도 노드·class 를 단계 헤딩·실행 주체에 맞춘다. 단계가 틀렸으면 단계를 고치고 그림도 고친다
- 그 외 실패 → 빠진 필드를 채운다
- 검사 통과 + "--approve" 안내 → 학습자에게 workflow.md 를 GitHub·Obsidian·VS Code(Mermaid 확장) 미리보기로 열어
  흐름도를 보라고 안내하고, 단계 목록(번호·이름·실행 주체)과 규칙화 불가 항목을 보여주고 동의를 묻는다. 동의하면
  `--approve`. `--batch` 면 `--batch`

## 3. 멈출 곳

3단계 통과 후 4단계는 API 호출과 비용이 든다. `--batch` 가 아니면 "4단계는 Anthropic API 키와 Node 24 가
필요하고 입력 3개 × 단계 수만큼 호출한다" 고 알리고 계속할지 묻는다.
